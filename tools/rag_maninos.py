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
    """Normalize text for chunking - preserves structure"""
    s = (s or "").replace("\r\n", "\n").replace("\r", "\n")
    # Don't collapse all whitespace - preserve paragraph structure
    # Just clean up excessive blank lines
    s = re.sub(r"\n{4,}", "\n\n\n", s)
    return s.strip()


def _split_into_chunks(text: str, max_chars: int = 1500, overlap: int = 200) -> List[str]:
    """
    Intelligent text chunking with multiple strategies.
    
    Strategies (in order of preference):
    1. Split on natural boundaries (paragraphs, sections)
    2. Split on sentence boundaries
    3. Split on word boundaries (fallback)
    
    This preserves context better than simple character splitting.
    """
    text = text or ""
    if len(text) <= max_chars:
        return [text]
    
    chunks: List[str] = []
    
    # Strategy 1: Split on double newlines (paragraphs/sections)
    paragraphs = text.split("\n\n")
    
    current_chunk = ""
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        
        # If adding this paragraph would exceed max_chars
        if len(current_chunk) + len(para) + 2 > max_chars:
            # If current chunk is not empty, save it
            if current_chunk:
                chunks.append(current_chunk.strip())
                # Start new chunk with overlap from previous
                if overlap > 0 and len(current_chunk) > overlap:
                    current_chunk = current_chunk[-overlap:] + "\n\n" + para
                else:
                    current_chunk = para
            else:
                # Paragraph itself is too long, need to split it
                if len(para) > max_chars:
                    # Strategy 2: Split on sentences
                    sentences = re.split(r'(?<=[.!?])\s+', para)
                    sent_chunk = ""
                    for sent in sentences:
                        if len(sent_chunk) + len(sent) + 1 > max_chars:
                            if sent_chunk:
                                chunks.append(sent_chunk.strip())
                                if overlap > 0 and len(sent_chunk) > overlap:
                                    sent_chunk = sent_chunk[-overlap:] + " " + sent
                                else:
                                    sent_chunk = sent
                            else:
                                # Single sentence too long, force split on words
                                words = sent.split()
                                word_chunk = ""
                                for word in words:
                                    if len(word_chunk) + len(word) + 1 > max_chars:
                                        if word_chunk:
                                            chunks.append(word_chunk.strip())
                                        word_chunk = word
                                    else:
                                        word_chunk += (" " if word_chunk else "") + word
                                sent_chunk = word_chunk
                        else:
                            sent_chunk += (" " if sent_chunk else "") + sent
                    current_chunk = sent_chunk
                else:
                    current_chunk = para
        else:
            current_chunk += ("\n\n" if current_chunk else "") + para
    
    # Don't forget the last chunk
    if current_chunk:
        chunks.append(current_chunk.strip())
    
    # Filter out very short chunks (likely just overlap fragments)
    chunks = [c for c in chunks if len(c) > 50]
    
    logger.info(f"[_split_into_chunks] Created {len(chunks)} chunks (avg size: {sum(len(c) for c in chunks) / len(chunks) if chunks else 0:.0f} chars)")
    
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


def _rerank_chunks(query: str, chunks: List[Dict[str, Any]], top_k: int = 10) -> List[Dict[str, Any]]:
    """
    Rerank chunks using LLM for better relevance.
    
    This is computationally expensive but dramatically improves relevance
    for complex queries. Only used on top candidates from hybrid search.
    """
    if not chunks or len(chunks) <= top_k:
        return chunks
    
    logger.info(f"[_rerank_chunks] Reranking {len(chunks)} chunks to top {top_k}")
    
    try:
        from langchain_openai import ChatOpenAI
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        
        # Build reranking prompt
        chunks_text = ""
        for i, chunk in enumerate(chunks[:30], 1):  # Only rerank top 30 to save tokens
            chunks_text += f"\n[{i}] {chunk['document_name']} (parte {chunk['chunk_index']+1}):\n"
            chunks_text += f"{chunk['text'][:300]}...\n"  # First 300 chars only
        
        prompt = (
            f"Pregunta del usuario: {query}\n\n"
            "A continuación hay fragmentos de documentos. "
            f"Clasifica los {min(top_k, len(chunks))} fragmentos MÁS RELEVANTES para responder esta pregunta.\n"
            "Responde SOLO con los números de los fragmentos, separados por comas, en orden de relevancia.\n"
            "Ejemplo: 5,12,3,18,1\n\n"
            f"Fragmentos:\n{chunks_text}\n\n"
            f"Los {min(top_k, len(chunks))} más relevantes (solo números):"
        )
        
        response = llm.invoke(prompt).content.strip()
        
        # Parse response
        try:
            indices = [int(x.strip()) - 1 for x in response.split(",") if x.strip().isdigit()]
            reranked = [chunks[i] for i in indices if 0 <= i < len(chunks)]
            
            # If reranking returned fewer than top_k, append remaining by original score
            if len(reranked) < top_k:
                remaining = [c for c in chunks if c not in reranked]
                reranked.extend(remaining[:top_k - len(reranked)])
            
            logger.info(f"[_rerank_chunks] Reranking successful, top indices: {indices[:5]}")
            return reranked[:top_k]
        
        except Exception as parse_error:
            logger.warning(f"[_rerank_chunks] Failed to parse reranking response: {parse_error}")
            return chunks[:top_k]
    
    except Exception as e:
        logger.warning(f"[_rerank_chunks] Reranking failed: {e}, using original order")
        return chunks[:top_k]


