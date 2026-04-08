"""
Evaluation Reports API — Persistent evaluation reports with unique IDs.

Flow:
1. Employee creates a draft evaluation (gets blank checklist)
2. Uploads photos → AI fills checklist items
3. Employee manually edits any checklist item
4. Employee adds extra notes
5. Employee generates final report → gets unique report number
6. Desktop: employee enters report number to link it to a listing/property
7. Renovation can import the report to auto-fill items
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Query
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class ChecklistItemUpdate(BaseModel):
    id: str
    status: str  # pass, fail, warning, needs_photo, not_evaluable
    note: Optional[str] = None
    confidence: Optional[str] = "high"


class UpdateEvaluationRequest(BaseModel):
    checklist: Optional[list[dict]] = None
    extra_notes: Optional[list[str]] = None


class LinkPropertyRequest(BaseModel):
    property_id: Optional[str] = None
    listing_id: Optional[str] = None


# ============================================================================
# CHECKLIST DEFINITION (shared with ai_assistant.py)
# ============================================================================

CHECKLIST_ITEMS = [
    # ESTRUCTURA (4)
    {"id": "marco_acero", "category": "Estructura", "label": "Marco de acero",
     "photo_hint": "Foto del faldón/parte inferior donde se vea el marco metálico — busca oxidación, dobleces, soldaduras rotas"},
    {"id": "suelos_subfloor", "category": "Estructura", "label": "Suelos/subfloor",
     "photo_hint": "Fotos de pisos en cada cuarto — busca hundimientos, manchas de agua, partes blandas, desniveles"},
    {"id": "techo_techumbre", "category": "Estructura", "label": "Techo/techumbre",
     "photo_hint": "Techo exterior (¿pandeo, parches?) + techos interiores (¿manchas de humedad, goteo, paneles sueltos?)"},
    {"id": "paredes_ventanas", "category": "Estructura", "label": "Paredes/ventanas",
     "photo_hint": "Panorámicas de paredes (¿grietas, huecos, moho?) y cada ventana (¿vidrios rotos, marcos podridos, sellos?)"},
    # INSTALACIONES (5)
    {"id": "regaderas_tinas", "category": "Instalaciones", "label": "Regaderas/tinas/coladeras",
     "photo_hint": "Regaderas, tinas y coladeras en cada baño — busca fugas, moho, azulejos rotos, presión de agua"},
    {"id": "electricidad", "category": "Instalaciones", "label": "Electricidad",
     "photo_hint": "Panel eléctrico abierto (¿breakers, cables quemados?) + enchufes/interruptores en cada cuarto"},
    {"id": "plomeria", "category": "Instalaciones", "label": "Plomería",
     "photo_hint": "Debajo de lavabos y fregadero — tuberías, conexiones, fugas activas, manchas de agua"},
    {"id": "ac", "category": "Instalaciones", "label": "A/C",
     "photo_hint": "Unidad A/C exterior (¿modelo, antigüedad, estado?) + interior (¿ductos, filtro, enciende?)"},
    {"id": "gas", "category": "Instalaciones", "label": "Gas",
     "photo_hint": "Tanque de gas, líneas de gas, calentador de agua — busca corrosión, conexiones flojas"},
]

PHOTO_EVALUABLE_IDS = {
    "marco_acero", "suelos_subfloor", "techo_techumbre", "paredes_ventanas",
    "regaderas_tinas", "electricidad", "plomeria", "ac", "gas",
}


def _generate_report_number() -> str:
    """Generate a human-readable report number: EVL-YYMMDD-XXX"""
    now = datetime.now()
    date_part = now.strftime("%y%m%d")
    # Get today's count
    today_start = now.strftime("%Y-%m-%d 00:00:00")
    existing = sb.table("evaluation_reports").select("id").gte(
        "created_at", today_start
    ).execute()
    seq = len(existing.data) + 1 if existing.data else 1
    return f"EVL-{date_part}-{seq:03d}"


def _blank_checklist() -> list[dict]:
    """Return blank checklist with all items set to 'pending'."""
    return [
        {
            "id": item["id"],
            "category": item["category"],
            "label": item["label"],
            "status": "pending",
            "confidence": "none",
            "note": "",
            "photo_hint": item["photo_hint"],
        }
        for item in CHECKLIST_ITEMS
    ]


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.post("")
async def create_evaluation():
    """Create a new draft evaluation with blank checklist."""
    report_number = _generate_report_number()
    checklist = _blank_checklist()

    result = sb.table("evaluation_reports").insert({
        "report_number": report_number,
        "checklist": checklist,
        "extra_notes": [],
        "status": "draft",
    }).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create evaluation")

    report = result.data[0]
    logger.info(f"[evaluation] Created draft: {report_number}")
    return report


@router.get("")
async def list_evaluations(
    status: Optional[str] = None,
    property_id: Optional[str] = None,
    limit: int = Query(50, ge=1, le=200),
):
    """List evaluation reports. Optionally filter by status or property_id."""
    q = sb.table("evaluation_reports").select("*").order("created_at", desc=True).limit(limit)
    if status:
        q = q.eq("status", status)
    if property_id:
        q = q.eq("property_id", property_id)
    result = q.execute()
    return {"evaluations": result.data or []}


@router.get("/by-number/{report_number}")
async def get_evaluation_by_number(report_number: str):
    """Get evaluation by report number."""
    result = sb.table("evaluation_reports").select("*").eq(
        "report_number", report_number.upper().strip()
    ).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail=f"Reporte '{report_number}' no encontrado")
    return result.data[0]


@router.get("/debug/openai-test")
async def debug_openai_test():
    """Quick test to verify OpenAI connectivity from Railway."""
    import httpx
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return {"error": "No OPENAI_API_KEY"}

    results = {"key_prefix": api_key[:15]}

    # Test 1: raw httpx to api.openai.com
    try:
        async with httpx.AsyncClient(timeout=15.0) as http:
            r = await http.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                json={"model": "gpt-5", "messages": [{"role": "user", "content": "Say OK"}], "max_completion_tokens": 5},
            )
            results["httpx_status"] = r.status_code
            results["httpx_body"] = r.json() if r.status_code == 200 else r.text[:300]
    except Exception as e:
        results["httpx_error"] = f"{type(e).__name__}: {e}"

    # Test 2: OpenAI SDK
    try:
        import openai
        results["openai_version"] = openai.__version__
        client = openai.AsyncOpenAI(api_key=api_key, timeout=15.0)
        resp = await client.chat.completions.create(
            model="gpt-5",
            messages=[{"role": "user", "content": "Say OK"}],
            max_completion_tokens=5,
        )
        results["sdk_ok"] = True
        results["sdk_model"] = resp.model
    except Exception as e:
        results["sdk_ok"] = False
        results["sdk_error"] = f"{type(e).__name__}: {str(e)[:300]}"
        # Get underlying cause
        if hasattr(e, '__cause__') and e.__cause__:
            results["sdk_cause"] = f"{type(e.__cause__).__name__}: {str(e.__cause__)[:300]}"

    return results


@router.get("/{evaluation_id}")
async def get_evaluation(evaluation_id: str):
    """Get evaluation by ID."""
    result = sb.table("evaluation_reports").select("*").eq("id", evaluation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")
    return result.data[0]


@router.patch("/{evaluation_id}")
async def update_evaluation(evaluation_id: str, data: UpdateEvaluationRequest):
    """Update checklist items and/or extra notes."""
    updates = {"updated_at": datetime.now().isoformat()}
    if data.checklist is not None:
        updates["checklist"] = data.checklist
    if data.extra_notes is not None:
        updates["extra_notes"] = data.extra_notes

    result = sb.table("evaluation_reports").update(updates).eq("id", evaluation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    return result.data[0]


@router.post("/{evaluation_id}/analyze-photos")
async def analyze_photos(
    evaluation_id: str,
    files: list[UploadFile] = File(...),
):
    """Upload photos and have AI analyze them to fill checklist items."""
    # Get current evaluation
    eval_result = sb.table("evaluation_reports").select("*").eq("id", evaluation_id).execute()
    if not eval_result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    evaluation = eval_result.data[0]
    current_checklist = evaluation.get("checklist") or _blank_checklist()

    try:
        import openai
        import base64
        import uuid as _uuid

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        logger.info(f"[evaluation] Using OpenAI key: {api_key[:12]}...{api_key[-4:]}")
        client = openai.AsyncOpenAI(api_key=api_key, timeout=90.0)

        image_contents = []
        saved_photo_urls = []
        for file in files[:10]:
            raw = await file.read()
            if len(raw) == 0:
                continue
            b64 = base64.b64encode(raw).decode("utf-8")
            ext = (file.filename or "photo.jpeg").rsplit(".", 1)[-1].lower()
            mime = f"image/{ext}" if ext in ("jpeg", "jpg", "png", "gif", "webp") else "image/jpeg"
            image_contents.append({
                "type": "image_url",
                "image_url": {"url": f"data:{mime};base64,{b64}", "detail": "high"},
            })

            # Persist photo to Supabase Storage
            try:
                storage_path = f"evaluations/{evaluation_id}/{_uuid.uuid4().hex[:8]}_{file.filename or 'photo.jpg'}"
                sb.storage.from_("property-photos").upload(
                    storage_path, raw,
                    {"content-type": mime}
                )
                photo_url = sb.storage.from_("property-photos").get_public_url(storage_path)
                if photo_url and photo_url.endswith("?"):
                    photo_url = photo_url[:-1]
                saved_photo_urls.append(photo_url)
            except Exception as storage_err:
                logger.warning(f"[evaluations] Photo storage failed: {storage_err}")

        # Save photo URLs to the evaluation record
        if saved_photo_urls:
            existing_photos = evaluation.get("photos") or []
            all_photos = existing_photos + saved_photo_urls
            try:
                sb.table("evaluation_reports").update({"photos": all_photos}).eq("id", evaluation_id).execute()
            except Exception as db_err:
                logger.warning(f"[evaluations] Could not save photo URLs to DB: {db_err}")

        if not image_contents:
            raise HTTPException(status_code=400, detail="No valid images received")

        # Build checklist text for the prompt
        checklist_text_lines = []
        for item in CHECKLIST_ITEMS:
            evaluable = "EVALUAR POR FOTO" if item["id"] in PHOTO_EVALUABLE_IDS else "DOCUMENTO/ADMIN (marcar not_evaluable)"
            # Show current status if employee already set it
            current_item = next((c for c in current_checklist if c["id"] == item["id"]), None)
            current_status = current_item.get("status", "pending") if current_item else "pending"
            override_note = ""
            if current_status not in ("pending", "needs_photo"):
                override_note = f" [EMPLEADO YA MARCÓ: {current_status}]"
            checklist_text_lines.append(
                f'id="{item["id"]}" | {item["category"]} | {item["label"]} | {evaluable}{override_note}'
            )
        checklist_text = "\n".join(checklist_text_lines)

        prompt = f"""Eres un inspector profesional de casas móviles (manufactured homes / mobile homes). Evalúa las fotos que recibes y marca cada punto del checklist.

