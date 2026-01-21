-- ============================================================================
-- WEEK 2 MIGRATION - FINAL VERSION (handles all edge cases)
-- Date: 2026-01-21
-- Run this in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- STEP 0: Drop tables that might be corrupted (will recreate)
-- ============================================================================
DROP TABLE IF EXISTS investor_payments CASCADE;
DROP TABLE IF EXISTS investments CASCADE;
DROP TABLE IF EXISTS investors CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS title_transfers CASCADE;
DROP TABLE IF EXISTS financial_plans CASCADE;
DROP TABLE IF EXISTS referral_bonuses CASCADE;

-- ============================================================================
-- STEP 1: Ensure rto_contracts exists and has all columns
-- ============================================================================

-- Create rto_contracts if it doesn't exist
CREATE TABLE IF NOT EXISTS rto_contracts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    lease_term_months INTEGER NOT NULL DEFAULT 36,
    monthly_rent NUMERIC NOT NULL DEFAULT 0,
    down_payment NUMERIC DEFAULT 0,
    purchase_option_price NUMERIC DEFAULT 0,
    purchase_price NUMERIC DEFAULT 0,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '3 years'),
    payment_day INTEGER DEFAULT 15,
    late_fee_per_day NUMERIC DEFAULT 15.0,
    nsf_fee NUMERIC DEFAULT 250.0,
    hud_number TEXT,
    property_year INTEGER,
    status TEXT DEFAULT 'draft',
    contract_text TEXT,
    contract_pdf_url TEXT,
    client_signed_at TIMESTAMPTZ,
    landlord_signed_at TIMESTAMPTZ,
    notes TEXT,
    -- Week 2 columns
    portfolio_status TEXT DEFAULT 'current',
    days_delinquent INTEGER DEFAULT 0,
    last_payment_date DATE,
    next_payment_due DATE,
    total_paid NUMERIC DEFAULT 0,
    total_late_fees NUMERIC DEFAULT 0,
    stripe_customer_id TEXT,
    stripe_payment_method_id TEXT,
    auto_payment_enabled BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already existed
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS portfolio_status TEXT DEFAULT 'current';
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS days_delinquent INTEGER DEFAULT 0;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS last_payment_date DATE;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS next_payment_due DATE;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS total_paid NUMERIC DEFAULT 0;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS total_late_fees NUMERIC DEFAULT 0;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS stripe_payment_method_id TEXT;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS auto_payment_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS purchase_price NUMERIC DEFAULT 0;

