"""
Property Service - Business logic for property state transitions.

PURCHASE PIPELINE (market_listings — Feb 2026):
  available → contacted → negotiating → evaluating → docs_pending → locked → purchased
  At "purchased" a new row is created in the `properties` table.

SALE PIPELINE (properties):
  purchased → published → [renovating → published] → reserved → sold
"""

from typing import Optional
from api.models.schemas import PropertyStatus


class PropertyService:
    """
    Manages property state transitions according to the business flow.
    
    Valid transitions:
    - purchased  -> published   (Paso 2: Fotos/Publicar)
    - published  -> renovating  (Paso 3: Renovar - OPTIONAL)
    - published  -> reserved    (Venta iniciada — oculta del catálogo público)
    - published  -> sold        (Venta directa sin paso reserva — legacy)
    - renovating -> published   (Paso 4: Volver a Publicar)
    - reserved   -> sold        (Pago confirmado / venta completada)
    - reserved   -> published   (Venta cancelada — vuelve al catálogo)
    """
    
    VALID_TRANSITIONS: dict[PropertyStatus, list[PropertyStatus]] = {
        PropertyStatus.PURCHASED: [
            PropertyStatus.PUBLISHED,    # Publicar directamente
            PropertyStatus.RENOVATING,   # Renovar antes de publicar (limpieza, etc.)
        ],
        PropertyStatus.PUBLISHED: [
            PropertyStatus.RENOVATING,
            PropertyStatus.RESERVED,
            PropertyStatus.SOLD,
        ],
        PropertyStatus.RENOVATING: [PropertyStatus.PUBLISHED],
        PropertyStatus.RESERVED: [
            PropertyStatus.SOLD,       # Venta completada
            PropertyStatus.PUBLISHED,  # Venta cancelada → vuelve al catálogo
        ],
        PropertyStatus.SOLD: [],  # Final state
    }
    
    @classmethod
    def can_transition(
        cls, 
        current_status: PropertyStatus, 
        new_status: PropertyStatus
    ) -> bool:
        """Check if a status transition is valid."""
        valid_next = cls.VALID_TRANSITIONS.get(current_status, [])
        return new_status in valid_next
    
    @classmethod
    def get_available_actions(cls, status: PropertyStatus) -> list[str]:
        """
        Get available actions based on current status.
        Returns human-readable action names.
        """
        actions_map = {
            PropertyStatus.PURCHASED: ["Publicar", "Renovar antes de Publicar"],
            PropertyStatus.PUBLISHED: ["Vender", "Iniciar Renovación"],
            PropertyStatus.RESERVED: ["Completar Venta", "Cancelar Venta"],
            PropertyStatus.RENOVATING: ["Publicar"],
            PropertyStatus.SOLD: [],  # No actions available
        }
        return actions_map.get(status, [])
    
    @classmethod
    def validate_transition(
        cls, 
        current_status: PropertyStatus, 
        new_status: PropertyStatus
    ) -> tuple[bool, Optional[str]]:
        """
        Validate a transition and return error message if invalid.
        Returns (is_valid, error_message).
        """
        if cls.can_transition(current_status, new_status):
            return True, None
        
        valid_next = cls.VALID_TRANSITIONS.get(current_status, [])
        if not valid_next:
            return False, f"Property is in final state '{current_status}', no transitions allowed"
        
        valid_names = [s.value for s in valid_next]
        return False, (
            f"Cannot transition from '{current_status}' to '{new_status}'. "
            f"Valid transitions: {', '.join(valid_names)}"
        )
    
    @classmethod
    def is_sold_before_renovation(
        cls, 
        is_renovated: bool, 
        new_status: PropertyStatus
    ) -> bool:
        """
        Check if property is being sold before renovation.
        Used to track this metric in the sale record.
        """
        return new_status == PropertyStatus.SOLD and not is_renovated


