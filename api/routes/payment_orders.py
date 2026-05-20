"""
Payment Orders API — Pending payment workflow

Gabriel creates payment orders (pending).
Abigail (Treasury) reviews and completes them after executing the bank transfer.
Completing an order creates an accounting transaction for reconciliation.
"""

import logging
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


def _generate_transaction_number() -> str:
    today = date.today().strftime("%y%m%d")
    prefix = f"TXN-{today}-"
    try:
        existing = sb.table("accounting_transactions") \
            .select("transaction_number") \
            .like("transaction_number", f"{prefix}%") \
            .execute()
        count = len(existing.data) if existing.data else 0
    except Exception:
        count = 0
    return f"{prefix}{count + 1:03d}"


# =============================================================================
# SCHEMAS
# =============================================================================

class PaymentOrderCreate(BaseModel):
    property_id: str
    property_address: Optional[str] = None
    payee_id: Optional[str] = None
    payee_name: str
    bank_name: Optional[str] = None
    routing_number: Optional[str] = None
    account_number: Optional[str] = None
    routing_number_last4: Optional[str] = None
    account_number_last4: Optional[str] = None
    account_type: Optional[str] = "checking"
    payee_address: Optional[str] = None
    bank_address: Optional[str] = None
    amount: float
    method: str = "transferencia"
    notes: Optional[str] = None
    created_by: Optional[str] = None
    concept: Optional[str] = None  # compra, renovacion, movida, otro


class PaymentOrderComplete(BaseModel):
    reference: str  # confirmation number
    payment_date: str  # ISO date
    bank_account_id: Optional[str] = None  # which bank account paid from
    completed_by: Optional[str] = None
    notes: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("")
async def create_payment_order(req: PaymentOrderCreate):
    """Create a pending payment order (Gabriel)."""
    # Auto-derive last4 from full numbers if not provided
    r_last4 = req.routing_number_last4 or (req.routing_number[-4:] if req.routing_number else None)
    a_last4 = req.account_number_last4 or (req.account_number[-4:] if req.account_number else None)

    data = {
        "property_id": req.property_id,
        "property_address": req.property_address,
        "payee_name": req.payee_name,
        "bank_name": req.bank_name,
        "routing_number": req.routing_number,
        "account_number": req.account_number,
        "routing_number_last4": r_last4,
        "account_number_last4": a_last4,
        "account_type": req.account_type,
        "payee_address": req.payee_address,
        "bank_address": req.bank_address,
        "amount": req.amount,
        "method": req.method,
        "status": "pending",
        "notes": req.notes,
        "created_by": req.created_by,
        "concept": req.concept,
    }
    if req.payee_id:
        data["payee_id"] = req.payee_id

    result = sb.table("payment_orders").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating payment order")

    order = result.data[0]
    logger.info(f"[payment_orders] Created order {order['id']} for ${req.amount:,.2f} to {req.payee_name} concept={req.concept}")

    # Create notification with full context
    try:
        from api.services.notification_service import notify_payment_order_created
        concept_label = {"compra": "Compra de casa", "renovacion": "Renovación", "movida": "Movida/Transporte", "otro": "Otro"}.get(req.concept or "", "")
        full_notes = f"{concept_label}. {req.notes}" if concept_label and req.notes else (concept_label or req.notes or "")
        notify_payment_order_created(
            order["id"], req.property_id, req.amount, req.payee_name,
            property_address=req.property_address or "",
            concept=full_notes,
        )
    except Exception:
        pass

    return {"ok": True, "data": order, "message": f"Orden de pago creada por ${req.amount:,.2f}"}


@router.get("")
async def list_payment_orders(
    status: Optional[str] = Query(None),
    property_id: Optional[str] = Query(None),
):
    """List payment orders, optionally filtered by status and/or property."""
    q = sb.table("payment_orders").select("*").order("created_at", desc=True)
    if status:
        q = q.eq("status", status)
    if property_id:
        q = q.eq("property_id", property_id)
    result = q.execute()
    orders = result.data or []

    # Enrich with property_code from properties table
    prop_ids = list({o["property_id"] for o in orders if o.get("property_id")})
    if prop_ids:
        try:
            props = sb.table("properties").select("id, property_code").in_("id", prop_ids).execute()
            code_map = {p["id"]: p.get("property_code") for p in (props.data or [])}
            for o in orders:
                o["property_code"] = code_map.get(o.get("property_id"))
        except Exception:
            pass

    return {"ok": True, "data": orders}


