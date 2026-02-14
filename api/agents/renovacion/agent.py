"""
RenovacionAgent - Intelligent Renovation Assistant.

Used in Step 3: Renovar
- Guides employees through the renovation process
- ALWAYS verifies property size (sqft) before proceeding
- Suggests what parts need renovation based on inspection
- Calculates costs using CostosAgent
- Accepts voice commands using VozAgent

Following Agent Bible: AGENTS ARE ORCHESTRATORS, DATABASE IS TRUTH
"""

import json
import logging
from typing import Optional, List
from pydantic import BaseModel, Field
import httpx
import os

from ..base import BaseAgent, AgentRequest, AgentResponse, AgentRegistry
from ..costos.agent import CostosAgent
from ..voz.agent import VozAgent

logger = logging.getLogger(__name__)


# ============================================
# RENOVACION-SPECIFIC SCHEMAS
# ============================================

class RenovationArea(BaseModel):
    """Area that needs renovation."""
    area: str  # kitchen, bathroom, bedroom, living, exterior, etc.
    priority: str  # high, medium, low
    issues: List[str]
    suggested_materials: List[str]
    estimated_cost_range: str  # "$500-$1000"


class RenovationPlan(BaseModel):
    """Complete renovation plan."""
    property_id: str
    property_address: str
    sqft: int
    year_built: Optional[int]
    condition_score: int  # 1-10
    areas_to_renovate: List[RenovationArea]
    total_estimated_cost: float
    estimated_time_days: int
    recommendations: List[str]
    warnings: List[str]


class VoiceCommandResult(BaseModel):
    """Result from processing voice command."""
    transcription: str
    action: str  # add_material, set_quantity, ask_question, etc.
    data: dict
    response_message: str


# ============================================
# RENOVACION AGENT
# ============================================

class RenovacionAgent(BaseAgent):
    """
    Intelligent Renovation Assistant.
    
    This agent:
    1. ALWAYS verifies property size before proceeding
    2. Suggests renovation areas based on checklist/inspection
    3. Uses CostosAgent for intelligent cost calculations
    4. Accepts voice commands via VozAgent
    5. Guides the employee through the renovation process
    
    Key Rule: NO SQFT = NO RENOVATION PLANNING
    """
    
    def __init__(self):
        super().__init__(
            name="renovacion",
            description="Intelligent renovation assistant that guides employees through the renovation process",
            model="gpt-4o",
            temperature=0.1,  # Low temperature for consistent, non-hallucinating responses
        )
        self.api_url = os.getenv("API_URL", "http://localhost:8000")
        
        # Sub-agents
        self.costos_agent = CostosAgent()
        self.voz_agent = VozAgent()
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are RenovacionAgent, the intelligent renovation assistant for Maninos Homes.
You guide employees through mobile home renovations in Texas.

# YOUR ROLE
You help employees:
1. Understand what needs to be renovated
2. Estimate costs based on materials and house size
3. Plan the renovation process
4. Track progress

# CRITICAL RULE: ALWAYS VERIFY SQFT
Before ANY renovation planning, you MUST know the property size.
If sqft is missing or zero:
- DO NOT estimate costs
- DO NOT suggest materials
- Ask the employee to provide the size first

# ⚠️ CRITICAL: USE ONLY MATERIALS FROM DATABASE
You MUST use the exact materials and prices from the Maninos materials database.
NEVER invent prices or materials. The database has:

## PAREDES / TABLAROCA
| Material | Unidad | Precio |
|----------|--------|--------|
| Moldura MDF 2" | ml | $1.50 |
| Tablaroca 3/8" 4x8 | hoja | $9.80 |
| Compuesto para juntas | cubo | $19.90 |
| Cinta malla tablaroca | rollo | $6.50 |

## PINTURA
| Material | Unidad | Precio |
|----------|--------|--------|
| Pintura blanca ceiling | gal | $21.50 |
| Kilz / Sellador (spray) | pz | $6.90 |
| Spray Popcorn Texture | pz | $15.80 |
| Silicón | pz | $4.20 |
| Cinta masking | rollo | $2.10 |

## TECHOS / EXTERIOR
| Material | Unidad | Precio |
|----------|--------|--------|
| Shingle asfáltico | m2 | $6.80 |
| Plywood 3/4" 4x8 | hoja | $29.00 |