def search_chunks_maninos(
    property_id: str, 
    query: str, 
    limit: int = 50,  # Increased from 30 to get more candidates for reranking
    document_type: str | None = None,
    use_reranking: bool = True  # NEW: Enable/disable reranking
) -> List[Dict[str, Any]]:
    """
    Search for relevant chunks using hybrid search (semantic + lexical) + reranking.
    
    Args:
        property_id: UUID of the property
        query: User's question
        limit: Max number of chunks to retrieve initially
        document_type: Optional filter by document type
        use_reranking: Whether to use LLM reranking (default True)
    
    Returns:
        List of {property_id, document_type, document_name, chunk_index, text, score}
        sorted by relevance
    """
    MAX_CHUNK_LENGTH = 1200  # Increased to preserve more context
    
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
    
    # 4. Score each chunk - IMPROVED HYBRID ALGORITHM
    def cosine(a: List[float], b: List[float]) -> float:
        if not a or not b:
            return 0.0
        s = sum(x * y for x, y in zip(a, b))
        na = sum(x * x for x in a) ** 0.5
        nb = sum(x * x for x in b) ** 0.5
        return s / (na * nb) if na and nb else 0.0
    
    def lexical_score(text: str, tokens: List[str]) -> float:
        """Enhanced lexical scoring with term frequency"""
        t = text.lower()
        score = 0.0
        for tok in tokens:
            # Count occurrences (not just presence)
            occurrences = t.count(tok)
            if occurrences > 0:
                # Diminishing returns for multiple occurrences (log scale)
                score += 1.0 + (0.3 * min(occurrences - 1, 3))
        return score
    
    scored: List[Dict[str, Any]] = []
    no_embedding_count = 0
    
    for r in rows:
        text = r.get("text", "")
        
        # Skip very short chunks (likely incomplete)
        if len(text.strip()) < 20:
            continue
        
        # Lexical score (enhanced with term frequency)
        lex = lexical_score(text, query_tokens)
        lex_normalized = lex / (len(query_tokens) or 1)
        
        # Semantic score
        emb = r.get("embedding")
        if emb and isinstance(emb, str):
            try:
                import json
                emb = json.loads(emb)
            except Exception:
                emb = None
        
        has_embedding = bool(emb and isinstance(emb, list) and len(emb) > 0)
        vec = cosine(qvec, emb) if qvec and has_embedding else 0.0
        
        if not has_embedding:
            no_embedding_count += 1
        
        # Adaptive hybrid scoring
        if has_embedding and vec > 0:
            # Both semantic and lexical available - semantic is primary
            score = 0.75 * vec + 0.25 * lex_normalized
        else:
            # Only lexical available - penalize for missing embedding
            score = 0.5 * lex_normalized
        
        # Boost for exact phrase matches
        if query.lower() in text.lower():
            score += 0.15
        
        # Minimum relevance threshold to filter noise
        if score > 0.01:
            rr = dict(r)
            rr["score"] = score
            rr["lex_score"] = lex_normalized
            rr["vec_score"] = vec
            rr["has_embedding"] = has_embedding
            
            # Truncate long chunks to save memory
            if len(text) > MAX_CHUNK_LENGTH:
                rr["text"] = text[:MAX_CHUNK_LENGTH] + "...[texto truncado para ahorrar espacio]"
            
            scored.append(rr)
    
    if no_embedding_count > 0:
        logger.warning(f"[search_chunks_maninos] {no_embedding_count}/{len(rows)} chunks missing embeddings")
    
    logger.info(f"[search_chunks_maninos] Scored {len(scored)} chunks (filtered {len(rows) - len(scored)} low-relevance)")
    
    scored.sort(key=lambda x: x["score"], reverse=True)
    
    # Apply reranking if enabled and we have enough candidates
    if use_reranking and len(scored) > 10:
        logger.info(f"[search_chunks_maninos] Applying reranking on top {min(30, len(scored))} chunks")
        top_candidates = scored[:30]  # Only rerank top 30 to save tokens/time
        reranked = _rerank_chunks(query, top_candidates, top_k=min(10, len(top_candidates)))
        # Append remaining chunks after reranked ones
        remaining = scored[30:]
        final = reranked + remaining
        logger.info(f"[search_chunks_maninos] Returning {min(limit, len(final))} chunks (reranked)")
        return final[:limit]
    else:
        logger.info(f"[search_chunks_maninos] Returning top {min(limit, len(scored))} chunks (no reranking)")
        return scored[:limit]


