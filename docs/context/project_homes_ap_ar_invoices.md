---
name: project_homes_ap_ar_invoices
description: "Homes obligations (commission, consignment, RTO-to-Capital) are REAL invoices via issue_invoice/record_invoice_payment — one poster, no double-count"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

As of 2026-07, Homes AP/AR was unified so each obligation is ONE real invoice (`accounting_invoices`) that posts its accrual once and is paid via the invoice engine (partial payments supported). This replaced the old split where some payables were document-only [PO:] bills and commissions weren't invoices at all.

**Single create/pay path** (in `api/routes/accounting.py`):
- `issue_invoice(...)` — inserts the invoice AND posts the accrual pair at issuance (receivable→`invoice_issued_ar` debit A/R credit income; payable→`invoice_received_ap` debit expense credit A/P). Manual invoices now default to status `sent` (not draft). The endpoint `create_invoice` and internal callers (sales, properties) all go through it.
- `record_invoice_payment(invoice_id, amount, bank_account_id, cap_to_balance=…)` — records a (partial) payment and posts the cash leg (`invoice_paid_in`/`invoice_paid_out`). `cap_to_balance=True` clamps to `balance_due` so a full-settle never overpays a partially-paid invoice. The endpoint `add_invoice_payment` wraps it.

**The three auto-invoice flows (link tag in invoice notes):**
1. **Commission** `[COMM:<commission_payment_id>]` — `_create_commission_payments` (sales.py) issues a payable invoice per commission (account = `Comisión <CODE>` sub-account if it exists, else `Commissions & fees`). Removed the old `comision` payment_order + the direct `commission_paid` post. `mark_commission_paid` now SETTLES that invoice; legacy commissions with no invoice fall back to the old `commission_paid` post.
2. **Consignment** `[CONSIGN:<property_id>]` — `create_property` (properties.py) issues a payable invoice at intake (account = `Compra <CODE>` else `Inventory`). Replaced the payment_order + document-only [PO:] bill. Fully paying it stamps `properties.consignment_paid_at` (hook in record_invoice_payment). See [[project_consignment_flow]].
3. **RTO → Capital receivable** `[CAPFIN:<sale_id>]` — `create_sale` RTO branch issues a receivable invoice to "Maninos Capital LLC" for `financed_remaining` (income recognized ONCE here). The inbound `pago_capital` payment_order approval (payment_orders.py) SETTLES it (`invoice_paid_in`, bank←A/R) instead of re-posting `sale_contado_received`. The dashboard skips CAPFIN sales in `sales_receivables` so "Por Cobrar" isn't double-counted (invoice balance_due represents it).

**Invariant:** net ledger effect per event is unchanged (this only adds the accrual A/P–A/R layer); an event is posted by exactly ONE path. Frontend: the invoice payment + detail modal now exists in the Homes InvoicesTab (was Capital-only). Related: [[project_auto_payable_invoices]], [[project_cogs_per_house_policy]].
