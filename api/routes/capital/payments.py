"""
Capital Payments - RTO Payment management
Phase 4: Gestionar Cartera
"""

from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
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


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/")
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


@router.post("/update-statuses")
async def update_payment_statuses():
    """
    Batch update payment statuses based on current date.
    - scheduled → pending (if due date is within 5 days)
    - pending → late (if past due date)
    Should be called periodically (e.g., daily cron).
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


