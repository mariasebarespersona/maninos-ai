"""
IncorporarAgent - Agente para el proceso INCORPORAR

Responsable de incorporar clientes al programa rent-to-own.

Según el Excel del cliente, INCORPORAR tiene 5 procedimientos:
1. Perfilar cliente (Anexo 1) - create_client_profile
2. Verificar identidad (KYC) - verify_client_kyc
3. Evaluar aspectos financieros (DTI) - calculate_client_dti
4. Personalizar contrato (Anexo 3) - generate_rto_contract
5. Comunicar y dar seguimiento - send_client_update

Formatos utilizados:
- Anexo 1: Solicitud de Crédito
- Anexo 3: Lease Agreement RTO (33 cláusulas)
- Dashboard de seguimiento

KPIs monitoreados:
- Tasa de cumplimiento ≥95%
- Cumplimiento KYC 100%
- Evaluaciones completadas ≤48h
- Tiempo de generación de contrato ≤2 días
- Satisfacción del cliente (NPS) ≥80
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime

from langchain_core.tools import tool

from agents.base_agent import BaseAgent

logger = logging.getLogger(__name__)


class IncorporarAgent(BaseAgent):
    """
    Agente especializado en el proceso INCORPORAR.
    
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
        logger.info("[IncorporarAgent] Initialized with 7 tools (includes get_client_info + Stripe Identity KYC)")
    
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
        """Get tools for IncorporarAgent (6 tools con Stripe Identity)."""
        return self._create_tools()
    
    def _create_tools(self) -> List:
        """
        Crea las 7 herramientas del proceso INCORPORAR (con Stripe Identity KYC).
        
        Returns:
            Lista de herramientas LangChain
        """
        from tools.incorporar_tools import (
            get_client_info,
            create_client_profile,
            start_kyc_verification,
            check_kyc_status,
            calculate_client_dti,
            generate_rto_contract,
            send_client_update
        )
        
        # Tool 0: Consultar cliente
        @tool
        def tool_get_client_info(
            client_id: Optional[str] = None,
            email: Optional[str] = None,
            phone: Optional[str] = None,
            full_name: Optional[str] = None
        ) -> str:
            """
            Consulta información de un cliente existente.
            
            Puede buscar por ID, email, teléfono o nombre (búsqueda parcial).
            Usa esta herramienta cuando el usuario quiera ver información de un cliente.
            
            Args:
                client_id: UUID del cliente (búsqueda exacta)
                email: Email del cliente (búsqueda exacta)
                phone: Teléfono del cliente (búsqueda exacta)
                full_name: Nombre del cliente (búsqueda parcial)
            
            Returns:
                Información del cliente encontrado
            """
            result = get_client_info(
                client_id=client_id,
                email=email,
                phone=phone,
                full_name=full_name
            )
            return str(result)
        
        # Tool 1: Perfilar cliente
        @tool
        def tool_create_client_profile(
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
            property_id: Optional[str] = None
        ) -> str:
            """
            Crea el perfil de un cliente capturando información personal y financiera (Anexo 1).
            
            Args:
                full_name: Nombre completo del cliente
                email: Correo electrónico
                phone: Teléfono
                date_of_birth: Fecha de nacimiento (YYYY-MM-DD)
                ssn_itin: SSN o ITIN
                marital_status: Estado civil (single, married, other)
                address: Dirección actual
                city: Ciudad
                state: Estado
                zip_code: Código postal
                residence_type: Tipo de residencia (owned, rented, other)
                employer: Nombre del empleador
                occupation: Ocupación
                employer_address: Dirección del empleador
                employer_phone: Teléfono del empleador
                monthly_income: Ingreso mensual
                years_at_employer: Años en el empleo
                months_at_employer: Meses adicionales en el empleo
                other_income_source: Si tiene otra fuente de ingresos
                other_income_amount: Monto de otra fuente de ingresos
                credit_requested_amount: Monto de crédito solicitado
                credit_purpose: Propósito del crédito
                desired_term_months: Plazo deseado en meses
                preferred_payment_method: Método de pago preferido
                reference1_name, reference1_phone, reference1_relationship: Primera referencia
                reference2_name, reference2_phone, reference2_relationship: Segunda referencia
                property_id: UUID de la propiedad de interés (opcional)
            
            Returns:
                Resultado del registro del perfil
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
                property_id=property_id
            )
            return str(result)
        
        # Tool 2a: Iniciar verificación KYC (Stripe Identity)
        @tool
        def tool_start_kyc_verification(
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
            3. Usar tool_check_kyc_status para consultar el resultado
            
            Args:
                client_id: UUID del cliente
                return_url: URL a donde redirigir después de verificación (opcional)
            
            Returns:
                Link de verificación para enviar al cliente
            """
            result = start_kyc_verification(
                client_id=client_id,
                return_url=return_url
            )
            return str(result)
        
        # Tool 2b: Consultar estado KYC
        @tool
        def tool_check_kyc_status(
            client_id: str
        ) -> str:
            """
            Consulta el estado de verificación KYC de un cliente.
            
            Verifica si el cliente ya completó la verificación en Stripe Identity.
            
            Estados posibles:
            - pending: Esperando que cliente complete
            - processing: Stripe está procesando
            - verified: Verificación exitosa
            - canceled: Sesión cancelada
            
            Args:
                client_id: UUID del cliente
            
            Returns:
                Estado actual de la verificación KYC
            """
            result = check_kyc_status(client_id=client_id)
            return str(result)
        
        # Tool 3: Calcular DTI
        @tool
        def tool_calculate_client_dti(
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
            
            Args:
                client_id: UUID del cliente
                monthly_income: Ingreso mensual (si no se proporciona, se obtiene de BD)
                other_income: Otros ingresos mensuales
                monthly_rent: Renta mensual actual
                monthly_debt_payments: Pagos mensuales de deudas
                monthly_utilities: Servicios mensuales
                monthly_other_expenses: Otros gastos mensuales
                proposed_monthly_payment: Pago mensual propuesto para el RTO
            
            Returns:
                Análisis de DTI con calificación
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
            return str(result)
        
        # Tool 4: Generar contrato RTO
        @tool
        def tool_generate_rto_contract(
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
            
            Args:
                client_id: UUID del cliente
                property_id: UUID de la propiedad
                term_months: Plazo en meses (24, 36, 48)
                monthly_rent: Renta mensual
                down_payment: Enganche
                purchase_option_price: Precio de opción de compra
                payment_day: Día del mes para pago (default 15)
                include_late_fees: Si incluir cargos por mora
                late_fee_per_day: Cargo por día de mora (default $15)
                nsf_fee: Cargo por cheque devuelto (default $250)
                notes: Notas adicionales
            
            Returns:
                Contrato generado con resumen de términos
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
            return str(result)
        
        # Tool 5: Enviar actualización al cliente
        @tool
        def tool_send_client_update(
            client_id: str,
            update_type: str,
            subject: Optional[str] = None,
            message: Optional[str] = None,
            include_payment_calendar: bool = False,
            contract_id: Optional[str] = None
        ) -> str:
            """
            Envía comunicación al cliente informando estatus, condiciones o calendario de pagos.
            
            Args:
                client_id: UUID del cliente
                update_type: Tipo de actualización (status, payment_reminder, welcome, contract_ready, custom)
                subject: Asunto del mensaje (opcional, se genera automáticamente)
                message: Mensaje personalizado (opcional)
                include_payment_calendar: Si incluir calendario de pagos
                contract_id: UUID del contrato (para información de pagos)
            
            Returns:
                Confirmación de comunicación enviada
            """
            result = send_client_update(
                client_id=client_id,
                update_type=update_type,
                subject=subject,
                message=message,
                include_payment_calendar=include_payment_calendar,
                contract_id=contract_id
            )
            return str(result)
        
        return [
            tool_get_client_info,
            tool_create_client_profile,
            tool_start_kyc_verification,
            tool_check_kyc_status,
            tool_calculate_client_dti,
            tool_generate_rto_contract,
            tool_send_client_update
        ]
