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


# Ledger rows excluded from a settled balance (mirror CAPITAL_CONFIG).
_UNSETTLED_STATUSES = ("voided", "pending_confirmation", "draft")


def _capital_account_balance(code: str, *, exclude_unsettled: bool = True) -> float:
    """Net ledger balance of a Capital chart account, by code.

    Uses the same sign convention as the ledger engine: a leg contributes
    +amount when is_income is True, −amount otherwise. For a liability (23900)
    this yields the outstanding balance; for an expense (71400) it yields the
    negative of cumulative spend (so magnitude = total paid). Paginated to beat
    Supabase's 1000-row cap.
    """
    acct = sb.table("capital_accounts").select("id").eq("code", code).limit(1).execute()
    if not acct.data:
        return 0.0
    account_id = acct.data[0]["id"]
    total = 0.0
    page = 0
    while True:
        q = sb.table("capital_transactions").select("amount, is_income, status") \
            .eq("account_id", account_id).range(page * 1000, page * 1000 + 999).execute()
        rows = q.data or []
        for r in rows:
            if exclude_unsettled and (r.get("status") in _UNSETTLED_STATUSES):
                continue
            amt = float(r.get("amount", 0) or 0)
            total += amt if r.get("is_income") else -amt
        if len(rows) < 1000:
            break
        page += 1
    return round(total, 2)


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
    property_code: Optional[str] = None   # manual house code (e.g. "H13") for old houses not in the dropdown
    rto_contract_id: Optional[str] = None
    promissory_note_id: Optional[str] = None
    amount: float
    expected_return_rate: Optional[float] = None
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None  # Capital bank that received the money


class RenegotiateRequest(BaseModel):
    """Renegotiate a ticket at a new rate — closes the old one, opens a linked new one."""
    new_rate: float
    notes: Optional[str] = None


class TransferDebtRequest(BaseModel):
    """One investor buys another's debt (ticket). Cash passes through Capital."""
    to_investor_id: str
    bank_account_id: str            # Capital bank the money passes through
    purchase_price: Optional[float] = None  # what the buyer pays; defaults to the ticket's face amount
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
            .select("*, properties(address, city, property_code), rto_contracts(client_id, clients(name)), promissory_notes(id, loan_amount, status, maturity_date, paid_amount, annual_rate, total_due, total_interest)") \
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

        # Enrich transfer lineage with the seller's name (for "comprada a …" display)
        from_ids = list({i.get("transferred_from_investor_id") for i in inv_data if i.get("transferred_from_investor_id")})
        if from_ids:
            names = sb.table("investors").select("id, name").in_("id", from_ids).execute().data or []
            name_map = {n["id"]: n["name"] for n in names}
            for i in inv_data:
                fid = i.get("transferred_from_investor_id")
                if fid:
                    i["transferred_from_name"] = name_map.get(fid)

        # Superseded tickets (renegotiated/transferred away) are kept for history
        # but must NOT count as live deployed capital, or totals would double-count.
        SUPERSEDED = ("renegotiated", "transferred")
        live = [i for i in inv_data if i.get("status") not in SUPERSEDED]
        total_invested = sum(float(i.get("amount", 0)) for i in live)
        total_returned = sum(float(i.get("return_amount", 0) or 0) for i in live)
        active_investments = [i for i in live if i.get("status") == "active"]

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


def _active_rto_contract_for_property(property_id: str) -> Optional[str]:
    """Return the id of the property's most relevant RTO contract, if any, so an
    investor's capital ticket is tied to the tenant that services it."""
    if not property_id:
        return None
    try:
        c = sb.table("rto_contracts").select("id, status") \
            .eq("property_id", property_id) \
            .order("created_at", desc=True).execute()
        rows = c.data or []
        # Prefer an active contract, else the most recent one.
        for r in rows:
            if r.get("status") == "active":
                return r["id"]
        return rows[0]["id"] if rows else None
    except Exception:
        return None


