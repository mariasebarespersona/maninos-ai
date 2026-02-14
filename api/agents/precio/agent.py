"""
PrecioAgent - INTELLIGENT Price Analysis and Recommendation.

Used in Step 4: Volver a Publicar
- 4.1 Actualizar precio

This agent uses LLM intelligence to:
1. Analyze market conditions for pricing
2. Consider renovation quality and improvements
3. Compare with similar properties
4. Recommend optimal pricing strategy

Following Developer Bible: DATA-DRIVEN, NOT KEYWORD-DRIVEN
"""

import json
import logging
import os
from typing import Optional
from pydantic import BaseModel, Field
import httpx

from ..base import BaseAgent, AgentRequest, AgentResponse

logger = logging.getLogger(__name__)


# ============================================
# PRECIO-SPECIFIC SCHEMAS
# ============================================

class PriceAnalysis(BaseModel):
    """Complete price analysis for a property."""
    property_id: Optional[str] = None
    purchase_price: float
    renovation_cost: float
    total_investment: float
    
    # Pricing strategies
    minimum_price: float  # Break-even
    target_price: float   # Target margin
    market_price: float   # What market will bear
    aggressive_price: float  # Quick sale
    
    recommended_price: float
    recommended_strategy: str
    
    roi_at_recommended: float
    profit_at_recommended: float
    margin_at_recommended: float
    
    market_factors: list[str]
    confidence: float
    summary: str


class PriceComparison(BaseModel):
    """Comparison with market."""
    our_price: float
    market_avg: float
    price_position: str  # "below", "at", "above"
    competitive_advantage: str


# ============================================
# PRECIO AGENT (INTELLIGENT)
# ============================================

class PrecioAgent(BaseAgent):
    """
    INTELLIGENT Price Analysis Agent.
    
    Uses LLM to:
    - Understand market dynamics
    - Consider renovation quality
    - Analyze competitive positioning
    - Recommend pricing strategy with reasoning
    
    NOT just formulas. Strategic thinking.
    """
    
    def __init__(self):
        super().__init__(
            name="precio",
            description="Intelligent price analysis with market context and strategy",
            model="gpt-4o",
            temperature=0.2,
        )
        self.api_url = os.getenv("API_URL", "http://localhost:8000")
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are PrecioAgent, an intelligent pricing strategist for Maninos Homes.
You help determine optimal sale prices for renovated mobile homes.

# CRITICAL RULE — 80% CEILING (Feb 2026)
**NEVER** recommend a price above 80% of the blended market value.
  Market value = average(web scraping avg, Maninos historical sales avg).
  Max allowed = market_value × 0.80.
If the target-margin price exceeds 80%, CAP IT at the 80% ceiling.

# YOUR INTELLIGENCE
You don't just calculate margin - you STRATEGIZE:
- What price will the market accept?
- How does our renovation compare to competitors?
- Should we price for quick sale or maximum profit?
- What's the optimal balance of risk vs reward?

# PRICING STRATEGIES

## 1. Break-Even (Minimum)
Price = Purchase + Renovation + Carrying Costs
- This is your floor. Never go below.

## 2. Target Margin
Price = Total Investment / (1 - target_margin)
- Typical target: 20% margin
- Formula ensures you get 20% of the sale price as profit
- BUT: NEVER exceed 80% of market value

## 3. Market Price (80% Ceiling)
What similar renovated homes are selling for, capped at 80%:
  final_price = min(market_price, market_value × 0.80)

## 4. Aggressive (Quick Sale)
Price = Market × 0.90-0.95
- Below market for fast sale
- Use when capital is needed quickly

# FACTORS TO CONSIDER

## Property Factors
- Size (sqft)
- Year built
- Quality of renovation
- Location within Texas
- Features (bedrooms, bathrooms)

## Market Factors
- Supply in the area
- Demand trends
- Time of year
- Economic conditions
- Days on market for similar homes

## Strategic Factors
- How long can we hold?
- Do we need quick capital?
- Is this a desirable area?
- Quality of our renovation vs competitors?

