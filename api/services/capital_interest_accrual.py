"""
Capital — accrual-basis interest for investor promissory notes.

A promissory note accrues interest over its schedule. This module recognizes
that interest as EXPENSE (71400) against a liability (23950 Accrued Interest
Payable) month by month, independent of when the investor is actually paid.
Investor interest payments then SETTLE 23950 (see promissory_notes.record_note_payment).

Design:
  • `accrue_note(note, up_to_period)` posts one balanced pair per scheduled
    period in [already_accrued, up_to_period): debit 71400 / credit 23950,
    tagged `accrual|<note_id>|<period>` so it is idempotent (safe to re-run;
    the monthly job and payoff both call it).
  • Accrual entries post as CONFIRMED (system-generated, non-cash — no approval).
  • Everything is a no-op if the 23950 account is not seeded yet (migration 104),
    so callers can keep cash-basis behavior until the account exists.

Never raises to the caller — accrual is best-effort and must not block a payment
or a scheduler tick.
"""
import logging
from datetime import date, datetime
from typing import Optional

from tools.supabase_client import sb

logger = logging.getLogger(__name__)

_ACCRUED_ACCOUNT = "23950"
_acct_exists_cache: dict[str, bool] = {}


def accrued_account_ready() -> bool:
    """True once the 23950 Accrued Interest Payable account is seeded."""
    if _ACCRUED_ACCOUNT not in _acct_exists_cache:
        try:
            r = sb.table("capital_accounts").select("id").eq("code", _ACCRUED_ACCOUNT).limit(1).execute()
            _acct_exists_cache[_ACCRUED_ACCOUNT] = bool(r.data)
        except Exception:
            return False
    return _acct_exists_cache[_ACCRUED_ACCOUNT]


def _schedule(note: dict) -> list[dict]:
    from api.routes.capital.promissory_notes import _note_schedule, _note_tranches
    loan = float(note.get("loan_amount", 0) or 0)
    rate = float(note.get("annual_rate", 12) or 12)
    io_m, amort_m = _note_tranches(note)
    return _note_schedule(loan, rate, io_m, amort_m)["schedule"]


def elapsed_periods(note: dict, as_of: Optional[date] = None) -> int:
    """Whole schedule periods (months) elapsed since the note's start_date."""
    as_of = as_of or date.today()
    start_raw = note.get("start_date") or note.get("created_at")
    if not start_raw:
        return 0
    try:
        start = date.fromisoformat(str(start_raw)[:10])
    except Exception:
        return 0
    months = (as_of.year - start.year) * 12 + (as_of.month - start.month)
    if as_of.day < start.day:
        months -= 1
    total = int(note.get("term_months") or 0) or len(_schedule(note))
    return max(0, min(months, total))


def _already_accrued_count(note_id: str) -> int:
    """How many periods have already been accrued for this note (idempotency)."""
    try:
        rows = sb.table("capital_transactions").select("notes") \
            .like("notes", f"accrual|{note_id}|%").execute().data or []
        periods = {r["notes"] for r in rows if r.get("notes")}
        return len(periods)
    except Exception:
        return 0


def accrue_note(note: dict, up_to_period: int, *, as_of: Optional[str] = None) -> float:
    """Accrue scheduled interest for periods [already_accrued, up_to_period).

    Posts debit 71400 / credit 23950 per period (confirmed, idempotent). Returns
    the total interest accrued in this call. No-op if 23950 isn't seeded yet.
    """
    if not accrued_account_ready():
        return 0.0
    note_id = note.get("id")
    if not note_id:
        return 0.0
    try:
        schedule = _schedule(note)
    except Exception as exc:
        logger.warning(f"[accrual] could not build schedule for note {note_id}: {exc}")
        return 0.0

    start = _already_accrued_count(note_id)
    end = min(int(up_to_period), len(schedule))
    if end <= start:
        return 0.0

    when = as_of or date.today().isoformat()
    investor_name = (note.get("investors") or {}).get("name") or note.get("lender_name") or ""
    total = 0.0
    from api.services.capital_ledger import post_to_capital_ledger
    for i in range(start, end):
        interest = round(float(schedule[i].get("interest", 0) or 0), 2)
        if interest <= 0.005:
            continue
        try:
            post_to_capital_ledger(
                event_type="interest_accrued",
                amount=interest,
                date=when,
                counterparty_name=investor_name,
                description_override=f"Interés devengado {investor_name} — período {i + 1} — ${interest:,.2f}",
                notes=f"accrual|{note_id}|{i}",
                status="confirmed",
                created_by="auto-accrual",
                extra_fields={"investor_id": note.get("investor_id")},
            )
            total += interest
        except Exception as exc:
            logger.error(f"[accrual] post failed for note {note_id} period {i}: {exc}")
            break
    if total:
        logger.info(f"[accrual] note {note_id}: accrued ${total:,.2f} over periods [{start},{end})")
    return round(total, 2)


def accrued_outstanding() -> float:
    """Aggregate 23950 balance (accrued − settled), confirmed rows only."""
    from api.routes.capital.investors import _capital_account_balance
    return _capital_account_balance(_ACCRUED_ACCOUNT)


def split_settle_catchup(interest_amount: float) -> tuple:
    """Allocate an interest payment between settling the accrued liability (23950)
    and immediate expense (71400).

    Returns (settle_23950, catchup_71400): settle up to the accrued-outstanding
    balance, and recognize any excess (interest PAID beyond what was accrued) as
    expense now — so interest actually paid is always expensed, even if little or
    no time had accrued (e.g. a note paid the same day it was issued). With 23950
    absent it's pure cash-basis (everything to 71400)."""
    amt = round(float(interest_amount), 2)
    if not accrued_account_ready():
        return 0.0, amt
    accrued = max(0.0, accrued_outstanding())
    settle = round(min(amt, accrued), 2)
    return settle, round(amt - settle, 2)


def accrue_all_active_notes(*, as_of: Optional[str] = None) -> dict:
    """Monthly job: catch-up accrue every active note up to the elapsed period."""
    if not accrued_account_ready():
        logger.info("[accrual] 23950 not seeded — skipping monthly accrual")
        return {"ok": False, "reason": "account_missing", "accrued": 0.0, "notes": 0}
    as_of_d = date.fromisoformat(as_of) if as_of else date.today()
    total = 0.0
    touched = 0
    try:
        notes = sb.table("promissory_notes") \
            .select("*, investors(name)") \
            .in_("status", ["active", "partial", "partial_return"]).execute().data or []
    except Exception as exc:
        logger.error(f"[accrual] could not list notes: {exc}")
        return {"ok": False, "reason": str(exc), "accrued": 0.0, "notes": 0}
    for nt in notes:
        got = accrue_note(nt, elapsed_periods(nt, as_of_d), as_of=as_of_d.isoformat())
        if got:
            total += got
            touched += 1
    logger.info(f"[accrual] monthly run accrued ${total:,.2f} across {touched} note(s)")
    return {"ok": True, "accrued": round(total, 2), "notes": touched}
