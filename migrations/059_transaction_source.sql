-- Add source column to accounting_transactions
-- Only transactions with source='bank_statement' appear in financial reports
ALTER TABLE accounting_transactions
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
