"""
API Router for Maninos AI Agents.

Exposes INTELLIGENT agents as REST endpoints.
ALL endpoints use LLM for intelligent analysis - no simple formulas.

Endpoints:
- POST /api/agents/buscador    - Intelligent market search
- POST /api/agents/costos      - Intelligent cost estimation
- POST /api/agents/precio      - Intelligent price analysis
- POST /api/agents/fotos       - Vision AI photo classification
- POST /api/agents/voz         - Whisper + LLM voice processing
- GET  /api/agents             - List available agents

Following Developer Bible: DATA-DRIVEN, NOT KEYWORD-DRIVEN
All agents require OPENAI_API_KEY to function intelligently.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import Optional, List
import logging
import os

from .base import AgentRequest, AgentResponse, AgentRegistry
from .buscador import BuscadorAgent
from .costos import CostosAgent
from .precio import PrecioAgent
from .fotos import FotosAgent
from .voz import VozAgent
from .renovacion import RenovacionAgent

logger = logging.getLogger(__name__)

# Create router
router = APIRouter(prefix="/api/agents", tags=["agents"])

# Initialize and register agents
_agents_initialized = False


def initialize_agents():
    """Initialize all agents and register them."""
    global _agents_initialized
    if _agents_initialized:
        return
    
    try:
        AgentRegistry.register(BuscadorAgent())
        AgentRegistry.register(CostosAgent())
        AgentRegistry.register(PrecioAgent())
        AgentRegistry.register(FotosAgent())
        AgentRegistry.register(VozAgent())
        AgentRegistry.register(RenovacionAgent())
        _agents_initialized = True
        
        # Check if LLM is available
        if os.getenv("OPENAI_API_KEY"):
            logger.info("All agents initialized with LLM intelligence ✓")
        else:
            logger.warning("⚠️ OPENAI_API_KEY not set - agents will have limited functionality")
            
    except Exception as e:
        logger.error(f"Failed to initialize agents: {e}")


# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class AgentInvokeRequest(BaseModel):
    """Request to invoke an agent."""
    query: str = Field(description="What you want the agent to do (natural language)")
    context: Optional[dict] = Field(default=None, description="Additional context")
    property_id: Optional[str] = Field(default=None, description="Property ID if relevant")


class AgentListResponse(BaseModel):
    """Response listing available agents."""
    agents: list[dict]
    llm_available: bool


# ============================================
# MAIN ENDPOINTS
# ============================================

@router.get("", response_model=AgentListResponse)
async def list_agents():
    """
    List all available agents and their descriptions.
    
    Returns whether LLM is available for intelligent processing.
    """
    initialize_agents()
    return AgentListResponse(
        agents=AgentRegistry.list_agents(),
        llm_available=bool(os.getenv("OPENAI_API_KEY"))
    )


@router.post("/buscador", response_model=AgentResponse)
async def invoke_buscador(request: AgentInvokeRequest):
    """
    🔍 INTELLIGENT Market Search Agent
    
    Uses GPT-4 to understand your search intent and analyze market data.
    
    Capabilities:
    - Natural language search understanding
    - Market trend analysis
    - ROI calculations with reasoning
    - Risk assessment
    
    Example queries:
    - "Busca casas en Houston bajo $35,000 con buen ROI"
    - "Analiza el mercado de Dallas para mobile homes"
    - "¿Es buen momento para comprar en Austin?"
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("buscador", agent_request)


