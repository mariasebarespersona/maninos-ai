"""
ManinosGraph - Single LangGraph for entire Maninos AI system

This provides:
1. SHARED MEMORY across ALL agents via single checkpointer
2. Seamless context preservation when switching agents
3. Full conversation history regardless of routing

Architecture:
- One LangGraph ReAct agent with ALL tools from all processes
- Dynamic system prompt based on current routing/process
- PostgresSaver checkpointer for persistence
"""

import os
import logging
from typing import Dict, List, Any, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.checkpoint.memory import MemorySaver

logger = logging.getLogger(__name__)


# =============================================================================
# CHECKPOINTER SINGLETON
# =============================================================================

_checkpointer = None

def get_checkpointer():
    """
    Get the appropriate checkpointer based on environment.
    
    - Production (Railway): PostgresSaver with Supabase
    - Development: MemorySaver (in-memory)
    """
    global _checkpointer
    
    if _checkpointer is not None:
        return _checkpointer
    
    database_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    if database_url and os.getenv("ENVIRONMENT") != "development":
        try:
            # Use PostgresSaver for production
            if database_url.startswith("postgresql://"):
                database_url = database_url.replace("postgresql://", "postgres://", 1)
            
            _checkpointer = PostgresSaver.from_conn_string(database_url)
            logger.info("[ManinosGraph] ✅ Using PostgresSaver for checkpoints")
            return _checkpointer
        except Exception as e:
            logger.warning(f"[ManinosGraph] Failed to connect to Postgres: {e}")
    
    # Fallback to in-memory saver
    _checkpointer = MemorySaver()
    logger.info("[ManinosGraph] Using MemorySaver for checkpoints (development)")
    return _checkpointer


# =============================================================================
# TOOL COLLECTION - All tools from all agents
# =============================================================================

# Cache for agent instances (to avoid re-instantiation)
_agent_instances = {}

