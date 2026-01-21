"""
LangGraph Agent Base Class with Persistent Memory

Uses LangGraph's checkpointer for automatic conversation persistence.
This replaces the manual ReAct loop with LangGraph's built-in agent execution.

Benefits:
- Automatic conversation memory per session
- "sí" after "¿calcular oferta?" will have full context
- Persistent across server restarts (with PostgresSaver if available)
"""

import os
import logging
from typing import Dict, List, Any, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

# Try to import PostgresSaver, fall back gracefully if not installed
try:
    from langgraph.checkpoint.postgres import PostgresSaver
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

# Try SQLite as alternative persistent storage
try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    SQLITE_AVAILABLE = True
except ImportError:
    SQLITE_AVAILABLE = False

logger = logging.getLogger(__name__)


def get_checkpointer():
    """
    Get the appropriate checkpointer based on environment and available packages.
    
    Priority:
    1. PostgresSaver (if package installed AND DATABASE_URL available)
    2. SqliteSaver (persistent, file-based)
    3. MemorySaver (in-memory, lost on restart)
    """
    database_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    
    # Try PostgresSaver first (production)
    if POSTGRES_AVAILABLE and database_url and os.getenv("ENVIRONMENT") != "development":
        try:
            # The connection string needs to be in postgres:// format
            if database_url.startswith("postgresql://"):
                database_url = database_url.replace("postgresql://", "postgres://", 1)
            
            checkpointer = PostgresSaver.from_conn_string(database_url)
            logger.info("[LangGraphAgent] ✅ Using PostgresSaver for checkpoints (production)")
            return checkpointer
        except Exception as e:
            logger.warning(f"[LangGraphAgent] ⚠️ Failed to connect to Postgres: {e}")
    
    # Try SqliteSaver second (persistent file)
    if SQLITE_AVAILABLE:
        try:
            import tempfile
            db_path = os.path.join(tempfile.gettempdir(), "maninos_checkpoints.db")
            checkpointer = SqliteSaver.from_conn_string(f"file:{db_path}")
            logger.info(f"[LangGraphAgent] ✅ Using SqliteSaver for checkpoints: {db_path}")
            return checkpointer
        except Exception as e:
            logger.warning(f"[LangGraphAgent] ⚠️ Failed to create SqliteSaver: {e}")
    
    # Fallback to in-memory saver
    logger.info("[LangGraphAgent] ⚠️ Using MemorySaver for checkpoints (memory only, lost on restart)")
    return MemorySaver()


# Global checkpointer instance (singleton)
_checkpointer = None

def get_global_checkpointer():
    """Get or create the global checkpointer instance."""
    global _checkpointer
    if _checkpointer is None:
        _checkpointer = get_checkpointer()
    return _checkpointer


class LangGraphAgent:
    """
    Base class for agents using LangGraph with persistent memory.
    
    Subclasses must implement:
    - get_system_prompt()
    - get_tools()
    """
    
    def __init__(self, name: str, model: str = "gpt-4o-mini", temperature: float = 0.7):
        """Initialize the LangGraph agent.
        
        Args:
            name: Agent name (e.g., "AdquirirAgent")
            model: LLM model to use
            temperature: Temperature for LLM
        """
        self.name = name
        self.model = model
        self.temperature = temperature
        
        # Initialize LLM
        self.llm = ChatOpenAI(
            model=model,
            temperature=temperature,
            seed=42  # Consistent seed for caching
        )
        
        # Checkpointer will be set when graph is created
        self._graph = None
        
        logger.info(f"[{self.name}] LangGraph agent initialized with model={model}")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get the system prompt for this agent. Must be overridden."""
        raise NotImplementedError(f"{self.name} must implement get_system_prompt()")
    
    def get_tools(self) -> List:
        """Get the list of tools this agent can use. Must be overridden."""
        raise NotImplementedError(f"{self.name} must implement get_tools()")
    
    def _get_graph(self):
        """Get or create the LangGraph ReAct agent."""
        if self._graph is None:
            tools = self.get_tools()
            checkpointer = get_global_checkpointer()
            
            # Create the ReAct agent with checkpointer
            self._graph = create_react_agent(
                model=self.llm,
                tools=tools,
                checkpointer=checkpointer
            )
            
            logger.info(f"[{self.name}] Created LangGraph ReAct agent with {len(tools)} tools")
        
        return self._graph
    
    def process(self, user_input: str, session_id: str, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Process a user request with LangGraph (includes conversation memory).
        
        Args:
            user_input: User's message
            session_id: Session ID (used as thread_id for checkpointing)
            context: Additional context
        
        Returns:
            Dict with response and metadata
        """
        try:
            logger.info(f"[{self.name}] Processing (session={session_id}): {user_input[:50]}...")
            
            # Get the graph
            graph = self._get_graph()
            
            # Build system message
            system_prompt = self.get_system_prompt(**(context or {}))
            
            # Prepare messages
            messages = [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_input)
            ]
            
            # Config with thread_id for checkpointing
            config = {
                "configurable": {
                    "thread_id": session_id
                }
            }
            
            # Invoke the graph
            result = graph.invoke(
                {"messages": messages},
                config=config
            )
            
            # Extract the last AI message
            response_content = ""
            if result.get("messages"):
                for msg in reversed(result["messages"]):
                    if isinstance(msg, AIMessage) and msg.content:
                        response_content = msg.content
                        break
            
            logger.info(f"[{self.name}] Response: {response_content[:100]}...")
            
            return {
                "ok": True,
                "response": response_content,
                "agent": self.name,
                "action": "complete"
            }
            
        except Exception as e:
            logger.error(f"[{self.name}] Error: {e}", exc_info=True)
            return {
                "ok": False,
                "error": str(e),
                "agent": self.name,
                "response": f"Error: {str(e)}"
            }
    
    def run(self, user_input: str, property_id: Optional[str] = None, context: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Compatibility wrapper for old-style run() calls.
        Delegates to process() with a generated session_id.
        """
        import uuid
        session_id = context.get("session_id") if context else str(uuid.uuid4())
        
        result = self.process(user_input, session_id, context)
        
        return {
            "action": "complete" if result.get("ok") else "error",
            "agent": self.name,
            "response": result.get("response", ""),
            "success": result.get("ok", False)
        }
    
    def __repr__(self):
        return f"<{self.name} (LangGraph) model={self.model}>"

