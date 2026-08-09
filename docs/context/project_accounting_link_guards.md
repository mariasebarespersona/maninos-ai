---
name: project_accounting_link_guards
description: Root guards keeping invoices/transactions linked to the correct account; reclassify tool; audit script
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

The #1 class of accounting bug in Maninos was **broken links**: money posted to the wrong account (a HEADER/grouper, the wrong side, or a generic) and invoices created without their ledger accrual. Root guards now enforce correctness (the chart of accounts itself is the source of truth and is NEVER pruned):

- `_validate_postable_account(code, direction)` (api/routes/accounting.py): an invoice's income/expense line MUST target a real non-header P&L leaf on the correct side (receivable→Income types, payable→Expense/COGS types). Rejects headers and wrong-side accounts. Called first in `issue_invoice`.
- `issue_invoice` is now ATOMIC: if the accrual pair can't post, it rolls back the invoice and raises — never leaves an invoice with no ledger legs (the old `except: logger.warning` silently created phantom invoices → money that never hit the P&L). AP default is the leaf "Uncategorized Expense", never the "Other Operating Expenses" HEADER.
- Consignment purchase always links to `Compra <CODE>` (creates the house sub-accounts if missing), not a generic/Inventory account.

**Reclassify tool** (durable, for the accountant to fix links without re-issuing):
- `PATCH /accounting/invoices/{id}/reclassify` {account_code, property_id?} — re-points the invoice's P&L accrual leg(s); A/R, A/P and payment legs untouched.
- `PATCH /accounting/transactions/{id}/reclassify` {account_code} — re-points one transaction (e.g. a loan mis-booked as income → a liability; is_income is preserved, which is correct).
- Frontend "Cambiar cuenta contable" reuses the existing non-header account picker.

**Audit:** `scripts/audit_accounting.py` (read-only) checks the invariants — posts to headers, invoice↔accrual match, P&L vs desglose, Balance Sheet balances (A = L + E + NI), loans-as-income. E2E: web/e2e/financial-statements-reconcile.spec.ts. NOTE: `accounting_audit_log` CHECK constraint only allows create/update/delete/void/payment as `action` (not "reclassify" — use "update"). Related: [[project_desglose_accrual_buckets]], [[project_homes_ap_ar_invoices]], [[project_cogs_per_house_policy]].
