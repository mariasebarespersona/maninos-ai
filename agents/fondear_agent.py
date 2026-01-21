"""
FondearAgent - Investor Management Agent

Manages investors, capital, debt notes, and SEC compliance.

Tools (7):
1. create_financial_plan - Project funding needs
2. manage_investor_pipeline - Manage investor prospects
3. onboard_investor - Verify investor identity and documents
4. generate_debt_note - Create promissory notes (12% annual)
5. validate_sec_compliance - Ensure Reg. D compliance
6. calculate_debt_ratio - Calculate debt-to-capital ratio
7. send_investor_update - Send communication to investors
"""

from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field
import logging

from .langgraph_agent import LangGraphAgent
from tools.fondear_tools import (
    create_financial_plan,
    manage_investor_pipeline,
    onboard_investor,
    generate_debt_note,
    validate_sec_compliance,
    calculate_debt_ratio,
    send_investor_update
)

logger = logging.getLogger(__name__)


# ============================================================================
# Tool Input Schemas
# ============================================================================

class CreateFinancialPlanInput(BaseModel):
    plan_name: str = Field(description="Nombre del plan (ej. 'Plan 2026')")
    plan_year: int = Field(description="Año del plan")
    target_acquisitions: int = Field(description="Número de propiedades a adquirir")
    target_capital_needed: float = Field(description="Capital total necesario")
    target_investors: int = Field(description="Número de inversionistas a captar")
    projected_revenue: Optional[float] = Field(default=None, description="Ingresos proyectados")
    projected_expenses: Optional[float] = Field(default=None, description="Gastos proyectados")


class ManageInvestorPipelineInput(BaseModel):
    action: str = Field(description="Acción: 'list', 'create', 'update', 'get'")
    investor_id: Optional[str] = Field(default=None, description="UUID del inversionista")
    full_name: Optional[str] = Field(default=None, description="Nombre completo")
    email: Optional[str] = Field(default=None, description="Email")
    phone: Optional[str] = Field(default=None, description="Teléfono")
    status: Optional[str] = Field(default=None, description="Estado: prospect, active, inactive, churned")
    notes: Optional[str] = Field(default=None, description="Notas adicionales")


class OnboardInvestorInput(BaseModel):
    investor_id: str = Field(description="UUID del inversionista")
    ssn_ein: Optional[str] = Field(default=None, description="SSN o EIN para propósitos fiscales")
    address: Optional[str] = Field(default=None, description="Dirección")
    city: Optional[str] = Field(default=None, description="Ciudad")
    state: Optional[str] = Field(default=None, description="Estado")
    zip_code: Optional[str] = Field(default=None, description="Código postal")
    accreditation_method: Optional[str] = Field(default=None, description="Método de acreditación: income, net_worth, professional, entity")


class GenerateDebtNoteInput(BaseModel):
    investor_id: str = Field(description="UUID del inversionista")
    amount: float = Field(description="Monto de la inversión")
    interest_rate: float = Field(default=12.0, description="Tasa anual (default 12%)")
    term_months: int = Field(default=12, description="Plazo en meses")
    payment_frequency: str = Field(default="monthly", description="Frecuencia: monthly, quarterly, annual, at_maturity")
    linked_property_ids: Optional[List[str]] = Field(default=None, description="Property IDs que financia esta inversión")


class ValidateSECComplianceInput(BaseModel):
    investor_id: str = Field(description="UUID del inversionista a validar")


class CalculateDebtRatioInput(BaseModel):
    pass  # No required inputs


class SendInvestorUpdateInput(BaseModel):
    investor_id: Optional[str] = Field(default=None, description="UUID del inversionista")
    update_type: str = Field(default="general", description="Tipo: general, payment, quarterly_report, maturity_notice")
    subject: Optional[str] = Field(default=None, description="Asunto del mensaje")
    message: Optional[str] = Field(default=None, description="Contenido del mensaje")
    send_to_all: bool = Field(default=False, description="Si True, envía a todos los inversionistas activos")


# ============================================================================
# Tool Definitions
# ============================================================================

@tool("create_financial_plan", args_schema=CreateFinancialPlanInput)
def create_financial_plan_tool(
    plan_name: str,
    plan_year: int,
    target_acquisitions: int,
    target_capital_needed: float,
    target_investors: int,
    projected_revenue: Optional[float] = None,
    projected_expenses: Optional[float] = None
) -> dict:
    """
    Proyecta necesidades de fondeo según metas anuales.
    Crea un plan financiero con objetivos de adquisiciones, capital e inversionistas.
    """
    return create_financial_plan(
        plan_name=plan_name,
        plan_year=plan_year,
        target_acquisitions=target_acquisitions,
        target_capital_needed=target_capital_needed,
        target_investors=target_investors,
        projected_revenue=projected_revenue,
        projected_expenses=projected_expenses
    )


@tool("manage_investor_pipeline", args_schema=ManageInvestorPipelineInput)
def manage_investor_pipeline_tool(
    action: str = "list",
    investor_id: Optional[str] = None,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    status: Optional[str] = None,
    notes: Optional[str] = None
) -> dict:
    """
    Gestiona el pipeline de inversionistas prospecto.
    Acciones: list (listar), create (crear), update (actualizar), get (obtener).
    USAR SIEMPRE que el usuario mencione un nombre de inversionista para buscarlo.
    """
    return manage_investor_pipeline(
        action=action,
        investor_id=investor_id,
        full_name=full_name,
        email=email,
        phone=phone,
        status=status,
        notes=notes
    )


