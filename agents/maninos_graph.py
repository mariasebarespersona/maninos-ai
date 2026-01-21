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
from typing import Dict, List, Any, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langchain_core.tools import BaseTool
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

from core.logging import get_logger

logger = get_logger(__name__)

# Try to import PostgresSaver with connection pooling
try:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False
    logger.warning("postgres_checkpointer_unavailable", message="langgraph-checkpoint-postgres not installed")


# =============================================================================
# CHECKPOINTER SINGLETON WITH CONNECTION POOLING
# =============================================================================

_checkpointer = None
_connection_pool = None

def get_connection_pool():
    """Get or create the PostgreSQL connection pool."""
    global _connection_pool
    
    if _connection_pool is not None:
        return _connection_pool
    
    database_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not database_url:
        logger.warning("no_database_url", message="DATABASE_URL not set")
        return None
    
    # Ensure correct format for psycopg
    if database_url.startswith("postgresql://"):
        database_url = database_url.replace("postgresql://", "postgres://", 1)
    
    try:
        _connection_pool = ConnectionPool(
            conninfo=database_url,
            min_size=1,
            max_size=10,
            kwargs={"autocommit": True, "prepare_threshold": 0}
        )
        logger.info("postgres_pool_created", min_size=1, max_size=10)
        return _connection_pool
    except Exception as e:
        logger.error("postgres_pool_failed", error=str(e))
        return None


def get_checkpointer():
    """
    Get the appropriate checkpointer based on environment.
    
    Priority:
    1. PostgresSaver with connection pool (production)
    2. MemorySaver (fallback)
    
    IMPORTANT: Calls .setup() to create checkpoint tables if needed.
    """
    global _checkpointer
    
    if _checkpointer is not None:
        return _checkpointer
    
    env = os.getenv("ENVIRONMENT", "production")
    
    # Try PostgresSaver first (production)
    if POSTGRES_AVAILABLE and env != "development":
        pool = get_connection_pool()
        if pool:
            try:
                _checkpointer = PostgresSaver(pool)
                # CRITICAL: Setup creates the checkpoint tables
                _checkpointer.setup()
                logger.info("checkpointer_initialized", type="PostgresSaver", environment=env)
                return _checkpointer
            except Exception as e:
                logger.error("postgres_checkpointer_failed", error=str(e), exc_info=True)
    
    # Fallback to in-memory saver
    _checkpointer = MemorySaver()
    logger.warning("checkpointer_fallback", type="MemorySaver", message="Memory only - history lost on restart")
    return _checkpointer


# =============================================================================
# TOOL COLLECTION - All tools from all agents (now ALL at module level)
# =============================================================================

def get_all_tools() -> List[BaseTool]:
    """
    Collect ALL tools from all agents.
    
    ARCHITECTURE NOTE: All agents now define tools at MODULE LEVEL for consistency.
    This means we can import them directly without instantiating agents.
    
    Pattern followed by all agents:
        @tool("tool_name", args_schema=InputSchema)
        def tool_name_tool(...):
            ...
        
        class XAgent(LangGraphAgent):
            def get_tools(self):
                return [tool_name_tool, ...]
    """
    tools = []
    
    # AdquirirAgent - 5 tools
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
    
    # IncorporarAgent - 11 tools (now at module level!)
    try:
        from agents.incorporar_agent import (
            get_client_info_tool,
            create_client_profile_tool,
            start_kyc_verification_tool,
            check_kyc_status_tool,
            calculate_client_dti_tool,
            generate_rto_contract_tool,
            send_client_update_tool,
            generate_referral_code_tool,
            validate_referral_code_tool,
            register_referral_tool,
            get_referral_stats_tool,
        )
        tools.extend([
            get_client_info_tool,
            create_client_profile_tool,
            start_kyc_verification_tool,
            check_kyc_status_tool,
            calculate_client_dti_tool,
            generate_rto_contract_tool,
            send_client_update_tool,
            generate_referral_code_tool,
            validate_referral_code_tool,
            register_referral_tool,
            get_referral_stats_tool,
        ])
        logger.info("[ManinosGraph] ✅ Loaded 11 tools from IncorporarAgent")
    except Exception as e:
        logger.error(f"[ManinosGraph] ❌ Could not load IncorporarAgent tools: {e}")
    
    # ComercializarAgent - 7 tools
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