def get_all_tools() -> List[BaseTool]:
    """
    Collect ALL tools from all agents by INSTANTIATING them and calling get_tools().
    
    This is necessary because:
    - AdquirirAgent: tools defined at module level (can import directly)
    - IncorporarAgent: tools defined inside _create_tools() method
    - ComercializarAgent: tools defined inside class methods
    
    So we need to instantiate each agent and call get_tools() to get the actual tools.
    """
    global _agent_instances
    tools = []
    
    # AdquirirAgent - tools at module level
    try:
        from agents.adquirir_agent import (
            search_property_sources_tool,
            evaluate_property_criteria_tool,
            create_inspection_record_tool,
            calculate_acquisition_offer_tool,
            register_property_inventory_tool,
        )
        tools.extend([
            search_property_sources_tool,
            evaluate_property_criteria_tool,
            create_inspection_record_tool,
            calculate_acquisition_offer_tool,
            register_property_inventory_tool,
        ])
        logger.info("[ManinosGraph] ✅ Loaded 5 tools from AdquirirAgent")
    except Exception as e:
        logger.error(f"[ManinosGraph] ❌ Could not load AdquirirAgent tools: {e}")
    
    # IncorporarAgent - need to instantiate to get tools
    try:
        if "IncorporarAgent" not in _agent_instances:
            # Import the BASE class (not LangGraphAgent version) to avoid circular deps
            from agents.base_agent import BaseAgent
            from tools.incorporar_tools import (
                get_client_info,
                create_client_profile,
                calculate_client_dti,
                generate_rto_contract,
                send_client_update,
                generate_referral_code,
                validate_referral_code,
                register_referral,
                get_referral_stats,
            )
            from tools.stripe_identity import (
                start_kyc_verification,
                check_kyc_verification,
            )
            from langchain_core.tools import tool
            
            # Create tools at module level
            @tool
            def tool_get_client_info(client_id: str = None, email: str = None) -> dict:
                """Obtiene información de un cliente por ID o email."""
                return get_client_info(client_id, email)
            
            @tool
            def tool_create_client_profile(full_name: str, email: str, phone: str, referral_code: str = None) -> dict:
                """Crea o actualiza el perfil de un cliente."""
                return create_client_profile(full_name, email, phone, referral_code)
            
            @tool
            def tool_start_kyc_verification(client_id: str) -> dict:
                """Inicia verificación KYC con Stripe Identity. Obtiene datos del cliente automáticamente."""
                # Get client data first
                client_result = get_client_info(client_id=client_id)
                if not client_result.get("ok"):
                    return {"ok": False, "error": f"Cliente no encontrado: {client_id}"}
                client = client_result.get("client", {})
                return start_kyc_verification(
                    client_id=client_id,
                    client_email=client.get("email", ""),
                    client_name=client.get("full_name", "")
                )
            
            @tool
            def tool_check_kyc_status(session_id: str) -> dict:
                """Verifica el estado de una verificación KYC por session_id de Stripe."""
                return check_kyc_verification(session_id)
            
            @tool
            def tool_calculate_dti(client_id: str, monthly_income: float = None, monthly_debts: float = None) -> dict:
                """Calcula el DTI (Debt-to-Income) de un cliente."""
                return calculate_client_dti(client_id, monthly_income, monthly_debts)
            
            @tool
            def tool_generate_contract(client_id: str, property_id: str, term_months: int = 36) -> dict:
                """Genera un contrato RTO para un cliente."""
                return generate_rto_contract(client_id, property_id, term_months)
            
            @tool
            def tool_send_update(client_id: str, update_type: str, message: str = None) -> dict:
                """Envía una actualización/notificación al cliente."""
                return send_client_update(client_id, update_type, message)
            
            @tool
            def tool_gen_referral_code(client_id: str) -> dict:
                """Genera código de referido para un cliente."""
                return generate_referral_code(client_id)
            
            @tool
            def tool_validate_referral(referral_code: str) -> dict:
                """Valida un código de referido."""
                return validate_referral_code(referral_code)
            
            @tool
            def tool_register_ref(referrer_client_id: str, referred_email: str = None, referred_phone: str = None) -> dict:
                """Registra un nuevo referido."""
                return register_referral(referrer_client_id, None, referred_email, referred_phone)
            
            @tool
            def tool_referral_stats(client_id: str) -> dict:
                """Obtiene estadísticas de referidos de un cliente."""
                return get_referral_stats(client_id)
            
            _agent_instances["IncorporarAgent"] = [
                tool_get_client_info,
                tool_create_client_profile,
                tool_start_kyc_verification,
                tool_check_kyc_status,
                tool_calculate_dti,
                tool_generate_contract,
                tool_send_update,
                tool_gen_referral_code,
                tool_validate_referral,
                tool_register_ref,
                tool_referral_stats,
            ]
        
        tools.extend(_agent_instances["IncorporarAgent"])
        logger.info("[ManinosGraph] ✅ Loaded 11 tools for INCORPORAR")
    except Exception as e:
        logger.error(f"[ManinosGraph] ❌ Could not load IncorporarAgent tools: {e}", exc_info=True)
    
    # ComercializarAgent - tools at module level
    try:
        from agents.comercializar_agent import (
            create_acquisition_committee_record_tool,
            process_disbursement_tool,
            promote_property_listing_tool,
            evaluate_credit_risk_tool,
            formalize_sale_tool,
            manage_portfolio_recovery_tool,
            process_loyalty_program_tool,
        )
        tools.extend([
            create_acquisition_committee_record_tool,
            process_disbursement_tool,
            promote_property_listing_tool,
            evaluate_credit_risk_tool,
            formalize_sale_tool,
            manage_portfolio_recovery_tool,
            process_loyalty_program_tool,
        ])
        logger.info("[ManinosGraph] ✅ Loaded 7 tools from ComercializarAgent")
    except Exception as e:
        logger.error(f"[ManinosGraph] ❌ Could not load ComercializarAgent tools: {e}")
    
    logger.info(f"[ManinosGraph] 📊 Total tools loaded: {len(tools)}")
    return tools


# =============================================================================
# SYSTEM PROMPTS BY PROCESS
# =============================================================================

def get_system_prompt(process: str = "GENERAL", context: Optional[Dict] = None) -> str:
    """
    Get the appropriate system prompt based on current process.
    """
    from prompts.prompt_loader import load_prompt
    
    prompt_map = {
        "ADQUIRIR": "agents/adquirir_agent/_base.md",
        "INCORPORAR": "agents/incorporar_agent/_base.md",
        "COMERCIALIZAR": "agents/comercializar_agent/_base.md",
    }
    
    if process in prompt_map:
        try:
            prompt = load_prompt(prompt_map[process])
            return prompt
        except Exception as e:
            logger.warning(f"[ManinosGraph] Could not load prompt for {process}: {e}")
    
    # General/fallback prompt
    return """Eres el asistente de Maninos Capital LLC, una empresa de rent-to-own de mobile homes en Texas.

Tienes acceso a herramientas de los 3 procesos principales:

## ADQUIRIR (Propiedades)
- search_property_sources: Buscar propiedades
- evaluate_property_criteria: Evaluar con checklist 26 puntos
- create_inspection_record: Registrar inspección
- calculate_acquisition_offer: Calcular oferta (regla 70%)
- register_property_inventory: Registrar en inventario

## INCORPORAR (Clientes)
- get_client_info: Consultar cliente
- create_client_profile: Crear/actualizar perfil
- start_kyc_verification: Iniciar KYC con Stripe
- check_kyc_status: Verificar estado KYC
- calculate_client_dti: Calcular DTI
- generate_rto_contract: Generar contrato RTO
- send_client_update: Enviar comunicación
- generate_referral_code: Código de referido
- validate_referral_code: Validar código
- register_referral: Registrar referido
- get_referral_stats: Estadísticas de referidos

## COMERCIALIZAR (Ventas y Cartera)
- create_acquisition_committee_record: Acta de comité
- process_disbursement: Procesar desembolso
- promote_property_listing: Promover propiedad
- evaluate_credit_risk: Evaluar riesgo crediticio
- formalize_sale: Formalizar venta
- manage_portfolio_recovery: Gestionar cartera
- process_loyalty_program: Programa fidelización

Responde siempre en español. Sé conciso y profesional."""


