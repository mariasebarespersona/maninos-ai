-- Migration 091: Wipe EVERYTHING (operational + capital + accounting) except
-- the identity tables and the opening balances seeded in migration 090.
--
-- ⚠️  IRREVERSIBLE.  Run only after the client has explicitly asked for a
--     clean slate and migration 090 has already been applied.
--
-- KEPT  (untouched master / identity / catalog data):
--   users                — Supabase auth identities (deleting locks everyone out)
--   bank_accounts        — the 6 banks, with their chart links + saldos
--   accounting_accounts  — the QuickBooks chart of accounts
--   yards                — physical locations (master)
--   materials            — renovation material catalog (master)
--   system_config        — app configuration
--   accounting_transactions WHERE entity_type='opening_balance'  ← the 12 rows
--     (6 debit + 6 credit) inserted by migration 090. These are the seed
--     equity entries that give the banks their starting saldos.
--
-- WIPED:
--   Everything else, including:
--   - properties, clients, sales, renovations, renovation_items, moves
--   - sale_payments, commission_payments, payment_orders, payees, receipts
--   - accounting_invoices, accounting_invoice_payments, accounting_audit_log,
--     accounting_budgets, recurring_expenses
--   - bank_statements, statement_movements
--   - title_transfers, documents, document_signatures, signature_envelopes
--   - notifications, scheduled_emails, scheduler_runs, audit_logs
--   - market_analysis, market_listings, acquisition_analyses, monthly_reports,
--     saved_financial_statements, evaluation_reports
--   - Capital side: capital_accounts, capital_bank_accounts,
--     capital_bank_statements, capital_budgets, capital_down_payment_installments,
--     capital_flows, capital_statement_movements, capital_transactions
--   - RTO / promissory: rto_applications, rto_contracts, rto_payments,
--     rto_commissions, credit_applications, promissory_notes,
--     promissory_note_payments
--   - investors, investments, client_notes, yard_assignments

BEGIN;

-- ---- Operational tables ---------------------------------------------------
TRUNCATE TABLE
  -- accounting (transactional)
  statement_movements,
  bank_statements,
  accounting_invoice_payments,
  accounting_invoices,
  accounting_audit_log,
  accounting_budgets,
  recurring_expenses,
  -- sale + commission
  commission_payments,
  sale_payments,
  -- payment orders + vendor catalog
  payment_orders,
  payees,
  receipts,
  -- properties / renovations / moves
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
  -- notifications + system logs
  notifications,
  scheduled_emails,
  scheduler_runs,
  audit_logs,
  -- analysis / reports
  market_analysis,
  market_listings,
  acquisition_analyses,
  monthly_reports,
  saved_financial_statements,
  evaluation_reports,
  -- capital side
  capital_down_payment_installments,
  capital_flows,
  capital_statement_movements,
  capital_bank_statements,
  capital_transactions,
  capital_budgets,
  capital_bank_accounts,
  capital_accounts,
  -- RTO / lending
  rto_payments,
  rto_commissions,
  rto_contracts,
  rto_applications,
  promissory_note_payments,
  promissory_notes,
  credit_applications,
  -- investors
  investments,
  investors
RESTART IDENTITY CASCADE;

-- ---- accounting_transactions: keep ONLY the opening balance rows ----------
DELETE FROM accounting_transactions
WHERE entity_type IS DISTINCT FROM 'opening_balance';

-- ---- Sanity check ---------------------------------------------------------
-- After this migration:
--   SELECT COUNT(*) FROM accounting_transactions;
--   → should be 12 (6 banks × 2 legs from migration 090)
--   SELECT COUNT(*) FROM properties;          → 0
--   SELECT COUNT(*) FROM clients;             → 0
--   SELECT COUNT(*) FROM sales;               → 0
--   SELECT name, current_balance FROM bank_accounts ORDER BY name;
--   → still showing the 6 banks with the migration-090 saldos
--   SELECT COUNT(*) FROM accounting_accounts; → ~1134 (chart preserved)
--   SELECT COUNT(*) FROM users;               → unchanged (login intact)
--   SELECT COUNT(*) FROM yards;               → unchanged
--   SELECT COUNT(*) FROM materials;           → unchanged

COMMIT;
