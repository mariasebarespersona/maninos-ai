-- Add 'client_reported' to capital_down_payment_installments status check
-- and add client reporting columns
ALTER TABLE capital_down_payment_installments DROP CONSTRAINT IF EXISTS capital_down_payment_installments_status_check;
ALTER TABLE capital_down_payment_installments DROP CONSTRAINT IF EXISTS capital_down_payment_i;
ALTER TABLE capital_down_payment_installments ADD CONSTRAINT capital_down_payment_installments_status_check
    CHECK (status IN ('scheduled', 'paid', 'partial', 'overdue', 'client_reported'));

ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS client_payment_method TEXT;
ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS client_reported_at TIMESTAMPTZ;
ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES capital_transactions(id);