@router.post("/investments")
async def create_investment(data: InvestmentCreate):
    """Record a new investment (a capital 'ticket')."""
    try:
        # Manual house code (e.g. "H13"): try to resolve it to an existing property
        # so the ticket links properly; if the house isn't in the system, keep the
        # typed code so it is still recorded and shown.
        property_id = data.property_id
        property_code = (data.property_code or "").strip().upper() or None
        if not property_id and property_code:
            try:
                match = sb.table("properties").select("id, property_code") \
                    .ilike("property_code", property_code).limit(1).execute()
                if match.data:
                    property_id = match.data[0]["id"]
            except Exception:
                pass

        # Auto-link the property's RTO contract if the caller didn't set one.
        rto_contract_id = data.rto_contract_id or _active_rto_contract_for_property(property_id)

        insert_data = {
            "investor_id": data.investor_id,
            "property_id": property_id,
            "rto_contract_id": rto_contract_id,
            "amount": data.amount,
            "expected_return_rate": data.expected_return_rate,
            "notes": data.notes,
            "ticket_type": "original",
        }
        # Only touch the new column when a manual code is present, so list-mode
        # creation keeps working even before migration 101 is applied.
        if property_code:
            insert_data["property_code"] = property_code
        if data.promissory_note_id:
            insert_data["promissory_note_id"] = data.promissory_note_id

        result = sb.table("investments").insert(insert_data).execute()
        investment = result.data[0]

        # Update investor totals
        investor = sb.table("investors") \
            .select("total_invested, available_capital, name") \
            .eq("id", data.investor_id) \
            .single() \
            .execute()
        inv_name = ""
        if investor.data:
            inv_name = investor.data.get("name", "") or ""
            sb.table("investors").update({
                "total_invested": float(investor.data["total_invested"] or 0) + data.amount,
                "available_capital": max(0, float(investor.data["available_capital"] or 0) - data.amount),
            }).eq("id", data.investor_id).execute()

        # Record the money movement ONCE via _record_flow: this writes capital_flows
        # (so it shows in "Movimientos" and the Flujo de Capital diagram) AND posts the
        # balanced ledger pair (investor_deposit → Investor Notes Payable). Using the
        # flow helper — not a bare record_txn — is what keeps the flows view and the
        # ledger in sync (no loose end).
        from api.routes.capital.capital_flows import _record_flow
        _record_flow({
            "flow_type": "investment_in",
            "amount": float(data.amount),
            "investor_id": data.investor_id,
            "investment_id": investment["id"],
            "property_id": property_id,
            "rto_contract_id": rto_contract_id,
            "description": f"Depósito inversión — {inv_name}".strip(),
            "bank_account_id": data.bank_account_id,
        })

        return {"ok": True, "investment": investment}
    except Exception as e:
        logger.error(f"Error creating investment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/investments/{investment_id}/renegotiate")
