-- Migration: Create contracts table for persisting generated contracts
-- Date: 2025-01-11
-- Description: Stores all generated purchase agreements for properties

CREATE TABLE IF NOT EXISTS contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Contract Content
    contract_text TEXT NOT NULL,
    
    -- Parties
    buyer_name TEXT DEFAULT 'MANINOS HOMES LLC',
    seller_name TEXT DEFAULT '[SELLER NAME]',
    
    -- Financial Summary (for quick reference without parsing text)
    purchase_price NUMERIC,
    total_investment NUMERIC,
    projected_profit NUMERIC,
    roi NUMERIC,
    
    -- Dates
    closing_date TEXT,
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'signed', 'cancelled')),
    
    -- Metadata
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Index for fast property lookup
CREATE INDEX IF NOT EXISTS idx_contracts_property_id ON contracts(property_id);

-- Index for status queries
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_contracts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER contracts_updated_at_trigger
BEFORE UPDATE ON contracts
FOR EACH ROW
EXECUTE FUNCTION update_contracts_updated_at();

-- Comments for documentation
COMMENT ON TABLE contracts IS 'Stores generated purchase agreements for mobile home properties';
COMMENT ON COLUMN contracts.contract_text IS 'Full text of the generated contract';
COMMENT ON COLUMN contracts.status IS 'draft: Just generated, sent: Sent to seller, signed: Both parties signed, cancelled: Deal cancelled';
COMMENT ON COLUMN contracts.buyer_name IS 'Name of the buyer (usually MANINOS HOMES LLC)';
COMMENT ON COLUMN contracts.seller_name IS 'Name of the property seller';

