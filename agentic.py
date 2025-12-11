# agentic.py - MANINOS AI
# Simplified LangGraph infrastructure for state management
# Individual agents (PropertyAgent, DocsAgent, NumbersAgent) handle their own prompts

from __future__ import annotations
import env_loader 
import os
import logging
import time
from typing import TypedDict, List, Dict, Any, Literal
from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_openai import ChatOpenAI

# Instrument OpenAI for Logfire (auto-logs tokens, cost, prompts)
import logfire
logfire.instrument_openai()

from tools.registry import TOOLS
from tools.property_tools import get_property, list_properties, find_property
from tools.docs_tools import list_docs
from tools.contracts import validate_tool_call

logger = logging.getLogger(__name__)

# MainAgent only needs READ-ONLY tools for status queries
# All execution tools (generate_buy_contract, calculate_maninos_deal, etc.) 
# should be handled by specialized agents (PropertyAgent, DocsAgent)
MAIN_AGENT_TOOLS = [
    get_property,
    list_properties,
    find_property,
    list_docs
]

# ==================== STATE DEFINITION ====================

class AgentState(TypedDict):
    """
    LangGraph state for MANINOS AI.
    
    This is ONLY for state management and checkpointing.
    Individual specialized agents handle their own prompts.
    """
    input: str | None  # Initial user input (converted to messages)
    messages: List[Any]
    property_id: str | None
    property_name: str | None
    session_id: str | None
    # Tool call validation state
    awaiting_confirmation: bool
    pending_tool_call: Dict | None
    tool_validation_error: str | None


# ==================== MINIMAL COORDINATOR PROMPT ====================

COORDINATOR_PROMPT = """You are a state coordinator for MANINOS AI.

Your ONLY job is to:
1. Manage conversation state
2. Execute validated tool calls
3. Return tool results

You do NOT:
- Make acquisition decisions (PropertyAgent does that)
- Handle documents (DocsAgent does that)
- Manage numbers (NumbersAgent does that)

The specialized agents handle all user-facing interactions and decisions.
You just coordinate state and tool execution."""


# ==================== GRAPH NODES ====================

def prepare_input(state: AgentState) -> Dict[str, Any]:
    """
    Convert input string to HumanMessage if needed.
    This allows app.py to pass simple {"input": "text"} state.
    """
    if state.get("input") and not state.get("messages"):
        from langchain_core.messages import HumanMessage
        return {
            **state,
            "messages": [HumanMessage(content=state["input"])],
            "input": None  # Clear after conversion
        }
    return state


def assistant_node(state: AgentState) -> Dict[str, Any]:
    """
    Coordinator node - executes tools and manages state.
    
    This is intentionally minimal. Real agent logic happens in:
    - PropertyAgent (acquisition flow)
    - DocsAgent (document management)
    """
    msgs = state.get("messages", [])
    
    # Build minimal message list
    coordinator_msgs = []
    
    # Add coordinator system prompt
    coordinator_msgs.append(SystemMessage(content=COORDINATOR_PROMPT))
    
    # Add recent conversation (keep it minimal)
    MAX_RECENT_MESSAGES = 10
    recent_msgs = msgs[-MAX_RECENT_MESSAGES:] if len(msgs) > MAX_RECENT_MESSAGES else msgs
    
    # CRITICAL: Sanitize messages to prevent orphaned ToolMessages
    # OpenAI API requires: ToolMessage must have a preceding AIMessage with tool_calls
    
    # STEP 1: Skip any leading ToolMessages (they're orphaned if they come first)
    start_idx = 0
    for i, msg in enumerate(recent_msgs):
        if isinstance(msg, ToolMessage):
            logger.warning(f"[assistant_node] Skipping leading ToolMessage at index {i}: {msg.name}")
            start_idx = i + 1
        else:
            break
    
    # STEP 2: Sanitize remaining messages
    sanitized_msgs = []
    has_pending_tool_calls = False
    
    for msg in recent_msgs[start_idx:]:
        if isinstance(msg, AIMessage):
            # AIMessage with tool_calls creates expectation for ToolMessages
            has_pending_tool_calls = hasattr(msg, "tool_calls") and msg.tool_calls
            sanitized_msgs.append(msg)
        elif isinstance(msg, ToolMessage):
            # Only include ToolMessage if we have pending tool_calls
            if has_pending_tool_calls:
                sanitized_msgs.append(msg)
            else:
                logger.warning(f"[assistant_node] Skipping orphaned ToolMessage: {msg.name}")
        elif isinstance(msg, (HumanMessage, SystemMessage)):
            # Regular messages break tool_calls sequence
            has_pending_tool_calls = False
            sanitized_msgs.append(msg)
        else:
            sanitized_msgs.append(msg)
    
    coordinator_msgs.extend(sanitized_msgs)
    
    # Initialize LLM (with READ-ONLY tools for MainAgent)
    model = ChatOpenAI(
        model=os.getenv("OPENAI_MODEL", "gpt-4o-mini"),
        temperature=0.0,
        streaming=False
    ).bind_tools(MAIN_AGENT_TOOLS)
    
    # Invoke
    try:
        with logfire.span("assistant_node", property_id=state.get("property_id")):
            response = model.invoke(coordinator_msgs)
            logger.info(f"[assistant_node] Response generated")
            return {"messages": [response]}
    
    except Exception as e:
        logger.error(f"[assistant_node] Error: {e}")
        error_msg = AIMessage(content=f"Error en el coordinador: {str(e)}")
        return {"messages": [error_msg]}


