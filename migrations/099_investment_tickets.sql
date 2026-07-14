-- ============================================================================
-- Migration 099: Investment "tickets" — renegotiation history + debt transfer
--   1. Renegotiate a ticket at a new rate → old ticket is CLOSED and a new
--      linked ticket is created (history preserved, shown as separate).
--   2. An investor can BUY another investor's debt → the seller's ticket is
--      CLOSED and a new ticket is created for the buyer (lineage preserved).
-- Additive only. No data is deleted; superseded tickets stay for the audit trail.
-- ============================================================================

ALTER TABLE investments
    ADD COLUMN IF NOT EXISTS parent_investment_id UUID REFERENCES investments(id),
    -- how this ticket came to exist: original | renegotiation | transfer
    ADD COLUMN IF NOT EXISTS ticket_type TEXT NOT NULL DEFAULT 'original',
    -- for transfers: the investor who SOLD the debt
    ADD COLUMN IF NOT EXISTS transferred_from_investor_id UUID REFERENCES investors(id),
    -- for transfers: what the buyer paid for the debt (may differ from principal)
    ADD COLUMN IF NOT EXISTS purchase_price DECIMAL(14,2),
    -- previous rate captured when renegotiating (for a quick "12% → 10%" display)
    ADD COLUMN IF NOT EXISTS previous_rate DECIMAL(5,2),
    -- when this ticket was superseded (renegotiated/transferred)
    ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

-- Widen status to allow the two new "closed/superseded" states.
ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_status_check;
ALTER TABLE investments ADD CONSTRAINT investments_status_check
    CHECK (status IN ('active', 'returned', 'partial_return', 'defaulted', 'renegotiated', 'transferred'));

ALTER TABLE investments DROP CONSTRAINT IF EXISTS investments_ticket_type_check;
ALTER TABLE investments ADD CONSTRAINT investments_ticket_type_check
    CHECK (ticket_type IN ('original', 'renegotiation', 'transfer'));

CREATE INDEX IF NOT EXISTS idx_investments_parent ON investments(parent_investment_id);
CREATE INDEX IF NOT EXISTS idx_investments_from_investor ON investments(transferred_from_investor_id);

-- A ticket that has been superseded (renegotiated or transferred) is "closed";
-- only non-superseded tickets represent live deployed capital. Aggregations
-- that sum deployed capital must exclude status in ('renegotiated','transferred').
