"""
MANINOS AI - Intelligent Router (Context-Aware, Data-Driven)

Based on Developer Bible principles:
1. DATA-DRIVEN, NOT KEYWORD-DRIVEN
2. DATABASE AS SOURCE OF TRUTH
3. CONTEXT-AWARE INTENT DETECTION

This router determines which agent to use based on:
1. Current session state (what process is the user in?)
2. Database state (what data exists for client/property?)
3. User intent (what does the user want to do?)
"""

import re
import logging
from typing import Dict, Any, Optional, Tuple, List
from datetime import datetime

logger = logging.getLogger(__name__)


# =============================================================================
# PROCESS STAGES AND TRANSITIONS (from Cadena de Valor)
# =============================================================================

PROCESS_STAGES = {
    # =========================================================================
    # COMERCIALIZAR - Proceso TRANSVERSAL
    # NO tiene conexiones directas obligatorias
    # Puede inyectar leads/clientes en cualquier momento
    # =========================================================================
    "COMERCIALIZAR": {
        "stages": ["lead_registered", "visit_scheduled", "material_sent", "converted"],
        "entry_point": True,  # Transversal - can be entered at any time
        "transversal": True,  # Special flag: not part of linear flow
        "next_processes": [],  # No direct connections (transversal)
        "previous_processes": [],
    },
    
    # =========================================================================
    # FLUJO LINEAL PRINCIPAL: Adquirir → Incorporar → Gestionar → Entregar
    # =========================================================================
    "ADQUIRIR": {
        "stages": ["sourcing", "evaluacion", "negociacion", "cierre_compra"],
        "entry_point": True,  # Can start here (with capital from FONDEAR)
        "next_processes": ["INCORPORAR"],  # → Incorporar
        "previous_processes": ["FONDEAR"],  # ← Fondear (capital)
    },
    "INCORPORAR": {
        "stages": ["datos_basicos", "kyc_pending", "kyc_verified", "dti_calculated", "contract_pending", "contract_signed"],
        "entry_point": False,  # Needs property from ADQUIRIR first
        "next_processes": ["GESTIONAR_CARTERA"],  # → Gestionar Cartera
        "previous_processes": ["ADQUIRIR", "ENTREGAR"],  # ← Adquirir, ← Entregar (referidos)
    },
    "GESTIONAR_CARTERA": {
        "stages": ["active", "payment_pending", "payment_received", "delinquent"],
        "entry_point": False,
        "next_processes": ["ENTREGAR", "FONDEAR"],  # → Entregar (pagos completos), → Fondear (pagos)
        "previous_processes": ["INCORPORAR"],  # ← Incorporar
    },
    "ENTREGAR": {
        "stages": ["pending_delivery", "delivered", "title_transferred"],
        "entry_point": False,
        "next_processes": ["INCORPORAR"],  # → Incorporar (referidos vuelven)
        "previous_processes": ["GESTIONAR_CARTERA"],  # ← Gestionar Cartera
    },
    
    # =========================================================================
    # FONDEAR - Base del sistema (Capital/Inversionistas)
    # Financia adquisiciones y recibe pagos de la cartera
    # =========================================================================
    "FONDEAR": {
        "stages": ["investor_registered", "capital_committed", "disbursed"],
        "entry_point": True,  # Investors can enter directly
        "next_processes": ["ADQUIRIR"],  # → Adquirir (capital para comprar)
        "previous_processes": ["GESTIONAR_CARTERA"],  # ← Gestionar Cartera (pagos)
    },
}

# Agent mapping
PROCESS_TO_AGENT = {
    "COMERCIALIZAR": "ComercializarAgent",
    "ADQUIRIR": "AdquirirAgent",
    "INCORPORAR": "IncorporarAgent",
    "FONDEAR": "FondearAgent",
    "GESTIONAR_CARTERA": "GestionarCarteraAgent",
    "ENTREGAR": "EntregarAgent",
}


