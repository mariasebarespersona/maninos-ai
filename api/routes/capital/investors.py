"""
Capital Investors - Investor management (Fondear)
Phase 6
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
from api.routes.capital._accounting_hooks import record_txn
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/investors", tags=["Capital - Investors"])


# =============================================================================
# SCHEMAS
# =============================================================================

class InvestorCreate(BaseModel):
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    total_invested: float = 0
    available_capital: float = 0
    notes: Optional[str] = None


class InvestorUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    company: Optional[str] = None
    available_capital: Optional[float] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class InvestmentCreate(BaseModel):
    investor_id: str
    property_id: Optional[str] = None
    rto_contract_id: Optional[str] = None
    promissory_note_id: Optional[str] = None
    amount: float
    expected_return_rate: Optional[float] = None
    notes: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_investors(status: Optional[str] = "active"):
    """List all investors with summary metrics per investor."""
    try:
        query = sb.table("investors").select("*")
        if status:
            query = query.eq("status", status)
        result = query.order("created_at", desc=True).execute()
        investors = result.data or []

        # Get all promissory notes to enrich investor cards
        all_notes = sb.table("promissory_notes") \
            .select("investor_id, loan_amount, annual_rate, term_months, status") \
            .execute()
        notes_by_investor: dict = {}
        for n in (all_notes.data or []):
            iid = n.get("investor_id")
            if iid:
                notes_by_investor.setdefault(iid, []).append(n)

        # Enrich each investor with card preview metrics
        for inv in investors:
            inv_notes = notes_by_investor.get(inv["id"], [])
            active_notes = [n for n in inv_notes if n.get("status") in ("active", "overdue")]
            if active_notes:
                w_sum = sum(float(n.get("loan_amount", 0)) * float(n.get("annual_rate", 0)) for n in active_notes)
                w_principal = sum(float(n.get("loan_amount", 0)) for n in active_notes)
                inv["tasa_fondeo"] = round(w_sum / w_principal, 2) if w_principal > 0 else 0
                terms = [int(n.get("term_months", 0)) for n in active_notes if n.get("term_months")]
                inv["avg_term"] = round(sum(terms) / len(terms), 1) if terms else 0
            elif inv_notes:
                rates = [float(n.get("annual_rate", 0)) for n in inv_notes if n.get("annual_rate")]
                inv["tasa_fondeo"] = round(sum(rates) / len(rates), 2) if rates else 0
                terms = [int(n.get("term_months", 0)) for n in inv_notes if n.get("term_months")]
                inv["avg_term"] = round(sum(terms) / len(terms), 1) if terms else 0
            else:
                inv["tasa_fondeo"] = 0
                inv["avg_term"] = 0

        return {"ok": True, "investors": investors}
    except Exception as e:
        logger.error(f"Error listing investors: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{investor_id}")
async def get_investor(investor_id: str):
    """Get investor details with investments."""
    try:
        investor = sb.table("investors") \
            .select("*") \
            .eq("id", investor_id) \
            .single() \
            .execute()
        
        if not investor.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")
        
        investments = sb.table("investments") \
            .select("*, properties(address, city), rto_contracts(client_id, clients(name)), promissory_notes(id, loan_amount, status, maturity_date)") \
            .eq("investor_id", investor_id) \
            .order("invested_at", desc=True) \
            .execute()
        
        # Get promissory notes for this investor
        notes = sb.table("promissory_notes") \
            .select("*") \
            .eq("investor_id", investor_id) \
            .order("created_at", desc=True) \
            .execute()
        
        # Calculate ROI metrics
        inv_data = investments.data or []
        total_invested = sum(float(i.get("amount", 0)) for i in inv_data)
        total_returned = sum(float(i.get("return_amount", 0) or 0) for i in inv_data)
        active_investments = [i for i in inv_data if i.get("status") == "active"]

        # Expected returns from active investments
        expected_returns = 0.0
        for inv in active_investments:
            rate = float(inv.get("expected_return_rate", 0) or 0) / 100
            expected_returns += float(inv.get("amount", 0)) * (1 + rate)

        # Notes metrics
        notes_data = notes.data or []
        total_lent = sum(float(n.get("loan_amount", 0)) for n in notes_data)
        total_due_notes = sum(float(n.get("total_due", 0)) for n in notes_data)
        total_paid_notes = sum(float(n.get("paid_amount", 0) or 0) for n in notes_data)
        active_notes = [n for n in notes_data if n.get("status") in ("active", "overdue")]

        # New detailed metrics: capital vs interest breakdown
        retornado_capital = 0.0
        retornado_interes = 0.0
        for n in notes_data:
            paid = float(n.get("paid_amount", 0) or 0)
            principal = float(n.get("loan_amount", 0))
            if paid <= principal:
                retornado_capital += paid
            else:
                retornado_capital += principal
                retornado_interes += paid - principal

        # Tasa fondeo for this investor (weighted avg of their notes)
        investor_active_notes = [n for n in notes_data if n.get("status") in ("active", "overdue") and n.get("annual_rate")]
        if investor_active_notes:
            w_sum = sum(float(n["loan_amount"]) * float(n["annual_rate"]) for n in investor_active_notes)
            w_principal = sum(float(n["loan_amount"]) for n in investor_active_notes)
            tasa_fondeo = round(w_sum / w_principal, 2) if w_principal > 0 else 0
        elif notes_data:
            rates = [float(n.get("annual_rate", 0)) for n in notes_data if n.get("annual_rate")]
            tasa_fondeo = round(sum(rates) / len(rates), 2) if rates else 0
        else:
            tasa_fondeo = 0

        # Average term
        terms = [int(n.get("term_months", 0)) for n in notes_data if n.get("term_months")]
        avg_term = round(sum(terms) / len(terms), 1) if terms else 0

        # Total captado = total_invested from investor record (what they put in)
        total_captado = float(investor.data.get("total_invested", 0))
        total_disponible = float(investor.data.get("available_capital", 0))

        return {
            "ok": True,
            "investor": investor.data,
            "investments": inv_data,
            "promissory_notes": notes_data,
            "metrics": {
                "total_captado": total_captado,
                "total_invertido": total_invested,
                "total_disponible": total_disponible,
                "total_retornado_capital": round(retornado_capital, 2),
                "total_retornado_interes": round(retornado_interes, 2),
                "tasa_fondeo": tasa_fondeo,
                "avg_term_months": avg_term,
                # Legacy fields for backwards compat
                "total_invested": total_invested,
                "total_returned": total_returned,
                "net_outstanding": total_invested - total_returned,
                "active_investments": len(active_investments),
                "expected_returns": expected_returns,
                "roi_pct": round(((total_returned / total_invested * 100) - 100), 2) if total_invested > 0 else 0,
                "notes_total_lent": total_lent,
                "notes_total_due": total_due_notes,
                "notes_total_paid": total_paid_notes,
                "notes_outstanding": total_due_notes - total_paid_notes,
                "active_notes": len(active_notes),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting investor {investor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_investor(data: InvestorCreate):
    """Register a new investor."""
    try:
        result = sb.table("investors").insert({
            "name": data.name,
            "email": data.email,
            "phone": data.phone,
            "company": data.company,
            "total_invested": data.total_invested,
            "available_capital": data.available_capital,
            "notes": data.notes,
        }).execute()
        
        return {"ok": True, "investor": result.data[0]}
    except Exception as e:
        logger.error(f"Error creating investor: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{investor_id}")
async def update_investor(investor_id: str, data: InvestorUpdate):
    """Update investor info."""
    try:
        update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        if not update:
            return {"ok": True, "message": "Nada que actualizar"}
        
        sb.table("investors").update(update).eq("id", investor_id).execute()
        return {"ok": True, "message": "Inversionista actualizado"}
    except Exception as e:
        logger.error(f"Error updating investor {investor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/investments")
async def create_investment(data: InvestmentCreate):
    """Record a new investment."""
    try:
        insert_data = {
            "investor_id": data.investor_id,
            "property_id": data.property_id,
            "rto_contract_id": data.rto_contract_id,
            "amount": data.amount,
            "expected_return_rate": data.expected_return_rate,
            "notes": data.notes,
        }
        if data.promissory_note_id:
            insert_data["promissory_note_id"] = data.promissory_note_id
        
        result = sb.table("investments").insert(insert_data).execute()
        
        # Update investor totals
        investor = sb.table("investors") \
            .select("total_invested, available_capital") \
            .eq("id", data.investor_id) \
            .single() \
            .execute()
        
        if investor.data:
            sb.table("investors").update({
                "total_invested": float(investor.data["total_invested"] or 0) + data.amount,
                "available_capital": max(0, float(investor.data["available_capital"] or 0) - data.amount),
            }).eq("id", data.investor_id).execute()
        
        # Record capital_transaction for reconciliation
        inv_name = ""
        try:
            inv_info = sb.table("investors").select("name").eq("id", data.investor_id).single().execute()
            inv_name = inv_info.data.get("name", "") if inv_info.data else ""
        except Exception:
            pass
        record_txn(
            txn_type="investor_deposit",
            amount=data.amount,
            is_income=True,
            description=f"Depósito inversión — {inv_name}".strip(),
            investor_id=data.investor_id,
            property_id=data.property_id,
            rto_contract_id=data.rto_contract_id,
            notes=data.notes,
        )

        return {"ok": True, "investment": result.data[0]}
    except Exception as e:
        logger.error(f"Error creating investment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/investments/summary")
async def get_investments_summary(period: Optional[str] = None):
    """
    Summary of all investments with detailed metrics.
    period: 'month', 'quarter', 'year', or None (all time)
    """
    try:
        from datetime import date, timedelta

        # Date filter
        date_from = None
        today = date.today()
        if period == "month":
            date_from = today.replace(day=1).isoformat()
        elif period == "quarter":
            q_month = ((today.month - 1) // 3) * 3 + 1
            date_from = today.replace(month=q_month, day=1).isoformat()
        elif period == "year":
            date_from = today.replace(month=1, day=1).isoformat()

        # Get investors
        investors_result = sb.table("investors") \
            .select("id, total_invested, available_capital, status") \
            .execute()
        investors_data = investors_result.data or []

        # Total captado = sum of all investor total_invested (capital raised)
        total_captado = sum(float(i.get("total_invested", 0)) for i in investors_data)
        total_disponible = sum(float(i.get("available_capital", 0)) for i in investors_data)

        # Get promissory notes for interest/capital return breakdown
        notes_query = sb.table("promissory_notes") \
            .select("id, investor_id, loan_amount, annual_rate, total_interest, total_due, paid_amount, status, term_months, created_at")
        if date_from:
            notes_query = notes_query.gte("created_at", date_from)
        notes_result = notes_query.execute()
        notes = notes_result.data or []

        # Get promissory note payments for capital vs interest breakdown
        note_payments_query = sb.table("promissory_note_payments") \
            .select("id, promissory_note_id, amount, paid_at")
        if date_from:
            note_payments_query = note_payments_query.gte("paid_at", date_from)
        note_payments_result = note_payments_query.execute()
        note_payments = note_payments_result.data or []

        # Build note lookup for interest calculation
        note_map = {n["id"]: n for n in notes}

        # Calculate returns: for each note, paid_amount up to loan_amount = capital, rest = interest
        total_retornado_capital = 0.0
        total_retornado_interes = 0.0

        # Group payments by note
        all_notes_for_calc = sb.table("promissory_notes") \
            .select("id, loan_amount, total_interest, paid_amount, status") \
            .execute()
        for n in (all_notes_for_calc.data or []):
            paid = float(n.get("paid_amount", 0) or 0)
            principal = float(n.get("loan_amount", 0))
            if paid <= principal:
                total_retornado_capital += paid
            else:
                total_retornado_capital += principal
                total_retornado_interes += paid - principal

        # Total invested in properties (actual deployed capital via investments table)
        inv_query = sb.table("investments") \
            .select("id, amount, status, invested_at")
        if date_from:
            inv_query = inv_query.gte("invested_at", date_from)
        inv_result = inv_query.execute()
        investments_data = inv_result.data or []
        total_invertido = sum(float(i.get("amount", 0)) for i in investments_data)
        active_investments = [i for i in investments_data if i.get("status") == "active"]

        # Tasa fondeo promedio (weighted average interest rate from active notes)
        active_notes = [n for n in notes if n.get("status") in ("active", "overdue")]
        if active_notes:
            weighted_sum = sum(float(n.get("loan_amount", 0)) * float(n.get("annual_rate", 0)) for n in active_notes)
            total_principal = sum(float(n.get("loan_amount", 0)) for n in active_notes)
            tasa_fondeo = round(weighted_sum / total_principal, 2) if total_principal > 0 else 0
        else:
            # Fallback to all notes
            all_notes_with_rate = [n for n in notes if n.get("annual_rate")]
            if all_notes_with_rate:
                weighted_sum = sum(float(n.get("loan_amount", 0)) * float(n.get("annual_rate", 0)) for n in all_notes_with_rate)
                total_principal = sum(float(n.get("loan_amount", 0)) for n in all_notes_with_rate)
                tasa_fondeo = round(weighted_sum / total_principal, 2) if total_principal > 0 else 0
            else:
                tasa_fondeo = 0

        return {
            "ok": True,
            "summary": {
                "total_captado": total_captado,
                "total_invertido": total_invertido,
                "total_disponible": total_disponible,
                "total_retornado_capital": round(total_retornado_capital, 2),
                "total_retornado_interes": round(total_retornado_interes, 2),
                "tasa_fondeo": tasa_fondeo,
                "active_investments": len(active_investments),
                "total_investments": len(investments_data),
                "period": period or "all",
            }
        }
    except Exception as e:
        logger.error(f"Error getting investments summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


