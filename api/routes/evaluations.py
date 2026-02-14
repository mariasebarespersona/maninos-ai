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
     "photo_hint": "Foto del faldón/parte inferior donde se vea el marco metálico"},
    {"id": "suelos_subfloor", "category": "Estructura", "label": "Suelos/subfloor",
     "photo_hint": "Fotos de pisos — hundimientos, manchas de agua, partes blandas"},
    {"id": "techo_techumbre", "category": "Estructura", "label": "Techo/techumbre",
     "photo_hint": "Techo exterior + interiores buscando manchas de humedad"},
    {"id": "paredes_ventanas", "category": "Estructura", "label": "Paredes/ventanas",
     "photo_hint": "Panorámicas de paredes y ventanas (¿grietas, vidrios rotos?)"},
    # INSTALACIONES (5)
    {"id": "regaderas_tinas", "category": "Instalaciones", "label": "Regaderas/tinas/coladeras",
     "photo_hint": "Regaderas, tinas y coladeras en cada baño"},
    {"id": "electricidad", "category": "Instalaciones", "label": "Electricidad",
     "photo_hint": "Panel eléctrico + enchufes/interruptores"},
    {"id": "plomeria", "category": "Instalaciones", "label": "Plomería",
     "photo_hint": "Debajo de lavabos — tuberías, conexiones, fugas"},
    {"id": "ac", "category": "Instalaciones", "label": "A/C",
     "photo_hint": "Unidad A/C exterior e interior"},
    {"id": "gas", "category": "Instalaciones", "label": "Gas",
     "photo_hint": "Líneas de gas, conexiones, olores"},
    # DOCUMENTACIÓN (5)
    {"id": "titulo_limpio", "category": "Documentación", "label": "Título limpio sin adeudos",
     "photo_hint": "Trámite administrativo"},
    {"id": "vin_revisado", "category": "Documentación", "label": "Número de serie VIN revisado",
     "photo_hint": "Placa VIN/HUD del mobile home"},
    {"id": "docs_vendedor", "category": "Documentación", "label": "Documentos del vendedor",
     "photo_hint": "Trámite administrativo"},
    {"id": "aplicacion_firmada", "category": "Documentación", "label": "Aplicación firmada",
     "photo_hint": "Trámite administrativo"},
    {"id": "bill_of_sale", "category": "Documentación", "label": "Bill of Sale",
     "photo_hint": "Trámite administrativo"},
    # FINANCIERO (4)
    {"id": "precio_costo_obra", "category": "Financiero", "label": "Precio compra + costo obra",
     "photo_hint": "Se estima por el estado general"},
    {"id": "reparaciones_30", "category": "Financiero", "label": "Reparaciones < 30% valor venta",
     "photo_hint": "Se estima por el estado de la casa"},
    {"id": "comparativa_precios", "category": "Financiero", "label": "Comparativa precios mercado",
     "photo_hint": "Trámite administrativo"},
    {"id": "costos_extra", "category": "Financiero", "label": "Costos extra (traslado, alineación)",
     "photo_hint": "Se estima por ubicación y tipo de casa"},
    # ESPECIFICACIONES (5)
    {"id": "año", "category": "Especificaciones", "label": "Año",
     "photo_hint": "Placa VIN/HUD tiene el año"},
    {"id": "condiciones", "category": "Especificaciones", "label": "Condiciones generales",
     "photo_hint": "Fotos generales de interior y exterior"},
    {"id": "numero_cuartos", "category": "Especificaciones", "label": "Número de cuartos",
     "photo_hint": "Fotos de cada cuarto para contarlos"},
    {"id": "lista_reparaciones", "category": "Especificaciones", "label": "Lista reparaciones necesarias",
     "photo_hint": "Se genera de todas las fotos"},
    {"id": "recorrido_completo", "category": "Especificaciones", "label": "Recorrido completo",
     "photo_hint": "Fotos de TODAS las áreas"},
    # CIERRE (5)
    {"id": "deposito_inicial", "category": "Cierre", "label": "Depósito inicial",
     "photo_hint": "Trámite administrativo"},
    {"id": "deposit_agreement", "category": "Cierre", "label": "Deposit Agreement firmado",
     "photo_hint": "Trámite administrativo"},
    {"id": "contrato_financiamiento", "category": "Cierre", "label": "Contrato firmado si financiamiento",
     "photo_hint": "Trámite administrativo"},
    {"id": "pago_total_contado", "category": "Cierre", "label": "Pago total si contado",
     "photo_hint": "Trámite administrativo"},
    {"id": "entrega_sobre", "category": "Cierre", "label": "Entrega sobre con aplicación y factura",
     "photo_hint": "Trámite administrativo"},
]