-- ============================================================================
-- STEP 2: PAYMENTS TABLE
-- ============================================================================
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contract_id UUID REFERENCES rto_contracts(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    property_id UUID REFERENCES properties(id),
    amount NUMERIC NOT NULL,
    payment_date TIMESTAMPTZ,
    due_date DATE NOT NULL,
    payment_number INTEGER,
    status TEXT DEFAULT 'pending',
    days_late INTEGER DEFAULT 0,
    late_fee NUMERIC DEFAULT 0,
    total_amount_due NUMERIC,
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    payment_method TEXT,
    receipt_url TEXT,
    receipt_sent_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payments_contract ON payments(contract_id);
CREATE INDEX idx_payments_client ON payments(client_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_due_date ON payments(due_date);

-- ============================================================================
-- STEP 3: INVESTORS TABLE
-- ============================================================================
CREATE TABLE investors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    zip_code TEXT,
    ssn_ein TEXT,
    kyc_status TEXT DEFAULT 'pending',
    kyc_verified_at TIMESTAMPTZ,
    accredited_status TEXT DEFAULT 'pending',
    accreditation_method TEXT,
    accreditation_verified_at TIMESTAMPTZ,
    total_invested NUMERIC DEFAULT 0,
    total_returns_earned NUMERIC DEFAULT 0,
    active_investments_count INTEGER DEFAULT 0,
    preferred_contact_method TEXT DEFAULT 'email',
    last_contact_date TIMESTAMPTZ,
    investor_status TEXT DEFAULT 'prospect',
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_investors_email ON investors(email);
CREATE INDEX idx_investors_status ON investors(investor_status);

-- ============================================================================
-- STEP 4: INVESTMENTS TABLE
-- ============================================================================
CREATE TABLE investments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    interest_rate NUMERIC DEFAULT 12.0,
    term_months INTEGER DEFAULT 12,
    start_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    status TEXT DEFAULT 'pending',
    expected_return NUMERIC,
    actual_return NUMERIC DEFAULT 0,
    returns_paid_to_date NUMERIC DEFAULT 0,
    promissory_note_url TEXT,
    promissory_note_signed_at TIMESTAMPTZ,
    payment_frequency TEXT DEFAULT 'monthly',
    next_payment_date DATE,
    linked_property_ids UUID[],
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_investments_investor ON investments(investor_id);
CREATE INDEX idx_investments_status ON investments(status);

-- ============================================================================
-- STEP 5: INVESTOR_PAYMENTS TABLE
-- ============================================================================
CREATE TABLE investor_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investment_id UUID NOT NULL REFERENCES investments(id) ON DELETE CASCADE,
    investor_id UUID NOT NULL REFERENCES investors(id) ON DELETE CASCADE,
    amount NUMERIC NOT NULL,
    payment_type TEXT,
    payment_date DATE,
    due_date DATE,
    status TEXT DEFAULT 'pending',
    transfer_method TEXT,
    transfer_reference TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 6: TITLE_TRANSFERS TABLE
-- ============================================================================
CREATE TABLE title_transfers (
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
    status TEXT DEFAULT 'pending',
    tdhca_filed_at TIMESTAMPTZ,
    tdhca_confirmation_number TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 7: FINANCIAL_PLANS TABLE
-- ============================================================================
CREATE TABLE financial_plans (
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
    status TEXT DEFAULT 'draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 8: REFERRAL_BONUSES TABLE
-- ============================================================================
CREATE TABLE referral_bonuses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_client_id UUID NOT NULL REFERENCES clients(id),
    referred_client_id UUID REFERENCES clients(id),
    referral_code_used TEXT,
    bonus_amount NUMERIC DEFAULT 0,
    bonus_type TEXT,
    status TEXT DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    trigger_event TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- STEP 9: RLS POLICIES
-- ============================================================================

-- Enable RLS
ALTER TABLE rto_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investor_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE title_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE referral_bonuses ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies first
DROP POLICY IF EXISTS "Service role can manage rto_contracts" ON rto_contracts;
DROP POLICY IF EXISTS "Authenticated users can view rto_contracts" ON rto_contracts;

-- Create policies for all tables
DO $$
DECLARE
    tables TEXT[] := ARRAY['rto_contracts', 'payments', 'investors', 'investments', 
                           'investor_payments', 'title_transfers', 'financial_plans', 'referral_bonuses'];
    t TEXT;
BEGIN
    FOREACH t IN ARRAY tables LOOP
        EXECUTE format('DROP POLICY IF EXISTS "service_role_all_%s" ON %I', t, t);
        EXECUTE format('CREATE POLICY "service_role_all_%s" ON %I FOR ALL TO service_role USING (true) WITH CHECK (true)', t, t);
        
        EXECUTE format('DROP POLICY IF EXISTS "authenticated_select_%s" ON %I', t, t);
        EXECUTE format('CREATE POLICY "authenticated_select_%s" ON %I FOR SELECT TO authenticated USING (true)', t, t);
    END LOOP;
END $$;

-- ============================================================================
-- STEP 10: Ensure process_logs exists
-- ============================================================================
CREATE TABLE IF NOT EXISTS process_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type TEXT NOT NULL,
    entity_id UUID,
    process TEXT NOT NULL,
    action TEXT NOT NULL,
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE process_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all_process_logs" ON process_logs;
CREATE POLICY "service_role_all_process_logs" ON process_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "authenticated_select_process_logs" ON process_logs;
CREATE POLICY "authenticated_select_process_logs" ON process_logs FOR SELECT TO authenticated USING (true);

-- ============================================================================
-- DONE!
-- ============================================================================
SELECT 'Week 2 migration completed successfully! Tables created: payments, investors, investments, investor_payments, title_transfers, financial_plans, referral_bonuses' as result;

