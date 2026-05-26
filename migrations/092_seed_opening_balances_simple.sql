-- Migration 092: Re-seed opening balance ledger entries
--
-- Migration 090 set bank_accounts.current_balance correctly but the DO-block
-- INSERTs into accounting_transactions did not persist (Supabase SQL editor
-- swallows some exceptions inside PL/pgSQL blocks). Result: the dashboard
-- shows the right saldos but anything that reads the *derived* balance
-- (the Notificaciones bank dropdown, the new /bank-accounts API endpoint,
-- the Por Conciliar queue) sees $0.
--
-- This migration writes the 6 opening-balance double-entry pairs using
-- straight INSERTs with subselects — no PL/pgSQL — so failures surface
-- directly in the SQL editor.

BEGIN;

-- Safety: do nothing if opening balance rows already exist (idempotent).
-- If you genuinely want to re-seed from zero, run:
--   DELETE FROM accounting_transactions WHERE entity_type = 'opening_balance';
-- first, then run this migration.

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM accounting_transactions WHERE entity_type = 'opening_balance' LIMIT 1) THEN
    RAISE NOTICE 'Opening balance rows already exist — migration 092 is a no-op.';
    RETURN;
  END IF;
END $$;

-- One pair per bank, using subselects to resolve UUIDs at insert time.
-- Each pair: debit bank's chart account, credit Opening Balance Equity.
-- linked_transaction_id is wired post-insert by the final UPDATE block.

WITH bank_pairs AS (
  SELECT
    'Cuenta Dallas'::TEXT       AS bank_name, 45237.18::NUMERIC AS amount, 1 AS serial UNION ALL
  SELECT 'Cuenta Houston',           28492.55, 2 UNION ALL
  SELECT 'Cuenta Conroe',            15890.41, 3 UNION ALL
  SELECT 'Cuenta Dallas Cash',        3650.00, 4 UNION ALL
  SELECT 'Cuenta Houston Cash',       4275.89, 5 UNION ALL
  SELECT 'Cuenta Conroe Cash',        2810.50, 6
),
ob AS (
  SELECT id FROM accounting_accounts WHERE code = 'Opening balance equity' LIMIT 1
),
resolved AS (
  SELECT
    bp.serial,
    bp.amount,
    bp.bank_name,
    ba.id  AS bank_id,
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
    'Asiento de apertura — migration 092'
  FROM resolved
  RETURNING id, transaction_number, bank_account_id, amount
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
    -- is_income=TRUE on the equity contra so it aligns with the
    -- convention used by post_to_ledger (credit-to-equity stores
    -- is_income=TRUE so _signed_balance returns positive). Previously
    -- this was FALSE which made the Balance Sheet show a negative
    -- equity total.
    REPLACE(d.transaction_number, '-D', '-C'), CURRENT_DATE, 'adjustment',
    d.amount, TRUE,
    (SELECT id FROM ob), NULL,
    'Opening balance', 'system',
    'opening_balance',
    'Saldo inicial: contrapartida (Opening balance equity)', 'reconciled',
    'Asiento de apertura — migration 092',
    d.id
  FROM debits d
  RETURNING id, linked_transaction_id
)
UPDATE accounting_transactions t
SET linked_transaction_id = c.id
FROM credits c
WHERE t.id = c.linked_transaction_id;

COMMIT;

-- Verify:
--   SELECT count(*) FROM accounting_transactions WHERE entity_type='opening_balance';
--   → 12  (6 debits + 6 credits)
--
-- And via the API the derived saldos should now match the dashboard:
--   curl …/api/accounting/bank-accounts | jq '.bank_accounts[] | {name, derived_balance}'
