"""
Multi-Agent System for MANINOS AI.

Exports:
- PropertyAgent: Property acquisition (70%/80% rule, inspections, contracts)
- DocsAgent: Document management (PDFs, emails)
- BaseAgent: Base class for all agents
"""

from .base_agent import BaseAgent
from .property_agent import PropertyAgent
from .docs_agent import DocsAgent

__all__ = [
    "BaseAgent",
    "PropertyAgent",
    "DocsAgent"
]

