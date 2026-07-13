"""
Capital — Invoicing (AR/AP), recurring expenses, receipts, audit log and
reconciliation utilities.

Mirror of the Homes features in api/routes/accounting.py, operating on the
capital_* tables and posting through the Capital ledger config
(api/services/capital_ledger.py). Same endpoint shapes as Homes so the
frontend port is 1:1.

Ledger rules (same as Homes):
  - Creating an invoice posts the AR/AP pair at ISSUANCE
    (invoice_issued_ar / invoice_received_ap) — cashless.
  - Registering a payment posts the cash pair
    (invoice_paid_in / invoice_paid_out) against the chosen bank.
  - Deleting an invoice cascades: ledger legs, payment rows, statement links.
"""

import csv
import io
import json
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/accounting", tags=["Capital - Invoicing"])

# Default posting accounts (capital_accounts.code — numeric chart)
_DEFAULT_INCOME_CODE = "41000"    # RTO Rental Income
_DEFAULT_EXPENSE_CODE = "60900"   # Operating Expenses (General)


# ============================================================================
# HELPERS
# ============================================================================

def _log_capital_audit(table_name: str, record_id: str, action: str, changes: dict = None,
                       description: str = None, user_id: str = None, user_email: str = None):
    """Write to Capital's audit log. Fire-and-forget."""
    try:
        sb.table("capital_audit_log").insert({
            "table_name": table_name,
            "record_id": record_id,
            "action": action,
            "changes": json.dumps(changes) if changes else None,
            "description": description,
            "user_id": user_id,
            "user_email": user_email,
        }).execute()
    except Exception as e:
        logger.warning(f"[capital-audit] Failed to log: {e}")


def _generate_capital_invoice_number(direction: str) -> str:
    prefix_map = {"receivable": "FAC", "payable": "BILL"}
    p = prefix_map.get(direction, "DOC")
    today = date.today().strftime("%y%m%d")
    full_prefix = f"{p}-{today}-"
    try:
        existing = sb.table("capital_invoices") \
            .select("invoice_number") \
            .like("invoice_number", f"{full_prefix}%") \
            .execute()
        count = len(existing.data) if existing.data else 0
    except Exception:
        count = 0
    return f"{full_prefix}{count + 1:03d}"


# ============================================================================
# MODELS
# ============================================================================

class CapitalInvoiceCreate(BaseModel):
    direction: str                       # 'receivable' | 'payable'
    counterparty_name: str
    counterparty_type: Optional[str] = None   # 'client', 'investor', 'vendor', 'homes'
    client_id: Optional[str] = None
    investor_id: Optional[str] = None
    property_id: Optional[str] = None
    rto_contract_id: Optional[str] = None
    rto_payment_id: Optional[str] = None
    issue_date: Optional[str] = None
    due_date: Optional[str] = None
    subtotal: float = 0
    tax_amount: float = 0
    total_amount: float = 0
    description: Optional[str] = None
    line_items: Optional[list] = None
    notes: Optional[str] = None
    payment_terms: Optional[str] = None
    # Chart code the invoice posts to: income account (receivable) or
    # expense account (payable). Sensible defaults when omitted.
    account_code: Optional[str] = None
    expense_account_code: Optional[str] = None


class CapitalInvoicePaymentCreate(BaseModel):
    invoice_id: str
    amount: float
    payment_date: Optional[str] = None
    payment_method: Optional[str] = None
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    # Which Capital bank received (receivable) or paid (payable) the money.
    bank_account_id: Optional[str] = None


class CapitalRecurringCreate(BaseModel):
    name: str
    amount: float
    frequency: str = "monthly"
    account_id: Optional[str] = None
    bank_account_id: Optional[str] = None
    counterparty_name: Optional[str] = None
    description: Optional[str] = None
    next_due_date: Optional[str] = None


# ============================================================================
# INVOICES / BILLS
# ============================================================================

