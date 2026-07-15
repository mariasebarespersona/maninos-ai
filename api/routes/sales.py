"""
Sales API Routes
Handles Paso 5: Cierre de Venta (Contado flow for MVP)
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from api.models.schemas import (
    SaleCreate,
    SaleComplete,
    SaleResponse,
    SaleStatus,
    SaleType,
    PropertyStatus,
    ClientStatus,
)
from api.services.property_service import PropertyService
from api.services.email_service import send_sale_completed_email, send_rto_completed_email, schedule_post_sale_emails
from api.services.document_service import auto_generate_sale_documents
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()

# "House Sales - COGS" header — where a sold house's cost is recognized.
_HOUSE_SALES_COGS_ID = "b16c83e6-0f1b-4bcc-917b-055c8d5d75de"


def _recognize_house_cogs(property_id: str, sale_id: str, ledger_date: str) -> float:
    """When a house SELLS, move its capitalized cost from Inventory (Balance
    Sheet) to COGS (P&L), so the cost matches the sale revenue in the period of
    the sale (matching principle). Transfers each concept balance
    (Compra/Renovación/Movida <CODE>) from its inventory asset account to the
    house's COGS account "COGS House <CODE>" (created on demand under
    "House Sales - COGS"), tagging each transfer with the concept for the P&L
    drill-down. Idempotent: it only moves whatever inventory balance currently
    remains, so re-running transfers $0."""
    from api.services.ledger import post_to_ledger
    prop = sb.table("properties").select("property_code").eq("id", property_id).single().execute().data
    code = (prop or {}).get("property_code") or ""
    if not code:
        return 0.0

    def _bal(account_id: str) -> float:
        rows = sb.table("accounting_transactions").select("amount,is_income") \
            .eq("account_id", account_id).neq("status", "voided").execute().data or []
        return sum((float(r["amount"]) if r["is_income"] else -float(r["amount"])) for r in rows)

    cogs = sb.table("accounting_accounts").select("id").eq("code", f"COGS House {code}").execute().data
    if cogs:
        cogs_id = cogs[0]["id"]
    else:
        cogs_id = sb.table("accounting_accounts").insert({
            "code": f"COGS House {code}", "name": f"COGS House {code}",
            "account_type": "Cost of Goods Sold", "category": "COGS",
            "parent_account_id": _HOUSE_SALES_COGS_ID, "is_header": False,
            "is_active": True, "display_order": 500,
            "description": f"property_id:{property_id}",
        }).execute().data[0]["id"]

    total = 0.0
    for concept in ("Compra", "Renovación", "Movida"):
        acc = sb.table("accounting_accounts").select("id").eq("code", f"{concept} {code}").execute().data
        if not acc:
            continue
        inv_id = acc[0]["id"]
        bal = round(_bal(inv_id), 2)
        if bal <= 0:
            continue
        post_to_ledger(
            event_type="sale_contado_cogs",
            amount=bal,
            date=ledger_date,
            property_id=property_id,
            entity_type="sale",
            entity_id=sale_id,
            debit_account_id_override=cogs_id,     # DR COGS House <CODE> (P&L)
            credit_account_id_override=inv_id,     # CR inventory concept (Balance Sheet)
            description_override=f"COGS {concept} {code} (inventario → costo de venta)",
            status="confirmed",
        )
        total += bal
    if total:
        logger.info(f"[sales] Recognized COGS ${total:,.2f} for sold house {code} (sale {sale_id})")
    return total


def _get_purchase_serial_label(property_id: str) -> dict:
    """Look up the purchase title_transfer for a property and return its
    serial/label/owner so we can propagate them to the sale transfer.
    Returns empty dict if no purchase transfer or no serial data."""
    try:
        purchase = sb.table("title_transfers") \
            .select("tdhca_serial, tdhca_label, tdhca_owner_name") \
            .eq("property_id", property_id) \
            .eq("transfer_type", "purchase") \
            .limit(1) \
            .execute()
        if purchase.data:
            p = purchase.data[0]
            out = {}
            if p.get("tdhca_serial"): out["tdhca_serial"] = p["tdhca_serial"]
            if p.get("tdhca_label"): out["tdhca_label"] = p["tdhca_label"]
            # Owner is the CURRENT tdhca owner from last monitoring check — copy
            # as starting point for the sale (will get re-monitored after sale).
            if p.get("tdhca_owner_name"): out["tdhca_owner_name"] = p["tdhca_owner_name"]
            return out
    except Exception as e:
        logger.warning(f"[sale-transfer] Failed to copy serial from purchase transfer: {e}")
    return {}


# ============================================================================
# SALES CRUD
# ============================================================================

@router.get("", response_model=list[SaleResponse])
async def list_sales(
    status: Optional[SaleStatus] = Query(None, description="Filter by status"),
    sale_type: Optional[SaleType] = Query(None, description="Filter by sale type"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """List all sales with optional filters."""
    query = sb.table("sales").select("*")
    
    if status:
        query = query.eq("status", status.value)
    
    if sale_type:
        query = query.eq("sale_type", sale_type.value)
    
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    if not result.data:
        return []
    
    # Get property and client info
    property_ids = list(set(s["property_id"] for s in result.data))
    client_ids = list(set(s["client_id"] for s in result.data))
    
    props = sb.table("properties").select("id, address").in_("id", property_ids).execute()
    clients = sb.table("clients").select("id, name").in_("id", client_ids).execute()
    
    props_map = {p["id"]: p["address"] for p in (props.data or [])}
    clients_map = {c["id"]: c["name"] for c in (clients.data or [])}
    
    return [
        _format_sale(s, props_map.get(s["property_id"]), clients_map.get(s["client_id"]))
        for s in result.data
    ]


# NOTE: This route MUST come BEFORE /{sale_id} to avoid being captured by the UUID pattern
@router.get("/stats/summary")
async def get_sales_summary():
    """Get summary statistics for sales dashboard."""
    all_sales = sb.table("sales").select("status, sale_price, sale_type, sold_before_renovation").execute()
    
    stats = {
        "total_sales": 0,
        "total_revenue": 0,
        "pending": 0,
        "paid": 0,
        "completed": 0,
        "cancelled": 0,
        "contado": 0,
        "rto": 0,
        "rto_approved": 0,
        "rto_pending": 0,
        "rto_active": 0,
        "sold_before_renovation": 0,
        "sold_after_renovation": 0,
    }
    
    for sale in (all_sales.data or []):
        status = sale["status"]
        stats["total_sales"] += 1
        stats[status] = stats.get(status, 0) + 1
        stats[sale["sale_type"]] = stats.get(sale["sale_type"], 0) + 1

        # Revenue is recognized when the sale is MADE (a house is sold the moment
        # the sale is recorded — even RTO with a pending balance). So count every
        # non-cancelled sale, not only 'completed'. Otherwise a fresh sale (and
        # any RTO, which sits in rto_pending/rto_active) never showed in the
        # "Ingresos Totales" summary until it was manually completed.
        if status != "cancelled":
            stats["total_revenue"] += float(sale.get("sale_price", 0) or 0)
            if sale.get("sold_before_renovation"):
                stats["sold_before_renovation"] += 1
            else:
                stats["sold_after_renovation"] += 1

    # "Pendientes" = active sales not yet completed — includes RTO in-progress
    # (rto_pending / rto_approved / rto_active), transfer_reported, paid, etc.
    stats["pending"] = stats["total_sales"] - stats.get("completed", 0) - stats.get("cancelled", 0)

    return stats


@router.get("/capital-payments")
async def get_capital_payments():
    """
    Get payments from Capital to Homes for RTO purchases.
    
    When Capital approves an RTO, it effectively purchases the house from Homes.
    This endpoint returns all such transactions visible to Homes employees.
    """
    # Get all RTO-approved sales
    rto_sales = sb.table("sales").select("*") \
        .eq("sale_type", "rto") \
        .in_("status", ["rto_approved", "rto_active", "completed"]) \
        .order("created_at", desc=True) \
        .execute()
    
    if not rto_sales.data:
        return {"payments": []}
    
    # Gather property/client info
    property_ids = list(set(s["property_id"] for s in rto_sales.data))
    client_ids = list(set(s["client_id"] for s in rto_sales.data))
    
    props = sb.table("properties").select("id, address, purchase_price").in_("id", property_ids).execute()
    clients = sb.table("clients").select("id, name").in_("id", client_ids).execute()
    
    props_map = {p["id"]: p for p in (props.data or [])}
    clients_map = {c["id"]: c["name"] for c in (clients.data or [])}
    
    # Check for RTO application approval dates
    rto_apps = sb.table("rto_applications").select("sale_id, status, updated_at") \
        .in_("sale_id", [s["id"] for s in rto_sales.data]) \
        .execute()
    rto_map = {a["sale_id"]: a for a in (rto_apps.data or [])}
    
    payments = []
    for sale in rto_sales.data:
        prop = props_map.get(sale["property_id"], {})
        rto_app = rto_map.get(sale["id"], {})
        
        # Capital pays Homes the purchase price of the property
        capital_amount = float(prop.get("purchase_price") or sale["sale_price"])
        
        payments.append({
            "sale_id": sale["id"],
            "property_address": prop.get("address", "Dirección desconocida"),
            "client_name": clients_map.get(sale["client_id"], "Cliente"),
            "amount": capital_amount,
            "sale_price": float(sale["sale_price"]),
            "status": "received" if sale["status"] in ("rto_active", "completed") else "pending",
            "rto_approved_at": rto_app.get("updated_at") if rto_app.get("status") in ("approved", "active") else None,
        })
    
    return {"payments": payments}


@router.get("/pending-transfers")
async def get_pending_transfers():
    """
    Get all pending contado transfers (status=transfer_reported).
    Used by the Notificaciones page for Abigail to confirm payments.
    """
    try:
        sales_result = sb.table("sales") \
            .select("*") \
            .eq("status", "transfer_reported") \
            .eq("sale_type", "contado") \
            .order("created_at", desc=True) \
            .execute()

        if not sales_result.data:
            return {"transfers": []}

        # Gather property and client IDs
        property_ids = list(set(s["property_id"] for s in sales_result.data))
        client_ids = list(set(s["client_id"] for s in sales_result.data))

        props = sb.table("properties") \
            .select("id, address, city, sale_price, photos") \
            .in_("id", property_ids) \
            .execute()
        clients = sb.table("clients") \
            .select("id, name, email, phone") \
            .in_("id", client_ids) \
            .execute()

        props_map = {p["id"]: p for p in (props.data or [])}
        clients_map = {c["id"]: c for c in (clients.data or [])}

        transfers = []
        for sale in sales_result.data:
            prop = props_map.get(sale["property_id"], {})
            client = clients_map.get(sale["client_id"], {})
            transfers.append({
                "sale_id": sale["id"],
                "sale_price": float(sale["sale_price"]),
                "reported_at": sale.get("client_reported_at") or sale["created_at"],
                "property_id": sale["property_id"],
                "property_address": prop.get("address"),
                "property_city": prop.get("city"),
                "client_id": sale["client_id"],
                "client_name": client.get("name"),
                "client_email": client.get("email"),
                "client_phone": client.get("phone"),
                "transfer_approved_by": sale.get("transfer_approved_by"),
                "transfer_approved_at": sale.get("transfer_approved_at"),
            })

        return {"ok": True, "transfers": transfers}

    except Exception as e:
        logger.error(f"Error fetching pending transfers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/confirmed-transfers")
async def get_confirmed_transfers():
    """Get recently completed contado transfers (confirmed by Abigail)."""
    try:
        # Get completed contado sales from last 90 days
        from datetime import timedelta
        cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()

        sales_result = sb.table("sales") \
            .select("*") \
            .eq("status", "completed") \
            .eq("sale_type", "contado") \
            .gte("completed_at", cutoff) \
            .order("completed_at", desc=True) \
            .execute()

        if not sales_result.data:
            return {"ok": True, "transfers": []}

        property_ids = list(set(s["property_id"] for s in sales_result.data))
        client_ids = list(set(s["client_id"] for s in sales_result.data))

        props = sb.table("properties").select("id, address, city").in_("id", property_ids).execute()
        clients = sb.table("clients").select("id, name, email").in_("id", client_ids).execute()

        props_map = {p["id"]: p for p in (props.data or [])}
        clients_map = {c["id"]: c for c in (clients.data or [])}

        transfers = []
        for s in sales_result.data:
            p = props_map.get(s["property_id"], {})
            c = clients_map.get(s["client_id"], {})
            transfers.append({
                "sale_id": s["id"],
                "sale_price": float(s["sale_price"]),
                "completed_at": s.get("completed_at"),
                "payment_method": s.get("payment_method"),
                "property_address": p.get("address", "N/A"),
                "property_city": p.get("city"),
                "client_name": c.get("name", "N/A"),
                "client_email": c.get("email"),
            })

        return {"ok": True, "transfers": transfers}
    except Exception as e:
        logger.error(f"Error fetching confirmed transfers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# COMMISSION PAYMENTS (must be before /{sale_id} to avoid route conflict)
# ============================================================================

@router.get("/commission-payments")
async def list_commission_payments(
    month: Optional[int] = Query(None),
    year: Optional[int] = Query(None),
    employee_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """List commission payments with optional filters by month/year, employee, status."""
    from datetime import date

    query = sb.table("commission_payments").select("*")

    if status:
        query = query.eq("status", status)
    if employee_id:
        query = query.eq("employee_id", employee_id)

    if month or year:
        today = date.today()
        m = month or today.month
        y = year or today.year
        start = f"{y}-{m:02d}-01"
        end = f"{y}-{m + 1:02d}-01" if m < 12 else f"{y + 1}-01-01"
        query = query.gte("created_at", start).lt("created_at", end)

    query = query.order("created_at", desc=True)
    result = query.execute()

    payments = result.data or []

    # Resolve the recipient name. Ad-hoc (non-employee) rows carry payee_name and
    # have no employee_id; employee rows resolve their name from users.
    for p in payments:
        if p.get("payee_name") and not p.get("employee_id"):
            p["employee_name"] = p["payee_name"]
            p["employee_email"] = ""
            p["employee_role"] = "externo"
        else:
            try:
                emp = sb.table("users").select("name, email, role").eq("id", p["employee_id"]).single().execute()
                p["employee_name"] = emp.data["name"] if emp.data else "Desconocido"
                p["employee_email"] = emp.data.get("email", "") if emp.data else ""
                p["employee_role"] = emp.data.get("role", "") if emp.data else ""
            except Exception:
                p["employee_name"] = "Desconocido"
                p["employee_email"] = ""
                p["employee_role"] = ""

        try:
            sale = sb.table("sales").select("sale_type, sale_price, created_at, property_id").eq("id", p["sale_id"]).single().execute()
            if sale.data:
                p["sale_type"] = sale.data.get("sale_type", "")
                p["sale_price"] = sale.data.get("sale_price", 0)
                p["sale_created_at"] = sale.data.get("created_at", "")
                try:
                    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
                    p["property_address"] = prop.data["address"] if prop.data else ""
                except Exception:
                    p["property_address"] = ""
            else:
                p["sale_type"] = ""
                p["sale_price"] = 0
                p["sale_created_at"] = ""
                p["property_address"] = ""
        except Exception:
            p["sale_type"] = ""
            p["sale_price"] = 0
            p["sale_created_at"] = ""
            p["property_address"] = ""

    return {"ok": True, "payments": payments}


@router.patch("/commission-payments/{payment_id}/pay")
async def mark_commission_paid(
    payment_id: str,
    paid_by: str = Query(..., description="User ID of who is marking as paid"),
    bank_account_id: Optional[str] = Query(None, description="Bank account that paid the commission"),
):
    """Mark a commission payment as paid. Posts a debit-60640/credit-bank pair."""
    from datetime import date

    payment = sb.table("commission_payments").select("*").eq("id", payment_id).single().execute()
    if not payment.data:
        raise HTTPException(status_code=404, detail="Pago de comisión no encontrado")

    if payment.data["status"] == "paid":
        raise HTTPException(status_code=400, detail="Esta comisión ya fue pagada")

    emp_name = _resolve_employee_name(payment.data.get("employee_id")) or payment.data.get("payee_name") or "Comisionista"

    sale = sb.table("sales").select("sale_type, property_id, properties(address)").eq("id", payment.data["sale_id"]).single().execute()
    sale_type = sale.data.get("sale_type", "") if sale.data else ""
    prop_address = ""
    property_id = None
    if sale.data:
        property_id = sale.data.get("property_id")
        if sale.data.get("properties"):
            prop_address = sale.data["properties"].get("address", "")

    # Find the commission's payable INVOICE (root model). Paying the commission
    # SETTLES that invoice (invoice_paid_out: A/P→bank) — the accrual was posted
    # at sale time when the invoice was issued. This avoids the old double-post
    # (mark_commission_paid AND completing a comision payment_order both posted
    # commission_paid). Legacy commissions with no invoice fall back to the
    # direct commission_paid post.
    inv_row = None
    try:
        if payment.data.get("invoice_id"):
            r = sb.table("accounting_invoices").select("*").eq("id", payment.data["invoice_id"]).execute()
            inv_row = r.data[0] if r.data else None
        if not inv_row:
            r = (sb.table("accounting_invoices").select("*")
                 .eq("direction", "payable").ilike("notes", f"%[COMM:{payment_id}]%")
                 .neq("status", "voided").limit(1).execute())
            inv_row = r.data[0] if r.data else None
    except Exception as e:
        logger.warning(f"[commissions] invoice lookup failed for {payment_id}: {e}")

    accounting_txn_id = None
    if not bank_account_id:
        logger.warning(
            f"[commissions] mark_commission_paid for {payment_id} without bank_account_id — no ledger pair written."
        )
    elif inv_row:
        from api.routes.accounting import record_invoice_payment
        res = record_invoice_payment(
            inv_row["id"], float(payment.data["amount"]),
            bank_account_id=bank_account_id,
            payment_method="transferencia",
            notes=f"Pago de comisión — {emp_name}",
            cap_to_balance=True,
        )
        pay = res.get("payment") or {}
        accounting_txn_id = pay.get("transaction_id")
    else:
        # Legacy fallback: no invoice → post the expense directly (old behavior).
        try:
            from api.services.ledger import post_to_ledger
            debit_id, credit_id = post_to_ledger(
                event_type="commission_paid",
                amount=float(payment.data["amount"]),
                bank_account_id=bank_account_id,
                date=date.today().isoformat(),
                counterparty_name=emp_name,
                counterparty_type="employee",
                entity_type="sale",
                entity_id=payment.data["sale_id"],
                property_id=property_id,
                description_data={
                    "address": prop_address or "—",
                    "counterparty": f"{emp_name} ({payment.data.get('role','')})",
                },
                status="confirmed",
                created_by=paid_by,
            )
            accounting_txn_id = credit_id
        except ValueError as e:
            logger.error(f"[commissions] Cannot post commission ledger: {e}")
            raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
        except Exception as e:
            logger.error(f"[commissions] Failed to post commission ledger: {e}")

    now = datetime.utcnow().isoformat()
    update = {
        "status": "paid",
        "paid_at": now,
        "paid_by": paid_by,
    }
    if accounting_txn_id:
        update["accounting_transaction_id"] = accounting_txn_id

    result = sb.table("commission_payments").update(update).eq("id", payment_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Error al actualizar pago")

    return {"ok": True, "payment": result.data[0], "accounting_transaction_id": accounting_txn_id}


# ============================================================================
# SALE PAYMENTS (must be before /{sale_id} to avoid route conflict)
# ============================================================================

@router.get("/{sale_id}/payments")
async def list_sale_payments(sale_id: str):
    """List all payments for a sale."""
    # Verify sale exists
    sale = sb.table("sales").select("id").eq("id", sale_id).execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")

    result = sb.table("sale_payments") \
        .select("*") \
        .eq("sale_id", sale_id) \
        .order("created_at", desc=False) \
        .execute()

    return {"ok": True, "payments": result.data or []}


@router.post("/{sale_id}/payments")
async def register_sale_payment(sale_id: str, data: dict):
    """
    Register a payment on a sale (manual by staff).
    Staff payments are auto-confirmed. Client payments stay pending.
    Triggers notification for Abi.
    """
    from api.models.schemas import SalePaymentCreate
    payment_data = SalePaymentCreate(**data)

    # Verify sale exists and get info
    sale = sb.table("sales").select("*, properties(address, id), clients(name)") \
        .eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")

    reported_by = data.get("reported_by", "staff")
    is_staff = reported_by == "staff"

    insert = {
        "sale_id": sale_id,
        "payment_type": payment_data.payment_type,
        "amount": float(payment_data.amount),
        "payment_method": payment_data.payment_method,
        "payment_reference": payment_data.payment_reference,
        "payment_date": payment_data.payment_date or datetime.utcnow().strftime("%Y-%m-%d"),
        "notes": payment_data.notes,
        "status": "confirmed" if is_staff else "pending",
        "reported_by": reported_by,
    }
    if is_staff:
        insert["confirmed_by"] = "staff"
        insert["confirmed_at"] = datetime.utcnow().isoformat()

    result = sb.table("sale_payments").insert(insert).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to register payment")

    # Once the cumulative confirmed payments cover the sale_price, promote
    # the sale from "pending" to "paid". Earlier code only flipped the
    # PROPERTY to sold and left sale.status untouched, which is why a fully
    # paid sale kept showing "pendiente" in the UI.
    try:
        sale_price = float(sale.data.get("sale_price") or 0)
        if sale_price > 0:
            paid_rows = (
                sb.table("sale_payments")
                .select("amount,status,payment_type")
                .eq("sale_id", sale_id)
                .execute()
            ).data or []
            total_confirmed = sum(
                float(p.get("amount") or 0)
                for p in paid_rows
                if (p.get("status") or "") == "confirmed"
            )
            if total_confirmed + 0.01 >= sale_price and sale.data.get("status") == "pending":
                sb.table("sales").update({"status": "paid"}).eq("id", sale_id).execute()
                logger.info(
                    f"[sales] Sale {sale_id} status → paid (confirmed ${total_confirmed:.2f} ≥ price ${sale_price:.2f})"
                )
    except Exception as e:
        logger.warning(f"[sales] Could not auto-promote sale status: {e}")

    # Mark property as sold when a payment is received (down_payment or full)
    if is_staff and payment_data.payment_type in ("down_payment", "full"):
        try:
            property_id = sale.data.get("property_id")
            if property_id:
                sb.table("properties").update({
                    "status": "sold",
                }).eq("id", property_id).execute()
                logger.info(f"[sales] Property {property_id} marked SOLD after {payment_data.payment_type} payment on sale {sale_id}")
        except Exception as e:
            logger.warning(f"[sales] Could not update property status to sold: {e}")

    # Create payment_order so it flows through Notificaciones tabs
    # (Por Aprobar → Aprobadas → Recibidos → Contabilidad)
    try:
        client_name = sale.data.get("clients", {}).get("name", "")
        property_id = sale.data.get("property_id")
        prop_data = sale.data.get("properties") or {}
        prop_address = prop_data.get("address", "")
        sale_price = float(sale.data.get("sale_price", 0))
        amount_paid_so_far = float(sale.data.get("amount_paid", 0))
        total_paid = amount_paid_so_far + float(payment_data.amount)
        pending = max(0, sale_price - total_paid)

        type_labels = {"down_payment": "Enganche", "remaining": "Saldo restante", "full": "Pago total", "partial": "Pago parcial", "adjustment": "Ajuste"}
        label = type_labels.get(payment_data.payment_type, "Pago")
        method = payment_data.payment_method or "transferencia"
        source = "cliente" if reported_by == "client" else "empleado"

        order_data = {
            "property_id": property_id,
            "property_address": prop_address,
            "payee_name": f"Pago de {client_name or 'cliente'}",
            "amount": float(payment_data.amount),
            "method": method,
            "status": "pending",
            "concept": "pago_venta",
            "direction": "inbound",
            "notes": (
                f"{label}: ${float(payment_data.amount):,.0f} de {client_name or 'cliente'} ({method}). "
                f"Propiedad: {prop_address}. "
                f"Registrado por {source}. "
                f"Progreso: ${total_paid:,.0f} de ${sale_price:,.0f} pagado, falta ${pending:,.0f}."
                f"{' Ref: ' + payment_data.payment_reference if payment_data.payment_reference else ''}"
            ),
            "created_by": f"sistema_ventas_{reported_by}",
        }
        po_result = sb.table("payment_orders").insert(order_data).execute()

        if po_result.data:
            from api.services.notification_service import notify_payment_order_created
            notify_payment_order_created(
                po_result.data[0]["id"], property_id, float(payment_data.amount),
                f"Pago de {client_name}", property_address=prop_address,
                concept=f"{label} ({method}): ${float(payment_data.amount):,.0f} de {client_name}. Progreso: ${total_paid:,.0f}/${sale_price:,.0f}",
            )
        logger.info(f"[sales] Payment order created for sale payment: ${payment_data.amount}")
    except Exception as e:
        logger.warning(f"[sales] Payment order creation error: {e}")

    return {"ok": True, "payment": result.data[0]}


@router.patch("/{sale_id}/payments/{payment_id}")
async def edit_sale_payment(sale_id: str, payment_id: str, data: dict):
    """
    Edit an existing sale payment (amount, method, notes, status).
    Triggers notification if amount changes.
    """
    from api.models.schemas import SalePaymentUpdate
    update_data = SalePaymentUpdate(**data)

    # Get existing payment
    existing = sb.table("sale_payments").select("*") \
        .eq("id", payment_id).eq("sale_id", sale_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Payment not found")

    old_amount = float(existing.data["amount"])

    # Build update dict (only provided fields)
    update = {}
    if update_data.amount is not None:
        update["amount"] = float(update_data.amount)
    if update_data.payment_method is not None:
        update["payment_method"] = update_data.payment_method
    if update_data.payment_reference is not None:
        update["payment_reference"] = update_data.payment_reference
    if update_data.notes is not None:
        update["notes"] = update_data.notes
    if update_data.status is not None:
        update["status"] = update_data.status
        if update_data.status == "confirmed" and not existing.data.get("confirmed_at"):
            update["confirmed_at"] = datetime.utcnow().isoformat()
            update["confirmed_by"] = "staff"

    if not update:
        return {"ok": True, "payment": existing.data}

    result = sb.table("sale_payments").update(update) \
        .eq("id", payment_id).execute()

    # Notification if amount changed
    if update_data.amount is not None and float(update_data.amount) != old_amount:
        try:
            from api.services.notification_service import notify_sale_payment_edited
            sale = sb.table("sales").select("property_id, clients(name)") \
                .eq("id", sale_id).single().execute()
            notify_sale_payment_edited(
                sale_id=sale_id,
                property_id=sale.data.get("property_id") if sale.data else None,
                old_amount=old_amount,
                new_amount=float(update_data.amount),
                client_name=sale.data.get("clients", {}).get("name", "") if sale.data else "",
            )
        except Exception as e:
            logger.warning(f"[sales] Payment edit notification error: {e}")

    return {"ok": True, "payment": result.data[0] if result.data else existing.data}


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: str):
    """Get a single sale by ID."""
    result = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Get property and client info
    prop = sb.table("properties").select("address").eq("id", result.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", result.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data,
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("", response_model=SaleResponse)
async def create_sale(data: SaleCreate):
    """
    Create a new sale (Paso 5: Cierre de Venta).
    
    This initiates the sale process:
    1. Validates property is in 'published' status
    2. Creates sale record with 'pending' status
    3. Updates client status to 'active'
    4. If RTO: creates rto_applications record in Capital
    
    Note: Property status is NOT changed until sale is completed.
    """
    from postgrest.exceptions import APIError as PGError
    
    # Validate property exists and is available for sale
    try:
        property_result = sb.table("properties").select("*").eq("id", data.property_id).single().execute()
    except PGError:
        raise HTTPException(status_code=404, detail="Property not found")
    
    prop = property_result.data
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    
    # Normally a house must be published (or already reserved) to sell. But a
    # CONSIGNMENT house can be sold before the previous owner is paid — that's the
    # whole point of consignment (buy without paying, sell, then pay the owner).
    # So allow selling a consignment house from any not-yet-sold status.
    sellable = {PropertyStatus.PUBLISHED.value, PropertyStatus.RESERVED.value}
    if prop.get("is_consignment"):
        sellable |= {
            PropertyStatus.PURCHASED.value,
            PropertyStatus.RENOVATING.value,
            PropertyStatus.PENDING_PAYMENT.value,
        }
    if prop["status"] not in sellable:
        raise HTTPException(
            status_code=400,
            detail=f"Property must be published to sell (current status: {prop['status']})"
        )
    
    # Validate client exists
    try:
        client_result = sb.table("clients").select("*").eq("id", data.client_id).single().execute()
    except PGError:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client_result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if property already has pending sale
    existing_sale = sb.table("sales").select("id").eq(
        "property_id", data.property_id
    ).in_("status", ["pending", "paid"]).execute()
    
    if existing_sale.data:
        raise HTTPException(
            status_code=400,
            detail="Property already has a pending or paid sale"
        )
    
    # Determine if selling before renovation
    sold_before_renovation = PropertyService.is_sold_before_renovation(
        prop.get("is_renovated", False),
        PropertyStatus.SOLD,
    )
    
    # Commission: the seller (Gabriel) DECIDES it. The rule is only a default
    # the UI prefills; if the request carries explicit commission values we use
    # them verbatim (including 0 to waive it). Only fall back to the rule when
    # nothing was provided.
    from api.utils.commissions import calculate_commission
    if data.commission_amount is not None or data.commission_found_by is not None or data.commission_sold_by is not None:
        found_amt = float(data.commission_found_by or 0)
        sold_amt = float(data.commission_sold_by or 0)
        total_amt = float(data.commission_amount) if data.commission_amount is not None else (found_amt + sold_amt)
        commission = {
            "commission_amount": total_amt,
            "commission_found_by": found_amt,
            "commission_sold_by": sold_amt,
        }
    else:
        commission = calculate_commission(
            sale_type=data.sale_type.value,
            found_by_employee_id=data.found_by_employee_id,
            sold_by_employee_id=data.sold_by_employee_id,
        )

    # HARD RULE: a commission requires an ASSIGNED person. No one → no
    # commission, ever (no auto-amount, no phantom). "Assigned" now means an
    # EMPLOYEE **or** an ad-hoc free-text name (external person, no account).
    found_name = (data.found_by_name or "").strip()
    sold_name = (data.sold_by_name or "").strip()
    found_present = bool(data.found_by_employee_id or found_name)
    sold_present = bool(data.sold_by_employee_id or sold_name)
    if not found_present:
        commission["commission_found_by"] = 0.0
    if not sold_present:
        commission["commission_sold_by"] = 0.0
    if not found_present and not sold_present:
        commission["commission_amount"] = 0.0
    else:
        commission["commission_amount"] = float(commission.get("commission_found_by") or 0) + float(commission.get("commission_sold_by") or 0)
    
    # Create sale
    sale_price = float(data.sale_price)
    status = SaleStatus.PENDING.value
    insert_data = {
        "property_id": data.property_id,
        "client_id": data.client_id,
        "sale_type": data.sale_type.value,
        "sale_price": sale_price,
        "sold_before_renovation": sold_before_renovation,
        # Commission fields
        "found_by_employee_id": data.found_by_employee_id,
        "sold_by_employee_id": data.sold_by_employee_id,
        "commission_amount": float(commission["commission_amount"]),
        "commission_found_by": float(commission["commission_found_by"]),
        "commission_sold_by": float(commission["commission_sold_by"]),
    }
    # Ad-hoc recipient names — only add the column when there's an ad-hoc name
    # (so employee/unassigned sales don't reference the column and keep working
    # even if migration 101 hasn't been applied yet).
    if found_name and not data.found_by_employee_id:
        insert_data["found_by_name"] = found_name
    if sold_name and not data.sold_by_employee_id:
        insert_data["sold_by_name"] = sold_name

    # RTO/financed sale: set status + financial split
    if data.sale_type == SaleType.RTO:
        status = SaleStatus.RTO_PENDING.value
        down_payment = float(data.rto_down_payment or data.initial_payment_amount or 0)
        insert_data["rto_monthly_payment"] = float(data.rto_monthly_payment or 0)
        insert_data["rto_term_months"] = data.rto_term_months
        insert_data["rto_down_payment"] = down_payment
        insert_data["financed_down_payment"] = down_payment
        insert_data["financed_remaining"] = round(sale_price - down_payment, 2)
        insert_data["capital_payment_status"] = "pending"

    insert_data["status"] = status
    
    result = sb.table("sales").insert(insert_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create sale")
    
    sale_record = result.data[0]
    
    # Reserve the property — removes it from the public catalog immediately.
    # Reserve from ANY pre-sale status (published, or a consignment house being
    # sold directly from 'purchased'/'renovating'/'pending_payment'), never
    # touching an already reserved/sold house.
    if prop["status"] not in (PropertyStatus.RESERVED.value, PropertyStatus.SOLD.value):
        sb.table("properties").update({
            "status": PropertyStatus.RESERVED.value,
        }).eq("id", data.property_id).execute()
        logger.info(f"[sales] Property {data.property_id} reserved (sale {sale_record['id']})")
    
    # Update client status
    new_client_status = ClientStatus.ACTIVE.value
    if data.sale_type == SaleType.RTO:
        new_client_status = ClientStatus.RTO_APPLICANT.value
    
    sb.table("clients").update({
        "status": new_client_status
    }).eq("id", data.client_id).execute()
    
    # If RTO sale, automatically create an RTO application in Capital
    if data.sale_type == SaleType.RTO:
        try:
            down_payment = float(data.rto_down_payment or data.initial_payment_amount or 0)
            rto_app_data = {
                "sale_id": sale_record["id"],
                "client_id": data.client_id,
                "property_id": data.property_id,
                "status": "submitted",
                "monthly_income": float(client_result.data.get("monthly_income", 0)) if client_result.data.get("monthly_income") else None,
                "desired_down_payment": down_payment,
                "desired_term_months": data.rto_term_months,
            }
            sb.table("rto_applications").insert(rto_app_data).execute()
            logger.info(f"[sales] RTO application created for sale {sale_record['id']}")

            # ROOT MODEL: an RTO (financed) sale creates a real accounts-
            # RECEIVABLE invoice to Maninos Capital for the financed remainder
            # (posts A/R ← House Sales ONCE, at issuance). When Capital pays
            # Homes (the inbound pago_capital order), that payment SETTLES this
            # invoice (bank ← A/R) instead of re-recognizing the sale income.
            # This replaces the ad-hoc sales.amount_pending AR line and makes the
            # Capital debt a first-class, (partially) collectible invoice.
            try:
                financed_remaining = round(sale_price - down_payment, 2)
                if financed_remaining > 0:
                    from api.routes.accounting import issue_invoice
                    prop_addr = prop.get("address", "Propiedad")
                    inv = issue_invoice(
                        direction="receivable",
                        counterparty_name="Maninos Capital LLC",
                        counterparty_type="capital",
                        total_amount=financed_remaining,
                        account_code="House Sales - RTO",  # financed sale income → Ventas RTO
                        property_id=data.property_id,
                        sale_id=sale_record["id"],
                        description=f"Financiamiento RTO por cobrar a Maninos Capital — {prop_addr}",
                        notes=f"[CAPFIN:{sale_record['id']}] Parte financiada de la venta RTO que Capital paga a Homes.",
                    )
                    logger.info(f"[sales] Capital AR invoice {inv.get('invoice_number')} created for sale {sale_record['id']}: ${financed_remaining:,.2f}")
            except Exception as inv_err:
                logger.warning(f"[sales] Could not create Capital AR invoice: {inv_err}")

            # Notify Capital about the pending financed sale
            try:
                remaining = round(float(data.sale_price) - down_payment, 2)
                client_name = client_result.data.get("name", "Cliente")
                prop_addr = prop.get("address", "Propiedad")
                sb.table("notifications").insert({
                    "type": "financed_sale",
                    "title": f"Venta Financiada: ${float(data.sale_price):,.0f} — {prop_addr}",
                    "message": (
                        f"Nueva venta financiada registrada por Homes.\n"
                        f"Cliente: {client_name}\n"
                        f"Precio: ${float(data.sale_price):,.0f}\n"
                        f"Enganche: ${down_payment:,.0f} (Homes)\n"
                        f"Restante: ${remaining:,.0f} (Capital debe pagar a Homes)\n"
                        f"Mensualidad: ${float(data.rto_monthly_payment or 0):,.0f}\n"
                        f"Plazo: {data.rto_term_months or '—'} meses"
                    ),
                    "category": "both",
                    "priority": "urgent",
                    "action_required": True,
                    "property_id": data.property_id,
                    "related_entity_type": "sale",
                    "related_entity_id": sale_record["id"],
                    "amount": float(data.sale_price),
                }).execute()
                logger.info(f"[sales] Capital notification created for financed sale {sale_record['id']}")
            except Exception as notif_err:
                logger.warning(f"[sales] Could not create Capital notification: {notif_err}")

            # Create payment_order for enganche (appears in "Por Aprobar" like commissions)
            if down_payment > 0:
                try:
                    prop_code = prop.get("property_code", "")
                    code_str = f" ({prop_code})" if prop_code else ""
                    order_data = {
                        "property_id": data.property_id,
                        "property_address": prop_addr,
                        "payee_name": f"Enganche de {client_name}",
                        "amount": down_payment,
                        "method": "transferencia",
                        "status": "pending",
                        "concept": "enganche",
                        "direction": "inbound",
                        "notes": (
                            f"Enganche venta financiada: ${down_payment:,.0f} de {client_name}. "
                            f"Propiedad: {prop_addr}{code_str}. "
                            f"Precio venta: ${float(data.sale_price):,.0f}. "
                            f"Restante: ${remaining:,.0f} (Capital pagará a Homes)."
                        ),
                        "created_by": "sistema_ventas",
                    }
                    po_result = sb.table("payment_orders").insert(order_data).execute()
                    if po_result.data:
                        from api.services.notification_service import notify_payment_order_created
                        notify_payment_order_created(
                            po_result.data[0]["id"], data.property_id, down_payment,
                            f"Enganche de {client_name}",
                            property_address=prop_addr,
                            concept=f"Enganche RTO: ${down_payment:,.0f} de {client_name}. {prop_addr}{code_str}",
                        )
                    logger.info(f"[sales] Enganche payment_order created: ${down_payment:,.0f}")
                except Exception as po_err:
                    logger.warning(f"[sales] Could not create enganche payment_order: {po_err}")

                # Also create notification
                try:
                    sb.table("notifications").insert({
                        "type": "down_payment_received",
                        "title": f"Enganche recibido: ${down_payment:,.0f} — {prop_addr}",
                        "message": (
                            f"Cliente {client_name} pagó enganche de ${down_payment:,.0f} por {prop_addr}.\n"
                            f"Venta financiada — pendiente de aprobación por Capital.\n"
                            f"Restante: ${remaining:,.0f} (Capital pagará a Homes al aprobar)."
                        ),
                        "category": "homes",
                        "priority": "normal",
                        "property_id": data.property_id,
                        "related_entity_type": "sale",
                        "related_entity_id": sale_record["id"],
                        "amount": down_payment,
                    }).execute()
                except Exception:
                    pass

                # NOTE: the enganche income is posted ONCE — by the 'enganche'
                # inbound payment_order above, when Treasury approves it with a
                # receiving bank (event sale_down_payment_received: bank + income
                # pair). We must NOT ALSO insert a direct 'deposit_received' row
                # here — that double-counted the enganche in Homes' P&L (income
                # 2×, bank 1×). Per the RTO money model: enganche → Homes once;
                # the financed remainder is recorded via Capital's pago_capital.

        except Exception as e:
            logger.error(f"[sales] Failed to create RTO application: {e}")
            # Don't fail the sale - the application can be created manually
    
    # Auto-generate commission_payments rows
    _create_commission_payments(sale_record)

    # COGS recognition (policy confirmed with Abby): a house is SOLD the moment
    # the sale is recorded, even if part of the price is still owed. For an
    # RTO/financed sale the revenue is already recognized here at creation (the
    # financed A/R invoice to Capital above + the enganche), so we recognize its
    # full cost (Inventory → COGS) NOW too, keeping revenue and cost in the same
    # period (matching principle). This moves Compra/Renovación/Movida <CODE>
    # out of Inventory (Balance Sheet) into COGS House <CODE> (P&L); the seller
    # commission is already booked to its own COGS account. Idempotent, so the
    # later completion step (confirm-transfer) sweeps $0 — no double count.
    # Contado sales recognize COGS when paid (see the payment flow), which is
    # where their revenue posts.
    if data.sale_type == SaleType.RTO:
        try:
            _recognize_house_cogs(data.property_id, sale_record["id"],
                                  datetime.utcnow().date().isoformat())
        except Exception as cogs_err:
            logger.warning(f"[sales] Could not recognize COGS at RTO sale creation: {cogs_err}")

    # Register initial payment if provided
    if data.initial_payment_amount and float(data.initial_payment_amount) > 0:
        try:
            ptype = data.initial_payment_type or "down_payment"
            if float(data.initial_payment_amount) >= float(data.sale_price):
                ptype = "full"
            sb.table("sale_payments").insert({
                "sale_id": sale_record["id"],
                "payment_type": ptype,
                "amount": float(data.initial_payment_amount),
                "payment_method": data.initial_payment_method,
                "payment_date": datetime.utcnow().strftime("%Y-%m-%d"),
                "status": "confirmed",
                "reported_by": "staff",
                "confirmed_by": "staff",
                "confirmed_at": datetime.utcnow().isoformat(),
            }).execute()
            logger.info(f"[sales] Initial payment of ${data.initial_payment_amount} registered for sale {sale_record['id']}")
        except Exception as e:
            logger.warning(f"[sales] Failed to register initial payment: {e}")

    # NOTE: No notification on sale creation. Notifications trigger when PAYMENTS
    # are registered (notify_sale_payment). Commissions are visible in Resumen Financiero.
    logger.info(f"[sales] Sale {sale_record['id']} created (no notification — payments will trigger notifications)")

    return _format_sale(
        sale_record,
        prop["address"],
        client_result.data["name"],
    )


@router.post("/{sale_id}/pay", response_model=SaleResponse)
async def mark_sale_paid(sale_id: str, data: SaleComplete):
    """
    Mark a sale as paid.
    
    For Contado flow: Records payment method and reference.
    Transition: pending -> paid
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] != SaleStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Sale is not pending (current status: {sale.data['status']})"
        )
    
    # Update sale
    update_data = {
        "status": SaleStatus.PAID.value,
        "payment_method": data.payment_method,
        "payment_reference": data.payment_reference,
    }
    
    result = sb.table("sales").update(update_data).eq("id", sale_id).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", sale.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("/{sale_id}/approve-transfer")
