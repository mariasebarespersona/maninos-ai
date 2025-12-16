"""
Extraction Tools - Auto-extract structured data from documents using RAG.

This module provides functions to automatically extract structured information
(e.g., asking_price, market_value) from uploaded documents and store it for
later user confirmation.
"""

from typing import Dict, Any, Optional
import logging
import re
from datetime import datetime

from .rag_maninos import query_documents_maninos
from .supabase_client import sb

logger = logging.getLogger(__name__)


def _parse_price(text: str) -> Optional[float]:
    """
    Extract numeric price from text.
    
    Handles formats:
    - $32,500
    - 32500
    - $32.5k
    - 32.5K
    - treinta y dos mil quinientos (Spanish numbers - basic)
    """
    if not text:
        return None
    
    text = text.lower().strip()
    
    # Remove common words
    text = re.sub(r'\b(asking|price|valor|value|es|is|de|of)\b', '', text, flags=re.IGNORECASE)
    
    # Handle K/k suffix (thousands)
    k_match = re.search(r'(\d+\.?\d*)\s*k', text, re.IGNORECASE)
    if k_match:
        return float(k_match.group(1)) * 1000
    
    # Handle standard formats: $32,500 or 32500
    number_match = re.search(r'\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)', text)
    if number_match:
        number_str = number_match.group(1).replace(',', '')
        return float(number_str)
    
    return None


def _calculate_confidence(answer: str, query: str) -> float:
    """
    Calculate confidence score for extracted value.
    
    Based on:
    - Presence of numeric value (0.5)
    - Presence of currency symbol (0.1)
    - Explicit mention of query term (0.2)
    - Answer length (reasonable = 0.2)
    """
    score = 0.0
    
    # Has numeric value
    if re.search(r'\d+', answer):
        score += 0.5
    
    # Has currency symbol or word
    if '$' in answer or 'dollar' in answer.lower() or 'precio' in answer.lower():
        score += 0.1
    
    # Mentions query term
    query_lower = query.lower()
    answer_lower = answer.lower()
    if any(term in answer_lower for term in ['asking', 'price', 'precio', 'market', 'mercado', 'value', 'valor']):
        score += 0.2
    
    # Reasonable length (not too short, not too long)
    if 20 < len(answer) < 300:
        score += 0.2
    
    return min(score, 1.0)


def extract_listing_data(property_id: str, document_id: str) -> Dict[str, Any]:
    """
    Extract structured data from a property listing document.
    
    Uses RAG to query the document for:
    - asking_price
    - market_value
    
    Args:
        property_id: UUID of the property
        document_id: UUID of the document to extract from
    
    Returns:
        {
            "success": bool,
            "extracted": {
                "asking_price": {...},
                "market_value": {...}
            },
            "errors": [...]
        }
    """
    logger.info(f"[extract_listing_data] Starting extraction for property {property_id}, document {document_id}")
    
    result = {
        "success": False,
        "extracted": {},
        "errors": []
    }
    
    # Get document info
    try:
        doc_result = sb.table("maninos_documents").select("*").eq("id", document_id).single().execute()
        if not doc_result.data:
            result["errors"].append(f"Document {document_id} not found")
            return result
        
        doc = doc_result.data
        document_name = doc.get("document_name", "unknown")
        document_type = doc.get("document_type")
        
    except Exception as e:
        logger.error(f"[extract_listing_data] Error fetching document: {e}")
        result["errors"].append(str(e))
        return result
    
    # Define extraction queries
    queries = {
        "asking_price": "¿Cuál es el precio de venta (asking price) de la propiedad? Responde solo con el número.",
        "market_value": "¿Cuál es el valor de mercado (market value) estimado de la propiedad? Responde solo con el número."
    }
    
    extracted_at = datetime.utcnow().isoformat()
    
    # Extract each field
    for field, query in queries.items():
        try:
            logger.info(f"[extract_listing_data] Extracting {field} with query: {query}")
            
            # Query RAG system
            rag_result = query_documents_maninos(
                property_id=property_id,
                question=query,
                document_type=document_type,
                use_reranking=False  # Faster for extraction
            )
            
            answer = rag_result.get("answer", "")
            
            # Parse numeric value
            value = _parse_price(answer)
            
            if value and value > 0:
                confidence = _calculate_confidence(answer, query)
                
                result["extracted"][field] = {
                    "value": value,
                    "confidence": round(confidence, 2),
                    "source": document_name,
                    "extracted_at": extracted_at,
                    "raw_answer": answer[:200]  # Store first 200 chars for debugging
                }
                
                logger.info(f"[extract_listing_data] ✅ Extracted {field}: ${value} (confidence: {confidence:.2f})")
            else:
                logger.warning(f"[extract_listing_data] ⚠️ Could not extract {field} from answer: {answer[:100]}")
                result["errors"].append(f"Could not parse {field} from: {answer[:100]}")
        
        except Exception as e:
            logger.error(f"[extract_listing_data] Error extracting {field}: {e}")
            result["errors"].append(f"Error extracting {field}: {str(e)}")
    
    # Update property with extracted data
    if result["extracted"]:
        try:
            # Get current extracted_data
            prop_result = sb.table("properties").select("extracted_data").eq("id", property_id).single().execute()
            current_data = prop_result.data.get("extracted_data") or {}
            
            # Merge with new data
            updated_data = {**current_data, **result["extracted"]}
            
            # Update property
            sb.table("properties").update({"extracted_data": updated_data}).eq("id", property_id).execute()
            
            logger.info(f"[extract_listing_data] ✅ Saved extracted data to property {property_id}")
            result["success"] = True
            
        except Exception as e:
            logger.error(f"[extract_listing_data] Error saving extracted data: {e}")
            result["errors"].append(f"Error saving: {str(e)}")
    else:
        logger.warning(f"[extract_listing_data] No data extracted from document {document_name}")
    
    return result


def get_extracted_data(property_id: str) -> Dict[str, Any]:
    """
    Get extracted data for a property.
    
    Returns:
        {
            "asking_price": {...} or None,
            "market_value": {...} or None,
            ...
        }
    """
    try:
        result = sb.table("properties").select("extracted_data").eq("id", property_id).single().execute()
        return result.data.get("extracted_data") or {}
    except Exception as e:
        logger.error(f"[get_extracted_data] Error: {e}")
        return {}


def clear_extracted_field(property_id: str, field: str) -> bool:
    """
    Clear a specific extracted field (e.g., if user rejected it).
    
    Args:
        property_id: UUID of the property
        field: Field name (e.g., 'asking_price')
    
    Returns:
        True if successful
    """
    try:
        # Get current data
        result = sb.table("properties").select("extracted_data").eq("id", property_id).single().execute()
        current_data = result.data.get("extracted_data") or {}
        
        # Remove field
        if field in current_data:
            del current_data[field]
            
            # Update
            sb.table("properties").update({"extracted_data": current_data}).eq("id", property_id).execute()
            logger.info(f"[clear_extracted_field] Cleared {field} for property {property_id}")
            return True
        
        return False
    
    except Exception as e:
        logger.error(f"[clear_extracted_field] Error: {e}")
        return False

