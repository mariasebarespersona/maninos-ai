"""
PropertyAgent (Acquisition Agent) - Specialized agent for Mobile Home acquisition.

Handles:
- Acquisition Flow (Submission -> Inspection -> Repair Calc -> Validation)
- Creating new properties
- Switching between properties
- Listing properties
"""

from typing import List
from .base_agent import BaseAgent
from tools.registry import (
    # Property tools
    add_property_tool,
    set_current_property_tool,
    list_properties_tool,
    delete_property_tool,
    find_property_tool,
    get_property_tool,
    update_property_fields_tool,
    # Financial tools
    calculate_repair_costs_tool,
    calculate_maninos_deal_tool,
    # Contract tools
    generate_buy_contract_tool,
    # Inspection tools
    get_inspection_checklist_tool,
    save_inspection_results_tool,
    # Document tools (from DocsAgent)
    upload_and_link_tool,
    list_docs_tool,
    delete_document_tool,
    signed_url_for_tool,
    send_email_tool,
    get_document_for_email_tool,  # NEW - Get document for email attachment
    # RAG tools for MANINOS (Fase 2)
    query_documents_tool,
    index_all_documents_maninos_tool,
    get_extracted_values_tool,  # Auto-extracted values from documents
)


class PropertyAgent(BaseAgent):
    """Agent specialized in Mobile Home Acquisition and Analysis."""
    
    def __init__(self):
        super().__init__(name="PropertyAgent", model="gpt-4o-mini", temperature=0.0)  # Use gpt-4o-mini to avoid rate limiting
    
    def get_system_prompt(self, intent: str = None, property_name: str = None, context: dict = None) -> str:
        """Get system prompt using modular prompt loader."""
        import sys
        import os
        
        # Add prompts directory to path
        prompts_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "prompts")
        if prompts_dir not in sys.path:
            sys.path.insert(0, prompts_dir)
        
        from prompt_loader import build_agent_prompt
        
        # Build base prompt from modular system
        base_prompt = build_agent_prompt("property_agent", intent)
        
        # Add property context if available
        property_context = ""
        if property_name:
            property_context = f"\n\n## 🎯 PROPIEDAD ACTUAL\n**Nombre**: {property_name}\n"
        else:
            property_context = "\n\n⚠️ No hay propiedad activa seleccionada. Pide al usuario los datos para comenzar.\n"
        
        # === CRITICAL: ADD FLOW VALIDATOR GUIDANCE ===
        # This gives the LLM EXPLICIT instructions from the flow validator
        # The flow validator analyzes current state and tells the agent exactly what to do next
        flow_guidance = ""
        if context:
            next_step = context.get("next_step_guidance")
            flow_validation = context.get("flow_validation")
            user_intent = context.get("user_intent_analysis")
            
            if next_step or flow_validation:
                flow_guidance = "\n\n" + "=" * 80 + "\n"
                flow_guidance += "## 🎯 FLOW VALIDATOR GUIDANCE - FOLLOW THIS EXACTLY\n"
                flow_guidance += "=" * 80 + "\n\n"
                
                if flow_validation:
                    flow_guidance += f"**Current Step**: {flow_validation.get('current_step', 'Unknown')}\n"
                    flow_guidance += f"**Status**: {'✅ Complete' if flow_validation.get('is_complete') else '⏳ Incomplete'}\n"
                    
                    missing_data = flow_validation.get('missing_data', [])
                    if missing_data:
                        flow_guidance += f"**Missing Data**: {', '.join(missing_data)}\n"
                    
                    flow_guidance += f"**Recommended Agent**: {flow_validation.get('recommended_agent', 'PropertyAgent')}\n\n"
                
                if user_intent:
                    flow_guidance += f"**User Intent Detected**: {user_intent.get('intent', 'unknown')}\n"
                    flow_guidance += f"**Intent Confidence**: {user_intent.get('confidence', 0):.2f}\n"
                    flow_guidance += f"**Reasoning**: {user_intent.get('reason', 'N/A')}\n\n"
                
                if next_step:
                    flow_guidance += "**🚨 MANDATORY ACTION**:\n"
                    flow_guidance += f"{next_step}\n\n"
                
                flow_guidance += "⚠️ **CRITICAL RULES**:\n"
                flow_guidance += "- You MUST follow the Flow Validator's guidance above\n"
                flow_guidance += "- Do NOT call tools that contradict the current step\n"
                flow_guidance += "- Do NOT show UI components (checklist, documents) that are already complete\n"
                flow_guidance += "- If repair_estimate > 0 exists, do NOT call get_inspection_checklist()\n"
                flow_guidance += "- If arv is missing and repair_estimate exists, ask for ARV\n"
                flow_guidance += "- ALWAYS call get_property(property_id) FIRST to validate current state\n"
                flow_guidance += "\n" + "=" * 80 + "\n\n"
        
        return base_prompt + property_context + flow_guidance
    
    # Modular prompt system now used - see prompts/agents/property_agent/_base.md
    
    def run(self, user_input: str, property_id: str = None, context: dict = None):
        """
        Override run to handle property operations.
        
        SIMPLIFIED: Most logic is now handled by the LLM via the prompt.
        We only intercept specific cases that need direct tool calls for better UX.
        """
        import logging
        logger = logging.getLogger(__name__)
        
        text_lower = user_input.lower().strip()
        ctx = context or {}
        
        # Check if user is providing property name/address (continuation of create flow)
        history = ctx.get("history", [])
        if history and len(history) >= 1:
            # Check if the last AI message was asking for property name/address
            last_ai_msg = None
            for msg in reversed(history):
                if hasattr(msg, 'content') and hasattr(msg, 'type') and msg.type == 'ai':
                    last_ai_msg = msg.content.lower() if msg.content else ""
                    break
            
            if last_ai_msg and any(phrase in last_ai_msg for phrase in [
                "nombre y la dirección", "nombre y dirección", 
                "proporciona el nombre", "proporciona nombre",
                "qué nombre", "que nombre", "cómo se llama", "como se llama"
            ]):
                # User is responding with property data - create the property directly
                logger.info(f"[PropertyAgent] 🎯 Detected property data response: '{user_input}'")
                
                name = user_input.strip()
                address = ""
                
                if " - " in user_input:
                    parts = user_input.split(" - ", 1)
                    name = parts[0].strip()
                    address = parts[1].strip() if len(parts) > 1 else ""
                elif ", " in user_input:
                    parts = user_input.split(", ", 1)
                    name = parts[0].strip()
                    address = parts[1].strip() if len(parts) > 1 else ""
                
                try:
                    result = add_property_tool.invoke({"name": name, "address": address})
                    logger.info(f"[PropertyAgent] ✅ Created property: {name} at {address}")
                    
                    new_property_id = result.get("id") or result.get("property_id")
                    
                    return {
                        "action": "complete",
                        "agent": self.name,
                        "response": f"✅ He creado la propiedad '{name}'" + (f" en {address}" if address else "") + ". Ahora, por favor proporciona el **Precio de Venta (Asking Price)** y el **Valor de Mercado** para la evaluación inicial.",
                        "tool_calls": [
                            {
                                "name": "add_property",
                                "args": {"name": name, "address": address},
                                "result": result
                            }
                        ],
                        "property_id": new_property_id,
                        "latency_ms": 0,
                        "success": True
                    }
                except Exception as e:
                    logger.error(f"[PropertyAgent] ❌ Error creating property: {e}")
                    return {
                        "action": "error",
                        "agent": self.name,
                        "response": f"Error al crear la propiedad: {str(e)}",
                        "error": str(e),
                        "latency_ms": 0,
                        "success": False
                    }
        
        # Check if user wants to switch to a property
        if any(phrase in text_lower for phrase in ["trabajar con", "cambiar a", "switch to", "usar", "metete", "meterse", "entra", "entrar", "abre", "abrir", "ve a", "ir a"]):
            logger.info(f"[PropertyAgent] 🎯 Detected property switch request: '{user_input}'")
            
            try:
                # List all properties and search by name
                all_properties = list_properties_tool.invoke({"limit": 50})
                
                # Extract property name from user input
                property_name_search = text_lower
                for phrase in ["trabajar con", "cambiar a", "switch to", "usar", "metete en", "metete", "meterse en", "meterse", "entra en", "entra", "entrar en", "entrar", "abre", "abrir", "ve a", "ir a", "la propiedad", "propiedad"]:
                    property_name_search = property_name_search.replace(phrase, "").strip()
                
                # Find matching property
                matching_prop = None
                for prop in all_properties:
                    if property_name_search in prop.get("name", "").lower():
                        matching_prop = prop
                        break
                
                if matching_prop:
                    prop_id = matching_prop["id"]
                    prop_name = matching_prop["name"]
                    set_result = set_current_property_tool.invoke({"property_id": prop_id})
                    
                    return {
                        "action": "complete",
                        "agent": self.name,
                        "response": f"✅ Ahora estás trabajando con '{prop_name}'. ¿En qué paso del análisis estás? (1. Envío, 2. Inspección, 3. Reparaciones, 4. Validación)",
                        "tool_calls": [
                            {
                                "name": "set_current_property",
                                "args": {"property_id": prop_id},
                                "result": set_result
                            }
                        ],
                        "property_id": prop_id,
                        "latency_ms": 0,
                        "success": True
                    }
                else:
                    return {
                        "action": "complete",
                        "agent": self.name,
                        "response": f"No encontré ninguna propiedad que coincida con '{user_input}'. ¿Quieres ver la lista de propiedades?",
                        "tool_calls": [],
                        "latency_ms": 0,
                        "success": True
                    }
            except Exception as e:
                logger.error(f"[PropertyAgent] ❌ Error switching property: {e}")
                return {
                    "action": "error",
                    "agent": self.name,
                    "response": f"Error al cambiar de propiedad: {str(e)}",
                    "error": str(e),
                    "latency_ms": 0,
                    "success": False
                }
        
        # Default: use parent's run method
        result = super().run(user_input, property_id, context)
        
        # POST-PROCESSING: Auto-update acquisition_stage if Paso 0 (documents) is complete
        # This ensures we never skip the document collection step
        if property_id:
            try:
                from tools.property_tools import get_property as _get_property, update_property_fields as _update_property_fields
                from tools.docs_tools import list_docs as _list_docs
                
                property_data = _get_property(property_id)
                full_context = context or {}
                
                # Only check if currently in documents_pending stage
                if property_data and property_data.get("acquisition_stage") == "documents_pending":
                    docs = _list_docs(property_id)
                    doc_types = {d.get("document_type") for d in docs if d.get("document_type")}
                    required_types = {"title_status", "property_listing", "property_photos"}
                    
                    if required_types.issubset(doc_types):
                        logger.info(f"[PropertyAgent] 🎯 AUTO-UPDATE: All 3 document types present → Updating stage to 'initial'")
                        _update_property_fields(property_id, {"acquisition_stage": "initial"})
                        logger.info(f"[PropertyAgent] ✅ Stage updated to 'initial' successfully")
                        
                        # Update result to propagate new stage to UI
                        result["property_id"] = property_id
                        result["acquisition_stage"] = "initial"
                    else:
                        missing = required_types - doc_types
                        logger.info(f"[PropertyAgent] ⏳ Documents incomplete. Missing types: {missing}")
            except Exception as e:
                logger.error(f"[PropertyAgent] ❌ Error in post-processing: {e}")
                import traceback
                logger.error(f"[PropertyAgent] Traceback: {traceback.format_exc()}")
        
        return result
    
    def get_tools(self) -> List:
        """Return all acquisition tools (property + documents + inspection + contract)."""
        return [
            # Property management
            add_property_tool,
            set_current_property_tool,
            list_properties_tool,
            delete_property_tool,
            find_property_tool,
            get_property_tool,
            update_property_fields_tool,
            # Financial calculations
            calculate_repair_costs_tool,
            calculate_maninos_deal_tool,
            # Inspection
            get_inspection_checklist_tool,
            save_inspection_results_tool,
            # Contract
            generate_buy_contract_tool,
            # Documents (Paso 0)
            upload_and_link_tool,
            list_docs_tool,
            delete_document_tool,
            signed_url_for_tool,
            send_email_tool,
            get_document_for_email_tool,  # NEW - Get document for email
            # RAG Tools (Fase 2 - MANINOS AI)
            query_documents_tool,  # Query documents using RAG
            index_all_documents_maninos_tool,  # Re-index documents
            get_extracted_values_tool,  # Get auto-extracted values
        ]
