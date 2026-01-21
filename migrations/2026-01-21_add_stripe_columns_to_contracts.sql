-- ============================================================================
-- Migration: Add Stripe Columns to rto_contracts
-- Date: 2026-01-21
-- Purpose: Support Stripe Payments integration for automatic RTO payments
-- ============================================================================

-- Add Stripe-related columns to rto_contracts table
ALTER TABLE rto_contracts 
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_price_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
ADD COLUMN IF NOT EXISTS auto_payment_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS payment_day INTEGER DEFAULT 15,
ADD COLUMN IF NOT EXISTS next_payment_due DATE,
ADD COLUMN IF NOT EXISTS last_payment_date DATE,
ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'pending';

-- Add check constraint for payment_day (1-28 to avoid month-end issues)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rto_contracts_payment_day_check'
    ) THEN
        ALTER TABLE rto_contracts 
        ADD CONSTRAINT rto_contracts_payment_day_check 
        CHECK (payment_day >= 1 AND payment_day <= 28);
    END IF;
END $$;

-- Add check constraint for payment_status
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'rto_contracts_payment_status_check'
    ) THEN
        ALTER TABLE rto_contracts 
        ADD CONSTRAINT rto_contracts_payment_status_check 
        CHECK (payment_status IN ('pending', 'current', 'preventive', 'administrative', 'extrajudicial', 'judicial'));
    END IF;
END $$;

-- Create index for Stripe lookups
CREATE INDEX IF NOT EXISTS idx_rto_contracts_stripe_customer 
ON rto_contracts(stripe_customer_id) 
WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_rto_contracts_stripe_subscription 
ON rto_contracts(stripe_subscription_id) 
WHERE stripe_subscription_id IS NOT NULL;

-- Create index for payment status queries
CREATE INDEX IF NOT EXISTS idx_rto_contracts_payment_status 
ON rto_contracts(payment_status);

CREATE INDEX IF NOT EXISTS idx_rto_contracts_next_payment 
ON rto_contracts(next_payment_due) 
WHERE next_payment_due IS NOT NULL;

-- Comments for documentation
COMMENT ON COLUMN rto_contracts.stripe_customer_id IS 'Stripe Customer ID (cus_xxx)';
COMMENT ON COLUMN rto_contracts.stripe_price_id IS 'Stripe Price ID for monthly rent (price_xxx)';
COMMENT ON COLUMN rto_contracts.stripe_subscription_id IS 'Stripe Subscription ID for recurring payments (sub_xxx)';
COMMENT ON COLUMN rto_contracts.stripe_payment_method_id IS 'Stripe Payment Method ID (pm_xxx)';
COMMENT ON COLUMN rto_contracts.auto_payment_enabled IS 'Whether automatic Stripe payments are enabled';
COMMENT ON COLUMN rto_contracts.payment_day IS 'Day of month for automatic payment (1-28)';
COMMENT ON COLUMN rto_contracts.next_payment_due IS 'Date of next scheduled payment';
COMMENT ON COLUMN rto_contracts.last_payment_date IS 'Date of last successful payment';
COMMENT ON COLUMN rto_contracts.payment_status IS 'Current payment status: pending, current, preventive, administrative, extrajudicial, judicial';

