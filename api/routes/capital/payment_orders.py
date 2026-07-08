"""
Capital — Payment Orders (Tesorería)

Mirror of the Homes payment-order workflow (api/routes/payment_orders.py)
for Maninos Capital: create (pending) → approve → complete | cancel.

  - OUTBOUND orders (retornos a inversionistas, pagos de notas, gastos,
    comisiones, adquisiciones): approving only unlocks Treasury; the
    double-entry ledger pair is posted on /complete.
  - INBOUND orders (pagos RTO, enganches, depósitos de inversionistas):
    approving with a bank posts the inbound ledger pair immediately.
  - Every OUTBOUND order auto-generates a document-only "por pagar" bill in
    capital_invoices tagged [PO:<order_id>] — NEVER posted to the ledger
    (the order's own completion posts the real entry; posting the bill too
    would double-count).
"""

import logging
from datetime import date, datetime
from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payment-orders", tags=["Capital - Payment Orders"])


# Concept → (human label, counterparty type) for the auto-generated payable bill.
_PAYABLE_CONCEPT_LABEL = {
    "retorno_inversionista": ("Retorno a inversionista", "investor"),
    "pago_nota": ("Pago de nota promisoria", "investor"),
    "gasto_operativo": ("Gasto operativo", "vendor"),
    "comision": ("Comisión", "employee"),
    "seguro": ("Seguro", "vendor"),
    "impuesto": ("Impuesto", "vendor"),
    "adquisicion": ("Adquisición de propiedad", "seller"),
    "otro": ("Pago", "vendor"),
}

# Concept → ledger event for OUTBOUND completion.
_OUTBOUND_EVENT_MAP = {
    "retorno_inversionista": "investor_return_paid",
    "pago_nota": "investor_return_paid",
    "gasto_operativo": "manual_expense_paid",
    "comision": "commission_paid",
    "seguro": "manual_expense_paid",
    "impuesto": "manual_expense_paid",
    "adquisicion": "acquisition_paid",
    "otro": "manual_expense_paid",
}

# Concept → ledger event for INBOUND approval.
_INBOUND_EVENT_MAP = {
    "pago_rto": "rto_payment_received",
    "enganche": "down_payment_received",
    "deposito_inversionista": "investor_deposit_received",
    "otro_ingreso": "manual_income_received",
}

_DEFAULT_EXPENSE_CODE = "60900"   # Operating Expenses (General)
_DEFAULT_INCOME_CODE = "70000"    # OTHER INCOME


def _sync_payable_invoice(order: dict, state: str) -> None:
    """Mirror an OUTBOUND capital payment order into an accounts-payable bill
    so payables show up automatically in Facturación / "Por Pagar".

    IMPORTANT: DOCUMENT record only — never posts to the ledger. The order's
    own `complete` flow posts the real entry; mirroring here would
    double-count. Same rule as Homes (see api/routes/payment_orders.py).

    state: 'open'   → pending/approved (unpaid, counts toward Por Pagar)
           'paid'   → completed (disbursed; drops off Por Pagar, stays as history)
           'voided' → cancelled

    Idempotent via the [PO:<id>] tag embedded in notes.
    """
    try:
        if (order.get("direction") or "outbound") == "inbound":
            return
        order_id = order.get("id")
        amount = float(order.get("amount") or 0)
        if not order_id or amount <= 0:
            return

        tag = f"[PO:{order_id}]"
        concept = (order.get("concept") or "otro").lower()
        label, ctype = _PAYABLE_CONCEPT_LABEL.get(concept, _PAYABLE_CONCEPT_LABEL["otro"])

        if state == "paid":
            new_status, paid = "paid", amount
        elif state == "voided":
            new_status, paid = "voided", 0.0
        else:  # open
            new_status, paid = "sent", 0.0

        existing = (sb.table("capital_invoices").select("id")
                    .eq("direction", "payable").ilike("notes", f"%{tag}%")
                    .limit(1).execute()).data or []

        if existing:
            sb.table("capital_invoices").update({
                "status": new_status,
                "amount_paid": paid,
                "total_amount": amount,
            }).eq("id", existing[0]["id"]).execute()
            return

        from api.routes.capital.accounting_invoices import _generate_capital_invoice_number
        inv_number = _generate_capital_invoice_number("payable")
        desc = f"{label} — {order.get('payee_name') or ''}".strip(" —") or label
        insert = {
            "invoice_number": inv_number,
            "direction": "payable",
            "counterparty_name": order.get("payee_name") or "—",
            "counterparty_type": ctype,
            "investor_id": order.get("investor_id"),
            "property_id": order.get("property_id"),
            "rto_contract_id": order.get("rto_contract_id"),
            "issue_date": (order.get("created_at") or datetime.utcnow().isoformat())[:10],
            "subtotal": amount,
            "tax_amount": 0,
            "total_amount": amount,
            "amount_paid": paid,
            "description": desc,
            "notes": f"{tag} Factura por pagar generada automáticamente desde la orden de pago.",
            "status": new_status,
        }
        insert = {k: v for k, v in insert.items() if v is not None}
        sb.table("capital_invoices").insert(insert).execute()
        logger.info(f"[capital-payment_orders] Auto-generated payable bill {inv_number} for order {order_id} ({state})")
    except Exception as e:
        logger.warning(f"[capital-payment_orders] Could not sync payable invoice for {order.get('id')}: {e}")


