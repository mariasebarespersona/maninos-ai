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

**Enganche parcial RTO (2026-10-12, pedido de Sebastian):** al aprobar la orden inbound `enganche` en Notificaciones se puede pasar `received_amount` < importe. La orden queda solo por lo recibido (asiento normal `sale_down_payment_received`). El resto se convierte en factura por cobrar al cliente `[ENGPEND:<sale_id>]` (A/R ← House Sales - RTO, la misma cuenta) más una orden nueva pendiente con `[ENGPEND-INV:<invoice_id>]` en las notas. Aprobar esa orden LIQUIDA la factura vía `record_invoice_payment` (nunca vuelve a reconocer el ingreso). Puede ser parcial otra vez: misma factura y orden nueva por el saldo. Si la factura ya se cobró desde Contabilidad, la aprobación se rechaza. Código: `_crear_resto_enganche` / `_engpend_invoice_of` en `api/routes/payment_orders.py`. E2E: `web/e2e/enganche-parcial.spec.ts`.

**Root fixes from Abby's list (2026-10-13):**
- **RTO `pago_venta` never posts income.** On approval it SETTLES the sale's open receivables via `record_invoice_payment`: [ENGPEND:] first, then [CAPFIN:]. It is rejected if it exceeds what is open; before this, an RTO sale's income was double-counted (H42/H54/H59). The order is tagged `[SALE:<id>]`. With the down-payment order still pending, `register_sale_payment` returns 409 and points the user to the partial down-payment approval.
- **`sale_payments.payment_order_id`** (migration 117). The order is created first; if creating it fails, the payment is not saved. Editing the amount while the order is pending updates the order; once the order is approved, editing is blocked. The initial down-payment row is linked to the down-payment order.
- **Every invoice payment made from an order approval is tagged `[PO-PAY:<order>]`.** `delete_payment_order` includes those legs and calls `_purge_transaction_refs`, so the invoice reopens, and it writes an audit-log row.
- **Commissions** are paid from "Comisiones por pagar" (Notificaciones → Aprobadas) or with Pagar in Comisiones (`mark_commission_paid`: bank required, `payment_date`). `delete_invoice` refuses auto invoices ([COMM]/[CAPFIN]/[CONSIGN]/[ENGPEND]) unless `force=True` (internal callers only, e.g. sale cancel). `create_transaction` returns 409 for an expense on an account with an open [COMM:] bill (`_open_commission_bill_for_account`). A bank-statement withdrawal to that account settles the bill instead of creating a new expense.
- E2E: `web/e2e/abby-root-fixes.spec.ts`. Old specs that call Railway directly (`accounting-reconciliation`, `manual-sale-notifications`, parts of `sales-payments`) fail with 401 since the API lock. That is pre-existing, not a regression.
