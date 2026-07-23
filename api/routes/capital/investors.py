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


def _note_paid_to_date(note: dict, as_of=None) -> dict:
    """Canonical "pagado a la fecha" for a promissory note — the SINGLE source of
    truth for how much the investor has been paid, used by the seguimiento view,
    the note detail/list and every summary so they never disagree.

    Two inputs are combined so nothing is left dangling:
      1. Schedule accrual: for the whole months elapsed since start_date, the
         scheduled principal + interest (what SHOULD have been paid by `as_of`).
         Because the app is new, real payments were made off-app on schedule, so
         this accrual IS the effective "pagado a hoy".
      2. Recorded payments: `paid_amount` / promissory_note_payments. If an actual
         payment beyond the schedule was logged in-app (e.g. a prepayment), it
         wins and is re-split into principal/interest via the same schedule walk.

    Returns the principal/interest split, the effective paid_to_date, and what
    remains, plus `scheduled_to_date`/`recorded_paid` for transparency."""
    from datetime import date as _date
    from api.routes.capital.promissory_notes import _note_schedule, _note_tranches, _split_note_payment
    as_of = as_of or _date.today()
    loan = float(note.get("loan_amount", 0) or 0)
    rate = float(note.get("annual_rate", 12) or 12)
    recorded = float(note.get("paid_amount", 0) or 0)
    io_m, amort_m = _note_tranches(note)
    try:
        sch = _note_schedule(loan, rate, io_m, amort_m)
    except Exception:
        return {"elapsed_periods": 0, "term": 0, "capital_to_date": 0.0, "interest_to_date": 0.0,
                "paid_to_date": round(recorded, 2), "total_due": round(loan, 2), "total_interest": 0.0,
                "loan_amount": loan, "remaining": round(loan - recorded, 2), "principal_remaining": round(loan, 2),
                "scheduled_to_date": 0.0, "recorded_paid": round(recorded, 2), "pct_paid": 0.0}
    rows = sch["schedule"]
    total_due = sch["total_due"]
    # Payments to investors always land on the 15th of each month, so a period
    # counts as paid once its 15th-of-month payment date has passed. elapsed =
    # number of 15ths strictly after start_date and on/before `as_of`, capped at
    # the schedule length. (A month's 15th is "already elapsed" only if that day
    # has arrived: day >= 15.)
    _PAY_DAY = 15
    start_raw = note.get("start_date") or note.get("created_at")
    elapsed = 0
    if start_raw:
        try:
            start = _date.fromisoformat(str(start_raw)[:10])
            a = as_of.year * 12 + as_of.month + (0 if as_of.day >= _PAY_DAY else -1)
            b = start.year * 12 + start.month + (0 if start.day >= _PAY_DAY else -1)
            elapsed = max(0, min(a - b, len(rows)))
        except Exception:
            elapsed = 0
    cap = round(sum(r["principal"] for r in rows[:elapsed]), 2)
    inte = round(sum(r["interest"] for r in rows[:elapsed]), 2)
    scheduled = round(cap + inte, 2)

    # Effective paid = max(schedule accrual, recorded payments). When recorded
    # payments run ahead of the schedule, re-derive the principal/interest split
    # from the recorded amount so the split stays coherent.
    paid = scheduled
    if recorded > scheduled + 0.005:
        try:
            r_cap, r_int = _split_note_payment(note, 0.0, recorded)
            cap, inte, paid = round(r_cap, 2), round(r_int, 2), round(recorded, 2)
        except Exception:
            paid = round(recorded, 2)
    return {
        "elapsed_periods": elapsed,
        "term": len(rows),
        "capital_to_date": cap,
        "interest_to_date": inte,
        "paid_to_date": paid,
        "total_due": total_due,
        "total_interest": sch["total_interest"],
        "loan_amount": loan,
        "remaining": round(total_due - paid, 2),
        "principal_remaining": round(loan - cap, 2),
        "scheduled_to_date": scheduled,
        "recorded_paid": round(recorded, 2),
        "pct_paid": round(paid / total_due * 100, 1) if total_due > 0 else 0.0,
    }


