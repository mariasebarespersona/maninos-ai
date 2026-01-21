"""
ComercializarAgent - Agente para el proceso COMERCIALIZAR

Según el Excel del cliente, COMERCIALIZAR tiene 7 procedimientos:
1. Adquirir activos - create_acquisition_committee_record
2. Finiquitar activos - process_disbursement  
3. Promover activos - promote_property_listing
4. Evaluar crédito y determinar riesgo - evaluate_credit_risk
5. Formalizar venta - formalize_sale
6. Administrar cartera y recuperar - manage_portfolio_recovery
7. Fidelizar - process_loyalty_program
"""

from typing import List, Optional, Dict, Any
from langchain_core.tools import tool
from pydantic import BaseModel, Field
import logging

# Use LangGraphAgent for persistent conversation memory
from .langgraph_agent import LangGraphAgent

logger = logging.getLogger(__name__)


# ============================================================================
# TOOL INPUT SCHEMAS
# ============================================================================

class AcquisitionCommitteeInput(BaseModel):
    """Input for create_acquisition_committee_record tool."""
    property_id: str = Field(..., description="UUID de la propiedad")
    committee_date: str = Field(..., description="Fecha del comité (YYYY-MM-DD)")
    market_analysis: str = Field(..., description="Resumen del análisis de mercado")
    technical_analysis: str = Field(..., description="Resumen del análisis técnico")
    legal_analysis: str = Field(..., description="Resumen del análisis legal")
    financial_analysis: str = Field(..., description="Resumen del análisis financiero")
    inspection_certified: bool = Field(..., description="Si la inspección está certificada")
    roi_projected: float = Field(..., description="ROI proyectado (%)")
    recommendation: str = Field(..., description="Recomendación: aprobar, rechazar, revisar")
    committee_members: List[str] = Field(..., description="Lista de miembros del comité")
    notes: Optional[str] = Field(None, description="Notas adicionales")


class DisbursementInput(BaseModel):
    """Input for process_disbursement tool."""
    property_id: str = Field(..., description="UUID de la propiedad")
    amount: float = Field(..., description="Monto del desembolso")
    disbursement_type: str = Field(..., description="Tipo: compra, reparacion, legal, otro")
    payment_method: str = Field(..., description="Método: transferencia, cheque, wire")
    authorized_by: str = Field(..., description="Nombre de quien autoriza")
    bank_account: Optional[str] = Field(None, description="Cuenta bancaria destino")
    reference_number: Optional[str] = Field(None, description="Número de referencia")
    notes: Optional[str] = Field(None, description="Notas adicionales")


class PromotePropertyInput(BaseModel):
    """Input for promote_property_listing tool."""
    property_id: Optional[str] = Field(None, description="UUID de la propiedad de interés")
    client_name: Optional[str] = Field(None, description="Nombre del cliente")
    client_email: Optional[str] = Field(None, description="Email del cliente")
    client_phone: Optional[str] = Field(None, description="Teléfono del cliente")
    documents_received: Optional[List[str]] = Field(None, description="Lista de documentos recibidos")
    identity_validated: bool = Field(False, description="Si la identidad fue validada")
    income_validated: bool = Field(False, description="Si los ingresos fueron validados")
    references_validated: bool = Field(False, description="Si las referencias fueron validadas")
    create_credit_application: bool = Field(False, description="Si crear solicitud de crédito")


class CreditRiskInput(BaseModel):
    """Input for evaluate_credit_risk tool."""
    client_id: str = Field(..., description="UUID del cliente")
    monthly_income: float = Field(..., description="Ingreso mensual bruto")
    monthly_expenses: float = Field(..., description="Gastos mensuales fijos")
    monthly_debt: float = Field(..., description="Deudas mensuales actuales")
    credit_score: Optional[int] = Field(None, description="Puntaje de crédito")
    credit_bureau_consulted: bool = Field(False, description="Si se consultó buró")
    employment_years: Optional[float] = Field(None, description="Años en empleo actual")
    property_id: Optional[str] = Field(None, description="UUID de propiedad de interés")
    desired_monthly_payment: Optional[float] = Field(None, description="Pago mensual deseado")


class FormalizeSaleInput(BaseModel):
    """Input for formalize_sale tool."""
    client_id: str = Field(..., description="UUID del cliente")
    property_id: str = Field(..., description="UUID de la propiedad")
    contract_type: str = Field(..., description="Tipo: rto_24, rto_36, rto_48, compra_directa")
    monthly_payment: float = Field(..., description="Pago mensual")
    down_payment: float = Field(..., description="Enganche")
    purchase_price: float = Field(..., description="Precio de compra")
    legal_validation_complete: bool = Field(False, description="Si validación legal está completa")
    expediente_complete: bool = Field(False, description="Si el expediente está completo")


class PortfolioRecoveryInput(BaseModel):
    """Input for manage_portfolio_recovery tool."""
    action: str = Field(..., description="Acción: classify, collect, recover, report")
    contract_id: Optional[str] = Field(None, description="UUID del contrato")
    client_id: Optional[str] = Field(None, description="UUID del cliente")
    days_overdue: Optional[int] = Field(None, description="Días de atraso")
    collection_action: Optional[str] = Field(None, description="Tipo: llamada, email, visita, legal")
    notes: Optional[str] = Field(None, description="Notas de la gestión")