REGLA FUNDAMENTAL: Cada foto puede ser relevante para VARIOS puntos del checklist a la vez. Una foto de un cuarto muestra pisos, paredes, ventanas, y techo interior — evalúa TODOS esos puntos con esa foto. NO marques "needs_photo" si hay CUALQUIER foto donde se pueda ver algo relevante para ese punto.

CÓMO DECIDIR EL STATUS:
- "pass" → Se ve y está en buena condición
- "warning" → Se ve un problema menor/cosmético (pintura descascarada, carpet manchado, ventana con sello viejo)
- "fail" → Se ve un problema grave (vidrio roto, piso hundido, mancha grande de agua/moho, cables expuestos)
- "needs_photo" → NO se ve en NINGUNA de las fotos. SOLO usar si realmente no hay forma de evaluar.

EJEMPLOS DE EVALUACIÓN CORRECTA:

Ejemplo 1 — Foto de interior de sala con ventana rota visible:
  marco_acero: needs_photo (no se ve el marco inferior) note: ""
  suelos_subfloor: warning, note: "Carpet visible con desgaste moderado, sin hundimientos aparentes"
  techo_techumbre: pass, note: "Techo interior sin manchas de humedad ni pandeo"
  paredes_ventanas: fail, note: "Ventana de sala con vidrio roto, marco de aluminio intacto"
  regaderas_tinas: needs_photo, note: ""
  electricidad: pass, note: "Enchufes e interruptores visibles en buen estado"
  plomeria: needs_photo, note: ""
  ac: needs_photo, note: ""
  gas: needs_photo, note: ""

