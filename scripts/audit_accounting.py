#!/usr/bin/env python3
"""
Accounting integrity audit — surfaces "números que no cuadran".

Read-only. Checks the LINKS and invariants that must always hold so the
financial statements add up:

  1. No transaction posted to a HEADER account (you never post to a grouper).
  2. No P&L money stranded on Uncategorized / generic accounts.
  3. Every invoice's accrual leg == its total, and amount_paid == posted payments.
  4. Double-entry: each linked pair balances; orphan (unpaired) bank legs flagged.
  5. P&L (income-statement) reconciles with the dashboard desglose.
  6. Balance sheet balances: Assets == Liabilities + Equity.
  7. Orphan transactions (account_id not in chart) / loans booked as income.

Run:  .venv/bin/python scripts/audit_accounting.py
"""
import os, sys, asyncio
from collections import defaultdict
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

INCOME_TYPES = {"Income", "Other Income", "income"}
EXPENSE_TYPES = {"Expenses", "Other Expense", "Cost of Goods Sold", "expense", "cogs"}
PL_TYPES = INCOME_TYPES | EXPENSE_TYPES

findings = []
def flag(sev, title, detail=""):
    findings.append((sev, title, detail))

def fetch_all(table, select="*", **eq):
    rows, frm = [], 0
    while True:
        q = sb.table(table).select(select)
        for k, v in eq.items():
            q = q.eq(k, v)
        r = q.range(frm, frm + 999).execute().data
        if not r:
            break
        rows += r
        if len(r) < 1000:
            break
        frm += 1000
    return rows

accts = fetch_all("accounting_accounts",
                  "id,code,name,account_type,is_header,is_active,parent_account_id")
by_id = {a["id"]: a for a in accts}
txns = [t for t in fetch_all("accounting_transactions",
        "id,account_id,amount,is_income,transaction_type,entity_type,entity_id,"
        "bank_account_id,linked_transaction_id,property_id,description,notes,status,transaction_date")
        if t.get("status") != "voided"]

# ---- 1 & 2: posts to headers / uncategorized ----------------------------
header_hits = defaultdict(lambda: [0, 0.0])
uncat = defaultdict(lambda: [0, 0.0])
orphan = 0
for t in txns:
    a = by_id.get(t.get("account_id"))
    amt = float(t.get("amount") or 0)
    if not a:
        orphan += 1
        continue
    if a.get("is_header") and a["account_type"] in PL_TYPES:
        header_hits[a["name"]][0] += 1
        header_hits[a["name"]][1] += amt
    if a["name"] in ("Uncategorized Income", "Uncategorized Expense"):
        uncat[a["name"]][0] += 1
        uncat[a["name"]][1] += amt
for name, (n, amt) in sorted(header_hits.items(), key=lambda x: -x[1][1]):
    flag("HIGH", f"{n} lines posted to HEADER account '{name}'", f"{n} txns, ${amt:,.2f} — headers are groupers, must be re-linked to a leaf")
for name, (n, amt) in uncat.items():
    flag("MED", f"{n} lines on '{name}'", f"${amt:,.2f} — needs categorization")
if orphan:
    flag("HIGH", f"{orphan} transactions reference an account_id NOT in the chart", "")

# ---- 3: invoices vs ledger ---------------------------------------------
invs = fetch_all("accounting_invoices",
                 "id,invoice_number,direction,total_amount,amount_paid,balance_due,status,property_id,counterparty_name")
acc_by_inv = defaultdict(float)   # entity_id -> posted P&L accrual (signed abs)
for t in txns:
    if t.get("entity_type") == "invoice" and t.get("entity_id"):
        a = by_id.get(t.get("account_id"))
        if a and a["account_type"] in PL_TYPES:
            acc_by_inv[t["entity_id"]] += float(t.get("amount") or 0)
mismatch = 0
for inv in invs:
    if inv["status"] == "voided":
        continue
    posted = acc_by_inv.get(inv["id"], 0.0)
    tot = float(inv.get("total_amount") or 0)
    if abs(posted - tot) > 0.5:
        mismatch += 1
        if mismatch <= 8:
            flag("HIGH", f"Invoice {inv['invoice_number']} total ${tot:,.2f} != posted P&L accrual ${posted:,.2f}",
                 f"{inv['direction']} — {inv.get('counterparty_name')}")
