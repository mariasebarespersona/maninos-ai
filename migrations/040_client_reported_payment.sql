-- Migration 040: Add 'client_reported' status to rto_payments
-- 
-- When a client pays via cash at the office or bank transfer, they click
-- "Ya he pagado" in the client portal. This creates a payment record with
-- status 'client_reported' that Capital must confirm before it becomes 'paid'.
--
-- Also adds client_payment_method and client_payment_notes columns.

-- 1. Drop the old CHECK constraint and add the new one with 'client_reported'
ALTER TABLE rto_payments DROP CONSTRAINT IF EXISTS rto_payments_status_check;
ALTER TABLE rto_payments ADD CONSTRAINT rto_payments_status_check
    CHECK (status IN (
        'scheduled',         -- Future payment, not yet due
        'pending',           -- Due, awaiting payment
        'paid',              -- Payment confirmed
        'late',              -- Past due, not paid
        'partial',           -- Partially paid
        'waived',            -- Fee waived by admin
        'failed',            -- Payment attempt failed
        'client_reported'    -- Client says they paid (pending Capital confirmation)
    ));

-- 2. Add columns for client-reported payment info
ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS client_payment_method TEXT;
  -- 'cash_office' or 'bank_transfer'
ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS client_payment_notes TEXT;
ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS client_reported_at TIMESTAMPTZ;