def _order_extra_fields(order: dict) -> Optional[dict]:
    """Entity links that exist as columns on capital_transactions."""
    extra = {k: v for k, v in {
        "investor_id": order.get("investor_id"),
        "rto_contract_id": order.get("rto_contract_id"),
        "client_id": order.get("client_id"),
    }.items() if v}
    return extra or None


# =============================================================================
# SCHEMAS
# =============================================================================

class CapitalPaymentOrderCreate(BaseModel):
    payee_name: str
    amount: float
    method: str = "transferencia"
    concept: Optional[str] = "otro"
    direction: Optional[str] = "outbound"
    investor_id: Optional[str] = None
    promissory_note_id: Optional[str] = None
    rto_contract_id: Optional[str] = None
    client_id: Optional[str] = None
    property_id: Optional[str] = None
    bank_name: Optional[str] = None
    routing_number: Optional[str] = None
    account_number: Optional[str] = None
    routing_number_last4: Optional[str] = None
    account_number_last4: Optional[str] = None
    account_type: Optional[str] = "checking"
    payee_address: Optional[str] = None
    bank_address: Optional[str] = None
    expense_account_code: Optional[str] = None
    notes: Optional[str] = None
    created_by: Optional[str] = None


class CapitalPaymentOrderComplete(BaseModel):
    reference: str
    payment_date: str
    bank_account_id: Optional[str] = None
    completed_by: Optional[str] = None
    notes: Optional[str] = None


class CapitalPaymentOrderUpdate(BaseModel):
    amount: Optional[float] = None
    payee_name: Optional[str] = None
    notes: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("")
async def create_capital_payment_order(req: CapitalPaymentOrderCreate):
    """Create a pending Capital payment order."""
    r_last4 = req.routing_number_last4 or (req.routing_number[-4:] if req.routing_number else None)
    a_last4 = req.account_number_last4 or (req.account_number[-4:] if req.account_number else None)

    data = {
        "payee_name": req.payee_name,
        "amount": req.amount,
        "method": req.method,
        "concept": req.concept or "otro",
        "direction": req.direction or "outbound",
        "investor_id": req.investor_id,
        "promissory_note_id": req.promissory_note_id,
        "rto_contract_id": req.rto_contract_id,
        "client_id": req.client_id,
        "property_id": req.property_id,
        "bank_name": req.bank_name,
        "routing_number": req.routing_number,
        "account_number": req.account_number,
        "routing_number_last4": r_last4,
        "account_number_last4": a_last4,
        "account_type": req.account_type,
        "payee_address": req.payee_address,
        "bank_address": req.bank_address,
        "expense_account_code": req.expense_account_code,
        "status": "pending",
        "notes": req.notes,
        "created_by": req.created_by,
    }
    data = {k: v for k, v in data.items() if v is not None}

    result = sb.table("capital_payment_orders").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating payment order")

    order = result.data[0]
    logger.info(f"[capital-payment_orders] Created order {order['id']} for ${req.amount:,.2f} to {req.payee_name} concept={req.concept}")

    # Auto-generate the matching "por pagar" bill (document only).
    _sync_payable_invoice(order, "open")

    return {"ok": True, "data": order, "message": f"Orden de pago creada por ${req.amount:,.2f}"}


