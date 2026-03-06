-- Migration 053: Link receipts to accounting transactions
-- Receipts are now attached to transactions, not standalone

ALTER TABLE receipts ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES accounting_transactions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_receipts_transaction_id ON receipts(transaction_id);
