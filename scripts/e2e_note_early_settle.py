"""
E2E — early note settlement policy (pro-rata vs make-whole).

Pro-rata (default): settling a note before term charges only interest ACCRUED to
date (71400), condoning the rest. Make-whole: charges the FULL scheduled interest.
Both return principal to 23900. Verified against the real DB, self-cleaning.

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_note_early_settle.py
"""
import asyncio
import sys
import time
from datetime import date, timedelta

sys.path.insert(0, ".")
from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-SETTLE-{int(time.time())}"
FAILURES: list[str] = []
CREATED: list[tuple[str, str]] = []
_NEEDED = [
    ("23900", "Investor Notes Payable", "liability", "investor_debt", "balance_sheet", 245),
    ("23950", "Accrued Interest Payable", "liability", "investor_debt", "balance_sheet", 246),
    ("71400", "Interest paid", "expense", "general", "profit_loss", 630),
]


def track(t, i):
    if i:
        CREATED.append((t, i))


def check(name, cond, detail=""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def seed():
    for code, name, atype, cat, section, order in _NEEDED:
        if sb.table("capital_accounts").select("id").eq("code", code).limit(1).execute().data:
            continue
        row = sb.table("capital_accounts").insert({
            "code": code, "name": name, "account_type": atype, "category": cat,
            "is_header": False, "report_section": section, "display_order": order, "is_active": True,
        }).execute().data
        if row:
            track("capital_accounts", row[0]["id"])


def bal(code):
    from api.routes.capital.investors import _capital_account_balance
    return _capital_account_balance(code)


async def confirm_pending(confirm_fn, investor_id):
    rows = sb.table("capital_transactions").select("id") \
        .eq("investor_id", investor_id).eq("status", "pending_confirmation").execute().data or []
    for r in rows:
        try:
            await confirm_fn(r["id"])
        except Exception:
            pass


async def main():
    from api.routes.capital.accounting import BankAccountCreate, create_bank_account
    from api.routes.capital.investors import InvestorCreate, create_investor
    from api.routes.capital.promissory_notes import (
        PromissoryNoteCreate, create_promissory_note, RecordPaymentRequest, settle_note_early,
    )
    from api.routes.capital.payments import confirm_transaction
    import api.services.capital_interest_accrual as accr

    print(f"\n=== {TAG} — early settlement (pro-rata vs make-whole) ===\n")
    seed()
    accr._acct_exists_cache.clear()

    bank_res = await create_bank_account(BankAccountCreate(name=f"{TAG} Bank", current_balance=0, is_primary=True))
    bank_id = (bank_res.get("account") or bank_res).get("id") or \
        (sb.table("capital_bank_accounts").select("id").eq("name", f"{TAG} Bank").limit(1).execute().data or [{}])[0].get("id")
    track("capital_bank_accounts", bank_id)

    invr = await create_investor(InvestorCreate(name=f"{TAG} Investor", available_capital=0))
    investor_id = (invr.get("investor") or invr).get("id")
    track("investors", investor_id)

    b0, i0 = bal("23900"), bal("71400")
    start_past = (date.today() - timedelta(days=40)).isoformat()  # ~1 month elapsed

    # ── PRO-RATA note: only accrued interest charged on early settle ──
    n1 = await create_promissory_note(PromissoryNoteCreate(
        investor_id=investor_id, loan_amount=12000, annual_rate=12.0,
        term_months=3, interest_only_months=3, amortization_months=0,
        start_date=start_past, make_whole=False, bank_account_id=bank_id))
    n1_id = (n1.get("note") or n1).get("id")
    track("promissory_notes", n1_id)
    await confirm_pending(confirm_transaction, investor_id)
    check("pro-rata deposit → 23900 +12,000", abs((bal("23900") - b0) - 12000) < 1)

    res1 = await settle_note_early(n1_id, RecordPaymentRequest(amount=0, bank_account_id=bank_id, notes=TAG))
    await confirm_pending(confirm_transaction, investor_id)
    check("pro-rata policy reported", res1["policy"] == "pro_rata", res1["policy"])
    check("pro-rata charges ~1 mo interest ($120)", abs(res1["interest"] - 120) < 1, f"interest={res1['interest']}")
    check("pro-rata condones future interest ($240)", abs(res1["interest_condoned"] - 240) < 1, f"condoned={res1['interest_condoned']}")
    check("pro-rata: 71400 = 120 (only accrued)", abs((-(bal("71400") - i0)) - 120) < 1, f"71400={-(bal('71400')-i0)}")
    check("pro-rata: 23900 back to 0", abs(bal("23900") - b0) < 1, f"Δ23900={bal('23900')-b0}")
    check("pro-rata: note paid", sb.table("promissory_notes").select("status").eq("id", n1_id).single().execute().data["status"] == "paid")

    # ── MAKE-WHOLE note: full interest charged on early settle ──
    # Needs the make_whole column (migration 105). Skip gracefully if absent.
    try:
        sb.table("promissory_notes").select("make_whole").limit(1).execute()
        has_mw = True
    except Exception:
        has_mw = False
    if not has_mw:
        print("  ⏭  make-whole checks skipped — column 'make_whole' missing (run migration 105)")
        return

    i1 = bal("71400")
    n2 = await create_promissory_note(PromissoryNoteCreate(
        investor_id=investor_id, loan_amount=12000, annual_rate=12.0,
        term_months=3, interest_only_months=3, amortization_months=0,
        start_date=date.today().isoformat(), make_whole=True, bank_account_id=bank_id))
    n2_id = (n2.get("note") or n2).get("id")
    track("promissory_notes", n2_id)
    await confirm_pending(confirm_transaction, investor_id)

    res2 = await settle_note_early(n2_id, RecordPaymentRequest(amount=0, bank_account_id=bank_id, notes=TAG))
    await confirm_pending(confirm_transaction, investor_id)
    check("make-whole policy reported", res2["policy"] == "make_whole", res2["policy"])
    check("make-whole charges FULL interest ($360)", abs(res2["interest"] - 360) < 1, f"interest={res2['interest']}")
    check("make-whole condones nothing", abs(res2["interest_condoned"]) < 1, f"condoned={res2['interest_condoned']}")
    check("make-whole: 71400 += 360", abs((-(bal("71400") - i1)) - 360) < 1, f"Δ71400={-(bal('71400')-i1)}")


async def teardown():
    print("\n--- teardown ---")
    for t, i in CREATED:
        if t == "investors":
            for tbl in ("capital_transactions", "capital_flows", "investments"):
                try:
                    sb.table(tbl).delete().eq("investor_id", i).execute()
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
            print(f"  ! {t}:{i} — {e}")
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
