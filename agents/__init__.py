"""
Multi-Agent System for MANINOS AI.

Cadena de Valor Maninos - 6 Macroprocesos:
- COMERCIALIZAR (transversal): ComercializarAgent ✅
- ADQUIRIR: AdquirirAgent ✅
- INCORPORAR: IncorporarAgent ✅
- GESTIONAR_CARTERA: GestionarCarteraAgent (pendiente)
- FONDEAR: FondearAgent (pendiente)
- ENTREGAR: EntregarAgent (pendiente)

Legacy:
- PropertyAgent: Legacy property management
- DocsAgent: Document management
"""

from .base_agent import BaseAgent
from .property_agent import PropertyAgent
from .docs_agent import DocsAgent
from .comercializar_agent import ComercializarAgent
from .adquirir_agent import AdquirirAgent
from .incorporar_agent import IncorporarAgent

__all__ = [
    "BaseAgent",
    "PropertyAgent",
    "DocsAgent",
    "ComercializarAgent",
    "AdquirirAgent",
    "IncorporarAgent",
]

