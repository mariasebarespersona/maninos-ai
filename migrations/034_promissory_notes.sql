-- ============================================================================
-- Migration 034: Promissory Notes for Investors
-- Compound interest, balloon payment structure
-- ============================================================================

-- =============================================================================
-- 1. PROMISSORY NOTES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS promissory_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Investor (lender/subscriber)
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    
    -- Loan terms
    loan_amount DECIMAL(14,2) NOT NULL,
    annual_rate DECIMAL(5,2) NOT NULL DEFAULT 12.00,    -- e.g. 12%
    monthly_rate DECIMAL(8,6) NOT NULL DEFAULT 0.01,    -- annual/12 e.g. 0.01 = 1%
    term_months INTEGER NOT NULL DEFAULT 12,
    
    -- Calculated fields (stored for convenience)
    total_interest DECIMAL(14,2) NOT NULL DEFAULT 0,
    total_due DECIMAL(14,2) NOT NULL DEFAULT 0,         -- loan + interest at maturity
    
    -- Subscriber (borrower) info - who signs the note
    subscriber_name TEXT NOT NULL DEFAULT 'Maninos Capital LLC',
    subscriber_company TEXT,
    subscriber_representative TEXT,
    subscriber_address TEXT DEFAULT '15891 Old Houston Rd, Conroe, Tx. Zip Code 77302',
    
    -- Lender info (from investor, but can override)
    lender_name TEXT NOT NULL,
    lender_company TEXT,
    lender_representative TEXT,
    
    -- Dates
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    maturity_date DATE NOT NULL,
    signed_at DATE,
    signed_city TEXT DEFAULT 'Conroe',
    signed_state TEXT DEFAULT 'Texas',
    
    -- Payment tracking
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('draft', 'active', 'paid', 'overdue', 'defaulted', 'cancelled')),
    paid_amount DECIMAL(14,2) DEFAULT 0,
    paid_at TIMESTAMPTZ,
    
    -- Document
    document_url TEXT,           -- Uploaded/generated PDF
    
    -- Notes
    notes TEXT,
    default_interest_rate DECIMAL(5,2) DEFAULT 12.00,  -- Default interest rate mentioned in the note
    
    -- Metadata
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_promissory_notes_investor ON promissory_notes(investor_id);
CREATE INDEX IF NOT EXISTS idx_promissory_notes_status ON promissory_notes(status);
CREATE INDEX IF NOT EXISTS idx_promissory_notes_maturity ON promissory_notes(maturity_date);

-- Trigger
DROP TRIGGER IF EXISTS trigger_promissory_notes_updated ON promissory_notes;
CREATE TRIGGER trigger_promissory_notes_updated
    BEFORE UPDATE ON promissory_notes
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

