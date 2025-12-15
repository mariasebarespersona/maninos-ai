"""
Active Router (Simplified) - Basic routing for initial requests

This router handles ONLY basic routing when there's NO property context:
1. property.create - Detect new property from address
2. property.list - List all properties
3. property.delete - Delete a property
4. property.switch - Switch to another property
5. general_conversation - Default fallback

For everything else (acquisition flow, documents, etc.):
→ FlowValidator handles it (when property_id exists)

Architecture:
- Simple, fast keyword-based classification for basic operations
- LLM fallback ONLY for ambiguous cases
- NO keywords for acquisition flow (that's FlowValidator's job)
"""

from __future__ import annotations
import re
import logging
from typing import Tuple, Dict, Optional

logger = logging.getLogger("active_router")

# Address pattern (simplified)
ADDRESS_PATTERN = re.compile(
    r'\b(?:calle|avenida|ave|av|street|st|paseo|ronda|plaza|camino|carretera)\b\s+[\wáéíóúñ\s]+\d+',
    re.IGNORECASE
)

# Confidence thresholds
CONFIDENCE_THRESHOLDS = {
    "property": 0.75,
}

# LLM fallback threshold
LLM_FALLBACK_THRESHOLD = 0.70


class ActiveRouter:
    """
    Simplified active router for basic initial routing.
    
    Handles ONLY:
    - Property creation (new address)
    - Property listing
    - Property deletion
    - Property switching
    - General conversation (fallback)
    
    Does NOT handle:
    - Acquisition flow steps (FlowValidator's job)
    - Document operations (FlowValidator's job)
    - Completion signals (FlowValidator's job)
    """
    
    def __init__(self):
        self._llm = None
        logger.info("[active_router] Initialized (Simplified version)")
    
    @property
    def llm(self):
        """Lazy load LLM only when needed for fallback."""
        if self._llm is None:
            try:
                from langchain_openai import ChatOpenAI
                self._llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0.0,
                    timeout=10.0
                )
                logger.info("[active_router] LLM loaded (gpt-4o-mini)")
            except Exception as e:
                logger.error(f"[active_router] Failed to load LLM: {e}")
                self._llm = None
        return self._llm
    
    def predict_keywords(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        Fast keyword-based classification for BASIC operations only.
        
        Returns: (intent, confidence, target_agent)
        """
        s = user_text.lower().strip()
        ctx = context or {}
        
        # ==========================================================
        # BASIC PROPERTY OPERATIONS (No property_id required)
        # ==========================================================
        
        # 1. CREATE NEW PROPERTY - Detect address
        # This is the ONLY intent that actively looks for patterns
        if ADDRESS_PATTERN.search(user_text):
            # Check it's about creating/evaluating, not just mentioning
            create_verbs = [
                "evaluar", "evalúa", "evalua", "quiero evaluar",
                "analizar", "analiza", "ver", "revisar", "nueva", "nuevo",
                "agregar", "añadir", "anade", "crear", "create", "add"
            ]
            if any(verb in s for verb in create_verbs):
                logger.info(f"[active_router] 🏠 New property detected (address pattern)")
                return ("property.create", 0.95, "PropertyAgent")
        
        # 2. LIST PROPERTIES
        list_indicators = [
            "lista", "listar", "mostrar", "ver", "mis propiedades",
            "qué propiedades", "cuales propiedades", "cuántas propiedades",
            "list properties", "show properties"
        ]
        if any(indicator in s for indicator in list_indicators):
            if "propiedad" in s or "properties" in s or "casas" in s:
                logger.info(f"[active_router] 📋 List properties detected")
                return ("property.list", 0.92, "PropertyAgent")
        
        # 3. DELETE PROPERTY
        # Simple detection - specific enough to not need much context
        delete_verbs = ["elimina", "eliminar", "borra", "borrar", "quita", "quitar", "delete", "remove"]
        starts_with_delete = any(s.startswith(verb + " ") or s == verb for verb in delete_verbs)
        
        if starts_with_delete:
            property_words = ["propiedad", "casa", "piso", "mobile home", "property"]
            if any(word in s for word in property_words):
                # Not documents
                document_words = ["documento", "archivo", "file", "pdf"]
                if not any(doc in s for doc in document_words):
                    logger.info(f"[active_router] 🗑️ Delete property detected")
                    return ("property.delete", 0.90, "PropertyAgent")
        
        # 4. SWITCH PROPERTY
        switch_indicators = [
            "cambiar a", "cambiar propiedad", "trabajar con", "usar propiedad",
            "switch to", "change to", "go to"
        ]
        if any(indicator in s for indicator in switch_indicators):
            logger.info(f"[active_router] 🔄 Switch property detected")
            return ("property.switch", 0.88, "PropertyAgent")
        
        # ==========================================================
        # DEFAULT: GENERAL CONVERSATION
        # ==========================================================
        # If nothing matched, it's either:
        # 1. General conversation (hello, help, etc.)
        # 2. Something that FlowValidator should handle (if property exists)
        # 3. Ambiguous → LLM fallback
        
        logger.info(f"[active_router] 💬 No basic pattern matched → general_conversation (low confidence)")
        return ("general_conversation", 0.50, "MainAgent")
    
    def predict_llm(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        LLM-based fallback classification for ambiguous cases.
        
        ONLY used when keyword-based classification returns low confidence.
        """
        if not self.llm:
            logger.warning("[active_router] LLM fallback requested but LLM not available")
            return ("general_conversation", 0.40, "MainAgent")
        
        ctx = context or {}
        property_name = ctx.get("property_name", "None")
        
        # Simplified prompt focusing ONLY on basic operations
        prompt = f"""Eres un clasificador de intents para una app de gestión inmobiliaria (Mobile Homes).

Contexto:
- Propiedad actual: {property_name}

Intents BÁSICOS disponibles (solo estos):
1. property.create - Usuario menciona una dirección nueva para evaluar
2. property.list - Usuario quiere ver lista de propiedades
3. property.delete - Usuario quiere eliminar una propiedad
4. property.switch - Usuario quiere cambiar a otra propiedad
5. general_conversation - Conversación general, preguntas, saludos

IMPORTANTE:
- Si el usuario menciona "checklist", "inspección", "arv", "documentos", "70%", "80%" → general_conversation (FlowValidator lo maneja)
- Si el usuario dice "listo", "done", "siguiente" → general_conversation (FlowValidator lo maneja)
- Solo clasifica intents BÁSICOS de gestión de propiedades

Mensaje del usuario:
"{user_text}"

Responde SOLO con el nombre del intent. Nada más."""

        try:
            start = perf_counter()
            response = self.llm.invoke(prompt)
            duration_ms = int((perf_counter() - start) * 1000)
            
            intent_raw = response.content.strip().lower()
            
            # Map to valid intents
            intent_map = {
                "property.create": ("property.create", 0.85, "PropertyAgent"),
                "property.list": ("property.list", 0.85, "PropertyAgent"),
                "property.delete": ("property.delete", 0.85, "PropertyAgent"),
                "property.switch": ("property.switch", 0.85, "PropertyAgent"),
                "general_conversation": ("general_conversation", 0.75, "MainAgent"),
            }
            
            result = intent_map.get(intent_raw, ("general_conversation", 0.70, "MainAgent"))
            
            logger.info(
                f"[active_router] 🤖 LLM classification: {result[0]} "
                f"(conf={result[1]:.2f}, {duration_ms}ms)"
            )
            
            return result
            
        except Exception as e:
            logger.error(f"[active_router] LLM classification failed: {e}")
            return ("general_conversation", 0.40, "MainAgent")
    
    async def decide(self, user_input: str, context: Optional[Dict] = None) -> Dict:
        """
        Main routing decision with hybrid approach.
        
        1. Try keyword-based classification (fast)
        2. If confidence < threshold → LLM fallback
        3. Return routing decision
        """
        start = perf_counter()
        ctx = context or {}
        
        # Try keyword-based classification first
        intent, confidence, agent = self.predict_keywords(user_input, ctx)
        method = "keywords"
        
        # If confidence is low, try LLM fallback
        if confidence < LLM_FALLBACK_THRESHOLD:
            logger.info(
                f"[active_router] Low confidence ({confidence:.2f}) → trying LLM fallback"
            )
            intent, confidence, agent = self.predict_llm(user_input, ctx)
            method = "llm_fallback"
        
        duration_ms = int((perf_counter() - start) * 1000)
        
        routing_decision = {
            "intent": intent,
            "confidence": confidence,
            "target_agent": agent,
            "method": method,
            "reason": f"Detected {intent} via {method}",
            "duration_ms": duration_ms
        }
        
        logger.info(
            f"[active_router] ✅ Decision: {intent} → {agent} "
            f"(conf={confidence:.2f}, {method}, {duration_ms}ms)"
        )
        
        return routing_decision