class IntelligentRouter:
    """
    Context-aware router that determines the appropriate agent based on:
    1. Session context (current process/stage)
    2. Database state (client/property data)
    3. User intent (inferred from message + context)
    
    Philosophy: DATA-DRIVEN, NOT KEYWORD-DRIVEN
    """
    
    def __init__(self, supabase_client):
        self.sb = supabase_client
        self._session_cache = {}
    
    # =========================================================================
    # MAIN ROUTING METHOD
    # =========================================================================
    
    def route(
        self, 
        user_input: str, 
        session_id: str,
        context: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Main routing method. Returns routing decision with full context.
        
        Returns:
            {
                "agent": "AgentName",
                "process": "PROCESS_NAME",
                "confidence": 0.0-1.0,
                "reason": "Why this agent was chosen",
                "context": {
                    "current_stage": "stage_name",
                    "missing_data": [...],
                    "next_step_guidance": "What to do next",
                    "entity_id": "client_id or property_id if relevant"
                }
            }
        """
        context = context or {}
        
        # Step 1: Get session state from database
        session_state = self._get_session_state(session_id)
        
        # Step 2: Check if user is in an active process
        if session_state.get("active_process"):
            # User is already in a process - check if they want to continue or switch
            routing = self._route_within_process(user_input, session_state, context)
            if routing["confidence"] > 0.6:
                return routing
        
        # Step 3: Detect entity references (client, property)
        entity_context = self._detect_entity_context(user_input, session_id)
        
        # Step 4: If entity found, route based on entity state
        if entity_context.get("entity_type"):
            routing = self._route_by_entity_state(user_input, entity_context, context)
            if routing["confidence"] > 0.5:
                return routing
        
        # Step 5: Detect intent from message content (fallback)
        routing = self._route_by_intent(user_input, context)
        
        # Step 6: Update session state
        self._update_session_state(session_id, routing)
        
        return routing
    
    # =========================================================================
    # SESSION STATE MANAGEMENT
    # =========================================================================
    
    def _get_session_state(self, session_id: str) -> Dict:
        """Get current session state from database or cache."""
        try:
            result = self.sb.table("sessions").select("*").eq("session_id", session_id).limit(1).execute()
            if result.data:
                return result.data[0].get("state", {})
        except Exception as e:
            logger.warning(f"[IntelligentRouter] Could not get session state: {e}")
        return {}
    
    def _update_session_state(self, session_id: str, routing: Dict):
        """Update session state with current routing decision."""
        try:
            state = {
                "active_process": routing.get("process"),
                "active_agent": routing.get("agent"),
                "entity_id": routing.get("context", {}).get("entity_id"),
                "last_updated": datetime.now().isoformat()
            }
            
            self.sb.table("sessions").upsert({
                "session_id": session_id,
                "state": state,
                "updated_at": datetime.now().isoformat()
            }, on_conflict="session_id").execute()
        except Exception as e:
            logger.warning(f"[IntelligentRouter] Could not update session state: {e}")
    
    # =========================================================================
    # ROUTING WITHIN AN ACTIVE PROCESS
    # =========================================================================
    
    def _route_within_process(
        self, 
        user_input: str, 
        session_state: Dict,
        context: Dict
    ) -> Dict[str, Any]:
        """
        Route user within their current active process.
        Check if they want to continue or explicitly switch.
        """
        current_process = session_state.get("active_process")
        current_agent = session_state.get("active_agent")
        entity_id = session_state.get("entity_id")
        
        # Check for explicit process switch requests
        switch_intent = self._detect_process_switch(user_input)
        if switch_intent:
            return switch_intent
        
        # Check for completion signals
        if self._is_completion_signal(user_input):
            # User might be done with current step - validate data
            validation = self._validate_process_state(current_process, entity_id)
            
            if validation["is_complete"]:
                # Advance to next stage or process
                next_step = self._get_next_step(current_process, validation["current_stage"])
                return {
                    "agent": current_agent,
                    "process": current_process,
                    "confidence": 0.9,
                    "reason": f"User completed stage, advancing to: {next_step['stage']}",
                    "context": {
                        "current_stage": validation["current_stage"],
                        "next_stage": next_step["stage"],
                        "next_step_guidance": next_step["guidance"],
                        "entity_id": entity_id
                    }
                }
            else:
                # Not complete - ask for missing data
                return {
                    "agent": current_agent,
                    "process": current_process,
                    "confidence": 0.85,
                    "reason": f"User signaled completion but data is missing",
                    "context": {
                        "current_stage": validation["current_stage"],
                        "missing_data": validation["missing_data"],
                        "next_step_guidance": f"Falta información: {', '.join(validation['missing_data'])}",
                        "entity_id": entity_id
                    }
                }
        
        # Default: continue with current process
        return {
            "agent": current_agent,
            "process": current_process,
            "confidence": 0.7,
            "reason": "Continuing with active process",
            "context": {
                "entity_id": entity_id
            }
        }
    
    def _detect_process_switch(self, user_input: str) -> Optional[Dict]:
        """Detect if user wants to explicitly switch to a different process."""
        input_lower = user_input.lower()
        
        # Explicit switch patterns
        switch_patterns = {
            "COMERCIALIZAR": ["cambiar a comercializar", "ir a marketing", "volver a leads"],
            "ADQUIRIR": ["cambiar a adquirir", "buscar propiedades", "nueva propiedad"],
            "INCORPORAR": ["cambiar a incorporar", "registrar cliente", "nuevo cliente"],
            "FONDEAR": ["cambiar a fondear", "ver inversionistas", "capital"],
            "GESTIONAR_CARTERA": ["cambiar a gestionar", "ver cartera", "pagos"],
            "ENTREGAR": ["cambiar a entregar", "entrega de propiedad", "transferir título"],
        }
        
        for process, patterns in switch_patterns.items():
            if any(pattern in input_lower for pattern in patterns):
                return {
                    "agent": PROCESS_TO_AGENT[process],
                    "process": process,
                    "confidence": 0.95,
                    "reason": f"User explicitly requested switch to {process}",
                    "context": {}
                }
        
        return None
    
    def _is_completion_signal(self, user_input: str) -> bool:
        """Check if user is signaling task completion."""
        completion_phrases = [
            "listo", "done", "terminé", "terminado", "completado",
            "ya está", "siguiente", "next", "continuar", "adelante",
            "proceder", "avanzar", "sí", "si", "yes", "ok"
        ]
        input_lower = user_input.lower().strip()
        return any(phrase in input_lower for phrase in completion_phrases)
    
    # =========================================================================
    # ROUTING BY ENTITY STATE (DATA-DRIVEN)
    # =========================================================================
    
    def _detect_entity_context(self, user_input: str, session_id: str) -> Dict:
        """
        Detect if user is referring to a specific client or property.
        This is DATA-DRIVEN - we check the database.
        """
        context = {}
        
        # Check for email pattern (likely client reference)
        email_pattern = r'[\w\.-]+@[\w\.-]+\.\w+'
        emails = re.findall(email_pattern, user_input)
        if emails:
            client = self._find_client_by_email(emails[0])
            if client:
                context["entity_type"] = "client"
                context["entity_id"] = client["id"]
                context["entity_data"] = client
                return context
        
        # Check for name patterns (might be client)
        # Only if followed by client-related context words
        if any(word in user_input.lower() for word in ["cliente", "registrar", "perfil", "kyc", "dti"]):
            # Try to extract a name
            name_match = self._extract_name_from_input(user_input)
            if name_match:
                client = self._find_client_by_name(name_match)
                if client:
                    context["entity_type"] = "client"
                    context["entity_id"] = client["id"]
                    context["entity_data"] = client
                    return context
        
        # Check for address pattern (likely property reference)
        address_keywords = ["calle", "ave", "street", "st", "road", "rd", "blvd", "drive", "dr"]
        if any(kw in user_input.lower() for kw in address_keywords):
            property_data = self._find_property_by_address(user_input)
            if property_data:
                context["entity_type"] = "property"
                context["entity_id"] = property_data["id"]
                context["entity_data"] = property_data
                return context
        
        return context
    
    def _route_by_entity_state(
        self, 
        user_input: str, 
        entity_context: Dict,
        context: Dict
    ) -> Dict[str, Any]:
        """
        Route based on the current state of a referenced entity.
        This is the DATA-DRIVEN approach from Developer Bible.
        """
        entity_type = entity_context["entity_type"]
        entity_data = entity_context["entity_data"]
        entity_id = entity_context["entity_id"]
        
        if entity_type == "client":
            return self._route_by_client_state(user_input, entity_data, entity_id)
        elif entity_type == "property":
            return self._route_by_property_state(user_input, entity_data, entity_id)
        
        return {"confidence": 0}
    
    def _route_by_client_state(
        self, 
        user_input: str, 
        client_data: Dict,
        client_id: str
    ) -> Dict[str, Any]:
        """
        Route based on client's current process stage.
        DATABASE IS SOURCE OF TRUTH.
        """
        process_stage = client_data.get("process_stage", "datos_basicos")
        kyc_status = client_data.get("kyc_status", "pending")
        
        # Determine what's missing based on stage
        missing_data = []
        next_guidance = ""
        
        if process_stage == "datos_basicos":
            # Check what profile data is missing
            required_fields = ["full_name", "email", "phone", "ssn_itin", "monthly_income"]
            missing_data = [f for f in required_fields if not client_data.get(f)]
            
            if missing_data:
                next_guidance = f"Completa el perfil del cliente. Falta: {', '.join(missing_data)}"
            else:
                next_guidance = "Perfil completo. Siguiente paso: Iniciar verificación KYC"
                
        elif process_stage in ["kyc_pending", "kyc_verified"]:
            if kyc_status == "pending":
                next_guidance = "Verificación KYC pendiente. Inicia la verificación con Stripe Identity."
            elif kyc_status == "processing":
                next_guidance = "KYC en proceso. Espera confirmación o verifica el estado."
            elif kyc_status == "verified":
                next_guidance = "KYC verificado ✅. Siguiente paso: Calcular DTI"
                
        elif process_stage == "dti_calculated":
            next_guidance = "DTI calculado. Siguiente paso: Generar contrato RTO"
            
        elif process_stage == "contract_pending":
            next_guidance = "Contrato pendiente de firma. Genera el contrato RTO."
            
        elif process_stage == "contract_signed":
            next_guidance = "Cliente incorporado completamente ✅. Pasa a Gestionar Cartera."
        
        return {
            "agent": "IncorporarAgent",
            "process": "INCORPORAR",
            "confidence": 0.85,
            "reason": f"Client found in stage: {process_stage}",
            "context": {
                "current_stage": process_stage,
                "missing_data": missing_data,
                "next_step_guidance": next_guidance,
                "entity_id": client_id,
                "entity_type": "client"
            }
        }
    
    def _route_by_property_state(
        self, 
        user_input: str, 
        property_data: Dict,
        property_id: str
    ) -> Dict[str, Any]:
        """
        Route based on property's current acquisition stage.
        DATABASE IS SOURCE OF TRUTH.
        """
        acquisition_stage = property_data.get("acquisition_stage", "sourcing")
        inventory_status = property_data.get("inventory_status", "potential")
        
        missing_data = []
        next_guidance = ""
        
        if acquisition_stage == "sourcing":
            next_guidance = "Propiedad en sourcing. Evalúa con el checklist de 26 puntos."
            
        elif acquisition_stage == "evaluacion":
            # Check what evaluation data is missing
            required = ["market_value", "asking_price", "repair_estimate"]
            missing_data = [f for f in required if not property_data.get(f)]
            
            if missing_data:
                next_guidance = f"Completa evaluación. Falta: {', '.join(missing_data)}"
            else:
                next_guidance = "Evaluación completa. Calcula oferta de adquisición."
                
        elif acquisition_stage == "negociacion":
            next_guidance = "En negociación. Registra el resultado de la oferta."
            
        elif acquisition_stage == "cierre_compra":
            next_guidance = "Cierre de compra. Confirma documentos y pago."
        
        return {
            "agent": "AdquirirAgent",
            "process": "ADQUIRIR",
            "confidence": 0.85,
            "reason": f"Property found in stage: {acquisition_stage}",
            "context": {
                "current_stage": acquisition_stage,
                "missing_data": missing_data,
                "next_step_guidance": next_guidance,
                "entity_id": property_id,
                "entity_type": "property"
            }
        }
    
    # =========================================================================
    # INTENT-BASED ROUTING WITH LLM (FALLBACK)
    # Developer Bible compliant: NOT keyword-based, uses LLM for understanding
    # =========================================================================
    
    def _route_by_intent(self, user_input: str, context: Dict) -> Dict[str, Any]:
        """
        Fallback routing using LLM for intent classification.
        Used when no entity context or session state is available.
        
        Developer Bible compliant:
        - NOT keyword-based
        - Uses LLM to understand semantic meaning
        - Provides reasoning for the decision
        """
        try:
            # Use LLM to classify intent
            classification = self._classify_intent_with_llm(user_input)
            
            process = classification.get("process", "INCORPORAR")
            confidence = classification.get("confidence", 0.7)
            reasoning = classification.get("reasoning", "LLM classification")
            
            agent = PROCESS_TO_AGENT.get(process, "IncorporarAgent")
            
            logger.info(f"[IntelligentRouter] LLM classified '{user_input[:50]}...' as {process} ({confidence})")
            
            return {
                "agent": agent,
                "process": process,
                "confidence": confidence,
                "reason": f"LLM classification: {reasoning}",
                "context": {
                    "routing_method": "llm_classification"
                }
            }
            
        except Exception as e:
            logger.error(f"[IntelligentRouter] LLM classification failed: {e}")
            # Ultimate fallback: default to INCORPORAR (most common entry point)
            return {
                "agent": "IncorporarAgent",
                "process": "INCORPORAR",
                "confidence": 0.3,
                "reason": f"Default fallback (LLM error: {str(e)[:50]})",
                "context": {
                    "routing_method": "error_fallback"
                }
            }
    
    def _classify_intent_with_llm(self, user_input: str) -> Dict[str, Any]:
        """
        Use LLM to classify user intent into one of the 6 macroprocesses.
        
        This is the Developer Bible-compliant approach:
        - Semantic understanding, not keyword matching
        - Context-aware classification
        - Provides confidence and reasoning
        """
        from langchain_openai import ChatOpenAI
        import json
        
        llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)
        
        classification_prompt = f"""Eres un clasificador de intenciones para Maninos Capital LLC, una empresa de rent-to-own de mobile homes en Texas.

Clasifica el siguiente mensaje del usuario en UNO de estos 6 procesos:

1. **ADQUIRIR** - Buscar, evaluar, inspeccionar o registrar PROPIEDADES para comprar
   - Ejemplos: buscar casas, evaluar propiedad, calcular oferta, regla del 70%, inspección, registrar en inventario
   
2. **INCORPORAR** - Todo lo relacionado con CLIENTES: registro, KYC, DTI, contratos RTO, referidos
   - Ejemplos: registrar cliente, verificar identidad, calcular DTI, generar contrato, código de referido
   
3. **COMERCIALIZAR** - Marketing, promoción, evaluación de crédito, formalizar ventas, administrar cartera, fidelización
   - Ejemplos: promover propiedad, evaluar riesgo crediticio, formalizar venta, clasificar cartera, transferir título

4. **FONDEAR** - Gestión de INVERSIONISTAS y capital (Semana 2 - no disponible aún)
   - Ejemplos: registrar inversionista, capital, rendimientos

5. **GESTIONAR_CARTERA** - Gestión de PAGOS y cobranza (Semana 2 - no disponible aún)
   - Ejemplos: pagos, cobros, morosidad

6. **ENTREGAR** - Cierre de venta y entrega de propiedad (Semana 2 - no disponible aún)
   - Ejemplos: entregar propiedad, transferir título final

---

Mensaje del usuario: "{user_input}"

---

Responde SOLO con un JSON válido (sin markdown):
{{"process": "NOMBRE_PROCESO", "confidence": 0.0-1.0, "reasoning": "breve explicación"}}

Ejemplos de respuesta:
{{"process": "ADQUIRIR", "confidence": 0.95, "reasoning": "Usuario quiere buscar propiedades en Houston"}}
{{"process": "INCORPORAR", "confidence": 0.9, "reasoning": "Usuario quiere registrar un nuevo cliente"}}
"""
        
        response = llm.invoke(classification_prompt)
        content = response.content.strip()
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if content.startswith("```"):
                content = content.split("```")[1]
                if content.startswith("json"):
                    content = content[4:]
            content = content.strip()
            
            result = json.loads(content)
            
            # Validate process name
            valid_processes = ["ADQUIRIR", "INCORPORAR", "COMERCIALIZAR", "FONDEAR", "GESTIONAR_CARTERA", "ENTREGAR"]
            if result.get("process") not in valid_processes:
                result["process"] = "INCORPORAR"
                result["confidence"] = 0.5
            
            return result
            
        except json.JSONDecodeError as e:
            logger.warning(f"[IntelligentRouter] Could not parse LLM response: {content}")
            # Extract process name from text if JSON parsing fails
            for proc in ["ADQUIRIR", "INCORPORAR", "COMERCIALIZAR", "FONDEAR", "GESTIONAR_CARTERA", "ENTREGAR"]:
                if proc in content.upper():
                    return {"process": proc, "confidence": 0.6, "reasoning": "Extracted from LLM text"}
            
            return {"process": "INCORPORAR", "confidence": 0.4, "reasoning": "Could not parse LLM response"}
    
    # =========================================================================
    # HELPER METHODS - DATABASE LOOKUPS
    # =========================================================================
    
    def _find_client_by_email(self, email: str) -> Optional[Dict]:
        """Find client by email in database."""
        try:
            result = self.sb.table("clients").select("*").eq("email", email).limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.warning(f"[IntelligentRouter] Error finding client by email: {e}")
            return None
    
    def _find_client_by_name(self, name: str) -> Optional[Dict]:
        """Find client by name (partial match)."""
        try:
            result = self.sb.table("clients").select("*").ilike("full_name", f"%{name}%").limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.warning(f"[IntelligentRouter] Error finding client by name: {e}")
            return None
    
    def _find_property_by_address(self, address_fragment: str) -> Optional[Dict]:
        """Find property by address (partial match)."""
        try:
            result = self.sb.table("properties").select("*").ilike("address", f"%{address_fragment}%").limit(1).execute()
            return result.data[0] if result.data else None
        except Exception as e:
            logger.warning(f"[IntelligentRouter] Error finding property by address: {e}")
            return None
    
    def _extract_name_from_input(self, user_input: str) -> Optional[str]:
        """Extract potential name from user input."""
        # Pattern: "registrar cliente Juan Pérez" or "cliente: Juan Pérez"
        patterns = [
            r"cliente[:\s]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)",
            r"registrar\s+(?:a\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)",
            r"([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+),?\s+(?:email|correo|teléfono)",
        ]
        
        for pattern in patterns:
            match = re.search(pattern, user_input)
            if match:
                return match.group(1)
        
        return None
    
    def _validate_process_state(self, process: str, entity_id: Optional[str]) -> Dict:
        """Validate the current state of a process."""
        # This would be expanded based on each process's requirements
        return {
            "is_complete": False,
            "current_stage": "unknown",
            "missing_data": []
        }
    
    def _get_next_step(self, process: str, current_stage: str) -> Dict:
        """Get the next step in a process."""
        # This would be expanded with full stage transition logic
        return {
            "stage": "next_stage",
            "guidance": "Proceed to the next step"
        }


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def create_intelligent_router(supabase_client) -> IntelligentRouter:
    """Factory function to create an IntelligentRouter instance."""
    return IntelligentRouter(supabase_client)