@router.post("/costos", response_model=AgentResponse)
async def invoke_costos(request: AgentInvokeRequest):
    """
    💰 INTELLIGENT Renovation Cost Agent
    
    Uses GPT-4 to estimate renovation costs with reasoning.
    
    Considers:
    - Property age and condition
    - Market rates for materials
    - Labor complexity
    - Contingency factors
    
    Context should include:
    - sqft: House square footage
    - year_built: Year built (for age-based estimates)
    - condition: Initial assessment
    
    Example:
    {
        "query": "Estima costos de renovación completa",
        "context": {"sqft": 1200, "year_built": 1998},
        "property_id": "abc123"
    }
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("costos", agent_request)


@router.post("/precio", response_model=AgentResponse)
async def invoke_precio(request: AgentInvokeRequest):
    """
    📊 INTELLIGENT Price Analysis Agent
    
    Uses GPT-4 to analyze and recommend optimal sale price.
    
    Provides:
    - Multiple pricing strategies (break-even, target, market, aggressive)
    - ROI analysis
    - Market positioning recommendations
    - Risk factors
    
    Context should include:
    - purchase_price: Original purchase price
    - renovation_cost: Total renovation cost
    - city: For market context
    
    Example:
    {
        "query": "¿A qué precio debería vender esta casa?",
        "context": {"purchase_price": 30000, "renovation_cost": 8000, "city": "Houston"}
    }
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("precio", agent_request)


@router.post("/fotos", response_model=AgentResponse)
async def invoke_fotos(request: AgentInvokeRequest):
    """
    📷 VISION AI Photo Classification Agent
    
    Uses GPT-4 Vision to ACTUALLY analyze photos.
    
    Capabilities:
    - Visual analysis of property condition
    - Before/after renovation detection
    - Interior/exterior classification
    - Quality assessment
    
    Context MUST include:
    - photo_urls: List of photo URLs to classify
    
    Example:
    {
        "query": "Clasifica estas fotos de la propiedad",
        "context": {"photo_urls": ["url1.jpg", "url2.jpg", "url3.jpg"]}
    }
    
    Returns classified photos with reasoning for each classification.
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("fotos", agent_request)


@router.post("/voz", response_model=AgentResponse)
async def invoke_voz(request: AgentInvokeRequest):
    """
    🎤 INTELLIGENT Voice Command Agent
    
    Uses Whisper for transcription + GPT-4 for intent extraction.
    
    Pipeline:
    1. Transcribe audio (if provided)
    2. Understand intent (add materials, inspection note, etc.)
    3. Extract structured data
    
    Context options:
    - audio_url: URL to audio file
    - audio_base64: Base64 encoded audio
    - (or just use query as text input)
    
    Example queries:
    - "Añade 5 galones de pintura blanca y 200 pies de piso vinílico"
    - "El baño tiene moho en las paredes, necesita tratamiento"
    
    Returns extracted materials, notes, and suggested actions.
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("voz", agent_request)


# ============================================
# CONVENIENCE ENDPOINTS (still use LLM)
# ============================================

@router.get("/buscador/status")
async def buscador_status():
    """Get BuscadorAgent status and capabilities."""
    initialize_agents()
    agent = AgentRegistry.get("buscador")
    return {
        "ok": True,
        "agent": "buscador",
        "available": agent is not None,
        "llm_available": bool(os.getenv("OPENAI_API_KEY")),
        "description": agent.description if agent else "Not initialized",
    }


@router.get("/renovacion/status")
async def renovacion_status():
    """Get RenovacionAgent status and capabilities."""
    initialize_agents()
    agent = AgentRegistry.get("renovacion")
    return {
        "ok": True,
        "agent": "renovacion",
        "available": agent is not None,
        "llm_available": bool(os.getenv("OPENAI_API_KEY")),
        "description": agent.description if agent else "Not initialized",
    }


class MarketSearchRequest(BaseModel):
    """Structured market search request."""
    city: str = Field(description="City in Texas to search")
    min_price: float = Field(default=15000, description="Minimum price")
    max_price: float = Field(default=60000, description="Maximum price")
    bedrooms: Optional[int] = Field(default=None, description="Number of bedrooms")


@router.post("/buscador/search", response_model=AgentResponse)
async def structured_market_search(request: MarketSearchRequest):
    """
    Structured market search (still uses LLM intelligence).
    
    Convenience endpoint when you have structured parameters.
    """
    initialize_agents()
    agent = AgentRegistry.get("buscador")
    if not agent:
        raise HTTPException(status_code=500, detail="BuscadorAgent not initialized")
    
    return await agent.search_market(
        city=request.city,
        min_price=request.min_price,
        max_price=request.max_price,
        bedrooms=request.bedrooms,
    )


