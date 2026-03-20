-- ============================================================
-- MANINOS AI — Demo Cleanup Script
-- ============================================================
-- Purpose: Delete all test/transactional data while preserving
--          database structure, system config, and user accounts.
--
-- PRESERVED tables (NOT touched):
--   - users (employee/staff accounts)
--   - system_config (Facebook cookies, API keys, etc.)
--   - yards, yard_assignments (team/yard setup)
--   - accounting_accounts, bank_accounts (chart of accounts)
--   - capital_accounts, capital_bank_accounts (Capital chart of accounts)
--   - payees (vendor/payee directory — optional, keep for demo)
--
-- Run this in Supabase SQL Editor BEFORE the demo.
-- ============================================================

BEGIN;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 1: Capital & Finance (deepest FK dependencies)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 1a. Capital flows (references investments, properties)
DELETE FROM capital_flows;

-- 1b. Capital down payment installments (references rto_contracts)
DELETE FROM capital_down_payment_installments;

-- 1c. Promissory note payments (references promissory_notes)
DELETE FROM promissory_note_payments;

-- 1d. Promissory notes (references investors)
DELETE FROM promissory_notes;

-- 1e. Capital transactions (Capital accounting entries)
DELETE FROM capital_transactions;

-- 1f. Capital bank statements & movements
DELETE FROM capital_statement_movements;
DELETE FROM capital_bank_statements;

-- 1g. Capital budgets & saved statements
DELETE FROM capital_budgets;

-- 1h. Monthly reports & acquisition analyses
DELETE FROM monthly_reports;
DELETE FROM acquisition_analyses;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 2: RTO & Payments (reference contracts, sales, clients)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 2a. RTO payments (references rto_contracts)
DELETE FROM rto_payments;

-- 2b. RTO commissions (references rto_contracts)
DELETE FROM rto_commissions;

-- 2c. Commission payments (references sales)
DELETE FROM commission_payments;

-- 2d. Credit applications (references clients)
DELETE FROM credit_applications;

-- 2e. RTO contracts — first unlink from sales
UPDATE sales SET rto_contract_id = NULL WHERE rto_contract_id IS NOT NULL;

-- 2f. Now delete RTO contracts (references clients, properties)
DELETE FROM rto_contracts;

-- 2g. RTO applications (references clients, properties)
DELETE FROM rto_applications;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 3: Property Operations (titles, docs, evals, renovations)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 3a. Title transfers (references properties)
DELETE FROM title_transfers;

-- 3b. Payment orders (references properties, sales)
DELETE FROM payment_orders;

-- 3c. Evaluation reports & photos (references properties)
DELETE FROM evaluation_reports;

-- 3d. Renovation items / materials used (references renovations)
DELETE FROM renovation_items;

-- 3e. Renovations (references properties)
DELETE FROM renovations;

-- 3f. Documents & uploads (references properties, sales)
DELETE FROM documents;

-- 3g. Receipts (references transactions)
DELETE FROM receipts;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 4: Sales & Clients
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 4a. Sales (references properties, clients)
DELETE FROM sales;

-- 4b. Moves (references properties)
DELETE FROM moves;

-- 4c. Client notes (references clients)
DELETE FROM client_notes;

-- 4d. Clients
DELETE FROM clients;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 5: Accounting (Homes)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- 5a. Accounting invoice payments (references invoices)
DELETE FROM accounting_invoice_payments;

-- 5b. Accounting invoices
DELETE FROM accounting_invoices;

-- 5c. Statement movements (references bank_statements)
DELETE FROM statement_movements;

-- 5d. Bank statements
DELETE FROM bank_statements;

-- 5e. Accounting transactions (journal entries)
DELETE FROM accounting_transactions;

-- 5f. Accounting audit log
DELETE FROM accounting_audit_log;

-- 5g. Recurring expenses
DELETE FROM recurring_expenses;

-- 5h. Accounting budgets
DELETE FROM accounting_budgets;

-- 5i. Saved financial statements (snapshots)
DELETE FROM saved_financial_statements;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 6: Market Listings (optional — comment out to keep)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Market analysis scores
DELETE FROM market_analysis;

-- Market listings from scrapers
-- NOTE: Comment out the next line if you want to keep listings for demo
DELETE FROM market_listings;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 7: Properties
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

-- Delete all properties (test data)
-- NOTE: If you want to keep specific demo properties, use:
--   DELETE FROM properties WHERE id NOT IN ('uuid1', 'uuid2', ...);
DELETE FROM properties;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 8: Scheduled emails & audit logs
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

DELETE FROM scheduled_emails;
DELETE FROM audit_logs;

-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
-- STEP 9: Investments & Investors (optional — comment out to keep)
-- ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

DELETE FROM investments;
-- DELETE FROM investors;  -- Uncomment to also remove investor records

COMMIT;

-- ============================================================
-- VERIFICATION: Run after cleanup to confirm all tables are empty
-- ============================================================
/*
SELECT 'capital_flows' AS tbl, COUNT(*) FROM capital_flows
UNION ALL SELECT 'capital_down_payment_installments', COUNT(*) FROM capital_down_payment_installments
UNION ALL SELECT 'rto_payments', COUNT(*) FROM rto_payments
UNION ALL SELECT 'rto_contracts', COUNT(*) FROM rto_contracts
UNION ALL SELECT 'rto_applications', COUNT(*) FROM rto_applications
UNION ALL SELECT 'credit_applications', COUNT(*) FROM credit_applications
UNION ALL SELECT 'title_transfers', COUNT(*) FROM title_transfers
UNION ALL SELECT 'payment_orders', COUNT(*) FROM payment_orders
UNION ALL SELECT 'evaluation_reports', COUNT(*) FROM evaluation_reports
UNION ALL SELECT 'renovations', COUNT(*) FROM renovations
UNION ALL SELECT 'sales', COUNT(*) FROM sales
UNION ALL SELECT 'moves', COUNT(*) FROM moves
UNION ALL SELECT 'clients', COUNT(*) FROM clients
UNION ALL SELECT 'properties', COUNT(*) FROM properties
UNION ALL SELECT 'market_listings', COUNT(*) FROM market_listings
UNION ALL SELECT 'system_config', COUNT(*) FROM system_config
UNION ALL SELECT 'users', COUNT(*) FROM users;
*/