@router.get("")
async def list_capital_payment_orders(
    status: Optional[str] = Query(None),
    investor_id: Optional[str] = Query(None),
):
    q = sb.table("capital_payment_orders").select("*").order("created_at", desc=True)
    if status:
        q = q.eq("status", status)
    if investor_id:
        q = q.eq("investor_id", investor_id)
    result = q.execute()
    return {"ok": True, "data": result.data or []}


@router.get("/stats")
async def capital_payment_order_stats():
    try:
        pending = sb.table("capital_payment_orders").select("id", count="exact").eq("status", "pending").execute()
        approved = sb.table("capital_payment_orders").select("id", count="exact").eq("status", "approved").execute()
        completed = sb.table("capital_payment_orders").select("id", count="exact").eq("status", "completed").execute()
        return {"ok": True, "data": {
            "pending": pending.count or 0,
            "approved": approved.count or 0,
            "completed": completed.count or 0,
        }}
    except Exception as e:
        logger.error(f"[capital-payment_orders] Error getting stats: {e}")
        return {"ok": True, "data": {"pending": 0, "approved": 0, "completed": 0}}


@router.get("/{order_id}")
async def get_capital_payment_order(order_id: str):
    result = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    return {"ok": True, "data": result.data[0]}


@router.patch("/{order_id}")
async def update_capital_payment_order(order_id: str, req: CapitalPaymentOrderUpdate):
    """Edit a pending order (amount/payee/notes) before approval."""
    order_res = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    order = order_res.data[0]
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden editar órdenes pendientes")

    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    sb.table("capital_payment_orders").update(update).eq("id", order_id).execute()
    after = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not after.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada después de actualizar")

    # Keep the auto-generated "por pagar" bill in sync with the edited amount.
    _sync_payable_invoice(after.data[0], "open")

    return {"ok": True, "data": after.data[0]}