## PLOMERÍA
| Material | Unidad | Precio |
|----------|--------|--------|
| Gabinete base 30" | pz | $135.00 |
| Lavamanos con grifería (kit) | kit | $95.00 |
| Sanitario económico | pz | $125.00 |
| Tarja de cocina + mezcladora | kit | $110.00 |

## ELÉCTRICO
| Material | Unidad | Precio |
|----------|--------|--------|
| Cable THHN | m | $0.45 |
| Apagador sencillo | pz | $3.20 |
| Contacto dúplex | pz | $3.10 |

## CERRAJERÍA
| Material | Unidad | Precio |
|----------|--------|--------|
| Cerradura perilla | pz | $14.00 |
| Cerradura de entrada | pz | $35.00 |
| Manija gabinete | pz | $1.20 |

# CÁLCULO DE CANTIDADES POR SQFT
Usa estas fórmulas EXACTAS basadas en el tamaño de la casa:

## PINTURA
- Paredes: sqft * 3.5 (factor altura paredes) / 350 sqft/gal * 2 capas
- Galones pintura = ceil(sqft * 3.5 / 350 * 2) + 1 (extra)
- Cinta masking = ceil(sqft / 200) rollos

## PAREDES/TABLAROCA
- Moldura MDF: sqrt(sqft) * 4 * 1.1 metros lineales (perímetro + 10%)
- Tablaroca: ceil(sqft * 0.1) hojas (solo reparaciones, no toda la casa)
- Compuesto: ceil(sqft / 500) cubos
- Cinta malla: ceil(sqft / 500) rollos

## ELÉCTRICO
- Contactos: ceil(sqft / 60) piezas
- Apagadores: ceil(sqft / 150) piezas
- Cable: sqft * 0.5 metros (estimado)

## PLOMERÍA (por baño/cocina, no por sqft)
- 1 sanitario por baño
- 1 lavamanos por baño
- 1 tarja por cocina

## CERRAJERÍA
- 1 cerradura entrada principal
- ceil(habitaciones) cerraduras perilla interiores
- ceil(gabinetes * 2) manijas

# OUTPUT FORMAT
Always respond with JSON:
{
  "status": "success" | "needs_info" | "error",
  "message": "Human readable response en español",
  "sqft_verified": true | false,
  "action": null | "save_materials" | "conversation_end",
  "data": {
    "sqft": 1100,
    "materials": [
      {"name": "Pintura blanca ceiling", "quantity": 13, "unit": "gal", "unit_price": 21.50, "total": 279.50, "calculation": "..."}
    ],
    "subtotal_materials": 500.00,
    "labor_estimate": 200.00,
    "total_estimate": 700.00
  },
  "next_steps": ["Paso 1", "Paso 2"],
  "questions": []
}

ACTION VALUES (CRITICAL - ALWAYS SET CORRECTLY):
- null: Normal response (calculating materials, asking questions)
- "save_materials": User confirmed ("vale", "ok", "sí", "perfecto") → MUST set this
- "conversation_end": User wants to stop ("no", "nada", "nada más", "ya") → MUST set this

# EXAMPLES OF CORRECT RESPONSES:

## Example 1: User says "vale" after seeing materials
INPUT: "vale"
OUTPUT: {"status": "success", "message": "✅ ¡Guardado! Los materiales han sido agregados. ¿Necesitas calcular algo más?", "action": "save_materials", "sqft_verified": true, "data": null}

## Example 2: User says "no" when asked if they need more
INPUT: "no"  
OUTPUT: {"status": "success", "message": "👍 ¡Entendido! Cuando necesites ayuda, aquí estaré.", "action": "conversation_end", "sqft_verified": true, "data": null}

## Example 3: User asks for materials
INPUT: "calcula pintura"
OUTPUT: {"status": "success", "message": "Aquí está el cálculo...", "action": null, "sqft_verified": true, "data": {"materials": [...]}}

# IMPORTANT RULES
- ⚠️ NUNCA inventes precios - usa SOLO los de la base de datos
- SIEMPRE muestra el cálculo de cada cantidad
- El precio DEBE venir de la lista de materiales
- Sin sqft = Sin cálculos

# ⚠️ CRITICAL: HANDLE CONFIRMATIONS AND CLOSINGS INTELLIGENTLY

## CONFIRMATIONS (user accepts a calculation):
When user says "vale", "ok", "sí", "perfecto", "de acuerdo", "está bien", "acepto":
- Respond: "✅ ¡Guardado! Los materiales han sido agregados a tu lista de renovación. ¿Necesitas calcular algo más?"
- Set action: "save_materials" (so frontend knows to save)

