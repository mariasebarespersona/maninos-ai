"""
AdquirirAgent - Agente para el proceso ADQUIRIR

Según el Excel del cliente, ADQUIRIR tiene 5 procedimientos:
1. Investigar y abastecer - search_property_sources
2. Evaluar atributos físicos, financieros y legales - evaluate_property_criteria (Checklist 26 puntos)
3. Inspeccionar y debida diligencia - create_inspection_record
4. Establecer condiciones de adquisición - calculate_acquisition_offer (≤70% valor mercado)
5. Registrar en inventario - register_property_inventory
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

class SearchPropertySourcesInput(BaseModel):
    """Input for search_property_sources tool."""
    location: str = Field(..., description="Ciudad o área de búsqueda (ej: Houston, TX)")
    max_price: Optional[float] = Field(None, description="Precio máximo")
    min_bedrooms: Optional[int] = Field(None, description="Mínimo de habitaciones")
    property_type: str = Field("mobile_home", description="Tipo de propiedad")
    sources: Optional[List[str]] = Field(None, description="Lista de fuentes a consultar")


class EvaluatePropertyCriteriaInput(BaseModel):
    """Input for evaluate_property_criteria tool."""
    property_id: Optional[str] = Field(None, description="UUID de propiedad existente")
    property_name: str = Field("", description="Nombre de la propiedad")
    property_address: str = Field("", description="Dirección")
    asking_price: float = Field(0, description="Precio de venta")
    market_value: float = Field(0, description="Valor de mercado")
    arv: float = Field(0, description="After Repair Value")
    repair_estimate: float = Field(0, description="Estimado de reparaciones")
    year_built: Optional[int] = Field(None, description="Año de construcción")
    bedrooms: Optional[int] = Field(None, description="Número de habitaciones")
    bathrooms: Optional[float] = Field(None, description="Número de baños")
    square_feet: Optional[int] = Field(None, description="Pies cuadrados")
    checklist_results: Optional[Dict[str, bool]] = Field(None, description="Resultados del checklist 26 puntos")
    title_status: str = Field("unknown", description="Estado del título: clean, liens, unknown")
    vin_number: Optional[str] = Field(None, description="Número VIN del mobile home")


class CreateInspectionRecordInput(BaseModel):
    """Input for create_inspection_record tool."""
    property_id: str = Field(..., description="UUID de la propiedad")
    inspector_name: str = Field(..., description="Nombre del inspector")
    inspection_date: str = Field(..., description="Fecha de inspección (YYYY-MM-DD)")
    inspection_type: str = Field("full", description="Tipo: full, structural, systems, title")
    structural_findings: Optional[Dict[str, Any]] = Field(None, description="Hallazgos estructurales")
    systems_findings: Optional[Dict[str, Any]] = Field(None, description="Hallazgos de sistemas")
    title_findings: Optional[Dict[str, Any]] = Field(None, description="Hallazgos de título")
    photos: Optional[List[str]] = Field(None, description="Lista de URLs de fotos")
    overall_condition: str = Field("unknown", description="Condición: excellent, good, fair, poor, unknown")
    recommended_repairs: Optional[List[Dict[str, Any]]] = Field(None, description="Lista de reparaciones")
    notes: Optional[str] = Field(None, description="Notas adicionales")


class CalculateAcquisitionOfferInput(BaseModel):
    """Input for calculate_acquisition_offer tool."""
    property_id: Optional[str] = Field(None, description="UUID de la propiedad (opcional - si se omite, calcula solo con valores)")
    market_value: Optional[float] = Field(None, description="Valor de mercado (requerido si no hay property_id)")
    arv: Optional[float] = Field(None, description="After Repair Value")
    repair_estimate: Optional[float] = Field(None, description="Estimado de reparaciones")
    asking_price: Optional[float] = Field(None, description="Precio de venta actual")
    target_margin: float = Field(0.70, description="Margen objetivo (default 0.70 = 70%)")
    include_closing_costs: bool = Field(True, description="Si incluir costos de cierre")
    closing_cost_estimate: float = Field(0, description="Estimado de costos de cierre")


class RegisterPropertyInventoryInput(BaseModel):
    """Input for register_property_inventory tool."""
    name: str = Field(..., description="Nombre de la propiedad")
    address: str = Field(..., description="Dirección completa")
    purchase_price: float = Field(..., description="Precio de compra")
    purchase_date: str = Field(..., description="Fecha de compra (YYYY-MM-DD)")
    park_name: Optional[str] = Field(None, description="Nombre del parque")
    lot_rent: Optional[float] = Field(None, description="Renta del lote mensual")
    year_built: Optional[int] = Field(None, description="Año de construcción")
    bedrooms: Optional[int] = Field(None, description="Número de habitaciones")
    bathrooms: Optional[float] = Field(None, description="Número de baños")
    square_feet: Optional[int] = Field(None, description="Pies cuadrados")
    hud_number: Optional[str] = Field(None, description="Número HUD")
    vin_number: Optional[str] = Field(None, description="Número VIN")
    market_value: Optional[float] = Field(None, description="Valor de mercado")
    arv: Optional[float] = Field(None, description="After Repair Value")
    repair_estimate: Optional[float] = Field(None, description="Estimado de reparaciones")
    title_status: str = Field("clean", description="Estado del título")
    notes: Optional[str] = Field(None, description="Notas adicionales")


# ============================================================================
# TOOL DEFINITIONS (5 tools según el Excel)
# ============================================================================

@tool("search_property_sources", args_schema=SearchPropertySourcesInput)
def search_property_sources_tool(
    location: str,
    max_price: Optional[float] = None,
    min_bedrooms: Optional[int] = None,
    property_type: str = "mobile_home",
    sources: Optional[List[str]] = None
) -> Dict:
    """
    Busca propiedades en fuentes externas para identificar oportunidades.
    Procedimiento 1: Investigar y abastecer - Identificar zonas con alta demanda.
    Fuentes: mobilehomeparkstore, Zillow, Realtor, Loopnet, mhvillage, etc.
    """
    from tools.adquirir_tools import search_property_sources
    return search_property_sources(location, max_price, min_bedrooms, property_type, sources)


@tool("evaluate_property_criteria", args_schema=EvaluatePropertyCriteriaInput)
def evaluate_property_criteria_tool(
    property_id: Optional[str] = None,
    property_name: str = "",
    property_address: str = "",
    asking_price: float = 0,
    market_value: float = 0,
    arv: float = 0,
    repair_estimate: float = 0,
    year_built: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    square_feet: Optional[int] = None,
    checklist_results: Optional[Dict[str, bool]] = None,
    title_status: str = "unknown",
    vin_number: Optional[str] = None
) -> Dict:
    """
    Evalúa una propiedad usando el Checklist de 26 puntos y la regla del 70%.
    Procedimiento 2: Evaluar atributos físicos, financieros y legales.
    KPI: 100% de propiedades verificadas antes de oferta.
    """
    from tools.adquirir_tools import evaluate_property_criteria
    return evaluate_property_criteria(
        property_id, property_name, property_address, asking_price,
        market_value, arv, repair_estimate, year_built, bedrooms,
        bathrooms, square_feet, checklist_results, title_status, vin_number
    )


@tool("create_inspection_record", args_schema=CreateInspectionRecordInput)
def create_inspection_record_tool(
    property_id: str,
    inspector_name: str,
    inspection_date: str,
    inspection_type: str = "full",
    structural_findings: Optional[Dict[str, Any]] = None,
    systems_findings: Optional[Dict[str, Any]] = None,
    title_findings: Optional[Dict[str, Any]] = None,
    photos: Optional[List[str]] = None,
    overall_condition: str = "unknown",
    recommended_repairs: Optional[List[Dict[str, Any]]] = None,
    notes: Optional[str] = None
) -> Dict:
    """
    Crea un registro de inspección para una propiedad.
    Procedimiento 3: Inspeccionar y debida diligencia - Inspeccionar unidades,
    revisar historial de títulos y contratos de terreno.
    KPI: 0% de compras con defectos estructurales.
    """
    from tools.adquirir_tools import create_inspection_record
    return create_inspection_record(
        property_id, inspector_name, inspection_date, inspection_type,
        structural_findings, systems_findings, title_findings, photos,
        overall_condition, recommended_repairs, notes
    )


@tool("calculate_acquisition_offer", args_schema=CalculateAcquisitionOfferInput)
def calculate_acquisition_offer_tool(
    property_id: Optional[str] = None,
    market_value: Optional[float] = None,
    arv: Optional[float] = None,
    repair_estimate: Optional[float] = None,
    asking_price: Optional[float] = None,
    target_margin: float = 0.70,
    include_closing_costs: bool = True,
    closing_cost_estimate: float = 0
) -> Dict:
    """
    Calcula la oferta de adquisición usando la regla del 70%.
    Procedimiento 4: Establecer condiciones de adquisición.
    KPI: Precio promedio de compra ≤70% del valor de mercado.
    
    NOTA: property_id es OPCIONAL. Si se proporciona, obtiene datos de BD.
    Si no, calcula solo con los valores proporcionados (market_value requerido).
    """
    from tools.adquirir_tools import calculate_acquisition_offer
    return calculate_acquisition_offer(
        property_id, market_value, arv, repair_estimate,
        asking_price, target_margin, include_closing_costs, closing_cost_estimate
    )


@tool("register_property_inventory", args_schema=RegisterPropertyInventoryInput)
def register_property_inventory_tool(
    name: str,
    address: str,
    purchase_price: float,
    purchase_date: str,
    park_name: Optional[str] = None,
    lot_rent: Optional[float] = None,
    year_built: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    square_feet: Optional[int] = None,
    hud_number: Optional[str] = None,
    vin_number: Optional[str] = None,
    market_value: Optional[float] = None,
    arv: Optional[float] = None,
    repair_estimate: Optional[float] = None,
    title_status: str = "clean",
    notes: Optional[str] = None
) -> Dict:
    """
    Registra una propiedad adquirida en el inventario.
    Procedimiento 5: Registrar en inventario - Registrar vivienda con
    atributos financieros y de ubicación.
    KPI: 100% de viviendas registradas en 24h.
    """
    from tools.adquirir_tools import register_property_inventory
    return register_property_inventory(
        name, address, purchase_price, purchase_date, park_name,
        lot_rent, year_built, bedrooms, bathrooms, square_feet,
        hud_number, vin_number, market_value, arv, repair_estimate,
        title_status, notes
    )


# ============================================================================
# ADQUIRIR AGENT
# ============================================================================

class AdquirirAgent(LangGraphAgent):
    """
    Agente para el proceso ADQUIRIR de la Cadena de Valor Maninos.
    
    Usa LangGraph con checkpointer para memoria persistente de conversación.
    Esto permite que "sí" después de "¿calcular oferta?" tenga contexto completo.
    
    Según el Excel del cliente, maneja 5 procedimientos:
    1. Investigar y abastecer - Identificar zonas y fuentes
    2. Evaluar atributos - Checklist 26 puntos, regla del 70%
    3. Inspeccionar y due diligence - Expediente de casa
    4. Establecer condiciones - Calcular oferta ≤70%
    5. Registrar en inventario - Base de datos
    """
    
    def __init__(self, model: str = "gpt-4o-mini", temperature: float = 0.3):
        """Initialize AdquirirAgent with LangGraph memory."""
        super().__init__(name="AdquirirAgent", model=model, temperature=temperature)
        logger.info(f"[AdquirirAgent] Initialized with 5 tools + LangGraph memory")
    
    def get_system_prompt(self, **kwargs) -> str:
        """Get system prompt for AdquirirAgent from file."""
        from prompts.prompt_loader import load_prompt
        
        try:
            prompt = load_prompt("agents/adquirir_agent/_base.md")
            return prompt
        except Exception as e:
            logger.warning(f"[AdquirirAgent] Could not load prompt file: {e}")
            # Fallback prompt
            return """Eres el asistente de ADQUISICIÓN de Maninos Capital LLC.

