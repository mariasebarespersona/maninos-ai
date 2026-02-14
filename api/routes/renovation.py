"""
Renovation Routes V2 — Simplified 19-item checklist (Caza Brothers Feb 2026).

No longer divided by bedrooms/bathrooms. Single flat checklist.
Each item has only: concepto + precio + notas (optional).
Editable: employees can add custom items.

Flow:
1. GET /template                       → New V2 template (19 items)
2. GET /{property_id}/quote            → Saved quote merged with template
3. POST /{property_id}/quote           → Save/update quote (V2 format)
4. POST /{property_id}/ai-fill         → AI photo analysis → suggested items
5. GET /{property_id}/historical-comparison → Compare vs historical data
6. POST /{property_id}/import-report   → Import evaluation report → suggestions
"""

import json
import logging
import os
import re
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

from api.utils.renovation_template_v2 import (
    get_template_v2,
    get_blank_quote,
    build_quote_from_saved,
    RENOVATION_ITEMS,
)
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class SaveQuoteV2Request(BaseModel):
    """
    V2 save format — simplified: each item has only precio + notas.
    items: dict keyed by item_id → { "precio": number, "notas": string }
    custom_items: list of employee-added custom items
    """
    items: dict  # { "demolicion": { "precio": 300, "notas": "..." }, ... }
    custom_items: Optional[list] = None  # [ { "id": "custom_1", "concepto": "...", "precio": 150, "notas": "" } ]
    notes: Optional[str] = None  # General notes for the whole quote


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/template")
async def get_renovation_template():
    """Return the V2 renovation template (19 standard items, concept + price)."""
    quote = get_blank_quote()
    return {
        "version": 2,
        "items": quote["items"],
        "total_items": len(quote["items"]),
        "total": quote["total"],
    }


@router.get("/{property_id}/quote")
async def get_property_quote(property_id: str):
    """Get saved renovation quote for a property (V2 simplified format)."""
    try:
        prop_result = sb.table("properties").select(
            "id, address, square_feet, purchase_price, checklist_data"
        ).eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error fetching property {property_id}: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not prop_result.data:
        raise HTTPException(status_code=404, detail="Property not found")

    prop = prop_result.data[0]

    # Get saved renovation
    reno_result = sb.table("renovations").select("*").eq(
        "property_id", property_id
    ).order("created_at", desc=True).limit(1).execute()

    renovation_id = None
    saved_data: dict = {}

    if reno_result.data:
        reno = reno_result.data[0]
        renovation_id = reno["id"]
        materials = reno.get("materials")
        if materials and isinstance(materials, dict):
            saved_data = materials
        # Backwards compat: old V1 format stored {item_id: quantity}
        if saved_data and all(isinstance(v, (int, float)) for v in saved_data.values()):
            v1_items = saved_data
            saved_data = {"items": {}}
            for item_id, qty in v1_items.items():
                saved_data["items"][item_id] = {
                    "precio": 0.0,
                    "notas": f"(migrado V1, qty={qty})",
                }

    quote = build_quote_from_saved(saved_data)

    return {
        "version": 2,
        "property_id": property_id,
        "renovation_id": renovation_id,
        "address": prop.get("address", ""),
        "square_feet": prop.get("square_feet"),
        "purchase_price": prop.get("purchase_price"),
        "has_inspection": bool(prop.get("checklist_data")),
        **quote,
    }


@router.post("/{property_id}/quote")
async def save_property_quote(property_id: str, data: SaveQuoteV2Request):
    """Save or update renovation quote (V2 simplified: concepto + precio)."""
    try:
        prop = sb.table("properties").select("id").eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    # Calculate total from all item prices
    total = 0.0
    for item_data in data.items.values():
        if isinstance(item_data, dict):
            total += float(item_data.get("precio", 0))

    # Add custom items
    custom_items = data.custom_items or []
    for ci in custom_items:
        total += float(ci.get("precio", 0))

    # Build materials blob to save
    materials_blob = {
        "items": data.items,
        "custom_items": custom_items,
    }

    # Upsert renovation
    existing = sb.table("renovations").select("id").eq(
        "property_id", property_id
    ).order("created_at", desc=True).limit(1).execute()

    reno_data = {
        "property_id": property_id,
        "materials": materials_blob,
        "total_cost": round(total, 2),
        "notes": data.notes or "",
        "status": "in_progress",
    }

    if existing.data:
        result = sb.table("renovations").update(reno_data).eq(
            "id", existing.data[0]["id"]
        ).execute()
    else:
        result = sb.table("renovations").insert(reno_data).execute()

    active_items = sum(1 for v in data.items.values() if isinstance(v, dict) and float(v.get("precio", 0)) > 0)
    logger.info(f"[renovation] Saved V2 quote for {property_id}: ${total:.2f} ({active_items} items + {len(custom_items)} custom)")

    return {
        "success": True,
        "total": round(total, 2),
        "active_items": active_items,
        "custom_items_count": len(custom_items),
        "renovation_id": result.data[0]["id"] if result.data else None,
    }


