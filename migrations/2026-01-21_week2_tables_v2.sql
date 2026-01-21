-- ============================================================================
-- Migration: Week 2 Tables V2 - Fixed version
-- Date: 2026-01-21
-- Purpose: Create tables for GestionarAgent, FondearAgent, and EntregarAgent
-- 
-- IMPORTANT: Run this AFTER 2026-01-21_rto_contracts_table.sql
-- ============================================================================

-- ============================================================================
-- STEP 1: Ensure rto_contracts has required columns
-- (These might already exist from previous migrations)
-- ============================================================================

-- Add portfolio management columns to rto_contracts (if they don't exist)
DO $$ 
BEGIN
    -- portfolio_status
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'portfolio_status') THEN
        ALTER TABLE rto_contracts ADD COLUMN portfolio_status TEXT DEFAULT 'current';
    END IF;
    
    -- days_delinquent
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'days_delinquent') THEN
        ALTER TABLE rto_contracts ADD COLUMN days_delinquent INTEGER DEFAULT 0;
    END IF;
    
    -- last_payment_date
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'last_payment_date') THEN
        ALTER TABLE rto_contracts ADD COLUMN last_payment_date DATE;
    END IF;
    
    -- next_payment_due
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'next_payment_due') THEN
        ALTER TABLE rto_contracts ADD COLUMN next_payment_due DATE;
    END IF;
    
    -- total_paid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'total_paid') THEN
        ALTER TABLE rto_contracts ADD COLUMN total_paid NUMERIC DEFAULT 0;
    END IF;
    
    -- total_late_fees
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'total_late_fees') THEN
        ALTER TABLE rto_contracts ADD COLUMN total_late_fees NUMERIC DEFAULT 0;
    END IF;
    
    -- stripe_customer_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'stripe_customer_id') THEN
        ALTER TABLE rto_contracts ADD COLUMN stripe_customer_id TEXT;
    END IF;
    
    -- stripe_payment_method_id
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'stripe_payment_method_id') THEN
        ALTER TABLE rto_contracts ADD COLUMN stripe_payment_method_id TEXT;
    END IF;
    
    -- auto_payment_enabled
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'auto_payment_enabled') THEN
        ALTER TABLE rto_contracts ADD COLUMN auto_payment_enabled BOOLEAN DEFAULT FALSE;
    END IF;
    
    -- purchase_price (might be missing from original)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'rto_contracts' AND column_name = 'purchase_price') THEN
        ALTER TABLE rto_contracts ADD COLUMN purchase_price NUMERIC DEFAULT 0;
    END IF;
END $$;

-- Add constraint for portfolio_status (drop first if exists)
ALTER TABLE rto_contracts DROP CONSTRAINT IF EXISTS rto_contracts_portfolio_status_check;
ALTER TABLE rto_contracts ADD CONSTRAINT rto_contracts_portfolio_status_check 
    CHECK (portfolio_status IS NULL OR portfolio_status IN (
        'current', 'preventive', 'administrative', 'extrajudicial', 'judicial'
    ));

-- ============================================================================
-- STEP 2: PAYMENTS TABLE (for GestionarAgent)
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
    payment_number INTEGER,
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'late', 'failed', 'partial', 'waived'
    )),
    
    -- Late Fees
    days_late INTEGER DEFAULT 0,
    late_fee NUMERIC DEFAULT 0,
    total_amount_due NUMERIC,
    
    -- Stripe Integration
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method TEXT,
    
    -- Receipt
    receipt_url TEXT,
    receipt_sent_at TIMESTAMPTZ,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for payments
CREATE INDEX IF NOT EXISTS idx_payments_contract ON payments(contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_client ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);

-- ============================================================================
-- STEP 3: INVESTORS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    
    ssn_ein TEXT,
    kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN (
        'pending', 'processing', 'verified', 'rejected'
    )),
    kyc_verified_at TIMESTAMPTZ,
    
    accredited_status TEXT DEFAULT 'pending' CHECK (accredited_status IN (
        'pending', 'accredited', 'non_accredited', 'exempt'
    )),
    accreditation_method TEXT,
    accreditation_verified_at TIMESTAMPTZ,
    
    total_invested NUMERIC DEFAULT 0,
    total_returns_earned NUMERIC DEFAULT 0,
    active_investments_count INTEGER DEFAULT 0,
    
    preferred_contact_method TEXT DEFAULT 'email',
    last_contact_date TIMESTAMPTZ,
    
    investor_status TEXT DEFAULT 'prospect' CHECK (investor_status IN (
        'prospect', 'active', 'inactive', 'churned'
    )),
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
CREATE INDEX IF NOT EXISTS idx_investors_status ON investors(investor_status);

-- ============================================================================
-- STEP 4: INVESTMENTS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    
    amount NUMERIC NOT NULL,
    interest_rate NUMERIC DEFAULT 12.0,
    term_months INTEGER DEFAULT 12,
    
    start_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'active', 'matured', 'renewed', 'withdrawn', 'defaulted'
    )),
    
    expected_return NUMERIC,
    actual_return NUMERIC DEFAULT 0,
    returns_paid_to_date NUMERIC DEFAULT 0,
    
    promissory_note_url TEXT,
    promissory_note_signed_at TIMESTAMPTZ,
    
    payment_frequency TEXT DEFAULT 'monthly' CHECK (payment_frequency IN (
        'monthly', 'quarterly', 'annual', 'at_maturity'
    )),
    next_payment_date DATE,
    
    linked_property_ids UUID[],
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_investments_investor ON investments(investor_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);

