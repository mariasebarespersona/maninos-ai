-- ============================================================================
-- Migration 035: Investor Section Improvements
-- 1. promissory_note_payments table (individual payment history)
-- 2. Link investments to promissory notes
-- ============================================================================

-- =============================================================================
-- 1. PROMISSORY NOTE PAYMENTS TABLE (individual payment records)
-- =============================================================================
CREATE TABLE IF NOT EXISTS promissory_note_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promissory_note_id UUID NOT NULL REFERENCES promissory_notes(id) ON DELETE CASCADE,
    amount DECIMAL(14,2) NOT NULL,
    payment_method TEXT DEFAULT 'bank_transfer',  -- bank_transfer, check, cash, zelle, wire
    reference TEXT,              -- Bank reference number, check number, etc.
    notes TEXT,
    paid_at TIMESTAMPTZ DEFAULT NOW(),
    recorded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pn_payments_note ON promissory_note_payments(promissory_note_id);
CREATE INDEX IF NOT EXISTS idx_pn_payments_date ON promissory_note_payments(paid_at);

-- =============================================================================
-- 2. LINK INVESTMENTS TO PROMISSORY NOTES
-- =============================================================================
ALTER TABLE investments 
    ADD COLUMN IF NOT EXISTS promissory_note_id UUID REFERENCES promissory_notes(id);

CREATE INDEX IF NOT EXISTS idx_investments_note ON investments(promissory_note_id);

