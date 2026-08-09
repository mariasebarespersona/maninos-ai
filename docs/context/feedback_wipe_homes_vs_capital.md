---
name: feedback_wipe_homes_vs_capital
description: "When asked to delete/wipe app data, always distinguish Maninos Homes data from Maninos Capital data — sometimes only one side should be wiped"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

When the user asks to "borrar los datos" / wipe the app, ALWAYS ask (or offer options) whether it's **Homes only**, **Capital only**, or **both**. They will sometimes want to wipe Homes but keep Capital (or vice versa). Never assume "both" by default.

**Why:** Homes and Capital are separate portals with separate ledgers/books, and the user manages them independently.

**How to apply — the data split:**
- **Homes tables:** `accounting_transactions`, `accounting_invoices`, `accounting_invoice_payments`, `accounting_audit_log`, `accounting_budgets`, `recurring_expenses`, `bank_statements`, `statement_movements`, `properties`, `sales`, `sale_payments`, `commission_payments`, `payment_orders`, `payees`, `receipts`, `renovations`, `renovation_items`, `moves`, `title_transfers`, `documents`, `document_signatures`, `signature_envelopes`, `clients`, `client_notes`, `market_analysis`, `market_listings`, `acquisition_analyses`, `yard_assignments`, plus the per-house chart accounts (`accounting_accounts WHERE description LIKE 'property_id:%'`).
- **Capital tables:** `capital_transactions` (Capital's OWN ledger — its single source of truth, NOT the shared `accounting_transactions`), `capital_flows`, `capital_bank_statements`, `capital_statement_movements`, `capital_bank_accounts`, `capital_accounts`, `capital_budgets`, `capital_down_payment_installments`, `rto_applications`, `rto_contracts`, `rto_payments`, `rto_commissions`, `promissory_notes`, `promissory_note_payments`, `credit_applications`, `investments`, `investors`.
- **Kept always:** users, bank_accounts, the template chart of accounts, yards, materials, system_config.

**Caveat (coupling):** Capital's RTO records link to Homes (`rto_applications.sale_id`, `rto_contracts.property_id` → Homes `sales`/`properties`). A Homes-only wipe that keeps Capital can orphan/break those FKs — surface this and confirm what to do with linked RTO records before wiping.

Reference wipe migration that clears BOTH: `migrations/102_wipe_clean_slate.sql`. Build Homes-only / Capital-only variants when needed. Related: [[project_capital_accounting_parity]].

**⚠️ Known defect in 102:** it TRUNCATE'd `capital_accounts`, so it wiped the CAPITAL chart of accounts (violating the "keep the template chart" rule). Capital accounting is then non-functional (every capital ledger posting fails with "Chart account with code 'XXXXX' not found"). Fix: run `migrations/103_reseed_capital_chart.sql` (Capital-only re-seed, replays 042+045+097, idempotent). The Homes chart (`accounting_accounts`) was NOT wiped by 102 (it only removed per-house sub-accounts). Any future wipe migration must NOT truncate `capital_accounts` (or must re-seed it). Related: [[project_investor_interest_split]].
