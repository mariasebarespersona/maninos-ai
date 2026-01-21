-- ============================================================================
-- Migration: Week 2 Tables - Payments, Investors, Investments
-- Date: 2026-01-21
-- Purpose: Create tables for GestionarAgent, FondearAgent, and EntregarAgent
-- ============================================================================

-- ============================================================================
-- PAYMENTS TABLE (for GestionarAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES rto_contracts(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id),
    
    -- Payment Details
    amount NUMERIC NOT NULL,
    payment_date TIMESTAMPTZ,
    due_date DATE NOT NULL,
    payment_number INTEGER, -- Which payment in the sequence (1, 2, 3...)
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'late', 'failed', 'partial', 'waived'
    )),
    
    -- Late Fees
    days_late INTEGER DEFAULT 0,
    late_fee NUMERIC DEFAULT 0,
    total_amount_due NUMERIC, -- amount + late_fee
    
    -- Stripe Integration
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method TEXT, -- card, bank_transfer, zelle, cash, check
    
    -- Receipt
    receipt_url TEXT,
    receipt_sent_at TIMESTAMPTZ,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_stripe ON payments(stripe_payment_intent_id);

-- ============================================================================
-- INVESTORS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Personal Information
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    
    -- Identity/Compliance
    ssn_ein TEXT, -- SSN or EIN for tax purposes
    kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN (
        'pending', 'processing', 'verified', 'rejected'
    )),
    kyc_verified_at TIMESTAMPTZ,
    
    -- Accreditation Status (SEC Reg. D compliance)
    accredited_status TEXT DEFAULT 'pending' CHECK (accredited_status IN (
        'pending', 'accredited', 'non_accredited', 'exempt'
    )),
    accreditation_method TEXT, -- income, net_worth, professional, entity
    accreditation_verified_at TIMESTAMPTZ,
    
    -- Investment Summary
    total_invested NUMERIC DEFAULT 0,
    total_returns_earned NUMERIC DEFAULT 0,
    active_investments_count INTEGER DEFAULT 0,
    
    -- Communication
    preferred_contact_method TEXT DEFAULT 'email',
    last_contact_date TIMESTAMPTZ,
    
    -- Status
    investor_status TEXT DEFAULT 'prospect' CHECK (investor_status IN (
        'prospect', 'active', 'inactive', 'churned'
    )),
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for investors
CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
CREATE INDEX IF NOT EXISTS idx_investors_status ON investors(investor_status);
CREATE INDEX IF NOT EXISTS idx_investors_accredited ON investors(accredited_status);

