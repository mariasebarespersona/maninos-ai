-- Migration 071: Payment Approval Flow
-- Add "approved" status between "pending" and "completed"
-- Sebastian (admin) approves → Abigail (treasury) executes

-- Add approval columns to payment_orders
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Update CHECK constraint to include 'approved' status
ALTER TABLE payment_orders DROP CONSTRAINT IF EXISTS payment_orders_status_check;
ALTER TABLE payment_orders ADD CONSTRAINT payment_orders_status_check
    CHECK (status IN ('pending', 'approved', 'completed', 'cancelled'));

-- Add approval columns to sales (for transfer confirmations)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transfer_approved_by TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS transfer_approved_at TIMESTAMPTZ;

-- Capital: Add approval columns to RTO payments
ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Capital: Add approval columns to down payment installments
ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Capital: Add approval columns to capital_transactions
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