Ejemplo 2 — Foto exterior mostrando fachada completa:
  marco_acero: needs_photo (faldón cubierto, no se ve el marco) note: ""
  suelos_subfloor: needs_photo, note: ""
  techo_techumbre: warning, note: "Techo de metal con parche visible de ~50cm en sección central"
  paredes_ventanas: warning, note: "Siding de vinyl con sección desprendida lado izquierdo, 3 ventanas visibles sin daños"
  regaderas_tinas: needs_photo, note: ""
  electricidad: needs_photo, note: ""
  plomeria: needs_photo, note: ""
  ac: pass, note: "Unidad A/C exterior visible, modelo reciente, sin óxido"
  gas: pass, note: "Tanque de propano presente junto a la unidad"

Ejemplo 3 — Foto de baño:
  marco_acero: needs_photo, note: ""
  suelos_subfloor: fail, note: "Piso de vinyl levantado alrededor del inodoro, posible daño por agua"
  techo_techumbre: pass, note: "Techo de baño sin manchas"
  paredes_ventanas: pass, note: "Paredes de baño sin moho ni grietas"
  regaderas_tinas: warning, note: "Calafateo de tina deteriorado, necesita reemplazo. No se ven fugas activas"
  electricidad: pass, note: "Interruptor de luz funcional visible"
  plomeria: warning, note: "Tuberías visibles debajo del lavabo con corrosión leve"
  ac: needs_photo, note: ""
  gas: needs_photo, note: ""