-- ============================================================================
-- INVESTMENTS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    
    -- Investment Details
    amount NUMERIC NOT NULL,
    interest_rate NUMERIC DEFAULT 12.0, -- Annual rate (12% default)
    term_months INTEGER DEFAULT 12,
    
    -- Dates
    start_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'active', 'matured', 'renewed', 'withdrawn', 'defaulted'
    )),
    
    -- Returns
    expected_return NUMERIC, -- Calculated at creation
    actual_return NUMERIC DEFAULT 0,
    returns_paid_to_date NUMERIC DEFAULT 0,
    
    -- Documents
    promissory_note_url TEXT,
    promissory_note_signed_at TIMESTAMPTZ,
    
    -- Payment Schedule
    payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN (
        'monthly', 'quarterly', 'annual', 'at_maturity'
    )),
    next_payment_date DATE,
    
    -- Linked to specific properties (optional)
    linked_property_ids UUID[], -- Array of property IDs this investment funds
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for investments
CREATE INDEX IF NOT EXISTS idx_investments_investor ON investments(investor_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
CREATE INDEX IF NOT EXISTS idx_investments_maturity ON investments(maturity_date);

-- ============================================================================
-- INVESTOR_PAYMENTS TABLE (Track payments TO investors)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    
    -- Payment Details
    amount NUMERIC NOT NULL,
    payment_type TEXT CHECK (payment_type IN ('interest', 'principal', 'both')),
    payment_date DATE,
    due_date DATE,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'late', 'failed'
    )),
    
    -- Transfer Details
    transfer_method TEXT, -- wire, ach, check
    transfer_reference TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- TITLE_TRANSFERS TABLE (for EntregarAgent - TDHCA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS title_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    contract_id UUID REFERENCES rto_contracts(id),
    
    -- Transfer Details
    transfer_date DATE,
    purchase_price NUMERIC,
    
    -- Eligibility
    eligibility_verified BOOLEAN DEFAULT FALSE,
    eligibility_verified_at TIMESTAMPTZ,
    payments_completed INTEGER,
    payments_required INTEGER,
    
    -- Documents
    tdhca_document_url TEXT,
    irs_1099s_url TEXT,
    bill_of_sale_url TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'eligible', 'processing', 'completed', 'rejected'
    )),
    
    -- TDHCA Filing
    tdhca_filed_at TIMESTAMPTZ,
    tdhca_confirmation_number TEXT,
    
    -- Notes
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- FINANCIAL_PLANS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Plan Details
    plan_name TEXT NOT NULL,
    plan_year INTEGER NOT NULL,
    
    -- Projections
    target_acquisitions INTEGER, -- Number of properties to acquire
    target_capital_needed NUMERIC, -- Total capital needed
    target_investors INTEGER, -- Number of investors to onboard
    
    -- Actuals (updated throughout the year)
    actual_acquisitions INTEGER DEFAULT 0,
    actual_capital_raised NUMERIC DEFAULT 0,
    actual_investors_onboarded INTEGER DEFAULT 0,
    
    -- Budget
    projected_revenue NUMERIC,
    projected_expenses NUMERIC,
    projected_net_income NUMERIC,
    
    -- Debt Metrics
    target_debt_ratio NUMERIC DEFAULT 2.0, -- Max 2:1 debt to capital
    current_debt_ratio NUMERIC,
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'approved', 'active', 'completed'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- REFERRAL_BONUSES TABLE (for EntregarAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Referrer (existing client)
    referrer_client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Referred (new client)
    referred_client_id UUID REFERENCES clients(id),
    referral_code_used TEXT,
    
    -- Bonus Details
    bonus_amount NUMERIC DEFAULT 0,
    bonus_type TEXT CHECK (bonus_type IN (
        'cash', 'rent_credit', 'discount'
    )),
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'paid', 'rejected'
    )),
    paid_at TIMESTAMPTZ,
    
    -- Trigger Event
    trigger_event TEXT, -- 'contract_signed', 'first_payment', 'purchase_complete'
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- Add portfolio classification to contracts
-- ============================================================================
ALTER TABLE rto_contracts 
    ADD COLUMN IF NOT EXISTS portfolio_status TEXT DEFAULT 'current' 
        CHECK (portfolio_status IN (
            'current',      -- Al día
            'preventive',   -- 1-5 días de mora
            'administrative', -- 6-30 días
            'extrajudicial',  -- 31-60 días
            'judicial'        -- >60 días
        )),
    ADD COLUMN IF NOT EXISTS days_delinquent INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS last_payment_date DATE,
    ADD COLUMN IF NOT EXISTS next_payment_due DATE,
    ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS total_late_fees NUMERIC DEFAULT 0,
    ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT,
    ADD COLUMN IF NOT EXISTS auto_payment_enabled BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- RLS Policies
-- ============================================================================

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonuses ENABLE ROW LEVEL SECURITY;

-- Service role full access
CREATE POLICY "Service role full access on payments" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investors" ON investors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investments" ON investments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investor_payments" ON investor_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on title_transfers" ON title_transfers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on financial_plans" ON financial_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on referral_bonuses" ON referral_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users read access
CREATE POLICY "Authenticated read on payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on investors" ON investors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on investments" ON investments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on title_transfers" ON title_transfers FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- Comments
-- ============================================================================
COMMENT ON TABLE payments IS 'Client payments for RTO contracts - managed by GestionarAgent';
COMMENT ON TABLE investors IS 'Investor profiles - managed by FondearAgent';
COMMENT ON TABLE investments IS 'Individual investments/notes - managed by FondearAgent';
COMMENT ON TABLE investor_payments IS 'Payments made TO investors (returns)';
COMMENT ON TABLE title_transfers IS 'Property title transfers - managed by EntregarAgent';
COMMENT ON TABLE financial_plans IS 'Annual financial projections - managed by FondearAgent';
COMMENT ON TABLE referral_bonuses IS 'Referral bonus tracking - managed by EntregarAgent';
