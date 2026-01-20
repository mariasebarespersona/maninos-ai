"""
Flow Validator V2 - Cadena de Valor Maninos (6 Macroprocesos)

Basado en el diagrama oficial de la Cadena de Valor:
- COMERCIALIZAR: Transversal, opcional, sin conexiones directas
- ADQUIRIR → INCORPORAR → GESTIONAR_CARTERA → ENTREGAR (flujo lineal)
- GESTIONAR_CARTERA → FONDEAR (pagos financian inversionistas)
- FONDEAR → ADQUIRIR (capital para comprar propiedades)
- ENTREGAR → INCORPORAR (ciclo: referidos/nueva compra)
"""

import logging
from typing import Dict, Any, Optional, Tuple, List
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger("flow_validator_v2")


# ============================================================================
# ENUMS Y CONSTANTES
# ============================================================================

class Process(str, Enum):
    """Los 6 macroprocesos de la Cadena de Valor Maninos."""
    COMERCIALIZAR = "COMERCIALIZAR"
    ADQUIRIR = "ADQUIRIR"
    INCORPORAR = "INCORPORAR"
    GESTIONAR_CARTERA = "GESTIONAR_CARTERA"
    FONDEAR = "FONDEAR"
    ENTREGAR = "ENTREGAR"


class EntityType(str, Enum):
    """Tipos de entidad que manejan los procesos."""
    PROPERTY = "property"
    CLIENT = "client"
    INVESTOR = "investor"
    RTO_CONTRACT = "rto_contract"
    PAYMENT = "payment"
    INVESTMENT = "investment"


# ============================================================================
# DEFINICIÓN DE PROCESOS Y STAGES
# ============================================================================

PROCESS_DEFINITIONS = {
    Process.COMERCIALIZAR: {
        "description": "Proceso transversal de marketing y captación de clientes",
        "is_transversal": True,  # Puede ocurrir en cualquier momento
        "is_optional": True,     # No es obligatorio
        "entity_types": [EntityType.PROPERTY, EntityType.CLIENT],
        "stages": [
            "promocion",           # Propiedad en catálogo
            "lead_recibido",       # Cliente potencial interesado
            "prequalificacion",    # Pre-calificación DTI rápida
            "asignado",            # Cliente asignado a propiedad
        ],
        "agent": "ComercializarAgent",
        "connects_to": [],  # No tiene conexiones directas (transversal)
    },
    
    Process.ADQUIRIR: {
        "description": "Adquisición de propiedades (mobile homes)",
        "is_transversal": False,
        "is_optional": False,
        "entity_types": [EntityType.PROPERTY],
        "stages": [
            "sourcing",            # Identificación de propiedad
            "evaluacion_inicial",  # Checklist 26 puntos + 70% rule
            "due_diligence",       # Inspección + 80% rule
            "negociacion",         # Negociación con vendedor
            "registrado",          # Propiedad adquirida y registrada
        ],
        "agent": "AdquirirAgent",
        "connects_to": [Process.INCORPORAR],
        "receives_from": [Process.FONDEAR],  # Capital para comprar
    },
    
    Process.INCORPORAR: {
        "description": "Incorporación de clientes y generación de contratos RTO",
        "is_transversal": False,
        "is_optional": False,
        "entity_types": [EntityType.CLIENT, EntityType.RTO_CONTRACT],
        "stages": [
            "datos_basicos",       # Anexo 1 - Solicitud de crédito
            "kyc_pending",         # Verificación de identidad pendiente
            "kyc_verified",        # KYC completado
            "dti_calculado",       # DTI evaluado
            "contrato_generado",   # Anexo 3 - Contrato RTO generado
            "contrato_firmado",    # Contrato firmado por ambas partes
        ],
        "agent": "IncorporarAgent",
        "connects_to": [Process.GESTIONAR_CARTERA],
        "receives_from": [Process.ADQUIRIR, Process.ENTREGAR],  # Nueva propiedad o ciclo
    },
    
    Process.GESTIONAR_CARTERA: {
        "description": "Gestión de pagos y cartera de clientes activos",
        "is_transversal": False,
        "is_optional": False,
        "entity_types": [EntityType.RTO_CONTRACT, EntityType.PAYMENT],
        "stages": [
            "activo",              # Contrato activo, pagos al día
            "al_dia",              # Cliente al día con pagos
            "preventivo",          # 1-5 días de mora
            "administrativo",      # 6-30 días de mora
            "extrajudicial",       # 31-60 días de mora
            "judicial",            # >60 días de mora
            "elegible_compra",     # Cliente puede ejercer opción de compra
        ],
        "agent": "GestionarCarteraAgent",
        "connects_to": [Process.ENTREGAR, Process.FONDEAR],
        "receives_from": [Process.INCORPORAR],
    },
    
    Process.FONDEAR: {
        "description": "Gestión de inversionistas y financiamiento",
        "is_transversal": False,
        "is_optional": False,
        "entity_types": [EntityType.INVESTOR, EntityType.INVESTMENT],
        "stages": [
            "prospecto",           # Inversionista potencial
            "activo",              # Inversionista con fondos comprometidos
            "desembolsado",        # Fondos transferidos
            "en_rendimiento",      # Recibiendo pagos de rendimiento
            "liquidado",           # Inversión devuelta
        ],
        "agent": "FondearAgent",
        "connects_to": [Process.ADQUIRIR],  # Capital para comprar propiedades
        "receives_from": [Process.GESTIONAR_CARTERA],  # Pagos de clientes
    },
    
    Process.ENTREGAR: {
        "description": "Cierre de venta y transferencia de título",
        "is_transversal": False,
        "is_optional": False,
        "entity_types": [EntityType.RTO_CONTRACT, EntityType.CLIENT],
        "stages": [
            "elegible",            # Cliente cumple requisitos para compra
            "documentos_preparados",  # TDHCA y docs listos
            "titulo_en_proceso",   # Título siendo transferido
            "cerrado",             # Venta completada
        ],
        "agent": "EntregarAgent",
        "connects_to": [Process.INCORPORAR],  # Ciclo: referidos o nueva compra
        "receives_from": [Process.GESTIONAR_CARTERA],
    },
}


