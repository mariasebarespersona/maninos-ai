#!/usr/bin/env python3
"""Delete the Playwright manual-transaction test rows (both double-entry legs)
so the app stays clean for Maninos. Matches on the E2E-PW-TEST description."""
import os, sys
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

# P&L legs carry the description; bank legs are linked. Gather both.
rows = sb.table("accounting_transactions").select("id, linked_transaction_id, description") \
    .ilike("description", "E2E-PW-TEST%").execute().data or []
ids = set()
for r in rows:
    ids.add(r["id"])
    if r.get("linked_transaction_id"):
        ids.add(r["linked_transaction_id"])
# also the bank legs whose contrapartida description we matched
for r in list(rows):
    linked = sb.table("accounting_transactions").select("id").eq("linked_transaction_id", r["id"]).execute().data or []
    for x in linked:
        ids.add(x["id"])

if ids:
    sb.table("accounting_transactions").delete().in_("id", list(ids)).execute()
print(f"Borradas {len(ids)} filas de prueba (E2E-PW-TEST).")

# verify app clean
tot = sb.table("accounting_transactions").select("id", count="exact").execute().count
print(f"accounting_transactions restantes: {tot}")
