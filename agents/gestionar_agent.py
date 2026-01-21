"""
GestionarAgent - Portfolio Management Agent

Manages RTO contracts, payments, portfolio risk, and reporting.

Tools (5):
1. setup_automatic_payment - Configure Stripe auto-payments
2. monitor_payment_status - Check payment status and delinquency
3. assess_portfolio_risk - Classify portfolio by risk level
4. generate_monthly_report - Generate monthly performance report
5. generate_rto_contract - Generate RTO contracts (shared from IncorporarAgent)
"""

from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field
import logging

from .langgraph_agent import LangGraphAgent
from tools.gestionar_tools import (
    setup_automatic_payment,
    monitor_payment_status,
    assess_portfolio_risk,
    generate_monthly_report
)
# Shared tool from incorporar
from tools.incorporar_tools import generate_rto_contract

logger = logging.getLogger(__name__)


# ============================================================================
# Tool Input Schemas
# ============================================================================

class SetupAutomaticPaymentInput(BaseModel):
    client_id: str = Field(description="UUID del cliente")
    contract_id: str = Field(description="UUID del contrato RTO")
    payment_method_id: Optional[str] = Field(default=None, description="ID del método de pago en Stripe")
    payment_day: int = Field(default=15, description="Día del mes para el cobro (1-31)")


class MonitorPaymentStatusInput(BaseModel):
    contract_id: Optional[str] = Field(default=None, description="UUID del contrato específico")
    client_id: Optional[str] = Field(default=None, description="UUID del cliente")
    status_filter: Optional[str] = Field(default=None, description="Filtrar por estado: current, preventive, administrative, extrajudicial, judicial")
    include_late_only: bool = Field(default=False, description="Si True, solo muestra contratos con pagos atrasados")


class AssessPortfolioRiskInput(BaseModel):
    recalculate: bool = Field(default=True, description="Si True, recalcula días de morosidad basado en fechas")


class GenerateMonthlyReportInput(BaseModel):
    month: Optional[int] = Field(default=None, description="Mes del reporte (1-12)")
    year: Optional[int] = Field(default=None, description="Año del reporte")


class GenerateRTOContractInput(BaseModel):
    client_id: str = Field(description="UUID del cliente")
    property_id: str = Field(description="UUID de la propiedad")
    term_months: int = Field(description="Plazo en meses (24, 36, 48)")
    monthly_rent: float = Field(description="Renta mensual")
    down_payment: float = Field(default=0, description="Enganche")
    purchase_option_price: float = Field(default=0, description="Precio de opción de compra")
    purchase_price: float = Field(default=0, description="Precio de compra de la propiedad")
    payment_day: int = Field(default=15, description="Día del mes para pago")
    include_late_fees: bool = Field(default=True, description="Incluir cargos por mora")
    late_fee_per_day: float = Field(default=15.0, description="Cargo por día de mora")
    nsf_fee: float = Field(default=250.0, description="Cargo por cheque devuelto")
    notes: Optional[str] = Field(default=None, description="Notas adicionales")


# ============================================================================
# Tool Definitions
# ============================================================================

@tool("setup_automatic_payment", args_schema=SetupAutomaticPaymentInput)
def setup_automatic_payment_tool(
    client_id: str,
    contract_id: str,
    payment_method_id: Optional[str] = None,
    payment_day: int = 15
) -> dict:
    """
    Configura cobros automáticos via Stripe para un contrato RTO.
    Usa esta herramienta cuando el usuario quiera activar pagos automáticos.
    """
    return setup_automatic_payment(
        client_id=client_id,
        contract_id=contract_id,
        payment_method_id=payment_method_id,
        payment_day=payment_day
    )


@tool("monitor_payment_status", args_schema=MonitorPaymentStatusInput)
def monitor_payment_status_tool(
    contract_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    include_late_only: bool = False
) -> dict:
    """
    Revisa estado de pagos y morosidad de contratos.
    Usa esta herramienta para ver el estado de la cartera o pagos atrasados.
    """
    return monitor_payment_status(
        contract_id=contract_id,
        client_id=client_id,
        status_filter=status_filter,
        include_late_only=include_late_only
    )


@tool("assess_portfolio_risk", args_schema=AssessPortfolioRiskInput)
def assess_portfolio_risk_tool(
    recalculate: bool = True
) -> dict:
    """
    Clasifica la cartera por nivel de riesgo y actualiza estados de morosidad.
    Clasificación: current, preventive (1-5 días), administrative (6-30), 
    extrajudicial (31-60), judicial (>60).
    """
    return assess_portfolio_risk(recalculate=recalculate)


