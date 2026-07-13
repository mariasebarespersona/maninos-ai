#!/usr/bin/env python3
"""
Deep accounting-integrity sweep — hunts the CLASSES of silent failure like the
one that hid H48's enganche (a surviving reference pointing to a hard-deleted
ledger transaction). Read-only.

Checks:
  1. Broken double-entry pairs (a leg whose linked partner was deleted/voided).
  2. Dangling references from: invoice_payments, statement_movements,
     commission_payments, payment_orders → a deleted/voided transaction.
  3. Orphaned ledger legs for deleted invoices (entity_type=invoice → gone).
  4. Orphan transactions (account_id / property_id no longer exist).
  5. Invoice math: status=paid but balance_due>0; amount_paid != Σ payments;
     balance_due != total - amount_paid.
  6. Sales completed but NO revenue posted; properties SOLD but cost still in
     Inventory (never recognized to COGS).
  7. Account mis-classification: a P&L-typed account whose ancestry roots in the
     Balance Sheet (or vice versa) — the "House Sales - COGS moved to Inventory"
     class of bug.

Run:  .venv/bin/python scripts/audit_integrity_deep.py
"""
import os
from collections import defaultdict
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

INCOME = {"Income", "Other Income"}
EXPENSE = {"Expenses", "Other Expense", "Cost of Goods Sold"}
PL = INCOME | EXPENSE

findings = []
def flag(sev, title, detail=""):
    findings.append((sev, title, detail))

def fetch_all(table, select="*"):
    rows, frm = [], 0
    while True:
        r = sb.table(table).select(select).range(frm, frm + 999).execute().data
        if not r:
            break
        rows += r
        if len(r) < 1000:
            break
        frm += 1000
    return rows

print("Loading tables...")
accts = fetch_all("accounting_accounts", "id,code,name,account_type,parent_account_id")
by_id = {a["id"]: a for a in accts}
txns = fetch_all("accounting_transactions",
    "id,amount,is_income,status,account_id,property_id,entity_type,entity_id,linked_transaction_id,transaction_type,description")
live = {t["id"]: t for t in txns if t.get("status") != "voided"}
all_txn_ids = {t["id"] for t in txns}
invoices = fetch_all("accounting_invoices", "id,invoice_number,total_amount,amount_paid,balance_due,status,direction,property_id,counterparty_name")
inv_by_id = {i["id"]: i for i in invoices}
props = {p["id"] for p in fetch_all("properties", "id")}

# ---- 1. Broken double-entry pairs --------------------------------------
broken = []
for t in live.values():
    lt = t.get("linked_transaction_id")
    if lt and lt not in live:   # partner missing or voided while this leg is live
        broken.append(t)
if broken:
    tot = sum(float(t["amount"] or 0) for t in broken)
    flag("HIGH", f"{len(broken)} live legs whose paired leg was deleted/voided (unbalanced) — ${tot:,.2f}",
         "; ".join(f"{t['transaction_number'] if 'transaction_number' in t else t['id'][:8]}=${float(t['amount'] or 0):,.0f}" for t in broken[:6]))
else:
    flag("OK", "All linked transaction pairs are intact (no orphaned legs)")

# ---- 2. Dangling references from side tables ---------------------------
def check_ref(table, col, label):
    try:
        rows = fetch_all(table, f"id,{col}")
    except Exception as e:
        flag("INFO", f"{table} ref check skipped", str(e)[:80]); return
    bad = [r for r in rows if r.get(col) and r[col] not in live]
    if bad:
        flag("HIGH", f"{len(bad)} {label} point to a deleted/voided transaction",
             f"table {table}.{col} — ids like " + ", ".join(str(r.get(col))[:8] for r in bad[:5]))
    else:
        flag("OK", f"{label}: all point to live transactions")

check_ref("accounting_invoice_payments", "transaction_id", "invoice payments")
check_ref("statement_movements", "transaction_id", "statement movements (posted)")
check_ref("statement_movements", "matched_transaction_id", "statement movements (matched)")
check_ref("commission_payments", "accounting_transaction_id", "commission payments")
check_ref("payment_orders", "accounting_transaction_id", "payment orders")

# ---- 3. Orphaned ledger legs for deleted invoices ----------------------
orphan_inv_legs = [t for t in live.values()
                   if t.get("entity_type") == "invoice" and t.get("entity_id") and t["entity_id"] not in inv_by_id]
