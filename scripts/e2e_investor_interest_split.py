"""
E2E — Investor principal/interest split (Capital).

Proves the root fix for the investor↔accounting links: a promissory-note
payment is split so PRINCIPAL reduces 23900 (Investor Notes Payable) and
INTEREST hits 71400 (Interest paid / P&L) — never mixed. Also exercises the
notes-aware reconciliation endpoint.

Scenario (legacy interest-only + balloon note):
  loan $12,000 @ 12%, 1 month interest-only, balloon principal at maturity.
    • Pay #1 = $120  → 100% interest  → 71400 += 120, 23900 unchanged
    • Pay #2 = $12,000 → 100% principal → 23900 -= 12,000
  End state: 23900 = 0, 71400 magnitude = 120, note = paid, reconciliation OK.

Everything created is tracked + deleted in the finally block (0 residue).

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_investor_interest_split.py
"""
import asyncio
import sys
import time
from datetime import date

sys.path.insert(0, ".")

from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-SPLIT-{int(time.time())}"
FAILURES: list[str] = []
CREATED: list[tuple[str, str]] = []


def track(table: str, row_id: str):
    if row_id:
        CREATED.append((table, row_id))


def check(name: str, cond: bool, detail: str = ""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


async def confirm_investor_pending(confirm_fn, investor_id: str):
    """Confirm every still-pending capital_transaction for this investor."""
    rows = sb.table("capital_transactions").select("id, status") \
        .eq("investor_id", investor_id).eq("status", "pending_confirmation").execute().data or []
    for r in rows:
        try:
            await confirm_fn(r["id"])
        except Exception:
            pass  # already flipped as a linked leg


def acct_balance(code: str) -> float:
    from api.routes.capital.investors import _capital_account_balance
    return _capital_account_balance(code)


# Minimal CAPITAL chart accounts the ledger needs to post this scenario.
# NOTE: this touches ONLY capital_accounts (Capital's chart) — never Homes'
# accounting_accounts. Seeded rows we create are deleted in teardown.
_NEEDED_ACCOUNTS = [
    ("23900", "Investor Notes Payable", "liability", "investor_debt", "balance_sheet", 245),
    ("71400", "Interest paid",          "expense",   "general",       "profit_loss",   630),
]


def seed_capital_accounts():
    for code, name, atype, cat, section, order in _NEEDED_ACCOUNTS:
        got = sb.table("capital_accounts").select("id").eq("code", code).limit(1).execute().data
        if got:
            continue  # already in the chart — leave it, don't track for deletion
        row = sb.table("capital_accounts").insert({
            "code": code, "name": name, "account_type": atype, "category": cat,
            "is_header": False, "report_section": section, "display_order": order,
            "is_active": True,
        }).execute().data
        if row:
            track("capital_accounts", row[0]["id"])
            print(f"  (seeded capital account {code} {name})")


async def main():
    from api.routes.capital.accounting import BankAccountCreate, create_bank_account
    from api.routes.capital.investors import InvestorCreate, create_investor, reconcile_investors
    from api.routes.capital.promissory_notes import (
        PromissoryNoteCreate, create_promissory_note,
        RecordPaymentRequest, record_note_payment,
    )
    from api.routes.capital.payments import confirm_transaction

    print(f"\n=== {TAG} — investor principal/interest split ===\n")
    seed_capital_accounts()

    # 1) Capital bank (primary, $0 so no opening-balance noise)
    bank_res = await create_bank_account(BankAccountCreate(
        name=f"{TAG} Bank", account_type="checking", current_balance=0, is_primary=True))
    bank = bank_res.get("account") or bank_res.get("bank") or bank_res
    bank_id = bank.get("id") if isinstance(bank, dict) else None
    if not bank_id:
        got = sb.table("capital_bank_accounts").select("id").eq("name", f"{TAG} Bank").limit(1).execute().data
        bank_id = got[0]["id"] if got else None
    track("capital_bank_accounts", bank_id)
    check("capital bank created", bool(bank_id), bank_id or "MISSING")
    if not bank_id:
        return

    b0 = acct_balance("23900")
    i0 = acct_balance("71400")

    # 2) Investor
    invr = await create_investor(InvestorCreate(name=f"{TAG} Investor", available_capital=0))
    investor = invr.get("investor") or invr
    investor_id = investor.get("id")
    track("investors", investor_id)
    check("investor created", bool(investor_id), investor_id or "MISSING")

    # 3) Promissory note — 1 mo interest-only + balloon principal
    note_res = await create_promissory_note(PromissoryNoteCreate(
        investor_id=investor_id, loan_amount=12000, annual_rate=12.0,
        term_months=1, interest_only_months=1, amortization_months=0,
        bank_account_id=bank_id))
    note = note_res.get("note") or note_res
    note_id = note.get("id")
    track("promissory_notes", note_id)
    check("note created", bool(note_id), f"total_due={note.get('total_due')}")
    check("note total_due = 12,120", abs(float(note.get("total_due", 0)) - 12120) < 1)

    await confirm_investor_pending(confirm_transaction, investor_id)
    dep_23900 = round(acct_balance("23900") - b0, 2)
    check("deposit booked to 23900 (+12,000)", abs(dep_23900 - 12000) < 1, f"Δ23900={dep_23900}")

    # 4) Pay #1 — pure interest
    await record_note_payment(note_id, RecordPaymentRequest(
        amount=120, payment_method="bank_transfer", bank_account_id=bank_id, notes=TAG))
    await confirm_investor_pending(confirm_transaction, investor_id)
    int_mag = round(-(acct_balance("71400") - i0), 2)
    prin_bal = round(acct_balance("23900") - b0, 2)
    check("interest $120 → 71400", abs(int_mag - 120) < 1, f"71400 magnitude={int_mag}")
    check("principal 23900 unchanged after interest pmt", abs(prin_bal - 12000) < 1, f"Δ23900={prin_bal}")

    # 5) Pay #2 — balloon principal
    await record_note_payment(note_id, RecordPaymentRequest(
        amount=12000, payment_method="bank_transfer", bank_account_id=bank_id, notes=TAG))
    await confirm_investor_pending(confirm_transaction, investor_id)
    prin_bal2 = round(acct_balance("23900") - b0, 2)
    int_mag2 = round(-(acct_balance("71400") - i0), 2)
    check("principal $12,000 → 23900 back to 0", abs(prin_bal2) < 1, f"Δ23900={prin_bal2}")
    check("interest stays $120 (no double-count)", abs(int_mag2 - 120) < 1, f"71400 magnitude={int_mag2}")

    note_now = sb.table("promissory_notes").select("status, paid_amount").eq("id", note_id).single().execute().data
    check("note fully paid", note_now.get("status") == "paid", f"status={note_now.get('status')}")

    # 6) Reconciliation endpoint
    rec = await reconcile_investors()
    pc = rec["checks"]["principal_vs_notes_payable"]
    ic = rec["checks"]["interest_paid_ledger"]
    check("reconciliation OK (principal == 23900)", rec["ok"],
          f"expected={pc['expected_outstanding_principal']} 23900={pc['ledger_23900_balance']} diff={pc['diff']}")
    check("reconciliation reports interest", ic["interest_recognized_to_date"] >= 120 - 1,
          f"interest={ic['interest_recognized_to_date']} scheduled={ic['interest_scheduled_total']}")


async def teardown():
    print("\n--- teardown ---")
    # capital_transactions + flows for our investor/notes first
    for tbl, key in (("capital_transactions", "investor_id"), ("capital_flows", "investor_id")):
        for t, i in CREATED:
            if t == "investors":
                try:
                    sb.table(tbl).delete().eq(key, i).execute()
                except Exception:
                    pass
    for t, i in CREATED:
        if t == "promissory_notes":
            try:
                sb.table("promissory_note_payments").delete().eq("promissory_note_id", i).execute()
            except Exception:
                pass
    for t, i in reversed(CREATED):
        try:
            sb.table(t).delete().eq("id", i).execute()
        except Exception as e:
            print(f"  ! could not delete {t}:{i} — {e}")
    # The capital bank auto-creates a chart account named after the bank — sweep it.
    try:
        sb.table("capital_accounts").delete().ilike("name", f"%{TAG}%").execute()
    except Exception:
        pass
    print("  done")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        asyncio.run(teardown())
    print(f"\n{'='*48}")
    if FAILURES:
        print(f"❌ {len(FAILURES)} FAILURE(S): {FAILURES}")
        sys.exit(1)
    print("✅ ALL CHECKS PASSED")
