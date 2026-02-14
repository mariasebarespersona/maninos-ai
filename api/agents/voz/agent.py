"""
VozAgent - Voice Commands with Whisper + LLM Processing.

Used for hands-free data entry:
- Dictar lista de materiales
- Agregar notas de inspección
- Crear registros mientras se camina por la propiedad

This agent:
1. Transcribes audio using OpenAI Whisper
2. Processes the transcription with LLM to extract structured data
3. Returns actionable results

Following Developer Bible: DATA-DRIVEN, NOT KEYWORD-DRIVEN
"""

import json
import logging
import os
import tempfile
from typing import Optional
from pydantic import BaseModel, Field
import httpx

from ..base import BaseAgent, AgentRequest, AgentResponse

logger = logging.getLogger(__name__)


# ============================================
# VOZ-SPECIFIC SCHEMAS
# ============================================

class MaterialFromVoice(BaseModel):
    """Material item extracted from voice."""
    material_name: str
    quantity: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    confidence: float


class InspectionNote(BaseModel):
    """Inspection note extracted from voice."""
    area: str  # kitchen, bathroom, bedroom, etc.
    observation: str
    severity: str  # minor, moderate, major
    action_needed: Optional[str] = None


class VoiceExtractionResult(BaseModel):
    """Result from voice processing."""
    transcription: str
    language: str
    intent: str  # "add_materials", "inspection_note", "general_note", "unknown"
    materials: list[MaterialFromVoice] = Field(default_factory=list)
    notes: list[InspectionNote] = Field(default_factory=list)
    general_text: Optional[str] = None
    confidence: float
    summary: str


# ============================================
# VOZ AGENT (WHISPER + LLM)
# ============================================

class VozAgent(BaseAgent):
    """
    Voice Processing Agent using Whisper + LLM.
    
    Pipeline:
    1. Receive audio (URL or base64)
    2. Transcribe with OpenAI Whisper
    3. Process transcription with LLM to extract:
       - Materials to add
       - Inspection notes
       - Actions to take
    
    Fully intelligent - no keyword matching.
    """
    
    def __init__(self):
        super().__init__(
            name="voz",
            description="Voice commands with Whisper transcription and intelligent processing",
            model="gpt-4o",
            temperature=0.1,
        )
        # Separate OpenAI client for Whisper
        try:
            from openai import AsyncOpenAI
            api_key = os.getenv("OPENAI_API_KEY")
            if api_key:
                self.whisper_client = AsyncOpenAI(api_key=api_key)
            else:
                self.whisper_client = None
        except Exception as e:
            logger.warning(f"Could not initialize Whisper client: {e}")
            self.whisper_client = None
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are VozAgent, processing voice commands for Maninos Homes employees.
You receive transcriptions and extract actionable data.

# YOUR INTELLIGENCE
You understand:
- Spanish and English (often mixed)
- Construction/renovation terminology
- Context of mobile home renovation
- What the employee is trying to accomplish

# INTENTS TO DETECT

## 1. add_materials
Employee is listing materials needed.
Examples:
- "Necesito cinco galones de pintura blanca"
- "Add 200 square feet of vinyl flooring"
- "Pon tres luces LED y dos contactos"

Extract: material name, quantity, unit

## 2. inspection_note
Employee is noting something during inspection.
Examples:
- "El baño tiene moho en las paredes"
- "Kitchen cabinets need replacement"
- "La ventana del cuarto principal está rota"

Extract: area, observation, severity, action needed

## 3. general_note
Just a note or comment.
Examples:
- "Recordar llamar al electricista mañana"
- "This property looks promising"

Extract: the note text

# OUTPUT FORMAT
{
  "transcription": "original transcription",
  "language": "es" | "en" | "mixed",
  "intent": "add_materials" | "inspection_note" | "general_note" | "unknown",
  "materials": [
    {
      "material_name": "Interior Paint",
      "quantity": 5,
      "unit": "gallon",
      "notes": "white color",
      "confidence": 0.9
    }
  ],
  "notes": [
    {
      "area": "bathroom",
      "observation": "Mold on walls",
      "severity": "major",
      "action_needed": "Professional mold remediation"
    }
  ],
  "general_text": null,
  "confidence": 0.85,
  "summary": "Extracted 1 material: 5 gal paint"
}