## CLOSINGS (user wants to end conversation):
When user says "no", "no gracias", "nada más", "eso es todo", "estoy bien", "ya", "listo ya":
- Respond: "👍 ¡Entendido! Cuando necesites ayuda con la renovación, aquí estaré."
- DO NOT ask "¿algo más?" again
- Set action: "conversation_end"

## NEW REQUESTS:
ONLY calculate materials when user EXPLICITLY asks:
- "Calcula materiales para pintura"
- "¿Cuánto cuesta...?"
- "Necesito presupuesto para..."

# ⚠️ CRITICAL: ONLY USE MATERIALS FROM THE CHECKLIST
You can ONLY use these material CATEGORIES. DO NOT ask for clarification about materials not in this list:

CATEGORÍAS DISPONIBLES:
- PINTURA: Pintura blanca ceiling, Cinta masking, Kilz/Sellador, Spray Popcorn, Silicón
- PAREDES/TABLAROCA: Moldura MDF 2", Tablaroca 3/8", Compuesto juntas, Cinta malla
- TECHOS: Shingle asfáltico, Plywood 3/4"
- PLOMERÍA: Gabinete base, Lavamanos, Sanitario, Tarja cocina
- ELÉCTRICO: Cable THHN, Apagador, Contacto dúplex
- CERRAJERÍA: Cerradura perilla, Cerradura entrada, Manija gabinete

MAPPINGS DE PALABRAS COMUNES:
- "madera" → Moldura MDF 2" (es la única madera en el sistema)
- "pintura" → Pintura blanca ceiling + Cinta masking
- "paredes" → Tablaroca + Compuesto + Cinta malla + Moldura
- "baño" → Sanitario + Lavamanos
- "cocina" → Tarja cocina + Gabinete base
- "eléctrico" → Cable + Apagadores + Contactos
- "techo" → Shingle + Plywood