@tool("onboard_investor", args_schema=OnboardInvestorInput)
def onboard_investor_tool(
    investor_id: str,
    ssn_ein: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    accreditation_method: Optional[str] = None
) -> dict:
    """
    Verifica identidad y documentos del inversionista para onboarding.
    Completa KYC y verifica estatus de inversionista acreditado.
    """
    return onboard_investor(
        investor_id=investor_id,
        ssn_ein=ssn_ein,
        address=address,
        city=city,
        state=state,
        zip_code=zip_code,
        accreditation_method=accreditation_method
    )


@tool("generate_debt_note", args_schema=GenerateDebtNoteInput)
def generate_debt_note_tool(
    investor_id: str,
    amount: float,
    interest_rate: float = 12.0,
    term_months: int = 12,
    payment_frequency: str = "monthly",
    linked_property_ids: Optional[List[str]] = None
) -> dict:
    """
    Elabora contratos de deuda (pagarés) con tasa de 12% anual.
    Crea una nota de deuda formal con calendario de pagos.
    """
    return generate_debt_note(
        investor_id=investor_id,
        amount=amount,
        interest_rate=interest_rate,
        term_months=term_months,
        payment_frequency=payment_frequency,
        linked_property_ids=linked_property_ids
    )


@tool("validate_sec_compliance", args_schema=ValidateSECComplianceInput)
def validate_sec_compliance_tool(
    investor_id: str
) -> dict:
    """
    Asegura cumplimiento con Regulación D de la SEC.
    Verifica requisitos para Rule 506(b) o 506(c).
    """
    return validate_sec_compliance(investor_id=investor_id)


@tool("calculate_debt_ratio", args_schema=CalculateDebtRatioInput)
def calculate_debt_ratio_tool() -> dict:
    """
    Calcula el ratio deuda-capital para evitar sobreapalancamiento.
    Objetivo: mantener ratio ≤2:1.
    """
    return calculate_debt_ratio()


@tool("send_investor_update", args_schema=SendInvestorUpdateInput)
def send_investor_update_tool(
    investor_id: Optional[str] = None,
    update_type: str = "general",
    subject: Optional[str] = None,
    message: Optional[str] = None,
    send_to_all: bool = False
) -> dict:
    """
    Envía comunicación a inversionistas.
    Tipos: general, payment, quarterly_report, maturity_notice.
    """
    return send_investor_update(
        investor_id=investor_id,
        update_type=update_type,
        subject=subject,
        message=message,
        send_to_all=send_to_all
    )


# ============================================================================
# Agent Class
# ============================================================================

class FondearAgent(LangGraphAgent):
    """
    Agente para el proceso FONDEAR de la Cadena de Valor Maninos.
    
    Responsabilidades:
    - Planear financieramente según metas de crecimiento
    - Gestionar pipeline de inversionistas
    - Onboarding de inversionistas (KYC, acreditación)
    - Generar notas de deuda (pagarés 12% anual)
    - Asegurar cumplimiento SEC Reg. D
    - Monitorear ratio deuda-capital
    - Comunicación con inversionistas
    
    KPIs:
    - Cumplimiento presupuestal: 100%
    - Presentaciones completadas: 90%
    - Cumplimiento pagos: 100%
    - Cumplimiento legal SEC: 100%
    - Ratio deuda-capital: ≤2:1
    """
    
    name: str = "FondearAgent"
    description: str = "Gestiona inversionistas, capital, notas de deuda y cumplimiento SEC."
    
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.3):
        """Initialize FondearAgent."""
        super().__init__(name="FondearAgent", model=model, temperature=temperature)
        logger.info(f"[FondearAgent] Initialized with 7 tools")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for FondearAgent."""
        from prompts.prompt_loader import build_agent_prompt
        try:
            return build_agent_prompt("fondear_agent", **kwargs)
        except Exception as e:
            logger.warning(f"[FondearAgent] Could not load prompt file: {e}")
            return self._get_default_prompt()
    
    def _get_default_prompt(self) -> str:
        """Default prompt if file not found."""
        return """Eres el agente de Fondeo de Maninos Capital LLC.

Tu responsabilidad es gestionar las relaciones con inversionistas, estructurar notas de deuda,
asegurar cumplimiento con regulaciones SEC, y monitorear la salud financiera de la empresa.

## Herramientas Disponibles

1. **create_financial_plan**: Crear plan financiero anual
2. **manage_investor_pipeline**: Gestionar pipeline de inversionistas
3. **onboard_investor**: Verificar y activar inversionistas
4. **generate_debt_note**: Crear notas de deuda (pagarés)
5. **validate_sec_compliance**: Verificar cumplimiento SEC
6. **calculate_debt_ratio**: Calcular ratio deuda-capital
7. **send_investor_update**: Comunicación con inversionistas

## KPIs Objetivo

- Cumplimiento presupuestal: 100%
- Presentaciones completadas: 90%
- Cumplimiento pagos: 100%
- Cumplimiento legal SEC: 100%
- Ratio deuda-capital: ≤2:1

## Regulación SEC

- **Rule 506(b)**: Hasta 35 inversionistas no acreditados
- **Rule 506(c)**: Solo inversionistas acreditados (puede publicitar)
- **Inversionista acreditado**: $200K ingreso o $1M patrimonio neto

## Términos Estándar

- Tasa de interés: 12% anual
- Plazo: 12 meses (estándar)
- Pagos: Mensuales, trimestrales, o al vencimiento

Responde siempre en español. Prioriza cumplimiento regulatorio en todas las decisiones.
"""
    
    def get_tools(self) -> List:
        """Get tools for FondearAgent (7 tools)."""
        return [
            create_financial_plan_tool,
            manage_investor_pipeline_tool,
            onboard_investor_tool,
            generate_debt_note_tool,
            validate_sec_compliance_tool,
            calculate_debt_ratio_tool,
            send_investor_update_tool
        ]

