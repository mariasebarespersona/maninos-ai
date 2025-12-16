"""
RAG (Retrieval Augmented Generation) system for MANINOS AI
Adapted from tools/rag_index.py to work with new maninos_documents schema
"""
from __future__ import annotations
import io, re, requests, logging
from typing import List, Dict, Any

from .supabase_client import sb, BUCKET
from .rag_tool import _extract_text  # Reuse robust text extraction

logger = logging.getLogger(__name__)


def _normalize_text(s: str) -> str:
    """Normalize text for chunking"""
    s = (s or "").replace("\r", " ").replace("\n", "\n")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def _split_into_chunks(text: str, max_chars: int = 2500, overlap: int = 200) -> List[str]:
    """Split text into overlapping chunks"""
    text = text or ""
    if len(text) <= max_chars:
        return [text]
    chunks: List[str] = []
    start = 0
    while start < len(text):
        end = min(len(text), start + max_chars)
        chunk = text[start:end]
        chunks.append(chunk)
        if end == len(text):
            break
        start = max(0, end - overlap)
    return chunks


def index_document_maninos(property_id: str, document_id: str) -> Dict[str, Any]:
    """
    Index a MANINOS document: extract text, chunk it, create embeddings, store in rag_chunks.
    
    Args:
        property_id: UUID of the property
        document_id: UUID of the document in maninos_documents table
    
    Returns:
        {"indexed": int, "chunks": int, "document_name": str, "error": str?}
    """
    try:
        # 1. Get document metadata from maninos_documents
        doc_result = sb.table("maninos_documents")\
            .select("*")\
            .eq("id", document_id)\
            .single()\
            .execute()
        
        if not doc_result.data:
            return {"indexed": 0, "error": f"Document {document_id} not found"}
        
        doc = doc_result.data
        document_name = doc["document_name"]
        document_type = doc["document_type"]
        storage_path = doc.get("storage_path")
        
        if not storage_path:
            return {"indexed": 0, "error": f"Document {document_name} has no storage_path"}
        
        logger.info(f"[index_document_maninos] Indexing {document_name} (type: {document_type})")
        
        # 2. Download document from Storage
        try:
            file_bytes = sb.storage.from_(BUCKET).download(storage_path)
        except Exception as e:
            return {"indexed": 0, "error": f"Failed to download {document_name}: {str(e)}"}
        
        # 3. Extract text
        content_type = doc.get("content_type", "")
        raw_text = _extract_text(file_bytes, content_type, storage_path)
        text = _normalize_text(raw_text)
        
        if not text or len(text) < 10:
            return {"indexed": 0, "error": f"No text extracted from {document_name}"}
        
        logger.info(f"[index_document_maninos] Extracted {len(text)} chars from {document_name}")
        
        # 4. Split into chunks
        chunks = _split_into_chunks(text)
        logger.info(f"[index_document_maninos] Created {len(chunks)} chunks for {document_name}")
        
        # 5. Create embeddings
        try:
            from langchain_openai import OpenAIEmbeddings
            embed_model = OpenAIEmbeddings(model="text-embedding-3-small")
            vectors = embed_model.embed_documents(chunks)
            logger.info(f"[index_document_maninos] Created {len(vectors)} embeddings")
        except Exception as emb_err:
            logger.warning(f"[index_document_maninos] Embedding failed: {emb_err}")
            vectors = [None] * len(chunks)
        
        # 6. Prepare rows for rag_chunks
        rows = []
        for i, ch in enumerate(chunks):
            rows.append({
                "property_id": property_id,
                "document_type": document_type,
                "document_name": document_name,
                "chunk_index": i,
                "text": ch,
                "embedding": vectors[i],  # May be None if embedding failed
            })
        
        if not rows:
            return {"indexed": 0, "error": "No chunks created"}
        
        # 7. Upsert into rag_chunks (replace existing chunks for this document)
        try:
            # Delete existing chunks for this document first (to avoid duplicates)
            sb.table("rag_chunks")\
                .delete()\
                .eq("property_id", property_id)\
                .eq("document_type", document_type)\
                .eq("document_name", document_name)\
                .execute()
            
            # Insert new chunks
            sb.table("rag_chunks").insert(rows).execute()
            
            logger.info(f"✅ [index_document_maninos] Indexed {len(rows)} chunks for {document_name}")
            
            return {
                "indexed": len(rows),
                "chunks": len(rows),
                "document_name": document_name,
                "document_type": document_type
            }
        
        except Exception as e:
            logger.error(f"❌ [index_document_maninos] DB error: {e}")
            # Try without embeddings if column doesn't exist
            if "embedding" in str(e).lower():
                for r in rows:
                    r.pop("embedding", None)
                try:
                    sb.table("rag_chunks").insert(rows).execute()
                    return {
                        "indexed": len(rows),
                        "chunks": len(rows),
                        "document_name": document_name,
                        "warning": "Stored without embeddings (pgvector not enabled)"
                    }
                except Exception as e2:
                    return {"indexed": 0, "error": str(e2)}
            return {"indexed": 0, "error": str(e)}
    
    except Exception as e:
        logger.error(f"❌ [index_document_maninos] Unexpected error: {e}", exc_info=True)
        return {"indexed": 0, "error": str(e)}


