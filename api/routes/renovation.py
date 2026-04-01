"""
Renovation Routes V2 — Simplified 19-item checklist (Caza Brothers Feb 2026).

No longer divided by bedrooms/bathrooms. Single flat checklist.
Each item has: concepto + mano_obra + materiales + dias + notas + unidad.
precio = mano_obra + materiales (computed).
Editable: employees can add custom items.

Flow:
1. GET /template                       → New V2 template (19 items)
2. GET /{property_id}/quote            → Saved quote merged with template
3. POST /{property_id}/quote           → Save/update quote (V2 format)
4. POST /{property_id}/ai-fill         → AI photo analysis → suggested items
5. GET /{property_id}/historical-comparison → Compare vs historical data
6. POST /{property_id}/import-report   → Import evaluation report → suggestions
7. PATCH /{property_id}/approve        → Approve renovation quote (admin/manager)
8. GET /{property_id}/approval-status  → Get approval status
9. POST /voice-command                 → GPT-4o-mini voice command parsing
10. GET /pending-approvals             → List all pending approval quotes
"""

import json
import logging
import os
import re
from typing import Any, Optional
from fastapi import APIRouter, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

from api.utils.renovation_template_v2 import (
    get_template_v2,
    get_blank_quote,
    build_quote_from_saved,
    RENOVATION_ITEMS,
    ITEM_SUBFIELDS,
    BUSINESS_RULES,
)
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SCHEMAS
# ============================================================================

class SaveQuoteV2Request(BaseModel):
    """
    V2 save format — each item has mano_obra + materiales + dias + notas + subfields.
    items: dict keyed by item_id → { "mano_obra": number, "materiales": number, "dias": number, "notas": string, "responsable": string, "subfields": {} }
    custom_items: list of employee-added custom items
    """
    items: dict  # { "demolicion": { "mano_obra": 300, "materiales": 50, "dias": 2, "notas": "...", "subfields": {} }, ... }
    custom_items: Optional[list] = None
    notes: Optional[str] = None
    responsable: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    submit_for_approval: Optional[bool] = False


class ApproveQuoteRequest(BaseModel):
    approved_by: Optional[str] = None


class VoiceCommandRequest(BaseModel):
    text: str
    property_id: Optional[str] = None


class VoiceAction(BaseModel):
    item_id: str
    field: str  # mano_obra, materiales, dias, notas, responsable
    value: Any


# ============================================================================
# ENDPOINTS
# ============================================================================

@router.get("/template")
async def get_renovation_template():
    """Return the V2 renovation template (19 standard items, MO + Mat + Dias + Unidad)."""
    quote = get_blank_quote()
    return {
        "version": 2,
        "items": quote["items"],
        "total_items": len(quote["items"]),
        "total": quote["total"],
        "total_mano_obra": quote["total_mano_obra"],
        "total_materiales": quote["total_materiales"],
        "dias_estimados": quote["dias_estimados"],
        "item_subfields": ITEM_SUBFIELDS,
        "business_rules": BUSINESS_RULES,
    }


@router.get("/{property_id}/quote")
async def get_property_quote(property_id: str):
    """Get saved renovation quote for a property (V2 format with MO + Mat)."""
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
                    "mano_obra": 0.0,
                    "materiales": 0.0,
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
        "item_subfields": ITEM_SUBFIELDS,
        "business_rules": BUSINESS_RULES,
        **quote,
    }


