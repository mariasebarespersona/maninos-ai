"""
CostosAgent - INTELLIGENT Renovation Cost Calculator.

Used in Step 3: Renovar
- 3.2 Checklist materiales por unidad + costos

This agent uses LLM intelligence to:
1. Understand renovation needs based on property condition
2. Estimate materials intelligently (not just formulas)
3. Consider factors like age, location, market conditions
4. Provide reasoned cost breakdowns

Following Developer Bible: DATA-DRIVEN, NOT KEYWORD-DRIVEN
"""

import json
import logging
from typing import Optional
from pydantic import BaseModel, Field
import httpx
import os

from ..base import BaseAgent, AgentRequest, AgentResponse

logger = logging.getLogger(__name__)


# ============================================
# COSTOS-SPECIFIC SCHEMAS
# ============================================

class MaterialEstimate(BaseModel):
    """Estimated material needed for renovation."""
    material_name: str
    category: str
    quantity: float
    unit: str
    unit_price: float
    total_price: float
    reasoning: str  # Why this quantity


class RenovationEstimate(BaseModel):
    """Complete renovation cost estimate."""
    property_id: Optional[str] = None
    sqft: int
    year_built: Optional[int] = None
    condition_assessment: str
    materials: list[MaterialEstimate]
    materials_total: float
    labor_estimate: float
    labor_reasoning: str
    contingency: float
    contingency_reasoning: str
    total_cost: float
    cost_per_sqft: float
    confidence: float
    risk_factors: list[str]
    summary: str


# ============================================
# COSTOS AGENT (INTELLIGENT)
# ============================================

class CostosAgent(BaseAgent):
    """
    INTELLIGENT Renovation Cost Calculator.
    
    Uses LLM to:
    - Assess property condition from description/data
    - Estimate materials based on actual needs
    - Consider market factors for labor costs
    - Provide reasoned, contextual estimates
    
    NOT just formulas. Real analysis.
    """
    
    def __init__(self):
        super().__init__(
            name="costos",
            description="Intelligent renovation cost analysis with contextual reasoning",
            model="gpt-4o",
            temperature=0.2,
        )
        self.api_url = os.getenv("API_URL", "http://localhost:8000")
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are CostosAgent, an intelligent renovation cost analyst for Maninos Homes.
You specialize in mobile home renovations in Texas.

# YOUR INTELLIGENCE
You don't just apply formulas - you THINK about:
- The actual condition of the property
- What REALLY needs to be renovated
- Market rates for materials in Texas
- Labor costs that vary by complexity
- Hidden costs and contingencies

# MATERIALS DATABASE CONTEXT
We have a database of materials with unit prices. Use these as reference:
- Paint (interior): ~$35/gallon, covers 350 sqft
- Vinyl flooring: ~$2.50/sqft installed
- Baseboards: ~$1.50/linear ft
- Light fixtures: ~$45 each
- Electrical outlets: ~$15 each (just the outlet, not wiring)
- Kitchen cabinets: ~$150-500 depending on size
- Bathroom fixtures: varies widely

# HOW TO ESTIMATE

## Step 1: Assess Condition
Based on the property info, assess:
- Overall condition (poor/fair/good)
- What likely needs work
- Age-related issues

## Step 2: Estimate Materials
For each area:
- Calculate realistic quantities
- Consider waste factors (10-15%)
- Explain your reasoning

## Step 3: Estimate Labor
Labor typically: 30-50% of materials
- Simple cosmetic: 30%
- Moderate renovation: 40%
- Major work: 50%

## Step 4: Add Contingency
- New renovators: 15%
- Experienced: 10%
- Simple jobs: 5%

# OUTPUT FORMAT
{
  "condition_assessment": "Based on [factors], this property appears to be in [condition]",
  "materials": [
    {
      "material_name": "Interior Paint",
      "category": "Paint",
      "quantity": 5,
      "unit": "gallon",
      "unit_price": 35.0,
      "total_price": 175.0,
      "reasoning": "1200 sqft ÷ 350 sqft/gal × 1.15 waste = 4 gallons, rounded to 5"
    }
  ],
  "materials_total": 5000,
  "labor_estimate": 2000,
  "labor_reasoning": "Moderate renovation, 40% of materials",
  "contingency": 700,
  "contingency_reasoning": "10% for experienced team",
  "total_cost": 7700,
  "cost_per_sqft": 6.42,
  "confidence": 0.75,
  "risk_factors": ["Older home may have hidden issues", "HVAC not inspected"],
  "summary": "Estimate: $7,700 for basic renovation of 1200 sqft home"
}

# IMPORTANT
- Always explain your reasoning
- Don't just multiply - think about what's needed
- Consider the age of the property
- Flag risk factors
- Be conservative (better to overestimate)
"""
    
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process cost estimation using LLM intelligence.
        """
        logger.info(f"[CostosAgent] Processing: {request.query}")
        
        # Check if LLM is available
        if not self.llm:
            return self._error_response(
                "CostosAgent requires LLM (OPENAI_API_KEY not configured). "
                "This agent uses AI to intelligently estimate costs."
            )
        
        try:
            # Get materials from database for context
            materials_db = await self._get_materials_from_db()
            
            # Build context
            context = request.context or {}
            context["available_materials"] = materials_db
            
            if request.property_id:
                property_data = await self._get_property_data(request.property_id)
                if property_data:
                    context["property_data"] = property_data
            
            # Call LLM for intelligent analysis
            llm_response = await self._call_llm(request.query, context)
            
            # Parse response
            result = self._parse_response(llm_response)
            
            return self._success_response(
                result=result,
                confidence=result.get("confidence", 0.7),
                suggestions=[
                    "Revisa los materiales estimados",
                    "Ajusta según inspección física",
                    "Considera añadir items específicos",
                ],
            )
            
        except Exception as e:
            logger.error(f"[CostosAgent] Error: {e}")
            return self._error_response(str(e))
    
    async def estimate_renovation(
        self,
        sqft: int,
        property_id: Optional[str] = None,
        year_built: Optional[int] = None,
        condition: Optional[str] = None,
    ) -> AgentResponse:
        """
        Intelligently estimate renovation costs.
        """
        query = f"""
Estima los costos de renovación para esta propiedad:
- Tamaño: {sqft} sqft
- Año de construcción: {year_built or 'No especificado'}
- Condición: {condition or 'No evaluada'}
- Property ID: {property_id or 'No especificado'}

Proporciona:
1. Evaluación de la condición
2. Lista detallada de materiales con cantidades y precios
3. Estimación de mano de obra
4. Contingencia recomendada
5. Costo total y por sqft
6. Factores de riesgo
"""
        
        return await self.process(AgentRequest(
            query=query,
            property_id=property_id,
            context={
                "sqft": sqft,
                "year_built": year_built,
                "condition": condition,
            }
        ))
    
    def _parse_response(self, response: str) -> dict:
        """Parse LLM response into structured data."""
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            return {
                "condition_assessment": "Could not parse",
                "materials": [],
                "materials_total": 0,
                "labor_estimate": 0,
                "labor_reasoning": "",
                "contingency": 0,
                "contingency_reasoning": "",
                "total_cost": 0,
                "cost_per_sqft": 0,
                "confidence": 0.3,
                "risk_factors": ["Response parsing failed"],
                "summary": response,
            }
    
    async def _get_materials_from_db(self) -> list[dict]:
        """Fetch materials from database for context."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/materials",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.warning(f"Could not fetch materials: {e}")
        return []
    
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
