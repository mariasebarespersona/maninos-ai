"""
LangGraph Agent Base Class with Persistent Memory

Uses LangGraph's checkpointer for automatic conversation persistence.
This replaces the manual ReAct loop with LangGraph's built-in agent execution.

Benefits:
- Automatic conversation memory per session
- "sí" after "¿calcular oferta?" will have full context
- Persistent across server restarts (PostgresSaver in production)
"""

import os
from typing import Dict, List, Any, Optional

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from langgraph.prebuilt import create_react_agent
from langgraph.checkpoint.memory import MemorySaver

from core.logging import get_logger

logger = get_logger(__name__)

# Try to import PostgresSaver (for production)
try:
    from langgraph.checkpoint.postgres import PostgresSaver
    from psycopg_pool import ConnectionPool
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False
    ConnectionPool = None  # Define as None for type hints when not available
    logger.warning("postgres_unavailable", message="langgraph-checkpoint-postgres not installed, falling back to MemorySaver")

# Try SQLite as alternative persistent storage (for development)
try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    SQLITE_AVAILABLE = True
except ImportError:
    SQLITE_AVAILABLE = False


# Global connection pool for PostgresSaver (reused across checkpointer calls)
_connection_pool: Optional[Any] = None  # Use Any since ConnectionPool may not be available

def get_connection_pool() -> Optional[Any]:
    """Get or create the global PostgreSQL connection pool."""
    global _connection_pool
    
    if _connection_pool is not None:
        return _connection_pool
    
    database_url = os.getenv("DATABASE_URL") or os.getenv("SUPABASE_DB_URL")
    if not database_url:
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
    Get the appropriate checkpointer based on environment and available packages.
    
    Priority:
    1. PostgresSaver with connection pool (production)
    2. SqliteSaver (development, persistent file)
    3. MemorySaver (fallback, lost on restart)
    """
    env = os.getenv("ENVIRONMENT", "production")
    
    # Try PostgresSaver first (production)
    if POSTGRES_AVAILABLE and env != "development":
        pool = get_connection_pool()
        if pool:
            try:
                checkpointer = PostgresSaver(pool)
                # Setup tables if needed (idempotent)
                checkpointer.setup()
                logger.info("checkpointer_initialized", type="PostgresSaver", environment=env)
                return checkpointer
            except Exception as e:
                logger.warning("postgres_checkpointer_failed", error=str(e))
    
    # Try SqliteSaver second (development or fallback)
    if SQLITE_AVAILABLE:
        try:
            import tempfile
            db_path = os.path.join(tempfile.gettempdir(), "maninos_checkpoints.db")
            checkpointer = SqliteSaver.from_conn_string(f"sqlite:///{db_path}")
            logger.info("checkpointer_initialized", type="SqliteSaver", path=db_path)
            return checkpointer
        except Exception as e:
            logger.warning("sqlite_checkpointer_failed", error=str(e))
    
    # Fallback to in-memory saver
    logger.warning("checkpointer_fallback", type="MemorySaver", message="Data will be lost on restart")
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
    
    Features:
    - Automatic conversation persistence via LangGraph checkpointer
    - Structured logging with structlog
    - Connection pooling for PostgreSQL
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
        self.logger = get_logger(self.name)
        
        # Initialize LLM
        self.llm = ChatOpenAI(
            model=model,
            temperature=temperature,
            seed=42  # Consistent seed for caching
        )
        
        # Checkpointer will be set when graph is created
        self._graph = None
        
        self.logger.info("agent_initialized", model=model, temperature=temperature)
    
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
            
            self.logger.info("graph_created", tools_count=len(tools))
        
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
        log = self.logger.bind(session_id=session_id, input_preview=user_input[:50])
        
        try:
            log.info("processing_request")
            
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
                },
                "recursion_limit": 15  # Prevent infinite loops
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
            
            log.info("request_completed", response_preview=response_content[:100] if response_content else "empty")
            
            return {
                "ok": True,
                "response": response_content,
                "agent": self.name,
                "action": "complete"
            }
            
        except Exception as e:
            log.error("request_failed", error=str(e), exc_info=True)
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
