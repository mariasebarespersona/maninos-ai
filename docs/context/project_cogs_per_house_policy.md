---
name: project-cogs-per-house-policy
description: "Accounting policy — house costs are CAPITALIZED to Inventory (Balance Sheet) while unsold, recognized as COGS only at sale"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

**POLICY REVERSED on 2026-07-13** (user + Abby, from Abby's QuickBooks P&L doc). The earlier "COGS-at-payment" model (2026-06-30) was WRONG and has been replaced by the correct INVENTORY→COGS matching model:

- A house's acquisition + improvement costs (compra/renovación/movida) are **CAPITALIZED to Inventory (an asset, Balance Sheet)** while the house is UNSOLD.
- They move to **COGS (P&L) only when the house SELLS**, so the cost matches the sale revenue. Unsold house = Balance Sheet; sold house = Profit & Loss.
- Commission is a **selling cost** — it goes to COGS at sale (never capitalized to inventory).

**How it works now:**
- `api/routes/properties.py::_create_inventory_account_for_property`: creates `Compra/Renovación/Movida <CODE>` + `House <CODE>` header as `Other Current Assets`/`Inventory` under the Inventory header (`INVENTORY_PARENT_ID = 8f1096b1-...`); `Comisión <CODE>` stays COGS under "House Sales - COGS" (`HOUSE_SALES_COGS_ID = b16c83e6-...`).
- `api/routes/sales.py::_recognize_house_cogs(property_id, sale_id, date)`: transfers each concept's inventory balance → `COGS House <CODE>` (P&L), per concept for drill-down. Idempotent (only moves remaining inventory balance). Uses `sale_contado_cogs` event with debit/credit overrides.
- **WHEN COGS fires (policy confirmed with Abby 2026-07-13): a house is SOLD the moment the sale is RECORDED, even if part is still owed** (remainder = A/R from Capital). So COGS is recognized at the same point revenue is: **RTO → at `create_sale` creation** (matching the financed A/R invoice + enganche posted there); **contado → when paid**. The old completion-time calls (confirm_transfer / complete_rto_contract) still run but are now just idempotent sweeps of late-arriving costs ($0 in the normal case). Bug this fixed: RTO houses showed revenue with no COGS and stayed in Inventory because COGS waited for `completed`.
- `post_to_ledger` sets is_income by the account's type at post time: asset debit → is_income=True. So capitalizing to an asset account stores the correct sign automatically.
- Migration `scripts/migrate_houses_to_inventory.py` retyped the existing houses COGS→asset and flipped is_income False→True on their cost legs. Result: Gross Profit went from negative to positive; Inventory went from $0 to the capitalized cost of the unsold houses (per house on the BS); Balance Sheet still balances.

**CAUTION (still true):** the chart has 500+ legacy per-property accounts. NEVER bulk-reclassify `accounting_accounts` by loose filters (a `like "House %"` filter once caught "House Sales - COGS" and had to be restored). Touch accounts by EXACT code match, and beware name-prefix collisions with section headers. Related: [[project_accounting_link_guards]], [[project_desglose_accrual_buckets]], [[reference_derived_bank_balances]].
