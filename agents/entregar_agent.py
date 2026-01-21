"""
EntregarAgent - Property Delivery Agent

Manages property delivery, title transfer, and loyalty programs.

Tools (4):
1. verify_purchase_eligibility - Confirm client met contractual conditions
2. process_title_transfer - Formalize transfer with TDHCA and IRS
3. offer_upgrade_options - Offer repurchase/renewal programs
4. process_referral_bonus - Process referral bonuses and discounts
"""

from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field
import logging

from .langgraph_agent import LangGraphAgent
from tools.entregar_tools import (
    verify_purchase_eligibility,
    process_title_transfer,
    offer_upgrade_options,
    process_referral_bonus
)

logger = logging.getLogger(__name__)


# ============================================================================
# Tool Input Schemas
# ============================================================================

class VerifyPurchaseEligibilityInput(BaseModel):
    client_id: Optional[str] = Field(default=None, description="UUID del cliente")
    contract_id: Optional[str] = Field(default=None, description="UUID del contrato")
    client_name: Optional[str] = Field(default=None, description="Nombre del cliente (para búsqueda)")


class ProcessTitleTransferInput(BaseModel):
    contract_id: str = Field(description="UUID del contrato")
    transfer_date: Optional[str] = Field(default=None, description="Fecha de transferencia (YYYY-MM-DD)")
    include_1099s: bool = Field(default=True, description="Incluir formulario IRS 1099-S")


class OfferUpgradeOptionsInput(BaseModel):
    client_id: Optional[str] = Field(default=None, description="UUID del cliente")
    client_name: Optional[str] = Field(default=None, description="Nombre del cliente (para búsqueda)")
    include_all_eligible: bool = Field(default=False, description="Si True, busca todos los clientes elegibles")


class ProcessReferralBonusInput(BaseModel):
    referrer_client_id: Optional[str] = Field(default=None, description="UUID del cliente que refirió")
    referrer_name: Optional[str] = Field(default=None, description="Nombre del cliente que refirió")
    referred_client_id: Optional[str] = Field(default=None, description="UUID del cliente referido")
    referred_email: Optional[str] = Field(default=None, description="Email del cliente referido")
    referral_code: Optional[str] = Field(default=None, description="Código de referido usado")
    trigger_event: str = Field(default="contract_signed", description="Evento: contract_signed, first_payment, purchase_complete")
    bonus_amount: float = Field(default=500, description="Monto del bono")
    bonus_type: str = Field(default="cash", description="Tipo: cash, rent_credit, discount")


# ============================================================================
# Tool Definitions
# ============================================================================

@tool("verify_purchase_eligibility", args_schema=VerifyPurchaseEligibilityInput)
def verify_purchase_eligibility_tool(
    client_id: Optional[str] = None,
    contract_id: Optional[str] = None,
    client_name: Optional[str] = None
) -> dict:
    """
    Confirma que el cliente cumplió las condiciones contractuales para ejercer la opción de compra.
    USAR SIEMPRE que el usuario mencione un nombre de cliente para verificar elegibilidad.
    Verifica: pagos al día, KYC, late fees, progreso de pagos ≥90%.
    """
    return verify_purchase_eligibility(
        client_id=client_id,
        contract_id=contract_id,
        client_name=client_name
    )


@tool("process_title_transfer", args_schema=ProcessTitleTransferInput)
def process_title_transfer_tool(
    contract_id: str,
    transfer_date: Optional[str] = None,
    include_1099s: bool = True
) -> dict:
    """
    Formaliza la transferencia de título ante TDHCA e IRS.
    Genera documentos: TDHCA Title Transfer, IRS 1099-S, Bill of Sale.
    Requiere verificar elegibilidad primero.
    """
    return process_title_transfer(
        contract_id=contract_id,
        transfer_date=transfer_date,
        include_1099s=include_1099s
    )


@tool("offer_upgrade_options", args_schema=OfferUpgradeOptionsInput)
def offer_upgrade_options_tool(
    client_id: Optional[str] = None,
    client_name: Optional[str] = None,
    include_all_eligible: bool = False
) -> dict:
    """
    Ofrece programas de recompra o renovación a clientes que completaron su contrato.
    Programas: Trade-up, Referral bonus, Loyalty discount.
    USAR SIEMPRE que el usuario mencione un nombre de cliente para ver opciones.
    """
    return offer_upgrade_options(
        client_id=client_id,
        client_name=client_name,
        include_all_eligible=include_all_eligible
    )


