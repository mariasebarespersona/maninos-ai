-- ============================================================================
-- Migration 042b: HOTFIX — Fix report_section values for existing accounts
-- ============================================================================
-- Run this if migration 042 was already executed but Balance/P&L show empty.
-- The original 042 used "WHERE report_section IS NULL" which doesn't work
-- because ADD COLUMN DEFAULT already fills the column.
-- ============================================================================

-- Add column if it doesn't exist (idempotent)
ALTER TABLE capital_accounts
ADD COLUMN IF NOT EXISTS report_section TEXT DEFAULT 'balance_sheet';

-- Force correct values based on account_type (no IS NULL check)
UPDATE capital_accounts SET report_section = 'balance_sheet'
WHERE account_type IN ('asset', 'liability', 'equity');

UPDATE capital_accounts SET report_section = 'profit_loss'
WHERE account_type IN ('income', 'expense', 'cogs');

