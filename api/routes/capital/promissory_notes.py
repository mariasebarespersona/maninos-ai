"""
Capital Promissory Notes - Simple (non-accumulative) interest
Investors lend money → Capital pays back principal + simple interest.
Payments are flexible: monthly, lump-sum, or any combination.
"""

import logging
import math
from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
from api.routes.capital._accounting_hooks import record_txn

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/promissory-notes", tags=["Capital - Promissory Notes"])


# =============================================================================
# SCHEMAS
# =============================================================================

class PromissoryNoteCreate(BaseModel):
    investor_id: str
    loan_amount: float
    annual_rate: float = 12.0        # default 12%
    term_months: int = 12            # derived = interest_only + amortization (kept for compat)
    interest_only_months: int = 0    # Tranche 1: pay interest only, principal does NOT move
    amortization_months: Optional[int] = None  # Tranche 2: fixed payment (principal+interest), balance amortizes
    start_date: Optional[str] = None  # YYYY-MM-DD
    signed_at: Optional[str] = None
    signed_city: str = "Conroe"
    signed_state: str = "Texas"
    subscriber_name: str = "Maninos Homes LLC"
    subscriber_representative: Optional[str] = None
    subscriber_address: str = "15891 Old Houston Rd, Conroe, Tx. Zip Code 77302"
    lender_name: Optional[str] = None       # auto-populated from investor if empty
    lender_company: Optional[str] = None
    lender_representative: Optional[str] = None
    default_interest_rate: float = 12.0
    make_whole: bool = False   # early payoff: True=full interest owed, False=pro-rata (accrued only)
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None  # Capital bank that received the loan


class PromissoryNoteUpdate(BaseModel):
    annual_rate: Optional[float] = None
    term_months: Optional[int] = None
    interest_only_months: Optional[int] = None
    amortization_months: Optional[int] = None
    start_date: Optional[str] = None
    signed_at: Optional[str] = None
    signed_city: Optional[str] = None
    subscriber_name: Optional[str] = None
    subscriber_representative: Optional[str] = None
    subscriber_address: Optional[str] = None
    lender_name: Optional[str] = None
    lender_company: Optional[str] = None
    lender_representative: Optional[str] = None
    default_interest_rate: Optional[float] = None
    make_whole: Optional[bool] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    document_url: Optional[str] = None


class RecordPaymentRequest(BaseModel):
    amount: float
    payment_method: str = "bank_transfer"  # bank_transfer, check, cash, zelle, wire
    reference: Optional[str] = None
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None  # Capital bank the payment left from


# =============================================================================
# HELPERS
# =============================================================================

def _note_tranches(note: dict) -> tuple:
    """Return (interest_only_months, amortization_months) for a note, with a
    safe fallback for legacy notes created before tranches existed (treated as
    all interest-only with a balloon principal at maturity)."""
    term = int(note.get("term_months") or 0)
    io = note.get("interest_only_months")
    amort = note.get("amortization_months")
    if io is None and amort is None:
        return term, 0                      # legacy: interest-only + balloon
    io = int(io or 0)
    amort = int(amort if amort is not None else max(0, term - io))
    return io, amort


def _note_schedule(loan_amount: float, annual_rate: float, io_months: int, amort_months: int) -> dict:
    """
    Two-tranche promissory-note schedule:

      • Tranche 1 (interest-only): ``io_months`` months where the payment equals
        the interest on the ORIGINAL principal (principal × monthly rate). The
        principal does NOT move; the balance stays at the loan amount.
      • Tranche 2 (amortization): ``amort_months`` months of a FIXED payment that
        includes principal + interest. Interest is recomputed each month on the
        DECLINING balance, so the outstanding principal goes down every month.

    Each row: {period, principal, interest, payment, balance}, where ``balance``
    is what is still owed AFTER that month's payment. If there is no amortization
    tranche, the principal is a balloon due at maturity (balance stays at loan).
    """
    mrate = (annual_rate / 100.0) / 12.0
    io_months = max(0, int(io_months))
    amort_months = max(0, int(amort_months))
    monthly_interest = round(loan_amount * mrate, 2)

    rows = []
    bal = loan_amount

    # Tranche 1 — interest only
    for p in range(1, io_months + 1):
        rows.append({"period": p, "principal": 0.0, "interest": monthly_interest,
                     "payment": monthly_interest, "balance": round(bal, 2)})

    # Tranche 2 — amortizing (fixed payment on declining balance)
    if amort_months > 0:
        pmt = (bal * mrate / (1 - (1 + mrate) ** (-amort_months))) if mrate > 0 else (bal / amort_months)
        for i in range(amort_months):
            interest = round(bal * mrate, 2)
            if i == amort_months - 1:                 # last row clears the balance exactly
                principal = round(bal, 2)
                pay = round(principal + interest, 2)
            else:
                principal = round(pmt - interest, 2)
                pay = round(pmt, 2)
            bal = round(max(0.0, bal - principal), 2)
            rows.append({"period": io_months + i + 1, "principal": principal,
                         "interest": interest, "payment": pay, "balance": bal})

    total_interest = round(sum(r["interest"] for r in rows), 2)
    total_due = round(loan_amount + total_interest, 2)
    return {
        "schedule": rows,
        "term_months": io_months + amort_months,
        "monthly_interest": monthly_interest,
        "total_interest": total_interest,
        "total_due": total_due,
    }


