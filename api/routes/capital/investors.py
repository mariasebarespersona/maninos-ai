"""
Capital Investors - Investor management (Fondear)
Phase 6
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
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
    """List all investors."""
    try:
        query = sb.table("investors").select("*")
        if status:
            query = query.eq("status", status)
        result = query.order("created_at", desc=True).execute()
        return {"ok": True, "investors": result.data or []}
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
        
        return {
            "ok": True,
            "investor": investor.data,
            "investments": inv_data,
            "promissory_notes": notes_data,
            "metrics": {
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
        
        return {"ok": True, "investment": result.data[0]}
    except Exception as e:
        logger.error(f"Error creating investment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/investments/summary")
async def get_investments_summary():
    """Summary of all investments."""
    try:
        investments = sb.table("investments") \
            .select("*, investors(name), properties(address)") \
            .order("invested_at", desc=True) \
            .execute()
        
        data = investments.data or []
        total = sum(float(i.get("amount", 0)) for i in data)
        returned = sum(float(i.get("return_amount", 0)) for i in data if i.get("return_amount"))
        active = [i for i in data if i["status"] == "active"]
        
        return {
            "ok": True,
            "investments": data,
            "summary": {
                "total_investments": len(data),
                "active_investments": len(active),
                "total_invested": total,
                "total_returned": returned,
                "net_outstanding": total - returned,
            }
        }
    except Exception as e:
        logger.error(f"Error getting investments summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