# =============================================================================
# MANINOS GRAPH - Single graph for entire system
# =============================================================================

_graph = None

def get_maninos_graph():
    """
    Get or create the single ManinosGraph instance.
    This is the ONLY LangGraph instance for the entire system.
    """
    global _graph
    
    if _graph is None:
        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0.3,
            seed=42
        )
        
        tools = get_all_tools()
        checkpointer = get_checkpointer()
        
        _graph = create_react_agent(
            model=llm,
            tools=tools,
            checkpointer=checkpointer
        )
        
        logger.info(f"[ManinosGraph] ✅ Created single graph with {len(tools)} tools")
    
    return _graph


def process_message(
    user_input: str,
    session_id: str,
    process: str = "GENERAL",
    context: Optional[Dict] = None
) -> Dict[str, Any]:
    """
    Process a user message through the single ManinosGraph.
    
    IMPORTANT: With checkpointer, we only pass the NEW user message.
    LangGraph automatically loads previous history from the checkpoint.
    
    Args:
        user_input: User's message
        session_id: Session ID (used as thread_id for checkpointing)
        process: Current process (ADQUIRIR, INCORPORAR, COMERCIALIZAR, GENERAL)
        context: Additional context
    
    Returns:
        Dict with response and metadata
    """
    try:
        logger.info(f"[ManinosGraph] Processing (session={session_id}, process={process}): {user_input[:50]}...")
        
        graph = get_maninos_graph()
        
        # Get appropriate system prompt
        system_prompt = get_system_prompt(process, context)
        
        # Config with thread_id for checkpointing
        config = {
            "configurable": {
                "thread_id": session_id
            },
            "recursion_limit": 15  # Reasonable limit for tool calls
        }
        
        # Check if this is a new session or continuing
        # With checkpointer, we should only pass NEW messages
        # The checkpointer will load previous history automatically
        
        try:
            # Get current state to check if session exists
            state = graph.get_state(config)
            has_history = state and state.values and state.values.get("messages")
            
            if has_history:
                # Continuing conversation - only pass new user message
                logger.info(f"[ManinosGraph] Continuing session {session_id} with {len(state.values.get('messages', []))} existing messages")
                messages = [HumanMessage(content=user_input)]
            else:
                # New session - include system prompt
                logger.info(f"[ManinosGraph] Starting new session {session_id}")
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_input)
                ]
        except Exception as state_error:
            # If we can't get state, treat as new session
            logger.warning(f"[ManinosGraph] Could not get state: {state_error}, treating as new session")
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_input)
            ]
        
        # Invoke the graph
        try:
            result = graph.invoke(
                {"messages": messages},
                config=config
            )
        except Exception as invoke_error:
            error_str = str(invoke_error).lower()
            if "recursion" in error_str:
                logger.warning(f"[ManinosGraph] Recursion limit hit, returning helpful response")
                return {
                    "ok": True,
                    "response": "Entendido. ¿Puedes darme más detalles sobre lo que necesitas?",
                    "process": process,
                    "session_id": session_id
                }
            raise
        
        # Extract the last AI message
        response_content = ""
        if result.get("messages"):
            for msg in reversed(result["messages"]):
                if isinstance(msg, AIMessage) and msg.content:
                    response_content = msg.content
                    break
        
        logger.info(f"[ManinosGraph] Response: {response_content[:100]}...")
        
        return {
            "ok": True,
            "response": response_content,
            "process": process,
            "session_id": session_id
        }
        
    except Exception as e:
        logger.error(f"[ManinosGraph] Error: {e}", exc_info=True)
        return {
            "ok": False,
            "error": str(e),
            "response": f"Error: {str(e)}"
        }


# =============================================================================
# WRAPPER CLASS for compatibility with existing code
# =============================================================================

class ManinosGraphAgent:
    """
    Wrapper class that provides agent-like interface to ManinosGraph.
    Used for compatibility with existing app.py code.
    """
    
    def __init__(self, process: str = "GENERAL"):
        self.name = f"ManinosGraph-{process}"
        self.process = process
    
    def process(self, user_input: str, session_id: str, context: Optional[Dict] = None) -> Dict[str, Any]:
        """Process a user request through ManinosGraph."""
        result = process_message(user_input, session_id, self.process, context)
        result["agent"] = self.name
        return result
    
    def __repr__(self):
        return f"<ManinosGraphAgent process={self.process}>"