IMPORTANTE:
- Si ves una ventana rota → paredes_ventanas = "fail"
- Si ves pisos manchados → suelos_subfloor = "warning" o "fail"
- Si ves moho en paredes → paredes_ventanas = "fail"
- Si ves un panel eléctrico → electricidad = "pass" o "fail"
- Si ves una regadera/tina → regaderas_tinas = evalúa
- CADA foto muestra algo — analízala a fondo para TODOS los puntos visibles
- En "note": describe SOLO lo que ves. Si status es "needs_photo", note debe ser "" (vacío).
- Si el EMPLEADO ya marcó un ítem ([EMPLEADO YA MARCÓ]), respétalo.

CHECKLIST ({len(CHECKLIST_ITEMS)} puntos):
{checklist_text}

Responde SOLO en JSON válido:
{{
  "checklist": [
    {{"id": "marco_acero", "category": "Estructura", "label": "Marco de acero", "status": "pass|fail|warning|needs_photo", "confidence": "high|medium|low", "note": "descripción de lo observado o vacío"}},
    ...los {len(CHECKLIST_ITEMS)} items...
  ],
  "property_type": "single_wide" o "double_wide" o "N/A",
  "estimated_year": "YYYY" o "N/A",
  "estimated_bedrooms": número o 0,
  "photos_coverage": "Áreas cubiertas: ... Faltan: ..."
}}"""

        response = await client.chat.completions.create(
            model="gpt-5",
            messages=[
                {"role": "system", "content": "Eres un inspector experto de casas móviles. Responde SOLO con JSON válido."},
                {"role": "user", "content": [{"type": "text", "text": prompt}] + image_contents},
            ],
            max_completion_tokens=4096,
        )

        result_text = response.choices[0].message.content or "{}"
        import re
        json_match = re.search(r'```json\s*(.*?)\s*```', result_text, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else result_text.strip()
        if not json_str.startswith('{'):
            brace_idx = json_str.find('{')
            if brace_idx >= 0:
                json_str = json_str[brace_idx:]

        ai_result = json.loads(json_str)
        ai_checklist = ai_result.get("checklist", [])

        # Merge AI results with current checklist (respect manual edits)
        merged = []
        for item in current_checklist:
            ai_item = next((a for a in ai_checklist if a["id"] == item["id"]), None)
            if item["status"] not in ("pending", "needs_photo"):
                # Employee already manually set this — keep their evaluation
                merged.append(item)
            elif ai_item:
                ai_status = ai_item.get("status", item["status"])
                # Only use AI note if it actually evaluated something (pass/fail/warning)
                # For needs_photo, keep existing note empty — photo_hint already guides the employee
                ai_note = ai_item.get("note", "") if ai_status in ("pass", "fail", "warning") else ""
                merged.append({
                    **item,
                    "status": ai_status,
                    "confidence": ai_item.get("confidence", "medium"),
                    "note": ai_note,
                })
            else:
                merged.append(item)

        # Update the evaluation
        photos_count = (evaluation.get("photos_count") or 0) + len(image_contents)
        updates = {
            "checklist": merged,
            "photos_count": photos_count,
            "property_type": ai_result.get("property_type"),
            "estimated_year": ai_result.get("estimated_year"),
            "estimated_bedrooms": ai_result.get("estimated_bedrooms"),
            "photos_coverage": ai_result.get("photos_coverage"),
            "updated_at": datetime.now().isoformat(),
        }
        sb.table("evaluation_reports").update(updates).eq("id", evaluation_id).execute()

        # Build summary
        statuses = [i.get("status", "pending") for i in merged]
        summary = {
            "total": len(merged),
            "passed": statuses.count("pass"),
            "failed": statuses.count("fail"),
            "warnings": statuses.count("warning"),
            "needs_photo": statuses.count("needs_photo"),
            "not_evaluable": statuses.count("not_evaluable"),
            "pending": statuses.count("pending"),
        }

        logger.info(f"[evaluation] AI analyzed {len(image_contents)} photos for {evaluation['report_number']}: {summary}")

        return {
            "checklist": merged,
            "summary": summary,
            "property_type": ai_result.get("property_type"),
            "estimated_year": ai_result.get("estimated_year"),
            "estimated_bedrooms": ai_result.get("estimated_bedrooms"),
            "photos_coverage": ai_result.get("photos_coverage"),
        }

    except HTTPException:
        raise
    except json.JSONDecodeError as e:
        logger.error(f"[evaluation] JSON parse error: {e}")
        raise HTTPException(status_code=500, detail="AI returned invalid JSON")
    except Exception as e:
        logger.error(f"[evaluation] Error ({type(e).__name__}): {e}")
        raise HTTPException(status_code=500, detail=f"{type(e).__name__}: {str(e)}")


@router.post("/{evaluation_id}/generate-report")
async def generate_report(evaluation_id: str):
    """Generate final AI report and assign report number. Marks as completed."""
    eval_result = sb.table("evaluation_reports").select("*").eq("id", evaluation_id).execute()
    if not eval_result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    evaluation = eval_result.data[0]
    checklist = evaluation.get("checklist") or []
    extra_notes = evaluation.get("extra_notes") or []

    # Build summary — N/A and unevaluated items are excluded from scoring
    statuses = [i.get("status", "pending") for i in checklist]
    passed = statuses.count("pass")
    failed = statuses.count("fail")
    warnings = statuses.count("warning")
    not_applicable = statuses.count("not_evaluable") + statuses.count("needs_photo")
    pending = statuses.count("pending")
    total = len(statuses)
    # Only count items that have been evaluated (pass/fail/warning)
    total_evaluated = passed + failed + warnings

    # Calculate score — only evaluated items count (N/A items neither add nor subtract)
    if total_evaluated > 0:
        score = int((passed / total_evaluated) * 100)
    else:
        score = 0

    # Determine recommendation
    if failed >= 5 or (total_evaluated > 0 and score < 40):
        recommendation = "NO COMPRAR"
        recommendation_reason = f"Demasiadas fallas ({failed}) detectadas. Riesgo alto de costos excesivos de renovación."
    elif pending > 0 and (pending + not_applicable) > total * 0.5:
        recommendation = "REVISAR CON CUIDADO"
        recommendation_reason = f"Evaluación incompleta: {pending} de {total} puntos sin evaluar. Necesita inspección más detallada."
    elif failed >= 3 or warnings >= 5 or (total_evaluated > 0 and score < 60):
        recommendation = "REVISAR CON CUIDADO"
        recommendation_reason = f"Se encontraron {failed} fallas y {warnings} alertas. Necesita inspección detallada antes de decidir."
    else:
        recommendation = "COMPRAR"
        recommendation_reason = f"Casa en buenas condiciones ({passed}/{total_evaluated} puntos aprobados). Reparaciones menores esperadas."

    # Generate AI summary using checklist + notes
    try:
        import openai
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            client = openai.AsyncOpenAI(api_key=api_key, timeout=90.0)

            checklist_summary = ""
            for item in checklist:
                if item["status"] in ("fail", "warning"):
                    checklist_summary += f"- {item['label']} ({item['category']}): {item['status'].upper()} — {item.get('note', 'Sin nota')}\n"

            extra_notes_text = "\n".join(f"- {note}" for note in extra_notes) if extra_notes else "Ninguna"

            response = await client.chat.completions.create(
                model="gpt-5-mini",
                messages=[
                    {"role": "system", "content": "Eres un inspector de casas móviles. Genera un resumen ejecutivo breve (3-5 oraciones) del estado de la casa."},
                    {"role": "user", "content": f"""Reporte de evaluación:
