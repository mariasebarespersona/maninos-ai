"""
Capital Payments - RTO Payment management, Commissions, Insurance/Tax
Phase 4: Gestionar Cartera
"""

from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
from api.routes.capital._accounting_hooks import record_txn
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["Capital - Payments"])


# =============================================================================
# SCHEMAS
# =============================================================================

class RecordPayment(BaseModel):
    """Record a payment received."""
    payment_method: str  # stripe, zelle, transfer, cash, check
    paid_amount: float
    paid_date: Optional[str] = None  # YYYY-MM-DD, defaults to today
    payment_reference: Optional[str] = None
    notes: Optional[str] = None
    recorded_by: Optional[str] = "admin"


class CommissionCreate(BaseModel):
    """Create a commission record."""
    sale_id: str
    contract_id: Optional[str] = None
    property_id: Optional[str] = None
    client_id: Optional[str] = None
    total_commission: float = 1000
    found_by: Optional[str] = None
    found_by_amount: float = 500
    sold_by: Optional[str] = None
    sold_by_amount: float = 500
    notes: Optional[str] = None


class InsuranceTaxUpdate(BaseModel):
    """Update insurance/tax tracking on a contract."""
    insurance_status: Optional[str] = None
    insurance_provider: Optional[str] = None
    insurance_policy_number: Optional[str] = None
    insurance_expiry: Optional[str] = None
    tax_responsibility: Optional[str] = None
    annual_tax_amount: Optional[float] = None
    tax_paid_through: Optional[str] = None
    tax_status: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_payments(
    contract_id: Optional[str] = None,
    status: Optional[str] = None,
    month: Optional[str] = None,  # YYYY-MM
):
    """List payments with filters."""
    try:
        query = sb.table("rto_payments") \
            .select("*, rto_contracts(id, client_id, property_id, clients(name, email), properties(address, city))")
        
        if contract_id:
            query = query.eq("rto_contract_id", contract_id)
        if status:
            query = query.eq("status", status)
        if month:
            query = query.gte("due_date", f"{month}-01").lte("due_date", f"{month}-31")
        
        result = query.order("due_date", desc=False).execute()
        return {"ok": True, "payments": result.data or []}
    except Exception as e:
        logger.error(f"Error listing payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/overdue")
async def list_overdue_payments():
    """Get all overdue (late) payments with client and property info."""
    try:
        today = date.today().isoformat()
        
        # Get pending payments past due date
        result = sb.table("rto_payments") \
            .select("*, rto_contracts(id, client_id, property_id, monthly_rent, late_fee_per_day, grace_period_days, clients(name, email, phone), properties(address, city))") \
            .in_("status", ["pending", "late"]) \
            .lt("due_date", today) \
            .order("due_date") \
            .execute()
        
        overdue = []
        for p in (result.data or []):
            due = datetime.strptime(p["due_date"], "%Y-%m-%d").date()
            days_late = (date.today() - due).days
            contract = p.get("rto_contracts", {})
            grace = contract.get("grace_period_days", 5)
            fee_per_day = float(contract.get("late_fee_per_day", 15))
            
            late_fee = max(0, (days_late - grace)) * fee_per_day if days_late > grace else 0
            
            overdue.append({
                **p,
                "days_late": days_late,
                "calculated_late_fee": late_fee,
                "past_grace_period": days_late > grace,
            })
        
        return {"ok": True, "overdue_payments": overdue, "total": len(overdue)}
    except Exception as e:
        logger.error(f"Error listing overdue payments: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{payment_id}/record")
