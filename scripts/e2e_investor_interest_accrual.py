"""
E2E — Accrual-basis investor interest (Capital).

Proves the monthly accrual model end-to-end against the real DB:
  • note deposit → 23900 (principal liability)
  • monthly accrual recognizes scheduled interest → 71400 expense / 23950 payable
    (idempotent: re-running does not double-count)
  • an interest payment SETTLES 23950 (not re-expensed)
  • paying the note in full accrues any remaining interest, so 71400 == total
    scheduled interest and 23950 nets back to 0
  • principal returns to 23900 = 0; reconciliation ties out

Scenario: loan $12,000 @ 12%, 3 months interest-only ($120/mo = $360) + balloon.

Self-seeds the 3 Capital chart accounts it needs (23900/71400/23950) and tears
everything down (0 residue).

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_investor_interest_accrual.py
"""
import asyncio
import sys
import time
from datetime import date

sys.path.insert(0, ".")
from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-ACCR-{int(time.time())}"
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


def seed_accounts():
    for code, name, atype, cat, section, order in _NEEDED:
        got = sb.table("capital_accounts").select("id").eq("code", code).limit(1).execute().data
        if got:
            continue
        row = sb.table("capital_accounts").insert({
            "code": code, "name": name, "account_type": atype, "category": cat,
            "is_header": False, "report_section": section, "display_order": order, "is_active": True,
        }).execute().data
        if row:
            track("capital_accounts", row[0]["id"])
            print(f"  (seeded capital account {code} {name})")


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
    from api.routes.capital.investors import (
        InvestorCreate, create_investor, reconcile_investors, investor_account_statement,
    )
    from api.routes.capital.promissory_notes import (
        PromissoryNoteCreate, create_promissory_note, RecordPaymentRequest, record_note_payment,
        delete_promissory_note,
    )
    from api.routes.capital.payments import confirm_transaction
    import api.services.capital_interest_accrual as accr

    print(f"\n=== {TAG} — accrual-basis investor interest ===\n")
    seed_accounts()
    accr._acct_exists_cache.clear()  # re-detect 23950 now that it's seeded

    bank_res = await create_bank_account(BankAccountCreate(
        name=f"{TAG} Bank", account_type="checking", current_balance=0, is_primary=True))
    bank = bank_res.get("account") or bank_res
    bank_id = (bank.get("id") if isinstance(bank, dict) else None) or \
        (sb.table("capital_bank_accounts").select("id").eq("name", f"{TAG} Bank").limit(1).execute().data or [{}])[0].get("id")
    track("capital_bank_accounts", bank_id)
    check("capital bank + 23950 ready", bool(bank_id) and accr.accrued_account_ready())

    b0, i0, a0 = bal("23900"), bal("71400"), bal("23950")

    invr = await create_investor(InvestorCreate(name=f"{TAG} Investor", available_capital=0))
    investor_id = (invr.get("investor") or invr).get("id")
    track("investors", investor_id)

    note_res = await create_promissory_note(PromissoryNoteCreate(
        investor_id=investor_id, loan_amount=12000, annual_rate=12.0,
        term_months=3, interest_only_months=3, amortization_months=0, bank_account_id=bank_id))
    note = note_res.get("note") or note_res
    note_id = note.get("id")
    track("promissory_notes", note_id)
    check("note total_due = 12,360 ($360 interest)", abs(float(note.get("total_due", 0)) - 12360) < 1,
          f"total_due={note.get('total_due')}")

    await confirm_pending(confirm_transaction, investor_id)
    check("deposit → 23900 +12,000", abs((bal("23900") - b0) - 12000) < 1, f"Δ23900={bal('23900')-b0}")

    # helper to reload the full note dict (with investors) for accrual calls
    def load_note():
        return sb.table("promissory_notes").select("*, investors(name)").eq("id", note_id).single().execute().data

    # ── Monthly accrual: simulate 2 periods elapsed ──
    accr.accrue_note(load_note(), 2)
    check("accrual 2 periods → 71400 = 240", abs((-(bal("71400") - i0)) - 240) < 1, f"71400 mag={-(bal('71400')-i0)}")
    check("accrual → 23950 = 240", abs((bal("23950") - a0) - 240) < 1, f"23950={bal('23950')-a0}")
    # idempotency
    accr.accrue_note(load_note(), 2)
    check("accrual idempotent (still 240)", abs((-(bal("71400") - i0)) - 240) < 1, f"71400 mag={-(bal('71400')-i0)}")

    # ── Partial interest payment settles 23950 ──
    await record_note_payment(note_id, RecordPaymentRequest(amount=120, bank_account_id=bank_id, notes=TAG))
    await confirm_pending(confirm_transaction, investor_id)
    check("interest pmt settles 23950 → 120", abs((bal("23950") - a0) - 120) < 1, f"23950={bal('23950')-a0}")
    check("71400 unchanged by settlement (240)", abs((-(bal("71400") - i0)) - 240) < 1, f"71400 mag={-(bal('71400')-i0)}")
    check("23900 unchanged by interest pmt", abs((bal("23900") - b0) - 12000) < 1, f"Δ23900={bal('23900')-b0}")

    # ── Payoff: accrues remaining interest, settles all, returns principal ──
    total_due = float(load_note()["total_due"])
    paid = float(load_note().get("paid_amount", 0) or 0)
    await record_note_payment(note_id, RecordPaymentRequest(amount=total_due - paid, bank_account_id=bank_id, notes=TAG))
    await confirm_pending(confirm_transaction, investor_id)
    check("payoff → 71400 = 360 (all interest)", abs((-(bal("71400") - i0)) - 360) < 1, f"71400 mag={-(bal('71400')-i0)}")
    check("payoff → 23950 nets to 0", abs(bal("23950") - a0) < 1, f"23950={bal('23950')-a0}")
    check("payoff → 23900 back to 0", abs(bal("23900") - b0) < 1, f"Δ23900={bal('23900')-b0}")
    check("note fully paid", load_note().get("status") == "paid", f"status={load_note().get('status')}")

    rec = await reconcile_investors()
    pc = rec["checks"]["principal_vs_notes_payable"]
    check("reconciliation OK (principal == 23900)", rec["ok"], f"diff={pc['diff']}")

    # ── Point 4: investor account-statement endpoint reflects the ledger ──
    st = await investor_account_statement(investor_id)
    check("statement principal outstanding = 0", abs(st["principal"]["outstanding"]) < 1, f"{st['principal']}")
    check("statement interest recognized = 360", abs(st["interest"]["recognized"] - 360) < 1, f"{st['interest']}")
    check("statement interest paid = 360", abs(st["interest"]["paid"] - 360) < 1)
    check("statement accrued unpaid = 0", abs(st["interest"]["accrued_unpaid"]) < 1)

    # ── Point 6: deleting a note voids its (phantom) accruals ──
    i_before = -(bal("71400") - i0)
    n2 = await create_promissory_note(PromissoryNoteCreate(
        investor_id=investor_id, loan_amount=6000, annual_rate=12.0,
        term_months=2, interest_only_months=2, amortization_months=0, bank_account_id=bank_id))
    n2_id = (n2.get("note") or n2).get("id")
    track("promissory_notes", n2_id)
    n2_full = sb.table("promissory_notes").select("*, investors(name)").eq("id", n2_id).single().execute().data
    accr.accrue_note(n2_full, 1)  # 6000 @ 12% → $60/mo
    check("throwaway accrual raised 71400 by 60", abs((-(bal("71400") - i0)) - (i_before + 60)) < 1,
          f"71400 mag={-(bal('71400')-i0)}")
    await delete_promissory_note(n2_id)
    check("delete voided the accrual (71400 restored)", abs((-(bal("71400") - i0)) - i_before) < 1,
          f"71400 mag={-(bal('71400')-i0)}")


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