@router.get("/stats")
async def payment_order_stats():
    """Get counts by status (for sidebar badge)."""
    try:
        pending = sb.table("payment_orders").select("id", count="exact").eq("status", "pending").execute()
        completed = sb.table("payment_orders").select("id", count="exact").eq("status", "completed").execute()
        return {
            "ok": True,
            "data": {
                "pending": pending.count or 0,
                "completed": completed.count or 0,
            }
        }
    except Exception as e:
        logger.error(f"[payment_orders] Error getting stats: {e}")
        return {"ok": True, "data": {"pending": 0, "completed": 0}}


@router.get("/{order_id}")
async def get_payment_order(order_id: str):
    """Get a single payment order."""
    result = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    return {"ok": True, "data": result.data[0]}


@router.patch("/{order_id}/approve")
async def approve_payment_order(
    order_id: str,
    approved_by: Optional[str] = Query(None),
    bank_account_id: Optional[str] = Query(None),
):
    """
    Approve a pending payment order (Sebastian/admin).
    Moves status from pending → approved so Treasury can execute it.
    """
    order_res = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    order = order_res.data[0]
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail=f"Solo se pueden aprobar ordenes pendientes (estado actual: '{order['status']}')")

    now = datetime.utcnow().isoformat()
    result = sb.table("payment_orders").update({
        "status": "approved",
        "approved_by": approved_by,
        "approved_at": now,
    }).eq("id", order_id).execute()

    if not result.data:
        raise HTTPException(status_code=500, detail="Error al aprobar orden")

    logger.info(f"[payment_orders] Approved order {order_id} by {approved_by}")

    try:
        from api.services.notification_service import notify_payment_order_approved
        notify_payment_order_approved(order_id, order.get("property_id"), order.get("amount", 0), approved_by or "admin")
    except Exception:
        pass

    # Inbound orders (enganche, pago capital, pago_venta): approve = "money
    # received" → write a ledger pair RIGHT NOW into the bank that received it.
    # Outbound orders (comisiones, compras): approve only changes status; the
    # ledger pair is written later by /complete.
    if order.get("direction") == "inbound":
        property_id = order.get("property_id")
        if property_id and order.get("concept") in ("enganche", "pago_capital"):
            try:
                sb.table("properties").update({"status": "sold"}).eq("id", property_id).execute()
                logger.info(f"[payment_orders] Property {property_id} marked SOLD after inbound {order.get('concept')} approved")
            except Exception as e:
                logger.warning(f"[payment_orders] Could not mark property as sold: {e}")

        # Write the inbound ledger pair if a bank was named on approval. If
        # not, log loud — this is the gap that today leaves saldos stale.
        if bank_account_id:
            try:
                from api.services.ledger import post_to_ledger
                concept = (order.get("concept") or "").lower()
                event_map = {
                    "enganche": "sale_down_payment_received",
                    "pago_venta": "sale_contado_received",
                    "pago_capital": "sale_contado_received",
                }
                event_type = event_map.get(concept, "sale_contado_received")
                debit_id, credit_id = post_to_ledger(
                    event_type=event_type,
                    amount=float(order["amount"]),
                    bank_account_id=bank_account_id,
                    date=date.today().isoformat(),
                    counterparty_name=order.get("payee_name") or "Cliente",
                    counterparty_type="client",
                    entity_type="payment_order",
                    entity_id=order_id,
                    property_id=property_id,
                    description_data={"address": order.get("property_address") or "—"},
                    payment_method=order.get("method"),
                    notes=f"Orden de pago #{order_id[:8]} (aprobada/recibida)",
                    status="confirmed",
                    created_by=approved_by,
                )
                sb.table("payment_orders").update({
                    "accounting_transaction_id": debit_id,
                    "bank_account_id": bank_account_id,
                }).eq("id", order_id).execute()
                logger.info(f"[payment_orders] inbound ledger pair=({debit_id},{credit_id}) for order {order_id}")
            except ValueError as e:
                logger.error(f"[payment_orders] Cannot post inbound ledger for {order_id}: {e}")
                raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
            except Exception as e:
                logger.warning(f"[payment_orders] inbound ledger post failed for {order_id}: {e}")
        else:
            logger.warning(
                f"[payment_orders] Inbound order {order_id} approved WITHOUT bank_account_id — "
                f"no ledger pair written. Update the UI to pass bank_account_id on approve."
            )

        return {"ok": True, "data": result.data[0], "message": "Pago recibido aprobado."}

    return {"ok": True, "data": result.data[0], "message": "Orden aprobada. Tesorería puede ejecutar el pago."}