@router.post("/{property_id}/quote")
async def save_property_quote(property_id: str, data: SaveQuoteV2Request):
    """Save or update renovation quote (V2: mano_obra + materiales + dias)."""
    try:
        prop = sb.table("properties").select("id").eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    # Calculate total: precio = (mano_obra × dias) + materiales per item
    total = 0.0
    for item_id, item_data in data.items.items():
        if isinstance(item_data, dict):
            mo = float(item_data.get("mano_obra", 0))
            mat = float(item_data.get("materiales", 0))
            dias = int(item_data.get("dias", 1)) or 1
            # If only precio provided (backward compat), use it
            if mo == 0 and mat == 0 and "precio" in item_data:
                mo = float(item_data["precio"])
                dias = 1
            total += (mo * dias) + mat

    # Add custom items
    custom_items = data.custom_items or []
    for ci in custom_items:
        mo = float(ci.get("mano_obra", 0))
        mat = float(ci.get("materiales", 0))
        dias = int(ci.get("dias", 1)) or 1
        if mo == 0 and mat == 0 and "precio" in ci:
            mo = float(ci["precio"])
            dias = 1
        total += (mo * dias) + mat

    # Determine approval status
    approval_status = "draft"
    if data.submit_for_approval:
        approval_status = "pending_approval"

    # Build materials blob to save
    materials_blob = {
        "items": data.items,
        "custom_items": custom_items,
        "responsable": data.responsable or "",
        "fecha_inicio": data.fecha_inicio or "",
        "fecha_fin": data.fecha_fin or "",
        "approval_status": approval_status,
    }

    # Upsert renovation
    existing = sb.table("renovations").select("id, materials").eq(
        "property_id", property_id
    ).order("created_at", desc=True).limit(1).execute()

    # Preserve approval_status if not submitting and already exists
    if existing.data and not data.submit_for_approval:
        existing_materials = existing.data[0].get("materials") or {}
        existing_status = existing_materials.get("approval_status", "draft")
        if existing_status in ("pending_approval", "approved"):
            materials_blob["approval_status"] = existing_status

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

    active_items = sum(
        1 for v in data.items.values()
        if isinstance(v, dict) and (
            float(v.get("mano_obra", 0)) + float(v.get("materiales", 0)) > 0
            or float(v.get("precio", 0)) > 0
        )
    )
    logger.info(f"[renovation] Saved V2 quote for {property_id}: ${total:.2f} ({active_items} items + {len(custom_items)} custom)")

    # Send approval email if submitting
    if data.submit_for_approval:
        _send_approval_notification(property_id, round(total, 2), data.responsable or "")
        logger.info(f"[renovation] Quote submitted for approval: {property_id}")
        try:
            from api.services.notification_service import notify_renovation_submitted
            # Build items summary for notification
            active_names = [k for k, v in data.items.items() if isinstance(v, dict) and (float(v.get("mano_obra", 0)) + float(v.get("materiales", 0)) > 0)]
            items_summary = ", ".join(active_names[:5]) if active_names else ""
            notify_renovation_submitted(property_id, round(total, 2), data.responsable or "", items_summary=items_summary)
        except Exception:
            pass

    return {
        "success": True,
        "total": round(total, 2),
        "active_items": active_items,
        "custom_items_count": len(custom_items),
        "renovation_id": result.data[0]["id"] if result.data else None,
        "approval_status": materials_blob["approval_status"],
    }


