"""
Multi-Agent System for MANINOS AI.

Cadena de Valor Maninos - 6 Macroprocesos:
- COMERCIALIZAR (transversal): ComercializarAgent ✅
- ADQUIRIR: AdquirirAgent ✅
- INCORPORAR: IncorporarAgent ✅
- GESTIONAR_CARTERA: GestionarCarteraAgent (Semana 2)
- FONDEAR: FondearAgent (Semana 2)
- ENTREGAR: EntregarAgent (Semana 2)
"""

from .base_agent import BaseAgent
from .comercializar_agent import ComercializarAgent
from .adquirir_agent import AdquirirAgent
from .incorporar_agent import IncorporarAgent

__all__ = [
    "BaseAgent",
    "ComercializarAgent",
    "AdquirirAgent",
    "IncorporarAgent",
]