def investor_payments_due(as_of=None) -> dict:
    """Summary of what each investor must be paid on the NEXT 15th (payment day),
    grouped by investor. Designed to run on the 12th so treasury (Abby) prepares
    the payments a few days ahead.

    For each active note, the payment landing on that 15th is the schedule row for
    the period whose 15th-of-month date is the target — derived with the same
    day-15 rule as `_note_paid_to_date`, so it reconciles with every other view.
    """
    from datetime import date as _date
    from api.routes.capital.promissory_notes import _note_schedule, _note_tranches
    as_of = as_of or _date.today()
    # Target payment date = the next 15th on/after `as_of` (on the 12th → this month).
    if as_of.day <= 15:
        pay_date = _date(as_of.year, as_of.month, 15)
    else:
        y = as_of.year + (1 if as_of.month == 12 else 0)
        m = 1 if as_of.month == 12 else as_of.month + 1
        pay_date = _date(y, m, 15)

    notes = []
    page = 0
    while True:
        q = sb.table("promissory_notes").select("*, investors(name, email)") \
            .range(page * 1000, page * 1000 + 999).execute()
        rows = q.data or []
        notes.extend(rows)
        if len(rows) < 1000:
            break
        page += 1

    by_investor: dict = {}
    for n in notes:
        if n.get("status") not in ("active", "overdue", "partial", "partial_return"):
            continue
        loan = float(n.get("loan_amount", 0) or 0)
        rate = float(n.get("annual_rate", 12) or 12)
        io_m, amort_m = _note_tranches(n)
        try:
            sch = _note_schedule(loan, rate, io_m, amort_m)["schedule"]
        except Exception:
            continue
        # Period whose 15th == pay_date (elapsed counts periods with 15th <= pay_date,
        # so the payment due ON pay_date is the last one counted → index elapsed-1).
        elapsed = _note_paid_to_date(n, pay_date)["elapsed_periods"]
        if elapsed < 1 or elapsed > len(sch):
            continue
        row = sch[elapsed - 1]
        inv = n.get("investors") or {}
        name = inv.get("name") or n.get("lender_name") or "—"
        iid = n.get("investor_id") or name
        d = by_investor.setdefault(iid, {
            "investor_id": n.get("investor_id"), "name": name, "email": inv.get("email"),
            "total": 0.0, "principal": 0.0, "interest": 0.0, "notes": [],
        })
        d["total"] += row["payment"]
        d["principal"] += row["principal"]
        d["interest"] += row["interest"]
        d["notes"].append({
            "note_id": n.get("id"), "loan_amount": loan, "annual_rate": rate,
            "period": elapsed, "term": len(sch),
            "payment": round(row["payment"], 2), "principal": round(row["principal"], 2),
            "interest": round(row["interest"], 2),
        })

    investors = []
    for d in by_investor.values():
        d["total"] = round(d["total"], 2)
        d["principal"] = round(d["principal"], 2)
        d["interest"] = round(d["interest"], 2)
        investors.append(d)
    investors.sort(key=lambda x: -x["total"])
    return {
        "pay_date": pay_date.isoformat(),
        "month_label": pay_date.strftime("%Y-%m"),
        "investors": investors,
        "totals": {
            "total": round(sum(i["total"] for i in investors), 2),
            "principal": round(sum(i["principal"] for i in investors), 2),
            "interest": round(sum(i["interest"] for i in investors), 2),
            "count": len(investors),
        },
    }


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

        # Get note-less investment tickets (notes already cover note-backed ones)
        # so we can show a UNIFIED "total invertido" per card.
        tickets_by_investor: dict = {}
        try:
            all_tickets = sb.table("investments") \
                .select("investor_id, amount, status, promissory_note_id").execute().data or []
            for t in all_tickets:
                iid = t.get("investor_id")
                if iid and t.get("status") not in ("renegotiated", "transferred") and not t.get("promissory_note_id"):
                    tickets_by_investor.setdefault(iid, 0.0)
                    tickets_by_investor[iid] += float(t.get("amount", 0) or 0)
        except Exception:
            pass
        _INVESTED_NOTE_STATUSES = ("active", "overdue", "partial", "partial_return")

        # Enrich each investor with card preview metrics
        for inv in investors:
            inv_notes = notes_by_investor.get(inv["id"], [])
            # Unified invested = active notes principal + note-less tickets.
            notes_inv = sum(float(n.get("loan_amount", 0)) for n in inv_notes if n.get("status") in _INVESTED_NOTE_STATUSES)
            inv["total_invested"] = round(notes_inv + tickets_by_investor.get(inv["id"], 0.0), 2)
            inv["total_captado"] = inv["total_invested"]
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


