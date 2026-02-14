-- ============================================================================
-- Migration 012: Maninos Capital - Full RTO Infrastructure
-- Creates rto_contracts, rto_payments, investors, investments tables
-- Extends clients with financial fields from Solicitud de Crédito
-- ============================================================================

-- =============================================================================
-- 1. EXTEND CLIENTS TABLE (Solicitud de Crédito fields)
-- =============================================================================
ALTER TABLE clients ADD COLUMN IF NOT EXISTS date_of_birth DATE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ssn_itin TEXT;  -- Encrypted at app level
ALTER TABLE clients ADD COLUMN IF NOT EXISTS marital_status TEXT;  -- soltero, casado, otro
ALTER TABLE clients ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS state TEXT DEFAULT 'TX';
ALTER TABLE clients ADD COLUMN IF NOT EXISTS zip_code TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS residence_type TEXT;  -- propia, rentada, otra

-- Employment info
ALTER TABLE clients ADD COLUMN IF NOT EXISTS employer_name TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS occupation TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS employer_address TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS employer_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS monthly_income DECIMAL(12,2);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS time_at_job_years INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS time_at_job_months INTEGER;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_income_source BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS other_income_amount DECIMAL(12,2);

-- References
ALTER TABLE clients ADD COLUMN IF NOT EXISTS personal_references JSONB DEFAULT '[]';
-- Format: [{"name": "...", "phone": "...", "relationship": "..."}, ...]

-- KYC
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_verified BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_verified_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_documents JSONB DEFAULT '{}';
-- Format: {"id_front": "url", "id_back": "url", "proof_income": "url"}

-- Update client status constraint
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_status_check
    CHECK (status IN ('lead', 'active', 'rto_applicant', 'rto_active', 'completed', 'inactive'));


-- =============================================================================
-- 2. RTO CONTRACTS TABLE
-- Based on Texas Residential Lease Agreement With Purchase Option (33 clauses)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rto_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Contract Terms (from 33-clause template)
    monthly_rent DECIMAL(12,2) NOT NULL,
    purchase_price DECIMAL(12,2) NOT NULL,
    down_payment DECIMAL(12,2) NOT NULL DEFAULT 0,
    term_months INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Late fees (Clause 3: $15/day after 5th)
    late_fee_per_day DECIMAL(8,2) DEFAULT 15.00,
    grace_period_days INTEGER DEFAULT 5,
    payment_due_day INTEGER DEFAULT 15,  -- Day of month rent is due
    nsf_fee DECIMAL(8,2) DEFAULT 250.00,  -- Clause 3: NSF fee
    
    -- Hold over (Clause 14: $695/month)
    holdover_monthly DECIMAL(12,2) DEFAULT 695.00,
    
    -- Property details for contract
    hud_number TEXT,
    property_year INTEGER,
    
    -- Contract document
    contract_pdf_url TEXT,
    signed_at TIMESTAMPTZ,
    signed_by_client TEXT,
    signed_by_company TEXT,
    
    -- Status tracking
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN (
            'draft',        -- Being prepared
            'pending_signature',  -- Sent for signing
            'active',       -- Signed and active
            'completed',    -- All payments done, ready for title transfer
            'defaulted',    -- Client defaulted
            'terminated',   -- Early termination
            'holdover'      -- Past end date, in holdover
        )),
    
    -- Metadata
    created_by TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rto_contracts_sale ON rto_contracts(sale_id);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_property ON rto_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_client ON rto_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_status ON rto_contracts(status);