def search_chunks_maninos(
    property_id: str, 
    query: str, 
    limit: int = 30,
    document_type: str | None = None
) -> List[Dict[str, Any]]:
    """
    Search for relevant chunks using hybrid search (semantic + lexical).
    
    Args:
        property_id: UUID of the property
        query: User's question
        limit: Max number of chunks to return
        document_type: Optional filter by document type
    
    Returns:
        List of {property_id, document_type, document_name, chunk_index, text, score}
        sorted by relevance
    """
    MAX_CHUNK_LENGTH = 800
    
    try:
        # 1. Query rag_chunks
        q = sb.table("rag_chunks")\
            .select("property_id,document_type,document_name,chunk_index,text,embedding")\
            .eq("property_id", property_id)
        
        if document_type:
            q = q.eq("document_type", document_type)
        
        rows = q.execute().data
    except Exception:
        # Fallback without embedding column
        try:
            q = sb.table("rag_chunks")\
                .select("property_id,document_type,document_name,chunk_index,text")\
                .eq("property_id", property_id)
            
            if document_type:
                q = q.eq("document_type", document_type)
            
            rows = q.execute().data
        except Exception as e:
            logger.error(f"[search_chunks_maninos] DB error: {e}")
            return []
    
    if not rows:
        logger.info(f"[search_chunks_maninos] No chunks found for property {property_id}")
        return []
    
    logger.info(f"[search_chunks_maninos] Found {len(rows)} total chunks")
    
    # 2. Tokenize query for lexical search
    query_tokens = [t for t in re.sub(r"[^a-z0-9áéíóúüñ\s]", " ", query.lower()).split() if len(t) > 1]
    
    # 3. Create query embedding for semantic search
    try:
        from langchain_openai import OpenAIEmbeddings
        qvec = OpenAIEmbeddings(model="text-embedding-3-small").embed_query(query)
    except Exception as e:
        logger.warning(f"[search_chunks_maninos] Query embedding failed: {e}")
        qvec = None
    
    # 4. Score each chunk
    def cosine(a: List[float], b: List[float]) -> float:
        if not a or not b:
            return 0.0
        s = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        return s / (na * nb) if na and nb else 0.0
    
    def lexical_score(text: str, tokens: List[str]) -> float:
        t = text.lower()
        return sum(1.0 for tok in tokens if tok in t)
    
    scored: List[Dict[str, Any]] = []
    for r in rows:
        # Lexical score
        lex = lexical_score(r.get("text", ""), query_tokens)
        lex_normalized = lex / (len(query_tokens) or 1)
        
        # Semantic score
        emb = r.get("embedding")
        if emb and isinstance(emb, str):
            try:
                import json
                emb = json.loads(emb)
            except Exception:
                emb = None
        
        vec = cosine(qvec, emb) if qvec and emb and isinstance(emb, list) else 0.0
        
        # Hybrid score: 70% semantic, 30% lexical
        score = 0.7 * vec + 0.3 * lex_normalized
        
        if score > 0:
            rr = dict(r)
            rr["score"] = score
            # Truncate long chunks
            if len(rr.get("text", "")) > MAX_CHUNK_LENGTH:
                rr["text"] = rr["text"][:MAX_CHUNK_LENGTH] + "...[truncated]"
            scored.append(rr)
    
    scored.sort(key=lambda x: x["score"], reverse=True)
    logger.info(f"[search_chunks_maninos] Returning top {min(limit, len(scored))} chunks")
    return scored[:limit]