def post_tool_node(state: AgentState) -> Dict[str, Any]:
    """
    Post-tool processing node.
    
    Handles tool validation errors and confirmation flows.
    """
    msgs = state["messages"]
    
    # Check for validation errors
    validation_error = state.get("tool_validation_error")
    if validation_error:
        logger.warning(f"[post_tool_node] Validation error present: {validation_error[:100]}")
        # Reset validation error after processing
        return {"tool_validation_error": None}
    
    # Check for pending confirmation
    if state.get("awaiting_confirmation"):
        logger.info(f"[post_tool_node] Awaiting user confirmation for tool call")
        # Keep awaiting_confirmation=True until user confirms/denies
        return {}
    
    # Normal flow - continue
    return {}


# ==================== ROUTING LOGIC ====================

def should_continue(state: AgentState) -> Literal["tools", "assistant", "end"]:
    """
    Determine next step based on state.
    
    Logic:
    1. If awaiting confirmation → end (wait for user)
    2. If validation error → assistant (let it handle)
    3. If tool calls present → tools (execute them)
    4. Otherwise → end (done)
    """
    msgs = state["messages"]
    
    # Check if awaiting confirmation
    if state.get("awaiting_confirmation"):
        logger.info("[should_continue] → END (awaiting confirmation)")
        return "end"
    
    # Check for validation error
    if state.get("tool_validation_error"):
        logger.info("[should_continue] → ASSISTANT (validation error)")
        return "assistant"
    
    # Check for tool calls in last message
    if msgs:
        last_msg = msgs[-1]
        if isinstance(last_msg, AIMessage) and hasattr(last_msg, "tool_calls") and last_msg.tool_calls:
            logger.info(f"[should_continue] → TOOLS ({len(last_msg.tool_calls)} calls)")
            return "tools"
    
    # No more work to do
    logger.info("[should_continue] → END")
    return "end"


def tools_with_validation(state: AgentState) -> Dict[str, Any]:
    """
    Enhanced tool node with validation.
    
    Validates tool calls before execution:
    1. Check if tool call is allowed
    2. If needs confirmation → set awaiting_confirmation=True
    3. If valid → execute tool
    4. If invalid → set validation error
    """
    msgs = state["messages"]
    
    if not msgs:
        return {"messages": []}
    
    last_msg = msgs[-1]
    
    if not isinstance(last_msg, AIMessage) or not hasattr(last_msg, "tool_calls") or not last_msg.tool_calls:
        return {"messages": []}
    
    tool_responses = []
    
    for tool_call in last_msg.tool_calls:
        tool_name = tool_call.get("name", "")
        tool_args = tool_call.get("args", {})
        
        logger.info(f"[tools_with_validation] Validating: {tool_name}")
        
        # Validate tool call (returns tuple: (bool, str))
        allowed, validation_msg = validate_tool_call(tool_name, tool_args)
        
        if not allowed:
            # Tool call not allowed
            error_msg = f"❌ Tool validation failed: {validation_msg}"
            logger.warning(f"[tools_with_validation] {tool_name}: {error_msg}")
            return {
                "tool_validation_error": validation_msg,
                "messages": [
                    ToolMessage(
                        content=error_msg,
                        tool_call_id=tool_call.get("id", ""),
                        name=tool_name
                    )
                ]
            }
        
        # Tool call is valid - execute it
        logger.info(f"[tools_with_validation] Executing: {tool_name}")
    
    # All validations passed - execute tools normally (using MainAgent's limited toolset)
    tool_node = ToolNode(MAIN_AGENT_TOOLS)
    
    try:
        result = tool_node.invoke(state)
        
        # Ensure result is not empty and has valid structure to avoid LangGraph InvalidUpdateError
        if not result:
            logger.warning("[tools_with_validation] Tool execution returned None, creating error message")
            return {
                "messages": [
                    ToolMessage(
                        content="❌ Tool execution failed or returned empty result",
                        tool_call_id=state.get("messages", [])[-1].tool_calls[0].get("id", "") if state.get("messages") else "",
                        name="unknown"
                    )
                ]
            }
        
        # Check if result is an empty dict or doesn't have required keys
        if isinstance(result, dict):
            # LangGraph expects at least one of these keys
            required_keys = ['input', 'messages', 'property_id', 'property_name', 'session_id', 
                           'awaiting_confirmation', 'pending_tool_call', 'tool_validation_error']
            
            if not any(key in result for key in required_keys):
                logger.warning(f"[tools_with_validation] Tool result missing required keys: {result}")
                return {
                    "messages": [
                        ToolMessage(
                            content="❌ Tool execution returned invalid result structure",
                            tool_call_id=state.get("messages", [])[-1].tool_calls[0].get("id", "") if state.get("messages") else "",
                            name="unknown"
                        )
                    ]
                }
        
        return result
    except Exception as e:
        logger.error(f"[tools_with_validation] Tool execution error: {e}", exc_info=True)
        return {
            "messages": [
                ToolMessage(
                    content=f"❌ Error executing tool: {str(e)}",
                    tool_call_id=state.get("messages", [])[-1].tool_calls[0].get("id", "") if state.get("messages") else "",
                    name="unknown"
                )
            ]
        }