-- ============================================================================
-- STEP 5: INVESTOR_PAYMENTS TABLE
-- ============================================================================
CREATE TABLE IF NOT EXISTS investor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    
    amount NUMERIC NOT NULL,
    payment_type TEXT CHECK (payment_type IN ('interest', 'principal', 'both')),
    payment_date DATE,
    due_date DATE,
    
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'late', 'failed'
    )),
    
    transfer_method TEXT,
    transfer_reference TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 6: TITLE_TRANSFERS TABLE (for EntregarAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS title_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    contract_id UUID REFERENCES rto_contracts(id),
    
    transfer_date DATE,
    purchase_price NUMERIC,
    
    eligibility_verified BOOLEAN DEFAULT FALSE,
    eligibility_verified_at TIMESTAMPTZ,
    payments_completed INTEGER,
    payments_required INTEGER,
    
    tdhca_document_url TEXT,
    irs_1099s_url TEXT,
    bill_of_sale_url TEXT,
    
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'eligible', 'processing', 'completed', 'rejected'
    )),
    
    tdhca_filed_at TIMESTAMPTZ,
    tdhca_confirmation_number TEXT,
    
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 7: FINANCIAL_PLANS TABLE (for FondearAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS financial_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    plan_name TEXT NOT NULL,
    plan_year INTEGER NOT NULL,
    
    target_acquisitions INTEGER,
    target_capital_needed NUMERIC,
    target_investors INTEGER,
    
    actual_acquisitions INTEGER DEFAULT 0,
    actual_capital_raised NUMERIC DEFAULT 0,
    actual_investors_onboarded INTEGER DEFAULT 0,
    
    projected_revenue NUMERIC,
    projected_expenses NUMERIC,
    projected_net_income NUMERIC,
    
    target_debt_ratio NUMERIC DEFAULT 2.0,
    current_debt_ratio NUMERIC,
    
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'approved', 'active', 'completed'
    )),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 8: REFERRAL_BONUSES TABLE (for EntregarAgent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS referral_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    referrer_client_id UUID NOT NULL REFERENCES clients(id),
    referred_client_id UUID REFERENCES clients(id),
    referral_code_used TEXT,
    
    bonus_amount NUMERIC DEFAULT 0,
    bonus_type TEXT CHECK (bonus_type IN (
        'cash', 'rent_credit', 'discount'
    )),
    
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'approved', 'paid', 'rejected'
    )),
    paid_at TIMESTAMPTZ,
    
    trigger_event TEXT,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 9: Update process_logs constraint (add new entity types)
-- ============================================================================
ALTER TABLE process_logs DROP CONSTRAINT IF EXISTS process_logs_entity_type_check;
-- Don't add constraint - let it be flexible for any entity type

-- ============================================================================
-- STEP 10: RLS Policies
-- ============================================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonuses ENABLE ROW LEVEL SECURITY;

-- Drop policies if they exist first
DROP POLICY IF EXISTS "Service role full access on payments" ON payments;
DROP POLICY IF EXISTS "Service role full access on investors" ON investors;
DROP POLICY IF EXISTS "Service role full access on investments" ON investments;
DROP POLICY IF EXISTS "Service role full access on investor_payments" ON investor_payments;
DROP POLICY IF EXISTS "Service role full access on title_transfers" ON title_transfers;
DROP POLICY IF EXISTS "Service role full access on financial_plans" ON financial_plans;
DROP POLICY IF EXISTS "Service role full access on referral_bonuses" ON referral_bonuses;

-- Create policies
CREATE POLICY "Service role full access on payments" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investors" ON investors FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investments" ON investments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on investor_payments" ON investor_payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on title_transfers" ON title_transfers FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on financial_plans" ON financial_plans FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access on referral_bonuses" ON referral_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated read policies
DROP POLICY IF EXISTS "Authenticated read on payments" ON payments;
DROP POLICY IF EXISTS "Authenticated read on investors" ON investors;
DROP POLICY IF EXISTS "Authenticated read on investments" ON investments;
DROP POLICY IF EXISTS "Authenticated read on title_transfers" ON title_transfers;

CREATE POLICY "Authenticated read on payments" ON payments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on investors" ON investors FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on investments" ON investments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated read on title_transfers" ON title_transfers FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- STEP 11: Comments
-- ============================================================================
COMMENT ON TABLE payments IS 'Client payments for RTO contracts - managed by GestionarAgent';
COMMENT ON TABLE investors IS 'Investor profiles - managed by FondearAgent';
COMMENT ON TABLE investments IS 'Individual investments/notes - managed by FondearAgent';
COMMENT ON TABLE investor_payments IS 'Payments made TO investors (returns)';
COMMENT ON TABLE title_transfers IS 'Property title transfers - managed by EntregarAgent';
COMMENT ON TABLE financial_plans IS 'Annual financial projections - managed by FondearAgent';
COMMENT ON TABLE referral_bonuses IS 'Referral bonus tracking - managed by EntregarAgent';

-- Done!
SELECT 'Week 2 migration completed successfully!' as status;