# ============================================================================
# CLASE PRINCIPAL: ManinosFlowValidatorV2
# ============================================================================

@dataclass
class StageValidation:
    """Resultado de validación de un stage."""
    is_valid: bool
    current_stage: str
    current_process: Process
    missing_data: List[str]
    can_advance: bool
    next_stage: Optional[str]
    next_process: Optional[Process]
    message: str


class ManinosFlowValidatorV2:
    """
    Validador de flujo para la Cadena de Valor Maninos.
    
    Maneja los 6 macroprocesos y sus transiciones según el diagrama oficial.
    """
    
    def __init__(self):
        """Initialize flow validator."""
        self.processes = PROCESS_DEFINITIONS
        logger.info("[FlowValidatorV2] Initialized with 6 processes")
    
    # ========================================================================
    # MÉTODOS PRINCIPALES
    # ========================================================================
    
    def get_process_for_entity(self, entity_type: str, entity_data: Dict[str, Any]) -> Process:
        """
        Determina qué proceso debe manejar una entidad basándose en su tipo y estado.
        
        Args:
            entity_type: Tipo de entidad (property, client, etc.)
            entity_data: Datos de la entidad
        
        Returns:
            Process enum
        """
        entity_enum = EntityType(entity_type)
        
        # Propiedades
        if entity_enum == EntityType.PROPERTY:
            inventory_status = entity_data.get("inventory_status", "available")
            acquisition_stage = entity_data.get("acquisition_stage", "sourcing")
            
            # Si está en adquisición
            if acquisition_stage in ["sourcing", "evaluacion_inicial", "due_diligence", "negociacion"]:
                return Process.ADQUIRIR
            
            # Si está disponible para venta → Comercializar
            if inventory_status == "available" and entity_data.get("listing_active"):
                return Process.COMERCIALIZAR
            
            return Process.ADQUIRIR
        
        # Clientes
        if entity_enum == EntityType.CLIENT:
            process_stage = entity_data.get("process_stage", "datos_basicos")
            
            # Si viene de comercializar (lead)
            if process_stage in ["lead", "prequalificacion"]:
                return Process.COMERCIALIZAR
            
            # Si está en proceso de incorporación
            if process_stage in ["datos_basicos", "kyc_pending", "kyc_verified", "dti_calculado", "contrato_generado"]:
                return Process.INCORPORAR
            
            # Si ya es cliente activo
            if process_stage == "active":
                return Process.GESTIONAR_CARTERA
            
            # Si está completando compra
            if process_stage == "completing_purchase":
                return Process.ENTREGAR
            
            return Process.INCORPORAR
        
        # Contratos RTO
        if entity_enum == EntityType.RTO_CONTRACT:
            status = entity_data.get("status", "draft")
            
            if status in ["draft", "pending_signature"]:
                return Process.INCORPORAR
            if status in ["active", "defaulted"]:
                return Process.GESTIONAR_CARTERA
            if status in ["converted_to_purchase", "completed"]:
                return Process.ENTREGAR
            
            return Process.GESTIONAR_CARTERA
        
        # Pagos
        if entity_enum == EntityType.PAYMENT:
            return Process.GESTIONAR_CARTERA
        
        # Inversionistas e Inversiones
        if entity_enum in [EntityType.INVESTOR, EntityType.INVESTMENT]:
            return Process.FONDEAR
        
        # Default
        logger.warning(f"[FlowValidatorV2] Unknown entity type: {entity_type}")
        return Process.ADQUIRIR
    
    def get_agent_for_process(self, process: Process) -> str:
        """
        Obtiene el nombre del agente que maneja un proceso.
        
        Args:
            process: Proceso de la cadena de valor
        
        Returns:
            Nombre del agente (e.g., "AdquirirAgent")
        """
        return self.processes[process]["agent"]
    
    def get_stages_for_process(self, process: Process) -> List[str]:
        """
        Obtiene los stages de un proceso.
        
        Args:
            process: Proceso de la cadena de valor
        
        Returns:
            Lista de stages en orden
        """
        return self.processes[process]["stages"]
    
    def validate_stage_transition(
        self,
        process: Process,
        current_stage: str,
        target_stage: str
    ) -> Tuple[bool, str]:
        """
        Valida si una transición de stage es permitida.
        
        Args:
            process: Proceso actual
            current_stage: Stage actual
            target_stage: Stage objetivo
        
        Returns:
            Tuple of (is_valid, reason)
        """
        stages = self.get_stages_for_process(process)
        
        if current_stage not in stages:
            return False, f"Stage '{current_stage}' no existe en proceso {process.value}"
        
        if target_stage not in stages:
            return False, f"Stage '{target_stage}' no existe en proceso {process.value}"
        
        current_idx = stages.index(current_stage)
        target_idx = stages.index(target_stage)
        
        # Permitir avanzar al siguiente o retroceder (para correcciones)
        if target_idx == current_idx + 1:
            return True, "Avance válido al siguiente stage"
        
        if target_idx < current_idx:
            return True, "Retroceso permitido (corrección)"
        
        if target_idx > current_idx + 1:
            return False, f"No se puede saltar stages. Debe ir de '{current_stage}' a '{stages[current_idx + 1]}'"
        
        return False, "Transición inválida"
    
    def get_next_stage(self, process: Process, current_stage: str) -> Optional[str]:
        """
        Obtiene el siguiente stage en un proceso.
        
        Args:
            process: Proceso actual
            current_stage: Stage actual
        
        Returns:
            Siguiente stage o None si es el último
        """
        stages = self.get_stages_for_process(process)
        
        if current_stage not in stages:
            return None
        
        current_idx = stages.index(current_stage)
        
        if current_idx >= len(stages) - 1:
            return None  # Es el último stage
        
        return stages[current_idx + 1]
    
    def get_connected_processes(self, process: Process) -> List[Process]:
        """
        Obtiene los procesos a los que puede fluir desde un proceso dado.
        
        Args:
            process: Proceso actual
        
        Returns:
            Lista de procesos conectados
        """
        return self.processes[process].get("connects_to", [])
    
    def can_transition_to_process(
        self,
        from_process: Process,
        to_process: Process,
        current_stage: str
    ) -> Tuple[bool, str]:
        """
        Valida si se puede transicionar a otro proceso.
        
        Args:
            from_process: Proceso actual
            to_process: Proceso destino
            current_stage: Stage actual en el proceso origen
        
        Returns:
            Tuple of (is_valid, reason)
        """
        # COMERCIALIZAR es transversal, puede conectar con cualquier proceso
        if from_process == Process.COMERCIALIZAR:
            if to_process in [Process.INCORPORAR, Process.ADQUIRIR]:
                return True, "Comercializar puede inyectar leads a cualquier proceso"
            return False, f"Comercializar no se conecta directamente con {to_process.value}"
        
        # Verificar conexiones definidas
        connected = self.get_connected_processes(from_process)
        
        if to_process not in connected:
            return False, f"{from_process.value} no se conecta con {to_process.value}"
        
        # Verificar que esté en el stage final para transicionar
        stages = self.get_stages_for_process(from_process)
        final_stage = stages[-1]
        
        if current_stage != final_stage:
            return False, f"Debe completar el proceso {from_process.value} (llegar a '{final_stage}') antes de pasar a {to_process.value}"
        
        return True, f"Transición válida de {from_process.value} a {to_process.value}"
    
    # ========================================================================
    # MÉTODOS DE VALIDACIÓN DE DATOS
    # ========================================================================
    
    def get_required_data_for_stage(
        self,
        process: Process,
        stage: str
    ) -> List[str]:
        """
        Obtiene los datos requeridos para completar un stage.
        
        Args:
            process: Proceso
            stage: Stage
        
        Returns:
            Lista de campos requeridos
        """
        # Definir requisitos por proceso y stage
        requirements = {
            Process.ADQUIRIR: {
                "sourcing": ["name", "address"],
                "evaluacion_inicial": ["asking_price", "market_value"],
                "due_diligence": ["repair_estimate", "title_status", "arv"],
                "negociacion": ["purchase_price"],
                "registrado": [],
            },
            Process.INCORPORAR: {
                "datos_basicos": ["full_name", "phone", "email"],
                "kyc_pending": [],
                "kyc_verified": ["kyc_status"],
                "dti_calculado": ["monthly_income", "dti_ratio"],
                "contrato_generado": ["property_id"],
                "contrato_firmado": ["signed_by_tenant_at"],
            },
            Process.GESTIONAR_CARTERA: {
                "activo": [],
                "al_dia": [],
                "preventivo": [],
                "administrativo": [],
                "extrajudicial": [],
                "judicial": [],
                "elegible_compra": [],
            },
            Process.FONDEAR: {
                "prospecto": ["full_name", "email"],
                "activo": ["total_committed"],
                "desembolsado": ["amount", "interest_rate"],
                "en_rendimiento": [],
                "liquidado": [],
            },
            Process.ENTREGAR: {
                "elegible": [],
                "documentos_preparados": [],
                "titulo_en_proceso": [],
                "cerrado": [],
            },
            Process.COMERCIALIZAR: {
                "promocion": ["listing_active"],
                "lead_recibido": ["full_name"],
                "prequalificacion": ["monthly_income"],
                "asignado": ["property_id"],
            },
        }
        
        return requirements.get(process, {}).get(stage, [])
    
    def validate_data_for_stage(
        self,
        process: Process,
        stage: str,
        data: Dict[str, Any]
    ) -> StageValidation:
        """
        Valida si los datos son suficientes para un stage.
        
        Args:
            process: Proceso
            stage: Stage
            data: Datos de la entidad
        
        Returns:
            StageValidation con resultado
        """
        required = self.get_required_data_for_stage(process, stage)
        missing = [field for field in required if not data.get(field)]
        
        is_valid = len(missing) == 0
        can_advance = is_valid
        next_stage = self.get_next_stage(process, stage) if is_valid else None
        
        # Verificar si hay transición a otro proceso
        next_process = None
        if is_valid and next_stage is None:
            # Estamos en el último stage, verificar procesos conectados
            connected = self.get_connected_processes(process)
            if connected:
                next_process = connected[0]  # Por defecto el primero
        
        message = (
            f"Stage '{stage}' completo" if is_valid 
            else f"Faltan datos: {', '.join(missing)}"
        )
        
        return StageValidation(
            is_valid=is_valid,
            current_stage=stage,
            current_process=process,
            missing_data=missing,
            can_advance=can_advance,
            next_stage=next_stage,
            next_process=next_process,
            message=message,
        )
    
    # ========================================================================
    # MÉTODOS DE AYUDA PARA AGENTES
    # ========================================================================
    
    def get_user_friendly_message(
        self,
        process: Process,
        stage: str,
        missing_data: List[str]
    ) -> str:
        """
        Genera un mensaje amigable para el usuario sobre qué hacer.
        
        Args:
            process: Proceso actual
            stage: Stage actual
            missing_data: Datos faltantes
        
        Returns:
            Mensaje en español
        """
        messages = {
            Process.ADQUIRIR: {
                "sourcing": "Identifica una propiedad para evaluar. Necesito el nombre y dirección.",
                "evaluacion_inicial": "Proporciona el precio de venta y valor de mercado para calcular la regla del 70%.",
                "due_diligence": "Completa la inspección: estimado de reparaciones, estado del título y ARV.",
                "negociacion": "Indica el precio de compra negociado.",
                "registrado": "Propiedad registrada exitosamente.",
            },
            Process.INCORPORAR: {
                "datos_basicos": "Necesito los datos básicos del cliente: nombre completo, teléfono y email.",
                "kyc_pending": "Verifica la identidad del cliente (KYC manual).",
                "kyc_verified": "KYC verificado. Ahora calcula el DTI del cliente.",
                "dti_calculado": "DTI calculado. Genera el contrato RTO.",
                "contrato_generado": "Contrato generado. Espera la firma del cliente.",
                "contrato_firmado": "Contrato firmado. El cliente está activo.",
            },
            Process.GESTIONAR_CARTERA: {
                "activo": "Contrato activo. Monitorea los pagos.",
                "al_dia": "Cliente al día con sus pagos.",
                "preventivo": "⚠️ Cliente en mora preventiva (1-5 días). Envía recordatorio.",
                "administrativo": "⚠️ Cliente en mora administrativa (6-30 días). Escalar a cobranza.",
                "extrajudicial": "🔴 Cliente en mora extrajudicial (31-60 días). Acción requerida.",
                "judicial": "🔴 Cliente en mora judicial (>60 días). Proceso legal.",
                "elegible_compra": "✅ Cliente elegible para ejercer opción de compra.",
            },
            Process.FONDEAR: {
                "prospecto": "Registra los datos del inversionista potencial.",
                "activo": "Inversionista activo. Registra el monto comprometido.",
                "desembolsado": "Fondos desembolsados. Registra inversión.",
                "en_rendimiento": "Inversión generando rendimientos.",
                "liquidado": "Inversión liquidada.",
            },
            Process.ENTREGAR: {
                "elegible": "Cliente elegible para compra. Prepara documentos.",
                "documentos_preparados": "Documentos TDHCA listos. Inicia transferencia de título.",
                "titulo_en_proceso": "Título en proceso de transferencia.",
                "cerrado": "✅ Venta completada. Título transferido.",
            },
            Process.COMERCIALIZAR: {
                "promocion": "Propiedad en catálogo. Esperando interesados.",
                "lead_recibido": "Lead recibido. Registra datos del interesado.",
                "prequalificacion": "Realiza pre-calificación DTI rápida.",
                "asignado": "Cliente asignado a propiedad.",
            },
        }
        
        default_msg = messages.get(process, {}).get(stage, "Continúa con el proceso.")
        
        if missing_data:
            default_msg += f"\n\nDatos faltantes: {', '.join(missing_data)}"
        
        return default_msg


# ============================================================================
# INSTANCIA GLOBAL
# ============================================================================

_validator_v2_instance = None


def get_flow_validator_v2() -> ManinosFlowValidatorV2:
    """Get global flow validator V2 instance."""
    global _validator_v2_instance
    if _validator_v2_instance is None:
        _validator_v2_instance = ManinosFlowValidatorV2()
    return _validator_v2_instance


