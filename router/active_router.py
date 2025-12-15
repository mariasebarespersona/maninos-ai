"""
Active Router - Routes requests to specialized agents.

This router:
1. Classifies user intent with confidence using keywords (fast path)
2. Falls back to LLM classification for ambiguous cases (slow path)
3. Routes to specialized agent (PropertyAgent - handles all acquisition including documents)
4. Falls back to MainAgent for low confidence or complex queries

Architecture:
- predict_keywords(): Fast keyword-based classification (~0ms)
- predict_llm(): LLM-based classification for ambiguous cases (~200ms)
- predict(): Hybrid approach - keywords first, LLM fallback if low confidence
"""

from __future__ import annotations
import re
import os
import logging
from time import perf_counter
from typing import Tuple, Dict, Optional

logger = logging.getLogger("active_router")

# Cell reference pattern
CELL_RE = re.compile(r"\b([A-Z]{1,3}[0-9]{1,4})\b", re.I)

# Confidence thresholds for routing to specialized agents
CONFIDENCE_THRESHOLDS = {
    "property": 0.75,
    "numbers": 0.80,
    "docs": 0.85
}

# Threshold below which we use LLM fallback
LLM_FALLBACK_THRESHOLD = 0.70

# All available intents with descriptions for LLM classification
# ============================================================================
# MANINOS AI - Intent Descriptions (Clean)
# ============================================================================
# All RAMA Numbers/Excel intents removed
# Docs intents simplified (no R2B/Promoción strategy)
# ============================================================================

INTENT_DESCRIPTIONS = {
    # Property / Acquisition intents (MANINOS specific)
    "property.create": "Usuario quiere CREAR una nueva propiedad (mobile home)",
    "property.switch": "Usuario quiere CAMBIAR a otra propiedad existente",
    "property.list": "Usuario quiere VER LISTA de todas sus propiedades",
    "property.delete": "Usuario quiere ELIMINAR/BORRAR una propiedad",
    "property.acquisition": "Usuario está EVALUANDO un mobile home: checklist, inspección, reparaciones, ARV, reglas del 70% o 80%, análisis de inversión, title status, generar contrato de compra (purchase agreement).",
    
    # Docs intents (Generic - for PDFs, Zillow/MHVillage docs)
    "docs.initial_collection": "Usuario está en Paso 0 (Recopilación de Documentos Iniciales): subir Title Status, Property Listing, Property Photos",
    "docs.qa": "Usuario hace una PREGUNTA sobre el CONTENIDO de un documento PDF (qué dice, datos, valores, etc.)",
    "docs.send_email": "Usuario quiere ENVIAR un documento o resumen por EMAIL",
    "docs.upload": "Usuario quiere SUBIR un documento PDF (Zillow listing, MHVillage, inspección, etc.)",
    "docs.delete": "Usuario quiere BORRAR/ELIMINAR un documento de la propiedad actual",
    "docs.list": "Usuario quiere VER LISTA de documentos subidos",
    
    # General intents
    "general.help": "Usuario pide AYUDA o quiere saber qué puede hacer el asistente",
    "general.chat": "Conversación GENERAL que no encaja en ninguna categoría específica",
}

# LLM classification prompt
LLM_CLASSIFICATION_PROMPT = """Eres un clasificador de intents para una app de gestión inmobiliaria (Mobile Homes).

CONTEXTO:
- Propiedad actual: {property_name}
- Documentos subidos: {num_uploaded}
- Estrategia actual: {strategy}

INTENTS DISPONIBLES:
{intent_list}

REGLAS CRÍTICAS:
1. **ELIMINAR vs CREAR propiedad:**
   - "Elimina Casa X" / "Borra Casa Y" = property.delete (comando de eliminación)
   - "Casa Elimina" / "Propiedad Borra" = property.create (nombre de propiedad)
   - Si empieza con verbo de eliminación (elimina/borra/quita) + nombre = property.delete
   - Si es solo un nombre sin verbo de acción = property.create

2. Si el usuario habla de "checklist", "defectos", "reparaciones", "arv", "título", "title status", "generar contrato", "purchase agreement" → property.acquisition

3. Si el usuario pregunta sobre el CONTENIDO de un documento → docs.qa

4. Si el usuario quiere LISTAR documentos → docs.list

5. Si el usuario quiere CAMBIAR de propiedad → property.switch

MENSAJE DEL USUARIO:
"{user_text}"

Responde SOLO con el nombre del intent (ej: "property.acquisition"). Nada más."""