def _split_note_payment(note: dict, prior_paid: float, payment: float) -> tuple:
    """Split a promissory-note payment into (principal, interest).

    Payments are applied in period order; the slice of THIS payment that lands
    in each period is split by that period's principal/interest ratio, so an
    interest-only tranche books 100% interest (→71400) and the amortizing/balloon
    principal books to 23900. Anything beyond the scheduled total (overpayment /
    balloon rounding) is principal. Falls back to all-principal on any error so a
    schedule quirk never blocks a payment.
    """
    try:
        loan = float(note.get("loan_amount") or 0)
        rate = float(note.get("annual_rate", 12) or 12)
        io_m, amort_m = _note_tranches(note)
        rows = _note_schedule(loan, rate, io_m, amort_m)["schedule"]
        principal = 0.0
        skip = float(prior_paid or 0)   # already-paid amount to walk past
        left = float(payment)
        for row in rows:
            rp = float(row["payment"])
            if rp <= 0:
                continue
            if skip >= rp:
                skip -= rp
                continue
            avail = rp - skip           # still-unpaid portion of this period
            skip = 0.0
            take = min(left, avail)
            principal += take * (float(row["principal"]) / rp)
            left -= take
            if left <= 0.005:
                break
        if left > 0.005:                # beyond schedule → principal (balloon/overpay)
            principal += left
        principal = round(min(principal, float(payment)), 2)
        interest = round(float(payment) - principal, 2)   # legs sum to payment exactly
        return principal, interest
    except Exception as exc:
        logger.warning(f"[note-split] falling back to all-principal: {exc}")
        return round(float(payment), 2), 0.0


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("")
async def list_promissory_notes(
    status: Optional[str] = None,
    investor_id: Optional[str] = None,
):
    """List all promissory notes with investor info."""
    try:
        query = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)")
        
        if status:
            query = query.eq("status", status)
        if investor_id:
            query = query.eq("investor_id", investor_id)
        
        result = query.order("created_at", desc=True).execute()
        notes = result.data or []

        # Attach the canonical schedule-based "pagado a hoy" to every note so the
        # list rows and the summary show the same figure as the seguimiento view
        # (raw paid_amount is ~0 because payments were made off-app).
        from api.routes.capital.investors import _note_paid_to_date
        for n in notes:
            n["paid_to_date"] = _note_paid_to_date(n)

        # Summary stats
        total_issued = sum(float(n.get("loan_amount", 0)) for n in notes)
        total_due = sum(float(n.get("total_due", 0)) for n in notes)
        # "Pagado" = schedule-derived pagado a hoy (unified across the section).
        total_paid = round(sum(
            n["paid_to_date"]["paid_to_date"] for n in notes
            if n.get("status") not in ("cancelled", "voided")
        ), 2)
        total_paid_recorded = sum(float(n.get("paid_amount", 0) or 0) for n in notes)
        active_notes = [n for n in notes if n.get("status") == "active"]
        overdue_notes = [n for n in notes if n.get("status") == "overdue"]

        return {
            "ok": True,
            "notes": notes,
            "summary": {
                "total_notes": len(notes),
                "active_notes": len(active_notes),
                "overdue_notes": len(overdue_notes),
                "total_issued": total_issued,
                "total_due": total_due,
                "total_paid": total_paid,
                "total_paid_recorded": total_paid_recorded,
                "outstanding": round(total_due - total_paid, 2),
            }
        }
    except Exception as e:
        logger.error(f"Error listing promissory notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/alerts/upcoming")
async def get_upcoming_maturities(days: int = 30):
    """Get promissory notes maturing in the next N days."""
    try:
        from datetime import timedelta
        today = date.today()
        cutoff = today + timedelta(days=days)
        
        logger.info(f"[alerts] Querying promissory_notes: status in [active,overdue], maturity_date <= {cutoff.isoformat()}")

        # Debug: check all notes first
        all_notes = sb.table("promissory_notes").select("id, status, maturity_date").execute()
        logger.info(f"[alerts] ALL notes in DB: {[(n.get('id','?')[:8], n.get('status'), n.get('maturity_date')) for n in (all_notes.data or [])]}")

        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone)") \
            .in_("status", ["active", "overdue"]) \
            .lte("maturity_date", cutoff.isoformat()) \
            .order("maturity_date") \
            .execute()

        notes = result.data or []
        logger.info(f"[alerts] Found {len(notes)} notes matching criteria")
        
        # Categorize
        overdue = []
        this_week = []
        this_month = []
        
        for n in notes:
            mat = date.fromisoformat(str(n["maturity_date"]))
            days_until = (mat - today).days
            n["days_until_maturity"] = days_until
            
            if days_until < 0:
                overdue.append(n)
            elif days_until <= 7:
                this_week.append(n)
            else:
                this_month.append(n)
        
        return {
            "ok": True,
            "overdue": overdue,
            "this_week": this_week,
            "this_month": this_month,
            "total_alerts": len(notes),
        }
    except Exception as e:
        logger.error(f"Error getting upcoming maturities: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}")
