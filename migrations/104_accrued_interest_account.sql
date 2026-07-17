-- Migration 104: add the Accrued Interest Payable account (CAPITAL only).
--
-- Enables ACCRUAL-basis interest for investor promissory notes: a monthly job
-- recognizes scheduled interest as expense (71400) against this liability, and
-- investor interest payments settle it. Kept SEPARATE from 23900 (Investor
-- Notes Payable = principal) so the principal↔23900 reconciliation is unaffected.
--
-- ⚠️  Touches ONLY capital_accounts (Maninos CAPITAL). Never Homes.
--     Idempotent (ON CONFLICT DO NOTHING). Run in the Supabase SQL editor.

BEGIN;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23950', 'Accrued Interest Payable', 'liability', 'investor_debt', false, 'balance_sheet', 246,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Verify:  SELECT code,name FROM capital_accounts WHERE code = '23950';
