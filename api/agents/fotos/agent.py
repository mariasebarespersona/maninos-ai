"""
FotosAgent - INTELLIGENT Photo Classification using Vision AI.

Used in Step 4: Volver a Publicar
- 4.2 Fotos nuevas

This agent uses GPT-4 Vision to ACTUALLY analyze photos and classify them.
NO keyword matching. REAL image understanding.

Following Developer Bible: DATA-DRIVEN, NOT KEYWORD-DRIVEN
"""

import logging
import base64
import httpx
from typing import Optional
from pydantic import BaseModel, Field

from ..base import BaseAgent, AgentRequest, AgentResponse

logger = logging.getLogger(__name__)


# ============================================
# FOTOS-SPECIFIC SCHEMAS
# ============================================

class PhotoClassification(BaseModel):
    """Classification result for a single photo."""
    photo_url: str
    classification: str  # "before", "after", "exterior", "interior", "unknown"
    confidence: float
    reasoning: str  # Why the AI classified it this way
    detected_features: list[str]  # What the AI saw in the image
    quality_score: float  # Image quality assessment
    suggested_order: int  # For gallery ordering


class PhotosResult(BaseModel):
    """Result from photo classification."""
    property_id: Optional[str] = None
    total_photos: int
    classifications: list[PhotoClassification]
    before_photos: list[str]
    after_photos: list[str]
    exterior_photos: list[str]
    interior_photos: list[str]
    summary: str
    gallery_order: list[str]  # Recommended order for display


# ============================================
# FOTOS AGENT (VISION AI)
# ============================================

class FotosAgent(BaseAgent):
    """
    INTELLIGENT Photo Classification Agent using GPT-4 Vision.
    
    This agent ACTUALLY looks at the images to understand:
    - Is this a before or after renovation photo?
    - What condition is the property in?
    - What features are visible?
    
    NO KEYWORD MATCHING. Real visual understanding.
    """
    
    def __init__(self):
        super().__init__(
            name="fotos",
            description="Intelligent photo classification using Vision AI",
            model="gpt-4o",  # GPT-4o has vision capabilities
            temperature=0.1,
        )
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are FotosAgent, an expert at analyzing mobile home property photos.
You use visual AI to ACTUALLY see and understand the images.

# YOUR VISION CAPABILITIES
You can see and analyze:
- Condition of walls, floors, fixtures
- Signs of renovation (new paint, new flooring, updated fixtures)
- Signs of wear (stains, damage, old materials)
- Interior vs exterior shots
- Photo quality and composition

# HOW TO CLASSIFY

## "BEFORE" Renovation Indicators (visible in image):
- Worn or stained walls/floors
- Outdated fixtures (old light fixtures, dated cabinets)
- Visible damage or repairs needed
- Bare/unfinished surfaces
- Old carpet, peeling paint
- General "lived-in" or neglected appearance

## "AFTER" Renovation Indicators (visible in image):
- Fresh paint (clean, uniform walls)
- New flooring (vinyl, laminate, tile)
- Updated fixtures (modern lights, new faucets)
- Clean, staged appearance
- Professional photography quality
- Everything looks new/refreshed

## "EXTERIOR" Indicators:
- Shows the outside of the mobile home
- Lot/land visible
- Skirting, entry stairs
- Surroundings/neighborhood

## "INTERIOR" (neutral - could be before or after):
- Shows inside but ambiguous condition

# OUTPUT FORMAT
For each photo, provide:
{
  "classification": "before" | "after" | "exterior" | "interior" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "I see [specific visual elements] that indicate...",
  "detected_features": ["fresh paint", "new flooring", "modern fixtures"],
  "quality_score": 0.0-1.0
}