@router.patch("/{order_id}/approve")
async def approve_capital_payment_order(
    order_id: str,
    approved_by: Optional[str] = Query(None),
    bank_account_id: Optional[str] = Query(None),
):
    """Approve a pending order. Outbound: unlocks Treasury. Inbound with a
    bank: posts the inbound ledger pair immediately (money received)."""
    order_res = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    order = order_res.data[0]
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Solo se pueden aprobar órdenes pendientes (estado actual: '{order['status']}')")

    now = datetime.utcnow().isoformat()
    result = sb.table("capital_payment_orders").update({
        "status": "approved",
        "approved_by": approved_by,
        "approved_at": now,
    }).eq("id", order_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al aprobar orden")

    logger.info(f"[capital-payment_orders] Approved order {order_id} by {approved_by}")

    if order.get("direction") == "inbound":
        if bank_account_id:
            try:
                from api.services.capital_ledger import post_to_capital_ledger
                concept = (order.get("concept") or "").lower()
                event_type = _INBOUND_EVENT_MAP.get(concept, "manual_income_received")
                kwargs = dict(
                    event_type=event_type,
                    amount=float(order["amount"]),
                    bank_account_id=bank_account_id,
                    date=date.today().isoformat(),
                    counterparty_name=order.get("payee_name") or "Cliente",
                    counterparty_type="investor" if concept == "deposito_inversionista" else "client",
                    entity_type="payment_order",
                    entity_id=order_id,
                    property_id=order.get("property_id"),
                    description_data={"concept": order.get("notes") or concept, "address": "—"},
                    payment_method=order.get("method"),
                    notes=f"Orden de pago #{order_id[:8]} (aprobada/recibida)",
                    status="confirmed",
                    created_by=approved_by,
                    extra_fields=_order_extra_fields(order),
                )
                if event_type == "manual_income_received":
                    kwargs["income_account_code"] = _DEFAULT_INCOME_CODE
                debit_id, credit_id = post_to_capital_ledger(**kwargs)
                sb.table("capital_payment_orders").update({
                    "accounting_transaction_id": debit_id,
                    "bank_account_id": bank_account_id,
                }).eq("id", order_id).execute()
                logger.info(f"[capital-payment_orders] inbound ledger pair=({debit_id},{credit_id}) for order {order_id}")
            except ValueError as e:
                logger.error(f"[capital-payment_orders] Cannot post inbound ledger for {order_id}: {e}")
                raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
            except Exception as e:
                logger.error(f"[capital-payment_orders] inbound ledger post failed for {order_id}: {e!r}")
                raise HTTPException(status_code=500, detail=f"Ledger post failed: {type(e).__name__}: {e}")
        else:
            logger.warning(
                f"[capital-payment_orders] Inbound order {order_id} approved WITHOUT bank_account_id — "
                f"no ledger pair written."
            )
        return {"ok": True, "data": result.data[0], "message": "Pago recibido aprobado."}

    return {"ok": True, "data": result.data[0], "message": "Orden aprobada. Tesorería puede ejecutar el pago."}


@router.patch("/{order_id}/complete")
async def complete_capital_payment_order(order_id: str, req: CapitalPaymentOrderComplete):
    """Mark an order as completed after executing the bank transfer.
    Posts the outbound double-entry pair and settles the auto-bill."""
    order_res = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    order = order_res.data[0]
    if order["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"La orden ya está en estado '{order['status']}'")

    now = datetime.utcnow().isoformat()

    acct_txn_id = None
    try:
        from api.services.capital_ledger import post_to_capital_ledger

        concept = (order.get("concept") or "otro").lower()
        event_type = _OUTBOUND_EVENT_MAP.get(concept, "manual_expense_paid")

        kwargs = dict(
            event_type=event_type,
            amount=float(order["amount"]),
            bank_account_id=req.bank_account_id,
            date=req.payment_date,
            counterparty_name=order["payee_name"],
            counterparty_type="investor" if concept in ("retorno_inversionista", "pago_nota") else "vendor",
            entity_type="payment_order",
            entity_id=order_id,
            property_id=order.get("property_id"),
            description_data={
                "concept": order.get("notes") or _PAYABLE_CONCEPT_LABEL.get(concept, ("Pago",))[0],
                "address": "—",
            },
            payment_method=order["method"],
            payment_reference=req.reference,
            notes=f"Orden de pago #{order_id[:8]}",
            status="confirmed",
            created_by=req.completed_by,
            extra_fields=_order_extra_fields(order),
        )
        if event_type == "manual_expense_paid":
            kwargs["expense_account_code"] = order.get("expense_account_code") or _DEFAULT_EXPENSE_CODE

        debit_id, credit_id = post_to_capital_ledger(**kwargs)
        # Bank leg for outbound events is the credit side — that's what
        # reconciliation matches against.
        acct_txn_id = credit_id
        logger.info(
            f"[capital-payment_orders] post_to_capital_ledger event={event_type} pair=({debit_id},{credit_id}) for order {order_id}"
        )
    except ValueError as e:
        logger.error(f"[capital-payment_orders] Cannot post ledger for order {order_id}: {e}")
        raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
    except Exception as e:
        logger.error(f"[capital-payment_orders] Could not create accounting pair for {order_id}: {e!r}")
        raise HTTPException(status_code=500, detail=f"Ledger post failed: {type(e).__name__}: {e}")

    update = {
        "status": "completed",
        "reference": req.reference,
        "payment_date": req.payment_date,
        "completed_by": req.completed_by,
        "completed_at": now,
    }
    if req.bank_account_id:
        update["bank_account_id"] = req.bank_account_id
    if req.notes:
        update["notes"] = req.notes
    if acct_txn_id:
        update["accounting_transaction_id"] = acct_txn_id

    result = sb.table("capital_payment_orders").update(update).eq("id", order_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error updating payment order")

    # Mark the auto-generated "por pagar" bill as paid.
    _sync_payable_invoice({**order, **update}, "paid")

    logger.info(f"[capital-payment_orders] Completed order {order_id}: ref={req.reference}")

    return {"ok": True, "data": result.data[0], "message": f"Pago completado. Ref: {req.reference}"}


@router.patch("/{order_id}/cancel")
async def cancel_capital_payment_order(order_id: str, cancelled_by: Optional[str] = None):
    """Cancel a pending order and void its auto-bill."""
    order_res = sb.table("capital_payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    if order_res.data[0]["status"] != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar órdenes pendientes")

    now = datetime.utcnow().isoformat()
    result = sb.table("capital_payment_orders").update({
        "status": "cancelled",
        "cancelled_by": cancelled_by,
        "cancelled_at": now,
    }).eq("id", order_id).execute()

    _sync_payable_invoice(order_res.data[0], "voided")

    return {"ok": True, "data": result.data[0] if result.data else None, "message": "Orden cancelada"}
