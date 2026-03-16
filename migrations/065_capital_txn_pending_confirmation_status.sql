-- Migration 065: Add 'pending_confirmation' to capital_transactions status check
-- Required for the notifications flow where transactions start as pending_confirmation
-- and are confirmed by admin before being available for bank reconciliation.

ALTER TABLE capital_transactions
  DROP CONSTRAINT IF EXISTS capital_transactions_status_check;

ALTER TABLE capital_transactions
  ADD CONSTRAINT capital_transactions_status_check
  CHECK (status IN ('draft', 'pending', 'confirmed', 'reconciled', 'voided', 'pending_confirmation'));