class RenovationEstimateRequest(BaseModel):
    """Structured renovation estimate request."""
    sqft: int = Field(description="Square footage of the property")
    property_id: Optional[str] = Field(default=None, description="Property ID")
    year_built: Optional[int] = Field(default=None, description="Year the property was built")
    condition: Optional[str] = Field(default=None, description="Initial condition assessment")


@router.post("/costos/estimate", response_model=AgentResponse)
async def structured_renovation_estimate(request: RenovationEstimateRequest):
    """
    Structured renovation estimate (still uses LLM intelligence).
    
    Convenience endpoint when you have structured parameters.
    """
    initialize_agents()
    agent = AgentRegistry.get("costos")
    if not agent:
        raise HTTPException(status_code=500, detail="CostosAgent not initialized")
    
    return await agent.estimate_renovation(
        sqft=request.sqft,
        property_id=request.property_id,
        year_built=request.year_built,
        condition=request.condition,
    )


class PriceCalculationRequest(BaseModel):
    """Structured price calculation request."""
    purchase_price: float = Field(description="Original purchase price")
    renovation_cost: float = Field(description="Total renovation cost")
    target_margin: float = Field(default=0.20, description="Target profit margin (0.20 = 20%)")
    property_id: Optional[str] = Field(default=None, description="Property ID")
    city: Optional[str] = Field(default=None, description="City for market context")


@router.post("/precio/calculate", response_model=AgentResponse)
async def structured_price_calculation(request: PriceCalculationRequest):
    """
    Structured price calculation (still uses LLM intelligence).
    
    Convenience endpoint when you have structured parameters.
    """
    initialize_agents()
    agent = AgentRegistry.get("precio")
    if not agent:
        raise HTTPException(status_code=500, detail="PrecioAgent not initialized")
    
    return await agent.calculate_price(
        purchase_price=request.purchase_price,
        renovation_cost=request.renovation_cost,
        target_margin=request.target_margin,
        property_id=request.property_id,
        city=request.city,
    )


class PhotoClassificationRequest(BaseModel):
    """Structured photo classification request."""
    photo_urls: List[str] = Field(description="List of photo URLs to classify")
    property_id: Optional[str] = Field(default=None, description="Property ID")


