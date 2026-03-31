-- Migration 077: Sale Payments tracking for contado sales
-- Tracks individual payments per sale (down payment, remaining, full, etc.)
-- Enables split payments: down payment + remaining balance

-- ═══════════════════════════════════════════════════════════════
-- 1. Create sale_payments table
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sale_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,

    payment_type TEXT NOT NULL CHECK (payment_type IN ('down_payment', 'remaining', 'full', 'partial', 'adjustment')),
    amount DECIMAL(12,2) NOT NULL CHECK (amount > 0),

    payment_method TEXT CHECK (payment_method IN ('bank_transfer', 'cash', 'zelle', 'check', 'other')),
    payment_reference TEXT,
    payment_date DATE DEFAULT CURRENT_DATE,
    notes TEXT,

    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    reported_by TEXT DEFAULT 'staff' CHECK (reported_by IN ('client', 'staff', 'system')),

    confirmed_by TEXT,
    confirmed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sale_payments_sale ON sale_payments(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_payments_status ON sale_payments(status);

-- ═══════════════════════════════════════════════════════════════
-- 2. Add summary columns to sales table
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_paid DECIMAL(12,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS amount_pending DECIMAL(12,2);

-- Initialize amount_pending for existing sales
-- NOTE: Must be run AFTER trigger is created so it stays consistent.
-- For pending/active sales: pending = sale_price (no payments yet)
-- For completed sales: paid = sale_price, pending = 0

-- ═══════════════════════════════════════════════════════════════
-- 3. Trigger: auto-recalculate totals on sale_payments changes
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_sale_payment_totals()
RETURNS TRIGGER AS $$
DECLARE
    target_sale_id UUID;
    total_confirmed DECIMAL(12,2);
    sp DECIMAL(12,2);
BEGIN
    -- Determine which sale to update
    IF TG_OP = 'DELETE' THEN
        target_sale_id := OLD.sale_id;
    ELSE
        target_sale_id := NEW.sale_id;
    END IF;

    -- Sum confirmed payments
    SELECT COALESCE(SUM(amount), 0) INTO total_confirmed
    FROM sale_payments
    WHERE sale_id = target_sale_id AND status = 'confirmed';

    -- Get sale price
    SELECT sale_price INTO sp FROM sales WHERE id = target_sale_id;

    -- Update sales totals
    UPDATE sales
    SET amount_paid = total_confirmed,
        amount_pending = COALESCE(sp, 0) - total_confirmed
    WHERE id = target_sale_id;

    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sale_payment_totals ON sale_payments;
CREATE TRIGGER trg_sale_payment_totals
    AFTER INSERT OR UPDATE OR DELETE ON sale_payments
    FOR EACH ROW EXECUTE FUNCTION update_sale_payment_totals();

-- ═══════════════════════════════════════════════════════════════
-- 4. Update trigger for updated_at
-- ═══════════════════════════════════════════════════════════════

DROP TRIGGER IF EXISTS update_sale_payments_updated_at ON sale_payments;
CREATE TRIGGER update_sale_payments_updated_at
    BEFORE UPDATE ON sale_payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════
-- 5. Add sale_payment to notification type CHECK (if constrained)
-- ═══════════════════════════════════════════════════════════════
-- notifications.type is TEXT with no CHECK constraint, so no change needed.

-- ═══════════════════════════════════════════════════════════════
-- 6. RLS policies
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE sale_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role bypass" ON sale_payments
    FOR ALL USING (true) WITH CHECK (true);
