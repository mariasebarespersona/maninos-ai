-- Migration 093: Normalize the sign convention on opening-balance equity rows
--
-- Migrations 090 and 092 wrote the equity-contra side of opening-balance
-- pairs with is_income=FALSE. The rest of the ledger (every row written by
-- api/services/ledger.py::post_to_ledger) uses the convention "is_income=TRUE
-- when the entry GROWS the natural balance of the account". For an equity
-- account, a credit (which grows equity) should therefore be is_income=TRUE.
--
-- Effect of the bug: the Balance Sheet computed `total_equity` as the negative
-- of what it should have been because _signed_balance interpreted those rows
-- as debits to equity. Net Income looked correct but A = L + E + NI did NOT
-- hold on the report page.
--
-- This migration:
--   1. Identifies opening_balance rows on the Opening balance equity account
--      that still have is_income=FALSE (the legacy convention).
--   2. Flips them to is_income=TRUE so they align with post_to_ledger's rule
--      and _signed_balance returns a positive contribution.
--
-- Idempotent: rerunning is a no-op once the rows are already TRUE.
-- Safe: only touches rows we know are misrecorded (entity_type='opening_balance'
-- AND account is the Opening balance equity), never the bank-side legs.

BEGIN;

WITH ob_equity_account AS (
  SELECT id FROM accounting_accounts WHERE code = 'Opening balance equity' LIMIT 1
)
UPDATE accounting_transactions t
SET is_income = TRUE
FROM ob_equity_account ob
WHERE t.account_id = ob.id
  AND t.entity_type = 'opening_balance'
  AND t.is_income IS FALSE;

COMMIT;

-- Verification queries (run manually):
--   SELECT count(*) FROM accounting_transactions t
--   JOIN accounting_accounts a ON a.id = t.account_id
--   WHERE a.code = 'Opening balance equity'
--     AND t.entity_type = 'opening_balance';
--   -- → 6 (or however many banks have opening balances)
--
--   SELECT count(*) FROM accounting_transactions t
--   JOIN accounting_accounts a ON a.id = t.account_id
--   WHERE a.code = 'Opening balance equity'
--     AND t.entity_type = 'opening_balance'
--     AND t.is_income IS FALSE;
--   -- → 0 (all flipped)