# OUTPUT FORMAT
{
  "purchase_price": 30000,
  "renovation_cost": 8000,
  "total_investment": 38000,
  
  "market_value": 60000,
  "max_sell_80_pct": 48000,
  
  "minimum_price": 38000,
  "target_price": 45600,
  "market_price": 48000,
  "aggressive_price": 43200,
  
  "recommended_price": 45600,
  "recommended_strategy": "20% ROI, within 80% ceiling",
  
  "roi_at_recommended": 20.0,
  "profit_at_recommended": 7600,
  "margin_at_recommended": 16.7,
  
  "market_factors": [
    "Houston market is strong",
    "Low inventory of renovated homes",
    "Similar homes selling at $48-52k",
    "80% ceiling: $48,000"
  ],
  "confidence": 0.8,
  "summary": "Recommend $45,600 for 20% ROI. Within 80% market ceiling ($48K)."
}

# IMPORTANT
- Always calculate ALL pricing strategies
- ALWAYS enforce the 80% ceiling — flag any recommendation that bumps into it
- Explain why you recommend one over others
- Consider time value of money
- Flag if market data is uncertain
- Be realistic about what market will pay
- If investment exceeds 80% of market, WARN that the deal may not be profitable
"""
    
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process price analysis using LLM intelligence.
        """
        logger.info(f"[PrecioAgent] Processing: {request.query}")
        
        # Check if LLM is available
        if not self.llm:
            return self._error_response(
                "PrecioAgent requires LLM (OPENAI_API_KEY not configured). "
                "This agent uses AI to intelligently analyze pricing."
            )
        
        try:
            # Build context
            context = request.context or {}
            
            # Get property data if available
            if request.property_id:
                property_data = await self._get_property_data(request.property_id)
                if property_data:
                    context["property_data"] = property_data
                
                # Get renovation costs if available
                renovation_data = await self._get_renovation_data(request.property_id)
                if renovation_data:
                    context["renovation_data"] = renovation_data
            
            # Call LLM for intelligent analysis
            llm_response = await self._call_llm(request.query, context)
            
            # Parse response
            result = self._parse_response(llm_response)
            
            return self._success_response(
                result=result,
                confidence=result.get("confidence", 0.7),
                suggestions=[
                    "Considera el tiempo que llevamos con la propiedad",
                    "Revisa comparables recientes en la zona",
                    "Ajusta según urgencia de venta",
                ],
            )
            
        except Exception as e:
            logger.error(f"[PrecioAgent] Error: {e}")
            return self._error_response(str(e))
    
    async def calculate_price(
        self,
        purchase_price: float,
        renovation_cost: float,
        target_margin: float = 0.20,
        property_id: Optional[str] = None,
        city: Optional[str] = None,
    ) -> AgentResponse:
        """
        Intelligently calculate and recommend sale price.
        """
        query = f"""
Analiza el precio de venta óptimo para esta propiedad:
- Precio de compra: ${purchase_price:,.0f}
- Costo de renovación: ${renovation_cost:,.0f}
- Inversión total: ${purchase_price + renovation_cost:,.0f}
- Margen objetivo: {target_margin*100:.0f}%
- Ciudad: {city or 'Texas (general)'}
- Property ID: {property_id or 'No especificado'}

Proporciona:
1. Todas las estrategias de precio (mínimo, objetivo, mercado, agresivo)
2. Tu recomendación con justificación
3. ROI y ganancia esperada
4. Factores de mercado considerados
5. Nivel de confianza
"""
        
        return await self.process(AgentRequest(
            query=query,
            property_id=property_id,
            context={
                "purchase_price": purchase_price,
                "renovation_cost": renovation_cost,
                "target_margin": target_margin,
                "city": city,
            }
        ))
    
    def _parse_response(self, response: str) -> dict:
        """Parse LLM response into structured data."""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                "purchase_price": 0,
                "renovation_cost": 0,
                "total_investment": 0,
                "minimum_price": 0,
                "target_price": 0,
                "market_price": 0,
                "aggressive_price": 0,
                "recommended_price": 0,
                "recommended_strategy": "Could not analyze",
                "roi_at_recommended": 0,
                "profit_at_recommended": 0,
                "margin_at_recommended": 0,
                "market_factors": [],
                "confidence": 0.3,
                "summary": response,
            }
    
    async def _get_property_data(self, property_id: str) -> Optional[dict]:
        """Fetch property data for context."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/properties/{property_id}",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.warning(f"Could not fetch property: {e}")
        return None
    
    async def _get_renovation_data(self, property_id: str) -> Optional[dict]:
        """Fetch renovation cost data for context."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/materials/renovation-items/{property_id}/summary",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.warning(f"Could not fetch renovation data: {e}")
        return None
