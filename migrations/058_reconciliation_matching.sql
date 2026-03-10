-- Add matched_transaction_id to statement_movements for reconciliation matching
ALTER TABLE statement_movements
  ADD COLUMN IF NOT EXISTS matched_transaction_id UUID REFERENCES accounting_transactions(id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stmt_movements_matched_txn ON statement_movements(matched_transaction_id) WHERE matched_transaction_id IS NOT NULL;
