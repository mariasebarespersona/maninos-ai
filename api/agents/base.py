"""
Base Agent Class for Maninos AI.

Following Agent Bible v1:
- Each agent has ONE responsibility
- Explicit tool descriptions
- Pydantic validation for I/O
- Database as source of truth
- Fail fast, fail loud

Agents are SERVICES that employees invoke when they need help,
NOT controllers of the application flow.
"""

from abc import ABC, abstractmethod
from typing import Any, Optional
from datetime import datetime
from pydantic import BaseModel, Field
import logging
import os

from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, SystemMessage

logger = logging.getLogger(__name__)


# ============================================
# BASE SCHEMAS
# ============================================

class AgentRequest(BaseModel):
    """Base request for all agents."""
    query: str = Field(description="What the user wants the agent to do")
    context: Optional[dict] = Field(default=None, description="Additional context")
    property_id: Optional[str] = Field(default=None, description="Property ID if relevant")


class AgentResponse(BaseModel):
    """Base response from all agents."""
    success: bool
    agent: str = Field(description="Name of the agent that responded")
    result: Any = Field(description="The actual result data")
    confidence: float = Field(ge=0, le=1, description="Confidence in the result")
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    error: Optional[str] = Field(default=None, description="Error message if failed")
    suggestions: list[str] = Field(default_factory=list, description="Suggested next actions")


# ============================================
# BASE AGENT CLASS
# ============================================

class BaseAgent(ABC):
    """
    Base class for all Maninos AI agents.
    
    Each agent:
    - Has a specific purpose (ONE responsibility)
    - Uses tools to accomplish tasks
    - Returns structured, validated responses
    - Is invoked ON DEMAND by the employee
    """
    
    def __init__(
        self,
        name: str,
        description: str,
        model: str = "gpt-4o-mini",
        temperature: float = 0.1,
    ):
        self.name = name
        self.description = description
        self.model = model
        self.temperature = temperature
        self.llm = None
        
        # Initialize LLM only if API key is available
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            try:
                self.llm = ChatOpenAI(
                    model=model,
                    temperature=temperature,
                    api_key=api_key,
                )
                logger.info(f"Agent '{name}' initialized with LLM model '{model}'")
            except Exception as e:
                logger.warning(f"Agent '{name}' initialized without LLM: {e}")
        else:
            logger.warning(f"Agent '{name}' initialized without LLM (no OPENAI_API_KEY)")
    
    @property
    @abstractmethod
    def system_prompt(self) -> str:
        """
        System prompt for this agent.
        
        Must follow Agent Bible modular structure:
        IDENTITY + CONTEXT + CAPABILITIES + CONSTRAINTS + OUTPUT FORMAT + EXAMPLES
        """
        pass
    
    @abstractmethod
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process a request and return a response.
        
        This is the main entry point for the agent.
        Each agent implements its own logic here.
        """
        pass
    
    async def _call_llm(self, user_message: str, context: dict = None) -> str:
        """
        Call the LLM with the system prompt and user message.
        
        If LLM is not available, returns a fallback message.
        """
        if not self.llm:
            return f"LLM not available. Query: {user_message}"
        
        messages = [
            SystemMessage(content=self.system_prompt),
        ]
        
        # Add context if provided
        if context:
            context_str = f"\n\nCurrent Context:\n{self._format_context(context)}"
            messages.append(SystemMessage(content=context_str))
        
        messages.append(HumanMessage(content=user_message))
        
        try:
            response = await self.llm.ainvoke(messages)
            return response.content
        except Exception as e:
            logger.error(f"LLM call failed: {e}")
            raise
    
    def _format_context(self, context: dict) -> str:
        """Format context dict as readable string."""
        lines = []
        for key, value in context.items():
            lines.append(f"- {key}: {value}")
        return "\n".join(lines)
    
    def _success_response(
        self,
        result: Any,
        confidence: float = 0.9,
        suggestions: list[str] = None
    ) -> AgentResponse:
        """Create a successful response."""
        return AgentResponse(
            success=True,
            agent=self.name,
            result=result,
            confidence=confidence,
            suggestions=suggestions or [],
        )
    
    def _error_response(self, error: str) -> AgentResponse:
        """Create an error response."""
        return AgentResponse(
            success=False,
            agent=self.name,
            result=None,
            confidence=0.0,
            error=error,
        )


# ============================================
# AGENT REGISTRY
# ============================================

class AgentRegistry:
    """
    Registry of available agents.
    
    Use this to discover and invoke agents by name.
    """
    
    _agents: dict[str, BaseAgent] = {}
    
    @classmethod
    def register(cls, agent: BaseAgent):
        """Register an agent."""
        cls._agents[agent.name] = agent
        logger.info(f"Registered agent: {agent.name}")
    
    @classmethod
    def get(cls, name: str) -> Optional[BaseAgent]:
        """Get an agent by name."""
        return cls._agents.get(name)
    
    @classmethod
    def list_agents(cls) -> list[dict]:
        """List all registered agents."""
        return [
            {"name": agent.name, "description": agent.description}
            for agent in cls._agents.values()
        ]
    
    @classmethod
    async def invoke(cls, name: str, request: AgentRequest) -> AgentResponse:
        """Invoke an agent by name."""
        agent = cls.get(name)
        if not agent:
            return AgentResponse(
                success=False,
                agent="registry",
                result=None,
                confidence=0.0,
                error=f"Agent '{name}' not found. Available: {list(cls._agents.keys())}",
            )
        
        try:
            return await agent.process(request)
        except Exception as e:
            logger.error(f"Agent '{name}' failed: {e}")
            return AgentResponse(
                success=False,
                agent=name,
                result=None,
                confidence=0.0,
                error=str(e),
            )