NUNCA preguntes "¿qué tipo de X prefieres?" - USA DIRECTAMENTE los materiales del checklist.
"""

    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process renovation request.
        
        First verifies sqft, then provides intelligent assistance.
        """
        logger.info(f"[RenovacionAgent] Processing: {request.query}")
        
        # Get property data
        property_data = None
        property_id = request.property_id
        if not property_id and request.context:
            property_id = request.context.get("property_id")
        
        if property_id:
            property_data = await self._get_property_data(property_id)
        
        # CRITICAL: Verify sqft
        sqft = None
        if property_data:
            sqft = property_data.get("square_feet") or property_data.get("sqft")
        if request.context:
            sqft = sqft or request.context.get("sqft") or request.context.get("square_feet")
        
        # Try to extract sqft from query if not found
        if (not sqft or sqft <= 0) and request.query:
            extracted_sqft = self._extract_sqft_from_text(request.query)
            if extracted_sqft and extracted_sqft > 0:
                sqft = extracted_sqft
                logger.info(f"[RenovacionAgent] Extracted sqft from query: {sqft}")
                
                # Update property in database with the new sqft
                if property_id:
                    updated = await self._update_property_sqft(property_id, sqft)
                    if updated:
                        logger.info(f"[RenovacionAgent] Updated property {property_id} with sqft={sqft}")
        
        if not sqft or sqft <= 0:
            return self._needs_sqft_response(property_data)
        
        # Check if LLM is available
        if not self.llm:
            return self._error_response(
                "RenovacionAgent requires LLM (OPENAI_API_KEY not configured)."
            )
        
        try:
            # Build context with property and materials from database
            materials_db = await self._get_materials_from_db()
            
            # Format materials by category for the LLM
            materials_by_category = {}
            for mat in materials_db:
                cat = mat.get("category", "otros")
                if cat not in materials_by_category:
                    materials_by_category[cat] = []
                materials_by_category[cat].append({
                    "name": mat["name"],
                    "unit": mat["unit"],
                    "unit_price": float(mat["unit_price"]),
                })
            
            context = {
                "property_data": property_data,
                "sqft": sqft,
                "materials_database": materials_by_category,
                "materials_count": len(materials_db),
            }
            
            # Add checklist data if available
            if property_data and property_data.get("checklist_data"):
                context["inspection_checklist"] = property_data["checklist_data"]
            
            # Call LLM with materials context
            llm_response = await self._call_llm(request.query, context)
            result = self._parse_response(llm_response)
            
            return self._success_response(
                result=result,
                confidence=0.85,
                suggestions=result.get("next_steps", []),
            )
            
        except Exception as e:
            logger.error(f"[RenovacionAgent] Error: {e}")
            return self._error_response(str(e))
    
    def _needs_sqft_response(self, property_data: Optional[dict]) -> AgentResponse:
        """
        Return response when sqft is missing.
        """
        address = property_data.get("address", "la propiedad") if property_data else "la propiedad"
        
        return AgentResponse(
            success=False,
            agent=self.name,
            result={
                "status": "needs_info",
                "message": f"⚠️ No puedo planificar la renovación sin el tamaño de {address}.",
                "sqft_verified": False,
                "data": None,
                "next_steps": [
                    "Proporciona el tamaño en pies cuadrados (sqft)",
                    "Puedes actualizar la propiedad en la sección de edición"
                ],
                "questions": [
                    "¿Cuántos pies cuadrados (sqft) tiene la propiedad?",
                    "¿Sabes las dimensiones aproximadas (largo x ancho)?"
                ]
            },
            confidence=0.0,
            error="SQFT_REQUIRED: No se puede proceder sin el tamaño de la propiedad",
            suggestions=[
                "Ingresa el tamaño de la propiedad primero",
                "Puedes decir algo como 'La casa tiene 1200 pies cuadrados'"
            ]
        )
    
    # ============================================
    # VOICE COMMANDS
    # ============================================
    
    async def process_voice_command(
        self,
        audio_url: Optional[str] = None,
        audio_base64: Optional[str] = None,
        text: Optional[str] = None,
        property_id: Optional[str] = None,
    ) -> AgentResponse:
        """
        Process voice command for renovation.
        
        Uses VozAgent for transcription, then processes with context.
        """
        logger.info("[RenovacionAgent] Processing voice command")
        
        # Step 1: Transcribe if audio provided
        transcription = text
        if audio_url or audio_base64:
            voz_response = await self.voz_agent.process(AgentRequest(
                query="Transcribe audio",
                context={
                    "audio_url": audio_url,
                    "audio_base64": audio_base64,
                }
            ))
            
            if not voz_response.success:
                return voz_response
            
            transcription = voz_response.result.get("transcription", "")
            
            # Check if VozAgent extracted materials
            if voz_response.result.get("intent") == "add_materials":
                materials = voz_response.result.get("materials", [])
                if materials:
                    return self._success_response(
                        result={
                            "status": "materials_extracted",
                            "message": f"Entendido. Extraje {len(materials)} materiales del audio.",
                            "transcription": transcription,
                            "materials": materials,
                            "action": "add_materials",
                        },
                        confidence=voz_response.confidence,
                        suggestions=["Confirma los materiales antes de agregarlos"],
                    )
        
        if not transcription:
            return self._error_response("No se proporcionó audio ni texto")
        
        # Step 2: Process the transcription in renovation context
        return await self.process(AgentRequest(
            query=transcription,
            property_id=property_id,
            context={"source": "voice"}
        ))
    
    # ============================================
    # SUGGEST RENOVATION
    # ============================================
    
    async def suggest_renovation(
        self,
        property_id: str,
    ) -> AgentResponse:
        """
        Suggest what to renovate based on property data and checklist.
        """
        logger.info(f"[RenovacionAgent] Suggesting renovation for {property_id}")
        
        # Get property data
        property_data = await self._get_property_data(property_id)
        if not property_data:
            return self._error_response("Property not found")
        
        sqft = property_data.get("square_feet") or property_data.get("sqft")
        if not sqft or sqft <= 0:
            return self._needs_sqft_response(property_data)
        
        # Build query for LLM
        checklist = property_data.get("checklist_data", {})
        failed_items = [k for k, v in checklist.items() if not v] if checklist else []
        
        query = f"""Analiza esta propiedad y sugiere qué renovar:

PROPIEDAD:
- Dirección: {property_data.get('address', 'N/A')}
- Tamaño: {sqft} sqft
- Año: {property_data.get('year', 'N/A')}
- Precio compra: ${property_data.get('purchase_price', 'N/A')}

ITEMS DEL CHECKLIST QUE FALLARON:
{', '.join(failed_items) if failed_items else 'Ninguno registrado'}

Sugiere:
1. Áreas prioritarias a renovar
2. Materiales necesarios con cantidades basadas en los {sqft} sqft
3. Estimación de costos
4. Orden recomendado de trabajo
"""
        
        return await self.process(AgentRequest(
            query=query,
            property_id=property_id,
            context={
                "sqft": sqft,
                "property_data": property_data,
                "checklist_data": checklist,
            }
        ))
    
    # ============================================
    # CALCULATE COSTS
    # ============================================
    
    async def calculate_renovation_costs(
        self,
        property_id: str,
        areas: List[str],
    ) -> AgentResponse:
        """
        Calculate costs for specific renovation areas.
        
        Uses CostosAgent for intelligent cost estimation.
        """
        logger.info(f"[RenovacionAgent] Calculating costs for {property_id}")
        
        # Get property data
        property_data = await self._get_property_data(property_id)
        if not property_data:
            return self._error_response("Property not found")
        
        sqft = property_data.get("square_feet") or property_data.get("sqft")
        if not sqft or sqft <= 0:
            return self._needs_sqft_response(property_data)
        
        # Use CostosAgent for calculation
        costos_response = await self.costos_agent.estimate_renovation(
            sqft=sqft,
            property_id=property_id,
            year_built=property_data.get("year"),
            condition=f"Areas to renovate: {', '.join(areas)}",
        )
        
        if not costos_response.success:
            return costos_response
        
        # Enhance with renovation-specific context
        result = costos_response.result
        result["areas_requested"] = areas
        result["property_address"] = property_data.get("address")
        
        return self._success_response(
            result=result,
            confidence=costos_response.confidence,
            suggestions=[
                "Revisa los materiales estimados",
                "Ajusta cantidades según inspección física",
                "Considera agregar items no incluidos",
            ]
        )
    
    # ============================================
    # HELPERS
    # ============================================
    
    def _parse_response(self, response: str) -> dict:
        """Parse LLM response, extracting JSON from markdown if needed."""
        import re
        
        # Try direct JSON parse first
        try:
            return json.loads(response)
        except json.JSONDecodeError:
            pass
        
        # Try extracting JSON from markdown code block
        json_match = re.search(r'```(?:json)?\s*(\{[\s\S]*?\})\s*```', response)
        if json_match:
            try:
                return json.loads(json_match.group(1))
            except json.JSONDecodeError:
                pass
        
        # Try finding raw JSON object in response
        json_match = re.search(r'\{[\s\S]*"status"[\s\S]*\}', response)
        if json_match:
            try:
                return json.loads(json_match.group())
            except json.JSONDecodeError:
                pass
        
        # Fallback
        return {
            "status": "success",
            "message": response,
            "sqft_verified": True,
            "data": None,
            "next_steps": [],
            "questions": []
        }
    
    async def _get_property_data(self, property_id: str) -> Optional[dict]:
        """Fetch property from database."""
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
    
    async def _get_materials_from_db(self) -> list[dict]:
        """Fetch available materials."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/materials/",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return response.json()
        except Exception as e:
            logger.warning(f"Could not fetch materials: {e}")
        return []
    
    def _extract_sqft_from_text(self, text: str) -> Optional[int]:
        """
        Extract square footage from natural language text.
        
        Handles phrases like:
        - "la casa tiene 840 pies cuadrados"
        - "840 sqft"
        - "son 1200 pies"
        - "mide 1100 square feet"
        """
        import re
        
        text_lower = text.lower()
        
        # Pattern: number followed by sqft/pies/feet
        patterns = [
            r'(\d{3,4})\s*(?:pies?\s*cuadrados?|sqft|sq\.?\s*ft\.?|square\s*feet?|pies?)',
            r'tiene\s*(\d{3,4})',
            r'mide\s*(\d{3,4})',
            r'son\s*(\d{3,4})',
            r'(\d{3,4})\s*(?:de\s*)?(?:tamaño|tamano|size)',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text_lower)
            if match:
                sqft = int(match.group(1))
                # Validate reasonable range for mobile homes (400-3000 sqft)
                if 400 <= sqft <= 3000:
                    return sqft
        
        return None
    
    async def _update_property_sqft(self, property_id: str, sqft: int) -> bool:
        """Update property square footage in database."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.patch(
                    f"{self.api_url}/api/properties/{property_id}",
                    json={"square_feet": sqft},
                    timeout=5.0
                )
                return response.status_code == 200
        except Exception as e:
            logger.warning(f"Could not update property sqft: {e}")
        return False


# Register the agent
renovacion_agent = RenovacionAgent()
AgentRegistry.register(renovacion_agent)

