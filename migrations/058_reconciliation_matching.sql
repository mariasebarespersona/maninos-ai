-- Add 'reconciled' status to statement_movements CHECK constraint
ALTER TABLE statement_movements DROP CONSTRAINT IF EXISTS statement_movements_status_check;
ALTER TABLE statement_movements ADD CONSTRAINT statement_movements_status_check
    CHECK (status IN ('pending', 'suggested', 'confirmed', 'posted', 'skipped', 'duplicate', 'reconciled'));

-- Add matched_transaction_id to statement_movements for reconciliation matching
ALTER TABLE statement_movements
  ADD COLUMN IF NOT EXISTS matched_transaction_id UUID REFERENCES accounting_transactions(id);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_stmt_movements_matched_txn ON statement_movements(matched_transaction_id) WHERE matched_transaction_id IS NOT NULL;
