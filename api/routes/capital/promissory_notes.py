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
        
        # Summary stats
        total_issued = sum(float(n.get("loan_amount", 0)) for n in notes)
        total_due = sum(float(n.get("total_due", 0)) for n in notes)
        total_paid = sum(float(n.get("paid_amount", 0) or 0) for n in notes)
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
                "outstanding": total_due - total_paid,
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
        
        return {
            "ok": True,
            "note": note,
            "schedule": calc["schedule"],
            "payments": payments,
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

        # Record capital_transaction for reconciliation
        record_txn(
            txn_type="investor_return",
            amount=data.amount,
            is_income=False,
            description=f"Pago pagaré — {n['investors']['name']} — cuota ${data.amount:,.2f}",
            investor_id=n["investor_id"],
            counterparty_name=n["investors"]["name"],
            payment_method=data.payment_method,
            payment_reference=data.reference,
            bank_account_id=data.bank_account_id,
            notes=data.notes,
        )
        
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

        # ── Dynamic fields ──
        lender = note.get("lender_name") or investor.get("name", "") or "_______________"
        maker_rep = note.get("subscriber_representative") or MAKER_REP_DEFAULT
        city = note.get("signed_city", "Conroe")
        state = note.get("signed_state", "Texas")
        annual_rate = float(note.get("annual_rate", 12) or 12)

        signed_raw = note.get("signed_at") or note.get("start_date") or ""
        try:
            sd = datetime.fromisoformat(str(signed_raw).replace("Z", "+00:00"))
        except Exception:
            sd = datetime.now()
        date_full = _date_spelled(sd)

        sched = _note_schedule(loan_amount, annual_rate, io_months, amort_months)
        total_interest = sched["total_interest"]
        total_repayment = loan_amount + total_interest
        rate_words = f" ({_int_to_words(int(annual_rate))})" if float(annual_rate).is_integer() else ""

        # ── Principal amount headline ──
        elements.append(Paragraph(
            f"<b>Principal Amount:</b> {fmt(loan_amount)} USD "
            f"(Total Repayment with Interest: {fmt(total_repayment)} USD)",
            ParagraphStyle(name='PNPrincipal', parent=styles['Normal'], fontSize=11,
                           alignment=TA_CENTER, spaceAfter=10, textColor=colors.HexColor("#283242"),
                           fontName='Helvetica-Bold')))
        elements.append(Paragraph(f"In {city}, {state} on {date_full}.", styles['Body']))
        elements.append(Spacer(1, 10))

        # ── Binding paragraph (Maker + Co-Obligor) ──
        binding = f"""{maker_entity}, a Texas limited liability company (the "Maker"), acting by and through its
        authorized representative, <b>{maker_rep}</b>, owes and by means of this Promissory Note unconditionally
        binds itself to pay <b>{lender}</b> (the "Lender"), the amount of <b>{fmt(loan_amount)}</b> U.S.D.
        ({_amount_words(loan_amount)} UNITED STATES DOLLARS), as a renewal and replacement of the Lender's existing
        loan for a new term of {_term_phrase(term_months)} (this Promissory Note supersedes and replaces in its
        entirety any prior promissory note or loan agreement between the Maker and the Lender with respect to such
        loan), which will be paid as follows: {CO_OBLIGOR_NAME}, a Texas limited liability company (the "Co-Obligor"),
        joins this Promissory Note as a joint obligor, provided that the Co-Obligor's liability hereunder shall be
        secondary to the Subscriber's and the Co-Obligor shall retain all rights of contribution and subrogation
        against the Subscriber. Amounts will be paid as follows:"""
        elements.append(Paragraph(binding, styles['Body']))
        elements.append(Spacer(1, 12))

        # ── Loan summary table ──
        summary_rows = [
            [lender, "", ""],
            ["Loan", fmt(loan_amount), ""],
            ["Rate", fmt(total_interest), f"{annual_rate:g}%"],
        ]
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
        sched_rows = [["Period", "Principal", "Rate", "Payment", "Balance"]]
        for row in sched["schedule"]:
            sched_rows.append([
                str(row["period"]),
                fmt(row["principal"]),
                fmt(row["interest"]),
                fmt(row["payment"]),
                fmt(row["balance"]),
            ])
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

        # ── Default-interest clauses ──
        elements.append(Paragraph(
            "The Maker agrees to pay, if applicable, default interest, in accordance with the following:",
            styles['Body']))
        elements.append(Spacer(1, 6))
        elements.append(Paragraph(
            f"""<b>1. Default interest.</b> The Maker expressly acknowledges and agrees that in the event of default
            in the timely and total payment of the amounts established in this Promissory Note, which default remains
            uncured for ten (10) business days after written notice thereof is delivered to the Maker and all joint
            obligors, the unpaid amount will accrue interest at the annual rate of {annual_rate:g}%{rate_words} percent
            (in lieu of, and not in addition to, the regular interest rate) from the expiration of such cure period and
            until the day it is fully paid, payable on demand. No late fees, penalties, or other charges beyond the
            interest specified herein shall be assessed against the Co-Obligor. Notwithstanding anything herein to the
            contrary, in no event shall interest contracted for, charged, or received hereunder exceed the maximum rate
            permitted by applicable law.""",
            styles['Body']))
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            """Default interest will be calculated on unpaid balances and based on a year of three hundred and
            sixty-five (365) days and days elapsed. If the payment date corresponds to a day that is not a business day,
            the Maker may make payment free of charge on the immediately following business day. This promissory note
            shall be construed in accordance with the laws of the State of Texas, without regard to its conflict of laws
            principles. The Maker and the Co-Obligor irrevocably submit to the exclusive jurisdiction of the state and
            federal courts located in Montgomery County, Texas for any action arising under or related to this Promissory
            Note brought by the Lender, and waive any objection to venue or jurisdiction in such courts; provided,
            however, that the Co-Obligor may bring any contribution or subrogation action against the Maker in any court
            of competent jurisdiction. The Maker designates the following as its address to be required for payment:""",
            styles['Body']))
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            """<b>Currency.</b> All amounts referenced in this Promissory Note, including the principal, interest,
            default interest, and every payment reflected in the amortization schedule above, are denominated in, and
            shall be paid exclusively in, lawful currency of the United States of America (U.S. Dollars, "USD"). Any
            reference to "$" herein means U.S. Dollars.""",
            styles['Body']))
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            f"""{NOTE_ADDRESS}. Payments may be made by wire transfer, ACH, certified check, or such other method as the
            parties may agree in writing. All notices to {CO_OBLIGOR_NAME} shall be sent to: [INSERT DELATORO LLC
            ADDRESS]. The Maker or the Co-Obligor may prepay this Promissory Note in whole or in part at any time without
            premium or penalty; any such prepayment by the Co-Obligor shall not waive or diminish its rights of
            contribution and subrogation against the Maker.""",
            styles['Body']))
        elements.append(Spacer(1, 8))
        elements.append(Paragraph(
            f"""This promissory note is signed and delivered in the city of {city}, {state} on {date_full}. The Lender
            may not assign or transfer this Promissory Note without the prior written consent of the Subscriber and
            {CO_OBLIGOR_NAME}.""",
            styles['Body']))
        elements.append(Spacer(1, 24))

        # ── Signatures (Maker + Co-Obligor) ──
        sig_left = Paragraph(
            f"<b>Signature</b><br/>_______________________________<br/><b>{maker_rep}</b><br/>"
            f"{maker_entity}, Authorized Representative<br/>"
            f"<font size='8' color='#666666'>(representing and warranting that the undersigned has full authority to "
            f"execute this Promissory Note on behalf of the Maker)</font>",
            ParagraphStyle(name='SigL', parent=styles['Normal'], fontSize=9, leading=13))
        sig_right = Paragraph(
            f"<b>Signature</b><br/>_______________________________<br/><b>{CO_OBLIGOR_REP}</b><br/>"
            f"{CO_OBLIGOR_NAME} Authorized Representative<br/>"
            f"<font size='8' color='#666666'>Co-Obligor with Secondary Liability (limited to obligations expressly set "
            f"forth in this Promissory Note, with full rights of contribution and subrogation against the Maker; the "
            f"Lender shall first exhaust all remedies against the Maker before seeking payment from the Co-Obligor)</font>",
            ParagraphStyle(name='SigR', parent=styles['Normal'], fontSize=9, leading=13))
        t = Table([[sig_left, sig_right]], colWidths=[265, 265])
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
        
        lender_safe = (lender or "note").replace(" ", "_")
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

        sb.table("promissory_notes").delete().eq("id", note_id).execute()
        return {"ok": True, "message": "Nota promisoria eliminada"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting promissory note {note_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