class LoyaltyProgramInput(BaseModel):
    """Input for process_loyalty_program tool."""
    action: str = Field(..., description="Acción: final_inspection, title_transfer, tax_report, referral, recompra")
    client_id: str = Field(..., description="UUID del cliente")
    contract_id: Optional[str] = Field(None, description="UUID del contrato")
    property_id: Optional[str] = Field(None, description="UUID de la propiedad")
    referral_client_name: Optional[str] = Field(None, description="Nombre del cliente referido")
    referral_client_email: Optional[str] = Field(None, description="Email del cliente referido")
    referral_bonus: Optional[float] = Field(None, description="Monto del bono de referido")
    notes: Optional[str] = Field(None, description="Notas adicionales")


# ============================================================================
# TOOL DEFINITIONS (7 tools según el Excel)
# ============================================================================

@tool("create_acquisition_committee_record", args_schema=AcquisitionCommitteeInput)
def create_acquisition_committee_record_tool(
    property_id: str,
    committee_date: str,
    market_analysis: str,
    technical_analysis: str,
    legal_analysis: str,
    financial_analysis: str,
    inspection_certified: bool,
    roi_projected: float,
    recommendation: str,
    committee_members: List[str],
    notes: Optional[str] = None
) -> Dict:
    """
    Crea acta de comité para adquisición de activo.
    Procedimiento 1: Identificación de mercados, análisis técnico/legal/financiero,
    inspección certificada, autorización de compra.
    """
    from tools.comercializar_tools import create_acquisition_committee_record
    return create_acquisition_committee_record(
        property_id, committee_date, market_analysis, technical_analysis,
        legal_analysis, financial_analysis, inspection_certified,
        roi_projected, recommendation, committee_members, notes
    )