@router.patch("/{property_id}/approve")
async def approve_renovation_quote(property_id: str, data: ApproveQuoteRequest = None):
    """Approve a renovation quote (admin/manager only)."""
    try:
        reno_result = sb.table("renovations").select("id, materials, total_cost").eq(
            "property_id", property_id
        ).order("created_at", desc=True).limit(1).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not reno_result.data:
        raise HTTPException(status_code=404, detail="No renovation quote found for this property")

    reno = reno_result.data[0]
    materials = reno.get("materials") or {}
    current_status = materials.get("approval_status", "draft")

    if current_status == "approved":
        raise HTTPException(status_code=400, detail="Quote is already approved")

    if current_status == "draft":
        raise HTTPException(status_code=400, detail="Quote has not been submitted for approval yet")

    # Update to approved
    materials["approval_status"] = "approved"
    materials["approved_by"] = (data.approved_by if data else None) or ""
    materials["approved_at"] = _now_iso()

    sb.table("renovations").update({
        "materials": materials,
    }).eq("id", reno["id"]).execute()

    # Send notification to treasury (Abigail)
    _send_approved_notification(property_id, reno.get("total_cost", 0))

    # Create DB notification
    try:
        from api.services.notification_service import notify_renovation_approved
        approved_by = (data.approved_by if data else None) or "admin"
        notify_renovation_approved(property_id, reno.get("total_cost", 0), approved_by)
    except Exception:
        pass

    # Create ONE payment order PER concepto (not one lump sum)
    # So each item (pisos, electricidad, etc.) can be approved/executed individually
    try:
        prop = sb.table("properties").select("address").eq("id", property_id).execute()
        prop_address = prop.data[0].get("address", "") if prop.data else property_id
        responsable = materials.get("responsable", "")
        items = materials.get("items", {})
        approved_by = (data.approved_by if data else None) or "admin"
        now = _now_iso()

        # Build item ID → concept name lookup
        item_names = {item["id"]: item["concepto"] for item in RENOVATION_ITEMS}

        orders_created = 0
        for item_id, item_data in items.items():
            if not isinstance(item_data, dict):
                continue
            mo = float(item_data.get("mano_obra", 0))
            mat = float(item_data.get("materiales", 0))
            total = mo + mat
            if total <= 0:
                continue

            concepto = item_names.get(item_id, item_id)
            item_responsable = item_data.get("responsable", "") or responsable

            sb.table("payment_orders").insert({
                "property_id": property_id,
                "property_address": prop_address,
                "payee_name": item_responsable or f"Contratista - {concepto}",
                "amount": round(total, 2),
                "method": "transferencia",
                "status": "approved",
                "concept": "renovacion",
                "notes": f"Renovación: {concepto} (MO: ${mo:,.0f} + Mat: ${mat:,.0f}). Responsable: {item_responsable or 'N/A'}. Propiedad: {prop_address}",
                "approved_by": approved_by,
                "approved_at": now,
                "created_by": "sistema_renovacion",
            }).execute()
            orders_created += 1

        # Also create orders for custom items
        custom_items = materials.get("custom_items", [])
        for ci in custom_items:
            mo = float(ci.get("mano_obra", 0))
            mat = float(ci.get("materiales", 0))
            total = mo + mat
            if total <= 0:
                continue
            concepto = ci.get("concepto", "Item personalizado")
            sb.table("payment_orders").insert({
                "property_id": property_id,
                "property_address": prop_address,
                "payee_name": responsable or f"Contratista - {concepto}",
                "amount": round(total, 2),
                "method": "transferencia",
                "status": "approved",
                "concept": "renovacion",
                "notes": f"Renovación: {concepto} (MO: ${mo:,.0f} + Mat: ${mat:,.0f}). Responsable: {responsable or 'N/A'}. Propiedad: {prop_address}",
                "approved_by": approved_by,
                "approved_at": now,
                "created_by": "sistema_renovacion",
            }).execute()
            orders_created += 1

        logger.info(f"[renovation] Created {orders_created} payment orders for renovation {property_id}")
    except Exception as e:
        logger.warning(f"[renovation] Failed to create payment orders: {e}")

    logger.info(f"[renovation] Quote approved for {property_id} by {materials.get('approved_by', 'unknown')}")

    return {
        "success": True,
        "approval_status": "approved",
        "approved_by": materials["approved_by"],
        "approved_at": materials["approved_at"],
    }


