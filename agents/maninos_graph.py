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

def get_all_tools() -> List[BaseTool]:
    """
    Collect ALL tools from all agents.
    This allows the single graph to handle any process.
    """
    tools = []
    
    # Import tools from AdquirirAgent
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
        logger.info("[ManinosGraph] Loaded 5 tools from AdquirirAgent")
    except Exception as e:
        logger.warning(f"[ManinosGraph] Could not load AdquirirAgent tools: {e}")
    
    # Import tools from IncorporarAgent
    try:
        from agents.incorporar_agent import (
            tool_get_client_info,
            tool_create_client_profile,
            tool_start_kyc_verification,
            tool_check_kyc_status,
            tool_calculate_client_dti,
            tool_generate_rto_contract,
            tool_send_client_update,
            tool_generate_referral_code,
            tool_validate_referral_code,
            tool_register_referral,
            tool_get_referral_stats,
        )
        tools.extend([
            tool_get_client_info,
            tool_create_client_profile,
            tool_start_kyc_verification,
            tool_check_kyc_status,
            tool_calculate_client_dti,
            tool_generate_rto_contract,
            tool_send_client_update,
            tool_generate_referral_code,
            tool_validate_referral_code,
            tool_register_referral,
            tool_get_referral_stats,
        ])
        logger.info("[ManinosGraph] Loaded 11 tools from IncorporarAgent")
    except Exception as e:
        logger.warning(f"[ManinosGraph] Could not load IncorporarAgent tools: {e}")
    
    # Import tools from ComercializarAgent
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
        logger.info("[ManinosGraph] Loaded 7 tools from ComercializarAgent")
    except Exception as e:
        logger.warning(f"[ManinosGraph] Could not load ComercializarAgent tools: {e}")
    
    logger.info(f"[ManinosGraph] Total tools loaded: {len(tools)}")
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

