-- ============================================================================
-- Migration 011: RTO Support
-- Adds RTO-related statuses and fields to the sales table
-- ============================================================================

-- 1. Expand sales status to include RTO statuses
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
    CHECK (status IN (
        'pending',       -- Initial state (both contado and rto)
        'paid',          -- Contado: payment received
        'completed',     -- Sale fully completed
        'cancelled',     -- Sale cancelled
        'rto_pending',   -- RTO: application submitted, awaiting Maninos Capital review
        'rto_approved',  -- RTO: application approved by Maninos Capital
        'rto_active'     -- RTO: contract active, client making payments
    ));

-- 2. Add RTO-specific columns to sales
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rto_monthly_payment DECIMAL(12,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rto_term_months INTEGER;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rto_down_payment DECIMAL(12,2);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rto_notes TEXT;

-- 3. Create rto_applications table for tracking the application process
CREATE TABLE IF NOT EXISTS rto_applications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relations
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    
    -- Application Status
    status TEXT NOT NULL DEFAULT 'submitted'
        CHECK (status IN ('submitted', 'under_review', 'approved', 'rejected', 'cancelled')),
    
    -- Client Financial Info (basic, for initial screening)
    monthly_income DECIMAL(12,2),
    employment_status TEXT,
    employer_name TEXT,
    time_at_job TEXT,
    
    -- Desired Terms
    desired_term_months INTEGER,
    desired_down_payment DECIMAL(12,2),
    
    -- Review
    reviewed_by TEXT,
    reviewed_at TIMESTAMPTZ,
    review_notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_rto_applications_sale ON rto_applications(sale_id);
CREATE INDEX IF NOT EXISTS idx_rto_applications_client ON rto_applications(client_id);
CREATE INDEX IF NOT EXISTS idx_rto_applications_status ON rto_applications(status);