@router.post("/{property_id}/ai-fill")
async def ai_autofill_quote(
    property_id: str,
    files: list[UploadFile] = File(default=[]),
):
    """
    AI auto-fill V2 renovation quote.
    Analyzes photos to suggest which of the 19 items are needed and their estimated price.
    """
    try:
        prop = sb.table("properties").select(
            "id, address, square_feet, checklist_data"
        ).eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    prop_row = prop.data[0]
    suggestions = {}
    ai_analysis = None

    if not files:
        return {
            "suggestions": {},
            "ai_analysis": None,
            "items_suggested": 0,
            "source": {"from_photos": False},
        }

    try:
        import openai
        import base64

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        image_contents = []
        for file in files[:8]:
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

        if image_contents:
            # Build item reference from the 19-item template
            items_ref = "\n".join(
                f'{item["id"]} (Partida {item["partida"]}): {item["concepto"]} — Precio base: ${item["precio"]:.2f}'
                for item in RENOVATION_ITEMS
            )

            sqft = prop_row.get("square_feet") or 0
            size_ctx = f"TAMAÑO: {sqft} sqft" if sqft else "TAMAÑO: No disponible"

            prompt = f"""Eres un experto en remodelación de casas móviles (mobile homes) en Texas.
{size_ctx}

TAREA: Analiza las fotos y sugiere qué partidas de renovación son necesarias y su precio estimado.

LISTA DE 19 PARTIDAS DISPONIBLES:
{items_ref}

RESPONDE ÚNICAMENTE en JSON:
{{
  "items": {{
    "item_id": {{
      "needed": true/false,
      "precio": número estimado,
      "notas": "descripción de lo que se ve en la foto"
    }}
  }},
  "analysis": "Resumen breve de condición general de la casa"
}}

REGLAS:
1. Solo marca "needed": true para partidas CLARAMENTE necesarias según las fotos
2. Estima el precio basándote en el precio base y la severidad del daño visible
3. Los item_id DEBEN ser exactamente de la lista de 19 partidas
4. Sé conservador — solo lo que CLARAMENTE se ve"""

            messages_content = [{"type": "text", "text": prompt}] + image_contents

            response = client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {
                        "role": "system",
                        "content": "You are a professional mobile home renovation estimator. Always respond with valid JSON.",
                    },
                    {"role": "user", "content": messages_content},
                ],
                max_tokens=3000,
                temperature=0.2,
            )

            result_text = response.choices[0].message.content
            if result_text:
                json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', result_text, re.DOTALL)
                json_str = json_match.group(1).strip() if json_match else result_text.strip()
                try:
                    ai_result = json.loads(json_str)
                    ai_items = ai_result.get("items", {})
                    ai_analysis = ai_result.get("analysis", "")
                    for item_id, item_data in ai_items.items():
                        if isinstance(item_data, dict) and item_data.get("needed"):
                            suggestions[item_id] = {
                                "precio": item_data.get("precio", 0),
                                "notas": item_data.get("notas", ""),
                            }
                    logger.info(f"[renovation AI] V2 Vision: {len(suggestions)} items suggested")
                except json.JSONDecodeError:
                    logger.warning(f"[renovation AI] Parse error: {json_str[:200]}")
    except Exception as e:
        logger.error(f"[renovation AI] Vision error: {e}")

    return {
        "suggestions": suggestions,
        "ai_analysis": ai_analysis,
        "items_suggested": len(suggestions),
        "source": {"from_photos": bool(files and ai_analysis)},
    }


