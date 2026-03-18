-- Migration 069: Add 'not_requested' payment status to moves
-- Moves should start with payment not yet requested, not 'pending'.
-- 'pending' means payment was requested and is awaiting Abigail.

ALTER TABLE moves DROP CONSTRAINT IF EXISTS moves_payment_status_check;

ALTER TABLE moves ADD CONSTRAINT moves_payment_status_check
  CHECK (payment_status IN ('not_requested', 'pending', 'deposit_paid', 'paid', 'cancelled'));

-- Update existing moves that have 'pending' but no payment order to 'not_requested'
UPDATE moves SET payment_status = 'not_requested'
  WHERE payment_status = 'pending';

-- Change default
ALTER TABLE moves ALTER COLUMN payment_status SET DEFAULT 'not_requested';