PHOTO_EVALUABLE_IDS = {
    "marco_acero", "suelos_subfloor", "techo_techumbre", "paredes_ventanas",
    "regaderas_tinas", "electricidad", "plomeria", "ac", "gas",
    "vin_revisado", "precio_costo_obra", "reparaciones_30", "costos_extra",
    "año", "condiciones", "numero_cuartos", "lista_reparaciones", "recorrido_completo",
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

        client = openai.OpenAI(api_key=api_key)

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

        prompt = f"""Eres un evaluador experto de casas móviles para Maninos Capital LLC en Texas.

TAREA: Analiza las fotos y evalúa el ESTADO/CONDICIÓN de la casa.
NO incluyas estimaciones de costo de reparación. Solo evalúa la condición.

REGLAS:
1. Si puedes evaluar con las fotos: "pass", "fail" o "warning"
2. Si falta foto específica: "needs_photo" + explica qué foto necesitas
3. Para puntos admin/documentos: "not_evaluable"
4. Si el EMPLEADO ya marcó un ítem (indicado con [EMPLEADO YA MARCÓ]), RESPETA su evaluación y no la cambies.
5. Sé CONSERVADOR — detectar problemas > pasarlos por alto
6. En "note" describe la CONDICIÓN observada

CHECKLIST ({len(CHECKLIST_ITEMS)} puntos):
{checklist_text}

Responde en JSON:
{{
  "checklist": [
    {{"id": "marco_acero", "category": "Estructura", "label": "Marco de acero", "status": "pass", "confidence": "high", "note": "..."}},
    ...
  ],
  "property_type": "single_wide" o "double_wide" o "N/A",
  "estimated_year": "YYYY" o "N/A",
  "estimated_bedrooms": 0,
  "photos_coverage": "descripción de qué áreas cubren las fotos"
}}"""

        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "Eres un inspector experto de casas móviles. Responde SOLO con JSON válido."},
                {"role": "user", "content": [{"type": "text", "text": prompt}] + image_contents},
            ],
            max_tokens=4096,
            temperature=0.1,
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
                merged.append({
                    **item,
                    "status": ai_item.get("status", item["status"]),
                    "confidence": ai_item.get("confidence", "medium"),
                    "note": ai_item.get("note", item.get("note", "")),
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
        logger.error(f"[evaluation] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{evaluation_id}/generate-report")
async def generate_report(evaluation_id: str):
    """Generate final AI report and assign report number. Marks as completed."""
    eval_result = sb.table("evaluation_reports").select("*").eq("id", evaluation_id).execute()
    if not eval_result.data:
        raise HTTPException(status_code=404, detail="Evaluation not found")

    evaluation = eval_result.data[0]
    checklist = evaluation.get("checklist") or []
    extra_notes = evaluation.get("extra_notes") or []

    # Build summary
    statuses = [i.get("status", "pending") for i in checklist]
    passed = statuses.count("pass")
    failed = statuses.count("fail")
    warnings = statuses.count("warning")
    total_evaluated = passed + failed + warnings

    # Calculate score
    if total_evaluated > 0:
        score = int((passed / total_evaluated) * 100)
    else:
        score = 0

    # Determine recommendation
    if failed >= 5 or score < 40:
        recommendation = "NO COMPRAR"
        recommendation_reason = f"Demasiadas fallas ({failed}) detectadas. Riesgo alto de costos excesivos de renovación."
    elif failed >= 3 or warnings >= 5 or score < 60:
        recommendation = "REVISAR CON CUIDADO"
        recommendation_reason = f"Se encontraron {failed} fallas y {warnings} alertas. Necesita inspección detallada antes de decidir."
    else:
        recommendation = "COMPRAR"
        recommendation_reason = f"Casa en buenas condiciones ({passed} puntos aprobados). Reparaciones menores esperadas."

    # Generate AI summary using checklist + notes
    try:
        import openai
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            client = openai.OpenAI(api_key=api_key)

            checklist_summary = ""
            for item in checklist:
                if item["status"] in ("fail", "warning"):
                    checklist_summary += f"- {item['label']} ({item['category']}): {item['status'].upper()} — {item.get('note', 'Sin nota')}\n"

            extra_notes_text = "\n".join(f"- {note}" for note in extra_notes) if extra_notes else "Ninguna"

            response = client.chat.completions.create(
                model="gpt-4o-mini",
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
                max_tokens=500,
                temperature=0.3,
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

