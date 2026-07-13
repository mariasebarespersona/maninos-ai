#!/usr/bin/env python3
"""
One-time migration: switch per-house costs from the COGS-at-payment model to
the correct INVENTORY→COGS model.

Before: each house's Compra/Renovación/Movida/Comisión <CODE> account was
"Cost of Goods Sold", so buying/renovating a house hit the P&L immediately —
even for houses that were never sold. Unsold houses were NOT on the Balance
Sheet, and Gross Profit was falsely negative.

After:
  - Compra/Renovación/Movida <CODE>  → "Other Current Assets" under Inventory
    (capitalized; a house's cost sits in the Balance Sheet while it is unsold).
  - House <CODE> header               → asset header under Inventory.
  - Comisión <CODE>                   → stays COGS, re-parented under
    "House Sales - COGS" (a selling cost, recognized at sale).
  - The debit legs on the retyped cost accounts have is_income flipped
    False→True so the sign is correct for an asset (a debit grows an asset).

A house's cost only moves to COGS when it SELLS (see
api/routes/sales.py::_recognize_house_cogs).

Idempotent: retyping is a no-op if already asset; the is_income flip only
touches rows still stored as False. Safe to re-run.

Run:  .venv/bin/python scripts/migrate_houses_to_inventory.py
"""
import os
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

INVENTORY_HEADER_ID = "8f1096b1-7c74-4a31-a27d-5bf7cce66e6a"   # Inventory (asset header)
HOUSE_SALES_COGS_ID = "b16c83e6-0f1b-4bcc-917b-055c8d5d75de"   # House Sales - COGS (COGS header)
ASSET = "Other Current Assets"

# Every house header. Guard against matching the "House Sales - COGS" section
# header (name starts with "House " too) — only real per-house codes.
headers = sb.table("accounting_accounts").select("code").like("code", "House %").eq("is_header", True).execute().data or []
codes = [h["code"].split("House ", 1)[1] for h in headers if h["code"] != "House Sales - COGS"]

retyped = flipped = reparented = 0
for code in codes:
    h = sb.table("accounting_accounts").select("id").eq("code", f"House {code}").execute().data
    if h:
        sb.table("accounting_accounts").update(
            {"account_type": ASSET, "category": "Inventory", "parent_account_id": INVENTORY_HEADER_ID}
        ).eq("id", h[0]["id"]).execute()
        retyped += 1
    for pre in ("Compra", "Renovación", "Movida"):
        acc = sb.table("accounting_accounts").select("id").eq("code", f"{pre} {code}").execute().data
        if not acc:
            continue
        aid = acc[0]["id"]
        sb.table("accounting_accounts").update({"account_type": ASSET, "category": "Inventory"}).eq("id", aid).execute()
        retyped += 1
        for t in sb.table("accounting_transactions").select("id,is_income").eq("account_id", aid).neq("status", "voided").execute().data or []:
            if t["is_income"] is False:
                sb.table("accounting_transactions").update({"is_income": True}).eq("id", t["id"]).execute()
                flipped += 1
    cm = sb.table("accounting_accounts").select("id").eq("code", f"Comisión {code}").execute().data
    if cm:
        sb.table("accounting_accounts").update({"parent_account_id": HOUSE_SALES_COGS_ID}).eq("id", cm[0]["id"]).execute()
        reparented += 1

print(f"houses={len(codes)} accounts_retyped={retyped} txns_flipped={flipped} comisiones_reparented={reparented}")