-- =============================================================================
-- 3. RTO PAYMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS rto_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Relations
    rto_contract_id UUID NOT NULL REFERENCES rto_contracts(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Payment details
    payment_number INTEGER NOT NULL,  -- 1, 2, 3, ... N
    amount DECIMAL(12,2) NOT NULL,
    due_date DATE NOT NULL,
    
    -- Payment receipt
    paid_date DATE,
    paid_amount DECIMAL(12,2),
    payment_method TEXT,  -- stripe, zelle, transfer, cash, check
    payment_reference TEXT,  -- Stripe ID, Zelle ref, etc.
    stripe_payment_id TEXT,
    
    -- Late fees
    late_fee_amount DECIMAL(8,2) DEFAULT 0,
    days_late INTEGER DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN (
            'scheduled',    -- Future payment, not yet due
            'pending',      -- Due, awaiting payment
            'paid',         -- Payment received
            'late',         -- Past due, not paid
            'partial',      -- Partially paid
            'waived',       -- Fee waived by admin
            'failed'        -- Payment attempt failed
        )),
    
    -- Metadata
    notes TEXT,
    recorded_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_rto_payments_contract ON rto_payments(rto_contract_id);
CREATE INDEX IF NOT EXISTS idx_rto_payments_client ON rto_payments(client_id);
CREATE INDEX IF NOT EXISTS idx_rto_payments_status ON rto_payments(status);
CREATE INDEX IF NOT EXISTS idx_rto_payments_due_date ON rto_payments(due_date);
CREATE INDEX IF NOT EXISTS idx_rto_payments_status_due 
    ON rto_payments(status, due_date) 
    WHERE status IN ('pending', 'late', 'scheduled');


-- =============================================================================
-- 4. INVESTORS TABLE (Fondear)
-- =============================================================================
CREATE TABLE IF NOT EXISTS investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    
    -- Financial
    total_invested DECIMAL(14,2) DEFAULT 0,
    available_capital DECIMAL(14,2) DEFAULT 0,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'inactive', 'paused')),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);


-- =============================================================================
-- 5. INVESTMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id),
    rto_contract_id UUID REFERENCES rto_contracts(id),
    
    amount DECIMAL(14,2) NOT NULL,
    expected_return_rate DECIMAL(5,2),  -- e.g., 12.5%
    
    status TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'returned', 'partial_return', 'defaulted')),
    
    invested_at TIMESTAMPTZ DEFAULT NOW(),
    returned_at TIMESTAMPTZ,
    return_amount DECIMAL(14,2),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_investments_investor ON investments(investor_id);
CREATE INDEX IF NOT EXISTS idx_investments_property ON investments(property_id);
CREATE INDEX IF NOT EXISTS idx_investments_contract ON investments(rto_contract_id);


-- =============================================================================
-- 6. SCHEDULED EMAILS (if not already created from migration 008)
-- =============================================================================
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    rto_contract_id UUID REFERENCES rto_contracts(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL,
    to_email TEXT NOT NULL,
    to_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_pending 
    ON scheduled_emails(status, scheduled_for) 
    WHERE status = 'pending';


-- =============================================================================
-- 7. AUTO-UPDATE TRIGGERS
-- =============================================================================
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rto_contracts_updated ON rto_contracts;
CREATE TRIGGER trigger_rto_contracts_updated
    BEFORE UPDATE ON rto_contracts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_rto_payments_updated ON rto_payments;
CREATE TRIGGER trigger_rto_payments_updated
    BEFORE UPDATE ON rto_payments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_investors_updated ON investors;
CREATE TRIGGER trigger_investors_updated
    BEFORE UPDATE ON investors
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

DROP TRIGGER IF EXISTS trigger_investments_updated ON investments;
CREATE TRIGGER trigger_investments_updated
    BEFORE UPDATE ON investments
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- =============================================================================
-- 8. UPDATE RTO_APPLICATIONS to add 'needs_info' status
-- =============================================================================
ALTER TABLE rto_applications DROP CONSTRAINT IF EXISTS rto_applications_status_check;
ALTER TABLE rto_applications ADD CONSTRAINT rto_applications_status_check
    CHECK (status IN ('submitted', 'under_review', 'needs_info', 'approved', 'rejected', 'cancelled'));


-- =============================================================================
-- 9. ADD rto_contract_id TO SALES (link to active contract)
-- =============================================================================
ALTER TABLE sales ADD COLUMN IF NOT EXISTS rto_contract_id UUID REFERENCES rto_contracts(id);