@router.get("/invoices")
async def list_capital_invoices(
    direction: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
):
    q = sb.table("capital_invoices") \
        .select("*") \
        .order("issue_date", desc=True)
    if direction:
        q = q.eq("direction", direction)
    if status:
        q = q.eq("status", status)
    offset = (page - 1) * per_page
    q = q.range(offset, offset + per_page - 1)
    result = q.execute()
    return {"invoices": result.data or []}


@router.post("/invoices")
async def create_capital_invoice(data: CapitalInvoiceCreate):
    inv_number = _generate_capital_invoice_number(data.direction)
    insert_data = {
        "invoice_number": inv_number,
        "direction": data.direction,
        "counterparty_name": data.counterparty_name,
        "counterparty_type": data.counterparty_type,
        "client_id": data.client_id,
        "investor_id": data.investor_id,
        "property_id": data.property_id,
        "rto_contract_id": data.rto_contract_id,
        "rto_payment_id": data.rto_payment_id,
        "issue_date": data.issue_date or date.today().isoformat(),
        "due_date": data.due_date,
        "subtotal": data.subtotal,
        "tax_amount": data.tax_amount,
        "total_amount": data.total_amount or (data.subtotal + data.tax_amount),
        "amount_paid": 0,
        "description": data.description,
        "line_items": json.dumps(data.line_items or []),
        "notes": data.notes,
        "payment_terms": data.payment_terms,
        # Manual Capital invoices are issued on creation (they record a real
        # receivable/payable and there is no separate "send" step in the UI),
        # so they count toward aging / Por Cobrar / Por Pagar immediately.
        "status": "sent",
    }
    insert_data = {k: v for k, v in insert_data.items() if v is not None}
    result = sb.table("capital_invoices").insert(insert_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating invoice")
    invoice_row = result.data[0]
    _log_capital_audit("capital_invoices", invoice_row["id"], "create",
                       description=f"Created invoice {inv_number}")

    # AR/AP ledger pair at ISSUANCE so unpaid invoices show up in reports
    # and "Por Conciliar" — same rule as Homes.
    try:
        from api.services.capital_ledger import post_to_capital_ledger
        total = float(invoice_row.get("total_amount") or 0)
        if total > 0:
            extra = {k: v for k, v in {
                "client_id": data.client_id,
                "investor_id": data.investor_id,
                "rto_contract_id": data.rto_contract_id,
            }.items() if v}
            if data.direction == "receivable":
                post_to_capital_ledger(
                    event_type="invoice_issued_ar",
                    income_account_code=data.account_code or _DEFAULT_INCOME_CODE,
                    amount=total,
                    date=invoice_row.get("issue_date") or date.today().isoformat(),
                    counterparty_name=data.counterparty_name,
                    counterparty_type=data.counterparty_type or "client",
                    entity_type="invoice",
                    entity_id=invoice_row["id"],
                    property_id=data.property_id,
                    description_data={"invoice_number": inv_number},
                    notes=data.notes,
                    status="confirmed",
                    extra_fields=extra or None,
                )
            elif data.direction == "payable":
                post_to_capital_ledger(
                    event_type="invoice_received_ap",
                    amount=total,
                    date=invoice_row.get("issue_date") or date.today().isoformat(),
                    counterparty_name=data.counterparty_name,
                    counterparty_type=data.counterparty_type or "vendor",
                    entity_type="invoice",
                    entity_id=invoice_row["id"],
                    property_id=data.property_id,
                    description_data={"invoice_number": inv_number},
                    expense_account_code=data.account_code or data.expense_account_code or _DEFAULT_EXPENSE_CODE,
                    notes=data.notes,
                    status="confirmed",
                    extra_fields=extra or None,
                )
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not post AR/AP ledger pair for invoice {inv_number}: {e}")

    return invoice_row


@router.patch("/invoices/{invoice_id}")
async def update_capital_invoice(invoice_id: str, data: dict):
    allowed = {"status", "due_date", "notes", "description", "payment_terms",
               "counterparty_name", "subtotal", "tax_amount", "total_amount", "line_items"}
    update = {k: v for k, v in data.items() if k in allowed}
    if "line_items" in update and isinstance(update["line_items"], list):
        update["line_items"] = json.dumps(update["line_items"])
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields")
    result = sb.table("capital_invoices").update(update).eq("id", invoice_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    _log_capital_audit("capital_invoices", invoice_id, "update", changes=update)
    return result.data[0]


@router.delete("/invoices/{invoice_id}")
async def delete_capital_invoice(invoice_id: str):
    """Delete an invoice and everything linked to it: ledger entries
    (issuance + payment legs, all tagged entity_type='invoice'), payment
    records, and statement movement links."""
    inv = sb.table("capital_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Factura no encontrada")
    invoice = inv.data[0]

    legs = sb.table("capital_transactions").select("id") \
        .eq("entity_type", "invoice").eq("entity_id", invoice_id).execute().data or []
    leg_ids = [r["id"] for r in legs]

    if leg_ids:
        # Release FKs before deleting: statement reconciliation links + the
        # self-referential linked_transaction_id between the two legs.
        try:
            sb.table("capital_statement_movements").update({"transaction_id": None, "status": "pending"}) \
                .in_("transaction_id", leg_ids).execute()
            sb.table("capital_statement_movements").update({"matched_transaction_id": None, "status": "pending"}) \
                .in_("matched_transaction_id", leg_ids).execute()
        except Exception as e:
            logger.warning(f"[capital-accounting] Could not clear statement movements for invoice {invoice_id}: {e}")
        sb.table("capital_transactions").update({"linked_transaction_id": None}) \
            .in_("id", leg_ids).execute()
        sb.table("capital_transactions").delete().in_("id", leg_ids).execute()

    try:
        sb.table("capital_invoice_payments").delete().eq("invoice_id", invoice_id).execute()
    except Exception as e:
        logger.warning(f"[capital-accounting] Could not delete payments for invoice {invoice_id}: {e}")

    sb.table("capital_invoices").delete().eq("id", invoice_id).execute()

    _log_capital_audit("capital_invoices", invoice_id, "delete",
                       description=f"Deleted invoice {invoice.get('invoice_number')} (${invoice.get('total_amount')})")
    return {"message": "Factura eliminada",
            "invoice_number": invoice.get("invoice_number"),
            "deleted_ledger_rows": len(leg_ids)}


@router.post("/invoices/{invoice_id}/payments")
async def add_capital_invoice_payment(invoice_id: str, data: CapitalInvoicePaymentCreate):
    inv = sb.table("capital_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    invoice = inv.data[0]

    payment_data = {
        "invoice_id": invoice_id,
        "payment_date": data.payment_date or date.today().isoformat(),
        "amount": data.amount,
        "payment_method": data.payment_method,
        "payment_reference": data.payment_reference,
        "notes": data.notes,
    }
    payment_data = {k: v for k, v in payment_data.items() if v is not None}

    is_income = invoice["direction"] == "receivable"

    # POST THE LEDGER PAIR FIRST. Only if the cash pair posts do we register
    # the payment row and mark the invoice paid — otherwise a swallowed post
    # would leave the invoice marked paid with no ledger pair behind it.
    bank_txn_id = None
    if data.bank_account_id:
        try:
            from api.services.capital_ledger import post_to_capital_ledger
            event_type = "invoice_paid_in" if is_income else "invoice_paid_out"
            extra = {k: v for k, v in {
                "client_id": invoice.get("client_id"),
                "investor_id": invoice.get("investor_id"),
                "rto_contract_id": invoice.get("rto_contract_id"),
                "rto_payment_id": invoice.get("rto_payment_id"),
            }.items() if v}
            debit_id, credit_id = post_to_capital_ledger(
                event_type=event_type,
                amount=float(data.amount),
                bank_account_id=data.bank_account_id,
                date=data.payment_date or date.today().isoformat(),
                counterparty_name=invoice.get("counterparty_name"),
                counterparty_type=invoice.get("counterparty_type"),
                entity_type="invoice",
                entity_id=invoice_id,
                property_id=invoice.get("property_id"),
                description_data={"invoice_number": invoice.get("invoice_number", "")},
                payment_method=data.payment_method,
                payment_reference=data.payment_reference,
                notes=data.notes,
                status="confirmed",
                extra_fields=extra or None,
            )
            # The bank leg id is what the invoice_payments row links to so
            # reconciliation can match against the right side.
            bank_txn_id = debit_id if is_income else credit_id
        except ValueError as e:
            logger.error(f"[capital-accounting] Cannot post invoice payment ledger: {e}")
            raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
        except Exception as e:
            # Do NOT mark the invoice paid without its pair — fail loudly so
            # the payment can be retried instead of silently lost.
            logger.error(f"[capital-accounting] Invoice payment ledger post FAILED (nothing marked paid): {e}")
            raise HTTPException(status_code=500, detail=f"No se pudo registrar el pago en contabilidad: {e}")
    else:
        logger.warning(
            f"[capital-accounting] Invoice payment for {invoice_id} registered WITHOUT "
            f"bank_account_id — no ledger pair written."
        )

    # Ledger pair is safely posted (or no bank at all → document-only by
    # design). Now register the payment and mark the invoice paid.
    if bank_txn_id:
        payment_data["transaction_id"] = bank_txn_id
    pay_result = sb.table("capital_invoice_payments").insert(payment_data).execute()

    new_paid = float(invoice.get("amount_paid") or 0) + data.amount
    total = float(invoice.get("total_amount") or 0)
    new_status = "paid" if new_paid >= total else "partial"

    sb.table("capital_invoices").update({
        "amount_paid": new_paid,
        "status": new_status,
    }).eq("id", invoice_id).execute()

    _log_capital_audit("capital_invoices", invoice_id, "update",
                       description=f"Payment of ${data.amount} on invoice {invoice.get('invoice_number')}")

    return {"payment": pay_result.data[0] if pay_result.data else None,
            "invoice_status": new_status, "new_amount_paid": new_paid}


@router.post("/invoices/generate-rto")
async def generate_rto_invoices_now():
    """Generate this month's RTO receivable invoices on demand (the daily
    scheduler job runs the same idempotent logic)."""
    from api.routes.capital._rto_invoicing import generate_rto_receivable_invoices
    return generate_rto_receivable_invoices()


@router.get("/invoices/aging/summary")
async def get_capital_aging_summary(direction: str = Query("receivable")):
    """Aging report: current, 1-30, 31-60, 61-90, 90+ days."""
    today = date.today()
    invoices = sb.table("capital_invoices") \
        .select("id, invoice_number, counterparty_name, total_amount, amount_paid, balance_due, due_date, status, direction") \
        .eq("direction", direction) \
        .in_("status", ["sent", "partial", "overdue"]) \
        .execute()

    buckets = {"current": 0, "1_30": 0, "31_60": 0, "61_90": 0, "over_90": 0}
    items = {"current": [], "1_30": [], "31_60": [], "61_90": [], "over_90": []}

    for inv in (invoices.data or []):
        bal = float(inv.get("balance_due") or 0)
        if bal <= 0:
            continue
        due = inv.get("due_date")
        if not due:
            buckets["current"] += bal
            items["current"].append(inv)
            continue
        days = (today - date.fromisoformat(due)).days
        if days <= 0:
            bucket = "current"
        elif days <= 30:
            bucket = "1_30"
        elif days <= 60:
            bucket = "31_60"
        elif days <= 90:
            bucket = "61_90"
        else:
            bucket = "over_90"
        buckets[bucket] += bal
        items[bucket].append(inv)

    total = sum(buckets.values())
    return {"direction": direction, "total": total, "buckets": buckets, "items": items}


@router.get("/invoices/{invoice_id}")
async def get_capital_invoice_detail(invoice_id: str):
    inv = sb.table("capital_invoices").select("*").eq("id", invoice_id).execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payments = sb.table("capital_invoice_payments") \
        .select("*").eq("invoice_id", invoice_id).order("payment_date").execute()
    return {"invoice": inv.data[0], "payments": payments.data or []}


@router.get("/export/invoices")
async def export_capital_invoices_csv(direction: Optional[str] = None):
    q = sb.table("capital_invoices") \
        .select("invoice_number, direction, issue_date, due_date, counterparty_name, total_amount, amount_paid, balance_due, status") \
        .order("issue_date", desc=True)
    if direction:
        q = q.eq("direction", direction)
    invoices = (q.execute()).data or []

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Número", "Tipo", "Fecha Emisión", "Vencimiento", "Contraparte",
                     "Total", "Pagado", "Pendiente", "Estado"])
    for inv in invoices:
        writer.writerow([
            inv.get("invoice_number", ""),
            "Cobrar" if inv.get("direction") == "receivable" else "Pagar",
            inv.get("issue_date", ""),
            inv.get("due_date", ""),
            inv.get("counterparty_name", ""),
            inv.get("total_amount", 0),
            inv.get("amount_paid", 0),
            inv.get("balance_due", 0),
            inv.get("status", ""),
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=facturas_capital.csv"},
    )


# ============================================================================
# RECURRING EXPENSES
# ============================================================================

@router.get("/recurring-expenses")
async def list_capital_recurring_expenses():
    result = sb.table("capital_recurring_expenses") \
        .select("*").eq("is_active", True).order("next_due_date").execute()
    # Wrapped envelope to match the frontend (reads d.expenses), consistent
    # with the other Capital list endpoints.
    return {"expenses": result.data or []}


@router.post("/recurring-expenses")
async def create_capital_recurring_expense(data: CapitalRecurringCreate):
    insert = {k: v for k, v in data.model_dump().items() if v is not None}
    result = sb.table("capital_recurring_expenses").insert(insert).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating recurring expense")
    return result.data[0]


@router.delete("/recurring-expenses/{expense_id}")
async def deactivate_capital_recurring_expense(expense_id: str):
    result = sb.table("capital_recurring_expenses") \
        .update({"is_active": False}).eq("id", expense_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Not found")
    return {"message": "Recurring expense deactivated"}


# ============================================================================
# RECEIPTS
# ============================================================================

@router.get("/receipts")
async def list_capital_receipts(transaction_id: Optional[str] = Query(None)):
    q = sb.table("capital_receipts").select("*")
    if transaction_id:
        q = q.eq("transaction_id", transaction_id)
    result = q.order("created_at", desc=True).execute()
    return result.data or []


@router.post("/receipts")
async def upload_capital_receipt(
    file: UploadFile = File(...),
    transaction_id: str = Form(None),
    vendor_name: str = Form(None),
    amount: float = Form(None),
    receipt_date: str = Form(None),
    description: str = Form(None),
    notes: str = Form(None),
):
    """Upload a receipt file (image or PDF) attached to a Capital transaction."""
    import uuid as _uuid

    ext = (file.filename or "").rsplit(".", 1)[-1].lower() if file.filename else ""
    allowed = {"jpg", "jpeg", "png", "pdf", "heic", "webp"}
    if ext not in allowed:
        raise HTTPException(status_code=400, detail=f"File type .{ext} not supported. Use: {', '.join(allowed)}")

    file_content = await file.read()
    if len(file_content) == 0:
        raise HTTPException(status_code=400, detail="Empty file")

    storage_path = f"capital-receipts/{_uuid.uuid4().hex[:12]}_{file.filename}"
    try:
        sb.storage.from_("transaction-documents").upload(
            storage_path, file_content,
            {"content-type": file.content_type or "application/octet-stream"}
        )
        file_url = sb.storage.from_("transaction-documents").get_public_url(storage_path)
        if file_url and file_url.endswith("?"):
            file_url = file_url[:-1]
    except Exception as e:
        logger.error(f"[Capital Receipts] Storage upload failed: {e}")
        raise HTTPException(status_code=500, detail="Could not upload file to storage")

    receipt_data = {
        "file_url": file_url,
        "storage_path": storage_path,
        "file_type": ext,
        "original_filename": file.filename or "unknown",
    }
    if transaction_id:
        receipt_data["transaction_id"] = transaction_id
    if vendor_name:
        receipt_data["vendor_name"] = vendor_name
    if amount is not None:
        receipt_data["amount"] = amount
    if receipt_date:
        receipt_data["receipt_date"] = receipt_date
    if description:
        receipt_data["description"] = description
    if notes:
        receipt_data["notes"] = notes

    result = sb.table("capital_receipts").insert(receipt_data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Could not save receipt record")

    return result.data[0]


@router.delete("/receipts/{receipt_id}")
async def delete_capital_receipt(receipt_id: str):
    receipt = sb.table("capital_receipts").select("storage_path").eq("id", receipt_id).execute()
    if not receipt.data:
        raise HTTPException(status_code=404, detail="Receipt not found")

    storage_path = receipt.data[0].get("storage_path")
    if storage_path:
        try:
            sb.storage.from_("transaction-documents").remove([storage_path])
        except Exception as e:
            logger.warning(f"[Capital Receipts] Could not delete file from storage: {e}")

    sb.table("capital_receipts").delete().eq("id", receipt_id).execute()
    return {"message": "Receipt deleted"}


# ============================================================================
# AUDIT LOG
# ============================================================================

@router.get("/audit-log")
async def get_capital_audit_log(
    table_name: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=10, le=200),
):
    q = sb.table("capital_audit_log").select("*", count="exact").order("created_at", desc=True)
    if table_name:
        q = q.eq("table_name", table_name)
    offset = (page - 1) * per_page
    q = q.range(offset, offset + per_page - 1)
    result = q.execute()
    return {"entries": result.data or [], "total": result.count or 0,
            "page": page, "per_page": per_page}


# ============================================================================
# RECONCILIATION UTILITIES
# ============================================================================

@router.post("/reconciliation/mark")
async def mark_capital_reconciled(data: dict):
    """Mark transactions as reconciled. Body: {"transaction_ids": [...]}"""
    ids = data.get("transaction_ids") or []
    if not ids:
        raise HTTPException(status_code=400, detail="transaction_ids required")
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    result = sb.table("capital_transactions").update({
        "status": "reconciled", "reconciled_at": now,
    }).in_("id", ids).execute()
    for tid in ids:
        _log_capital_audit("capital_transactions", tid, "reconcile")
    return {"updated": len(result.data or [])}


@router.post("/reconciliation/reset-all")
async def reset_all_capital_reconciled():
    """Reset all reconciled transactions back to confirmed (demo/testing)."""
    result = sb.table("capital_transactions").update({
        "status": "confirmed", "reconciled_at": None,
    }).eq("status", "reconciled").execute()
    return {"reset": len(result.data or [])}


@router.get("/reconciliation/unreconciled")
async def get_capital_unreconciled(
    bank_account_id: Optional[str] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
):
    q = sb.table("capital_transactions").select("*") \
        .eq("status", "confirmed") \
        .not_.is_("bank_account_id", "null") \
        .order("transaction_date", desc=True)
    if bank_account_id:
        q = q.eq("bank_account_id", bank_account_id)
    if date_from:
        q = q.gte("transaction_date", date_from)
    if date_to:
        q = q.lte("transaction_date", date_to)
    result = q.execute()
    return {"transactions": result.data or []}