# IMPORTANT
- Understand intent from MEANING, not keywords
- Handle Spanglish naturally
- Be helpful even with unclear audio
- Always include confidence level
- Multiple intents in one message are possible
"""
    
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process voice input.
        
        Accepts either:
        - audio_url in context
        - audio_base64 in context
        - direct transcription in query
        """
        logger.info(f"[VozAgent] Processing voice request")
        
        context = request.context or {}
        transcription = None
        
        # Check if we have audio to transcribe
        audio_url = context.get("audio_url")
        audio_base64 = context.get("audio_base64")
        
        if audio_url or audio_base64:
            # Need to transcribe first
            if not self.whisper_client:
                return self._error_response(
                    "VozAgent requires Whisper API (OPENAI_API_KEY not configured). "
                    "Cannot transcribe audio without it."
                )
            
            transcription = await self._transcribe_audio(audio_url, audio_base64)
            if not transcription:
                return self._error_response("Could not transcribe audio")
        else:
            # Assume query is already the transcription
            transcription = request.query
        
        # Now process the transcription with LLM
        if not self.llm:
            return self._error_response(
                "VozAgent requires LLM (OPENAI_API_KEY not configured). "
                "Cannot intelligently process transcription without it."
            )
        
        try:
            # Process transcription
            result = await self._process_transcription(transcription)
            
            return self._success_response(
                result=result.model_dump(),
                confidence=result.confidence,
                suggestions=self._generate_suggestions(result),
            )
            
        except Exception as e:
            logger.error(f"[VozAgent] Error: {e}")
            return self._error_response(str(e))
    
    async def _transcribe_audio(
        self,
        audio_url: Optional[str] = None,
        audio_base64: Optional[str] = None,
    ) -> Optional[str]:
        """
        Transcribe audio using OpenAI Whisper.
        """
        try:
            if audio_url:
                # Download audio first
                async with httpx.AsyncClient() as client:
                    response = await client.get(audio_url, timeout=30.0)
                    audio_data = response.content
            elif audio_base64:
                import base64
                audio_data = base64.b64decode(audio_base64)
            else:
                return None
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as f:
                f.write(audio_data)
                temp_path = f.name
            
            # Transcribe with Whisper
            with open(temp_path, "rb") as audio_file:
                response = await self.whisper_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=audio_file,
                    language="es",  # Primary language, but Whisper handles mixed
                )
            
            # Clean up
            os.unlink(temp_path)
            
            return response.text
            
        except Exception as e:
            logger.error(f"Transcription failed: {e}")
            return None
    
    async def _process_transcription(self, transcription: str) -> VoiceExtractionResult:
        """
        Process transcription with LLM to extract structured data.
        """
        prompt = f"""Process this voice transcription from a Maninos Homes employee:

TRANSCRIPTION: "{transcription}"

Extract:
1. What is the intent? (add_materials, inspection_note, general_note)
2. If materials: what materials, quantities, units?
3. If inspection: what area, observation, severity?
4. Confidence in your extraction

Respond with JSON only."""

        llm_response = await self._call_llm(prompt, {})
        
        try:
            data = json.loads(llm_response)
            
            materials = [
                MaterialFromVoice(**m) for m in data.get("materials", [])
            ]
            notes = [
                InspectionNote(**n) for n in data.get("notes", [])
            ]
            
            return VoiceExtractionResult(
                transcription=transcription,
                language=data.get("language", "es"),
                intent=data.get("intent", "unknown"),
                materials=materials,
                notes=notes,
                general_text=data.get("general_text"),
                confidence=float(data.get("confidence", 0.7)),
                summary=data.get("summary", "Processed"),
            )
            
        except json.JSONDecodeError:
            # LLM didn't return valid JSON
            return VoiceExtractionResult(
                transcription=transcription,
                language="unknown",
                intent="unknown",
                materials=[],
                notes=[],
                general_text=llm_response,
                confidence=0.3,
                summary="Could not parse intent clearly",
            )
    
    def _generate_suggestions(self, result: VoiceExtractionResult) -> list[str]:
        """Generate contextual suggestions."""
        suggestions = []
        
        if result.intent == "add_materials" and result.materials:
            suggestions.append("Confirma los materiales antes de agregarlos")
            suggestions.append("Revisa las cantidades extraídas")
        
        if result.intent == "inspection_note" and result.notes:
            for note in result.notes:
                if note.severity == "major":
                    suggestions.append(f"⚠️ Revisar urgente: {note.area}")
        
        if result.confidence < 0.6:
            suggestions.append("Baja confianza - considera repetir el comando")
        
        return suggestions
    
    # ============================================
    # DIRECT METHODS
    # ============================================
    
    async def transcribe_and_extract_materials(
        self,
        audio_url: Optional[str] = None,
        audio_base64: Optional[str] = None,
    ) -> AgentResponse:
        """
        Convenience method for material extraction from voice.
        """
        return await self.process(AgentRequest(
            query="Extract materials from audio",
            context={
                "audio_url": audio_url,
                "audio_base64": audio_base64,
                "expected_intent": "add_materials",
            }
        ))
    
    async def process_text_as_voice(self, text: str) -> AgentResponse:
        """
        Process text as if it were voice (for testing without audio).
        """
        return await self.process(AgentRequest(query=text))
