"""
Public API Routes - Portal Clientes
No authentication required for reading published properties.
"""

from .properties import router as properties_router
from .purchases import router as purchases_router
from .clients import router as clients_router

__all__ = ["properties_router", "purchases_router", "clients_router"]