class ActiveRouter:
    """
    Active router that classifies intent and routes to specialized agents.
    
    Uses a hybrid approach:
    1. Fast keyword-based classification (predict_keywords)
    2. LLM fallback for ambiguous cases (predict_llm)
    """
    
    def __init__(self):
        """Initialize the router."""
        self._llm = None  # Lazy-loaded LLM for classification
    
    def _get_llm(self):
        """Lazy-load the LLM for classification."""
        if self._llm is None:
            try:
                from langchain_openai import ChatOpenAI
                # Use gpt-4o-mini for fast, cheap classification
                self._llm = ChatOpenAI(
                    model="gpt-4o-mini",
                    temperature=0,
                    max_tokens=50  # We only need the intent name
                )
                logger.info("[active_router] LLM classifier initialized (gpt-4o-mini)")
            except Exception as e:
                logger.error(f"[active_router] Failed to initialize LLM: {e}")
                self._llm = None
        return self._llm
    
    def predict_keywords(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        Fast keyword-based intent classification.
        
        Args:
            user_text: User's message
            context: Optional context dict
        
        Returns:
            Tuple of (intent, confidence, target_agent)
        """
        s = (user_text or "").lower()
        ctx = context or {}
        
        # ========== PASO 0: DOCUMENTS PENDING (PRIORITY ROUTING) ==========
        # If acquisition_stage is 'documents_pending', route to DocsAgent for initial document collection
        acquisition_stage = ctx.get("acquisition_stage")
        if acquisition_stage == "documents_pending":
            # Check if user is saying "done" or "ready" or "listo"
            completion_keywords = ["listo", "ya está", "ya esta", "terminé", "termine", "completé", "complete", "done", "ready", "finished"]
            if any(kw in s for kw in completion_keywords):
                logger.info(f"[active_router] 📄 Documents pending stage + completion signal → DocsAgent (docs.initial_collection)")
                return ("docs.initial_collection", 0.99, "PropertyAgent")
            
            # Check if user is asking about documents or uploading
            doc_keywords = ["documento", "pdf", "subir", "upload", "archivo", "file", "zillow", "mhvillage", "listing", "title", "foto", "photo"]
            if any(kw in s for kw in doc_keywords):
                logger.info(f"[active_router] 📄 Documents pending stage + doc keyword → DocsAgent (docs.initial_collection)")
                return ("docs.initial_collection", 0.99, "PropertyAgent")
            
            # Default: If in documents_pending stage, prioritize DocsAgent
            logger.info(f"[active_router] 📄 Documents pending stage (fallback) → DocsAgent (docs.initial_collection)")
            return ("docs.initial_collection", 0.85, "PropertyAgent")
        
        # ========== CONVERSATION CONTINUATION DETECTION ==========
        # Check if user is responding to a previous agent question
        # This ensures we route back to the same agent for multi-turn flows
        history = ctx.get("history", [])
        if history:
            # Get last AI message
            last_ai_content = None
            last_ai_msg = None
            for msg in reversed(history):
                if hasattr(msg, 'type') and msg.type == 'ai' and hasattr(msg, 'content') and msg.content:
                    last_ai_content = msg.content.lower()
                    last_ai_msg = msg.content  # Keep original case for extraction
                    break
            
            if last_ai_content:
                # ============================================================
                # CONFIRMATION RESPONSES (si, sí, no, confirmo, etc.)
                # These MUST be checked FIRST before any other patterns
                # ============================================================
                confirmation_yes = ["si", "sí", "yes", "confirmo", "adelante", "ok", "vale", "claro", "por supuesto", "hazlo", "dale"]
                confirmation_no = ["no", "cancelar", "cancela", "olvídalo", "olvidalo", "mejor no"]
                
                is_confirmation = s.strip() in confirmation_yes or s.strip() in confirmation_no
                
                if is_confirmation:
                    # Property deletion confirmation
                    if ("¿estás seguro" in last_ai_content or "estas seguro" in last_ai_content) and "eliminar" in last_ai_content:
                        intent = "property.delete_confirm" if s.strip() in confirmation_yes else "property.delete_cancel"
                        logger.info(f"[active_router] 🔄 Continuation: PropertyAgent delete confirmation ({s})")
                        return (intent, 0.98, "PropertyAgent")
                    
                    # Property creation confirmation
                    if ("crear" in last_ai_content or "añadir" in last_ai_content) and "propiedad" in last_ai_content and "?" in last_ai_content:
                        intent = "property.create_confirm" if s.strip() in confirmation_yes else "property.create_cancel"
                        logger.info(f"[active_router] 🔄 Continuation: PropertyAgent create confirmation ({s})")
                        return (intent, 0.98, "PropertyAgent")
                    
                    # Document upload confirmation
                    if ("confirmas" in last_ai_content or "subir" in last_ai_content) and ("documento" in last_ai_content or "archivo" in last_ai_content):
                        intent = "docs.upload_confirm" if s.strip() in confirmation_yes else "docs.upload_cancel"
                        logger.info(f"[active_router] 🔄 Continuation: DocsAgent upload confirmation ({s})")
                        return (intent, 0.98, "PropertyAgent")
                    
                    # Email send confirmation
                    if ("enviar" in last_ai_content or "mandar" in last_ai_content) and ("email" in last_ai_content or "correo" in last_ai_content):
                        intent = "docs.email_confirm" if s.strip() in confirmation_yes else "docs.email_cancel"
                        logger.info(f"[active_router] 🔄 Continuation: DocsAgent email confirmation ({s})")
                        return (intent, 0.98, "PropertyAgent")
                    
                    # Generic confirmation - check for any question mark and detect context
                    if "?" in last_ai_content:
                        if any(kw in last_ai_content for kw in ["propiedad", "inmueble", "mobile home", "arv", "título", "contrato"]):
                            logger.info(f"[active_router] 🔄 Continuation: Generic PropertyAgent confirmation")
                            return ("property.acquisition", 0.95, "PropertyAgent")
                        elif any(kw in last_ai_content for kw in ["documento", "archivo", "pdf"]):
                            logger.info(f"[active_router] 🔄 Continuation: Generic DocsAgent confirmation")
                            return ("docs.confirm", 0.95, "PropertyAgent")
                
                # ============================================================
                # NON-CONFIRMATION CONTINUATIONS
                # ============================================================
                
                # PropertyAgent continuation: Asked for property name/address
                property_ask_phrases = [
                    "nombre y la dirección", "nombre y dirección",
                    "proporciona el nombre", "proporciona nombre",
                    "qué nombre", "que nombre", "cómo se llama", "como se llama",
                    "nombre de la propiedad", "dirección de la propiedad",
                    "asking price", "precio de venta", "valor de mercado", "arv"
                ]
                if any(phrase in last_ai_content for phrase in property_ask_phrases):
                    logger.info(f"[active_router] 🔄 Continuation: PropertyAgent asked for info")
                    return ("property.acquisition", 0.95, "PropertyAgent")
                
                # PropertyAgent continuation: Asked for checklist/defects
                checklist_ask_phrases = [
                    "lista de inspección", "defectos", "reparaciones", "techo", "hvac", "título", "title status"
                ]
                if any(phrase in last_ai_content for phrase in checklist_ask_phrases):
                     # If user answers with "clean", "blue", "dañado", "roto", etc.
                    return ("property.acquisition", 0.95, "PropertyAgent")
                
                # DocsAgent continuation: Asked for email
                email_ask_phrases = [
                    "qué correo", "que correo", "qué email", "que email",
                    "a qué dirección", "a que dirección", "proporciona el email"
                ]
                if any(phrase in last_ai_content for phrase in email_ask_phrases):
                    # Check if user provided an email
                    email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
                    if re.search(email_pattern, s):
                        logger.info(f"[active_router] 🔄 Continuation: DocsAgent email response")
                        return ("docs.send_email", 0.95, "PropertyAgent")
        
        # ========== MANINOS ACQUISITION OPERATIONS ==========
        acquisition_keywords = [
            "checklist", "inspección", "inspeccion", "defectos", "reparaciones", 
            "arv", "after repair value", "title status", "estado del título", "titulo",
            "70%", "80%", "regla del", "viabilidad", "analizar", "evaluar", "compra",
            "asking price", "precio de venta", "valor de mercado", "market value",
            "contrato", "contract", "generar contrato", "purchase agreement"
        ]
        
        if any(kw in s for kw in acquisition_keywords):
            # Exclude if explicitly about documents (e.g. "documento de inspeccion")
            if "documento" not in s and "pdf" not in s:
                return ("property.acquisition", 0.95, "PropertyAgent")
        
        # ========== PROPERTY OPERATIONS ==========
        
        # Delete property - with AMBIGUITY DETECTION
        # When there's ambiguity (e.g., "Elimina Casa X" could be delete OR property name),
        # return LOW confidence to trigger LLM fallback for intelligent decision
        
        delete_verbs = ["elimina", "eliminar", "borra", "borrar", "quita", "quitar", "delete", "remove"]
        
        # Check if starts with delete verb
        starts_with_delete = any(s.startswith(verb + " ") or s == verb for verb in delete_verbs)
        
        # EXPLICIT phrases with "propiedad" word (HIGH confidence - no ambiguity)
        delete_property_explicit = any(phrase in s for phrase in [
            "elimina propiedad", "eliminar propiedad", "borra propiedad", "borrar propiedad",
            "quita propiedad", "quitar propiedad", "elimina la propiedad", "borra la propiedad",
            "elimina esta", "borra esta", "quita esta", "elimina la", "borra la", "quita la"
        ])
        if delete_property_explicit:
            logger.info(f"[active_router] 🗑️ Detected property.delete (explicit phrase): '{s[:50]}'")
            return ("property.delete", 0.90, "PropertyAgent")
        
        # AMBIGUOUS cases: "Elimina Casa X" could be delete OR property name
        # Return LOW confidence (0.65) to trigger LLM fallback for smart decision
        if starts_with_delete:
            # Check if it looks like a property name (capitalized words after verb)
            words = s.split()
            if len(words) >= 2:
                # If there are capitalized words after the verb, it's AMBIGUOUS
                has_capitalized = any(word[0].isupper() for word in words[1:] if len(word) > 0)
                
                if has_capitalized:
                    logger.info(f"[active_router] ⚠️ AMBIGUOUS delete/create: '{s[:50]}' → LLM fallback")
                    return ("property.delete", 0.65, "PropertyAgent")  # LOW confidence → LLM decides
        
        # Create property - context-aware detection
        # Keywords for property types
        property_types = [
            "casa", "casas", "piso", "pisos", "apartamento", "apartamentos",
            "villa", "villas", "finca", "fincas", "terreno", "terrenos",
            "local", "locales", "inmueble", "inmuebles", "propiedad", "propiedades",
            "mobile home", "mobil home", "casa prefabricada"
        ]
        
        # Action verbs for creating
        create_verbs = [
            "crear", "crea", "añadir", "añade", "añadir", "agregar", "agrega", "anade",
            "nueva", "nuevo", "registrar", "registra", "dar de alta", "alta de"
        ]
        
        # Direct property creation phrases (high confidence)
        create_property_phrases = [
            "crear propiedad", "crea propiedad", "nueva propiedad", "añadir propiedad", "agregar propiedad",
            "crea una propiedad", "crear una propiedad", "añade una propiedad", "agrega una propiedad",
            "anade una propiedad", "anade propiedad",
            # Natural variations
            "quiero crear", "necesito crear", "vamos a crear", "dame de alta",
            "registrar propiedad", "registra propiedad", "registrar una propiedad",
            "tengo una propiedad nueva", "compré", "he comprado", "acabo de comprar",
            "tengo una mobile home", "evaluar mobile home"
        ]
        
        # Check direct phrases first
        if any(phrase in s for phrase in create_property_phrases):
            return ("property.create", 0.95, "PropertyAgent")
        
        # Context-aware: action verb + property type (e.g., "añade esta casa", "crea una villa")
        has_create_verb = any(verb in s for verb in create_verbs)
        has_property_type = any(ptype in s for ptype in property_types)
        
        if has_create_verb and has_property_type:
            # Exclude if it's about documents (e.g., "añade el documento de la casa")
            doc_exclusions = ["documento", "documentos", "archivo", "archivos", "fichero", "pdf", "contrato", "factura"]
            if not any(excl in s for excl in doc_exclusions):
                logger.info(f"[active_router] 🏠 Detected property creation from context: verb + property type")
                return ("property.create", 0.93, "PropertyAgent")
        
        # Switch property - expanded synonyms
        switch_property_phrases = [
            # Direct commands
            "cambiar a", "cambio a", "trabajar con", "usar propiedad", "selecciona",
            "metete en", "entrar en", "entra en", "entrar a", "entra a",
            # Natural variations
            "abre", "abrir", "ve a", "ir a", "vamos a", "pasemos a",
            "quiero ver", "quiero trabajar", "cambia de propiedad",
            "otra propiedad", "siguiente propiedad", "propiedad anterior"
        ]
        if any(phrase in s for phrase in switch_property_phrases):
            # Not about numbers template
            if not any(x in s for x in ["números", "plantilla", "r2b", "tabla"]):
                return ("property.switch", 0.90, "PropertyAgent")
        
        # List properties - expanded synonyms
        list_property_keywords = [
            "lista", "listar", "ver", "mostrar", "muestrame", "muéstrame",
            "cuales", "cuáles", "cuántas", "cuantas", "qué", "que", "mis",
            "tengo", "hay", "todas", "disponibles"
        ]
        if "propiedades" in s or "properties" in s or "inmuebles" in s or "casas" in s or "mobile homes" in s:
            if any(w in s for w in list_property_keywords):
                if not any(x in s for x in ["trabajar", "usar", "crear", "nueva"]):
                    return ("property.list", 0.92, "PropertyAgent")
        
        # ========== DOCUMENT STRATEGY SELECTION (HIGH PRIORITY - BEFORE NUMBERS) ==========
        # CRITICAL: Detect when user wants to change document strategy (R2B vs Promoción)
        # This MUST be checked BEFORE numbers operations to avoid confusion
        
        # Keywords that indicate document strategy context (NOT numbers)
        doc_strategy_keywords = [
            # Decision verbs
            "elegir", "elijo", "eliges", "elige", "escoger", "escojo", "escoge",
            "optar", "opto", "optas", "decidir", "decido", "decides",
            # Path/strategy words
            "camino", "estrategia", "ruta", "vía", "via", "opción", "opcion",
            "seguir por", "ir por", "tomar", "coger",
            # Intent phrases
            "voy a", "quiero", "prefiero", "me decanto", "vamos por",
            # Document context
            "documentos", "docs", "compra", "promoción", "promocion", "obra nueva",
            # Transition phrases
            "no tengo más", "no tengo mas", "por ahora", "de momento",
            "dejar", "pasar a", "pasemos a", "siguiente nivel", "siguiente fase",
            "terminé", "termine", "acabé", "acabe", "terminado", "acabado",
            # Reform/build context (indicates R2B or Promoción)
            "reformar", "reforma", "reformas", "rehabilitar", "rehabilitación",
            "construir", "construcción", "obra", "edificar"
        ]
        
        # Strategy keywords (R2B, Promoción, etc.)
        strategy_keywords = ["r2b", "promoción", "promocion", "reforma", "obra nueva"]
        
        if any(kw in s for kw in strategy_keywords):
            # Check if it's about document strategy, NOT numbers
            has_doc_context = any(kw in s for kw in doc_strategy_keywords)
            has_numbers_context = any(kw in s for kw in ["números", "numeros", "plantilla", "celda", "b5", "c5", "excel", "tabla"])
            
            if has_doc_context and not has_numbers_context:
                logger.info(f"[active_router] 🎯 Detected document strategy selection: R2B/Promoción")
                return ("docs.set_strategy", 0.95, "PropertyAgent")
        
        # ========== NUMBERS/EXCEL OPERATIONS - REMOVED ==========
        # All Numbers/Excel/R2B/Plantilla functionality removed for MANINOS
        # MANINOS uses simple repair cost calculations (calculate_repair_costs_tool),
        # not complex Excel templates with formulas
        
        # ========== DOCS OPERATIONS ==========
        
        # Expanded document keywords
        doc_keywords = [
            # Document types
            "contrato", "contratos", "factura", "facturas", "escritura", "escrituras",
            "certificado", "certificados", "documento", "documentos", "doc", "docs",
            "licencia", "licencias", "permiso", "permisos", "informe", "informes",
            "presupuesto", "presupuestos", "plano", "planos", "proyecto", "proyectos",
            # Professional documents
            "arquitecto", "abogado", "notario", "ingeniero", "aparejador",
            # Specific document names
            "arras", "señal", "nota simple", "ibi", "icio", "tasación", "cédula",
            "cfe", "boletín", "boletin", "certificado energético"
        ]
        
        # HIGHEST PRIORITY: Send by email (must be before list!)
        # "mandame el documento por email" should NOT be classified as docs.list
        send_email_verbs = [
            "manda", "mandar", "envía", "enviar", "mandame", "enviame",
            "comparte", "compartir", "remite", "remitir", "hazme llegar",
            "pásame", "pasame", "reenvía", "reenvia"
        ]
        email_destinations = ["email", "correo", "mail", "e-mail", "gmail", "hotmail", "outlook", "yahoo"]
        
        if any(verb in s for verb in send_email_verbs):
            has_email_dest = any(dest in s for dest in email_destinations)
            has_doc_keyword = any(doc in s for doc in doc_keywords)
            has_context_ref = any(ref in s for ref in ["este", "ese", "esto", "eso", "esta", "esa"])
            has_content_keyword = any(kw in s for kw in ["resumen", "contenido", "información", "datos"])
            
            if has_email_dest or has_doc_keyword or has_context_ref or has_content_keyword:
                # But NOT if it's about números/R2B
                if not any(x in s for x in ["números", "numeros", "r2b", "tabla", "plantilla"]):
                    return ("docs.send_email", 0.96, "PropertyAgent")
        
        # SECOND: Check for list operations (higher priority than QA for "qué documentos tengo")
        # List documents - these should be checked BEFORE content questions
        doc_list_keywords = ["documentos", "documento", "docs", "archivos", "ficheros", "papeles"]
        list_action_keywords = [
            "lista", "listar", "mostrar", "muestrame", "muéstrame", "ver",
            "dame", "enseña", "enséñame", "dime", "cuales", "cuáles"
        ]
        list_query_keywords = ["tengo", "hay", "subido", "subidos", "pendiente", "pendientes"]
        
        # "qué documentos tengo" = list (not QA about content)
        if any(kw in s for kw in doc_list_keywords):
            # Check for list intent patterns
            if any(w in s for w in list_action_keywords):
                return ("docs.list", 0.95, "PropertyAgent")
            # "qué documentos tengo/hay" = list, not QA
            if any(w in s for w in list_query_keywords):
                return ("docs.list", 0.92, "PropertyAgent")
            # "qué documentos" alone without content verb = list
            if ("qué" in s or "que" in s or "cuáles" in s or "cuales" in s):
                # Only list if NOT asking about content
                content_verbs_check = ["dice", "pone", "contiene", "menciona", "explica", "establece", "indica"]
                if not any(verb in s for verb in content_verbs_check):
                    return ("docs.list", 0.90, "PropertyAgent")
        
        # SECOND: Document content questions (RAG/QA)
        # Questions about document CONTENT should go to DocsAgent (it has RAG tools)
        
        # Expanded question words
        question_words = [
            "qué", "que", "cuándo", "cuando", "cuánto", "cuanto", "cuántos", "cuantos",
            "cómo", "como", "dónde", "donde", "quién", "quien", "cuál", "cual",
            "por qué", "porque", "para qué", "para que"
        ]
        
        # Content verbs - indicate asking about what's IN the document
        content_verbs = [
            "dice", "decir", "pone", "poner", "contiene", "contener",
            "menciona", "mencionar", "explica", "explicar", "especifica", "especificar",
            "establece", "establecer", "indica", "indicar", "señala", "señalar",
            "describe", "describir", "detalla", "detallar", "incluye", "incluir"
        ]
        
        # Payment/date terms - indicate asking about specific content
        payment_terms = [
            "pagar", "pago", "pagos", "fecha", "fechas", "vencimiento", "vencimientos",
            "plazo", "plazos", "día", "dia", "mes", "año", "vence", "vencen",
            "cuota", "cuotas", "importe", "importes", "cantidad", "cantidades",
            "precio", "precios", "coste", "costes", "costo", "costos"
        ]
        
        has_specific_doc = any(kw in s for kw in doc_keywords if kw not in ["documento", "documentos", "doc", "docs"])
        has_question = any(qw in s for qw in question_words)
        has_content_verb = any(verb in s for verb in content_verbs)
        has_payment_term = any(term in s for term in payment_terms)
        
        # QA requires: specific document + (content verb OR payment term)
        # OR: specific document + question about content (not just "qué documentos")
        if has_specific_doc and (has_content_verb or has_payment_term):
            return ("docs.qa", 0.90, "PropertyAgent")
        
        # Also QA if asking specific question about a specific document
        if has_specific_doc and has_question:
            # Make sure it's not a list request
            if not any(w in s for w in list_query_keywords):
                return ("docs.qa", 0.88, "PropertyAgent")
        
        # ========== EMAIL CONTINUATION ==========
        # Detect when user ONLY provides an email address (continuation of email flow)
        email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
        if re.search(email_pattern, s):
            words_in_message = s.split()
            if len(words_in_message) <= 5:
                logger.info(f"[active_router] 🎯 Detected email continuation: {s}")
                return ("docs.send_email", 0.95, "PropertyAgent")
        
        # Upload document - context-aware (must have document keyword)
        upload_doc_verbs = [
            "sube", "subir", "upload", "cargar", "carga", "adjunta", "adjuntar",
            "guarda", "guardar", "almacena", "almacenar"
        ]
        
        # Require explicit document keyword for "añade/agrega" to avoid confusion with property creation
        ambiguous_verbs = ["añade", "añadir", "agrega", "agregar", "anade", "anadir"]
        
        if any(verb in s for verb in upload_doc_verbs):
            # Not numbers (handled above)
            numbers_exclusions = ["r2b", "números", "numeros", "plantilla", "excel"]
            # Not properties
            property_exclusions = ["casa", "piso", "villa", "finca", "propiedad", "inmueble"]
            
            if not any(x in s for x in numbers_exclusions) and not any(x in s for x in property_exclusions):
                return ("docs.upload", 0.92, "PropertyAgent")
        
        # For ambiguous verbs (añade/agrega), require explicit document context
        if any(verb in s for verb in ambiguous_verbs):
            # Must have document keyword
            has_doc_keyword = any(doc in s for doc in doc_keywords)
            # Not numbers, not properties
            numbers_exclusions = ["r2b", "números", "numeros", "plantilla", "excel"]
            property_exclusions = ["casa", "piso", "villa", "finca", "propiedad", "inmueble", "terreno", "local"]
            
            if has_doc_keyword and not any(x in s for x in numbers_exclusions) and not any(x in s for x in property_exclusions):
                logger.info(f"[active_router] 📄 Detected docs.upload with document keyword")
                return ("docs.upload", 0.90, "PropertyAgent")
        
        # DELETE document - NEW: Must be before list operations
        # "borra el documento X", "elimina el documento X", "quita el documento X"
        delete_doc_verbs = [
            "borra", "borrar", "elimina", "eliminar", "quita", "quitar",
            "remueve", "remover", "delete", "remove", "suprime", "suprimir"
        ]
        if any(verb in s for verb in delete_doc_verbs):
            # Check if it's about a document (not property or numbers)
            has_doc_keyword = any(doc in s for doc in doc_keywords)
            has_doc_generic = any(kw in s for kw in ["documento", "archivo", "fichero", "file"])
            
            # Exclude property deletion
            property_keywords = ["propiedad", "casa", "piso", "villa", "finca", "inmueble", "property"]
            is_property_delete = any(pk in s for pk in property_keywords)
            
            # Exclude numbers deletion
            numbers_keywords = ["plantilla", "números", "numeros", "r2b", "excel", "tabla"]
            is_numbers_delete = any(nk in s for nk in numbers_keywords)
            
            if (has_doc_keyword or has_doc_generic) and not is_property_delete and not is_numbers_delete:
                logger.info(f"[active_router] 🗑️ Detected docs.delete: {s[:50]}")
                return ("docs.delete", 0.95, "PropertyAgent")
        
        # List missing/pending documents - expanded synonyms
        pending_keywords = [
            "faltan", "falta", "pendientes", "por subir", "sin subir",
            "que me quedan", "que faltan", "incompletos", "sin completar"
        ]
        if any(kw in s for kw in doc_list_keywords) and any(w in s for w in pending_keywords):
            return ("docs.list_pending", 0.88, "PropertyAgent")
        
        # List facturas - expanded synonyms
        factura_keywords = ["facturas", "factura", "recibos", "recibo", "tickets", "ticket"]
        factura_relation_keywords = [
            "asociadas", "asociados", "relacionadas", "relacionados",
            "vinculadas", "vinculados", "de", "del", "para"
        ]
        if any(kw in s for kw in factura_keywords) and any(rel in s for rel in factura_relation_keywords):
            return ("docs.list_facturas", 0.85, "PropertyAgent")
        
        # Focus documents mode - expanded
        docs_focus_keywords = ["documentos", "documents", "docs", "papeles", "archivos"]
        if s.strip() in docs_focus_keywords:
            return ("docs.focus", 0.85, "PropertyAgent")
        
        # ========== GENERAL/FALLBACK ==========
        # Help - expanded synonyms
        help_keywords = [
            "ayuda", "help", "qué puedes hacer", "que puedes hacer",
            "cómo funciona", "como funciona", "qué haces", "que haces",
            "para qué sirves", "para que sirves", "instrucciones",
            "cómo te uso", "como te uso", "tutorial", "guía", "guia",
            "no entiendo", "no sé", "no se", "explícame", "explicame"
        ]
        if any(word in s for word in help_keywords):
            return ("general.help", 0.75, "MainAgent")
        
        # Default fallback - let MainAgent handle complex queries
        return ("general.chat", 0.50, "MainAgent")
    
    async def predict_llm(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        LLM-based intent classification for ambiguous cases.
        
        Uses gpt-4o-mini to understand natural language variations.
        
        Args:
            user_text: User's message
            context: Optional context dict
        
        Returns:
            Tuple of (intent, confidence, target_agent)
        """
        llm = self._get_llm()
        if llm is None:
            logger.warning("[active_router] LLM not available, falling back to keywords")
            return ("general.chat", 0.50, "MainAgent")
        
        ctx = context or {}
        
        # Build intent list for prompt
        intent_list = "\n".join([
            f"- {intent}: {desc}" 
            for intent, desc in INTENT_DESCRIPTIONS.items()
        ])
        
        # Build prompt with context
        prompt = LLM_CLASSIFICATION_PROMPT.format(
            property_name=ctx.get("property_name", "ninguna"),
            num_uploaded=ctx.get("num_uploaded", 0),
            strategy=ctx.get("strategy", "no definida"),
            intent_list=intent_list,
            user_text=user_text
        )
        
        try:
            t0 = perf_counter()
            response = await llm.ainvoke(prompt)
            latency_ms = int((perf_counter() - t0) * 1000)
            
            # Extract intent from response
            predicted_intent = response.content.strip().lower()
            
            # Validate intent exists
            if predicted_intent not in INTENT_DESCRIPTIONS:
                # Try to find closest match
                for valid_intent in INTENT_DESCRIPTIONS.keys():
                    if valid_intent in predicted_intent or predicted_intent in valid_intent:
                        predicted_intent = valid_intent
                        break
                else:
                    logger.warning(f"[active_router] LLM returned invalid intent: {predicted_intent}")
                    return ("general.chat", 0.60, "MainAgent")
            
            # Determine target agent from intent
            if predicted_intent.startswith("property."):
                target_agent = "PropertyAgent"
            elif predicted_intent.startswith("docs."):
                target_agent = "PropertyAgent"
            else:
                target_agent = "MainAgent"
            
            logger.info(
                f"[active_router] 🤖 LLM classified '{user_text[:30]}...' -> "
                f"{predicted_intent} ({target_agent}) in {latency_ms}ms"
            )
            
            # LLM classifications get 0.85 confidence (high but not absolute)
            return (predicted_intent, 0.85, target_agent)
            
        except Exception as e:
            logger.error(f"[active_router] LLM classification failed: {e}")
            return ("general.chat", 0.50, "MainAgent")
    
    def predict(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        Hybrid intent prediction: keywords first, LLM fallback if needed.
        
        This is the SYNCHRONOUS version for backwards compatibility.
        For async code, use predict_async() instead.
        
        Args:
            user_text: User's message
            context: Optional context dict
        
        Returns:
            Tuple of (intent, confidence, target_agent)
        """
        # Always try keywords first (fast path)
        intent, confidence, target_agent = self.predict_keywords(user_text, context)
        
        # If confidence is high enough, return immediately
        if confidence >= LLM_FALLBACK_THRESHOLD:
            return (intent, confidence, target_agent)
        
        # For sync code, we can't use LLM fallback - just return keywords result
        logger.debug(
            f"[active_router] Low confidence ({confidence:.2f}), "
            f"but sync mode - returning keywords result"
        )
        return (intent, confidence, target_agent)
    
    async def predict_async(self, user_text: str, context: Optional[Dict] = None) -> Tuple[str, float, str]:
        """
        Hybrid intent prediction with LLM fallback (async version).
        
        1. Try fast keyword-based classification
        2. If confidence < 0.70, use LLM for better understanding
        
        Args:
            user_text: User's message
            context: Optional context dict
        
        Returns:
            Tuple of (intent, confidence, target_agent)
        """
        # Always try keywords first (fast path)
        intent, confidence, target_agent = self.predict_keywords(user_text, context)
        
        # If confidence is high enough, return immediately
        if confidence >= LLM_FALLBACK_THRESHOLD:
            logger.debug(f"[active_router] Keywords confident ({confidence:.2f}), skipping LLM")
            return (intent, confidence, target_agent)
        
        # Low confidence - use LLM fallback
        logger.info(
            f"[active_router] Keywords low confidence ({confidence:.2f}), "
            f"trying LLM fallback for: '{user_text[:40]}...'"
        )
        
        llm_intent, llm_confidence, llm_agent = await self.predict_llm(user_text, context)
        
        # If LLM gives better confidence, use it
        if llm_confidence > confidence:
            logger.info(
                f"[active_router] LLM improved: {intent} ({confidence:.2f}) -> "
                f"{llm_intent} ({llm_confidence:.2f})"
            )
            return (llm_intent, llm_confidence, llm_agent)
        
        # Otherwise stick with keywords
        return (intent, confidence, target_agent)
    
    async def decide(self, user_text: str, context: Optional[Dict] = None) -> Dict:
        """
        Decide which agent to route to using hybrid classification.
        
        Uses keywords first, then LLM fallback for ambiguous cases.
        
        Args:
            user_text: User's message
            context: Optional context dict
        
        Returns:
            Dict with intent, confidence, target_agent, latency_ms, and classification_method
        """
        t0 = perf_counter()
        
        # Use async hybrid prediction (keywords + LLM fallback)
        intent, confidence, target_agent = await self.predict_async(user_text, context or {})
        
        latency_ms = int((perf_counter() - t0) * 1000)
        
        # Determine if LLM was used (latency > 50ms suggests LLM call)
        classification_method = "llm" if latency_ms > 50 else "keywords"
        
        decision = {
            "intent": intent,
            "confidence": confidence,
            "target_agent": target_agent,
            "latency_ms": latency_ms,
            "classification_method": classification_method,
            "fallback_reason": None
        }
        
        # Check if confidence is too low for specialized agent
        if target_agent != "MainAgent":
            agent_category = intent.split(".")[0]  # e.g., "property", "numbers", "docs"
            threshold = CONFIDENCE_THRESHOLDS.get(agent_category, 0.8)
            
            if confidence < threshold:
                logger.warning(
                    f"[active_router] Confidence {confidence:.2f} < threshold {threshold} "
                    f"for {agent_category}, falling back to MainAgent"
                )
                decision["target_agent"] = "MainAgent"
                decision["fallback_reason"] = f"low_confidence ({confidence:.2f} < {threshold})"
        
        logger.info(
            f"[active_router] '{user_text[:40]}...' -> "
            f"intent={intent}, conf={confidence:.2f}, agent={decision['target_agent']}, "
            f"method={classification_method}, latency={latency_ms}ms"
        )
        
        return decision
