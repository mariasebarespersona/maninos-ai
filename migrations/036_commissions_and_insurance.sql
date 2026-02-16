-- ============================================================================
-- Migration 036: Commissions tracking + Insurance/Tax tracking
-- ============================================================================

-- =============================================================================
-- 1. RTO COMMISSIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS rto_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    contract_id UUID REFERENCES rto_contracts(id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(id),
    client_id UUID REFERENCES clients(id),
    total_commission DECIMAL(14,2) NOT NULL DEFAULT 1000,
    found_by TEXT,           -- agent who found the client
    found_by_amount DECIMAL(14,2) DEFAULT 500,
    sold_by TEXT,            -- agent who closed the sale
    sold_by_amount DECIMAL(14,2) DEFAULT 500,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'paid_partial', 'paid', 'cancelled')),
    paid_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rto_commissions_sale ON rto_commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_rto_commissions_status ON rto_commissions(status);

-- Trigger
DROP TRIGGER IF EXISTS trigger_rto_commissions_updated ON rto_commissions;
CREATE TRIGGER trigger_rto_commissions_updated
    BEFORE UPDATE ON rto_commissions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- =============================================================================
-- 2. INSURANCE / TAX TRACKING ON CONTRACTS
-- =============================================================================
ALTER TABLE rto_contracts
    ADD COLUMN IF NOT EXISTS insurance_required BOOLEAN DEFAULT true,
    ADD COLUMN IF NOT EXISTS insurance_status TEXT DEFAULT 'pending'
        CHECK (insurance_status IN ('pending', 'active', 'expired', 'waived')),
    ADD COLUMN IF NOT EXISTS insurance_provider TEXT,
    ADD COLUMN IF NOT EXISTS insurance_policy_number TEXT,
    ADD COLUMN IF NOT EXISTS insurance_expiry DATE,
    ADD COLUMN IF NOT EXISTS tax_responsibility TEXT DEFAULT 'tenant'
        CHECK (tax_responsibility IN ('tenant', 'landlord', 'shared')),
    ADD COLUMN IF NOT EXISTS annual_tax_amount DECIMAL(14,2),
    ADD COLUMN IF NOT EXISTS tax_paid_through DATE,
    ADD COLUMN IF NOT EXISTS tax_status TEXT DEFAULT 'current'
        CHECK (tax_status IN ('current', 'overdue', 'paid_ahead'));