if orphan_inv_legs:
    tot = sum(float(t["amount"] or 0) for t in orphan_inv_legs)
    flag("HIGH", f"{len(orphan_inv_legs)} ledger legs reference a DELETED invoice (${tot:,.2f})",
         "invoice was deleted but its accrual/payment legs survive")
else:
    flag("OK", "No ledger legs reference deleted invoices")

# ---- 4. Orphan transactions --------------------------------------------
orphan_acct = [t for t in live.values() if t.get("account_id") and t["account_id"] not in by_id]
orphan_prop = [t for t in live.values() if t.get("property_id") and t["property_id"] not in props]
if orphan_acct:
    flag("HIGH", f"{len(orphan_acct)} live transactions reference a non-existent ACCOUNT", "")
else:
    flag("OK", "All transactions reference a valid account")
if orphan_prop:
    flag("MED", f"{len(orphan_prop)} live transactions reference a deleted PROPERTY",
         "their per-house cost/revenue no longer ties to a house")

# ---- 5. Invoice math ----------------------------------------------------
pay_sum = defaultdict(float)
for p in fetch_all("accounting_invoice_payments", "invoice_id,amount"):
    pay_sum[p["invoice_id"]] += float(p.get("amount") or 0)
paid_but_owed = amt_mismatch = bal_mismatch = 0
for inv in invoices:
    if inv["status"] == "voided":
        continue
    tot = float(inv.get("total_amount") or 0)
    paid = float(inv.get("amount_paid") or 0)
    bal = float(inv.get("balance_due") or 0)
    if inv["status"] == "paid" and bal > 0.01:
        paid_but_owed += 1
    if abs(paid - pay_sum.get(inv["id"], 0.0)) > 0.5:
        amt_mismatch += 1
    if abs(bal - (tot - paid)) > 0.5:
        bal_mismatch += 1
for n, msg in ((paid_but_owed, "invoices marked PAID but balance_due > 0"),
               (amt_mismatch, "invoices whose amount_paid != sum of their payments"),
               (bal_mismatch, "invoices whose balance_due != total - amount_paid")):
    flag("MED" if n else "OK", f"{n} {msg}" if n else f"OK: {msg[3:] if msg.startswith('inv') else msg}")

# ---- 6. Sale / property vs ledger consistency --------------------------
rev_accts = {a["id"] for a in accts if a["code"] in ("House Sales", "House Sales - RTO")}
rev_by_prop = defaultdict(float)
for t in live.values():
    if t.get("account_id") in rev_accts and t.get("property_id"):
        rev_by_prop[t["property_id"]] += float(t["amount"] or 0) if t["is_income"] else -float(t["amount"] or 0)
sales = fetch_all("sales", "id,property_id,status,sale_price")
completed_no_rev = [s for s in sales if s.get("status") == "completed"
                    and rev_by_prop.get(s.get("property_id"), 0) < 1]
if completed_no_rev:
    flag("HIGH", f"{len(completed_no_rev)} COMPLETED sales with NO revenue posted", "sold but no income in the ledger")
else:
    flag("OK", "All completed sales have revenue posted")

# properties SOLD but cost still sitting in Inventory (not recognized to COGS)
sold_props = {p["id"]: p for p in fetch_all("properties", "id,property_code,status") if p.get("status") == "sold"}
inv_left = []
for pid, p in sold_props.items():
    code = p.get("property_code") or ""
    for concept in ("Compra", "Renovación", "Movida"):
        a = next((x for x in accts if x["code"] == f"{concept} {code}"), None)
        if not a:
            continue
        bal = sum((float(t["amount"]) if t["is_income"] else -float(t["amount"]))
                  for t in live.values() if t["account_id"] == a["id"])
        if bal > 1:
            inv_left.append(f"{concept} {code}=${bal:,.0f}")
if inv_left:
    flag("HIGH", f"{len(inv_left)} SOLD houses still carry cost in INVENTORY (should be COGS)",
         "; ".join(inv_left[:8]))
else:
    flag("OK", "No sold house has cost stuck in inventory")