def query_documents_maninos(
    property_id: str, 
    question: str, 
    top_k: int = 5,
    document_type: str | None = None
) -> Dict[str, Any]:
    """
    Answer a question using RAG over indexed documents.
    
    Args:
        property_id: UUID of the property
        question: User's question
        top_k: Number of chunks to use as context
        document_type: Optional filter (e.g., 'title_status')
    
    Returns:
        {
            "answer": str,
            "citations": [{"document_type", "document_name", "chunk_index"}],
            "context_used": bool
        }
    """
    logger.info(f"[query_documents_maninos] Question: {question}")
    
    # 1. Search for relevant chunks
    hits = search_chunks_maninos(property_id, question, limit=60, document_type=document_type)
    
    if not hits:
        return {
            "answer": "No he encontrado información relevante en los documentos subidos para esta propiedad.",
            "citations": [],
            "context_used": False
        }
    
    # 2. Build context from top K chunks
    ctx_hits = hits[:top_k]
    context_parts = []
    for i, h in enumerate(ctx_hits, 1):
        header = f"[#{i}] {h['document_name']} (parte {h.get('chunk_index', 0)+1})"
        text = h['text']
        context_parts.append(f"{header}:\n{text}")
    
    context = "\n\n".join(context_parts)
    
    logger.info(f"[query_documents_maninos] Using {len(ctx_hits)} chunks as context")
    
    # 3. Generate answer with LLM
    prompt = (
        "Eres un asistente experto en análisis de documentos inmobiliarios. "
        "Responde en español de forma clara, completa y profesional.\n\n"
        "INSTRUCCIONES:\n"
        "- Lee cuidadosamente todos los fragmentos del contexto proporcionado\n"
        "- Responde SOLO usando la información del contexto\n"
        "- Si encuentras información relevante, responde de forma completa y natural\n"
        "- Incluye detalles específicos como fechas, cantidades, condiciones, etc.\n"
        "- Si la información no aparece en los documentos, di explícitamente 'No aparece en los documentos subidos'\n"
        "- No inventes información que no esté en el contexto\n\n"
        f"PREGUNTA DEL USUARIO: {question}\n\n"
        f"CONTEXTO DE LOS DOCUMENTOS:\n{context}\n\n"
        "TU RESPUESTA:"
    )
    
    try:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        answer = llm.invoke(prompt).content
    except Exception as e:
        logger.error(f"[query_documents_maninos] LLM error: {e}")
        return {
            "answer": f"Error al generar respuesta: {str(e)}",
            "citations": [],
            "context_used": True,
            "error": str(e)
        }
    
    # 4. Build citations
    citations = [
        {
            "document_type": h["document_type"],
            "document_name": h["document_name"],
            "chunk_index": h["chunk_index"],
        }
        for h in ctx_hits
    ]
    
    logger.info(f"✅ [query_documents_maninos] Answer generated with {len(citations)} citations")
    
    return {
        "answer": answer,
        "citations": citations,
        "context_used": True
    }


def index_all_documents_maninos(property_id: str) -> Dict[str, Any]:
    """
    Index all documents for a property.
    
    Returns:
        {"total_chunks": int, "documents_indexed": int, "details": [...]}
    """
    logger.info(f"[index_all_documents_maninos] Indexing all docs for property {property_id}")
    
    try:
        # Get all documents for this property
        result = sb.table("maninos_documents")\
            .select("*")\
            .eq("property_id", property_id)\
            .execute()
        
        documents = result.data or []
    except Exception as e:
        logger.error(f"[index_all_documents_maninos] Failed to fetch documents: {e}")
        return {"total_chunks": 0, "documents_indexed": 0, "error": str(e), "details": []}
    
    if not documents:
        logger.info(f"[index_all_documents_maninos] No documents found for property {property_id}")
        return {"total_chunks": 0, "documents_indexed": 0, "details": []}
    
    total_chunks = 0
    documents_indexed = 0
    details = []
    
    for doc in documents:
        doc_id = doc["id"]
        doc_name = doc["document_name"]
        
        logger.info(f"[index_all_documents_maninos] Indexing document: {doc_name}")
        
        result = index_document_maninos(property_id, doc_id)
        
        if result.get("indexed", 0) > 0:
            total_chunks += result["indexed"]
            documents_indexed += 1
        
        details.append({
            "document_name": doc_name,
            "document_type": doc["document_type"],
            "chunks": result.get("chunks", 0),
            "indexed": result.get("indexed", 0) > 0,
            "error": result.get("error"),
            "warning": result.get("warning")
        })
    
    logger.info(f"✅ [index_all_documents_maninos] Indexed {documents_indexed}/{len(documents)} documents, {total_chunks} total chunks")
    
    return {
        "total_chunks": total_chunks,
        "documents_indexed": documents_indexed,
        "total_documents": len(documents),
        "details": details
    }

