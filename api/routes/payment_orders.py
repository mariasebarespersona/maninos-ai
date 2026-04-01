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
    }
    if req.payee_id:
        data["payee_id"] = req.payee_id

    result = sb.table("payment_orders").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error creating payment order")

    order = result.data[0]
    logger.info(f"[payment_orders] Created order {order['id']} for ${req.amount:,.2f} to {req.payee_name}")

    # Create notification
    try:
        from api.services.notification_service import notify_payment_order_created
        notify_payment_order_created(order["id"], req.property_id, req.amount, req.payee_name, property_address=req.property_address or "")
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
    return {"ok": True, "data": result.data or []}


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
async def approve_payment_order(order_id: str, approved_by: Optional[str] = Query(None)):
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

    # Create accounting transaction for reconciliation
    acct_txn_id = None
    try:
        txn_data = {
            "transaction_number": _generate_transaction_number(),
            "transaction_date": req.payment_date,
            "transaction_type": "purchase_house",
            "amount": order["amount"],
            "is_income": False,
            "description": f"Compra propiedad: {order.get('property_address', 'N/A')} - Pago a {order['payee_name']}",
            "payment_method": order["method"],
            "payment_reference": req.reference,
            "counterparty_name": order["payee_name"],
            "counterparty_type": "vendor",
            "property_id": order.get("property_id"),
            "status": "confirmed",
            "notes": f"Orden de pago #{order_id[:8]}",
        }
        if req.bank_account_id:
            txn_data["bank_account_id"] = req.bank_account_id

        txn_data = {k: v for k, v in txn_data.items() if v is not None}
        txn_result = sb.table("accounting_transactions").insert(txn_data).execute()
        if txn_result.data:
            acct_txn_id = txn_result.data[0]["id"]
            logger.info(f"[payment_orders] Created accounting txn {acct_txn_id} for order {order_id}")
    except Exception as e:
        logger.warning(f"[payment_orders] Could not create accounting txn: {e}")

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
        notify_payment_completed(order_id, property_id, order.get("amount", 0), req.method or "transferencia")
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
