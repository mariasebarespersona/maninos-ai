"""
Multi-Agent System for MANINOS AI.

Cadena de Valor Maninos - 6 Macroprocesos:
- COMERCIALIZAR (transversal): ComercializarAgent ✅
- ADQUIRIR: AdquirirAgent ✅
- INCORPORAR: IncorporarAgent ✅
- GESTIONAR_CARTERA: GestionarAgent ✅
- FONDEAR: FondearAgent ✅
- ENTREGAR: EntregarAgent ✅
"""

from .base_agent import BaseAgent
from .comercializar_agent import ComercializarAgent
from .adquirir_agent import AdquirirAgent
from .incorporar_agent import IncorporarAgent
from .gestionar_agent import GestionarAgent
from .fondear_agent import FondearAgent
from .entregar_agent import EntregarAgent

__all__ = [
    "BaseAgent",
    "ComercializarAgent",
    "AdquirirAgent",
    "IncorporarAgent",
    "GestionarAgent",
    "FondearAgent",
    "EntregarAgent",
]