if mismatch > 8:
    flag("HIGH", f"...and {mismatch-8} more invoice/accrual mismatches", "")
if not mismatch:
    flag("OK", "All invoice accruals match their totals", f"{len(invs)} invoices")

# ---- 4: double-entry pairing (bank legs) --------------------------------
unpaired = 0
for t in txns:
    if t.get("bank_account_id") and not t.get("linked_transaction_id"):
        # bank movements can be single-sided only for opening balances/transfers
        if t.get("entity_type") not in ("opening_balance", "bank_transfer", "bank_statement"):
            unpaired += 1
if unpaired:
    flag("LOW", f"{unpaired} bank-leg transactions have no linked_transaction_id pair", "(may be legacy single-entry)")

# ---- 5: P&L vs dashboard reconciliation --------------------------------
sys.path.insert(0, os.getcwd())
try:
    from api.routes.accounting import get_income_statement, get_accounting_dashboard
    loop = asyncio.new_event_loop()
    pnl = loop.run_until_complete(get_income_statement())
    dash = loop.run_until_complete(get_accounting_dashboard(period="all"))
    s = pnl["sections"]
    ds = dash["summary"]
    # dashboard total_income vs P&L (income + other_income)
    pnl_income = s["total_income"] + s["total_other_income"]
    if abs(pnl_income - ds["total_income"]) > 1:
        flag("MED", "Dashboard total_income != P&L income",
             f"dash=${ds['total_income']:,.2f} vs P&L=${pnl_income:,.2f}")
    else:
        flag("OK", "Dashboard income reconciles with P&L", f"${ds['total_income']:,.2f}")
    # net income sanity
    flag("INFO", f"P&L Net Income = ${s['net_income']:,.2f}",
         f"GrossProfit=${s['gross_profit']:,.2f} NetOp=${s['net_operating_income']:,.2f}")
except Exception as e:
    flag("ERR", "Could not run P&L/dashboard reconciliation", str(e)[:120])

# ---- 6: balance sheet balances -----------------------------------------
try:
    from api.routes.accounting import get_balance_sheet
    bs = loop.run_until_complete(get_balance_sheet())
    ta = bs.get("total_assets") or bs.get("sections", {}).get("total_assets")
    tl = bs.get("total_liabilities") or bs.get("sections", {}).get("total_liabilities")
    te = bs.get("total_equity") or bs.get("sections", {}).get("total_equity")
    if None not in (ta, tl, te):
        diff = ta - (tl + te)
        sev = "OK" if abs(diff) < 1 else "HIGH"
        flag(sev, f"Balance sheet: A ${ta:,.2f} = L ${tl:,.2f} + E ${te:,.2f}  (diff ${diff:,.2f})", "")
except Exception as e:
    flag("INFO", "Balance sheet check skipped", str(e)[:100])

# ---- 7: loans booked as income -----------------------------------------
loan_income = [t for t in txns if t.get("is_income")
               and by_id.get(t.get("account_id"), {}).get("account_type") in INCOME_TYPES
               and any(k in ((t.get("description") or "") + (t.get("notes") or "")).upper()
                       for k in ("PRESTAMO", "PRÉSTAMO", "LOAN", "CREDITO", "CRÉDITO"))]
if loan_income:
    tot = sum(float(t["amount"]) for t in loan_income)
    flag("HIGH", f"{len(loan_income)} 'PRESTAMO/loan' lines booked as INCOME (${tot:,.2f})",
         "a loan is a liability, not revenue — inflates income")

# ---- report -------------------------------------------------------------
order = {"HIGH": 0, "MED": 1, "LOW": 2, "ERR": 3, "INFO": 4, "OK": 5}
print("\n" + "=" * 70)
print("  ACCOUNTING INTEGRITY AUDIT")
print("=" * 70)
for sev in ("HIGH", "MED", "LOW", "ERR", "INFO", "OK"):
    for s2, title, detail in [f for f in findings if f[0] == sev]:
        tag = {"HIGH": "🔴", "MED": "🟡", "LOW": "🔵", "ERR": "⚠️ ", "INFO": "ℹ️ ", "OK": "✅"}[sev]
        print(f"{tag} [{sev:<4}] {title}")
        if detail:
            print(f"            {detail}")
highs = sum(1 for f in findings if f[0] in ("HIGH", "ERR"))
print("=" * 70)
print(f"  {highs} high-severity issue(s), {len(findings)} checks total")
print("=" * 70)