def query_documents_maninos(
    property_id: str, 
    question: str, 
    top_k: int = 8,  # Increased from 5 to 8 for better context
    document_type: str | None = None,
    use_reranking: bool = True
) -> Dict[str, Any]:
    """
    Answer a question using RAG over indexed documents.
    
    This is the MAIN query function - optimized for maximum accuracy.
    
    Args:
        property_id: UUID of the property
        question: User's question
        top_k: Number of chunks to use as context (default 8)
        document_type: Optional filter (e.g., 'title_status')
        use_reranking: Whether to use LLM reranking (default True)
    
    Returns:
        {
            "answer": str,
            "citations": [{"document_type", "document_name", "chunk_index"}],
            "context_used": bool,
            "chunks_searched": int,
            "chunks_used": int
        }
    """
    logger.info(f"[query_documents_maninos] Question: '{question}' (top_k={top_k}, reranking={use_reranking})")
    
    # 1. Search for relevant chunks (with reranking)
    hits = search_chunks_maninos(
        property_id, 
        question, 
        limit=100,  # Increased from 60 to get more candidates
        document_type=document_type,
        use_reranking=use_reranking
    )
    
    if not hits:
        logger.warning(f"[query_documents_maninos] No chunks found for property {property_id}")
        return {
            "answer": "No he encontrado información relevante en los documentos subidos para esta propiedad. "
                     "Verifica que los documentos estén correctamente indexados.",
            "citations": [],
            "context_used": False,
            "chunks_searched": 0,
            "chunks_used": 0
        }
    
    # 2. Build context from top K chunks - IMPROVED
    ctx_hits = hits[:top_k]
    
    # Log scores for debugging
    if ctx_hits:
        scores = [h.get('score', 0) for h in ctx_hits]
        logger.info(f"[query_documents_maninos] Top {len(ctx_hits)} chunk scores: "
                   f"min={min(scores):.3f}, max={max(scores):.3f}, avg={sum(scores)/len(scores):.3f}")
    
    # Build rich context with document metadata
    context_parts = []
    docs_used = set()
    
    for i, h in enumerate(ctx_hits, 1):
        doc_name = h['document_name']
        doc_type = h['document_type']
        chunk_idx = h.get('chunk_index', 0)
        text = h['text']
        score = h.get('score', 0)
        
        docs_used.add(f"{doc_type}:{doc_name}")
        
        # Rich header with metadata
        header = f"[Fragmento #{i}] 📄 {doc_name}"
        if doc_type:
            type_labels = {
                'title_status': 'Title Status',
                'property_listing': 'Property Listing',
                'property_photos': 'Photos/Inspection'
            }
            header += f" ({type_labels.get(doc_type, doc_type)})"
        header += f" - Parte {chunk_idx + 1}"
        
        context_parts.append(f"{header}:\n{text}")
    
    context = "\n\n" + "═" * 70 + "\n\n".join(context_parts) + "\n\n" + "═" * 70
    
    logger.info(f"[query_documents_maninos] Using {len(ctx_hits)} chunks from {len(docs_used)} unique documents")
    
    # 3. Generate answer with LLM - IMPROVED PROMPT
    prompt = (
        "Eres un asistente experto en análisis de documentos inmobiliarios para mobile homes. "
        "Tu trabajo es responder preguntas del usuario usando ÚNICAMENTE la información presente en los documentos proporcionados.\n\n"
        
        "═══════════════════════════════════════════════════════════════════\n"
        "REGLAS CRÍTICAS:\n"
        "═══════════════════════════════════════════════════════════════════\n\n"
        
        "1. PRECISIÓN:\n"
        "   - Responde SOLO con información que aparece explícitamente en el contexto\n"
        "   - Si un dato específico no está, di: 'No aparece en los documentos'\n"
        "   - Si hay información parcial, menciónala pero aclara qué falta\n"
        "   - Si hay contradicciones entre documentos, menciona ambas versiones\n\n"
        
        "2. COMPLETITUD:\n"
        "   - Lee TODOS los fragmentos antes de responder\n"
        "   - Sintetiza información de múltiples fragmentos si es necesario\n"
        "   - Incluye TODOS los detalles relevantes (fechas, cantidades, nombres, condiciones)\n"
        "   - Si hay listas o múltiples elementos, menciónalos todos\n\n"
        
        "3. CLARIDAD:\n"
        "   - Responde de forma directa y estructurada\n"
        "   - Usa bullets o listas cuando haya múltiples elementos\n"
        "   - Usa números específicos (ej: $32,500, no 'alrededor de 30 mil')\n"
        "   - Mantén un tono profesional pero accesible\n\n"
        
        "4. CONTEXTO:\n"
        "   - Si la pregunta es ambigua, interpreta según el contexto inmobiliario\n"
        "   - Para preguntas de 'estado': incluye condición física Y legal\n"
        "   - Para preguntas de 'precio': incluye precio de venta, valor de mercado, etc.\n"
        "   - Para preguntas de 'defectos': lista TODOS los problemas mencionados\n\n"
        
        "5. CASOS ESPECIALES:\n"
        "   - Si pregunta por 'título': menciona tipo (Clean/Lien/Missing) + detalles\n"
        "   - Si pregunta por 'precio': distingue asking price vs market value vs ARV\n"
        "   - Si pregunta por 'año': menciona año de construcción/fabricación\n"
        "   - Si pregunta por 'tamaño': menciona pies cuadrados, bedrooms, bathrooms\n"
        "   - Si pregunta por 'ubicación': menciona dirección completa + park name\n\n"
        
        "═══════════════════════════════════════════════════════════════════\n"
        f"PREGUNTA DEL USUARIO:\n{question}\n\n"
        
        "═══════════════════════════════════════════════════════════════════\n"
        f"CONTEXTO DE LOS DOCUMENTOS:\n\n{context}\n\n"
        
        "═══════════════════════════════════════════════════════════════════\n"
        "TU RESPUESTA (en español, profesional, basada SOLO en el contexto):\n"
    )
    
    try:
        from langchain_openai import ChatOpenAI
        
        # Use gpt-4o for complex/important queries, gpt-4o-mini for simple ones
        # Heuristic: if query is short and simple, use mini; otherwise use full model
        query_lower = question.lower()
        simple_queries = ["cuál", "qué", "cuánto", "dónde", "cuándo", "quién"]
        is_simple = len(question) < 50 and any(q in query_lower for q in simple_queries)
        
        model = "gpt-4o-mini" if is_simple else "gpt-4o"
        logger.info(f"[query_documents_maninos] Using model: {model} (simple={is_simple})")
        
        llm = ChatOpenAI(model=model, temperature=0)
        answer = llm.invoke(prompt).content
        
    except Exception as e:
        logger.error(f"[query_documents_maninos] LLM error: {e}")
        return {
            "answer": f"Error al generar respuesta: {str(e)}. "
                     f"Por favor, intenta reformular tu pregunta o contacta soporte.",
            "citations": [],
            "context_used": True,
            "chunks_searched": len(hits),
            "chunks_used": 0,
            "error": str(e)
        }
    
    # 4. Build rich citations with metadata
    citations = []
    for h in ctx_hits:
        citation = {
            "document_type": h["document_type"],
            "document_name": h["document_name"],
            "chunk_index": h["chunk_index"],
            "relevance_score": round(h.get("score", 0), 3)
        }
        citations.append(citation)
    
    # 5. Add citation summary to answer
    if citations:
        unique_docs = set(c["document_name"] for c in citations)
        citation_text = "\n\n" + "─" * 50 + "\n"
        citation_text += f"📚 **Fuentes consultadas:** {len(unique_docs)} documento(s)\n"
        for doc in unique_docs:
            doc_citations = [c for c in citations if c["document_name"] == doc]
            parts = [str(c["chunk_index"] + 1) for c in doc_citations]
            citation_text += f"  • {doc} (partes: {', '.join(parts)})\n"
        
        answer += citation_text
    
    logger.info(f"✅ [query_documents_maninos] Answer generated: {len(answer)} chars, {len(citations)} citations")
    
    return {
        "answer": answer,
        "citations": citations,
        "context_used": True,
        "chunks_searched": len(hits),
        "chunks_used": len(ctx_hits),
        "model_used": model
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

