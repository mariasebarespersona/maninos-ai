"""
Flow Validator - Validates MANINOS acquisition flow progress.

This module understands the natural flow of mobile home acquisition
and validates that each step is completed before advancing.

NO keyword matching - just data validation and logical flow.
"""

import logging
from typing import Dict, Any, Optional, Tuple

logger = logging.getLogger("flow_validator")


class ManinosFlowValidator:
    """
    Validates MANINOS acquisition flow and determines next steps.
    
    Core principle: Let data speak, not keywords.
    """
    
    def __init__(self):
        """Initialize flow validator."""
        self.flow_steps = {
            "documents_pending": {
                "name": "Paso 0: Recopilación de Documentos",
                "required_data": [],  # Validated by document count
                "next_stage": "initial",
                "agent": "PropertyAgent"  # PropertyAgent now handles documents too
            },
            "initial": {
                "name": "Paso 1: 70% Rule Check",
                "required_data": ["asking_price", "market_value"],
                "next_stage": "passed_70_rule",  # or "review_required" or "rejected"
                "agent": "PropertyAgent"
            },
            "review_required": {
                "name": "⚠️ Paso 1b: Revisión Humana Requerida (70% Rule Failed)",
                "required_data": [],  # No new data needed - needs human justification
                "next_stage": "passed_70_rule",  # Can advance after justification
                "agent": "PropertyAgent"
            },
            "passed_70_rule": {
                "name": "Paso 2: Inspección",
                "required_data": ["repair_estimate", "title_status"],
                "next_stage": "inspection_done",  # or "review_required_title" if title problematic
                "agent": "PropertyAgent"
            },
            "review_required_title": {
                "name": "⚠️ Paso 2b: Revisión de Título Requerida (Missing/Lien)",
                "required_data": [],  # No new data needed - needs action plan
                "next_stage": "inspection_done",  # Can advance after plan
                "agent": "PropertyAgent"
            },
            "inspection_done": {
                "name": "Paso 3: 80% ARV Rule",
                "required_data": ["arv"],
                "next_stage": "passed_80_rule",  # or "review_required_80" if 80% fails
                "agent": "PropertyAgent"
            },
            "review_required_80": {
                "name": "⚠️ Paso 4b: Revisión Final Requerida (80% Rule Failed)",
                "required_data": [],  # No new data needed - needs justification or rejection
                "next_stage": "passed_80_rule",  # Can advance after justification, or → rejected
                "agent": "PropertyAgent"
            },
            "passed_80_rule": {
                "name": "Paso 4: Revisión Final y Contrato",
                "required_data": [],  # All data already present
                "next_stage": "contract_generated",
                "agent": "PropertyAgent"
            },
            "rejected": {
                "name": "Propiedad Rechazada",
                "required_data": [],
                "next_stage": None,
                "agent": None
            }
        }
    
    def validate_current_step(self, property_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Validate if current step is complete and determine what's needed.
        
        Args:
            property_data: Property data from database
        
        Returns:
            Dict with:
            - is_complete: bool
            - missing_data: List[str]
            - current_step: str
            - next_step: str
            - recommended_agent: str
        """
        stage = property_data.get("acquisition_stage", "documents_pending")
        step_info = self.flow_steps.get(stage, {})
        
        if not step_info:
            logger.warning(f"[flow_validator] Unknown stage: {stage}")
            return {
                "is_complete": False,
                "missing_data": ["unknown_stage"],
                "current_step": "unknown",
                "next_step": None,
                "recommended_agent": "PropertyAgent"
            }
        
        # Check required data
        missing_data = []
        for field in step_info.get("required_data", []):
            value = property_data.get(field)
            # 0 is a valid value for repair_estimate
            if value is None:
                missing_data.append(field)
        
        # Special case: documents_pending - check document count
        if stage == "documents_pending":
            # This is handled by DocsAgent's post-processing
            # Just return that we need documents
            missing_data = []  # DocsAgent will handle this
        
        is_complete = len(missing_data) == 0
        
        result = {
            "is_complete": is_complete,
            "missing_data": missing_data,
            "current_step": step_info["name"],
            "next_step": step_info.get("next_stage"),
            "recommended_agent": step_info.get("agent")
        }
        
        logger.info(f"[flow_validator] Stage '{stage}': {'COMPLETE' if is_complete else 'INCOMPLETE'}")
        if not is_complete:
            logger.info(f"[flow_validator] Missing data: {missing_data}")
        
        return result
    
    def get_user_friendly_next_step(self, property_data: Dict[str, Any]) -> str:
        """
        Get a natural language description of what the user needs to do next.
        
        Args:
            property_data: Property data from database
        
        Returns:
            User-friendly string describing next action
        """
        stage = property_data.get("acquisition_stage", "documents_pending")
        validation = self.validate_current_step(property_data)
        
        if stage == "documents_pending":
            return "Sube los 3 documentos obligatorios: Title Status, Property Listing y Property Photos."
        
        elif stage == "initial":
            if not validation["is_complete"]:
                missing = validation["missing_data"]
                if "asking_price" in missing and "market_value" in missing:
                    return "Proporciona el **precio de venta** (asking price) y el **valor de mercado** (market value) para calcular la regla del 70%."
                elif "asking_price" in missing:
                    return "¿Cuál es el **precio de venta** (asking price)?"
                elif "market_value" in missing:
                    return "¿Cuál es el **valor de mercado** (market value)?"
            else:
                return "Calculando regla del 70%..."
        
        elif stage == "passed_70_rule":
            if not validation["is_complete"]:
                return "Completa el **checklist de inspección** interactivo para registrar defectos y estado del título."
            else:
                return "Inspección completada. Procediendo al cálculo del 80% ARV Rule..."
        
        elif stage == "inspection_done":
            if not validation["is_complete"]:
                missing = validation["missing_data"]
                if "arv" in missing:
                    return "¿Cuál es el **ARV** (After Repair Value) - el valor de la propiedad después de las reparaciones?"
            else:
                return "Calculando regla del 80%..."
        
        elif stage == "passed_80_rule":
            return "La propiedad cumple con ambas reglas. ¿Quieres generar el **contrato de compra**?"
        
        elif stage == "rejected":
            return "Esta propiedad fue rechazada. ¿Quieres evaluar otra propiedad?"
        
        return "Continúa con el flujo de evaluación."
    
    def should_advance_to_next_step(self, property_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Determine if we should automatically advance to next step.
        
        Args:
            property_data: Property data from database
        
        Returns:
            Tuple of (should_advance: bool, next_stage: Optional[str])
        """
        validation = self.validate_current_step(property_data)
        
        if validation["is_complete"] and validation["next_step"]:
            logger.info(f"[flow_validator] ✅ Step complete, ready to advance to: {validation['next_step']}")
            return (True, validation["next_step"])
        
        return (False, None)
    
    def detect_user_intent_for_stage(
        self, 
        user_input: str, 
        property_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Detect what the user is trying to do based on their input and current stage.
        
        This is CONTEXT-AWARE, not keyword matching.
        We interpret user input based on what data is missing in current stage.
        
        Args:
            user_input: User's message
            property_data: Property data from database
        
        Returns:
            Dict with:
            - intent: str (e.g., "provide_price", "confirm_next_step", "ask_question")
            - confidence: float
            - reason: str
        """
        stage = property_data.get("acquisition_stage", "documents_pending")
        validation = self.validate_current_step(property_data)
        user_lower = user_input.lower().strip()
        
        # Common "next step" questions
        next_step_phrases = ["siguiente", "qué sigue", "que sigue", "ahora qué", "ahora que", "siguiente paso", "next", "what's next"]
        is_asking_next = any(phrase in user_lower for phrase in next_step_phrases)
        
        if is_asking_next:
            return {
                "intent": "ask_next_step",
                "confidence": 0.95,
                "reason": "User is asking what to do next"
            }
        
        # Completion signals
        completion_phrases = ["listo", "ya está", "ya esta", "terminé", "termine", "completé", "complete", "done", "ready", "documentos subidos"]
        is_signaling_complete = any(phrase in user_lower for phrase in completion_phrases)
        
        if is_signaling_complete:
            return {
                "intent": "signal_complete",
                "confidence": 0.90,
                "reason": "User is signaling completion of current step"
            }
        
        # Based on current stage, interpret what they're providing
        if stage == "initial" and validation["missing_data"]:
            # User might be providing price information
            # Look for numbers (prices)
            import re
            numbers = re.findall(r'\$?[\d,]+\.?\d*', user_input)
            if numbers and len(numbers) >= 1:
                return {
                    "intent": "provide_price_data",
                    "confidence": 0.85,
                    "reason": f"User provided {len(numbers)} number(s), likely price/value data for 70% Rule"
                }
        
        elif stage == "inspection_done" and "arv" in validation["missing_data"]:
            # User might be providing ARV
            import re
            numbers = re.findall(r'\$?[\d,]+\.?\d*', user_input)
            if numbers:
                return {
                    "intent": "provide_arv",
                    "confidence": 0.85,
                    "reason": "User provided number, likely ARV for 80% Rule"
                }
        
        # Generic question
        if "?" in user_input:
            return {
                "intent": "ask_question",
                "confidence": 0.70,
                "reason": "User is asking a question"
            }
        
        # Default: general conversation
        return {
            "intent": "general_conversation",
            "confidence": 0.50,
            "reason": "Could not detect specific intent"
        }


# Global instance
_validator_instance = None

def get_flow_validator() -> ManinosFlowValidator:
    """Get global flow validator instance."""
    global _validator_instance
    if _validator_instance is None:
        _validator_instance = ManinosFlowValidator()
    return _validator_instance

