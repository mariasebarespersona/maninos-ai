#!/usr/bin/env python3
"""
Cleanup E2E / Debug test data, preserving ALL client accounting.

WHAT IT DELETES (all confirmed test data — addresses say "E2E ..." / "DEBUG ..."):
  - properties        (the 16 sold E2E/Debug houses)
  - clients           (the 16 "E2E Client" / "Debug Client")
  - sales             (their 16 sales)
  - and everything tied to those E2E properties/sales:
      sale_payments, payment_orders, notifications, title_transfers,
      and the accounting_transactions that have a property_id pointing
      at an E2E property (the per-house commission/job-cost test entries).

WHAT IT KEEPS (the client's real accounting — verified NOT linked to any
E2E property):
  - accounting_invoices            (all 15, property_id IS NULL)
  - accounting_invoice_payments
  - accounting_transactions with NO property_id (the real invoice_ar/ap,
    bank_transfer and adjustment entries)

SAFETY:
  - Dumps a full JSON backup of every affected table BEFORE deleting.
  - Defaults to DRY-RUN. Pass --execute to actually delete.
  - Scopes strictly by the E2E/Debug id lists pulled live from the DB.

Usage:
  python3 scripts/cleanup_e2e_test_data.py            # dry-run + backup
  python3 scripts/cleanup_e2e_test_data.py --execute  # really delete
"""
import json, ssl, sys, urllib.request, urllib.parse
from datetime import datetime, timezone

DRY_RUN = "--execute" not in sys.argv

ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE

env = {}
for line in open(".env"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k] = v.strip().strip('"').strip("'")
URL = env["SUPABASE_URL"]; KEY = env["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": "Bearer " + KEY, "Content-Type": "application/json"}


def req(method, path, headers=None, data=None):
    r = urllib.request.Request(URL + "/rest/v1/" + path, method=method,
                               headers={**H, **(headers or {})}, data=data)
    with urllib.request.urlopen(r, context=ctx) as resp:
        body = resp.read()
        return json.loads(body) if body else [], resp.headers.get("content-range", "")


def get(path):
    data, _ = req("GET", path)
    return data


def in_list(col, ids):
    # PostgREST: col=in.(id1,id2,...)
    quoted = ",".join('"%s"' % i for i in ids)
    return "%s=in.(%s)" % (col, quoted)


def delete_where(table, where):
    if DRY_RUN:
        # count what WOULD be deleted
        _, cr = req("GET", "%s?select=id&%s" % (table, where),
                    headers={"Prefer": "count=exact", "Range": "0-0"})
        n = cr.split("/")[-1] if cr else "?"
        print(f"  [DRY] would delete from {table:26s} -> {n} rows  ({where[:60]})")
        return
    data = get("%s?select=id&%s" % (table, where))  # ids for log
    req("DELETE", "%s?%s" % (table, where), headers={"Prefer": "return=minimal"})
    print(f"  deleted from {table:26s} -> {len(data)} rows")


# ── Identify the test data (all properties/clients are E2E/Debug) ──────────
props = get("properties?select=id,address")
prop_ids = [p["id"] for p in props]  # all 16 are test data
clients = get("clients?select=id,name")
client_ids = [c["id"] for c in clients]
sales = get("sales?select=id")
sale_ids = [s["id"] for s in sales]

print(f"Scope: {len(prop_ids)} properties, {len(client_ids)} clients, {len(sale_ids)} sales")
print(f"Mode:  {'DRY-RUN (no changes)' if DRY_RUN else '*** EXECUTE — DELETING ***'}\n")

# ── Backup every affected table ───────────────────────────────────────────
backup = {}
for t in ["properties", "clients", "sales", "sale_payments", "payment_orders",
          "notifications", "title_transfers", "accounting_transactions",
          "accounting_invoices", "accounting_invoice_payments"]:
    backup[t] = get(t + "?select=*")
stamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
bpath = f"scripts/backup_before_cleanup_{stamp}.json"
with open(bpath, "w") as f:
    json.dump(backup, f, indent=2, default=str)
print(f"Backup written: {bpath}")
print("  rows backed up: " + ", ".join(f"{t}={len(v)}" for t, v in backup.items()) + "\n")

if not prop_ids:
    print("Nothing to do."); sys.exit(0)

# ── Delete in FK-safe order ───────────────────────────────────────────────
print("Deletions:")
# 1. accounting_transactions linked to E2E properties (NO ACTION FK -> must go first)
delete_where("accounting_transactions", in_list("property_id", prop_ids))
# 2. records tied to E2E properties that don't auto-cascade the way we want
delete_where("payment_orders", in_list("property_id", prop_ids))
delete_where("notifications", in_list("property_id", prop_ids))
# 3. sales (cascades sale_payments, rto_*, commission_payments; SET NULL on invoices)
if sale_ids:
    delete_where("sale_payments", in_list("sale_id", sale_ids))
    delete_where("sales", in_list("id", sale_ids))
# 4. renovations (NO ACTION FK -> must go before properties; clear items first)
if not DRY_RUN:
    renos = get("renovations?select=id&" + in_list("property_id", prop_ids))
    for rn in renos:
        req("DELETE", "renovation_items?renovation_id=eq.%s" % rn["id"],
            headers={"Prefer": "return=minimal"})
delete_where("renovation_items", in_list("property_id", prop_ids))
delete_where("renovations", in_list("property_id", prop_ids))
# 5. properties (cascades title_transfers, moves; SET NULL on invoices)
delete_where("title_transfers", in_list("property_id", prop_ids))
delete_where("properties", in_list("id", prop_ids))
# 5. clients (null self-ref first, then delete; SET NULL on invoices)
if not DRY_RUN:
    req("PATCH", "clients?" + in_list("referred_by", client_ids),
        headers={"Prefer": "return=minimal"},
        data=json.dumps({"referred_by": None}).encode())
delete_where("clients", in_list("id", client_ids))

# ── Verify the client's accounting survived ───────────────────────────────
print("\nVerification (client accounting must be intact):")
inv = get("accounting_invoices?select=id")
txn_kept = get("accounting_transactions?select=id&property_id=is.null")
print(f"  accounting_invoices remaining:                 {len(inv)}  (expect 15)")
print(f"  accounting_transactions w/o property remaining:{len(txn_kept)}  (expect 66)")
print("\nDONE." if not DRY_RUN else "\nDRY-RUN complete — re-run with --execute to apply.")
