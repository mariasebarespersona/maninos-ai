---
name: project_capital_accounting_parity
description: "Capital accounting now mirrors Homes: shared parameterized ledger engine, capital_* mirror tables, numeric chart codes, RTO auto-invoices"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

As of 2026-07 Capital's accounting is a full mirror of Homes', built on ONE shared double-entry engine:

- `api/services/ledger.py` is parameterized by `LedgerConfig` (tables + event registry + conventions). `post_to_ledger()` with no config = Homes, unchanged. `api/services/capital_ledger.py` exposes `post_to_capital_ledger()` / `get_capital_bank_balance()` with `CAPITAL_CONFIG`.
- **Key convention difference:** Homes chart `code` = QuickBooks account NAME; Capital chart `code` = NUMERIC QuickBooks code ('12000' A/R, '21000' A/P, '41000' RTO Rental Income, '34000' Opening balance equity, '60900' Operating Expenses General, '23900' Investor Notes Payable, '14300' RTO Properties). Seeded by migrations 042 + 097 (Capital's chart was EMPTY in prod before this).
- Capital `created_by` is TEXT (no users FK); no yard_id; derived bank balances EXCLUDE pending_confirmation/draft (approval via Notificaciones confirms BOTH legs of a pair — see confirm_transaction in capital/payments.py).
- Mirror tables (migration 097): capital_invoices (+investor_id/rto_contract_id/rto_payment_id), capital_invoice_payments, capital_payment_orders (concepts: retorno_inversionista/pago_nota/gasto_operativo/comision/seguro/impuesto/adquisicion/otro + inbound pago_rto/enganche/deposito_inversionista), capital_recurring_expenses, capital_audit_log, capital_receipts.
- New modules: `api/routes/capital/accounting_invoices.py` (facturación/recurring/receipts/audit/reconciliation utils), `api/routes/capital/payment_orders.py` (tesorería with [PO:] auto-bills, same document-only rule as [[project_auto_payable_invoices]]), `api/routes/capital/_rto_invoicing.py`.
- **RTO auto-invoices**: daily scheduler job `capital_rto_invoices` (6:30am CT) creates one receivable invoice per rto_payment due this month (idempotent via capital_invoices.rto_payment_id, notes tag [RTO:id]). CRITICAL: when an invoice exists, recording the RTO payment posts `invoice_paid_in` (clears A/R) — NOT rto_payment_received — or income double-counts (recognized at issuance).
- Capital bank accounts AUTO-create + link their chart account (child of 10100) on creation — unlike Homes where linking was manual.
- E2E suite: `scripts/e2e_capital_accounting.py` (needs migrations 042+097 applied first).
- Deliberately NOT automated: auto-applying late fees to clients (business-sensitive; stays manual via apply-late-fee).

Money-flow wiring (2026-07-08): investor deposits (investors.create_investment, capital_flows record/link-investment, promissory note creation), investor returns (promissory note payment, flows pay-return), and Capital→Homes house funding (applications.pay-homes) all now post BALANCED PAIRS via record_txn. Key: `record_txn` falls back to the PRIMARY Capital bank when no bank_account_id is given, so entries land as double-entry (pending_confirmation) instead of orphaned single rows. Note payment passes skip_accounting=True to _record_flow so it isn't double-recorded. pay-homes: Capital side posts via record_txn (debits 14300); the Homes side is NOT inserted directly anymore — the inbound pago_capital payment_order posts Homes' ledger pair when Treasury approves it with a bank (avoids double-count).

Transaction numbering is MAX-based (parse numeric part, ignore -D/-C suffix), not count-based, in BOTH `api/routes/accounting.py` (_max_txn_seq) and `api/routes/capital/accounting.py` (_max_capital_txn_seq). Count-based reissued numbers under load because ledger pairs write two rows per base → UNIQUE violation. Split seeds the sequence once and increments locally. Also: create_transaction clears bank_account_id on the P&L leg (only the bank leg carries it) so derived balances never double-count; Capital bank creation retries chart-code allocation on collision.