@router.patch("/{order_id}/complete")
async def complete_payment_order(order_id: str, req: PaymentOrderComplete):
    """
    Mark a payment order as completed (Abigail/Treasury).
    Creates an accounting transaction for reconciliation.
    Requires the order to be approved first.
    """
    # Fetch the order
    order_res = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    order = order_res.data[0]
    if order["status"] not in ("pending", "approved"):
        raise HTTPException(status_code=400, detail=f"La orden ya esta en estado '{order['status']}'")

    now = datetime.utcnow().isoformat()

    # Create double-entry accounting pair via the unified ledger writer.
    # Concept on the payment_order drives the event type:
    #   compra      → property_purchase_paid  (debit 11000 Inventory, credit bank)
    #   renovacion  → renovation_paid         (debit 61700 Supplies, credit bank)
    #   movida      → moving_transport_paid   (debit 61300 Contractors, credit bank)
    #   otro / —    → manual_expense_paid     (debit 69000 Other Op. Expenses, credit bank)
    acct_txn_id = None
    try:
        from api.services.ledger import post_to_ledger

        concept = (order.get("concept") or "compra").lower()
        event_map = {
            "compra": ("property_purchase_paid", {}),
            "renovacion": ("renovation_paid", {"concept": "Pago a contratista"}),
            "movida": ("moving_transport_paid", {}),
            "otro": ("manual_expense_paid", {"concept": order.get("notes") or "Pago general"}),
        }
        event_type, extra_desc = event_map.get(concept, event_map["otro"])

        kwargs = dict(
            event_type=event_type,
            amount=float(order["amount"]),
            bank_account_id=req.bank_account_id,
            date=req.payment_date,
            counterparty_name=order["payee_name"],
            counterparty_type="vendor",
            entity_type="payment_order",
            entity_id=order_id,
            property_id=order.get("property_id"),
            description_data={
                "address": order.get("property_address") or "—",
                **extra_desc,
            },
            payment_method=order["method"],
            payment_reference=req.reference,
            notes=f"Orden de pago #{order_id[:8]}",
            status="confirmed",
            created_by=req.completed_by,
        )
        # manual_expense_paid needs an expense account code
        if event_type == "manual_expense_paid":
            kwargs["expense_account_code"] = "69000"  # Other Operating Expenses

        debit_id, credit_id = post_to_ledger(**kwargs)
        # The "bank leg" id is what existing reconciliation/UI code expects on
        # payment_orders.accounting_transaction_id. For outbound events the
        # bank leg is the credit side.
        acct_txn_id = credit_id
        logger.info(
            f"[payment_orders] post_to_ledger event={event_type} pair=({debit_id},{credit_id}) for order {order_id}"
        )
    except ValueError as e:
        # post_to_ledger raises ValueError for misuse — surface to caller
        # because most cases (missing bank, unmapped bank, missing chart code)
        # are operator errors, not transient failures.
        logger.error(f"[payment_orders] Cannot post ledger for order {order_id}: {e}")
        raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
    except Exception as e:
        logger.warning(f"[payment_orders] Could not create accounting pair: {e}")

    # Update order to completed
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

    result = sb.table("payment_orders").update(update).eq("id", order_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error updating payment order")

    # Update property status from pending_payment → purchased
    property_id = order.get("property_id")
    if property_id:
        try:
            sb.table("properties").update({"status": "purchased"}).eq("id", property_id).execute()
            logger.info(f"[payment_orders] Property {property_id} status → purchased")
        except Exception as e:
            logger.warning(f"[payment_orders] Could not update property status: {e}")

    logger.info(f"[payment_orders] Completed order {order_id}: ref={req.reference}")

    try:
        from api.services.notification_service import notify_payment_completed
        notify_payment_completed(
            order_id, property_id, order.get("amount", 0),
            method=req.method or "transferencia",
            payee_name=order.get("payee_name", ""),
            concept=order.get("notes", ""),
        )
    except Exception:
        pass

    return {
        "ok": True,
        "data": result.data[0],
        "message": f"Pago completado. Ref: {req.reference}",
    }


@router.patch("/{order_id}/cancel")
async def cancel_payment_order(order_id: str, cancelled_by: Optional[str] = None):
    """Cancel a pending payment order."""
    order_res = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")

    if order_res.data[0]["status"] != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden cancelar ordenes pendientes")

    now = datetime.utcnow().isoformat()
    result = sb.table("payment_orders").update({
        "status": "cancelled",
        "cancelled_by": cancelled_by,
        "cancelled_at": now,
    }).eq("id", order_id).execute()

    return {"ok": True, "data": result.data[0] if result.data else None, "message": "Orden cancelada"}
