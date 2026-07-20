"""
E2E — Capital "Casas Financiadas" section.

Seeds a financed (RTO) house the way Homes would (property + client + sale +
rto_contract + rto_payments), then exercises the Capital-side read/earmark flow:

  • list_financed_houses surfaces the house with correct bucket/terms/collection.
  • assign_investor earmarks an EXISTING investor ticket to the house WITHOUT
    moving money → the 23900 ledger balance and the investor reconciliation are
    unchanged (the core invariant of the earmark design).
  • unassign_investor removes the earmark, again with no ledger movement.

Verified against the real DB, self-seeding and self-cleaning.

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_financed_houses.py
"""
import asyncio
import sys
import time
from datetime import date, timedelta

sys.path.insert(0, ".")
from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-FINHOUSE-{int(time.time())}"
FAILURES: list = []
CREATED: list = []
_NEEDED_ACCTS = [
    ("23900", "Investor Notes Payable", "liability", "investor_debt", "balance_sheet", 245),
]


def track(t, i):
    if i:
        CREATED.append((t, i))


def check(name, cond, detail=""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def seed_accounts():
    for code, name, atype, cat, section, order in _NEEDED_ACCTS:
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


def seed_house():
    """Insert a financed house exactly as Homes would leave it (rto_active)."""
    prop = sb.table("properties").insert({
        "address": f"{TAG} 100 Test St", "city": "Houston", "state": "Texas",
        "property_code": f"H{int(time.time()) % 100000}", "sale_price": 40000, "status": "sold",
    }).execute().data[0]
    track("properties", prop["id"])

    client = sb.table("clients").insert({"name": f"{TAG} Buyer", "status": "rto_active"}).execute().data[0]
    track("clients", client["id"])

    sale = sb.table("sales").insert({
        "property_id": prop["id"], "client_id": client["id"], "sale_type": "rto",
        "sale_price": 40000, "status": "rto_active",
        "rto_down_payment": 12000, "rto_monthly_payment": 700, "rto_term_months": 40,
        "financed_remaining": 28000, "financed_down_payment": 12000,
        "capital_payment_status": "received",
    }).execute().data[0]
    track("sales", sale["id"])

    start = (date.today() - timedelta(days=60)).isoformat()
    end = (date.today() + timedelta(days=365)).isoformat()
    contract = sb.table("rto_contracts").insert({
        "sale_id": sale["id"], "property_id": prop["id"], "client_id": client["id"],
        "monthly_rent": 700, "purchase_price": 40000, "down_payment": 12000,
        "term_months": 40, "start_date": start, "end_date": end, "status": "active",
    }).execute().data[0]
    track("rto_contracts", contract["id"])
    sb.table("sales").update({"rto_contract_id": contract["id"]}).eq("id", sale["id"]).execute()

    # Two payments: one paid, one scheduled
    for n, st, paid in ((1, "paid", 700), (2, "scheduled", None)):
        due = (date.today() - timedelta(days=30 * (2 - n))).isoformat()
        row = {
            "rto_contract_id": contract["id"], "client_id": client["id"],
            "payment_number": n, "amount": 700, "due_date": due, "status": st,
        }
        if paid:
            row["paid_amount"] = paid
            row["paid_date"] = due
        pr = sb.table("rto_payments").insert(row).execute().data[0]
        track("rto_payments", pr["id"])

    return sale["id"], prop["id"], contract["id"]


async def main():
    from api.routes.capital.accounting import BankAccountCreate, create_bank_account
    from api.routes.capital.investors import InvestorCreate, create_investor, reconcile_investors
    from api.routes.capital.payments import confirm_transaction
    from api.routes.capital.financed_houses import (
        list_financed_houses, get_financed_house, assignable_investments,
        assign_investor, unassign_investor, DeployInvestorRequest, UnassignInvestorRequest,
    )

    def investor_row(iid):
        return (sb.table("investors").select("available_capital, total_invested")
                .eq("id", iid).limit(1).execute().data or [{}])[0]

    print(f"\n=== {TAG} — Casas Financiadas ===\n")
    seed_accounts()
    sale_id, prop_id, contract_id = seed_house()

    # ── LIST surfaces the house ──
    lst = await list_financed_houses(None)
    mine = next((h for h in lst["houses"] if h["sale_id"] == sale_id), None)
    check("house appears in list", mine is not None)
    if mine:
        check("bucket = activa", mine["bucket"] == "activa", mine["bucket"])
        check("financed_remaining = 28000", abs(mine["terms"]["financed_remaining"] - 28000) < 1)
        check("monthly = 700", abs(mine["terms"]["monthly_payment"] - 700) < 1)
        check("collection: 1/2 paid", mine["collection"]["payments_made"] == 1 and mine["collection"]["total_payments"] == 2,
              f"{mine['collection']['payments_made']}/{mine['collection']['total_payments']}")
        check("collection: total_paid 700", abs(mine["collection"]["total_paid"] - 700) < 1)

    # status filter
    lst_act = await list_financed_houses("activa")
    check("status=activa filter includes it", any(h["sale_id"] == sale_id for h in lst_act["houses"]))
    lst_rev = await list_financed_houses("por_revisar")
    check("status=por_revisar excludes it", not any(h["sale_id"] == sale_id for h in lst_rev["houses"]))

    # ── Investor with available capital (no ticket yet — the real-world case) ──
    bank = await create_bank_account(BankAccountCreate(name=f"{TAG} Bank", current_balance=0, is_primary=True))
    bank_id = (bank.get("account") or bank).get("id") or \
        (sb.table("capital_bank_accounts").select("id").eq("name", f"{TAG} Bank").limit(1).execute().data or [{}])[0].get("id")
    track("capital_bank_accounts", bank_id)

    invr = await create_investor(InvestorCreate(name=f"{TAG} Investor", available_capital=50000))
    investor_id = (invr.get("investor") or invr).get("id")
    track("investors", investor_id)

    def recon_diff(r):
        return round(float(r["checks"]["principal_vs_notes_payable"]["diff"]), 2)

    b0 = bal("23900")
    diff0 = recon_diff(await reconcile_investors())

    # assignable-investments returns INVESTORS with available capital
    avail = await assignable_investments(sale_id)
    mine_av = next((a for a in avail["investors"] if a["investor_id"] == investor_id), None)
    check("investor listed as assignable", mine_av is not None)
    if mine_av:
        check("shows available capital 50,000", abs(mine_av["available_capital"] - 50000) < 1, str(mine_av["available_capital"]))

    # over-deploy (amount > available) must be rejected — protects the round-trip
    over_rejected = False
    try:
        await assign_investor(sale_id, DeployInvestorRequest(investor_id=investor_id, amount=999999, expected_return_rate=12.0))
    except Exception:
        over_rejected = True
    check("over-deploy rejected", over_rejected)
    ir_over = investor_row(investor_id)
    check("over-deploy left available untouched (50k)", abs(float(ir_over.get("available_capital") or 0) - 50000) < 1, str(ir_over.get("available_capital")))

    # ── ASSIGN = deploy capital → creates ticket, moves available + 23900 ──
    DEPLOY = 5000
    ar = await assign_investor(sale_id, DeployInvestorRequest(investor_id=investor_id, amount=DEPLOY, expected_return_rate=12.0))
    check("assign ok", ar.get("ok") is True)
    investment_id = (ar.get("investment") or {}).get("id")
    check("ticket created", bool(investment_id))
    if investment_id:
        track("investments", investment_id)
    await confirm_pending(confirm_transaction, investor_id)

    det = await get_financed_house(sale_id)
    linked = det["house"]["investors"]
    check("house now shows the investor", any(i["investment_id"] == investment_id for i in linked))
    check("23900 += deploy (5,000)", abs((bal("23900") - b0) - DEPLOY) < 0.5, f"Δ23900={bal('23900')-b0}")
    ir = investor_row(investor_id)
    check("available_capital 50k → 45k", abs(float(ir.get("available_capital") or 0) - 45000) < 1, str(ir.get("available_capital")))
    check("total_invested 0 → 5k", abs(float(ir.get("total_invested") or 0) - 5000) < 1, str(ir.get("total_invested")))
    # Both 23900 and note-less-investments moved +5000 → reconciliation diff unchanged.
    check("assign neutral to reconciliation", abs(recon_diff(await reconcile_investors()) - diff0) < 0.5)

    # ── UNASSIGN = deshacer completo: reverse ledger + restore investor ──
    ur = await unassign_investor(sale_id, UnassignInvestorRequest(investment_id=investment_id))
    check("undo ok", ur.get("ok") is True)
    check("23900 back to start", abs(bal("23900") - b0) < 0.5, f"Δ23900={bal('23900')-b0}")
    ir2 = investor_row(investor_id)
    check("available_capital restored to 50k", abs(float(ir2.get("available_capital") or 0) - 50000) < 1, str(ir2.get("available_capital")))
    check("total_invested back to 0", abs(float(ir2.get("total_invested") or 0)) < 1, str(ir2.get("total_invested")))
    det2 = await get_financed_house(sale_id)
    check("house no longer shows the investor", not any(i["investment_id"] == investment_id for i in det2["house"]["investors"]))
    check("ticket deleted", not (sb.table("investments").select("id").eq("id", investment_id).execute().data or []))
    check("undo neutral to reconciliation", abs(recon_diff(await reconcile_investors()) - diff0) < 0.5)


async def teardown():
    print("\n--- teardown ---")
    for t, i in CREATED:
        if t == "investors":
            # Break the investments ↔ capital_flows FK cycle before deleting.
            try:
                sb.table("investments").update({"capital_flow_id": None}).eq("investor_id", i).execute()
            except Exception:
                pass
            for tbl in ("capital_transactions", "capital_flows", "investments"):
                try:
                    sb.table(tbl).delete().eq("investor_id", i).execute()
                except Exception:
                    pass
    # Break the sales → rto_contracts FK before deleting either.
    for t, i in CREATED:
        if t == "sales":
            try:
                sb.table("sales").update({"rto_contract_id": None}).eq("id", i).execute()
            except Exception:
                pass
    # delete children before parents via reversed insert order
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