# ---- 7. Account mis-classification (P&L vs Balance Sheet) --------------
BS_ROOTS = {"BS_ASSETS", "BS_LIABILITIES", "BS_EQUITY"}
PL_ROOTS = {"PL_INCOME", "PL_OTHER_INCOME", "PL_COGS", "PL_EXPENSES", "PL_OTHER_EXPENSES"}
def root_code(a):
    seen = set()
    cur = a
    while cur and cur.get("parent_account_id") and cur["parent_account_id"] in by_id and cur["id"] not in seen:
        seen.add(cur["id"])
        cur = by_id[cur["parent_account_id"]]
    return cur["code"] if cur else None
mis = []
for a in accts:
    at = a.get("account_type") or ""
    rc = root_code(a)
    if not rc:
        continue
    if at in PL and rc in BS_ROOTS:
        mis.append(f"{a['code']} ({at}) under {rc}")
    if at not in PL and at not in ("", None) and rc in PL_ROOTS:
        mis.append(f"{a['code']} ({at}) under {rc}")
if mis:
    flag("MED", f"{len(mis)} accounts whose type contradicts their P&L/BS section", "; ".join(mis[:8]))
else:
    flag("OK", "No account is mis-filed between P&L and Balance Sheet")

# ---- 8. Unbalanced double-entry pairs + unpaired P&L legs --------------
# Every linked pair must post debit == credit. Opening-balance-equity entries
# use a known is_income sign quirk that the Balance Sheet derives around, so
# they're excluded. A P&L leg with no linked pair (the sale_rto single-leg bug)
# is always wrong — income/expense always pairs with a bank/AR/AP leg.
try:
    def _signed(amt, at, is_income):
        # +amt when the account's balance naturally grows from this leg
        if at in EXPENSE:
            return amt if not is_income else -amt   # expense/COGS: debit grows
        return amt if is_income else -amt           # income/asset/liab/equity
    DN = {"Expenses", "Other Expense", "Cost of Goods Sold", "Bank",
          "Accounts receivable (A/R)", "Other Current Assets", "Fixed Assets", "Other Assets"}
    def _dc(t):
        at = (by_id.get(t["account_id"]) or {}).get("account_type", "")
        s = _signed(float(t.get("amount") or 0), at, t.get("is_income", False))
        return (s, 0.0) if at in DN else (0.0, s)
    seen, unbal = set(), []
    for t in live.values():
        if t["id"] in seen:
            continue
        partner = live.get(t.get("linked_transaction_id")) if t.get("linked_transaction_id") else None
        seen.add(t["id"])
        d, c = _dc(t)
        if partner:
            seen.add(partner["id"])
            d2, c2 = _dc(partner); d += d2; c += c2
        if abs(d - c) > 1:
            codes = {(by_id.get(t["account_id"]) or {}).get("code", "")}
            if partner:
                codes.add((by_id.get(partner["account_id"]) or {}).get("code", ""))
            if "Opening balance equity" in codes:
                continue
            unbal.append(round(d - c, 2))
    if unbal:
        flag("HIGH", f"{len(unbal)} unbalanced double-entry pairs (debit != credit)",
             "; ".join(f"${abs(x):,.0f}" for x in unbal[:8]))
    else:
        flag("OK", "All double-entry pairs balance (debit = credit)")
    singles = [t for t in live.values()
               if (by_id.get(t["account_id"]) or {}).get("account_type") in PL and not t.get("linked_transaction_id")]
    if singles:
        tot = sum(float(t.get("amount") or 0) for t in singles)
        flag("HIGH", f"{len(singles)} P&L legs with NO paired leg (unbalanced single legs) — ${tot:,.2f}",
             "income/expense must always pair with a bank/AR/AP leg")
    else:
        flag("OK", "No unpaired P&L legs (no single-sided income/expense)")
except Exception as e:
    flag("INFO", "Pair-balance / single-leg check skipped", str(e)[:100])

# ---- report -------------------------------------------------------------
print("\n" + "=" * 72)
print("  DEEP ACCOUNTING-INTEGRITY SWEEP")
print("=" * 72)
tag = {"HIGH": "🔴", "MED": "🟡", "INFO": "ℹ️ ", "OK": "✅"}
for sev in ("HIGH", "MED", "INFO", "OK"):
    for _, title, detail in [f for f in findings if f[0] == sev]:
        print(f"{tag[sev]} [{sev:<4}] {title}")
        if detail:
            print(f"            {detail}")
highs = sum(1 for f in findings if f[0] == "HIGH")
print("=" * 72)
print(f"  {highs} HIGH-severity issue(s) across {len(findings)} checks")
print("=" * 72)