@router.get("/{property_id}/approval-status")
async def get_approval_status(property_id: str):
    """Get the approval status of a renovation quote."""
    try:
        reno_result = sb.table("renovations").select("id, materials, total_cost").eq(
            "property_id", property_id
        ).order("created_at", desc=True).limit(1).execute()
    except Exception as e:
        logger.error(f"[renovation] DB error: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    if not reno_result.data:
        return {"property_id": property_id, "approval_status": "none", "renovation_id": None}

    reno = reno_result.data[0]
    materials = reno.get("materials") or {}

    return {
        "property_id": property_id,
        "renovation_id": reno["id"],
        "approval_status": materials.get("approval_status", "draft"),
        "approved_by": materials.get("approved_by"),
        "approved_at": materials.get("approved_at"),
        "total_cost": reno.get("total_cost", 0),
    }


# ============================================================================
# VOICE COMMAND — GPT-4o-mini
# ============================================================================

@router.post("/voice-command")
async def process_voice_command(data: VoiceCommandRequest):
    """Parse a Spanish voice command into structured renovation actions using GPT-4o-mini."""
    text = data.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Empty text")

    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

        client = openai.OpenAI(api_key=api_key)

        # Build item reference for the prompt
        items_ref = "\n".join(
            f'- id: "{item["id"]}", partida: {item["partida"]}, concepto: "{item["concepto"]}"'
            for item in RENOVATION_ITEMS
        )

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": f"""Eres un asistente que parsea comandos de voz en español para una cotización de renovación de casas móviles.

PARTIDAS DISPONIBLES (usa el id exacto):
{items_ref}

CAMPOS válidos por partida: mano_obra (número), materiales (número), dias (número), notas (texto), responsable (texto)

Tu tarea: dado un comando de voz, devuelve UN JSON con:
- "actions": lista de objetos con "item_id", "field", "value"
- "message": resumen breve en español de lo que se hizo

REGLAS:
1. Si el usuario dice un número en palabras ("mil doscientos"), conviértelo a número (1200)
2. Si dice "materiales" sin especificar partida, intenta deducir la partida del contexto
3. Si dice "pon en X" o "X para Y", deduce partida + campo
4. Si no puedes deducir la partida, devuelve actions vacío y message explicativo
5. Si solo dice un monto sin especificar campo, asígnalo a "mano_obra" por defecto
6. SIEMPRE responde con JSON válido, sin markdown"""
                },
                {"role": "user", "content": text},
            ],
            max_tokens=500,
            temperature=0.1,
        )

        result_text = response.choices[0].message.content or "{}"
        # Strip markdown code fences if present
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', result_text, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else result_text.strip()

        try:
            parsed = json.loads(json_str)
        except json.JSONDecodeError:
            logger.warning(f"[voice-command] Failed to parse GPT response: {json_str[:200]}")
            return {"actions": [], "message": "No pude entender el comando", "raw": json_str}

        actions = parsed.get("actions", [])
        message = parsed.get("message", "Comando procesado")

        # Validate item_ids
        valid_ids = {item["id"] for item in RENOVATION_ITEMS}
        validated_actions = [
            a for a in actions
            if isinstance(a, dict)
            and a.get("item_id") in valid_ids
            and a.get("field") in ("mano_obra", "materiales", "dias", "notas", "responsable")
        ]

        logger.info(f"[voice-command] '{text}' → {len(validated_actions)} actions")
        return {
            "actions": validated_actions,
            "message": message,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[voice-command] Error: {e}")
        raise HTTPException(status_code=500, detail=f"Voice command processing error: {e}")


# ============================================================================
# PENDING APPROVALS
# ============================================================================

@router.get("/pending-approvals")
async def get_pending_approvals():
    """List all renovation quotes with pending_approval status."""
    try:
        renos = sb.table("renovations").select(
            "id, property_id, materials, total_cost, created_at, updated_at"
        ).eq("status", "in_progress").execute()
    except Exception as e:
        logger.error(f"[renovation] DB error fetching pending approvals: {e}")
        raise HTTPException(status_code=500, detail=f"DB error: {e}")

    pending = []
    for reno in renos.data or []:
        materials = reno.get("materials") or {}
        if materials.get("approval_status") != "pending_approval":
            continue

        # Fetch property address
        prop_address = ""
        try:
            prop = sb.table("properties").select("address").eq(
                "id", reno["property_id"]
            ).execute()
            if prop.data:
                prop_address = prop.data[0].get("address", "")
        except Exception:
            pass

        pending.append({
            "renovation_id": reno["id"],
            "property_id": reno["property_id"],
            "address": prop_address,
            "total_cost": reno.get("total_cost", 0),
            "responsable": materials.get("responsable", ""),
            "created_at": reno.get("created_at", ""),
            "updated_at": reno.get("updated_at", ""),
        })

    return {"ok": True, "pending": pending, "count": len(pending)}


# ============================================================================
# NOTIFICATION HELPERS
# ============================================================================

def _now_iso() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).isoformat()


def _send_approval_notification(property_id: str, total: float, responsable: str):
    """Send email to admin when quote is submitted for approval."""
    try:
        from tools.email_tool import send_email
        from api.services.email_service import _base_template
        admin_email = os.getenv("ADMIN_EMAIL", "sebastian@maninoshomes.com")
        app_url = os.getenv("APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000"
        prop_link = f"{app_url}/homes/notificaciones"

        content = f"""
        <div class="header">
            <h1>Cotización Pendiente de Aprobación</h1>
            <p>${total:,.2f}</p>
        </div>
        <div class="body">
            <p>Se ha enviado una nueva cotización de renovación para aprobación.</p>
            <div class="highlight">
                <p><strong>Propiedad:</strong> {property_id}</p>
                <p><strong>Total:</strong> ${total:,.2f}</p>
                <p><strong>Responsable:</strong> {responsable or 'No asignado'}</p>
            </div>
            <p style="text-align: center; margin-top: 24px;">
                <a href="{prop_link}" class="btn">Revisar y Aprobar</a>
            </p>
        </div>
        """
        send_email(
            to=[admin_email],
            subject=f"Cotización de renovación pendiente de aprobación — ${total:,.2f}",
            html=_base_template(content),
        )
    except Exception as e:
        logger.warning(f"[renovation] Failed to send approval notification: {e}")


def _send_approved_notification(property_id: str, total: float):
    """Send email to treasury when quote is approved."""
    try:
        from tools.email_tool import send_email
        from api.services.email_service import _base_template
        treasury_email = os.getenv("TREASURY_EMAIL", "abigail@maninoshomes.com")
        app_url = os.getenv("APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000"
        prop_link = f"{app_url}/homes/properties/{property_id}/renovate"

        content = f"""
        <div class="header">
            <h1>Cotización de Renovación Aprobada</h1>
            <p>${total:,.2f}</p>
        </div>
        <div class="body">
            <p>La cotización de renovación ha sido aprobada y puede proceder con la compra de materiales.</p>
            <div class="highlight">
                <p><strong>Propiedad:</strong> {property_id}</p>
                <p><strong>Total aprobado:</strong> ${total:,.2f}</p>
            </div>
            <p style="text-align: center; margin-top: 24px;">
                <a href="{prop_link}" class="btn">Ver Cotización</a>
            </p>
        </div>
        """
        send_email(
            to=[treasury_email],
            subject=f"Cotización de renovación APROBADA — ${total:,.2f}",
            html=_base_template(content),
        )
    except Exception as e:
        logger.warning(f"[renovation] Failed to send approved notification: {e}")


# ============================================================================
# AI AUTO-FILL
# ============================================================================

@router.post("/{property_id}/ai-fill")
async def ai_autofill_quote(
    property_id: str,
    files: list[UploadFile] = File(default=[]),
):
    """
    AI auto-fill V2 renovation quote.
    Analyzes photos to suggest which of the 19 items are needed,
    with mano_obra + materiales separated.
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
                f'{item["id"]} (Partida {item["partida"]}): {item["concepto"]} — MO base: ${item["mano_obra"]:.2f}/{item["unidad"]}'
                for item in RENOVATION_ITEMS
            )

            sqft = prop_row.get("square_feet") or 0
            size_ctx = f"TAMAÑO: {sqft} sqft" if sqft else "TAMAÑO: No disponible"

            prompt = f"""Eres un experto en remodelación de casas móviles (mobile homes) en Texas.
{size_ctx}

TAREA: Analiza las fotos y sugiere qué partidas de renovación son necesarias.
Separa el costo en MANO DE OBRA y MATERIALES.

LISTA DE 19 PARTIDAS DISPONIBLES:
{items_ref}

RESPONDE ÚNICAMENTE en JSON:
{{
  "items": {{
    "item_id": {{
      "needed": true/false,
      "mano_obra": número estimado de mano de obra,
      "materiales": número estimado de materiales,
      "unidad": "día/proyecto/casa",
      "notas": "descripción de lo que se ve en la foto"
    }}
  }},
  "analysis": "Resumen breve de condición general de la casa"
}}

REGLAS:
1. Solo marca "needed": true para partidas CLARAMENTE necesarias según las fotos
2. Estima mano_obra basándote en el MO base y la severidad del daño visible
3. Estima materiales según lo que se necesite comprar (madera, pintura, etc.)
4. Los item_id DEBEN ser exactamente de la lista de 19 partidas
5. Sé conservador — solo lo que CLARAMENTE se ve"""

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
                            mo = item_data.get("mano_obra", 0)
                            mat = item_data.get("materiales", 0)
                            # Fallback: if AI only returned "precio"
                            if mo == 0 and mat == 0 and "precio" in item_data:
                                mo = item_data["precio"]
                            suggestions[item_id] = {
                                "mano_obra": mo,
                                "materiales": mat,
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
    ai_summary = report_data.get("ai_summary") or ""
    recommendation_reason = report_data.get("recommendation_reason") or ""
    score = report_data.get("score", 0)

    # Try AI-powered mapping first, fall back to static mapping
    suggestions = await _ai_map_evaluation_to_renovation(
        checklist, manual_notes, ai_summary, recommendation_reason, score
    )

    if not suggestions:
        suggestions = _map_evaluation_to_v2_items(checklist, manual_notes)

    logger.info(f"[renovation import] Report {report_id} → {len(suggestions)} V2 items suggested")

    return {
        "suggestions": suggestions,
        "items_suggested": len(suggestions),
        "source": {
            "from_evaluation_report": True,
            "ai_powered": bool(suggestions),
        },
        "report_number": report_data.get("report_number"),
        "report_score": score,
        "ai_analysis": recommendation_reason or ai_summary,
    }


async def _ai_map_evaluation_to_renovation(
    checklist: list, notes: str, ai_summary: str, recommendation_reason: str, score: int
) -> dict:
    """
    Use GPT-4o-mini to intelligently map evaluation report data
    to V2 renovation items with estimated costs.
    Returns dict: { item_id: { "mano_obra": float, "materiales": float, "notas": str } }
    """
    try:
        import openai

        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            return {}

        client = openai.OpenAI(api_key=api_key)

        # Build evaluation data summary for GPT
        checklist_summary = []
        for item in checklist:
            if not isinstance(item, dict):
                continue
            status = item.get("status", "pending")
            if status == "pending":
                continue
            entry = f'- {item.get("label", item.get("id", "?"))}: {status}'
            note = item.get("note", "")
            if note:
                entry += f' — "{note}"'
            checklist_summary.append(entry)

        checklist_text = "\n".join(checklist_summary) if checklist_summary else "No hay items evaluados"

        # Build renovation items reference
        items_ref = "\n".join(
            f'- id: "{item["id"]}", partida: {item["partida"]}, '
            f'concepto: "{item["concepto"]}", '
            f'MO base: ${item["mano_obra"]:.0f}, Mat base: ${item["materiales"]:.0f}, '
            f'unidad: "{item["unidad"]}"'
            for item in RENOVATION_ITEMS
        )

        prompt = f"""Eres un experto en remodelación de casas móviles (mobile homes) en Texas.

REPORTE DE EVALUACIÓN (puntuación: {score}/100):
{checklist_text}

{f'NOTAS DEL EVALUADOR: {notes}' if notes else ''}
{f'ANÁLISIS AI: {ai_summary}' if ai_summary else ''}
{f'RAZÓN DE RECOMENDACIÓN: {recommendation_reason}' if recommendation_reason else ''}

PARTIDAS DE RENOVACIÓN DISPONIBLES (19 items):
{items_ref}

TAREA: Basándote en el reporte de evaluación, determina qué partidas de renovación son necesarias.
Para cada partida que aplique, estima costos realistas de mano de obra y materiales.

REGLAS:
1. Solo sugiere partidas que CLARAMENTE se deriven del reporte de evaluación
2. Items con status "pass" NO necesitan renovación (a menos que las notas indiquen lo contrario)
3. Items con "fail", "needs_repair", "needs_attention", "warning" SÍ necesitan renovación
4. Usa los costos base como referencia pero ajusta según la severidad descrita
5. Si el item de evaluación menciona detalles específicos, inclúyelos en las notas
6. Si un item de evaluación mapea a múltiples partidas, incluye todas las relevantes
7. Materiales: estima basándote en lo que típicamente se necesita comprar
8. Si la evaluación es muy buena (score alto, pocos fails), sugiere menos partidas
9. Siempre incluye "limpieza" y "acabados" si hay alguna otra partida sugerida

RESPONDE ÚNICAMENTE en JSON válido (sin markdown):
{{
  "item_id": {{
    "mano_obra": número,
    "materiales": número,
    "notas": "explicación breve basada en la evaluación"
  }}
}}

Ejemplo: {{ "demolicion": {{ "mano_obra": 300, "materiales": 50, "notas": "Marco de acero con daño visible" }} }}"""

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a mobile home renovation expert. Always respond with valid JSON only, no markdown.",
                },
                {"role": "user", "content": prompt},
            ],
            max_tokens=2000,
            temperature=0.2,
        )

        result_text = response.choices[0].message.content or "{}"
        # Strip markdown fences if present
        json_match = re.search(r'```(?:json)?\s*\n?(.*?)\n?```', result_text, re.DOTALL)
        json_str = json_match.group(1).strip() if json_match else result_text.strip()

        ai_result = json.loads(json_str)

        # Validate: only keep items with valid IDs
        valid_ids = {item["id"] for item in RENOVATION_ITEMS}
        suggestions = {}
        for item_id, data in ai_result.items():
            if item_id in valid_ids and isinstance(data, dict):
                suggestions[item_id] = {
                    "mano_obra": float(data.get("mano_obra", 0)),
                    "materiales": float(data.get("materiales", 0)),
                    "notas": str(data.get("notas", "")),
                }

        logger.info(f"[renovation import AI] GPT mapped {len(suggestions)} items from evaluation")
        return suggestions

    except json.JSONDecodeError as e:
        logger.warning(f"[renovation import AI] JSON parse error: {e}")
        return {}
    except Exception as e:
        logger.warning(f"[renovation import AI] Error: {e}")
        return {}


def _map_evaluation_to_v2_items(checklist: list, notes: str) -> dict:
    """
    Map evaluation checklist findings to V2 renovation item IDs.
    Returns dict: { item_id: { "mano_obra": float, "materiales": float, "notas": str } }
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
                # Find the base MO from template
                base_mo = 0
                for item in RENOVATION_ITEMS:
                    if item["id"] == reno_id:
                        base_mo = item["mano_obra"]
                        break
                if reno_id not in suggestions:
                    suggestions[reno_id] = {
                        "mano_obra": base_mo,
                        "materiales": 0,
                        "notas": f"Detectado en evaluación ({eval_id})",
                    }

    return suggestions