Manejas los 5 procedimientos del proceso ADQUIRIR:
1. Investigar y abastecer - Buscar propiedades en fuentes externas
2. Evaluar atributos - Checklist 26 puntos, regla del 70%
3. Inspeccionar y due diligence - Crear expediente de inspección
4. Establecer condiciones - Calcular oferta máxima
5. Registrar en inventario - Registrar propiedad adquirida

REGLA DEL 70%: Nunca pagues más del 70% del valor de mercado.

Responde siempre en español."""
    
    def get_tools(self) -> List:
        """Get tools for AdquirirAgent (5 tools según Excel)."""
        return [
            search_property_sources_tool,
            evaluate_property_criteria_tool,
            create_inspection_record_tool,
            calculate_acquisition_offer_tool,
            register_property_inventory_tool,
        ]
    
    def is_out_of_scope(self, user_input: str) -> tuple[bool, Optional[str]]:
        """Check if request is out of scope for AdquirirAgent."""
        user_lower = user_input.lower()
        
        # Keywords for other specific agents
        comercializar_keywords = ["promover", "catálogo", "lead", "dictamen crediticio", "fidelizar"]
        incorporar_keywords = ["perfil cliente", "anexo 1", "kyc", "contrato rto", "dti cliente"]
        fondear_keywords = ["inversionista", "pagaré", "sec", "reg d", "nota de deuda"]
        gestionar_keywords = ["cobro", "morosidad", "pago mensual", "cartera", "stripe"]
        entregar_keywords = ["transferir título", "tdhca", "elegibilidad compra", "cerrar venta"]
        
        for kw in comercializar_keywords:
            if kw in user_lower:
                return True, "ComercializarAgent"
        
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

