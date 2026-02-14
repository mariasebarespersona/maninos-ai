-- ============================================================================
-- Migration 013: Maninos Capital - KYC, Reports, Fondear→Adquirir, Análisis
-- 4 features to complete the Capital portal
-- ============================================================================

-- =============================================================================
-- 1. KYC ENHANCEMENTS (Stripe Identity)
-- =============================================================================
-- Add verification session tracking to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_session_id TEXT;       -- Stripe VerificationSession ID
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'unverified'
    CHECK (kyc_status IN ('unverified', 'pending', 'verified', 'failed', 'requires_input'));
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_type TEXT;             -- 'document', 'id_number'
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_report_id TEXT;       -- Stripe VerificationReport ID
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_failure_reason TEXT;

-- =============================================================================
-- 2. MONTHLY REPORTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS monthly_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Period
    report_month INTEGER NOT NULL,    -- 1-12
    report_year INTEGER NOT NULL,
    period_label TEXT NOT NULL,        -- e.g. "Enero 2026"
    
    -- Portfolio metrics
    active_contracts INTEGER DEFAULT 0,
    total_contracts INTEGER DEFAULT 0,
    portfolio_value DECIMAL(14,2) DEFAULT 0,
    
    -- Income
    expected_income DECIMAL(14,2) DEFAULT 0,
    actual_income DECIMAL(14,2) DEFAULT 0,
    collection_rate DECIMAL(5,2) DEFAULT 0,  -- percentage
    
    -- Delinquency
    overdue_payments INTEGER DEFAULT 0,
    overdue_amount DECIMAL(14,2) DEFAULT 0,
    delinquency_rate DECIMAL(5,2) DEFAULT 0,
    
    -- Late fees
    late_fees_charged DECIMAL(12,2) DEFAULT 0,
    late_fees_collected DECIMAL(12,2) DEFAULT 0,
    
    -- Investors
    total_invested DECIMAL(14,2) DEFAULT 0,
    total_returns_paid DECIMAL(14,2) DEFAULT 0,
    active_investors INTEGER DEFAULT 0,
    
    -- Acquisitions
    properties_acquired INTEGER DEFAULT 0,
    acquisition_spend DECIMAL(14,2) DEFAULT 0,
    
    -- Deliveries
    titles_delivered INTEGER DEFAULT 0,
    
    -- Full data snapshot (JSON)
    detailed_data JSONB DEFAULT '{}',
    
    -- PDF
    pdf_url TEXT,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    generated_by TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(report_month, report_year)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reports_period
    ON monthly_reports(report_year DESC, report_month DESC);


-- =============================================================================
-- 3. CAPITAL FLOWS TABLE (Fondear → Adquirir cycle tracking)
-- =============================================================================
CREATE TABLE IF NOT EXISTS capital_flows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Flow type: investor puts money in, payments come in, returns go out, property bought
    flow_type TEXT NOT NULL
        CHECK (flow_type IN (
            'investment_in',      -- Investor → Pool
            'acquisition_out',    -- Pool → Buy property
            'rent_income',        -- Client payment → Pool
            'return_out',         -- Pool → Investor return
            'late_fee_income',    -- Late fee collected
            'operating_expense'   -- Operating costs
        )),
    
    -- Relations (nullable depending on type)
    investor_id UUID REFERENCES investors(id),
    investment_id UUID REFERENCES investments(id),
    property_id UUID REFERENCES properties(id),
    rto_contract_id UUID REFERENCES rto_contracts(id),
    rto_payment_id UUID REFERENCES rto_payments(id),
    
    -- Amount (positive = money in, negative = money out)
    amount DECIMAL(14,2) NOT NULL,
    
    -- Running balance after this flow
    balance_after DECIMAL(14,2),
    
    -- Description
    description TEXT,
    reference TEXT,  -- External reference (Stripe ID, etc.)
    
    -- Metadata
    flow_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_flows_type ON capital_flows(flow_type);
CREATE INDEX IF NOT EXISTS idx_capital_flows_date ON capital_flows(flow_date DESC);
CREATE INDEX IF NOT EXISTS idx_capital_flows_investor ON capital_flows(investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_flows_property ON capital_flows(property_id);
CREATE INDEX IF NOT EXISTS idx_capital_flows_contract ON capital_flows(rto_contract_id);


-- =============================================================================
-- 4. ACQUISITION ANALYSES TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS acquisition_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What property are we analyzing?
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Purchase data (from Homes)
    purchase_price DECIMAL(14,2) NOT NULL,
    renovation_cost DECIMAL(14,2) DEFAULT 0,
    total_cost DECIMAL(14,2) NOT NULL,  -- purchase + renovation
    
    -- Market data
    estimated_market_value DECIMAL(14,2),
    ltv_ratio DECIMAL(5,2),  -- Loan-to-Value: total_cost / market_value
    
    -- RTO Projections
    suggested_monthly_rent DECIMAL(12,2),
    suggested_purchase_price DECIMAL(14,2),  -- What client would pay via RTO
    suggested_term_months INTEGER,
    suggested_down_payment DECIMAL(12,2),
    
    -- Financial projections
    total_rto_income DECIMAL(14,2),         -- monthly_rent * term + down_payment
    gross_profit DECIMAL(14,2),              -- total_rto_income - total_cost
    roi_percentage DECIMAL(5,2),             -- gross_profit / total_cost * 100
    monthly_cashflow DECIMAL(12,2),          -- monthly_rent - expenses
    breakeven_months INTEGER,                -- When investment is recovered
    
    -- Risk assessment
    risk_score TEXT CHECK (risk_score IN ('low', 'medium', 'high', 'very_high')),
    risk_factors JSONB DEFAULT '[]',         -- Array of risk descriptions
    
    -- Recommendation
    recommendation TEXT CHECK (recommendation IN ('proceed', 'caution', 'reject')),
    recommendation_notes TEXT,
    
    -- Who/when
    analyzed_by TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_acq_analyses_property ON acquisition_analyses(property_id);
CREATE INDEX IF NOT EXISTS idx_acq_analyses_recommendation ON acquisition_analyses(recommendation);


-- =============================================================================
-- 5. ADD funding_source TO INVESTMENTS (track which funds)
-- =============================================================================
ALTER TABLE investments ADD COLUMN IF NOT EXISTS funding_purpose TEXT;  -- 'acquisition', 'working_capital', 'reserve'
ALTER TABLE investments ADD COLUMN IF NOT EXISTS capital_flow_id UUID REFERENCES capital_flows(id);


-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================
DROP TRIGGER IF EXISTS trigger_acq_analyses_updated ON acquisition_analyses;
CREATE TRIGGER trigger_acq_analyses_updated
    BEFORE UPDATE ON acquisition_analyses
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