async def record_payment(payment_id: str, data: RecordPayment):
    """
    Record a payment received for a specific payment.
    Calculates late fees if applicable.
    """
    try:
        # Get payment
        payment = sb.table("rto_payments") \
            .select("*, rto_contracts(late_fee_per_day, grace_period_days, client_id)") \
            .eq("id", payment_id) \
            .single() \
            .execute()
        
        if not payment.data:
            raise HTTPException(status_code=404, detail="Pago no encontrado")
        
        p = payment.data
        
        if p["status"] == "paid":
            raise HTTPException(status_code=400, detail="Este pago ya fue registrado")
        
        # Calculate late fee
        paid_date = datetime.strptime(
            data.paid_date or date.today().isoformat(), "%Y-%m-%d"
        ).date()
        due = datetime.strptime(p["due_date"], "%Y-%m-%d").date()
        days_late = max(0, (paid_date - due).days)
        
        contract = p.get("rto_contracts", {})
        grace = contract.get("grace_period_days", 5)
        fee_per_day = float(contract.get("late_fee_per_day", 15))
        late_fee = max(0, (days_late - grace)) * fee_per_day if days_late > grace else 0
        
        # Update payment
        update_data = {
            "status": "paid",
            "paid_date": paid_date.isoformat(),
            "paid_amount": data.paid_amount,
            "payment_method": data.payment_method,
            "payment_reference": data.payment_reference,
            "days_late": days_late,
            "late_fee_amount": late_fee,
            "notes": data.notes,
            "recorded_by": data.recorded_by,
        }
        
        sb.table("rto_payments").update(update_data).eq("id", payment_id).execute()
        
        # ── Accounting hooks ──────────────────────────────────────
        # 1) Record capital_flow  (rent_income)  — skip auto-accounting
        #    because we create our own transaction below with more detail.
        try:
            from api.routes.capital.capital_flows import _record_flow
            _record_flow({
                "flow_type": "rent_income",
                "amount": data.paid_amount,
                "investor_id": None,
                "property_id": None,
                "rto_contract_id": p["rto_contract_id"],
                "rto_payment_id": payment_id,
                "description": f"Pago RTO #{p.get('payment_number', '?')} — {data.payment_method}",
                "flow_date": paid_date.isoformat(),
            }, skip_accounting=True)
        except Exception as fe:
            logger.warning(f"Could not record capital_flow for payment: {fe}")

        # 2) Record capital_transaction  (rto_payment)
        record_txn(
            txn_type="rto_payment",
            amount=data.paid_amount,
            is_income=True,
            description=f"Pago RTO mensualidad #{p.get('payment_number', '?')}",
            txn_date=paid_date.isoformat(),
            rto_contract_id=p["rto_contract_id"],
            rto_payment_id=payment_id,
            client_id=contract.get("client_id"),
            payment_method=data.payment_method,
            payment_reference=data.payment_reference,
            notes=data.notes,
            created_by=data.recorded_by or "admin",
        )

        # 3) If late fee, record separate transaction
        if late_fee > 0:
            record_txn(
                txn_type="late_fee",
                amount=late_fee,
                is_income=True,
                description=f"Recargo por mora — {days_late} días",
                txn_date=paid_date.isoformat(),
                rto_contract_id=p["rto_contract_id"],
                rto_payment_id=payment_id,
                client_id=contract.get("client_id"),
                created_by="auto",
            )
        # ──────────────────────────────────────────────────────────
        
        # Check if this was the last payment → complete contract
        contract_id = p["rto_contract_id"]
        remaining = sb.table("rto_payments") \
            .select("id") \
            .eq("rto_contract_id", contract_id) \
            .in_("status", ["scheduled", "pending", "late"]) \
            .execute()
        
        all_paid = len(remaining.data or []) == 0
        
        if all_paid:
            # Mark contract as completed
            sb.table("rto_contracts").update({
                "status": "completed"
            }).eq("id", contract_id).execute()
            
            # This triggers Phase 5: Entregar
            return {
                "ok": True,
                "message": "¡Último pago registrado! El contrato está completado. Proceder a transferencia de título.",
                "late_fee": late_fee,
                "days_late": days_late,
                "contract_completed": True
            }
        
        return {
            "ok": True,
            "message": f"Pago #{p['payment_number']} registrado exitosamente",
            "late_fee": late_fee,
            "days_late": days_late,
            "contract_completed": False
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording payment {payment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/schedule/{contract_id}")
async def get_payment_schedule(contract_id: str):
    """Get full payment schedule for a contract."""
    try:
        payments = sb.table("rto_payments") \
            .select("*") \
            .eq("rto_contract_id", contract_id) \
            .order("payment_number") \
            .execute()
        
        data = payments.data or []
        paid = [p for p in data if p["status"] == "paid"]
        
        total_paid = sum(float(p.get("paid_amount", 0)) for p in paid)
        total_late_fees = sum(float(p.get("late_fee_amount", 0)) for p in data)
        total_expected = sum(float(p.get("amount", 0)) for p in data)
        remaining = total_expected - total_paid
        
        return {
            "ok": True,
            "payments": data,
            "summary": {
                "total_payments": len(data),
                "payments_made": len(paid),
                "payments_remaining": len(data) - len(paid),
                "total_paid": total_paid,
                "total_expected": total_expected,
                "remaining_balance": remaining,
                "total_late_fees": total_late_fees,
                "completion_percentage": round((len(paid) / len(data) * 100), 1) if data else 0,
            }
        }
    except Exception as e:
        logger.error(f"Error getting payment schedule {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/mora-summary")
async def get_mora_summary():
    """
    Client-level delinquency summary for mora management.
    Shows each delinquent client with aggregated overdue info.
    """
    try:
        today_str = date.today().isoformat()
        today_d = date.today()
        
        # Get all overdue payments with contract+client+property
        result = sb.table("rto_payments") \
            .select("*, rto_contracts(id, client_id, property_id, monthly_rent, late_fee_per_day, grace_period_days, clients(id, name, email, phone), properties(address, city))") \
            .in_("status", ["pending", "late"]) \
            .lt("due_date", today_str) \
            .order("due_date") \
            .execute()
        
        overdue_payments = result.data or []
        
        # Aggregate by client
        client_map: dict = {}
        for p in overdue_payments:
            contract = p.get("rto_contracts", {}) or {}
            client = contract.get("clients", {}) or {}
            prop = contract.get("properties", {}) or {}
            cid = client.get("id") or contract.get("client_id", "unknown")
            
            due = datetime.strptime(p["due_date"], "%Y-%m-%d").date()
            days_late = (today_d - due).days
            grace = contract.get("grace_period_days", 5)
            fee_per_day = float(contract.get("late_fee_per_day", 15))
            late_fee = max(0, (days_late - grace)) * fee_per_day if days_late > grace else 0
            
            if cid not in client_map:
                client_map[cid] = {
                    "client_id": cid,
                    "client_name": client.get("name", "N/A"),
                    "client_email": client.get("email"),
                    "client_phone": client.get("phone"),
                    "property_address": prop.get("address", "N/A"),
                    "property_city": prop.get("city"),
                    "contract_id": contract.get("id"),
                    "monthly_rent": float(contract.get("monthly_rent", 0)),
                    "overdue_payments": 0,
                    "total_overdue": 0.0,
                    "total_late_fees": 0.0,
                    "max_days_late": 0,
                    "earliest_overdue": p["due_date"],
                    "risk_level": "medium",
                    "payment_ids": [],
                }
            
            client_map[cid]["overdue_payments"] += 1
            client_map[cid]["total_overdue"] += float(p.get("amount", 0))
            client_map[cid]["total_late_fees"] += late_fee
            client_map[cid]["max_days_late"] = max(client_map[cid]["max_days_late"], days_late)
            client_map[cid]["payment_ids"].append(p["id"])
        
        # Set risk levels and sort
        for info in client_map.values():
            d = info["max_days_late"]
            if d > 90:
                info["risk_level"] = "critical"
            elif d > 60:
                info["risk_level"] = "high"
            elif d > 30:
                info["risk_level"] = "medium"
            else:
                info["risk_level"] = "low"
        
        clients_in_mora = sorted(client_map.values(), key=lambda x: x["max_days_late"], reverse=True)
        
        return {
            "ok": True,
            "clients_in_mora": clients_in_mora,
            "total_clients": len(clients_in_mora),
            "total_overdue_payments": len(overdue_payments),
            "total_overdue_amount": round(sum(c["total_overdue"] for c in clients_in_mora), 2),
            "total_late_fees": round(sum(c["total_late_fees"] for c in clients_in_mora), 2),
        }
    except Exception as e:
        logger.error(f"Error getting mora summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/update-statuses")
async def update_payment_statuses():
    """
    Batch update payment statuses based on current date.
    - scheduled → pending (if due date is within 5 days)
    - pending → late (if past due date)
    Should be called periodically (e.g., daily cron) or on page load.
    """
    try:
        today = date.today()
        upcoming = (today + __import__('datetime').timedelta(days=5)).isoformat()
        today_str = today.isoformat()
        
        # Scheduled → Pending (due within 5 days)
        sb.table("rto_payments").update({
            "status": "pending"
        }).eq("status", "scheduled").lte("due_date", upcoming).execute()
        
        # Pending → Late (past due)
        sb.table("rto_payments").update({
            "status": "late"
        }).eq("status", "pending").lt("due_date", today_str).execute()
        
        return {"ok": True, "message": "Payment statuses updated"}
    except Exception as e:
        logger.error(f"Error updating payment statuses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# COMMISSIONS
# =============================================================================

@router.get("/commissions")
async def list_commissions(status: Optional[str] = None):
    """List all RTO commissions."""
    try:
        query = sb.table("rto_commissions") \
            .select("*, properties(address, city), clients(name)")
        if status:
            query = query.eq("status", status)
        result = query.order("created_at", desc=True).execute()
        commissions = result.data or []
        
        total_pending = sum(float(c.get("total_commission", 0)) for c in commissions if c.get("status") == "pending")
        total_paid = sum(float(c.get("total_commission", 0)) for c in commissions if c.get("status") == "paid")
        
        return {
            "ok": True,
            "commissions": commissions,
            "summary": {
                "total": len(commissions),
                "total_pending": total_pending,
                "total_paid": total_paid,
            }
        }
    except Exception as e:
        logger.error(f"Error listing commissions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/commissions")
async def create_commission(data: CommissionCreate):
    """Create a commission record for an RTO sale."""
    try:
        commission_data = {
            "sale_id": data.sale_id,
            "contract_id": data.contract_id,
            "property_id": data.property_id,
            "client_id": data.client_id,
            "total_commission": data.total_commission,
            "found_by": data.found_by,
            "found_by_amount": data.found_by_amount,
            "sold_by": data.sold_by,
            "sold_by_amount": data.sold_by_amount,
            "notes": data.notes,
            "status": "pending",
        }
        result = sb.table("rto_commissions").insert(commission_data).execute()
        return {"ok": True, "commission": result.data[0] if result.data else None}
    except Exception as e:
        logger.error(f"Error creating commission: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/commissions/{commission_id}/pay")
async def pay_commission(commission_id: str):
    """Mark a commission as paid."""
    try:
        # Fetch commission details first
        comm = sb.table("rto_commissions") \
            .select("*, properties(address), clients(name)") \
            .eq("id", commission_id) \
            .single() \
            .execute().data

        sb.table("rto_commissions").update({
            "status": "paid",
            "paid_at": datetime.utcnow().isoformat(),
        }).eq("id", commission_id).execute()

        # ── Accounting hook ──
        if comm:
            prop_addr = (comm.get("properties") or {}).get("address", "")
            client_name = (comm.get("clients") or {}).get("name", "")
            record_txn(
                txn_type="commission",
                amount=float(comm.get("total_commission", 0)),
                is_income=False,
                description=f"Comisión RTO — {client_name} / {prop_addr}",
                txn_date=date.today().isoformat(),
                rto_contract_id=comm.get("contract_id"),
                property_id=comm.get("property_id"),
                client_id=comm.get("client_id"),
                created_by="admin",
            )

        return {"ok": True, "message": "Comisión pagada"}
    except Exception as e:
        logger.error(f"Error paying commission: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# INSURANCE / TAX TRACKING
# =============================================================================

@router.put("/contracts/{contract_id}/insurance-tax")
async def update_insurance_tax(contract_id: str, data: InsuranceTaxUpdate):
    """Update insurance and tax tracking for a contract."""
    try:
        update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not update:
            return {"ok": True, "message": "Nada que actualizar"}
        
        sb.table("rto_contracts").update(update).eq("id", contract_id).execute()
        return {"ok": True, "message": "Seguros/Impuestos actualizados"}
    except Exception as e:
        logger.error(f"Error updating insurance/tax for contract {contract_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/insurance-alerts")
async def get_insurance_alerts():
    """Get contracts with expired or expiring insurance."""
    try:
        today_str = date.today().isoformat()
        thirty_days = (date.today() + __import__('datetime').timedelta(days=30)).isoformat()
        
        contracts = sb.table("rto_contracts") \
            .select("id, property_id, client_id, insurance_status, insurance_provider, insurance_expiry, tax_status, tax_paid_through, clients(name), properties(address)") \
            .eq("status", "active") \
            .execute().data or []
        
        alerts = []
        for c in contracts:
            issues = []
            exp = c.get("insurance_expiry")
            if exp and exp < today_str:
                issues.append("insurance_expired")
            elif exp and exp < thirty_days:
                issues.append("insurance_expiring_soon")
            
            if c.get("insurance_status") == "expired":
                issues.append("insurance_expired")
            if c.get("insurance_status") == "pending":
                issues.append("insurance_pending")
            
            tax_through = c.get("tax_paid_through")
            if tax_through and tax_through < today_str:
                issues.append("tax_overdue")
            if c.get("tax_status") == "overdue":
                issues.append("tax_overdue")
            
            if issues:
                alerts.append({
                    "contract_id": c["id"],
                    "client_name": (c.get("clients") or {}).get("name", "N/A"),
                    "property_address": (c.get("properties") or {}).get("address", "N/A"),
                    "issues": list(set(issues)),
                    "insurance_expiry": exp,
                    "tax_paid_through": tax_through,
                })
        
        return {"ok": True, "alerts": alerts, "total": len(alerts)}
    except Exception as e:
        logger.error(f"Error getting insurance alerts: {e}")
        raise HTTPException(status_code=500, detail=str(e))