@tool("generate_monthly_report", args_schema=GenerateMonthlyReportInput)
def generate_monthly_report_tool(
    month: Optional[int] = None,
    year: Optional[int] = None
) -> dict:
    """
    Genera informe mensual de rentabilidad y ocupación.
    Incluye métricas de ingresos, ocupación y salud de cartera.
    """
    return generate_monthly_report(month=month, year=year)


@tool("generate_rto_contract", args_schema=GenerateRTOContractInput)
def generate_rto_contract_tool(
    client_id: str,
    property_id: str,
    term_months: int,
    monthly_rent: float,
    down_payment: float = 0,
    purchase_option_price: float = 0,
    purchase_price: float = 0,
    payment_day: int = 15,
    include_late_fees: bool = True,
    late_fee_per_day: float = 15.0,
    nsf_fee: float = 250.0,
    notes: Optional[str] = None
) -> dict:
    """
    Genera un contrato RTO personalizado (Anexo 3).
    Usa esta herramienta para crear contratos rent-to-own.
    """
    return generate_rto_contract(
        client_id=client_id,
        property_id=property_id,
        term_months=term_months,
        monthly_rent=monthly_rent,
        down_payment=down_payment,
        purchase_option_price=purchase_option_price,
        purchase_price=purchase_price,
        payment_day=payment_day,
        include_late_fees=include_late_fees,
        late_fee_per_day=late_fee_per_day,
        nsf_fee=nsf_fee,
        notes=notes
    )


# ============================================================================
# Agent Class
# ============================================================================

class GestionarAgent(LangGraphAgent):
    """
    Agente para el proceso GESTIONAR CARTERA de la Cadena de Valor Maninos.
    
    Responsabilidades:
    - Generar contratos RTO con condiciones claras
    - Configurar cobros automáticos via Stripe
    - Monitorear morosidad y clasificar cartera
    - Evaluar riesgos de la cartera
    - Generar reportes mensuales de rentabilidad
    
    KPIs:
    - 100% contratos validados legalmente
    - Cobranza puntual ≥95%
    - Morosidad ≤5%
    - Reducción impagos ≥10%/año
    - Reportes 100%
    """
    
    name: str = "GestionarAgent"
    description: str = "Gestiona la cartera de contratos RTO, pagos automáticos, morosidad y reportes mensuales."
    
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.3):
        """Initialize GestionarAgent."""
        super().__init__(name="GestionarAgent", model=model, temperature=temperature)
        logger.info(f"[GestionarAgent] Initialized with 5 tools")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for GestionarAgent."""
        from prompts.prompt_loader import build_agent_prompt
        try:
            return build_agent_prompt("gestionar_agent", **kwargs)
        except Exception as e:
            logger.warning(f"[GestionarAgent] Could not load prompt file: {e}")
            return self._get_default_prompt()
    
    def _get_default_prompt(self) -> str:
        """Default prompt if file not found."""
        return """Eres el agente de Gestión de Cartera de Maninos Capital LLC.

Tu responsabilidad es gestionar los contratos RTO activos, monitorear pagos y morosidad,
evaluar riesgos de la cartera, y generar reportes de rentabilidad.

## Herramientas Disponibles

1. **generate_rto_contract**: Crear contratos RTO (Anexo 3)
2. **setup_automatic_payment**: Configurar cobros automáticos Stripe
3. **monitor_payment_status**: Ver estado de pagos y morosidad
4. **assess_portfolio_risk**: Clasificar cartera por riesgo
5. **generate_monthly_report**: Generar reporte mensual

## KPIs Objetivo

- Contratos validados: 100%
- Cobranza puntual: ≥95%
- Morosidad: ≤5%
- Reducción impagos: ≥10%/año
- Reportes: 100%

## Clasificación de Morosidad

- **current**: Al día (0 días)
- **preventive**: 1-5 días de mora
- **administrative**: 6-30 días de mora
- **extrajudicial**: 31-60 días de mora
- **judicial**: >60 días de mora

Responde siempre en español. Sé proactivo en identificar riesgos y sugerir acciones.
"""
    
    def get_tools(self) -> List:
        """Get tools for GestionarAgent (5 tools)."""
        return [
            generate_rto_contract_tool,
            setup_automatic_payment_tool,
            monitor_payment_status_tool,
            assess_portfolio_risk_tool,
            generate_monthly_report_tool
        ]