# ==================== GRAPH CONSTRUCTION ====================

def build_graph() -> Any:
    """
    Build LangGraph state graph for MANINOS AI.
    
    This is a simplified coordinator graph.
    Real agent logic happens in specialized agents via orchestrator.py
    """
    graph = StateGraph(AgentState)
    
    # Add nodes
    graph.add_node("prepare_input", prepare_input)  # NEW: Convert input to messages
    graph.add_node("assistant", assistant_node)
    graph.add_node("tools", tools_with_validation)
    graph.add_node("post_tool", post_tool_node)
    
    # Entry point - start with prepare_input to handle app.py state format
    graph.set_entry_point("prepare_input")
    
    # prepare_input → assistant (always)
    graph.add_edge("prepare_input", "assistant")
    
    # Edges from assistant
    graph.add_conditional_edges(
        "assistant",
        should_continue,
        {"tools": "tools", "end": END}
    )
    
    # Tools → post_tool (always)
    graph.add_edge("tools", "post_tool")
    
    # post_tool → conditional
    graph.add_conditional_edges(
        "post_tool",
        should_continue,
        {"tools": "tools", "assistant": "assistant", "end": END}
    )
    
    # ==================== CHECKPOINTER SETUP ====================
    
    database_url = os.getenv("DATABASE_URL")
    
    # CRITICAL: In production, enforce DATABASE_URL
    if os.getenv("ENVIRONMENT") == "production" and not database_url:
        raise ValueError(
            "CRITICAL ERROR: DATABASE_URL is missing in PRODUCTION environment. "
            "This would cause memory loss. Deployment halted."
        )
    
    if not database_url:
        logger.warning("⚠️  DATABASE_URL not found! Using local checkpoint fallback...")
        try:
            from langgraph.checkpoint.sqlite import SqliteSaver
            from sqlite3 import connect
            
            data_dir = os.path.join(os.path.dirname(__file__), "data")
            os.makedirs(data_dir, exist_ok=True)
            db_path = os.path.join(data_dir, "checkpoints.db")
            
            conn = connect(db_path, check_same_thread=False)
            checkpointer = SqliteSaver(conn)
            checkpointer.setup()
            logger.info(f"✅ SQLite checkpointer active: {db_path}")
        
        except Exception as e:
            logger.warning(f"⚠️  SQLite unavailable ({e}); using in-memory saver")
            from langgraph.checkpoint.memory import MemorySaver
            checkpointer = MemorySaver()
    
    else:
        logger.info("🔄 Connecting to PostgreSQL (Supabase)...")
        
        try:
            from langgraph.checkpoint.postgres import PostgresSaver
            from psycopg_pool import ConnectionPool
            
            pool = ConnectionPool(
                conninfo=database_url,
                min_size=1,
                max_size=10,
                timeout=30,
                max_idle=300,
                max_lifetime=3600,
                kwargs={
                    "keepalives": 1,
                    "keepalives_idle": 30,
                    "keepalives_interval": 10,
                    "keepalives_count": 5,
                },
                check=ConnectionPool.check_connection,
            )
            
            checkpointer = PostgresSaver(pool)
            
            # Try to setup tables
            try:
                checkpointer.setup()
                logger.info("✅ PostgreSQL tables created/verified")
            except Exception as setup_err:
                if "transaction block" in str(setup_err).lower():
                    logger.warning("⚠️  Skipped auto-setup (Pooler detected). Assuming tables exist.")
                else:
                    raise setup_err
            
            logger.info("✅ PostgreSQL connected with connection pool!")
            logger.info("✅ Persistent memory across sessions")
        
        except Exception as e:
            if os.getenv("ENVIRONMENT") == "production":
                raise ValueError(
                    f"CRITICAL ERROR: Failed to connect to PostgreSQL in PRODUCTION: {e}. "
                    "Cannot fall back to memory without losing user data."
                )
            logger.error(f"❌ PostgreSQL connection failed: {e}")
            logger.warning("⚠️  Falling back to In-Memory Checkpointer (no persistence)...")
            from langgraph.checkpoint.memory import MemorySaver
            checkpointer = MemorySaver()
            logger.info("✅ In-Memory checkpointer active")
    
    # Compile graph
    app = graph.compile(checkpointer=checkpointer)
    
    return app


# ==================== GLOBAL AGENT INSTANCE ====================

# Create and export the agent instance globally
agent = build_graph()

logger.info("✅ MANINOS AI LangGraph agent initialized")
logger.info("   → Coordinator mode: Minimal state management")
logger.info("   → Real logic: PropertyAgent, DocsAgent, NumbersAgent")
