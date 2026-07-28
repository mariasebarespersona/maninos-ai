"""
Capital — Alta Manual de clientes RTO antiguos (legacy intake).

Camino PARALELO al flujo automático (Homes venta → Capital), para capturar
clientes RTO que ya existían antes de la app. Crea la MISMA cadena de tablas
que la vía automática (cliente → casa → venta → solicitud → contrato → pagos)
para que todas las secciones de Capital queden linkeadas igual, con dos marcas:

  • properties.source / sales.source = 'manual_capital' → el portal Homes
    filtra estas filas; solo se ven en Capital. CERO contabilidad de Homes:
    sin facturas [CAPFIN], sin comisiones, sin órdenes, sin títulos, sin emails.
  • rto_payments.is_historical = TRUE → mensualidades cobradas antes de la app:
    cuentan como pagadas (progreso/cronogramas correctos) pero NO postean
    ingreso al ledger de Capital (mismo criterio que los pagarés pre-app).
    Los pagos NUEVOS de estos contratos siguen el flujo normal (auto-factura
    mensual + asiento al registrarse).

Requiere la migración 106 (columnas source / is_historical).
"""

import logging
from datetime import datetime, date, timedelta
from typing import Optional

from dateutil.relativedelta import relativedelta
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/manual-intake", tags=["Capital - Alta Manual"])

MANUAL_SOURCE = "manual_capital"
_CONTRACT_BUCKET = "transaction-documents"
_KYC_BUCKET = "kyc-documents"


# =============================================================================
# SCHEMAS
# =============================================================================

class ManualClient(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    monthly_income: Optional[float] = None


class ManualProperty(BaseModel):
    property_code: Optional[str] = None   # H13 / B2 / DFW1 …
    address: str
    city: Optional[str] = None
    state: str = "TX"
    sale_price: Optional[float] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None


class ManualTerms(BaseModel):
    purchase_price: float                 # precio de venta RTO pactado
    down_payment: float = 0
    monthly_rent: float
    term_months: int
    start_date: str                       # YYYY-MM-DD (puede ser pasada)
    payment_due_day: int = 15
    late_fee_per_day: float = 15.0
    grace_period_days: int = 5


class ManualIntake(BaseModel):
    # Cliente: id existente O datos para crear
    client_id: Optional[str] = None
    client: Optional[ManualClient] = None
    # Casa: id existente O datos mínimos para crear (solo visible en Capital)
    property_id: Optional[str] = None
    property: Optional[ManualProperty] = None
    # Modelo de pago
    terms: ManualTerms
    # Históricos: mensualidades con vencimiento <= esta fecha nacen pagadas
    # (is_historical, sin asientos). El enganche viejo idem si ya se cobró.
    paid_through: Optional[str] = None    # YYYY-MM-DD
    down_payment_paid: bool = True
    # Identidad: marcar verificado al crear (docs se pueden subir aparte)
    mark_kyc_verified: bool = False
    notes: Optional[str] = None
    created_by: Optional[str] = "capital-manual"


class MarkPaidUntil(BaseModel):
    paid_through: str                     # YYYY-MM-DD
    created_by: Optional[str] = "capital-manual"


# =============================================================================
# HELPERS
# =============================================================================

def _require_migration_106():
    """Fail fast with a clear message if migration 106 hasn't been applied."""
    try:
        sb.table("rto_payments").select("is_historical").limit(1).execute()
        sb.table("properties").select("source").limit(1).execute()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Falta la migración 106 (columnas source/is_historical). "
                   "Ejecuta migrations/106_manual_capital_intake.sql en Supabase.",
        )


def _due_date_for(base: date, months_offset: int, due_day: int) -> date:
    """Same due-day logic as contract activation: clamp to end of month."""
    d = base + relativedelta(months=months_offset)
    try:
        return d.replace(day=due_day)
    except ValueError:
        nxt = d + relativedelta(months=1)
        return nxt.replace(day=1) - timedelta(days=1)


