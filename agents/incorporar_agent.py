"""
IncorporarAgent - Agente para el proceso INCORPORAR

Responsable de incorporar clientes al programa rent-to-own.

Según el Excel del cliente, INCORPORAR tiene 5 procedimientos:
1. Perfilar cliente (Anexo 1) - create_client_profile
2. Verificar identidad (KYC) - start_kyc_verification / check_kyc_status
3. Evaluar aspectos financieros (DTI) - calculate_client_dti
4. Personalizar contrato (Anexo 3) - generate_rto_contract
5. Comunicar y dar seguimiento - send_client_update

Herramientas adicionales:
- get_client_info: Consultar información de cliente existente
- generate_referral_code: Generar código de referido único
- validate_referral_code: Validar código de referido
- register_referral: Registrar referido manualmente
- get_referral_stats: Ver estadísticas de referidos

Formatos utilizados:
- Anexo 1: Solicitud de Crédito
- Anexo 3: Lease Agreement RTO (33 cláusulas)
- Dashboard de seguimiento
- Dashboard de referidos

KPIs monitoreados:
- Tasa de cumplimiento ≥95%
- Cumplimiento KYC 100%
- Evaluaciones completadas ≤48h
- Tiempo de generación de contrato ≤2 días
- Satisfacción del cliente (NPS) ≥80
- Clientes por referidos ≥10%
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from langchain_core.tools import tool
from pydantic import BaseModel, Field

# Use LangGraphAgent for persistent conversation memory
from agents.langgraph_agent import LangGraphAgent

# Import underlying functions from incorporar_tools
from tools.incorporar_tools import (
    get_client_info,
    create_client_profile,
    start_kyc_verification,
    check_kyc_status,
    calculate_client_dti,
    generate_rto_contract,
    send_client_update,
    generate_referral_code,
    validate_referral_code,
    register_referral,
    get_referral_stats,
)

logger = logging.getLogger(__name__)


# =============================================================================
# PYDANTIC INPUT SCHEMAS (at module level for consistency)
# =============================================================================

class GetClientInfoInput(BaseModel):
    """Schema for get_client_info tool - busca clientes en la base de datos."""
    client_id: Optional[str] = Field(default=None, description="UUID del cliente (si lo conoces)")
    email: Optional[str] = Field(default=None, description="Email del cliente")
    phone: Optional[str] = Field(default=None, description="Teléfono del cliente")
    full_name: Optional[str] = Field(default=None, description="Nombre del cliente - USAR SIEMPRE que el usuario mencione un nombre como 'María García', 'Juan Pérez', etc.")


class CreateClientProfileInput(BaseModel):
    """Schema for create_client_profile tool - based on Anexo 1."""
    full_name: str = Field(..., description="Nombre completo del cliente")
    email: str = Field(..., description="Correo electrónico")
    phone: str = Field(..., description="Teléfono")
    date_of_birth: Optional[str] = Field(default=None, description="Fecha de nacimiento (YYYY-MM-DD)")
    ssn_itin: Optional[str] = Field(default=None, description="SSN o ITIN")
    marital_status: Optional[str] = Field(default=None, description="Estado civil (single, married, other)")
    address: Optional[str] = Field(default=None, description="Dirección actual")
    city: Optional[str] = Field(default=None, description="Ciudad")
    state: Optional[str] = Field(default=None, description="Estado")
    zip_code: Optional[str] = Field(default=None, description="Código postal")
    residence_type: Optional[str] = Field(default=None, description="Tipo de residencia (owned, rented, other)")
    employer: Optional[str] = Field(default=None, description="Nombre del empleador")
    occupation: Optional[str] = Field(default=None, description="Ocupación")
    employer_address: Optional[str] = Field(default=None, description="Dirección del empleador")
    employer_phone: Optional[str] = Field(default=None, description="Teléfono del empleador")
    monthly_income: Optional[float] = Field(default=None, description="Ingreso mensual")
    years_at_employer: Optional[int] = Field(default=None, description="Años en el empleo")
    months_at_employer: Optional[int] = Field(default=None, description="Meses adicionales en el empleo")
    other_income_source: bool = Field(default=False, description="Si tiene otra fuente de ingresos")
    other_income_amount: Optional[float] = Field(default=None, description="Monto de otra fuente de ingresos")
    credit_requested_amount: Optional[float] = Field(default=None, description="Monto de crédito solicitado")
    credit_purpose: Optional[str] = Field(default=None, description="Propósito del crédito")
    desired_term_months: Optional[int] = Field(default=None, description="Plazo deseado en meses")
    preferred_payment_method: Optional[str] = Field(default=None, description="Método de pago preferido")
    reference1_name: Optional[str] = Field(default=None, description="Nombre de primera referencia")
    reference1_phone: Optional[str] = Field(default=None, description="Teléfono de primera referencia")
    reference1_relationship: Optional[str] = Field(default=None, description="Relación con primera referencia")
    reference2_name: Optional[str] = Field(default=None, description="Nombre de segunda referencia")
    reference2_phone: Optional[str] = Field(default=None, description="Teléfono de segunda referencia")
    reference2_relationship: Optional[str] = Field(default=None, description="Relación con segunda referencia")
    property_id: Optional[str] = Field(default=None, description="UUID de la propiedad de interés")
    referral_code: Optional[str] = Field(default=None, description="Código de referido si fue referido (ej: JUAN2026)")


class StartKYCInput(BaseModel):
    """Schema for start_kyc_verification tool."""
    client_id: str = Field(..., description="UUID del cliente")
    return_url: Optional[str] = Field(default=None, description="URL a donde redirigir después de verificación")


class CheckKYCInput(BaseModel):
    """Schema for check_kyc_status tool."""
    client_id: str = Field(..., description="UUID del cliente")


class CalculateDTIInput(BaseModel):
    """Schema for calculate_client_dti tool."""
    client_id: str = Field(..., description="UUID del cliente")
    monthly_income: Optional[float] = Field(default=None, description="Ingreso mensual (si no se proporciona, se obtiene de BD)")
    other_income: Optional[float] = Field(default=None, description="Otros ingresos mensuales")
    monthly_rent: float = Field(default=0, description="Renta mensual actual")
    monthly_debt_payments: float = Field(default=0, description="Pagos mensuales de deudas")
    monthly_utilities: float = Field(default=0, description="Servicios mensuales")
    monthly_other_expenses: float = Field(default=0, description="Otros gastos mensuales")
    proposed_monthly_payment: Optional[float] = Field(default=None, description="Pago mensual propuesto para el RTO")


class GenerateRTOContractInput(BaseModel):
    """Schema for generate_rto_contract tool - based on Anexo 3."""
    client_id: str = Field(..., description="UUID del cliente")
    property_id: str = Field(..., description="UUID de la propiedad")
    term_months: int = Field(default=36, description="Plazo en meses (24, 36, 48)")
    monthly_rent: float = Field(default=0, description="Renta mensual")
    down_payment: float = Field(default=0, description="Enganche")
    purchase_option_price: float = Field(default=0, description="Precio de opción de compra")
    payment_day: int = Field(default=15, description="Día del mes para pago")
    include_late_fees: bool = Field(default=True, description="Si incluir cargos por mora")
    late_fee_per_day: float = Field(default=15.0, description="Cargo por día de mora")
    nsf_fee: float = Field(default=250.0, description="Cargo por cheque devuelto")
    notes: Optional[str] = Field(default=None, description="Notas adicionales")


class SendClientUpdateInput(BaseModel):
    """Schema for send_client_update tool."""
    client_id: str = Field(..., description="UUID del cliente")
    update_type: str = Field(..., description="Tipo de actualización (status, payment_reminder, welcome, contract_ready, custom)")
    subject: Optional[str] = Field(default=None, description="Asunto del mensaje")
    message: Optional[str] = Field(default=None, description="Mensaje personalizado")
    include_payment_calendar: bool = Field(default=False, description="Si incluir calendario de pagos")
    contract_id: Optional[str] = Field(default=None, description="UUID del contrato (para información de pagos)")


class GenerateReferralCodeInput(BaseModel):
    """Schema for generate_referral_code tool."""
    client_id: str = Field(..., description="UUID del cliente")


class ValidateReferralCodeInput(BaseModel):
    """Schema for validate_referral_code tool."""
    referral_code: str = Field(..., description="Código de referido a validar (ej: JUAN2026)")


class RegisterReferralInput(BaseModel):
    """Schema for register_referral tool."""
    referral_code: str = Field(..., description="Código usado por el referido")
    referred_name: str = Field(..., description="Nombre del referido")
    referred_email: Optional[str] = Field(default=None, description="Email del referido")
    referred_phone: Optional[str] = Field(default=None, description="Teléfono del referido")
    referred_client_id: Optional[str] = Field(default=None, description="ID del cliente referido si ya existe")
    bonus_amount: float = Field(default=500.0, description="Monto del bono por referido exitoso")


class GetReferralStatsInput(BaseModel):
    """Schema for get_referral_stats tool."""
    client_id: str = Field(..., description="UUID del cliente")


# =============================================================================
# TOOLS AT MODULE LEVEL (following same pattern as AdquirirAgent & ComercializarAgent)
# =============================================================================

@tool("get_client_info", args_schema=GetClientInfoInput)
def get_client_info_tool(
    client_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    full_name: Optional[str] = None
) -> dict:
    """
    Busca y obtiene información de un cliente en la base de datos de Maninos.
    
    IMPORTANTE: SIEMPRE usa esta herramienta PRIMERO cuando el usuario mencione 
    un nombre de cliente como "María García", "Juan Pérez", etc.
    
    Ejemplos de cuándo usar:
    - "Genera contrato para María García" → get_client_info(full_name="María García")
    - "Información del cliente Juan" → get_client_info(full_name="Juan")
    - "DTI para Ana López" → get_client_info(full_name="Ana López")
    
    La búsqueda por nombre es parcial y case-insensitive.
    Retorna el client_id (UUID) necesario para otras operaciones.
    """
    result = get_client_info(
        client_id=client_id,
        email=email,
        phone=phone,
        full_name=full_name
    )
    return result


@tool("create_client_profile", args_schema=CreateClientProfileInput)
def create_client_profile_tool(
    full_name: str,
    email: str,
    phone: str,
    date_of_birth: Optional[str] = None,
    ssn_itin: Optional[str] = None,
    marital_status: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    residence_type: Optional[str] = None,
    employer: Optional[str] = None,
    occupation: Optional[str] = None,
    employer_address: Optional[str] = None,
    employer_phone: Optional[str] = None,
    monthly_income: Optional[float] = None,
    years_at_employer: Optional[int] = None,
    months_at_employer: Optional[int] = None,
    other_income_source: bool = False,
    other_income_amount: Optional[float] = None,
    credit_requested_amount: Optional[float] = None,
    credit_purpose: Optional[str] = None,
    desired_term_months: Optional[int] = None,
    preferred_payment_method: Optional[str] = None,
    reference1_name: Optional[str] = None,
    reference1_phone: Optional[str] = None,
    reference1_relationship: Optional[str] = None,
    reference2_name: Optional[str] = None,
    reference2_phone: Optional[str] = None,
    reference2_relationship: Optional[str] = None,
    property_id: Optional[str] = None,
    referral_code: Optional[str] = None
) -> str:
    """
    Crea el perfil de un cliente capturando información personal y financiera (Anexo 1).
    Si el cliente fue referido, incluye el código de referido para vincularlos.
    """
    result = create_client_profile(
        full_name=full_name,
        email=email,
        phone=phone,
        date_of_birth=date_of_birth,
        ssn_itin=ssn_itin,
        marital_status=marital_status,
        address=address,
        city=city,
        state=state,
        zip_code=zip_code,
        residence_type=residence_type,
        employer=employer,
        occupation=occupation,
        employer_address=employer_address,
        employer_phone=employer_phone,
        monthly_income=monthly_income,
        years_at_employer=years_at_employer,
        months_at_employer=months_at_employer,
        other_income_source=other_income_source,
        other_income_amount=other_income_amount,
        credit_requested_amount=credit_requested_amount,
        credit_purpose=credit_purpose,
        desired_term_months=desired_term_months,
        preferred_payment_method=preferred_payment_method,
        reference1_name=reference1_name,
        reference1_phone=reference1_phone,
        reference1_relationship=reference1_relationship,
        reference2_name=reference2_name,
        reference2_phone=reference2_phone,
        reference2_relationship=reference2_relationship,
        property_id=property_id,
        referral_code=referral_code
    )
    return result


@tool("start_kyc_verification", args_schema=StartKYCInput)
def start_kyc_verification_tool(
    client_id: str,
    return_url: Optional[str] = None
) -> str:
    """
    Inicia verificación de identidad automática con Stripe Identity.
    
    Crea una sesión de verificación donde el cliente puede subir su ID
    y selfie. Stripe verifica automáticamente la autenticidad del documento.
    
    Flujo:
    1. Esta herramienta crea la sesión y devuelve un link
    2. El cliente completa la verificación en el link
    3. Usar check_kyc_status para consultar el resultado
    """
    result = start_kyc_verification(
        client_id=client_id,
        return_url=return_url
    )
    return result


@tool("check_kyc_status", args_schema=CheckKYCInput)
def check_kyc_status_tool(client_id: str) -> dict:
    """
    Consulta el estado de verificación KYC de un cliente.
    
    Estados posibles:
    - pending: Esperando que cliente complete
    - processing: Stripe está procesando
    - verified: Verificación exitosa
    - canceled: Sesión cancelada
    """
    result = check_kyc_status(client_id=client_id)
    return result


@tool("calculate_client_dti", args_schema=CalculateDTIInput)
def calculate_client_dti_tool(
    client_id: str,
    monthly_income: Optional[float] = None,
    other_income: Optional[float] = None,
    monthly_rent: float = 0,
    monthly_debt_payments: float = 0,
    monthly_utilities: float = 0,
    monthly_other_expenses: float = 0,
    proposed_monthly_payment: Optional[float] = None
) -> str:
    """
    Calcula el DTI (Debt-to-Income) del cliente.
    Revisa relación deuda/ingreso y estabilidad financiera.
    """
    result = calculate_client_dti(
        client_id=client_id,
        monthly_income=monthly_income,
        other_income=other_income,
        monthly_rent=monthly_rent,
        monthly_debt_payments=monthly_debt_payments,
        monthly_utilities=monthly_utilities,
        monthly_other_expenses=monthly_other_expenses,
        proposed_monthly_payment=proposed_monthly_payment
    )
    return result


@tool("generate_rto_contract", args_schema=GenerateRTOContractInput)
def generate_rto_contract_tool(
    client_id: str,
    property_id: str,
    term_months: int = 36,
    monthly_rent: float = 0,
    down_payment: float = 0,
    purchase_option_price: float = 0,
    payment_day: int = 15,
    include_late_fees: bool = True,
    late_fee_per_day: float = 15.0,
    nsf_fee: float = 250.0,
    notes: Optional[str] = None
) -> str:
    """
    Genera un contrato RTO personalizado (Anexo 3).
    Ajusta el plan rent-to-own (24, 36 o 48 meses) según perfil de riesgo.
    """
    result = generate_rto_contract(
        client_id=client_id,
        property_id=property_id,
        term_months=term_months,
        monthly_rent=monthly_rent,
        down_payment=down_payment,
        purchase_option_price=purchase_option_price,
        payment_day=payment_day,
        include_late_fees=include_late_fees,
        late_fee_per_day=late_fee_per_day,
        nsf_fee=nsf_fee,
        notes=notes
    )
    return result


@tool("send_client_update", args_schema=SendClientUpdateInput)
def send_client_update_tool(
    client_id: str,
    update_type: str,
    subject: Optional[str] = None,
    message: Optional[str] = None,
    include_payment_calendar: bool = False,
    contract_id: Optional[str] = None
) -> str:
    """
    Envía comunicación al cliente informando estatus, condiciones o calendario de pagos.
    """
    result = send_client_update(
        client_id=client_id,
        update_type=update_type,
        subject=subject,
        message=message,
        include_payment_calendar=include_payment_calendar,
        contract_id=contract_id
    )
    return result


@tool("generate_referral_code", args_schema=GenerateReferralCodeInput)
def generate_referral_code_tool(client_id: str) -> dict:
    """
    Genera un código de referido único para un cliente.
    
    El código se genera en formato NOMBRE2026 (primeras 4 letras del nombre + año).
    Si el cliente ya tiene un código, lo retorna sin crear uno nuevo.
    """
    result = generate_referral_code(client_id=client_id)
    return result


@tool("validate_referral_code", args_schema=ValidateReferralCodeInput)
def validate_referral_code_tool(referral_code: str) -> dict:
    """
    Valida un código de referido y retorna información del cliente que refiere.
    Usa esta herramienta para verificar si un código de referido es válido.
    """
    result = validate_referral_code(referral_code=referral_code)
    return result


@tool("register_referral", args_schema=RegisterReferralInput)
def register_referral_tool(
    referral_code: str,
    referred_name: str,
    referred_email: Optional[str] = None,
    referred_phone: Optional[str] = None,
    referred_client_id: Optional[str] = None,
    bonus_amount: float = 500.0
) -> str:
    """
    Registra un referido manualmente cuando alguien usa un código de referido.
    El bono se marca como pendiente hasta que el referido firme un contrato.
    """
    result = register_referral(
        referral_code=referral_code,
        referred_name=referred_name,
        referred_email=referred_email,
        referred_phone=referred_phone,
        referred_client_id=referred_client_id,
        bonus_amount=bonus_amount
    )
    return result


@tool("get_referral_stats", args_schema=GetReferralStatsInput)
def get_referral_stats_tool(client_id: str) -> dict:
    """
    Obtiene las estadísticas de referidos de un cliente.
    Muestra código de referido, cantidad de referidos, bonos ganados y pendientes.
    """
    result = get_referral_stats(client_id=client_id)
    return result


# =============================================================================
# AGENT CLASS (references module-level tools, same pattern as other agents)
# =============================================================================

class IncorporarAgent(LangGraphAgent):
    """
    Agente especializado en el proceso INCORPORAR.
    
    Usa LangGraph con checkpointer para memoria persistente de conversación.
    Esto permite que "sí" después de "¿iniciar KYC?" tenga contexto completo.
    
    Gestiona la incorporación de clientes al programa rent-to-own,
    incluyendo perfil del cliente, KYC, evaluación financiera (DTI),
    generación de contrato y seguimiento.
    """
    
    def __init__(self, model: str = "gpt-4o", temperature: float = 0.3):
        """
        Inicializa el IncorporarAgent.
        
        Args:
            model: Modelo LLM a utilizar
            temperature: Temperatura para el LLM
        """
        super().__init__(name="IncorporarAgent", model=model, temperature=temperature)
        logger.info("[IncorporarAgent] Initialized with 11 tools (includes KYC + 4 referral tools)")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for IncorporarAgent from file."""
        from prompts.prompt_loader import load_prompt
        
        try:
            prompt = load_prompt("agents/incorporar_agent/_base.md")
            return prompt
        except Exception as e:
            logger.warning(f"[IncorporarAgent] Could not load prompt file: {e}")
            # Fallback prompt
            return """Eres el asistente de INCORPORACIÓN de Maninos Capital LLC.

Manejas los 6 procedimientos del proceso INCORPORAR:
1. Perfilar cliente (Anexo 1) - Capturar información personal y financiera
2. Iniciar KYC - Crear sesión de verificación con Stripe Identity
3. Consultar KYC - Verificar estado de la verificación
4. Evaluar DTI - Calcular relación deuda/ingreso
5. Generar contrato RTO - Personalizar contrato rent-to-own (Anexo 3)
6. Comunicar al cliente - Enviar actualizaciones y calendarios

Responde siempre en español."""
    
    def get_tools(self) -> List:
        """
        Get tools for IncorporarAgent (11 tools with Stripe Identity + referrals).
        References module-level tools for consistency with other agents.
        """
        return [
            get_client_info_tool,
            create_client_profile_tool,
            start_kyc_verification_tool,
            check_kyc_status_tool,
            calculate_client_dti_tool,
            generate_rto_contract_tool,
            send_client_update_tool,
            generate_referral_code_tool,
            validate_referral_code_tool,
            register_referral_tool,
            get_referral_stats_tool,
        ]
