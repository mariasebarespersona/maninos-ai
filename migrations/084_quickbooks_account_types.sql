-- Migration 084: Replace account_type enum with QuickBooks types
-- Drop old CHECK constraint and add new one with QuickBooks account types

ALTER TABLE accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_account_type_check;

ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_account_type_check
  CHECK (account_type IN (
    -- Balance Sheet - Assets
    'Bank',
    'Accounts receivable (A/R)',
    'Other Current Assets',
    'Fixed Assets',
    'Other Assets',
    -- Balance Sheet - Liabilities
    'Accounts payable (A/P)',
    'Other Current Liabilities',
    'Long Term Liabilities',
    -- Balance Sheet - Equity
    'Equity',
    -- P&L - Income
    'Income',
    'Other Income',
    -- P&L - COGS
    'Cost of Goods Sold',
    -- P&L - Expenses
    'Expenses',
    'Other Expense',
    -- Legacy (keep for backward compat during migration)
    'income', 'expense', 'cogs', 'asset', 'liability', 'equity'
  ));
