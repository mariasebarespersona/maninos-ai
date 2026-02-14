"""
Capital Flows - Track money movement: Fondear → Adquirir cycle
Investor $ in → Buy property → RTO payments → Returns to investor
"""

import logging
from datetime import datetime, date
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/flows", tags=["Capital - Flows"])


# =============================================================================
# SCHEMAS
# =============================================================================

class FlowCreate(BaseModel):
    flow_type: str  # investment_in, acquisition_out, rent_income, return_out, late_fee_income, operating_expense
    amount: float
    investor_id: Optional[str] = None
    investment_id: Optional[str] = None
    property_id: Optional[str] = None
    rto_contract_id: Optional[str] = None
    rto_payment_id: Optional[str] = None
    description: Optional[str] = None
    reference: Optional[str] = None
    flow_date: Optional[str] = None  # YYYY-MM-DD


class InvestmentLink(BaseModel):
    """Link an investor's investment to a specific RTO contract."""
    investor_id: str
    rto_contract_id: str
    amount: float
    expected_return_rate: float = 12.0  # default 12%
    notes: Optional[str] = None


class ReturnPayment(BaseModel):
    """Pay returns to an investor from collected payments."""
    investor_id: str
    investment_id: str
    amount: float
    notes: Optional[str] = None


# =============================================================================
# HELPERS
# =============================================================================

def _get_current_balance() -> float:
    """Calculate current capital pool balance from all flows."""
    try:
        flows = sb.table("capital_flows") \
            .select("amount") \
            .execute().data or []
        return sum(float(f.get("amount", 0)) for f in flows)
    except Exception:
        return 0.0


def _record_flow(flow_data: dict) -> dict:
    """Record a capital flow and update running balance."""
    balance = _get_current_balance() + float(flow_data.get("amount", 0))
    flow_data["balance_after"] = balance
    result = sb.table("capital_flows").insert(flow_data).execute()
    return result.data[0] if result.data else flow_data


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/")
async def list_flows(
    flow_type: Optional[str] = None,
    investor_id: Optional[str] = None,
    property_id: Optional[str] = None,
    limit: int = 50,
):
    """List capital flows with optional filters."""
    try:
        query = sb.table("capital_flows") \
            .select("*, investors(name), properties(address)")

        if flow_type:
            query = query.eq("flow_type", flow_type)
        if investor_id:
            query = query.eq("investor_id", investor_id)
        if property_id:
            query = query.eq("property_id", property_id)

        result = query.order("created_at", desc=True).limit(limit).execute()

        return {"ok": True, "flows": result.data or []}
    except Exception as e:
        logger.error(f"Error listing flows: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/summary")
async def get_flow_summary():
    """Get capital pool summary: total in, total out, balance."""
    try:
        flows = sb.table("capital_flows") \
            .select("flow_type, amount, flow_date") \
            .execute().data or []

        total_in = sum(float(f["amount"]) for f in flows if float(f["amount"]) > 0)
        total_out = sum(abs(float(f["amount"])) for f in flows if float(f["amount"]) < 0)
        balance = total_in - total_out

        by_type = {}
        for f in flows:
            ft = f["flow_type"]
            by_type[ft] = by_type.get(ft, 0) + float(f["amount"])

        # Monthly breakdown (last 6 months)
        from collections import defaultdict
        monthly = defaultdict(lambda: {"income": 0, "expenses": 0})
        for f in flows:
            month_key = f["flow_date"][:7]  # YYYY-MM
            amt = float(f["amount"])
            if amt > 0:
                monthly[month_key]["income"] += amt
            else:
                monthly[month_key]["expenses"] += abs(amt)

        monthly_sorted = sorted(monthly.items(), reverse=True)[:6]

        return {
            "ok": True,
            "summary": {
                "total_in": total_in,
                "total_out": total_out,
                "current_balance": balance,
                "by_type": by_type,
                "monthly": [
                    {"month": m, **data}
                    for m, data in monthly_sorted
                ],
                "total_flows": len(flows),
            }
        }
    except Exception as e:
        logger.error(f"Error getting flow summary: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/record")
async def record_flow(data: FlowCreate):
    """Record a capital flow manually."""
    try:
        valid_types = ["investment_in", "acquisition_out", "rent_income",
                       "return_out", "late_fee_income", "operating_expense"]
        if data.flow_type not in valid_types:
            raise HTTPException(status_code=400, detail=f"Tipo inválido. Válidos: {valid_types}")

        # Amount should be positive for income, negative for outgoing
        amount = data.amount
        if data.flow_type in ("acquisition_out", "return_out", "operating_expense"):
            amount = -abs(amount)  # Ensure negative
        else:
            amount = abs(amount)  # Ensure positive

        flow = _record_flow({
            "flow_type": data.flow_type,
            "amount": amount,
            "investor_id": data.investor_id,
            "investment_id": data.investment_id,
            "property_id": data.property_id,
            "rto_contract_id": data.rto_contract_id,
            "rto_payment_id": data.rto_payment_id,
            "description": data.description,
            "reference": data.reference,
            "flow_date": data.flow_date or date.today().isoformat(),
        })

        return {"ok": True, "flow": flow, "message": "Flujo de capital registrado."}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording flow: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/link-investment")