def _schedule_status(due: date, today: date) -> str:
    if due < today:
        return "late"
    if (due - today).days <= 5:
        return "pending"
    return "scheduled"


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("")
async def create_manual_intake(data: ManualIntake):
    """Crea la cadena completa de un cliente RTO antiguo en una sola llamada.

    cliente → casa (source=manual_capital) → venta RTO (source=manual_capital)
    → solicitud aprobada → contrato ACTIVO → cronograma (históricos ya pagados)
    → enganche registrado. Sin contabilidad Homes, sin asientos por históricos.
    """
    _require_migration_106()
    created: dict = {}
    try:
        today = date.today()
        t = data.terms
        start = date.fromisoformat(t.start_date)
        if t.term_months <= 0 or t.monthly_rent <= 0 or t.purchase_price <= 0:
            raise HTTPException(status_code=400, detail="Plazo, mensualidad y precio deben ser > 0")
        paid_through = date.fromisoformat(data.paid_through) if data.paid_through else None
        if paid_through and paid_through > today:
            raise HTTPException(status_code=400, detail="'Pagado hasta' no puede ser una fecha futura")

        # ── 1. Cliente (reusar o crear) ─────────────────────────────────────
        if data.client_id:
            cl = sb.table("clients").select("id, name, email").eq("id", data.client_id).single().execute()
            if not cl.data:
                raise HTTPException(status_code=404, detail="Cliente no encontrado")
            client_id, client_name = cl.data["id"], cl.data["name"]
        elif data.client:
            # Duplicados: mismo email o teléfono → error explícito (el frontend
            # ofrece buscar primero; aquí es la última defensa).
            if data.client.email:
                dup = sb.table("clients").select("id, name").ilike("email", data.client.email.strip()).execute().data
                if dup:
                    raise HTTPException(status_code=409,
                                        detail=f"Ya existe un cliente con ese email: {dup[0]['name']}. Selecciónalo en vez de crear uno nuevo.")
            ins = {
                "name": data.client.name.strip(),
                "email": (data.client.email or "").strip() or None,
                "phone": (data.client.phone or "").strip() or None,
                "monthly_income": data.client.monthly_income,
                "state": "TX",
                "status": "rto_active",
                "created_by_user_id": None,
            }
            res = sb.table("clients").insert({k: v for k, v in ins.items() if v is not None}).execute()
            client_id, client_name = res.data[0]["id"], res.data[0]["name"]
            created["client_id"] = client_id
        else:
            raise HTTPException(status_code=400, detail="Falta el cliente (client_id o client)")

        # ── 2. Casa (reusar o crear mínima, solo visible en Capital) ────────
        if data.property_id:
            pr = sb.table("properties").select("id, address, sale_price, hud_number, year").eq("id", data.property_id).single().execute()
            if not pr.data:
                raise HTTPException(status_code=404, detail="Propiedad no encontrada")
            property_id, prop_row = pr.data["id"], pr.data
        elif data.property:
            p = data.property
            code = (p.property_code or "").strip().upper() or None
            if code:
                dup = sb.table("properties").select("id, property_code, address").ilike("property_code", code).execute().data
                if dup:
                    raise HTTPException(status_code=409,
                                        detail=f"Ya existe la casa {dup[0]['property_code']} ({dup[0]['address']}). Selecciónala en vez de crearla.")
            ins = {
                "property_code": code,
                "address": p.address.strip(),
                "city": (p.city or "").strip() or None,
                "state": p.state or "TX",
                "sale_price": p.sale_price if p.sale_price is not None else t.purchase_price,
                "bedrooms": p.bedrooms,
                "bathrooms": p.bathrooms,
                "status": "sold",            # nunca en el catálogo público
                "source": MANUAL_SOURCE,     # oculta en el portal Homes
            }
            res = sb.table("properties").insert({k: v for k, v in ins.items() if v is not None}).execute()
            property_id, prop_row = res.data[0]["id"], res.data[0]
            created["property_id"] = property_id
        else:
            raise HTTPException(status_code=400, detail="Falta la casa (property_id o property)")

        # ── 3. Venta RTO legacy (SIN contabilidad/side-effects de Homes) ────
        remaining = round(t.purchase_price - t.down_payment, 2)
        sale_res = sb.table("sales").insert({
            "property_id": property_id,
            "client_id": client_id,
            "sale_type": "rto",
            "sale_price": t.purchase_price,
            "status": "rto_active",
            "source": MANUAL_SOURCE,
            "rto_monthly_payment": t.monthly_rent,
            "rto_term_months": t.term_months,
            "rto_down_payment": t.down_payment,
            "financed_down_payment": t.down_payment,
            "financed_remaining": max(0.0, remaining),
            # El pago Capital→Homes ya ocurrió fuera de la app hace tiempo:
            "capital_payment_status": "paid",
            "capital_payment_date": start.isoformat(),
            "amount_paid": t.purchase_price,
            "amount_pending": 0,
            "rto_notes": f"[ALTA MANUAL Capital] Cliente RTO antiguo. {data.notes or ''}".strip(),
        }).execute()
        sale_id = sale_res.data[0]["id"]
        created["sale_id"] = sale_id

        # ── 4. Solicitud (aprobada de origen) ───────────────────────────────
        app_res = sb.table("rto_applications").insert({
            "sale_id": sale_id,
            "client_id": client_id,
            "property_id": property_id,
            "status": "approved",
            "monthly_income": (data.client.monthly_income if data.client else None),
            "desired_down_payment": t.down_payment,
            "desired_term_months": t.term_months,
            "reviewed_by": data.created_by,
            "reviewed_at": datetime.utcnow().isoformat(),
            "review_notes": "[ALTA MANUAL] Cliente RTO antiguo capturado desde Capital; aprobado de origen.",
        }).execute()
        created["application_id"] = app_res.data[0]["id"]

        # ── 5. Contrato ACTIVO con fechas reales ────────────────────────────
        end = start + relativedelta(months=t.term_months)
        contract_res = sb.table("rto_contracts").insert({
            "sale_id": sale_id,
            "property_id": property_id,
            "client_id": client_id,
            "monthly_rent": t.monthly_rent,
            "purchase_price": t.purchase_price,
            "down_payment": t.down_payment,
            "term_months": t.term_months,
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
            "payment_due_day": t.payment_due_day,
            "late_fee_per_day": t.late_fee_per_day,
            "grace_period_days": t.grace_period_days,
            "hud_number": prop_row.get("hud_number"),
            "property_year": prop_row.get("year"),
            "status": "active",
            "signed_at": start.isoformat(),
            "signed_by_client": client_name,
            "signed_by_company": "Maninos Capital LLC",
            "created_by": data.created_by,
            "notes": f"[ALTA MANUAL] Contrato de cliente antiguo. {data.notes or ''}".strip(),
        }).execute()
        contract_id = contract_res.data[0]["id"]
        created["contract_id"] = contract_id
        sb.table("sales").update({"rto_contract_id": contract_id}).eq("id", sale_id).execute()

        # ── 6. Cronograma: históricos nacen PAGADOS (sin ventana para el
        #      auto-facturador, que solo factura no-pagados) ─────────────────
        rows, historical = [], 0
        for i in range(t.term_months):
            due = _due_date_for(start, i, t.payment_due_day)
            is_hist = bool(paid_through and due <= paid_through)
            row = {
                "rto_contract_id": contract_id,
                "client_id": client_id,
                "payment_number": i + 1,
                "amount": t.monthly_rent,
                "due_date": due.isoformat(),
                "status": "paid" if is_hist else _schedule_status(due, today),
                "is_historical": is_hist,
            }
            if is_hist:
                row.update({
                    "paid_date": due.isoformat(),
                    "paid_amount": t.monthly_rent,
                    "payment_method": "historico",
                    "recorded_by": data.created_by,
                    "notes": "[ALTA MANUAL] Pago histórico cobrado antes de la app (sin asiento).",
                })
                historical += 1
            rows.append(row)
        sb.table("rto_payments").insert(rows).execute()
        created["payments_created"] = len(rows)
        created["historical_paid"] = historical

        # ── 7. Enganche (tracking; ingreso de Homes → nunca contabilidad aquí)
        if t.down_payment > 0:
            dp_paid = bool(data.down_payment_paid)
            sb.table("capital_down_payment_installments").insert({
                "contract_id": contract_id,
                "installment_number": 1,
                "amount": t.down_payment,
                "due_date": start.isoformat(),
                "status": "paid" if dp_paid else "scheduled",
                "is_historical": dp_paid,
                **({"paid_date": start.isoformat(), "payment_method": "historico",
                    "notes": "[ALTA MANUAL] Enganche cobrado antes de la app."} if dp_paid else {}),
            }).execute()

        # ── 8. KYC manual opcional ──────────────────────────────────────────
        if data.mark_kyc_verified:
            now = datetime.utcnow().isoformat()
            sb.table("clients").update({
                "kyc_verified": True, "kyc_verified_at": now, "kyc_status": "verified",
                "kyc_type": "manual", "kyc_reviewed_by": data.created_by, "kyc_reviewed_at": now,
            }).eq("id", client_id).execute()

        sb.table("clients").update({"status": "rto_active"}).eq("id", client_id).execute()

        logger.info(f"[manual-intake] Legacy RTO chain created: client={client_id} sale={sale_id} "
                    f"contract={contract_id} payments={len(rows)} (historical={historical})")
        return {
            "ok": True,
            "message": f"Cliente RTO antiguo dado de alta: {historical} de {len(rows)} mensualidades marcadas como pagadas.",
            "client_id": client_id,
            "property_id": property_id,
            "sale_id": sale_id,
            "application_id": created["application_id"],
            "contract_id": contract_id,
            "payments_created": len(rows),
            "historical_paid": historical,
        }
    except HTTPException:
        # Rollback best-effort de lo creado en ESTA llamada (en orden inverso).
        _rollback_created(created)
        raise
    except Exception as e:
        _rollback_created(created)
        logger.error(f"[manual-intake] Error creating legacy chain: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _rollback_created(created: dict):
    """Undo partial chain creation so a failed intake never leaves orphans."""
    if not created:
        return
    try:
        cid = created.get("contract_id")
        if cid:
            sb.table("capital_down_payment_installments").delete().eq("contract_id", cid).execute()
            sb.table("rto_payments").delete().eq("rto_contract_id", cid).execute()
        if created.get("sale_id"):
            sb.table("sales").update({"rto_contract_id": None}).eq("id", created["sale_id"]).execute()
        if cid:
            sb.table("rto_contracts").delete().eq("id", cid).execute()
        if created.get("application_id"):
            sb.table("rto_applications").delete().eq("id", created["application_id"]).execute()
        if created.get("sale_id"):
            sb.table("sales").delete().eq("id", created["sale_id"]).execute()
        if created.get("property_id"):
            sb.table("properties").delete().eq("id", created["property_id"]).execute()
        if created.get("client_id"):
            sb.table("clients").delete().eq("id", created["client_id"]).execute()
        logger.info(f"[manual-intake] Rolled back partial chain: {list(created.keys())}")
    except Exception as rb:
        logger.error(f"[manual-intake] ROLLBACK FAILED (manual cleanup needed): {rb} — created={created}")


@router.post("/contracts/{contract_id}/upload-contract")
async def upload_scanned_contract(contract_id: str, file: UploadFile = File(...)):
    """Sube el PDF escaneado del contrato firmado en papel (clientes antiguos).

    Sustituye contract_pdf_url — el escaneado manda sobre el generado. Sirve
    para cualquier contrato, no solo los de alta manual.
    """
    try:
        c = sb.table("rto_contracts").select("id").eq("id", contract_id).execute()
        if not c.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        if (file.content_type or "") not in ("application/pdf", "application/x-pdf"):
            raise HTTPException(status_code=400, detail="Solo se aceptan archivos PDF")
        blob = await file.read()
        if len(blob) > 25 * 1024 * 1024:
            raise HTTPException(status_code=400, detail="PDF demasiado grande (máx 25MB)")

        path = f"rto-contracts/{contract_id}/scanned_{int(datetime.utcnow().timestamp())}.pdf"
        sb.storage.from_(_CONTRACT_BUCKET).upload(path, blob, {"content-type": "application/pdf"})
        url = sb.storage.from_(_CONTRACT_BUCKET).get_public_url(path)
        if url and url.endswith("?"):
            url = url[:-1]
        sb.table("rto_contracts").update({"contract_pdf_url": url}).eq("id", contract_id).execute()
        logger.info(f"[manual-intake] Scanned contract uploaded for {contract_id}")
        return {"ok": True, "contract_pdf_url": url, "message": "Contrato escaneado subido"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[manual-intake] Error uploading scanned contract: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/contracts/{contract_id}/mark-paid-until")
async def mark_paid_until(contract_id: str, data: MarkPaidUntil):
    """Marca en bloque como PAGADAS (históricas, sin asientos) las mensualidades
    con vencimiento <= paid_through que sigan pendientes.

    Si alguna ya tenía auto-factura [RTO:] abierta, la elimina junto con sus
    legs del ledger (vía delete_capital_invoice) para no dejar A/R fantasma ni
    ingreso reconocido por un pago que en realidad fue pre-app.
    """
    _require_migration_106()
    try:
        paid_through = date.fromisoformat(data.paid_through)
        if paid_through > date.today():
            raise HTTPException(status_code=400, detail="'Pagado hasta' no puede ser una fecha futura")

        pays = sb.table("rto_payments").select("id, amount, due_date, status") \
            .eq("rto_contract_id", contract_id) \
            .lte("due_date", paid_through.isoformat()) \
            .in_("status", ["scheduled", "pending", "late", "partial"]) \
            .execute().data or []
        if not pays:
            return {"ok": True, "marked": 0, "invoices_removed": 0,
                    "message": "No hay mensualidades pendientes hasta esa fecha"}

        # Auto-facturas abiertas de esos pagos → eliminar factura + legs.
        pay_ids = [p["id"] for p in pays]
        invoices = sb.table("capital_invoices").select("id, invoice_number, status") \
            .in_("rto_payment_id", pay_ids) \
            .in_("status", ["sent", "partial", "overdue", "draft"]) \
            .execute().data or []
        removed = 0
        if invoices:
            from api.routes.capital.accounting_invoices import delete_capital_invoice
            for inv in invoices:
                try:
                    await delete_capital_invoice(inv["id"])
                    removed += 1
                except Exception as de:
                    logger.warning(f"[manual-intake] Could not remove invoice {inv.get('invoice_number')}: {de}")

        for p in pays:
            sb.table("rto_payments").update({
                "status": "paid",
                "paid_date": p["due_date"],
                "paid_amount": float(p["amount"]),
                "payment_method": "historico",
                "is_historical": True,
                "recorded_by": data.created_by,
                "notes": "[HISTORICO] Cobrado antes de la app; marcado en bloque (sin asiento).",
            }).eq("id", p["id"]).execute()

        logger.info(f"[manual-intake] mark-paid-until {paid_through} on {contract_id}: "
                    f"{len(pays)} payments, {removed} invoices removed")
        return {"ok": True, "marked": len(pays), "invoices_removed": removed,
                "message": f"{len(pays)} mensualidades marcadas como pagadas (históricas)"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[manual-intake] Error in mark-paid-until: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/clients/{client_id}/kyc-documents")
async def upload_client_kyc_documents(
    client_id: str,
    id_front: UploadFile = File(...),
    id_back: Optional[UploadFile] = File(None),
    selfie: Optional[UploadFile] = File(None),
    id_type: str = Form("drivers_license"),
    mark_verified: bool = Form(False),
    uploaded_by: str = Form("capital-manual"),
):
    """El EMPLEADO sube los documentos de identidad de un cliente antiguo
    (mismo bucket/estructura que la subida del portal cliente; selfie opcional
    porque para legacy suele haber solo copia del ID). Con mark_verified=True
    lo deja verificado en el mismo paso."""
    try:
        cl = sb.table("clients").select("id, name, kyc_documents").eq("id", client_id).execute()
        if not cl.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        allowed = ("image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "application/pdf")
        ts = int(datetime.utcnow().timestamp())

        async def _up(f: UploadFile, label: str) -> str:
            if (f.content_type or "") not in allowed:
                raise HTTPException(status_code=400, detail=f"{label}: tipo no permitido ({f.content_type})")
            blob = await f.read()
            if len(blob) > 10 * 1024 * 1024:
                raise HTTPException(status_code=400, detail=f"{label}: archivo demasiado grande (máx 10MB)")
            ext = (f.filename or "x.jpg").rsplit(".", 1)[-1].lower() or "jpg"
            path = f"{client_id}/{label}_{ts}.{ext}"
            sb.storage.from_(_KYC_BUCKET).upload(path, blob, {"content-type": f.content_type or "image/jpeg"})
            url = sb.storage.from_(_KYC_BUCKET).get_public_url(path)
            return url[:-1] if url and url.endswith("?") else url

        docs = dict(cl.data[0].get("kyc_documents") or {})
        docs["id_front_url"] = await _up(id_front, "id_front")
        if id_back:
            docs["id_back_url"] = await _up(id_back, "id_back")
        if selfie:
            docs["selfie_url"] = await _up(selfie, "selfie")
        docs["id_type"] = id_type
        docs["uploaded_at"] = datetime.utcnow().isoformat()
        docs["uploaded_by"] = uploaded_by

        update = {"kyc_documents": docs}
        if mark_verified:
            now = datetime.utcnow().isoformat()
            update.update({
                "kyc_verified": True, "kyc_verified_at": now, "kyc_status": "verified",
                "kyc_type": id_type, "kyc_requested": False,
                "kyc_reviewed_by": uploaded_by, "kyc_reviewed_at": now,
            })
        sb.table("clients").update(update).eq("id", client_id).execute()

        logger.info(f"[manual-intake] KYC docs uploaded for client {client_id} by {uploaded_by} (verified={mark_verified})")
        return {"ok": True, "kyc_documents": docs, "verified": mark_verified,
                "message": "Documentos subidos" + (" y cliente verificado" if mark_verified else "")}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[manual-intake] Error uploading KYC docs: {e}")
        raise HTTPException(status_code=500, detail=str(e))