async def approve_transfer(sale_id: str, approved_by: Optional[str] = Query(None)):
    """
    Approve a reported transfer (Sebastian/admin).
    Records approval so Treasury can then confirm the payment.
    """
    sale_result = sb.table("sales").select("id, status").eq("id", sale_id).single().execute()
    if not sale_result.data:
        raise HTTPException(status_code=404, detail="Venta no encontrada")

    if sale_result.data["status"] != "transfer_reported":
        raise HTTPException(status_code=400, detail=f"Estado actual: {sale_result.data['status']}")

    now = datetime.utcnow().isoformat()
    sb.table("sales").update({
        "transfer_approved_by": approved_by,
        "transfer_approved_at": now,
    }).eq("id", sale_id).execute()

    logger.info(f"[sales] Transfer approved for sale {sale_id} by {approved_by}")
    return {"ok": True, "message": "Transferencia aprobada. Tesorería puede confirmar el pago."}


class ConfirmTransferBody(BaseModel):
    bank_account_id: Optional[str] = None
    payment_reference: Optional[str] = None
    payment_date: Optional[str] = None


@router.post("/{sale_id}/confirm-transfer")
async def confirm_transfer(sale_id: str, body: Optional[ConfirmTransferBody] = None):
    """
    Confirm a bank transfer for a contado sale.
    Abigail confirms payment received → sale goes to paid, docs generated, email sent.

    Transition: transfer_reported -> paid

    Optional body fields:
      bank_account_id   — required for the accounting pair to be written.
      payment_reference — bank confirmation/wire reference.
      payment_date      — overrides "today" for the ledger entries.
    """
    body = body or ConfirmTransferBody()
    try:
        # 1. Verify sale exists and is in transfer_reported status
        sale_result = sb.table("sales") \
            .select("*, clients(*), properties(*)") \
            .eq("id", sale_id) \
            .single() \
            .execute()

        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        sale = sale_result.data

        if sale["status"] != "transfer_reported":
            raise HTTPException(
                status_code=400,
                detail=f"Esta venta no está en estado 'transfer_reported' (status actual: {sale['status']})"
            )

        # 2. Update sale status to completed (skip paid step)
        sb.table("sales").update({
            "status": "completed",
            "payment_method": "transferencia",
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", sale_id).execute()

        # 2b. Confirm any pending sale_payments for this sale
        try:
            sb.table("sale_payments").update({
                "status": "confirmed",
                "confirmed_by": "treasury",
                "confirmed_at": datetime.utcnow().isoformat(),
            }).eq("sale_id", sale_id).eq("status", "pending").execute()
        except Exception as e:
            logger.warning(f"[sales] Failed to confirm sale_payments: {e}")

        # 3. Update property status to sold
        sb.table("properties").update({
            "status": PropertyStatus.SOLD.value,
        }).eq("id", sale["property_id"]).execute()
        logger.info(f"[sales] Property {sale['property_id']} marked SOLD (transfer confirmed, sale {sale_id})")

        # 4. Update client status to completed
        sb.table("clients").update({
            "status": ClientStatus.COMPLETED.value,
        }).eq("id", sale["client_id"]).execute()

        # 5. Create title_transfers record
        existing_transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("sale_id", sale_id) \
            .execute()

        if not existing_transfer.data:
            sale_transfer_payload = {
                "property_id": sale["property_id"],
                "sale_id": sale_id,
                "transfer_type": "sale",
                "from_name": "Maninos Homes LLC",
                "to_name": sale["clients"]["name"],
                "to_contact": sale["clients"].get("phone"),
                "status": "pending",
                "notes": "Venta contado - transferencia bancaria confirmada",
                **_get_purchase_serial_label(sale["property_id"]),
            }
            sb.table("title_transfers").insert(sale_transfer_payload).execute()

        # 6. Auto-generate Bill of Sale + Title PDFs
        documents = {}
        try:
            doc_result = auto_generate_sale_documents(
                sale_id=sale_id,
                sale_data=sale,
                client_data=sale["clients"],
                property_data=sale["properties"],
            )
            if doc_result.get("errors"):
                logger.warning(f"Document generation had errors: {doc_result['errors']}")
            else:
                logger.info(f"Documents auto-generated for sale {sale_id}")
            documents = {
                "bill_of_sale": doc_result.get("bill_of_sale"),
                "title": doc_result.get("title"),
            }
        except Exception as doc_error:
            logger.warning(f"Failed to auto-generate documents: {doc_error}")

        # 7. Send "Venta Completada" email to client
        try:
            send_sale_completed_email(
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
                property_city=sale["properties"].get("city", "Texas"),
                sale_price=float(sale["sale_price"]),
            )
        except Exception as email_error:
            logger.warning(f"Failed to send sale completed email: {email_error}")

        # 8. Schedule post-sale emails (review 7d + referral 30d)
        try:
            schedule_post_sale_emails(
                sale_id=sale_id,
                client_id=sale["client_id"],
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
            )
        except Exception as schedule_error:
            logger.warning(f"Failed to schedule post-sale emails: {schedule_error}")

        # 9. Write the sale's accounting pairs via the unified ledger writer.
        #    Two pairs are produced when a bank is named:
        #      a) sale_contado_received  — debit bank, credit 40000 House Sales
        #      b) sale_contado_cogs      — debit 50020 COGS, credit 11000 Inventory
        #         (so per-house profit comes out clean on the P&L)
        try:
            from datetime import date as date_type
            from api.services.ledger import post_to_ledger

            ledger_date = body.payment_date or date_type.today().isoformat()
            prop_yard = sb.table("properties").select("yard_id, purchase_price") \
                .eq("id", sale["property_id"]).single().execute()
            yard_id = (prop_yard.data or {}).get("yard_id")
            purchase_price = float((prop_yard.data or {}).get("purchase_price") or 0)

            # Pull total renovation cost so COGS is purchase + renos.
            renovation_total = 0.0
            try:
                reno_res = sb.table("renovations").select("total_cost") \
                    .eq("property_id", sale["property_id"]).execute()
                renovation_total = sum(float(r.get("total_cost") or 0) for r in (reno_res.data or []))
            except Exception:
                pass
            inventory_cost = purchase_price + renovation_total

            if body.bank_account_id:
                # (a) Cash leg
                post_to_ledger(
                    event_type="sale_contado_received",
                    amount=float(sale["sale_price"]),
                    bank_account_id=body.bank_account_id,
                    date=ledger_date,
                    counterparty_name=sale["clients"]["name"],
                    counterparty_type="client",
                    entity_type="sale",
                    entity_id=sale_id,
                    property_id=sale["property_id"],
                    yard_id=yard_id,
                    description_data={"address": sale["properties"]["address"]},
                    payment_method="transferencia",
                    payment_reference=body.payment_reference,
                    status="confirmed",
                )
                # (b) COGS recognition at sale: move this house's capitalized
                # cost from Inventory (Balance Sheet) to COGS (P&L), per concept,
                # so the cost matches the sale revenue. Idempotent.
                _recognize_house_cogs(sale["property_id"], sale_id, ledger_date)
                logger.info(f"[sales] Posted sale + COGS ledger pairs for sale {sale_id}")
            else:
                logger.warning(
                    f"[sales] confirm-transfer for sale {sale_id} had no bank_account_id; "
                    f"no ledger pair written. Update the UI to send the bank."
                )
        except ValueError as e:
            logger.error(f"[sales] Cannot post sale ledger pair: {e}")
            raise HTTPException(status_code=400, detail=f"No se puede registrar en contabilidad: {e}")
        except Exception as acct_error:
            logger.warning(f"Failed to create accounting pair: {acct_error}")

        # 10. Create notification for confirmed transfer
        try:
            from api.services.notification_service import notify_cash_payment
            notify_cash_payment(
                property_id=sale["property_id"],
                amount=float(sale["sale_price"]),
                from_name=sale["clients"]["name"],
                description=f"Transferencia confirmada — {sale['properties']['address']}",
            )
        except Exception as notif_error:
            logger.warning(f"[sales] Notification error: {notif_error}")

        return {
            "ok": True,
            "sale_id": sale_id,
            "documents": documents,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming transfer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/complete", response_model=SaleResponse)
async def complete_sale(sale_id: str):
    """
    Complete a sale.
    
    This finalizes the sale:
    1. Marks sale as 'completed'
    2. Updates property status to 'sold'
    3. Updates client status to 'completed'
    
    Transition: paid -> completed
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] != SaleStatus.PAID.value:
        raise HTTPException(
            status_code=400,
            detail=f"Sale must be paid before completing (current status: {sale.data['status']})"
        )
    
    # Update sale
    result = sb.table("sales").update({
        "status": SaleStatus.COMPLETED.value,
        "completed_at": datetime.utcnow().isoformat(),
    }).eq("id", sale_id).execute()
    
    # Update property to sold (from published or reserved)
    sb.table("properties").update({
        "status": PropertyStatus.SOLD.value,
    }).eq("id", sale.data["property_id"]).execute()
    logger.info(f"[sales] Property {sale.data['property_id']} marked SOLD (sale {sale_id} completed)")

    # Recognize this house's cost as COGS (Inventory → COGS) now that it's sold.
    try:
        _recognize_house_cogs(sale.data["property_id"], sale_id, datetime.utcnow().date().isoformat())
    except Exception as e:
        logger.warning(f"[sales] COGS recognition failed for sale {sale_id}: {e}")
    
    # Update client to completed
    sb.table("clients").update({
        "status": ClientStatus.COMPLETED.value,
    }).eq("id", sale.data["client_id"]).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name, email").eq("id", sale.data["client_id"]).single().execute()
    
    # Schedule post-sale follow-up emails (review 7d + referral 30d)
    if client.data and client.data.get("email"):
        try:
            from api.services.email_service import schedule_post_sale_emails
            schedule_post_sale_emails(
                sale_id=sale_id,
                client_id=sale.data["client_id"],
                client_email=client.data["email"],
                client_name=client.data.get("name", "Cliente"),
                property_address=prop.data["address"] if prop.data else "N/A",
            )
            logger.info(f"[sales] Scheduled post-sale emails for sale {sale_id}")
        except Exception as e:
            logger.warning(f"[sales] Failed to schedule post-sale emails: {e}")
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
async def cancel_sale(sale_id: str):
    """
    Cancel a pending sale.
    
    Only pending sales can be cancelled.
    Client status is reverted to 'lead'.
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] not in [SaleStatus.PENDING.value, SaleStatus.PAID.value, SaleStatus.RTO_PENDING.value, SaleStatus.RTO_APPROVED.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel sale with status: {sale.data['status']}"
        )
    
    # Update sale
    result = sb.table("sales").update({
        "status": SaleStatus.CANCELLED.value,
    }).eq("id", sale_id).execute()
    
    # Revert property to published (if it was reserved for this sale)
    prop_check = sb.table("properties").select("status").eq("id", sale.data["property_id"]).single().execute()
    if prop_check.data and prop_check.data["status"] == PropertyStatus.RESERVED.value:
        # Only un-reserve if there are no OTHER active sales on this property
        other_sales = sb.table("sales").select("id") \
            .eq("property_id", sale.data["property_id"]) \
            .neq("id", sale_id) \
            .in_("status", ["pending", "paid", "rto_pending", "rto_approved"]) \
            .execute()
        
        if not other_sales.data:
            sb.table("properties").update({
                "status": PropertyStatus.PUBLISHED.value,
            }).eq("id", sale.data["property_id"]).execute()
            logger.info(f"[sales] Property {sale.data['property_id']} reverted to PUBLISHED (sale {sale_id} cancelled)")
    
    # Revert client status
    sb.table("clients").update({
        "status": ClientStatus.LEAD.value,
    }).eq("id", sale.data["client_id"]).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", sale.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


# ============================================================================
# RTO COMPLETION
# ============================================================================

@router.get("/{sale_id}/rto-completion-status")
async def rto_completion_status(sale_id: str):
    """
    Check how many payments are done vs total, and if the RTO contract
    can be completed.
    """
    try:
        # 1. Get sale and verify it's RTO
        sale = sb.table("sales").select("*, clients(name)").eq("id", sale_id).single().execute()
        if not sale.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        if sale.data["sale_type"] != "rto":
            raise HTTPException(status_code=400, detail="Esta venta no es Rent-to-Own")

        # 2. Find the RTO contract
        contract_id = sale.data.get("rto_contract_id")
        if not contract_id:
            # Fallback: find by sale_id
            fallback = sb.table("rto_contracts").select("id").eq("sale_id", sale_id).execute()
            if fallback.data:
                contract_id = fallback.data[0]["id"]

        if not contract_id:
            return {
                "ok": True,
                "can_complete": False,
                "total_payments": 0,
                "paid_payments": 0,
                "remaining_payments": 0,
                "message": "Contrato RTO no encontrado. Aún en proceso de aprobación.",
            }

        # 3. Get all payments for this contract
        payments = sb.table("rto_payments").select("id, status, amount, paid_amount") \
            .eq("rto_contract_id", contract_id) \
            .execute()

        all_pmts = payments.data or []
        paid = [p for p in all_pmts if p["status"] in ("paid", "waived")]
        remaining = [p for p in all_pmts if p["status"] not in ("paid", "waived")]

        can_complete = len(remaining) == 0 and len(all_pmts) > 0

        total_paid = sum(float(p.get("paid_amount", 0) or 0) for p in paid)
        total_expected = sum(float(p.get("amount", 0)) for p in all_pmts)

        return {
            "ok": True,
            "can_complete": can_complete,
            "total_payments": len(all_pmts),
            "paid_payments": len(paid),
            "remaining_payments": len(remaining),
            "total_paid": total_paid,
            "total_expected": total_expected,
            "remaining_balance": total_expected - total_paid,
            "sale_status": sale.data["status"],
            "contract_id": contract_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking RTO completion status for sale {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/complete-rto")
async def complete_rto_contract(sale_id: str):
    """
    Complete an RTO contract when all payments are done.

    Steps:
    1. Verify sale exists and is rto_active
    2. Verify all rto_payments are paid/waived
    3. Update rto_contracts.status = 'completed'
    4. Update sales.status = 'completed', completed_at = now
    5. Update properties.status = 'sold'
    6. Update clients.status = 'completed'
    7. Create title_transfers record
    8. Auto-generate documents (Bill of Sale + Title)
    9. Send RTO completion email
    10. Create accounting transaction (sale_rto, ventas_rto)
    """
    try:
        # 1. Verify sale exists and is rto_active
        sale_result = sb.table("sales") \
            .select("*, clients(*), properties(*)") \
            .eq("id", sale_id) \
            .single() \
            .execute()

        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        sale = sale_result.data

        if sale["sale_type"] != "rto":
            raise HTTPException(status_code=400, detail="Esta venta no es Rent-to-Own")

        if sale["status"] not in ("rto_active", "rto_approved"):
            raise HTTPException(
                status_code=400,
                detail=f"La venta no está en estado 'rto_active' (estado actual: {sale['status']})"
            )

        # 2. Find the RTO contract
        contract_id = sale.get("rto_contract_id")
        if not contract_id:
            fallback = sb.table("rto_contracts").select("id").eq("sale_id", sale_id).execute()
            if fallback.data:
                contract_id = fallback.data[0]["id"]
                # Self-heal
                sb.table("sales").update({"rto_contract_id": contract_id}).eq("id", sale_id).execute()

        if not contract_id:
            raise HTTPException(status_code=400, detail="Contrato RTO no encontrado para esta venta")

        # 3. Verify all payments are paid/waived
        remaining = sb.table("rto_payments") \
            .select("id, status") \
            .eq("rto_contract_id", contract_id) \
            .not_.in_("status", ["paid", "waived"]) \
            .execute()

        if remaining.data:
            raise HTTPException(
                status_code=400,
                detail=f"Aún hay {len(remaining.data)} pago(s) pendientes. Todos los pagos deben estar completados."
            )

        # 4. Update rto_contracts.status = 'completed'
        sb.table("rto_contracts").update({
            "status": "completed",
        }).eq("id", contract_id).execute()

        # 5. Update sales.status = 'completed', completed_at = now
        sb.table("sales").update({
            "status": "completed",
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", sale_id).execute()

        # 6. Update properties.status = 'sold'
        sb.table("properties").update({
            "status": PropertyStatus.SOLD.value,
        }).eq("id", sale["property_id"]).execute()
        logger.info(f"[sales] Property {sale['property_id']} marked SOLD (RTO completed, sale {sale_id})")

        # Recognize the house's cost as COGS (Inventory → COGS) now that it's sold.
        try:
            _recognize_house_cogs(sale["property_id"], sale_id, datetime.utcnow().date().isoformat())
        except Exception as e:
            logger.warning(f"[sales] COGS recognition failed for RTO sale {sale_id}: {e}")

        # 7. Update clients.status = 'completed'
        sb.table("clients").update({
            "status": ClientStatus.COMPLETED.value,
        }).eq("id", sale["client_id"]).execute()

        # 8. Create title_transfers record
        existing_transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("sale_id", sale_id) \
            .execute()

        if not existing_transfer.data:
            sale_transfer_payload = {
                "property_id": sale["property_id"],
                "sale_id": sale_id,
                "transfer_type": "sale",
                "from_name": "Maninos Homes LLC",
                "to_name": sale["clients"]["name"],
                "to_contact": sale["clients"].get("phone"),
                "status": "pending",
                "notes": "Venta RTO - contrato completado, todos los pagos recibidos",
                **_get_purchase_serial_label(sale["property_id"]),
            }
            sb.table("title_transfers").insert(sale_transfer_payload).execute()

        # 9. Auto-generate Bill of Sale + Title PDFs
        documents = {}
        try:
            doc_result = auto_generate_sale_documents(
                sale_id=sale_id,
                sale_data=sale,
                client_data=sale["clients"],
                property_data=sale["properties"],
            )
            if doc_result.get("errors"):
                logger.warning(f"Document generation had errors: {doc_result['errors']}")
            else:
                logger.info(f"Documents auto-generated for RTO sale {sale_id}")
            documents = {
                "bill_of_sale": doc_result.get("bill_of_sale"),
                "title": doc_result.get("title"),
            }
        except Exception as doc_error:
            logger.warning(f"Failed to auto-generate documents for RTO sale: {doc_error}")

        # 10. Send RTO completion email
        try:
            send_rto_completed_email(
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
            )
        except Exception as email_error:
            logger.warning(f"Failed to send RTO completed email: {email_error}")

        # 11. Schedule post-sale emails (review 7d + referral 30d)
        try:
            schedule_post_sale_emails(
                sale_id=sale_id,
                client_id=sale["client_id"],
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
            )
        except Exception as schedule_error:
            logger.warning(f"Failed to schedule post-sale emails for RTO: {schedule_error}")

        # 12. (removed) — do NOT post a sale_rto income leg here. It was a raw
        # SINGLE-SIDED insert (full sale_price, is_income=True, no bank leg, no
        # linked pair) that both UNBALANCED the ledger and DOUBLE-COUNTED the
        # RTO income. RTO income is already recognized correctly at the sale:
        # the enganche via sale_down_payment_received (→ House Sales - RTO) and
        # the financed portion via the [CAPFIN:] receivable invoice to Maninos
        # Capital (→ House Sales - RTO). Completion only recognizes COGS
        # (Inventory → COGS), already handled above via _recognize_house_cogs.

        return {
            "ok": True,
            "sale_id": sale_id,
            "contract_id": contract_id,
            "documents": documents,
            "message": "Contrato RTO completado exitosamente. Documentos generados y email enviado.",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error completing RTO contract for sale {sale_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# HELPERS
# ============================================================================

def _safe_sale_status(value: str) -> SaleStatus:
    """Safely convert a string to SaleStatus, defaulting to PENDING for unknown values."""
    try:
        return SaleStatus(value)
    except ValueError:
        logger.warning(f"Unknown sale status '{value}', defaulting to PENDING")
        return SaleStatus.PENDING


def _resolve_employee_name(employee_id: Optional[str]) -> Optional[str]:
    """Look up an employee name by ID from the users table."""
    if not employee_id:
        return None
    try:
        result = sb.table("users").select("name").eq("id", employee_id).single().execute()
        return result.data["name"] if result.data else None
    except Exception:
        return None


def _format_sale(
    data: dict, 
    property_address: Optional[str] = None,
    client_name: Optional[str] = None,
) -> SaleResponse:
    """Format database row to SaleResponse."""
    return SaleResponse(
        id=data["id"],
        property_id=data["property_id"],
        client_id=data["client_id"],
        sale_type=SaleType(data["sale_type"]),
        sale_price=Decimal(str(data["sale_price"])),
        status=_safe_sale_status(data["status"]),
        sold_before_renovation=data.get("sold_before_renovation", False),
        payment_method=data.get("payment_method"),
        payment_reference=data.get("payment_reference"),
        created_at=data["created_at"],
        completed_at=data.get("completed_at"),
        updated_at=data["updated_at"],
        # Commission
        found_by_employee_id=data.get("found_by_employee_id"),
        sold_by_employee_id=data.get("sold_by_employee_id"),
        commission_amount=Decimal(str(data["commission_amount"])) if data.get("commission_amount") else None,
        commission_found_by=Decimal(str(data["commission_found_by"])) if data.get("commission_found_by") else None,
        commission_sold_by=Decimal(str(data["commission_sold_by"])) if data.get("commission_sold_by") else None,
        found_by_name=_resolve_employee_name(data.get("found_by_employee_id")) or data.get("found_by_name"),
        sold_by_name=_resolve_employee_name(data.get("sold_by_employee_id")) or data.get("sold_by_name"),
        # Payment tracking
        amount_paid=Decimal(str(data.get("amount_paid") or 0)),
        amount_pending=Decimal(str(data.get("amount_pending") or data.get("sale_price", 0))),
        property_address=property_address,
        client_name=client_name,
    )


# ============================================================================
# COMMISSION REPORTS
# ============================================================================

@router.get("/commissions/report")
async def commission_report(
    month: Optional[int] = Query(None, description="Month (1-12)"),
    year: Optional[int] = Query(None, description="Year"),
):
    """
    Monthly commission report for all employees.
    
    Rules (Feb 2026):
    - Cash: $1,500 | RTO: $1,000
    - Split 50/50 between found_by and sold_by
    - Same person = 100%
    """
    from datetime import date
    
    # Default to current month
    today = date.today()
    target_month = month or today.month
    target_year = year or today.year
    
    # Get all completed sales for the month
    start_date = f"{target_year}-{target_month:02d}-01"
    if target_month == 12:
        end_date = f"{target_year + 1}-01-01"
    else:
        end_date = f"{target_year}-{target_month + 1:02d}-01"
    
    sales = sb.table("sales")\
        .select("*, properties(address), clients(name)")\
        .gte("created_at", start_date)\
        .lt("created_at", end_date)\
        .in_("status", ["paid", "completed", "rto_active", "rto_approved"])\
        .execute()
    
    if not sales.data:
        return {
            "month": target_month,
            "year": target_year,
            "total_sales": 0,
            "total_commission": 0,
            "employees": [],
        }
    
    # Aggregate by employee
    employee_commissions = {}
    total_commission = Decimal("0")
    
    for sale in sales.data:
        found_by = sale.get("found_by_employee_id")
        sold_by = sale.get("sold_by_employee_id")
        comm_found = Decimal(str(sale.get("commission_found_by") or 0))
        comm_sold = Decimal(str(sale.get("commission_sold_by") or 0))
        
        total_commission += comm_found + comm_sold
        
        if found_by and comm_found > 0:
            if found_by not in employee_commissions:
                employee_commissions[found_by] = {
                    "employee_id": found_by,
                    "total_earned": Decimal("0"),
                    "sales_found": 0,
                    "sales_closed": 0,
                    "details": [],
                }
            employee_commissions[found_by]["total_earned"] += comm_found
            employee_commissions[found_by]["sales_found"] += 1
            employee_commissions[found_by]["details"].append({
                "sale_id": sale["id"],
                "role": "found_by",
                "amount": float(comm_found),
                "sale_type": sale["sale_type"],
            })
        
        if sold_by and comm_sold > 0 and sold_by != found_by:
            if sold_by not in employee_commissions:
                employee_commissions[sold_by] = {
                    "employee_id": sold_by,
                    "total_earned": Decimal("0"),
                    "sales_found": 0,
                    "sales_closed": 0,
                    "details": [],
                }
            employee_commissions[sold_by]["total_earned"] += comm_sold
            employee_commissions[sold_by]["sales_closed"] += 1
            employee_commissions[sold_by]["details"].append({
                "sale_id": sale["id"],
                "role": "sold_by",
                "amount": float(comm_sold),
                "sale_type": sale["sale_type"],
            })
    
    # Resolve employee names
    employee_list = []
    for emp_id, data in employee_commissions.items():
        try:
            emp = sb.table("users").select("name").eq("id", emp_id).single().execute()
            data["name"] = emp.data["name"] if emp.data else "Desconocido"
        except Exception:
            data["name"] = "Desconocido"
        data["total_earned"] = float(data["total_earned"])
        employee_list.append(data)
    
    # Sort by total earned (gamification: top earner first)
    employee_list.sort(key=lambda x: x["total_earned"], reverse=True)
    
    return {
        "month": target_month,
        "year": target_year,
        "total_sales": len(sales.data),
        "total_commission": float(total_commission),
        "employees": employee_list,
    }


# ============================================================================
# COMMISSION PAYMENTS
# ============================================================================

def _create_commission_payments(sale: dict):
    """
    Auto-generate commission_payments rows + payment_orders when a sale is created.
    Payment orders go to Notificaciones → Por Aprobar → Contabilidad.
    """
    found_by = sale.get("found_by_employee_id")
    sold_by = sale.get("sold_by_employee_id")
    comm_found = float(sale.get("commission_found_by") or 0)
    comm_sold = float(sale.get("commission_sold_by") or 0)
    property_id = sale.get("property_id")
    sale_type = sale.get("sale_type", "contado")

    # Resolve property address and employee names
    prop_address = ""
    prop_code = ""
    try:
        prop = sb.table("properties").select("address, property_code, city").eq("id", property_id).single().execute()
        if prop.data:
            prop_address = f"{prop.data.get('address', '')}, {prop.data.get('city', '')}"
            prop_code = prop.data.get("property_code", "")
    except Exception:
        pass

    # A commission half goes to an EMPLOYEE (employee_id) or an AD-HOC person
    # (free-text name). Build one commission_payment row per non-zero half; the
    # ad-hoc name rides in payee_name. Only set payee_name for ad-hoc rows so
    # employee commissions keep working even before migration 101 is applied.
    found_name = (sale.get("found_by_name") or "").strip()
    sold_name = (sale.get("sold_by_name") or "").strip()

    def _mk_comm_row(role, employee_id, name, amount):
        row = {"sale_id": sale["id"], "role": role, "amount": amount, "status": "pending"}
        if employee_id:
            row["employee_id"] = employee_id
        else:
            row["payee_name"] = name
        return row

    # Same person on both halves (same employee OR same ad-hoc name) → one row.
    same_person = (found_by and sold_by and found_by == sold_by) or \
                  (found_name and sold_name and found_name.lower() == sold_name.lower())
    rows = []
    if comm_found > 0 and (found_by or found_name):
        rows.append(_mk_comm_row("found_by", found_by, found_name, comm_found))
    if comm_sold > 0 and (sold_by or sold_name) and not same_person:
        rows.append(_mk_comm_row("sold_by", sold_by, sold_name, comm_sold))

    # Resolve the commission expense account: ALWAYS the per-house
    # "Comisión <CODE>" job-costing sub-account so the commission links to the
    # house in the P&L (not the generic "Commissions & fees"). If the house
    # lacks its per-house COGS sub-accounts — e.g. it was sold straight from
    # consignment and never went through the normal purchase flow — create them
    # now (idempotent) instead of silently falling back to the generic account.
    comm_account = "Commissions & fees"
    if prop_code and property_id:
        try:
            acc = sb.table("accounting_accounts").select("code").eq("code", f"Comisión {prop_code}").limit(1).execute()
            if not acc.data:
                from api.routes.properties import _create_inventory_account_for_property
                _create_inventory_account_for_property({"id": property_id, "property_code": prop_code})
            comm_account = f"Comisión {prop_code}"
        except Exception as e:
            logger.warning(f"[commissions] Could not ensure 'Comisión {prop_code}' account, using generic: {e}")
            comm_account = "Commissions & fees"

    for row in rows:
        cp_id = None
        try:
            ins = sb.table("commission_payments").insert(row).execute()
            cp_id = ins.data[0]["id"] if ins.data else None
        except Exception as e:
            logger.warning(f"[commissions] Failed to create commission_payment: {e}")

        # ROOT MODEL: a commission is a real payable INVOICE (posts the accrual
        # Comisión→A/P at sale). It is PAID via invoice payments (partial OK),
        # which post A/P→bank. This replaces the old payment_order+commission_paid
        # path — the commission is now represented (and posted) exactly ONCE.
        try:
            from api.routes.accounting import issue_invoice
            # Payee = the ad-hoc name, else the employee's resolved name.
            emp_name = row.get("payee_name") or _resolve_employee_name(row.get("employee_id")) or "Comisionista"
            role_label = "encontró al cliente" if row["role"] == "found_by" else "cerró la venta"
            tipo = "RTO" if sale_type == "rto" else "Contado"
            code_str = f" ({prop_code})" if prop_code else ""
            tag = f"[COMM:{cp_id}]" if cp_id else ""
            inv = issue_invoice(
                direction="payable",
                counterparty_name=emp_name,
                counterparty_type="employee" if row.get("employee_id") else "person",
                total_amount=float(row["amount"]),
                account_code=comm_account,
                property_id=property_id,
                sale_id=sale["id"],
                description=f"Comisión venta {tipo}: {emp_name} ({role_label}){code_str}",
                notes=f"{tag} Comisión {tipo} ${float(row['amount']):,.0f} — {emp_name} ({role_label}). {prop_address}",
            )
            # The commission_payment ↔ invoice link is the [COMM:<cp_id>] tag in
            # the invoice notes (consistent with [PO:]/[CAPFIN:]/[CONSIGN:]);
            # mark_commission_paid resolves it to settle the right invoice.
            logger.info(f"[commissions] Payable invoice {inv.get('invoice_number')} created for {emp_name}: ${float(row['amount']):,.0f}")
        except Exception as e:
            logger.warning(f"[commissions] Failed to create payable invoice for commission: {e}")



