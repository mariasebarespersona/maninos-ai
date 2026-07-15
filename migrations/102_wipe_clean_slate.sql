-- Migration 102: WIPE the app to a clean slate (banks at $0).
--
-- Deletes ALL operational + accounting data and removes the orphaned per-house
-- accounts, so the plan of accounts is left as the TEMPLATE only. Banks end at
-- $0 (no opening-balance seed) — a true blank slate; load real starting
-- balances later from the UI (Registrar movimiento → Saldo inicial) if wanted.
--
-- KEPT: users, bank_accounts, the template chart of accounts, yards, materials,
--       system_config.
--
-- ⚠️  IRREVERSIBLE. Run in the Supabase SQL editor.

BEGIN;

-- ---- Wipe operational + accounting data -----------------------------------
TRUNCATE TABLE
  statement_movements,
  bank_statements,
  accounting_invoice_payments,
  accounting_invoices,
  accounting_audit_log,
  accounting_budgets,
  recurring_expenses,
  commission_payments,
  sale_payments,
  payment_orders,
  payees,
  receipts,
  renovation_items,
  renovations,
  moves,
  title_transfers,
  documents,
  document_signatures,
  signature_envelopes,
  sales,
  client_notes,
  clients,
  yard_assignments,
  properties,
  notifications,
  scheduled_emails,
  scheduler_runs,
  audit_logs,
  market_analysis,
  market_listings,
  acquisition_analyses,
  monthly_reports,
  saved_financial_statements,
  evaluation_reports,
  capital_down_payment_installments,
  capital_flows,
  capital_statement_movements,
  capital_bank_statements,
  capital_transactions,
  capital_budgets,
  capital_bank_accounts,
  capital_accounts,
  rto_payments,
  rto_commissions,
  rto_contracts,
  rto_applications,
  promissory_note_payments,
  promissory_notes,
  credit_applications,
  investments,
  investors
RESTART IDENTITY CASCADE;

-- ---- Clear the whole ledger (banks derive to $0) --------------------------
DELETE FROM accounting_transactions;

-- ---- Remove orphaned per-house sub-accounts (keep the template chart) ------
-- Break the self-parent links first so deleting a "House <CODE>" parent before
-- its children doesn't hit the FK, then drop them all.
UPDATE accounting_accounts SET parent_account_id = NULL
WHERE description LIKE 'property_id:%';
DELETE FROM accounting_accounts
WHERE description LIKE 'property_id:%';

-- ---- Zero the stored bank balance mirror ----------------------------------
UPDATE bank_accounts SET current_balance = 0;

COMMIT;

-- Verify:
--   SELECT COUNT(*) FROM properties;                    → 0
--   SELECT COUNT(*) FROM sales;                         → 0
--   SELECT COUNT(*) FROM accounting_invoices;           → 0
--   SELECT COUNT(*) FROM accounting_transactions;       → 0
--   SELECT COUNT(*) FROM accounting_accounts
--     WHERE description LIKE 'property_id:%';            → 0