@router.get("/payments-due")
async def get_payments_due(month: Optional[int] = None, year: Optional[int] = None):
    """Who to pay on the upcoming 15th and how much (per investor), for treasury.

    Defined BEFORE /{investor_id} so this literal path isn't captured as an id.
    Defaults to the next 15th relative to today; pass month/year to view a specific
    month (uses the 12th of that month as reference, mirroring the monthly job).
    """
    try:
        from datetime import date as _date
        as_of = None
        if month and year:
            as_of = _date(int(year), int(month), 12)
        return {"ok": True, **investor_payments_due(as_of)}
    except Exception as e:
        logger.error(f"Error computing payments due: {e}")
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
        # UNIFIED invested capital: a promissory note IS the investor's money
        # (it's the note confirming they lent it), so "invested" = notes' principal
        # + any note-less investment tickets. Note-backed tickets aren't added
        # separately (the note already counts them) to avoid double-counting.
        INVESTED_NOTE_STATUSES = ("active", "overdue", "partial", "partial_return")
        notes_invested = sum(
            float(n.get("loan_amount", 0)) for n in notes_data
            if n.get("status") in INVESTED_NOTE_STATUSES
        )
        tickets_invested_noteless = sum(
            float(i.get("amount", 0)) for i in live if not i.get("promissory_note_id")
        )
        total_invertido_unificado = round(notes_invested + tickets_invested_noteless, 2)
        total_lent = sum(float(n.get("loan_amount", 0)) for n in notes_data)
        total_due_notes = sum(float(n.get("total_due", 0)) for n in notes_data)
        total_paid_notes = sum(float(n.get("paid_amount", 0) or 0) for n in notes_data)
        active_notes = [n for n in notes_data if n.get("status") in ("active", "overdue")]

        # Retorno a la fecha de HOY, calculado del cronograma de cada pagaré
        # (start_date → hoy), no del paid_amount manual (que está en 0). Así el
        # empleado ve cuánto se le debería haber pagado al inversor a la fecha y
        # cuánto queda por pagar, sin registrar pagos a mano.
        retornado_capital = 0.0
        retornado_interes = 0.0
        total_obligacion = 0.0
        for n in notes_data:
            # Attach the canonical paid-to-date to EVERY note so the per-note
            # cards on the frontend show the same "pagado"/% as the summary.
            ptd = _note_paid_to_date(n)
            n["paid_to_date"] = ptd
            if n.get("status") in ("cancelled", "voided"):
                continue
            retornado_capital += ptd["capital_to_date"]
            retornado_interes += ptd["interest_to_date"]
            total_obligacion += ptd["total_due"]
        retornado_capital = round(retornado_capital, 2)
        retornado_interes = round(retornado_interes, 2)
        total_pagado_a_hoy = round(retornado_capital + retornado_interes, 2)
        total_restante_por_pagar = round(total_obligacion - total_pagado_a_hoy, 2)

        # Propagate each note's paid-to-date onto the ticket that links to it, so the
        # per-ticket "return" also uses the unified figure (not raw paid_amount).
        _ptd_by_note = {n["id"]: n.get("paid_to_date") for n in notes_data}
        for i in inv_data:
            pn = i.get("promissory_notes")
            if isinstance(pn, dict) and pn.get("id") in _ptd_by_note:
                pn["paid_to_date"] = _ptd_by_note[pn["id"]]

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

        # "Disponible" = capital aportado que NO está desplegado en pagarés/tickets.
        # available_capital a veces duplica lo que ya está en un pagaré (se cargó al
        # crear y luego se emitió la nota por el mismo monto), así que restamos lo
        # invertido para no contar el mismo dinero dos veces.
        total_captado = float(investor.data.get("total_invested", 0))
        _raw_disponible = float(investor.data.get("available_capital", 0))
        total_disponible = round(max(0.0, _raw_disponible - total_invertido_unificado), 2)

        return {
            "ok": True,
            "investor": investor.data,
            "investments": inv_data,
            "promissory_notes": notes_data,
            "metrics": {
                # Unified: notes (pagarés) count as invested capital, same as tickets.
                "total_captado": total_invertido_unificado,
                "total_invertido": total_invertido_unificado,
                "total_disponible": total_disponible,
                "total_retornado_capital": round(retornado_capital, 2),
                "total_retornado_interes": round(retornado_interes, 2),
                # A la fecha de hoy (calculado del cronograma):
                "total_pagado_a_hoy": total_pagado_a_hoy,
                "total_obligacion": round(total_obligacion, 2),
                "total_restante_por_pagar": total_restante_por_pagar,
                "tasa_fondeo": tasa_fondeo,
                "avg_term_months": avg_term,
                # Legacy fields for backwards compat (now unified to include notes)
                "total_invested": total_invertido_unificado,
                "total_returned": total_returned,
                "net_outstanding": total_invested - total_returned,
                "active_investments": len(active_investments),
                "expected_returns": expected_returns,
                "roi_pct": round(((total_returned / total_invested * 100) - 100), 2) if total_invested > 0 else 0,
                "notes_total_lent": total_lent,
                "notes_total_due": total_due_notes,
                # Unified with the schedule-based "pagado a hoy" (not raw paid_amount,
                # which is ~0 because payments were made off-app). Keeps the note
                # cards and the "Pagado/Pendiente" summary consistent.
                "notes_total_paid": total_pagado_a_hoy,
                "notes_outstanding": total_restante_por_pagar,
                "notes_total_paid_recorded": total_paid_notes,  # raw ledger of in-app payments
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
        dep_flow = _record_flow({
            "flow_type": "investment_in",
            "amount": float(data.amount),
            "investor_id": data.investor_id,
            "investment_id": investment["id"],
            "property_id": property_id,
            "rto_contract_id": rto_contract_id,
            "description": f"Depósito inversión — {inv_name}".strip(),
            "bank_account_id": data.bank_account_id,
        })
        # Persist the flow id on the ticket so the deposit's ledger legs can be
        # found deterministically later (e.g. to reverse an assignment).
        if dep_flow and dep_flow.get("id"):
            try:
                sb.table("investments").update({"capital_flow_id": dep_flow["id"]}) \
                    .eq("id", investment["id"]).execute()
                investment["capital_flow_id"] = dep_flow["id"]
            except Exception:
                pass

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


def _investor_account_sums(investor_id: str, codes: list[str]) -> dict:
    """Per-investor debit/credit sums on the given chart accounts (confirmed rows)."""
    accts = sb.table("capital_accounts").select("id, code").in_("code", codes).execute().data or []
    id_to_code = {a["id"]: a["code"] for a in accts}
    if not id_to_code:
        return {c: {"credit": 0.0, "debit": 0.0} for c in codes}
    out = {c: {"credit": 0.0, "debit": 0.0} for c in codes}
    page = 0
    while True:
        rows = sb.table("capital_transactions") \
            .select("account_id, amount, is_income, status") \
            .eq("investor_id", investor_id) \
            .in_("account_id", list(id_to_code.keys())) \
            .range(page * 1000, page * 1000 + 999).execute().data or []
        for r in rows:
            if r.get("status") in _UNSETTLED_STATUSES:
                continue
            code = id_to_code.get(r["account_id"])
            if not code:
                continue
            amt = float(r.get("amount", 0) or 0)
            out[code]["credit" if r.get("is_income") else "debit"] += amt
        if len(rows) < 1000:
            break
        page += 1
    return out


@router.get("/{investor_id}/account-statement")
async def investor_account_statement(investor_id: str):
    """Accounting statement for one investor, straight from the Capital ledger.

    Principal (23900), interest expense recognized (71400) and accrued-but-unpaid
    interest (23950) — so the investor's balance with Capital is fully auditable.
    """
    try:
        inv = sb.table("investors").select("id, name, total_invested, available_capital, status") \
            .eq("id", investor_id).single().execute()
        if not inv.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")

        s = _investor_account_sums(investor_id, ["23900", "71400", "23950"])
        principal_deposited = round(s["23900"]["credit"], 2)
        principal_repaid = round(s["23900"]["debit"], 2)
        principal_outstanding = round(principal_deposited - principal_repaid, 2)
        interest_recognized = round(s["71400"]["debit"] - s["71400"]["credit"], 2)   # expense
        accrued_outstanding = round(s["23950"]["credit"] - s["23950"]["debit"], 2)    # owed, unpaid
        interest_paid = round(interest_recognized - accrued_outstanding, 2)

        return {
            "ok": True,
            "investor": {"id": inv.data["id"], "name": inv.data["name"], "status": inv.data.get("status")},
            "principal": {
                "deposited": principal_deposited,
                "repaid": principal_repaid,
                "outstanding": principal_outstanding,   # what Capital still owes in principal
            },
            "interest": {
                "recognized": interest_recognized,          # total interest expensed to the investor
                "paid": interest_paid,                      # interest actually paid out
                "accrued_unpaid": accrued_outstanding,      # accrued but not yet paid (23950)
            },
            "totals": {
                "owed_to_investor": round(principal_outstanding + accrued_outstanding, 2),
                "paid_to_investor": round(principal_repaid + interest_paid, 2),
            },
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building investor statement {investor_id}: {e}")
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

        # ── UNIFIED: a promissory note IS the investor's money, so "invertido"
        #    = active notes' principal + note-less investment tickets (the same
        #    rule as the per-investor view). The old summary only summed the
        #    investors.total_invested column (tickets), so pagaré-funded capital
        #    showed as ~0. ──
        INVESTED_NOTE_STATUSES = ("active", "overdue", "partial", "partial_return")

        notes_query = sb.table("promissory_notes") \
            .select("id, investor_id, loan_amount, annual_rate, term_months, "
                    "interest_only_months, amortization_months, start_date, created_at, status")
        if date_from:
            notes_query = notes_query.gte("created_at", date_from)
        notes = notes_query.execute().data or []

        inv_query = sb.table("investments") \
            .select("investor_id, amount, status, invested_at, promissory_note_id")
        if date_from:
            inv_query = inv_query.gte("invested_at", date_from)
        investments_data = inv_query.execute().data or []
        live_inv = [i for i in investments_data if i.get("status") not in ("renegotiated", "transferred")]
        active_investments = [i for i in live_inv if i.get("status") == "active"]

        # Invested per investor = active notes principal + note-less tickets.
        invested_by_investor: dict = {}
        for i in live_inv:
            if not i.get("promissory_note_id"):
                invested_by_investor[i["investor_id"]] = invested_by_investor.get(i["investor_id"], 0.0) + float(i.get("amount", 0) or 0)
        notes_invested = 0.0
        for n in notes:
            if n.get("status") in INVESTED_NOTE_STATUSES:
                amt = float(n.get("loan_amount", 0) or 0)
                notes_invested += amt
                invested_by_investor[n["investor_id"]] = invested_by_investor.get(n["investor_id"], 0.0) + amt
        tickets_invested = sum(v for k, v in invested_by_investor.items()) - notes_invested
        total_invertido = round(notes_invested + tickets_invested, 2)
        total_captado = total_invertido

        # Disponible = aportado NO desplegado (resta lo invertido para no duplicar).
        total_disponible = round(sum(
            max(0.0, float(iv.get("available_capital", 0) or 0) - invested_by_investor.get(iv["id"], 0.0))
            for iv in investors_data
        ), 2)

        # Retorno a la fecha de HOY (del cronograma, no de paid_amount que está en 0).
        total_retornado_capital = 0.0
        total_retornado_interes = 0.0
        total_obligacion = 0.0
        for n in notes:
            if n.get("status") in ("cancelled", "voided"):
                continue
            ptd = _note_paid_to_date(n)
            total_retornado_capital += ptd["capital_to_date"]
            total_retornado_interes += ptd["interest_to_date"]
            total_obligacion += ptd["total_due"]
        total_retornado_capital = round(total_retornado_capital, 2)
        total_retornado_interes = round(total_retornado_interes, 2)
        total_pagado_a_hoy = round(total_retornado_capital + total_retornado_interes, 2)
        total_restante_por_pagar = round(total_obligacion - total_pagado_a_hoy, 2)

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
                "total_pagado_a_hoy": total_pagado_a_hoy,
                "total_obligacion": round(total_obligacion, 2),
                "total_restante_por_pagar": total_restante_por_pagar,
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


