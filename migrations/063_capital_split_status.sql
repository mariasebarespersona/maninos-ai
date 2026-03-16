-- Add 'split' to capital_statement_movements status check constraint
ALTER TABLE capital_statement_movements DROP CONSTRAINT IF EXISTS capital_statement_movements_status_check;
ALTER TABLE capital_statement_movements ADD CONSTRAINT capital_statement_movements_status_check
    CHECK (status IN ('pending', 'suggested', 'confirmed', 'posted', 'skipped', 'duplicate', 'reconciled', 'split'));