# IMPORTANT
- Base classification ONLY on what you SEE in the image
- Never guess based on filename or URL
- If unsure, use "unknown" with low confidence
- Describe specific visual elements you observe
"""
    
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process photo classification request using Vision AI.
        """
        logger.info(f"[FotosAgent] Processing: {request.query}")
        
        # Check if LLM is available
        if not self.llm:
            return self._error_response(
                "FotosAgent requires Vision AI (OPENAI_API_KEY not configured). "
                "This agent uses AI to actually analyze the photos."
            )
        
        try:
            context = request.context or {}
            photo_urls = context.get("photo_urls", [])
            
            if not photo_urls:
                return self._success_response(
                    result={"message": "No photos provided. Send photo_urls in context."},
                    confidence=1.0,
                    suggestions=["Proporciona las URLs de las fotos a clasificar"],
                )
            
            # Classify each photo using Vision AI
            result = await self.classify_photos_with_vision(
                photo_urls=photo_urls,
                property_id=request.property_id,
            )
            
            return self._success_response(
                result=result.model_dump(),
                confidence=self._calculate_overall_confidence(result),
                suggestions=[
                    "Revisa las clasificaciones del AI",
                    "Las fotos 'después' aparecen primero en la galería",
                    "Ajusta manualmente si el AI cometió errores",
                ],
            )
            
        except Exception as e:
            logger.error(f"[FotosAgent] Error: {e}")
            return self._error_response(str(e))
    
    async def classify_photos_with_vision(
        self,
        photo_urls: list[str],
        property_id: Optional[str] = None,
    ) -> PhotosResult:
        """
        Classify photos using GPT-4 Vision to actually analyze the images.
        """
        classifications = []
        before_photos = []
        after_photos = []
        exterior_photos = []
        interior_photos = []
        
        for i, url in enumerate(photo_urls):
            try:
                # Analyze this photo with Vision AI
                classification = await self._analyze_single_photo(url, i)
                classifications.append(classification)
                
                # Sort into categories
                if classification.classification == "before":
                    before_photos.append(url)
                elif classification.classification == "after":
                    after_photos.append(url)
                elif classification.classification == "exterior":
                    exterior_photos.append(url)
                else:
                    interior_photos.append(url)
                    
            except Exception as e:
                logger.warning(f"Could not analyze photo {url}: {e}")
                classifications.append(PhotoClassification(
                    photo_url=url,
                    classification="unknown",
                    confidence=0.0,
                    reasoning=f"Error analyzing: {str(e)}",
                    detected_features=[],
                    quality_score=0.0,
                    suggested_order=i,
                ))
        
        # Determine optimal gallery order: after > exterior > interior > before
        gallery_order = after_photos + exterior_photos + interior_photos + before_photos
        
        return PhotosResult(
            property_id=property_id,
            total_photos=len(photo_urls),
            classifications=classifications,
            before_photos=before_photos,
            after_photos=after_photos,
            exterior_photos=exterior_photos,
            interior_photos=interior_photos,
            summary=self._generate_summary(classifications),
            gallery_order=gallery_order,
        )
    
    async def _analyze_single_photo(self, photo_url: str, index: int) -> PhotoClassification:
        """
        Analyze a single photo using GPT-4 Vision.
        
        This ACTUALLY sends the image to the Vision API for analysis.
        """
        from langchain_core.messages import HumanMessage
        
        # Create vision message with the image
        message = HumanMessage(
            content=[
                {
                    "type": "text",
                    "text": """Analyze this mobile home property photo.

Determine:
1. Is this a BEFORE renovation, AFTER renovation, or EXTERIOR shot?
2. What specific visual elements led to your classification?
3. Rate the photo quality (0-1)

Respond with JSON only:
{
  "classification": "before" | "after" | "exterior" | "interior" | "unknown",
  "confidence": 0.0-1.0,
  "reasoning": "I observed [specific elements]...",
  "detected_features": ["feature1", "feature2"],
  "quality_score": 0.0-1.0
}"""
                },
                {
                    "type": "image_url",
                    "image_url": {"url": photo_url}
                }
            ]
        )
        
        try:
            # Call Vision API
            response = await self.llm.ainvoke([message])
            
            # Parse response
            import json
            data = json.loads(response.content)
            
            return PhotoClassification(
                photo_url=photo_url,
                classification=data.get("classification", "unknown"),
                confidence=float(data.get("confidence", 0.5)),
                reasoning=data.get("reasoning", ""),
                detected_features=data.get("detected_features", []),
                quality_score=float(data.get("quality_score", 0.5)),
                suggested_order=index,
            )
            
        except Exception as e:
            logger.warning(f"Vision analysis failed for {photo_url}: {e}")
            # Return unknown if vision fails
            return PhotoClassification(
                photo_url=photo_url,
                classification="unknown",
                confidence=0.3,
                reasoning=f"Could not analyze image: {str(e)}",
                detected_features=[],
                quality_score=0.5,
                suggested_order=index,
            )
    
    def _calculate_overall_confidence(self, result: PhotosResult) -> float:
        """Calculate overall confidence from all classifications."""
        if not result.classifications:
            return 0.0
        
        confidences = [c.confidence for c in result.classifications]
        return sum(confidences) / len(confidences)
    
    def _generate_summary(self, classifications: list[PhotoClassification]) -> str:
        """Generate intelligent summary of the classification results."""
        total = len(classifications)
        if total == 0:
            return "No se analizaron fotos"
        
        before = sum(1 for c in classifications if c.classification == "before")
        after = sum(1 for c in classifications if c.classification == "after")
        exterior = sum(1 for c in classifications if c.classification == "exterior")
        unknown = sum(1 for c in classifications if c.classification == "unknown")
        
        avg_confidence = sum(c.confidence for c in classifications) / total
        
        parts = []
        if after > 0:
            parts.append(f"{after} después de renovación")
        if before > 0:
            parts.append(f"{before} antes de renovación")
        if exterior > 0:
            parts.append(f"{exterior} exteriores")
        if unknown > 0:
            parts.append(f"{unknown} no clasificadas")
        
        return f"Analicé {total} fotos: {', '.join(parts)}. Confianza promedio: {avg_confidence:.0%}"
