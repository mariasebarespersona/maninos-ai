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


class PaymentOrderUpdate(BaseModel):
    amount: Optional[float] = None
    property_id: Optional[str] = None


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


@router.patch("/{order_id}")
async def update_payment_order(order_id: str, req: PaymentOrderUpdate):
    """
    Edit a pending payment order. Only amount and property_id are editable.
    Used by the Notificaciones "Por Aprobar" UI to correct values before
    approving — the updated amount/property flow downstream into the
    accounting transaction generated on approve (inbound) or complete (outbound).
    """
    order_res = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not order_res.data:
        raise HTTPException(status_code=404, detail="Orden de pago no encontrada")
    order = order_res.data[0]
    if order["status"] != "pending":
        raise HTTPException(status_code=400, detail="Solo se pueden editar órdenes pendientes")

    update = {k: v for k, v in req.model_dump().items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No hay campos para actualizar")

    if "property_id" in update:
        # property_code is not stored on payment_orders (the list endpoint
        # enriches it at read time from the properties table). Only refresh
        # the denormalized address snapshot.
        try:
            prop = sb.table("properties").select("address").eq("id", update["property_id"]).execute()
            if prop.data:
                update["property_address"] = prop.data[0].get("address")
        except Exception as e:
            logger.warning(f"[payment_orders] could not enrich property_address: {e}")

    try:
        sb.table("payment_orders").update(update).eq("id", order_id).execute()
    except Exception as e:
        logger.error(f"[payment_orders] Update failed for {order_id}: {e!r}")
        raise HTTPException(status_code=500, detail=f"Error al actualizar: {e}")

    # Re-read the row so we always return the current state (some PostgREST
    # setups don't echo updated rows back from .update().execute()).
    after = sb.table("payment_orders").select("*").eq("id", order_id).execute()
    if not after.data:
        raise HTTPException(status_code=404, detail="Orden no encontrada después de actualizar")
    logger.info(f"[payment_orders] Updated order {order_id}: {list(update.keys())}")
    return {"ok": True, "data": after.data[0]}


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

                # If this inbound payment closes out a contado sale, recognize
                # COGS now. We can't wait for /confirm-transfer because that
                # endpoint isn't used by the Notificaciones approval flow.
                try:
                    _maybe_recognize_cogs_for_sale(property_id, bank_account_id, approved_by)
                except Exception as cogs_err:
                    logger.warning(f"[payment_orders] COGS check failed: {cogs_err}")
            except ValueError as e:
                logger.error(f"[payment_orders] Cannot post inbound ledger for {order_id}: {e}")
                raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
            except Exception as e:
                logger.error(f"[payment_orders] inbound ledger post failed for {order_id}: {e!r}")
                raise HTTPException(status_code=500, detail=f"Ledger post failed: {type(e).__name__}: {e}")
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

        # Default unknown/empty concepts to "otro" rather than "compra" so
        # they don't masquerade as house purchases in the ledger.
        concept = (order.get("concept") or "otro").lower()
        event_map = {
            "compra": ("property_purchase_paid", {}),
            "renovacion": ("renovation_paid", {"concept": order.get("notes") or "Pago a contratista"}),
            "movida": ("moving_transport_paid", {}),
            "comision": ("commission_paid", {}),
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
            kwargs["expense_account_code"] = "Other Operating Expenses"

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
        logger.error(f"[payment_orders] Could not create accounting pair for {order_id}: {e!r}")
        raise HTTPException(status_code=500, detail=f"Ledger post failed: {type(e).__name__}: {e}")

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

    # If this payment landed against a property that's already been sold
    # (i.e. has prior COGS), sweep the new sub-account balance into COGS
    # so commissions paid post-sale don't leave the property's bucket
    # with leftover value. _maybe_recognize_cogs_for_sale handles the
    # has_prior_cogs path correctly now.
    if property_id and (order.get("concept") or "").lower() in ("comision", "renovacion", "movida", "compra"):
        try:
            _maybe_recognize_cogs_for_sale(property_id, req.bank_account_id, req.completed_by)
        except Exception as e:
            logger.warning(f"[payment_orders] post-complete COGS sweep failed: {e}")

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


# ---------------------------------------------------------------------------
# COGS helper (called from approve_payment_order on inbound payments)
# ---------------------------------------------------------------------------

def _maybe_recognize_cogs_for_sale(
    property_id: Optional[str],
    bank_account_id: Optional[str],
    approved_by: Optional[str],
) -> None:
    """
    Recognize Cost of Goods Sold for the most recent contado sale on
    `property_id`. Two scenarios trigger work here:

      1. Initial COGS at sale close — sale just became fully paid and we
         have not posted any COGS rows yet. Sweep every non-zero
         per-property inventory sub-account into COGS.
      2. Late-arriving costs — sale already closed in the past, but a
         capitalized cost (typically commission, sometimes a stragglers'
         renovation invoice) just landed in a sub-account. Sweep just
         that delta as additional COGS so the bucket returns to $0.

    Both scenarios use the same sweep logic; we only short-circuit when
    the sale truly is not yet closed (paid_total < sale_price) AND no
    COGS has ever been recognized.
    """
    if not property_id:
        return

    # COGS POLICY: property costs (purchase/renovation/moving/commission) are now
    # expensed to each house's per-house COGS bucket when PAID — not capitalized
    # to inventory and swept at sale. Recognizing COGS again here would
    # double-count, so sale-time COGS recognition is disabled.
    return

    sale = (
        sb.table("sales")
        .select("id, sale_price, sale_type, property_id, clients(name), properties(address, property_code, purchase_price)")
        .eq("property_id", property_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    ).data
    if not sale:
        return
    sale = sale[0]
    if (sale.get("sale_type") or "").lower() != "contado":
        return  # COGS for RTO is a different conversation

    has_prior_cogs = bool((
        sb.table("accounting_transactions")
        .select("id")
        .eq("entity_type", "sale")
        .eq("entity_id", sale["id"])
        .eq("transaction_type", "cogs")
        .limit(1)
        .execute()
    ).data)

    # If COGS has never been recognized for this sale we need the sale
    # to actually be paid in full first. Once it has been recognized
    # once, every subsequent call is a "late-arriving cost" sweep and
    # the paid_total check no longer applies.
    if not has_prior_cogs:
        in_orders = (
            sb.table("payment_orders")
            .select("amount, status")
            .eq("property_id", property_id)
            .eq("direction", "inbound")
            .execute()
        ).data or []
        paid_total = sum(float(o.get("amount") or 0) for o in in_orders
                         if (o.get("status") or "") in ("approved", "completed"))
        sale_price = float(sale.get("sale_price") or 0)
        if paid_total + 0.01 < sale_price:  # epsilon for float rounding
            return

    # Compute inventory cost = purchase_price + Σ renovations.total_cost
    # (only used as the legacy fallback when this property has no
    # per-property sub-accounts at all).
    prop = sale.get("properties") or {}
    purchase_price = float(prop.get("purchase_price") or 0)
    reno_total = 0.0
    try:
        reno_res = sb.table("renovations").select("total_cost").eq("property_id", property_id).execute()
        reno_total = sum(float(r.get("total_cost") or 0) for r in (reno_res.data or []))
    except Exception:
        pass
    inventory_cost = round(purchase_price + reno_total, 2)

    from api.services.ledger import post_to_ledger
    from datetime import date as date_type

    # Per-property inventory zero-out: if this house has the Compra/Reno/Movida
    # sub-accounts (created by _create_inventory_account_for_property), we
    # credit each one for its current capitalized balance so each house's
    # bucket returns to $0 after the sale and the matching COGS amount is the
    # ACTUAL cost that was posted to the ledger (not just an estimate from
    # purchase_price + reno quotes).
    #
    # Legacy fallback: if no sub-accounts exist (houses created before the
    # per-property routing landed), keep the old behavior — one COGS pair
    # against the parent Inventory for inventory_cost.
    prop_code = prop.get("property_code")
    sub_balances: list[tuple[str, str, float]] = []  # (sub_acct_id, label, balance)
    if prop_code:
        for sub_label in ("Compra", "Renovación", "Movida", "Comisión"):
            code = f"{sub_label} {prop_code}"
            try:
                acc = sb.table("accounting_accounts").select("id").eq("code", code).limit(1).execute()
                if not acc.data:
                    continue
                acc_id = acc.data[0]["id"]
                rows = (
                    sb.table("accounting_transactions")
                    .select("amount,is_income,status")
                    .eq("account_id", acc_id)
                    .execute()
                ).data or []
                bal = 0.0
                for r in rows:
                    if (r.get("status") or "") == "voided":
                        continue
                    a = float(r.get("amount") or 0)
                    bal += a if r.get("is_income") else -a
                # Inventory sub-accounts are assets: positive balance = money
                # currently capitalized in that bucket.
                if bal > 0.005:
                    sub_balances.append((acc_id, code, round(bal, 2)))
            except Exception as e:
                logger.warning(f"[payment_orders] could not read balance for '{code}': {e}")

    if sub_balances:
        total_posted = 0.0
        for acc_id, label, bal in sub_balances:
            post_to_ledger(
                event_type="sale_contado_cogs",
                amount=bal,
                date=date_type.today().isoformat(),
                counterparty_name=(sale.get("clients") or {}).get("name"),
                entity_type="sale",
                entity_id=sale["id"],
                property_id=property_id,
                description_data={"address": prop.get("address") or "—"},
                description_override=f"COGS venta {prop.get('address') or '—'} — {label}",
                credit_account_id_override=acc_id,
                status="confirmed",
                created_by=approved_by,
            )
            total_posted += bal
        logger.info(
            f"[payment_orders] COGS recognized for sale {sale['id']} via per-property sub-accounts: "
            f"{[(l, b) for (_, l, b) in sub_balances]} total=${total_posted:.2f} "
            f"(estimate was ${inventory_cost:.2f})"
        )
    elif not has_prior_cogs and inventory_cost > 0:
        # Legacy fallback path — single COGS pair against parent Inventory.
        # Only runs the FIRST time COGS is recognized for this sale (no
        # late-arriving sweep against the parent because that account isn't
        # per-property).
        post_to_ledger(
            event_type="sale_contado_cogs",
            amount=inventory_cost,
            date=date_type.today().isoformat(),
            counterparty_name=(sale.get("clients") or {}).get("name"),
            entity_type="sale",
            entity_id=sale["id"],
            property_id=property_id,
            description_data={"address": prop.get("address") or "—"},
            status="confirmed",
            created_by=approved_by,
        )
        logger.info(f"[payment_orders] COGS recognized for sale {sale['id']} cost=${inventory_cost} (legacy parent Inventory)")