async def get_promissory_note(note_id: str):
    """Get a promissory note with full schedule and payment history."""
    try:
        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = result.data
        loan_amount = float(note["loan_amount"])
        annual_rate = float(note.get("annual_rate", 12) or 12)
        io_m, amort_m = _note_tranches(note)

        # Two-tranche schedule (interest-only, then amortizing)
        calc = _note_schedule(loan_amount, annual_rate, io_m, amort_m)
        
        # Get individual payment history
        payments = []
        try:
            pay_result = sb.table("promissory_note_payments") \
                .select("*") \
                .eq("promissory_note_id", note_id) \
                .order("paid_at", desc=True) \
                .execute()
            payments = pay_result.data or []
        except Exception:
            pass
        
        # Devengado a la fecha de hoy (calculado del cronograma): cuánto se le
        # debería haber pagado al inversor hasta hoy y cuánto queda por pagar.
        try:
            from api.routes.capital.investors import _note_paid_to_date
            paid_to_date = _note_paid_to_date(note)
        except Exception:
            paid_to_date = None

        return {
            "ok": True,
            "note": note,
            "schedule": calc["schedule"],
            "payments": payments,
            "paid_to_date": paid_to_date,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_promissory_note(data: PromissoryNoteCreate):
    """Create a new promissory note."""
    try:
        # Validate investor
        investor = sb.table("investors") \
            .select("id, name, email, company") \
            .eq("id", data.investor_id) \
            .single() \
            .execute()
        
        if not investor.data:
            raise HTTPException(status_code=404, detail="Inversionista no encontrado")
        
        inv = investor.data
        
        # Calculate rates and amounts. Term = interest-only + amortization tranches.
        monthly_rate = data.annual_rate / 100 / 12
        io_months = int(data.interest_only_months or 0)
        amort_months = int(data.amortization_months if data.amortization_months is not None else data.term_months)
        term_months = io_months + amort_months
        start = date.fromisoformat(data.start_date) if data.start_date else date.today()
        maturity = start + relativedelta(months=term_months)

        # Two-tranche schedule (interest-only, then amortizing)
        calc = _note_schedule(data.loan_amount, data.annual_rate, io_months, amort_months)

        # Auto-populate lender info from investor if not provided
        lender_name = data.lender_name or inv["name"]
        lender_company = data.lender_company or inv.get("company")

        note_data = {
            "investor_id": data.investor_id,
            "loan_amount": data.loan_amount,
            "annual_rate": data.annual_rate,
            "monthly_rate": monthly_rate,
            "term_months": term_months,
            "interest_only_months": io_months,
            "amortization_months": amort_months,
            "total_interest": calc["total_interest"],
            "total_due": calc["total_due"],
            "subscriber_name": data.subscriber_name,
            "subscriber_representative": data.subscriber_representative,
            "subscriber_address": data.subscriber_address,
            "lender_name": lender_name,
            "lender_company": lender_company,
            "lender_representative": data.lender_representative,
            "start_date": start.isoformat(),
            "maturity_date": maturity.isoformat(),
            "signed_at": data.signed_at,
            "signed_city": data.signed_city,
            "signed_state": data.signed_state,
            "default_interest_rate": data.default_interest_rate,
            "notes": data.notes,
            "status": "active",
        }
        # Only set make_whole when True — the DB default is FALSE (pro-rata), so
        # pro-rata notes insert fine even before migration 105 adds the column.
        if data.make_whole:
            note_data["make_whole"] = True

        result = sb.table("promissory_notes").insert(note_data).execute()
        
        if not result.data:
            raise HTTPException(status_code=500, detail="Error al crear nota promisoria")
        
        # Record capital_transaction for reconciliation (money received from investor)
        record_txn(
            txn_type="investor_deposit",
            amount=data.loan_amount,
            is_income=True,
            description=f"Pagaré recibido — {lender_name} — ${data.loan_amount:,.2f} al {data.annual_rate}%",
            investor_id=data.investor_id,
            counterparty_name=lender_name,
            bank_account_id=data.bank_account_id,
            notes=f"Pagaré {term_months} meses ({io_months} solo-interés + {amort_months} amortizando), vence {maturity.isoformat()}",
        )

        created_note = result.data[0]

        # Send welcome email to investor
        try:
            from api.services.email_service import send_investor_welcome_email
            send_investor_welcome_email(
                investor_email=inv.get("email"),
                investor_name=inv["name"],
                note_data=created_note,
            )
        except Exception as email_err:
            logger.warning(f"Failed to send investor welcome email: {email_err}")

        return {
            "ok": True,
            "note": created_note,
            "schedule": calc["schedule"],
            "message": f"Nota promisoria creada: ${data.loan_amount:,.2f} al {data.annual_rate}% por {term_months} meses ({io_months} solo-interés + {amort_months} amortizando). Total: ${calc['total_due']:,.2f}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating promissory note: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{note_id}")
async def update_promissory_note(note_id: str, data: PromissoryNoteUpdate):
    """Update a promissory note (recalculates if terms change)."""
    try:
        # Get current note
        current = sb.table("promissory_notes") \
            .select("*") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not current.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = current.data
        update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
        
        if not update:
            return {"ok": True, "message": "Nada que actualizar"}

        # Cancelling a note reverses its phantom accrued interest (71400/23950).
        if update.get("status") == "cancelled" and note.get("status") != "cancelled":
            _void_note_accruals(note_id)

        # If financial terms changed, recalculate the two-tranche schedule.
        annual_rate = float(update.get("annual_rate", note["annual_rate"]))
        loan_amount = float(note["loan_amount"])
        cur_io, cur_amort = _note_tranches(note)
        io_months = int(update.get("interest_only_months", cur_io))
        amort_months = int(update.get("amortization_months", cur_amort))
        terms_changed = any(k in update for k in ("annual_rate", "term_months", "interest_only_months", "amortization_months"))

        if terms_changed:
            term_months = io_months + amort_months
            monthly_rate = annual_rate / 100 / 12
            calc = _note_schedule(loan_amount, annual_rate, io_months, amort_months)
            update["monthly_rate"] = monthly_rate
            update["term_months"] = term_months
            update["interest_only_months"] = io_months
            update["amortization_months"] = amort_months
            update["total_interest"] = calc["total_interest"]
            update["total_due"] = calc["total_due"]

        if "start_date" in update or terms_changed:
            start_str = update.get("start_date", note["start_date"])
            start = date.fromisoformat(str(start_str))
            update["maturity_date"] = (start + relativedelta(months=io_months + amort_months)).isoformat()
        
        sb.table("promissory_notes").update(update).eq("id", note_id).execute()
        
        return {"ok": True, "message": "Nota promisoria actualizada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{note_id}/pay")
async def record_note_payment(note_id: str, data: RecordPaymentRequest):
    """Record a payment on a promissory note (typically at maturity)."""
    try:
        note = sb.table("promissory_notes") \
            .select("*, investors(id, name, available_capital)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        n = note.data
        
        if n["status"] in ("paid", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Esta nota ya está {n['status']}")
        
        current_paid = float(n.get("paid_amount", 0) or 0)
        new_paid = current_paid + data.amount
        total_due = float(n["total_due"])
        
        # Determine new status
        if new_paid >= total_due:
            new_status = "paid"
        else:
            new_status = n["status"]  # Keep current status
        
        # Update note
        update_data = {
            "paid_amount": new_paid,
            "status": new_status,
        }
        if new_status == "paid":
            update_data["paid_at"] = datetime.utcnow().isoformat()
        
        sb.table("promissory_notes").update(update_data).eq("id", note_id).execute()
        
        # Record individual payment in promissory_note_payments table
        payment_record = None
        try:
            pay_result = sb.table("promissory_note_payments").insert({
                "promissory_note_id": note_id,
                "amount": data.amount,
                "payment_method": data.payment_method,
                "reference": data.reference,
                "notes": data.notes,
                "paid_at": datetime.utcnow().isoformat(),
            }).execute()
            payment_record = pay_result.data[0] if pay_result.data else None
        except Exception as pay_err:
            logger.warning(f"Could not record individual payment record: {pay_err}")
        
        # Record capital flow (outgoing - paying investor back).
        # skip_accounting: the record_txn below writes the (single) accounting
        # entry with full payment details — letting _record_flow also write one
        # would double-record the same payment in capital_transactions.
        try:
            from api.routes.capital.capital_flows import _record_flow
            _record_flow({
                "flow_type": "return_out",
                "amount": -abs(data.amount),
                "investor_id": n["investor_id"],
                "description": data.notes or f"Pago de nota promisoria a {n['investors']['name']}",
                "flow_date": date.today().isoformat(),
            }, skip_accounting=True)
        except Exception as flow_err:
            logger.warning(f"Could not record capital flow for note payment: {flow_err}")

        # Record capital_transaction(s) for reconciliation — SPLIT principal vs
        # interest using the note's amortization schedule so principal reduces
        # the 23900 liability and interest hits 71400 (P&L). current_paid is the
        # cumulative amount paid BEFORE this installment.
        inv_name = n["investors"]["name"]
        principal_part, interest_part = _split_note_payment(n, current_paid, data.amount)
        if principal_part > 0.005:
            record_txn(
                txn_type="investor_return",
                amount=principal_part,
                is_income=False,
                description=f"Pago pagaré (capital) — {inv_name} — ${principal_part:,.2f}",
                investor_id=n["investor_id"],
                counterparty_name=inv_name,
                payment_method=data.payment_method,
                payment_reference=data.reference,
                bank_account_id=data.bank_account_id,
                notes=data.notes,
            )
        if interest_part > 0.005:
            from api.services.capital_interest_accrual import (
                accrued_account_ready, accrue_note, elapsed_periods, split_settle_catchup,
            )
            if accrued_account_ready():
                # ACCRUAL basis. Catch up accrual so 23950 holds what's earned:
                # pro-rata (default) recognizes only interest EARNED to date,
                # make-whole notes recognize ALL remaining interest at close.
                accrue_target = 10**9 if (new_status == "paid" and n.get("make_whole")) else elapsed_periods(n)
                accrue_note(n, accrue_target)
                # Settle THIS note's accrued liability (23950); any interest PAID
                # beyond what's accrued is expensed now (71400), so paid interest
                # is always recognized even with little/no elapsed time.
                prior_int_paid = _split_note_payment(n, 0.0, current_paid)[1]
                settle_amt, catchup_amt = split_settle_catchup(note_id, prior_int_paid, interest_part)
                if settle_amt > 0.005:
                    record_txn(txn_type="interest_settle", amount=settle_amt, is_income=False,
                               description=f"Pago pagaré (interés devengado) — {inv_name} — ${settle_amt:,.2f}",
                               investor_id=n["investor_id"], counterparty_name=inv_name,
                               payment_method=data.payment_method, payment_reference=data.reference,
                               bank_account_id=data.bank_account_id, notes=data.notes)
                if catchup_amt > 0.005:
                    record_txn(txn_type="investor_interest", amount=catchup_amt, is_income=False,
                               description=f"Pago pagaré (interés) — {inv_name} — ${catchup_amt:,.2f}",
                               investor_id=n["investor_id"], counterparty_name=inv_name,
                               payment_method=data.payment_method, payment_reference=data.reference,
                               bank_account_id=data.bank_account_id, notes=data.notes)
            else:
                # Cash-basis fallback (23950 not seeded yet): interest → 71400.
                record_txn(txn_type="investor_interest", amount=interest_part, is_income=False,
                           description=f"Pago pagaré (interés) — {inv_name} — ${interest_part:,.2f}",
                           investor_id=n["investor_id"], counterparty_name=inv_name,
                           payment_method=data.payment_method, payment_reference=data.reference,
                           bank_account_id=data.bank_account_id, notes=data.notes)
        
        # Send completion email if note is fully paid
        if new_status == "paid":
            try:
                from api.services.email_service import send_investor_completion_email
                # Get investor email
                investor_info = sb.table("investors") \
                    .select("name, email") \
                    .eq("id", n["investor_id"]) \
                    .single() \
                    .execute()
                if investor_info.data and investor_info.data.get("email"):
                    # Build complete note data for email
                    completed_note = {**n, "paid_amount": new_paid, "status": "paid"}
                    send_investor_completion_email(
                        investor_email=investor_info.data["email"],
                        investor_name=investor_info.data["name"],
                        note_data=completed_note,
                    )
            except Exception as email_err:
                logger.warning(f"Failed to send investor completion email: {email_err}")

        return {
            "ok": True,
            "paid_amount": new_paid,
            "remaining": max(0, total_due - new_paid),
            "status": new_status,
            "payment": payment_record,
            "message": f"Pago de ${data.amount:,.2f} registrado. {'Nota PAGADA completamente.' if new_status == 'paid' else f'Pendiente: ${max(0, total_due - new_paid):,.2f}'}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording payment for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/schedule")
async def get_note_schedule(note_id: str):
    """Get just the amortization schedule for a note."""
    try:
        note = sb.table("promissory_notes") \
            .select("loan_amount, monthly_rate, term_months, annual_rate, interest_only_months, amortization_months") \
            .eq("id", note_id) \
            .single() \
            .execute()

        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")

        n = note.data
        io_m, amort_m = _note_tranches(n)
        calc = _note_schedule(float(n["loan_amount"]), float(n.get("annual_rate", 12) or 12), io_m, amort_m)

        return {
            "ok": True,
            "schedule": calc["schedule"],
            "total_interest": calc["total_interest"],
            "total_due": calc["total_due"],
            "interest_only_months": io_m,
            "amortization_months": amort_m,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting schedule for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# PROMISSORY-NOTE DOCUMENT HELPERS (template rendering)
# Fixed parties for the Maninos Capital note template.
# =============================================================================
MAKER_NAME = "MANINOS CAPITAL LLC"
MAKER_REP_DEFAULT = "BENJAMIN SEBASTIAN GONZALEZ ZAMBRANO"
CO_OBLIGOR_NAME = "DELATORO LLC"
CO_OBLIGOR_REP = "JORGE DE LA TORRE ROSAS"
NOTE_ADDRESS = "15891 Old Houston Rd, Conroe, Tx. Zip Code 77302"

_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
         "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]


def _two_digit_words(n: int) -> str:
    if n < 20:
        return _ONES[n]
    t, o = divmod(n, 10)
    return _TENS[t] + ("-" + _ONES[o] if o else "")


def _three_digit_words(n: int) -> str:
    h, rest = divmod(n, 100)
    parts = []
    if h:
        parts.append(_ONES[h] + " hundred")
    if rest:
        parts.append(_two_digit_words(rest))
    return " ".join(parts) if parts else "zero"


def _int_to_words(n: int) -> str:
    if n == 0:
        return "zero"
    parts = []
    millions, rest = divmod(n, 1_000_000)
    thousands, hundreds = divmod(rest, 1000)
    if millions:
        parts.append(_three_digit_words(millions) + " million")
    if thousands:
        parts.append(_three_digit_words(thousands) + " thousand")
    if hundreds:
        parts.append(_three_digit_words(hundreds))
    return " ".join(parts)


def _amount_words(amount: float) -> str:
    dollars = int(amount)
    cents = int(round((amount - dollars) * 100))
    return f"{_int_to_words(dollars).upper()} {cents:02d}/100"


def _year_words(y: int) -> str:
    if 2000 <= y < 2100:
        rest = y % 100
        return "two thousand" + (" " + _two_digit_words(rest) if rest else "")
    return str(y)


_ORD = {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth", 6: "sixth", 7: "seventh",
        8: "eighth", 9: "ninth", 10: "tenth", 11: "eleventh", 12: "twelfth", 13: "thirteenth",
        14: "fourteenth", 15: "fifteenth", 16: "sixteenth", 17: "seventeenth", 18: "eighteenth",
        19: "nineteenth", 20: "twentieth", 21: "twenty-first", 22: "twenty-second", 23: "twenty-third",
        24: "twenty-fourth", 25: "twenty-fifth", 26: "twenty-sixth", 27: "twenty-seventh",
        28: "twenty-eighth", 29: "twenty-ninth", 30: "thirtieth", 31: "thirty-first"}


def _date_spelled(d) -> str:
    """'MM/DD/YYYY (Month Dth, year words)' — mirrors the template's date style."""
    return f"{d.strftime('%m/%d/%Y')} ({d.strftime('%B')} {_ORD.get(d.day, str(d.day))}, {_year_words(d.year)})"


def _term_phrase(term_months: int) -> str:
    if term_months % 12 == 0:
        yrs = term_months // 12
        return f"{_int_to_words(yrs)} ({yrs}) year{'s' if yrs != 1 else ''}"
    return f"{term_months} ({_int_to_words(term_months)}) months"


def _firmas_de_nota(note_id: str) -> dict:
    """Firmas electrónicas de un pagaré, indexadas por hueco del documento.

    El sobre de firma guarda el pagaré en `data.note_id` (no hay columna propia
    para notas en signature_envelopes; sí las hay para propiedad y venta).
    Devuelve {} ante cualquier problema: que no se puedan leer las firmas no
    debe impedir ver el pagaré.
    """
    try:
        sobres = (sb.table("signature_envelopes").select("id")
                  .eq("data->>note_id", note_id)
                  .neq("status", "voided").execute().data or [])
        if not sobres:
            return {}
        ids = [s["id"] for s in sobres]
        filas = (sb.table("document_signatures")
                 .select("signer_role, signer_name, signer_email, status, signed_at, signature_data, token")
                 .in_("envelope_id", ids).execute().data or [])
        out: dict = {}
        for f in filas:
            datos = f.get("signature_data") or {}
            out[f.get("signer_role")] = {
                "name": f.get("signer_name"),
                "email": f.get("signer_email"),
                "status": f.get("status"),
                "signed_at": f.get("signed_at"),
                "type": datos.get("type"),
                "value": datos.get("value"),
            }
        return out
    except Exception as e:
        logger.warning(f"[pagaré] no se pudieron leer las firmas de {note_id}: {e}")
        return {}


@router.get("/{note_id}/document")
async def get_promissory_note_document(note_id: str):
    """El pagaré redactado, como estructura, para pintarlo en pantalla.

    Devuelve EXACTAMENTE el mismo contenido que el PDF: los dos llaman a
    `build_document`. Existe para que la vista previa de la app no vuelva a tener
    su propia copia del texto legal — que es como acabó enseñando, durante meses,
    el borrador anterior a la revisión del abogado.
    """
    try:
        from api.routes.capital._promissory_document import build_document

        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)") \
            .eq("id", note_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")

        note = result.data
        investor = note.get("investors") or {}
        loan = float(note["loan_amount"])
        rate = float(note.get("annual_rate", 12) or 12)
        io_m, amort_m = _note_tranches(note)
        sched = _note_schedule(loan, rate, io_m, amort_m)

        fmt = lambda n: f"${n:,.2f}" if n else "$0.00"
        docu = build_document(
            note, investor, sched, firmas=_firmas_de_nota(note_id),
            fmt=fmt, amount_words=_amount_words, int_to_words=_int_to_words,
            term_phrase=_term_phrase, date_spelled=_date_spelled,
        )
        return {"ok": True, "document": docu}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error building promissory note document {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{note_id}/send-for-signature")
async def send_note_for_signature(note_id: str):
    """Manda el pagaré a firmar a quien figure en cada bloque de firma.

    Los destinatarios NO están fijados: se leen del propio documento. El bloque
    de la izquierda es el Maker (quien debe) y el de la derecha el Co-Obligado
    (quien responde en segundo lugar), y a cada uno le llega su enlace según el
    nombre que tenga escrito. Si algún día esos nombres se intercambian, los
    correos se intercambian con ellos y nadie firma en el hueco de otro — que en
    este documento significaría asumir una obligación distinta.

    Si algún nombre no está en el registro de firmantes, NO se manda nada y se
    dice qué falta. Un pagaré firmado a medias es peor que uno sin firmar.
    """
    import os as _os
    from api.routes.capital._promissory_signers import resolver_firmantes
    from api.services.esign_service import create_envelope, send_signing_emails

    try:
        doc = (await get_promissory_note_document(note_id))["document"]

        firmantes, sin_correo = resolver_firmantes(doc["signatures"])
        if sin_correo:
            raise HTTPException(
                status_code=400,
                detail=("No se puede enviar: no hay correo registrado para "
                        + ", ".join(sin_correo) +
                        ". Añádelo en api/routes/capital/_promissory_signers.py "
                        "antes de volver a intentarlo."),
            )

        # Un pagaré ya enviado no se reenvía a ciegas: se anula el sobre anterior
        # primero, para que no queden dos enlaces vivos del mismo documento.
        try:
            previos = (sb.table("signature_envelopes").select("id, status")
                       .eq("data->>note_id", note_id)
                       .neq("status", "voided").execute().data or [])
            for p_ in previos:
                sb.table("signature_envelopes").update({"status": "voided"}).eq("id", p_["id"]).execute()
                sb.table("document_signatures").update({"status": "voided"}) \
                    .eq("envelope_id", p_["id"]).eq("status", "pending").execute()
            if previos:
                logger.info(f"[pagaré] anulados {len(previos)} sobres previos de {note_id}")
        except Exception as e:
            logger.warning(f"[pagaré] no se pudieron anular sobres previos de {note_id}: {e}")

        lender = doc["summary"]["lender"]
        sobre = create_envelope(
            name=f"Promissory Note — {lender}",
            document_type="promissory_note",
            transaction_type="investment",
            signers=[{"role": f["role"], "name": f["name"], "email": f["email"]} for f in firmantes],
            data={"note_id": note_id, "lender": lender},
        )

        base = _os.environ.get("APP_URL", "https://maninos-ai.vercel.app")
        envio = send_signing_emails(sobre["envelope_id"], base_url=base)

        return {
            "ok": True,
            "envelope_id": sobre["envelope_id"],
            "sent": envio.get("sent", 0),
            "signers": [{"name": f["name"], "email": f["email"], "role": f["role"]} for f in firmantes],
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error enviando a firmar el pagaré {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/pdf")
async def download_promissory_note_pdf(note_id: str):
    """Generate and download a PDF of the promissory note document."""
    try:
        from io import BytesIO
        from fastapi.responses import Response
        
        result = sb.table("promissory_notes") \
            .select("*, investors(id, name, email, phone, company)") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        note = result.data
        investor = note.get("investors", {}) or {}
        loan_amount = float(note["loan_amount"])
        io_months, amort_months = _note_tranches(note)
        term_months = io_months + amort_months

        # Generate PDF
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import letter
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import inch
            from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_JUSTIFY
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
            from reportlab.graphics.shapes import Drawing, Polygon, Line, Rect
            from reportlab.graphics import renderPDF
        except ImportError:
            raise HTTPException(status_code=500, detail="reportlab not installed")
        
        buffer = BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=letter,
                                rightMargin=0.75*inch, leftMargin=0.75*inch,
                                topMargin=0.75*inch, bottomMargin=0.75*inch)
        
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name='DocTitle', parent=styles['Heading1'],
                                  fontSize=16, alignment=TA_CENTER, spaceAfter=16,
                                  textColor=colors.HexColor("#1a2744")))
        styles.add(ParagraphStyle(name='Section', parent=styles['Heading2'],
                                  fontSize=12, spaceAfter=8, spaceBefore=14,
                                  textColor=colors.HexColor("#283242")))
        styles.add(ParagraphStyle(name='Body', parent=styles['Normal'],
                                  fontSize=10, leading=14, alignment=TA_JUSTIFY))
        styles.add(ParagraphStyle(name='Right', parent=styles['Normal'],
                                  alignment=TA_RIGHT, fontSize=9))
        styles.add(ParagraphStyle(name='Center', parent=styles['Normal'],
                                  alignment=TA_CENTER, fontSize=9))
        
        elements = []
        fmt = lambda n: f"${n:,.2f}" if n else "$0.00"
        
        # ── Logo: Phoenician Boat ──
        def _draw_phoenician_boat():
            """Draw a simple Phoenician boat icon."""
            d = Drawing(60, 40)
            navy = colors.HexColor("#1a2744")
            gold = colors.HexColor("#d4a853")
            # Hull (curved bottom shape)
            d.add(Polygon(
                points=[5,12, 15,4, 45,4, 55,12, 50,16, 10,16],
                fillColor=navy, strokeColor=navy, strokeWidth=0.5
            ))
            # Sail (triangle)
            d.add(Polygon(
                points=[30,16, 30,38, 48,20],
                fillColor=gold, strokeColor=navy, strokeWidth=0.5
            ))
            # Mast
            d.add(Line(30, 16, 30, 38, strokeColor=navy, strokeWidth=1.5))
            return d
        
        # Issuing entity (Maker): "de Jorge" → Maninos Capital, "de Sebastian" → Maninos Homes.
        # Carried in subscriber_name; the representative name stays Sebastian in both cases.
        # Drives BOTH the brand-title header and the Maker in the body/signature.
        maker_entity = (note.get("subscriber_name") or MAKER_NAME).upper()

        # Client-provided "maninos" logo (base64-embedded), centered at the top.
        import base64 as _b64
        from api.routes.capital._promissory_logo import LOGO_B64
        _logo = Image(BytesIO(_b64.b64decode(LOGO_B64)), width=104, height=49)
        _logo.hAlign = 'CENTER'
        elements.append(_logo)
        elements.append(Paragraph(maker_entity, ParagraphStyle(
            name='BrandTitle', parent=styles['Normal'],
            fontSize=11, alignment=TA_CENTER, spaceAfter=4,
            textColor=colors.HexColor("#1a2744"),
            fontName='Helvetica-Bold',
        )))
        elements.append(Paragraph("PROMISSORY NOTE", styles['DocTitle']))

        # ── Contenido del documento ──
        # Todo el texto sale de _promissory_document.build_document, que es la
        # ÚNICA fuente: la pantalla lee exactamente lo mismo por /document. Aquí
        # solo se maqueta. Si hay que cambiar una cláusula, se cambia allí.
        from api.routes.capital._promissory_document import build_document
        annual_rate = float(note.get("annual_rate", 12) or 12)
        sched = _note_schedule(loan_amount, annual_rate, io_months, amort_months)
        docu = build_document(
            note, investor, sched, firmas=_firmas_de_nota(note_id),
            fmt=fmt, amount_words=_amount_words, int_to_words=_int_to_words,
            term_phrase=_term_phrase, date_spelled=_date_spelled,
        )

        # ── Principal amount headline ──
        elements.append(Paragraph(
            f"<b>{docu['principal_line']['label']}</b> {docu['principal_line']['principal']} USD "
            f"(Total Repayment with Interest: {docu['principal_line']['total_repayment']} USD)",
            ParagraphStyle(name='PNPrincipal', parent=styles['Normal'], fontSize=11,
                           alignment=TA_CENTER, spaceAfter=10, textColor=colors.HexColor("#283242"),
                           fontName='Helvetica-Bold')))
        elements.append(Paragraph(docu["place_date"], styles['Body']))
        elements.append(Spacer(1, 10))

        # ── Binding paragraph (Maker + Co-Obligor) ──
        elements.append(Paragraph(docu["binding"], styles['Body']))
        elements.append(Spacer(1, 12))

        # ── Loan summary table ──
        summary_rows = [[docu["summary"]["lender"], "", ""]] + docu["summary"]["rows"]
        t = Table(summary_rows, colWidths=[180, 180, 180])
        t.setStyle(TableStyle([
            ('SPAN', (0, 0), (2, 0)),
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#283242")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('ALIGN', (0, 0), (-1, 0), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 12))

        # ── Amortization schedule (interest-only, then amortizing) ──
        sched_rows = [docu["schedule_header"]] + docu["schedule_rows"]
        t = Table(sched_rows, colWidths=[55, 120, 110, 120, 120], repeatRows=1)
        t.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor("#283242")),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 8.5),
            ('ALIGN', (1, 0), (-1, -1), 'RIGHT'),
            ('ALIGN', (0, 0), (0, -1), 'CENTER'),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor("#ddd")),
            ('TOPPADDING', (0, 0), (-1, -1), 3),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9f9f6")]),
        ]))
        elements.append(t)
        elements.append(Spacer(1, 18))

        # ── Cláusulas ──
        for cl in docu["clauses"]:
            texto = f"<b>{cl['title']}</b> {cl['text']}" if cl.get("title") else cl["text"]
            elements.append(Paragraph(texto, styles['Body']))
            elements.append(Spacer(1, 8))

        elements.append(Paragraph(docu["address_block"], styles['Body']))
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(docu["closing"], styles['Body']))
        elements.append(Spacer(1, 24))

        # ── Firmas ──
        sig_cells = [
            Paragraph(
                f"<b>Signature</b><br/>_______________________________<br/><b>{sig['name']}</b><br/>"
                f"{sig['entity_line']}<br/>"
                f"<font size='8' color='#666666'>{sig['note']}</font>",
                ParagraphStyle(name=f"Sig{i}", parent=styles['Normal'], fontSize=9, leading=13))
            for i, sig in enumerate(docu["signatures"])
        ]
        t = Table([sig_cells], colWidths=[265] * len(sig_cells))
        t.setStyle(TableStyle([
            ('VALIGN', (0, 0), (-1, -1), 'TOP'),
            ('LEFTPADDING', (0, 0), (-1, -1), 6),
            ('RIGHTPADDING', (0, 0), (-1, -1), 6),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
        ]))
        elements.append(t)

        # Footer
        elements.append(Spacer(1, 20))
        elements.append(Paragraph(
            f"Generated {datetime.now().strftime('%m/%d/%Y %H:%M')} — {MAKER_NAME} — Confidential",
            ParagraphStyle(name='PNFooter', parent=styles['Normal'], fontSize=7,
                           textColor=colors.grey, alignment=TA_CENTER)))
        
        doc.build(elements)
        pdf_bytes = buffer.getvalue()
        
        lender_safe = (docu["summary"]["lender"] or "note").replace(" ", "_")
        filename = f"Promissory_Note_{lender_safe}_{note_id[:8]}.pdf"
        
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating promissory note PDF {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{note_id}/payoff-estimate")
async def get_payoff_estimate(note_id: str, monthly_payment: float = 0):
    """
    Estimate how many months to pay off the note given a fixed monthly payment.
    The total to pay (capital + interest) is FIXED — it does not change.
    Only the number of months varies: months = remaining_total / monthly_payment.
    """
    try:
        note = sb.table("promissory_notes") \
            .select("loan_amount, total_interest, total_due, paid_amount") \
            .eq("id", note_id) \
            .single() \
            .execute()
        
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        
        n = note.data
        loan_amount = float(n["loan_amount"])
        total_interest = float(n.get("total_interest", 0))
        total_due = float(n["total_due"])
        paid = float(n.get("paid_amount", 0) or 0)
        remaining = round(max(0, total_due - paid), 2)
        
        if remaining <= 0:
            return {
                "ok": True,
                "remaining": 0,
                "months_to_payoff": 0,
                "message": "La nota ya está completamente pagada.",
            }
        
        if monthly_payment <= 0:
            return {
                "ok": True,
                "remaining": remaining,
                "months_to_payoff": None,
                "message": "Ingresa un monto mensual para calcular.",
            }
        
        # Simple division: total fixed / monthly payment
        exact_months = remaining / monthly_payment
        months_to_payoff = math.ceil(exact_months)
        
        # Last month may be a partial payment
        full_months = months_to_payoff - 1
        last_month_payment = round(remaining - (full_months * monthly_payment), 2)
        
        return {
            "ok": True,
            "loan_amount": loan_amount,
            "total_interest": total_interest,
            "total_due": total_due,
            "remaining": remaining,
            "months_to_payoff": months_to_payoff,
            "last_month_payment": last_month_payment,
            "message": f"Con ${monthly_payment:,.2f}/mes, se liquida en {months_to_payoff} meses. El interés y total no cambian.",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error calculating payoff for note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{note_id}/settle-early")
async def settle_note_early(note_id: str, data: RecordPaymentRequest):
    """Close a note BEFORE term. Pro-rata (default) charges only interest accrued
    to date and condones the rest; make_whole notes charge the full scheduled
    interest. Principal → 23900, interest → 23950 (or 71400 cash-basis fallback)."""
    try:
        note = sb.table("promissory_notes").select("*, investors(id, name)").eq("id", note_id).single().execute()
        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")
        n = note.data
        if n["status"] in ("paid", "cancelled"):
            raise HTTPException(status_code=400, detail=f"Esta nota ya está {n['status']}")

        from api.services.capital_interest_accrual import (
            accrued_account_ready, accrue_note, elapsed_periods, split_settle_catchup,
        )
        loan = float(n["loan_amount"])
        schedule = _note_schedule(loan, float(n.get("annual_rate", 12) or 12), *_note_tranches(n))["schedule"]
        make_whole = bool(n.get("make_whole"))
        period = len(schedule) if make_whole else min(elapsed_periods(n), len(schedule))
        interest_to_period = round(sum(float(schedule[i]["interest"]) for i in range(period)), 2)
        obligation = round(loan + interest_to_period, 2)
        paid_so_far = float(n.get("paid_amount", 0) or 0)

        prin_repaid, int_paid = _split_note_payment(n, 0.0, paid_so_far)
        principal_part = round(loan - prin_repaid, 2)
        interest_part = round(interest_to_period - int_paid, 2)
        amount = round(principal_part + max(0.0, interest_part), 2)
        if amount <= 0.005:
            raise HTTPException(status_code=400, detail="No hay saldo por liquidar")

        inv_name = (n.get("investors") or {}).get("name", "")
        if principal_part > 0.005:
            record_txn(txn_type="investor_return", amount=principal_part, is_income=False,
                       description=f"Liquidación anticipada (capital) — {inv_name} — ${principal_part:,.2f}",
                       investor_id=n["investor_id"], counterparty_name=inv_name,
                       payment_method=data.payment_method, payment_reference=data.reference,
                       bank_account_id=data.bank_account_id, notes=data.notes or "Liquidación anticipada")
        if interest_part > 0.005:
            _note = data.notes or "Liquidación anticipada"
            if accrued_account_ready():
                accrue_note(n, period)
                settle_amt, catchup_amt = split_settle_catchup(note_id, int_paid, interest_part)
                if settle_amt > 0.005:
                    record_txn(txn_type="interest_settle", amount=settle_amt, is_income=False,
                               description=f"Liquidación anticipada (interés devengado) — {inv_name} — ${settle_amt:,.2f}",
                               investor_id=n["investor_id"], counterparty_name=inv_name,
                               payment_method=data.payment_method, payment_reference=data.reference,
                               bank_account_id=data.bank_account_id, notes=_note)
                if catchup_amt > 0.005:
                    record_txn(txn_type="investor_interest", amount=catchup_amt, is_income=False,
                               description=f"Liquidación anticipada (interés) — {inv_name} — ${catchup_amt:,.2f}",
                               investor_id=n["investor_id"], counterparty_name=inv_name,
                               payment_method=data.payment_method, payment_reference=data.reference,
                               bank_account_id=data.bank_account_id, notes=_note)
            else:
                record_txn(txn_type="investor_interest", amount=interest_part, is_income=False,
                           description=f"Liquidación anticipada (interés) — {inv_name} — ${interest_part:,.2f}",
                           investor_id=n["investor_id"], counterparty_name=inv_name,
                           payment_method=data.payment_method, payment_reference=data.reference,
                           bank_account_id=data.bank_account_id, notes=_note)

        sb.table("promissory_note_payments").insert({
            "promissory_note_id": note_id, "amount": amount,
            "payment_method": data.payment_method, "reference": data.reference,
            "notes": data.notes or "Liquidación anticipada", "paid_at": datetime.utcnow().isoformat(),
        }).execute()
        sb.table("promissory_notes").update({
            "paid_amount": round(paid_so_far + amount, 2),
            "total_interest": interest_to_period, "total_due": obligation,
            "status": "paid", "paid_at": datetime.utcnow().isoformat(),
        }).eq("id", note_id).execute()

        from api.routes.capital.capital_flows import _record_flow
        _record_flow({"flow_type": "return_out", "amount": -abs(amount), "investor_id": n["investor_id"],
                      "description": f"Liquidación anticipada nota a {inv_name}",
                      "flow_date": date.today().isoformat()}, skip_accounting=True)

        return {
            "ok": True, "amount": amount, "principal": principal_part, "interest": max(0.0, interest_part),
            "policy": "make_whole" if make_whole else "pro_rata",
            "interest_condoned": round(float(n.get("total_interest", 0) or 0) - interest_to_period, 2),
            "message": f"Nota liquidada: capital ${principal_part:,.0f} + interés ${max(0.0, interest_part):,.0f}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error settling note early {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _void_note_accruals(note_id: str) -> int:
    """Void this note's accrual entries (71400/23950) so a removed/cancelled note
    leaves no phantom accrued interest. Accrual legs share the notes tag
    `accrual|<note_id>|<period>`. Returns the number of rows voided."""
    try:
        rows = sb.table("capital_transactions").select("id") \
            .like("notes", f"accrual|{note_id}|%").neq("status", "voided").execute().data or []
        for r in rows:
            sb.table("capital_transactions").update({"status": "voided"}).eq("id", r["id"]).execute()
        if rows:
            logger.info(f"[note-void] voided {len(rows)} accrual leg(s) for note {note_id}")
        return len(rows)
    except Exception as exc:
        logger.warning(f"[note-void] could not void accruals for note {note_id}: {exc}")
        return 0


@router.delete("/{note_id}")
async def delete_promissory_note(note_id: str):
    """Delete a promissory note (any status). Its payment history is removed via
    the ON DELETE CASCADE on promissory_note_payments. The frontend confirms first."""
    try:
        note = sb.table("promissory_notes") \
            .select("status") \
            .eq("id", note_id) \
            .single() \
            .execute()

        if not note.data:
            raise HTTPException(status_code=404, detail="Nota promisoria no encontrada")

        _void_note_accruals(note_id)   # reverse phantom accrued interest first
        sb.table("promissory_notes").delete().eq("id", note_id).execute()
        return {"ok": True, "message": "Nota promisoria eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