async def link_investment_to_contract(data: InvestmentLink):
    """
    Link an investor's funds to a specific RTO contract.
    This is the Fondear → Adquirir connection.
    1. Creates investment record linked to the contract
    2. Records capital flow (investment_in)
    3. Updates investor totals
    """
    try:
        # Validate investor
        investor = sb.table("investors") \
            .select("id, name, available_capital") \
            .eq("id", data.investor_id) \
            .execute()

        if not investor.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")

        inv = investor.data[0]
        available = float(inv.get("available_capital", 0))

        if data.amount > available:
            raise HTTPException(
                status_code=400,
                detail=f"Capital insuficiente. Disponible: ${available:,.0f}, Solicitado: ${data.amount:,.0f}"
            )

        # Validate contract
        contract = sb.table("rto_contracts") \
            .select("id, property_id, client_id, status, monthly_rent, purchase_price") \
            .eq("id", data.rto_contract_id) \
            .execute()

        if not contract.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")

        c = contract.data[0]

        # 1. Create investment
        investment = sb.table("investments").insert({
            "investor_id": data.investor_id,
            "property_id": c["property_id"],
            "rto_contract_id": data.rto_contract_id,
            "amount": data.amount,
            "expected_return_rate": data.expected_return_rate,
            "funding_purpose": "acquisition",
            "notes": data.notes or f"Inversión vinculada a contrato RTO",
        }).execute()

        investment_id = investment.data[0]["id"]

        # 2. Record capital flow
        flow = _record_flow({
            "flow_type": "investment_in",
            "amount": data.amount,
            "investor_id": data.investor_id,
            "investment_id": investment_id,
            "property_id": c["property_id"],
            "rto_contract_id": data.rto_contract_id,
            "description": f"Inversión de {inv['name']} para contrato RTO",
            "flow_date": date.today().isoformat(),
        })

        # 3. Update investment with flow ID
        sb.table("investments").update({
            "capital_flow_id": flow["id"],
        }).eq("id", investment_id).execute()

        # 4. Update investor totals
        sb.table("investors").update({
            "total_invested": float(inv.get("total_invested", 0) or 0) + data.amount,
            "available_capital": available - data.amount,
        }).eq("id", data.investor_id).execute()

        return {
            "ok": True,
            "investment_id": investment_id,
            "flow_id": flow["id"],
            "message": f"Inversión de ${data.amount:,.0f} vinculada al contrato. Capital restante: ${available - data.amount:,.0f}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error linking investment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/pay-return")
async def pay_investor_return(data: ReturnPayment):
    """
    Pay returns to an investor. This closes (or partially closes) an investment.
    Records the return as a capital_flow (return_out).
    """
    try:
        # Validate investment
        investment = sb.table("investments") \
            .select("*, investors(name, available_capital)") \
            .eq("id", data.investment_id) \
            .eq("investor_id", data.investor_id) \
            .execute()

        if not investment.data:
            raise HTTPException(status_code=404, detail="Inversión no encontrada")

        inv = investment.data[0]

        if inv["status"] == "returned":
            raise HTTPException(status_code=400, detail="Esta inversión ya fue retornada completamente")

        # Record capital flow (outgoing)
        flow = _record_flow({
            "flow_type": "return_out",
            "amount": -abs(data.amount),
            "investor_id": data.investor_id,
            "investment_id": data.investment_id,
            "property_id": inv.get("property_id"),
            "rto_contract_id": inv.get("rto_contract_id"),
            "description": data.notes or f"Retorno a {inv['investors']['name']}",
            "flow_date": date.today().isoformat(),
        })

        # Update investment
        existing_return = float(inv.get("return_amount", 0) or 0)
        new_return = existing_return + data.amount
        original_amount = float(inv.get("amount", 0))

        status = "returned" if new_return >= original_amount else "partial_return"

        sb.table("investments").update({
            "return_amount": new_return,
            "status": status,
            "returned_at": datetime.utcnow().isoformat() if status == "returned" else None,
        }).eq("id", data.investment_id).execute()

        # Update investor available capital
        current_available = float(inv["investors"].get("available_capital", 0) or 0)
        sb.table("investors").update({
            "available_capital": current_available + data.amount,
        }).eq("id", data.investor_id).execute()

        return {
            "ok": True,
            "flow_id": flow["id"],
            "total_returned": new_return,
            "investment_status": status,
            "message": f"Retorno de ${data.amount:,.0f} procesado. Total retornado: ${new_return:,.0f}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error paying return: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/investor-cycle/{investor_id}")
async def get_investor_capital_cycle(investor_id: str):
    """
    Get the full capital cycle for an investor:
    Investment → Property → RTO Contract → Payments → Returns
    """
    try:
        # Get investor
        investor = sb.table("investors") \
            .select("*") \
            .eq("id", investor_id) \
            .execute()

        if not investor.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")

        # Get all investments
        investments = sb.table("investments") \
            .select("*, properties(address, city, status), rto_contracts(id, monthly_rent, purchase_price, status, term_months, start_date, end_date, clients(name))") \
            .eq("investor_id", investor_id) \
            .order("invested_at", desc=True) \
            .execute().data or []

        # Get all flows for this investor
        flows = sb.table("capital_flows") \
            .select("*") \
            .eq("investor_id", investor_id) \
            .order("created_at", desc=True) \
            .execute().data or []

        # Calculate cycle metrics
        total_invested = sum(float(i.get("amount", 0)) for i in investments)
        total_returned = sum(float(i.get("return_amount", 0) or 0) for i in investments)
        active_investments = [i for i in investments if i["status"] == "active"]

        # Expected future returns from active investments
        expected_returns = 0
        for inv in active_investments:
            rate = float(inv.get("expected_return_rate", 0) or 0) / 100
            expected_returns += float(inv.get("amount", 0)) * (1 + rate)

        return {
            "ok": True,
            "investor": investor.data[0],
            "cycle": {
                "total_invested": total_invested,
                "total_returned": total_returned,
                "net_outstanding": total_invested - total_returned,
                "active_investments": len(active_investments),
                "expected_future_returns": expected_returns,
                "roi_to_date": ((total_returned / total_invested * 100) - 100) if total_invested > 0 else 0,
            },
            "investments": investments,
            "flows": flows[:20],  # Last 20 flows
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting investor cycle {investor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


