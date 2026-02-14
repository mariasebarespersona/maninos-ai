"""
Maninos AI Agents Package

Agents are SERVICES that employees invoke ON DEMAND when they need help.
They do NOT control the application flow - the employee does.

Available Agents:
- BuscadorAgent: Search market for mobile homes (Step 1.1)
- CostosAgent: Calculate renovation costs (Step 3.2)
- PrecioAgent: Calculate sale price (Step 4.1)
- FotosAgent: Classify photos before/after (Step 4.2)
- VozAgent: Process voice commands (Step 3)
- RenovacionAgent: Guide renovation process (Step 3 - Orchestrator)

Usage:
    POST /api/agents/buscador    → Search market
    POST /api/agents/costos      → Calculate costs
    POST /api/agents/precio      → Calculate price
    POST /api/agents/fotos       → Classify photos
    POST /api/agents/voz         → Voice commands
    POST /api/agents/renovacion  → Renovation assistant
    GET  /api/agents             → List agents

Following Agent Bible v1 principles:
- Each agent has ONE responsibility
- Database is source of truth
- Explicit tool descriptions
- Fail fast, fail loud
"""

from .base import AgentRequest, AgentResponse, BaseAgent, AgentRegistry
from .router import router as agents_router

# Import agents for direct use if needed
from .buscador import BuscadorAgent
from .costos import CostosAgent
from .precio import PrecioAgent
from .fotos import FotosAgent
from .voz import VozAgent
from .renovacion import RenovacionAgent

__all__ = [
    # Router
    "agents_router",
    
    # Base classes
    "AgentRequest",
    "AgentResponse", 
    "BaseAgent",
    "AgentRegistry",
    
    # Agents
    "BuscadorAgent",
    "CostosAgent",
    "PrecioAgent",
    "FotosAgent",
    "VozAgent",
    "RenovacionAgent",
]
