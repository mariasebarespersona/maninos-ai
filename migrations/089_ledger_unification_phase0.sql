-- Migration 089: Accounting ledger unification — Phase 0 (foundation)
--
-- Sets up the bank ↔ QuickBooks chart linkage and extends transaction_type so
-- the new post_to_ledger writer can post AR, AP, COGS, and bank-fee entries.
-- Does NOT touch existing transactional data. Safe to run on production with
-- live rows.

-- 1) Link each of the 6 Homes bank_accounts to its QuickBooks chart account.
--    Mapping confirmed by Maria on 2026-05-20:
--      Cuenta Dallas        → 10101 BOA DFW 0623
--      Cuenta Houston       → 10102 HOUSTON 0636
--      Cuenta Conroe        → 10103 BANK OF AMERICA
--      Cuenta Dallas Cash   → 10107 CASH DFW
--      Cuenta Houston Cash  → 10108 CASH HOUSTON
--      Cuenta Conroe Cash   → 10106 Cash on hand

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10101' AND ba.name = 'Cuenta Dallas';

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10102' AND ba.name = 'Cuenta Houston';

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10103' AND ba.name = 'Cuenta Conroe';

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10107' AND ba.name = 'Cuenta Dallas Cash';

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10108' AND ba.name = 'Cuenta Houston Cash';

UPDATE bank_accounts ba
SET accounting_account_id = aa.id
FROM accounting_accounts aa
WHERE aa.code = '10106' AND ba.name = 'Cuenta Conroe Cash';

-- 2) Remove Wells Fargo chart entries (not used by Homes). Guard against
--    deleting accounts that have transactions referencing them — if any
--    exist, leave them in place and let the operator clean up by hand.

DELETE FROM accounting_accounts aa
WHERE aa.code IN ('10104', '10105')
  AND NOT EXISTS (
    SELECT 1 FROM accounting_transactions t WHERE t.account_id = aa.id
  )
  AND NOT EXISTS (
    SELECT 1 FROM bank_accounts ba WHERE ba.accounting_account_id = aa.id
  );

-- 3) Extend transaction_type CHECK to support the new posting types the
--    unified writer produces. Done by dropping + re-adding the constraint.

ALTER TABLE accounting_transactions
  DROP CONSTRAINT IF EXISTS accounting_transactions_transaction_type_check;

ALTER TABLE accounting_transactions
  ADD CONSTRAINT accounting_transactions_transaction_type_check
  CHECK (transaction_type IN (
    -- Income
    'sale_cash',
    'sale_rto_capital',
    'deposit_received',
    'other_income',
    'invoice_ar',          -- NEW: invoice issued (accounts receivable)
    -- Expenses
    'purchase_house',
    'renovation',
    'moving_transport',
    'commission',
    'operating_expense',
    'other_expense',
    'invoice_ap',          -- NEW: bill received (accounts payable)
    'cogs',                -- NEW: cost of goods sold recognition on sale
    'bank_fee',            -- NEW: bank fees & service charges
    -- Movement
    'bank_transfer',
    'adjustment'
  ));

-- 4) Lightweight sanity-check view that surfaces banks still missing a
--    chart link. The new writer refuses to post against a bank without one,
--    so this view is the canonical "needs setup" list.

CREATE OR REPLACE VIEW v_bank_accounts_needing_chart_link AS
SELECT id, name, bank_name, account_number_last4
FROM bank_accounts
WHERE is_active = TRUE
  AND accounting_account_id IS NULL;