Score: {score}/100
Aprobados: {passed}, Fallas: {failed}, Alertas: {warnings}
Recomendación: {recommendation}

FALLAS Y ALERTAS:
{checklist_summary or 'Ninguna'}

NOTAS EXTRAS DEL EMPLEADO:
{extra_notes_text}

Genera un resumen ejecutivo en español (3-5 oraciones) del estado general de la casa y las principales preocupaciones."""},
                ],
                max_completion_tokens=500,
            )
            ai_summary = response.choices[0].message.content or ""
        else:
            ai_summary = f"Evaluación completada con score {score}/100. {passed} puntos aprobados, {failed} fallas, {warnings} alertas."
    except Exception as e:
        logger.error(f"[evaluation] AI summary error: {e}")
        ai_summary = f"Score: {score}/100. {passed} aprobados, {failed} fallas, {warnings} alertas."

    # Update evaluation as completed
    updates = {
        "status": "completed",
        "score": score,
        "recommendation": recommendation,
        "recommendation_reason": recommendation_reason,
        "ai_summary": ai_summary,
        "updated_at": datetime.now().isoformat(),
    }
    result = sb.table("evaluation_reports").update(updates).eq("id", evaluation_id).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update evaluation")

    logger.info(f"[evaluation] Report generated: {evaluation['report_number']} — Score {score}, {recommendation}")
    return result.data[0]


@router.post("/{evaluation_id}/link")
async def link_evaluation(evaluation_id: str, data: LinkPropertyRequest):
    """Link evaluation report to a property or listing."""
    updates = {"updated_at": datetime.now().isoformat()}
    if data.property_id:
        updates["property_id"] = data.property_id
    if data.listing_id:
        updates["listing_id"] = data.listing_id

    result = sb.table("evaluation_reports").update(updates).eq("id", evaluation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    logger.info(f"[evaluation] Linked {evaluation_id} → property={data.property_id}, listing={data.listing_id}")
    return result.data[0]