@router.get("/{property_id}/historical-comparison")
async def historical_comparison(property_id: str):
    """Compare this property's renovation quote against historical data."""
    try:
        prop = sb.table("properties").select(
            "id, address, square_feet, purchase_price"
        ).eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    reno = sb.table("renovations").select("total_cost").eq(
        "property_id", property_id
    ).order("created_at", desc=True).limit(1).execute()

    current_reno_cost = reno.data[0]["total_cost"] if reno.data else 0

    try:
        from api.utils.price_predictor import _load_data
        df = _load_data()

        if df is not None and len(df) > 0:
            reno_col = "remodelacion" if "remodelacion" in df.columns else "gastos"
            if reno_col in df.columns:
                reno_values = df[reno_col].dropna()
                reno_values = reno_values[reno_values > 0]

                if len(reno_values) > 0:
                    return {
                        "property_id": property_id,
                        "current_quote": current_reno_cost,
                        "historical": {
                            "sample_size": len(reno_values),
                            "avg_renovation": round(float(reno_values.mean()), 0),
                            "min_renovation": round(float(reno_values.min()), 0),
                            "max_renovation": round(float(reno_values.max()), 0),
                            "median_renovation": round(float(reno_values.median()), 0),
                            "percentile_25": round(float(reno_values.quantile(0.25)), 0),
                            "percentile_75": round(float(reno_values.quantile(0.75)), 0),
                        },
                        "comparison": {
                            "vs_average": round(current_reno_cost - float(reno_values.mean()), 0) if current_reno_cost else None,
                            "vs_median": round(current_reno_cost - float(reno_values.median()), 0) if current_reno_cost else None,
                            "percentile": _calculate_percentile(current_reno_cost, reno_values) if current_reno_cost else None,
                            "status": _get_comparison_status(current_reno_cost, reno_values) if current_reno_cost else "no_quote",
                        },
                    }
    except Exception as e:
        logger.warning(f"[renovation] Historical error: {e}")

    return {
        "property_id": property_id,
        "current_quote": current_reno_cost,
        "historical": None,
        "comparison": None,
    }


def _calculate_percentile(value: float, series) -> int:
    import numpy as np
    return int(np.searchsorted(np.sort(series.values), value) / len(series) * 100)


def _get_comparison_status(value: float, series) -> str:
    if value <= 0:
        return "no_quote"
    median = float(series.median())
    p75 = float(series.quantile(0.75))
    p25 = float(series.quantile(0.25))
    if value <= p25:
        return "very_low"
    elif value <= median:
        return "good"
    elif value <= p75:
        return "normal"
    else:
        return "high"


# ============================================
# IMPORT EVALUATION REPORT → RENOVATION
# ============================================

@router.post("/{property_id}/import-report")
async def import_evaluation_report(
    property_id: str,
    report_id: str = Query(..., description="Evaluation report ID to import"),
):
    """Import evaluation report findings → V2 renovation suggestions."""
    try:
        prop = sb.table("properties").select("id").eq("id", property_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    try:
        report = sb.table("evaluation_reports").select("*").eq("id", report_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    if not report.data:
        raise HTTPException(status_code=404, detail="Evaluation report not found")

    report_data = report.data[0]
    checklist = report_data.get("checklist") or []
    extra_notes = report_data.get("extra_notes") or []
    manual_notes = "\n".join(extra_notes) if isinstance(extra_notes, list) else str(extra_notes)

    # Map evaluation checklist items to V2 renovation items
    suggestions = _map_evaluation_to_v2_items(checklist, manual_notes)

    logger.info(f"[renovation import] Report {report_id} → {len(suggestions)} V2 items suggested")

    return {
        "suggestions": suggestions,
        "items_suggested": len(suggestions),
        "source": {
            "from_evaluation_report": True,
        },
        "report_number": report_data.get("report_number"),
        "report_score": report_data.get("score"),
        "ai_analysis": report_data.get("recommendation_reason"),
    }


def _map_evaluation_to_v2_items(checklist: list, notes: str) -> dict:
    """
    Map evaluation checklist findings to V2 renovation item IDs.
    Returns dict: { item_id: { "precio": float, "notas": str } }
    """
    suggestions = {}

    # Build lookup of failed items from evaluation
    failed_ids = set()
    for item in checklist:
        if isinstance(item, dict) and item.get("status") in ("fail", "needs_repair", "needs_attention"):
            failed_ids.add(item.get("id", ""))

    # Mapping from evaluation categories to V2 renovation items
    EVAL_TO_RENO = {
        "suelos_subfloor": ["pisos", "demolicion"],
        "techo_techumbre": ["techos_ext", "cielos_int"],
        "paredes_ventanas": ["muros", "textura_muros", "pintura_int"],
        "marco_acero": ["demolicion"],
        "electricidad": ["electricidad", "finishing"],
        "plomeria": ["plomeria", "banos", "cocina"],
        "ac_sistema": ["electricidad"],
        "gas": ["plomeria"],
        "regaderas_tinas_coladeras": ["banos", "plomeria"],
        "condiciones": ["limpieza", "acabados"],
    }

    for eval_id, reno_ids in EVAL_TO_RENO.items():
        if eval_id in failed_ids:
            for reno_id in reno_ids:
                # Find the base price from template
                base_price = 0
                for item in RENOVATION_ITEMS:
                    if item["id"] == reno_id:
                        base_price = item["precio"]
                        break
                if reno_id not in suggestions:
                    suggestions[reno_id] = {
                        "precio": base_price,
                        "notas": f"Detectado en evaluación ({eval_id})",
                    }

    return suggestions