@tool("process_disbursement", args_schema=DisbursementInput)
def process_disbursement_tool(
    property_id: str,
    amount: float,
    disbursement_type: str,
    payment_method: str,
    authorized_by: str,
    bank_account: Optional[str] = None,
    reference_number: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict:
    """
    Procesa desembolso para finiquitar activo.
    Procedimiento 2: Autorización final, ejecución del desembolso,
    registro contable y conciliación.
    """
    from tools.comercializar_tools import process_disbursement
    return process_disbursement(
        property_id, amount, disbursement_type, payment_method,
        authorized_by, bank_account, reference_number, notes
    )


@tool("promote_property_listing", args_schema=PromotePropertyInput)
def promote_property_listing_tool(
    property_id: Optional[str] = None,
    client_name: Optional[str] = None,
    client_email: Optional[str] = None,
    client_phone: Optional[str] = None,
    documents_received: Optional[List[str]] = None,
    identity_validated: bool = False,
    income_validated: bool = False,
    references_validated: bool = False,
    create_credit_application: bool = False
) -> Dict:
    """
    Promueve activos y gestiona solicitudes de crédito.
    Procedimiento 3: Recepción de solicitud, integración de documentos,
    validación de identidad, ingresos y referencias.
    """
    from tools.comercializar_tools import promote_property_listing
    return promote_property_listing(
        property_id, client_name, client_email, client_phone,
        documents_received, identity_validated, income_validated,
        references_validated, create_credit_application
    )


@tool("evaluate_credit_risk", args_schema=CreditRiskInput)
def evaluate_credit_risk_tool(
    client_id: str,
    monthly_income: float,
    monthly_expenses: float,
    monthly_debt: float,
    credit_score: Optional[int] = None,
    credit_bureau_consulted: bool = False,
    employment_years: Optional[float] = None,
    property_id: Optional[str] = None,
    desired_monthly_payment: Optional[float] = None
) -> Dict:
    """
    Evalúa riesgo crediticio y genera dictamen.
    Procedimiento 4: Consulta de buró, cálculo de capacidad de pago,
    análisis de riesgo y elaboración de dictamen.
    """
    from tools.comercializar_tools import evaluate_credit_risk
    return evaluate_credit_risk(
        client_id, monthly_income, monthly_expenses, monthly_debt,
        credit_score, credit_bureau_consulted, employment_years,
        property_id, desired_monthly_payment
    )


@tool("formalize_sale", args_schema=FormalizeSaleInput)
def formalize_sale_tool(
    client_id: str,
    property_id: str,
    contract_type: str,
    monthly_payment: float,
    down_payment: float,
    purchase_price: float,
    legal_validation_complete: bool = False,
    expediente_complete: bool = False
) -> Dict:
    """
    Formaliza venta creando contrato y validando expediente.
    Procedimiento 5: Elaboración de contrato, validación legal,
    verificación de expediente completo y autorización final.
    """
    from tools.comercializar_tools import formalize_sale
    return formalize_sale(
        client_id, property_id, contract_type, monthly_payment,
        down_payment, purchase_price, legal_validation_complete, expediente_complete
    )


@tool("manage_portfolio_recovery", args_schema=PortfolioRecoveryInput)
def manage_portfolio_recovery_tool(
    action: str,
    contract_id: Optional[str] = None,
    client_id: Optional[str] = None,
    days_overdue: Optional[int] = None,
    collection_action: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict:
    """
    Administra cartera y gestiona recuperación de pagos.
    Procedimiento 6: Cobro automatizado, clasificación de cartera
    (preventiva, adm., extrajud., jud.), gestión de recuperación.
    """
    from tools.comercializar_tools import manage_portfolio_recovery
    return manage_portfolio_recovery(
        action, contract_id, client_id, days_overdue, collection_action, notes
    )


@tool("process_loyalty_program", args_schema=LoyaltyProgramInput)
def process_loyalty_program_tool(
    action: str,
    client_id: str,
    contract_id: Optional[str] = None,
    property_id: Optional[str] = None,
    referral_client_name: Optional[str] = None,
    referral_client_email: Optional[str] = None,
    referral_bonus: Optional[float] = None,
    notes: Optional[str] = None
) -> Dict:
    """
    Gestiona programa de fidelización.
    Procedimiento 7: Inspección final, transferencia de título,
    reportes fiscales (TDHCA, IRS 1099-S), programas de recompra/referidos.
    """
    from tools.comercializar_tools import process_loyalty_program
    return process_loyalty_program(
        action, client_id, contract_id, property_id,
        referral_client_name, referral_client_email, referral_bonus, notes
    )


# ============================================================================
# COMERCIALIZAR AGENT
# ============================================================================

class ComercializarAgent(LangGraphAgent):
    """
    Agente para el proceso COMERCIALIZAR de la Cadena de Valor Maninos.
    
    Usa LangGraph con checkpointer para memoria persistente de conversación.
    
    Según el Excel del cliente, maneja 7 procedimientos:
    1. Adquirir activos - Acta de comité de adquisición
    2. Finiquitar activos - Desembolsos y registro contable
    3. Promover activos - Recepción de solicitudes, validaciones
    4. Evaluar crédito - Dictamen crediticio, análisis de riesgo
    5. Formalizar venta - Contratos, checklist mesa de control
    6. Administrar cartera - Clasificación, cobranza, recuperación
    7. Fidelizar - TDHCA, IRS 1099-S, referidos, recompra
    """
    
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.7):
        """Initialize ComercializarAgent."""
        super().__init__(name="ComercializarAgent", model=model, temperature=temperature)
        logger.info(f"[ComercializarAgent] Initialized with 7 tools")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for ComercializarAgent from file."""
        from prompts.prompt_loader import load_prompt
        
        try:
            prompt = load_prompt("agents/comercializar_agent/_base.md")
            return prompt
        except Exception as e:
            logger.warning(f"[ComercializarAgent] Could not load prompt file: {e}")
            # Fallback prompt
            return """Eres el asistente de COMERCIALIZACIÓN de Maninos Capital LLC.

Manejas los 7 procedimientos del proceso COMERCIALIZAR:
1. Adquirir activos - Acta de comité de adquisición
2. Finiquitar activos - Desembolsos y registro contable
3. Promover activos - Recepción de solicitudes, validaciones
4. Evaluar crédito - Dictamen crediticio, análisis de riesgo
5. Formalizar venta - Contratos, checklist mesa de control
6. Administrar cartera - Clasificación, cobranza, recuperación
7. Fidelizar - TDHCA, IRS 1099-S, referidos, recompra

Responde siempre en español."""
    
    def get_tools(self) -> List:
        """Get tools for ComercializarAgent (7 tools según Excel)."""
        return [
            create_acquisition_committee_record_tool,
            process_disbursement_tool,
            promote_property_listing_tool,
            evaluate_credit_risk_tool,
            formalize_sale_tool,
            manage_portfolio_recovery_tool,
            process_loyalty_program_tool,
        ]
    
    def is_out_of_scope(self, user_input: str) -> tuple[bool, Optional[str]]:
        """Check if request is out of scope for ComercializarAgent."""
        user_lower = user_input.lower()
        
        # Keywords for other specific agents
        adquirir_keywords = ["buscar propiedad", "sourcear", "zillow", "mhvillage", "checklist 26"]
        incorporar_keywords = ["perfil cliente", "anexo 1", "kyc", "personalizar contrato"]
        fondear_keywords = ["inversionista", "pagaré", "sec", "reg d", "nota de deuda"]
        gestionar_keywords = ["cobro automático", "stripe", "pago mensual", "reporte mensual"]
        entregar_keywords = ["elegibilidad compra", "título propiedad", "upgrade"]
        
        for kw in adquirir_keywords:
            if kw in user_lower:
                return True, "AdquirirAgent"
        
        for kw in incorporar_keywords:
            if kw in user_lower:
                return True, "IncorporarAgent"
        
        for kw in fondear_keywords:
            if kw in user_lower:
                return True, "FondearAgent"
        
        for kw in gestionar_keywords:
            if kw in user_lower:
                return True, "GestionarCarteraAgent"
        
        for kw in entregar_keywords:
            if kw in user_lower:
                return True, "EntregarAgent"
        
        return False, None