@router.post("/fotos/classify", response_model=AgentResponse)
async def structured_photo_classification(request: PhotoClassificationRequest):
    """
    Structured photo classification (uses Vision AI).
    
    Convenience endpoint when you have structured parameters.
    """
    initialize_agents()
    agent_request = AgentRequest(
        query="Clasifica estas fotos",
        context={"photo_urls": request.photo_urls},
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("fotos", agent_request)


class VoiceProcessRequest(BaseModel):
    """Structured voice processing request."""
    text: Optional[str] = Field(default=None, description="Text to process (if no audio)")
    audio_url: Optional[str] = Field(default=None, description="URL to audio file")
    audio_base64: Optional[str] = Field(default=None, description="Base64 encoded audio")
    property_id: Optional[str] = Field(default=None, description="Property ID")


@router.post("/voz/process", response_model=AgentResponse)
async def structured_voice_processing(request: VoiceProcessRequest):
    """
    Structured voice processing.
    
    Can accept text, audio URL, or base64 audio.
    """
    initialize_agents()
    
    query = request.text or "Process voice input"
    context = {}
    
    if request.audio_url:
        context["audio_url"] = request.audio_url
    if request.audio_base64:
        context["audio_base64"] = request.audio_base64
    
    agent_request = AgentRequest(
        query=query,
        context=context if context else None,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("voz", agent_request)


# ============================================
# RENOVACION AGENT ENDPOINTS
# ============================================

@router.post("/renovacion", response_model=AgentResponse)
async def invoke_renovacion(request: AgentInvokeRequest):
    """
    🔧 INTELLIGENT Renovation Assistant Agent
    
    Guides employees through the renovation process with AI assistance.
    
    CRITICAL: ALWAYS verifies property size (sqft) before proceeding.
    
    Capabilities:
    - Suggests what to renovate based on property data
    - Calculates costs using materials database + AI reasoning
    - Processes voice commands for hands-free operation
    - Considers property age, condition, and checklist results
    
    Example queries:
    - "¿Qué debo renovar en esta casa?"
    - "La casa tiene 1200 pies cuadrados, calcula los materiales para pintura"
    - "Necesito 5 galones de pintura y piso para todo"
    """
    initialize_agents()
    agent_request = AgentRequest(
        query=request.query,
        context=request.context,
        property_id=request.property_id,
    )
    return await AgentRegistry.invoke("renovacion", agent_request)


class RenovationSuggestRequest(BaseModel):
    """Request to suggest renovation items."""
    property_id: str = Field(description="Property ID to analyze")


@router.post("/renovacion/suggest", response_model=AgentResponse)
async def suggest_renovation(request: RenovationSuggestRequest):
    """
    Get AI suggestions for what to renovate.
    
    Analyzes property data and inspection checklist to suggest:
    - Priority areas to renovate
    - Estimated materials needed
    - Cost breakdown by area
    - Recommended order of work
    
    REQUIRES: Property must have sqft set.
    """
    initialize_agents()
    agent = AgentRegistry.get("renovacion")
    if not agent:
        raise HTTPException(status_code=500, detail="RenovacionAgent not initialized")
    
    return await agent.suggest_renovation(property_id=request.property_id)


class RenovationCostsRequest(BaseModel):
    """Request to calculate renovation costs."""
    property_id: str = Field(description="Property ID")
    areas: List[str] = Field(description="Areas to renovate (kitchen, bathroom, etc.)")


@router.post("/renovacion/costs", response_model=AgentResponse)
async def calculate_renovation_costs(request: RenovationCostsRequest):
    """
    Calculate costs for specific renovation areas.
    
    Uses CostosAgent for intelligent cost estimation based on:
    - Property size (sqft)
    - Property age
    - Specific areas to renovate
    - Market rates for materials
    
    REQUIRES: Property must have sqft set.
    """
    initialize_agents()
    agent = AgentRegistry.get("renovacion")
    if not agent:
        raise HTTPException(status_code=500, detail="RenovacionAgent not initialized")
    
    return await agent.calculate_renovation_costs(
        property_id=request.property_id,
        areas=request.areas,
    )


class RenovationVoiceRequest(BaseModel):
    """Request to process voice command for renovation."""
    property_id: Optional[str] = Field(default=None, description="Property ID")
    text: Optional[str] = Field(default=None, description="Text command (if no audio)")
    audio_url: Optional[str] = Field(default=None, description="URL to audio file")
    audio_base64: Optional[str] = Field(default=None, description="Base64 encoded audio")


@router.post("/renovacion/voice", response_model=AgentResponse)
async def renovation_voice_command(request: RenovationVoiceRequest):
    """
    🎤 Process voice command for renovation.
    
    Employees can dictate:
    - Materials needed: "Necesito 5 galones de pintura blanca"
    - Property size: "La casa tiene 1200 pies cuadrados"
    - Inspection notes: "El baño necesita trabajo de plomería"
    
    Uses Whisper for transcription + LLM for understanding.
    
    Returns:
    - Transcription
    - Extracted materials (if any)
    - Suggested actions
    - Response message
    """
    initialize_agents()
    agent = AgentRegistry.get("renovacion")
    if not agent:
        raise HTTPException(status_code=500, detail="RenovacionAgent not initialized")
    
    return await agent.process_voice_command(
        audio_url=request.audio_url,
        audio_base64=request.audio_base64,
        text=request.text,
        property_id=request.property_id,
    )