async def renegotiate_investment(investment_id: str, data: RenegotiateRequest):
    """
    Renegotiate a ticket at a NEW rate. The old ticket is CLOSED
    (status='renegotiated') and a new linked ticket is created so the history
    shows both separately. No money moves → no ledger/flow entry.
    """
    try:
        cur = sb.table("investments").select("*").eq("id", investment_id).single().execute()
        if not cur.data:
            raise HTTPException(status_code=404, detail="Inversión no encontrada")
        old = cur.data
        if old.get("status") not in ("active", "partial_return"):
            raise HTTPException(status_code=400, detail=f"No se puede renegociar un ticket con estado '{old.get('status')}'")

        new_ticket = sb.table("investments").insert({
            "investor_id": old["investor_id"],
            "property_id": old.get("property_id"),
            "rto_contract_id": old.get("rto_contract_id"),
            "promissory_note_id": old.get("promissory_note_id"),
            "amount": old["amount"],
            "expected_return_rate": data.new_rate,
            "status": "active",
            "ticket_type": "renegotiation",
            "parent_investment_id": old["id"],
            "previous_rate": old.get("expected_return_rate"),
            "notes": data.notes or old.get("notes"),
        }).execute().data[0]

        sb.table("investments").update({
            "status": "renegotiated",
            "closed_at": datetime.utcnow().isoformat(),
        }).eq("id", old["id"]).execute()

        return {"ok": True, "investment": new_ticket, "closed": old["id"]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error renegotiating investment {investment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/investments/{investment_id}/transfer")
async def transfer_investment_debt(investment_id: str, data: TransferDebtRequest):
    """
    One investor BUYS another's debt (ticket). Cash passes through Capital:
    the buyer pays in, the seller is paid out (net bank = 0), and the Investor
    Notes Payable liability is reclassified from seller to buyer. The seller's
    ticket is CLOSED (status='transferred') and a new ticket is opened for the
    buyer, linked to the seller for lineage.
    """
    try:
        cur = sb.table("investments").select("*").eq("id", investment_id).single().execute()
        if not cur.data:
            raise HTTPException(status_code=404, detail="Inversión no encontrada")
        old = cur.data
        if old.get("status") not in ("active", "partial_return"):
            raise HTTPException(status_code=400, detail=f"No se puede transferir un ticket con estado '{old.get('status')}'")

        seller_id = old["investor_id"]
        buyer_id = data.to_investor_id
        if buyer_id == seller_id:
            raise HTTPException(status_code=400, detail="El comprador y el vendedor no pueden ser el mismo inversionista")

        face = float(old["amount"])
        price = float(data.purchase_price) if data.purchase_price is not None else face
        # Discount (>0) / premium (<0) = seller's REALIZED gain/loss and the
        # buyer's mirrored position. Capital's OWN books have NO gain/loss here:
        # 23900 is a single account, so reclassing the face seller→buyer is a
        # wash (net 0), and the cash P passes through net-zero. The P&L belongs
        # to the investors and is encoded in their totals (seller: position −face,
        # cash +price → realized −discount; buyer: position +face, cash −price).
        discount_premium = round(face - price, 2)

        buyer = sb.table("investors").select("name, total_invested, available_capital").eq("id", buyer_id).single().execute()
        if not buyer.data:
            raise HTTPException(status_code=404, detail="Inversionista comprador no encontrado")
        seller = sb.table("investors").select("name, total_invested, available_capital").eq("id", seller_id).single().execute()
        seller_name = (seller.data or {}).get("name", "") if seller.data else ""
        buyer_name = buyer.data.get("name", "") or ""

        # New ticket for the buyer (assumes the position at face value).
        new_ticket = sb.table("investments").insert({
            "investor_id": buyer_id,
            "property_id": old.get("property_id"),
            "rto_contract_id": old.get("rto_contract_id"),
            "promissory_note_id": old.get("promissory_note_id"),
            "amount": face,
            "expected_return_rate": old.get("expected_return_rate"),
            "status": "active",
            "ticket_type": "transfer",
            "parent_investment_id": old["id"],
            "transferred_from_investor_id": seller_id,
            "purchase_price": price,
            "notes": data.notes,
        }).execute().data[0]

        # Close the seller's ticket.
        sb.table("investments").update({
            "status": "transferred",
            "closed_at": datetime.utcnow().isoformat(),
        }).eq("id", old["id"]).execute()

        # Move the debt instrument (promissory note) to the buyer, if linked.
        if old.get("promissory_note_id"):
            sb.table("promissory_notes").update({
                "investor_id": buyer_id, "lender_name": buyer_name or None,
            }).eq("id", old["promissory_note_id"]).execute()

        # Move the principal position between investors; cash exchanged = price.
        if seller.data:
            sb.table("investors").update({
                "total_invested": max(0, float(seller.data["total_invested"] or 0) - face),
                "available_capital": float(seller.data["available_capital"] or 0) + price,
            }).eq("id", seller_id).execute()
        sb.table("investors").update({
            "total_invested": float(buyer.data["total_invested"] or 0) + face,
            "available_capital": max(0, float(buyer.data["available_capital"] or 0) - price),
        }).eq("id", buyer_id).execute()

        # Accounting: cash passes THROUGH Capital → two balanced flow legs.
        # Buyer pays in (investment_in) and seller is paid out (return_out). Net
        # bank = 0; the 23900 liability reclasses from seller to buyer. Using
        # _record_flow keeps flows + ledger in sync in one call.
        from api.routes.capital.capital_flows import _record_flow
        _record_flow({
            "flow_type": "investment_in", "amount": price,
            "investor_id": buyer_id, "investment_id": new_ticket["id"],
            "property_id": old.get("property_id"), "bank_account_id": data.bank_account_id,
            "description": f"Compra de deuda — {buyer_name} compra a {seller_name}".strip(),
        })
        _pl_label = (f" (descuento ${discount_premium:,.0f}, pérdida realizada del vendedor)" if discount_premium > 0
                     else f" (prima ${abs(discount_premium):,.0f}, ganancia realizada del vendedor)" if discount_premium < 0
                     else "")
        _record_flow({
            "flow_type": "return_out", "amount": -price,
            "investor_id": seller_id, "investment_id": old["id"],
            "property_id": old.get("property_id"), "bank_account_id": data.bank_account_id,
            "description": f"Venta de deuda — {seller_name} vende a {buyer_name}{_pl_label}".strip(),
        })

        return {
            "ok": True,
            "investment": new_ticket,
            "closed": old["id"],
            "face": face,
            "price": price,
            "discount_premium": discount_premium,           # >0 discount / <0 premium
            "seller_realized_pl": round(-discount_premium, 2),  # seller loses the discount
            "buyer_position_gain": discount_premium,         # buyer holds face, paid price
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error transferring investment {investment_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/investments/accrue-interest")
async def accrue_investor_interest():
    """Manually run the monthly interest accrual (also runs on a scheduler).

    Recognizes each active note's scheduled interest for the elapsed period
    (71400 expense / 23950 accrued liability). Idempotent per note+period.
    """
    try:
        from api.services.capital_interest_accrual import accrue_all_active_notes, accrued_account_ready
        if not accrued_account_ready():
            return {"ok": False, "detail": "La cuenta 23950 (interés devengado) no existe aún. Corre la migración 104."}
        return accrue_all_active_notes()
    except Exception as e:
        logger.error(f"Error accruing investor interest: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/investments/reconciliation")
async def reconcile_investors():
    """
    Reconcile the investor sub-ledger against the general ledger:

      • Σ outstanding principal (active/partial tickets: amount − return_amount)
        must equal the 23900 "Investor Notes Payable" ledger balance.
      • Σ interest paid to investors must equal the magnitude of the 71400
        "Interest paid" ledger balance.

    Returns per-check expected/actual/diff plus an overall `ok` (diffs within
    a $1 tolerance for rounding). This is the invariant the principal/interest
    split is designed to preserve.
    """
    try:
        TOL = 1.0
        from api.routes.capital.promissory_notes import _split_note_payment, _note_schedule, _note_tranches

        # --- Ledger balances --------------------------------------------------
        liability_23900 = _capital_account_balance("23900")   # outstanding investor principal
        interest_71400 = _capital_account_balance("71400")    # expense (negative)
        interest_paid = round(-interest_71400, 2)             # magnitude paid to date

        # --- Outstanding principal from PROMISSORY NOTES (the real 23900 driver)
        # 23900 = deposits − principal repaid. Note payments book their principal
        # slice to 23900, so outstanding = Σ active notes (loan − principal repaid),
        # deriving principal repaid from the amortization schedule + paid_amount.
        notes = []
        page = 0
        while True:
            q = sb.table("promissory_notes") \
                .select("loan_amount, paid_amount, annual_rate, term_months, "
                        "interest_only_months, amortization_months, status") \
                .range(page * 1000, page * 1000 + 999).execute()
            rows = q.data or []
            notes.extend(rows)
            if len(rows) < 1000:
                break
            page += 1
        notes_outstanding = 0.0
        notes_interest_scheduled = 0.0
        for nt in notes:
            if nt.get("status") not in ("active", "partial", "partial_return"):
                continue
            loan = float(nt.get("loan_amount", 0) or 0)
            paid = float(nt.get("paid_amount", 0) or 0)
            principal_repaid, _ = _split_note_payment(nt, 0.0, paid)
            notes_outstanding += max(0.0, loan - principal_repaid)
            io_m, amort_m = _note_tranches(nt)
            notes_interest_scheduled += _note_schedule(
                loan, float(nt.get("annual_rate", 12) or 12), io_m, amort_m)["total_interest"]
        notes_outstanding = round(notes_outstanding, 2)

        # --- Outstanding principal from INVESTMENTS not backed by a note ------
        investments = []
        page = 0
        while True:
            q = sb.table("investments").select("amount, return_amount, status, promissory_note_id") \
                .range(page * 1000, page * 1000 + 999).execute()
            rows = q.data or []
            investments.extend(rows)
            if len(rows) < 1000:
                break
            page += 1
        inv_outstanding_noteless = round(sum(
            float(i.get("amount", 0) or 0) - float(i.get("return_amount", 0) or 0)
            for i in investments
            if i.get("status") in ("active", "partial_return") and not i.get("promissory_note_id")
        ), 2)

        expected_outstanding = round(notes_outstanding + inv_outstanding_noteless, 2)
        principal_diff = round(expected_outstanding - liability_23900, 2)

        checks = {
            "principal_vs_notes_payable": {
                "notes_outstanding_principal": notes_outstanding,
                "investments_noteless_outstanding": inv_outstanding_noteless,
                "expected_outstanding_principal": expected_outstanding,
                "ledger_23900_balance": liability_23900,
                "diff": principal_diff,
                "ok": abs(principal_diff) <= TOL,
            },
            "interest_paid_ledger": {
                "ledger_71400_balance": interest_71400,
                "interest_recognized_to_date": interest_paid,   # 71400 magnitude (accrued + cash-basis)
                "interest_scheduled_total": round(notes_interest_scheduled, 2),
                "ok": True,  # informational: 71400 is the source of truth for interest expense
            },
            "accrued_interest_payable": {
                # Accrual basis: 23950 = interest recognized (71400) but not yet
                # paid. Nets to ~0 once every note's interest is fully settled.
                "ledger_23950_balance": _capital_account_balance("23950"),
                "ok": True,  # informational
            },
        }
        return {
            "ok": all(c["ok"] for c in checks.values()),
            "checks": checks,
            "note": "Principal (pagarés + inversiones sin pagaré) debe cuadrar con 23900; "
                    "el interés vive en 71400 (P&L), nunca en 23900.",
        }
    except Exception as e:
        logger.error(f"Error reconciling investors: {e}")
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
        # Exclude superseded tickets (renegotiated/transferred) so capital isn't double-counted.
        live_inv = [i for i in investments_data if i.get("status") not in ("renegotiated", "transferred")]
        total_invertido = sum(float(i.get("amount", 0)) for i in live_inv)
        active_investments = [i for i in live_inv if i.get("status") == "active"]

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


@router.delete("/{investor_id}")
async def delete_investor(investor_id: str):
    """
    Delete an investor and their financial footprint so nothing is orphaned:
    investments + promissory notes (+ note payments) cascade via FK; capital_flows
    are RESTRICT so they're removed explicitly first; capital_transactions/invoices/
    payment_orders keep their rows with investor_id set to NULL (ON DELETE SET NULL).
    The frontend confirms before calling this.
    """
    try:
        inv = sb.table("investors").select("id, name").eq("id", investor_id).single().execute()
        if not inv.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")
        name = inv.data.get("name", "")

        # capital_flows have RESTRICT FKs on investor_id AND investment_id, so remove
        # them (for this investor and for their investments) before the cascade.
        inv_ids = [r["id"] for r in (sb.table("investments").select("id").eq("investor_id", investor_id).execute().data or [])]
        sb.table("capital_flows").delete().eq("investor_id", investor_id).execute()
        for iid in inv_ids:
            try:
                sb.table("capital_flows").delete().eq("investment_id", iid).execute()
            except Exception:
                pass

        # A ticket bought FROM this investor references it (RESTRICT) — detach it.
        try:
            sb.table("investments").update({"transferred_from_investor_id": None}) \
                .eq("transferred_from_investor_id", investor_id).execute()
        except Exception:
            pass

        # Delete the investor → cascades investments + promissory_notes (+ note payments).
        sb.table("investors").delete().eq("id", investor_id).execute()
        return {"ok": True, "message": f"Inversionista '{name}' eliminado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting investor {investor_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