@tool("process_referral_bonus", args_schema=ProcessReferralBonusInput)
def process_referral_bonus_tool(
    referrer_client_id: Optional[str] = None,
    referrer_name: Optional[str] = None,
    referred_client_id: Optional[str] = None,
    referred_email: Optional[str] = None,
    referral_code: Optional[str] = None,
    trigger_event: str = "contract_signed",
    bonus_amount: float = 500,
    bonus_type: str = "cash"
) -> dict:
    """
    Procesa bonificaciones por referidos y descuentos recurrentes.
    USAR SIEMPRE que el usuario mencione un nombre de cliente referidor.
    Eventos trigger: contract_signed, first_payment, purchase_complete.
    """
    return process_referral_bonus(
        referrer_client_id=referrer_client_id,
        referrer_name=referrer_name,
        referred_client_id=referred_client_id,
        referred_email=referred_email,
        referral_code=referral_code,
        trigger_event=trigger_event,
        bonus_amount=bonus_amount,
        bonus_type=bonus_type
    )


# ============================================================================
# Agent Class
# ============================================================================

class EntregarAgent(LangGraphAgent):
    """
    Agente para el proceso ENTREGAR de la Cadena de Valor Maninos.
    
    Responsabilidades:
    - Verificar elegibilidad de compra del cliente
    - Procesar transferencia de título (TDHCA)
    - Generar documentos fiscales (IRS 1099-S)
    - Ofrecer programas de recompra/upgrade
    - Procesar bonos por referidos
    
    KPIs:
    - Casos aprobados: ≥80%
    - Cumplimiento legal TDHCA: 100%
    - Retención clientes: ≥20%
    - Clientes por referidos: 10%
    """
    
    name: str = "EntregarAgent"
    description: str = "Gestiona la entrega de propiedades, transferencia de títulos TDHCA, y programas de fidelización."
    
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.3):
        """Initialize EntregarAgent."""
        super().__init__(name="EntregarAgent", model=model, temperature=temperature)
        logger.info(f"[EntregarAgent] Initialized with 4 tools")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for EntregarAgent."""
        from prompts.prompt_loader import build_agent_prompt
        try:
            return build_agent_prompt("entregar_agent", **kwargs)
        except Exception as e:
            logger.warning(f"[EntregarAgent] Could not load prompt file: {e}")
            return self._get_default_prompt()
    
    def _get_default_prompt(self) -> str:
        """Default prompt if file not found."""
        return """Eres el agente de Entrega de Maninos Capital LLC.

Tu responsabilidad es gestionar la entrega final de propiedades a clientes que completaron
su contrato RTO, procesar transferencias de título, y fomentar la fidelización.

## Herramientas Disponibles

1. **verify_purchase_eligibility**: Verificar si cliente puede ejercer opción de compra
2. **process_title_transfer**: Procesar transferencia de título TDHCA e IRS
3. **offer_upgrade_options**: Ofrecer programas de recompra/upgrade
4. **process_referral_bonus**: Procesar bonos por referidos

## KPIs Objetivo

- Casos aprobados: ≥80%
- Cumplimiento legal TDHCA: 100%
- Retención clientes: ≥20%
- Clientes por referidos: 10%

## Requisitos de Elegibilidad

Para ejercer opción de compra, el cliente debe:
- Contrato activo y en buen estado
- KYC verificado
- Sin días de morosidad
- Al menos 90% de pagos programados completados
- Sin cargos por mora pendientes

## Documentos TDHCA

- Statement of Ownership and Location
- Bill of Sale
- IRS Form 1099-S (si aplica)

## Programas de Fidelización

- **Trade-up**: Upgrade a propiedad más grande
- **Referral Bonus**: $500 por cada referido exitoso
- **Loyalty Discount**: 2-5% según historial

Responde siempre en español. Celebra los logros del cliente al completar su compra.
"""
    
    def get_tools(self) -> List:
        """Get tools for EntregarAgent (4 tools)."""
        return [
            verify_purchase_eligibility_tool,
            process_title_transfer_tool,
            offer_upgrade_options_tool,
            process_referral_bonus_tool
        ]

