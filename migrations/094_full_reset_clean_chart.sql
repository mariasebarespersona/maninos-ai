-- Migration 094: FULL RESET for a clean hand-off (Maninos test).
-- Same as 093 (wipe all operational data + re-seed the 6 bank opening balances)
-- PLUS it removes the orphaned per-house accounts created during testing
-- (House/Compra/Renovación/Movida/Comisión/COGS <CODE>), which 091/093 left in
-- the chart. Those are tagged with description 'property_id:<uuid>', so the
-- template plan of accounts stays intact and only the test sub-accounts go.
--
-- ⚠️  IRREVERSIBLE. Run in the Supabase SQL editor when the client asks for a
--     clean slate. Leaves: users, bank_accounts, the template chart of
--     accounts, yards/materials/system_config, and the 12 opening-balance rows.

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

-- ---- Clear ALL accounting_transactions (including old OB rows) ------------
DELETE FROM accounting_transactions;

-- ---- Remove the orphaned PER-HOUSE sub-accounts (keep the template chart) --
-- Every per-house account is stamped with description 'property_id:<uuid>' when
-- created; the ~305 template accounts are not, so this only drops the test ones.
DELETE FROM accounting_accounts
WHERE description LIKE 'property_id:%';

-- ---- Re-seed the 6 opening balance pairs ----------------------------------
WITH bank_pairs AS (
                SELECT 'Cuenta Dallas'::TEXT       AS bank_name, 45237.18::NUMERIC AS amount, 1 AS serial
  UNION ALL     SELECT 'Cuenta Houston',           28492.55,                              2
  UNION ALL     SELECT 'Cuenta Conroe',            15890.41,                              3
  UNION ALL     SELECT 'Cuenta Dallas Cash',        3650.00,                              4
  UNION ALL     SELECT 'Cuenta Houston Cash',       4275.89,                              5
  UNION ALL     SELECT 'Cuenta Conroe Cash',        2810.50,                              6
),
ob AS (
  SELECT id FROM accounting_accounts WHERE code = 'Opening balance equity' LIMIT 1
),
resolved AS (
  SELECT
    bp.serial, bp.amount, bp.bank_name,
    ba.id AS bank_id,
    ba.accounting_account_id AS bank_chart_id,
    (SELECT id FROM ob) AS ob_account_id,
    'TXN-OB-' || TO_CHAR(CURRENT_DATE, 'YYMMDD') || '-' || LPAD(bp.serial::TEXT, 3, '0') AS base_serial
  FROM bank_pairs bp
  JOIN bank_accounts ba ON ba.name = bp.bank_name
  WHERE ba.accounting_account_id IS NOT NULL
),
debits AS (
  INSERT INTO accounting_transactions (
    transaction_number, transaction_date, transaction_type,
    amount, is_income,
    account_id, bank_account_id,
    counterparty_name, counterparty_type,
    entity_type,
    description, status, notes
  )
  SELECT
    base_serial || '-D', CURRENT_DATE, 'adjustment',
    amount, TRUE,
    bank_chart_id, bank_id,
    'Opening balance', 'system',
    'opening_balance',
    'Saldo inicial: ' || bank_name, 'reconciled',
    'Asiento de apertura — migration 094'
  FROM resolved
  RETURNING id, transaction_number, amount
),
credits AS (
  INSERT INTO accounting_transactions (
    transaction_number, transaction_date, transaction_type,
    amount, is_income,
    account_id, bank_account_id,
    counterparty_name, counterparty_type,
    entity_type,
    description, status, notes,
    linked_transaction_id
  )
  SELECT
    REPLACE(d.transaction_number, '-D', '-C'), CURRENT_DATE, 'adjustment',
    d.amount, FALSE,
    (SELECT id FROM ob), NULL,
    'Opening balance', 'system',
    'opening_balance',
    'Saldo inicial: contrapartida (Opening balance equity)', 'reconciled',
    'Asiento de apertura — migration 094',
    d.id
  FROM debits d
  RETURNING id, linked_transaction_id
)
UPDATE accounting_transactions t
SET linked_transaction_id = c.id
FROM credits c
WHERE t.id = c.linked_transaction_id;

-- ---- Mirror the seed saldos onto the legacy stored column ----------------
UPDATE bank_accounts SET current_balance = CASE name
  WHEN 'Cuenta Dallas'        THEN 45237.18
  WHEN 'Cuenta Houston'       THEN 28492.55
  WHEN 'Cuenta Conroe'        THEN 15890.41
  WHEN 'Cuenta Dallas Cash'   THEN  3650.00
  WHEN 'Cuenta Houston Cash'  THEN  4275.89
  WHEN 'Cuenta Conroe Cash'   THEN  2810.50
  ELSE current_balance
END;

COMMIT;

-- Verify:
--   SELECT COUNT(*) FROM properties;                              → 0
--   SELECT COUNT(*) FROM accounting_invoices;                     → 0
--   SELECT COUNT(*) FROM accounting_transactions;                 → 12
--   SELECT COUNT(*) FROM accounting_accounts
--     WHERE description LIKE 'property_id:%';                      → 0  (no per-house)
--   SELECT name, current_balance FROM bank_accounts ORDER BY name;
