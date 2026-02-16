-- ============================================================================
-- Migration 037: Capital Accounting
-- Separate chart of accounts and transactions journal for Maninos Capital LLC
-- ============================================================================

-- =============================================================================
-- 1. CAPITAL CHART OF ACCOUNTS
--    Hierarchical accounts for Capital's financial tracking.
--    User will populate with Capital-specific accounts later.
-- =============================================================================
CREATE TABLE IF NOT EXISTS capital_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL UNIQUE,           -- e.g., '10000', '20000', '40100'
    name TEXT NOT NULL,
    account_type TEXT NOT NULL
        CHECK (account_type IN ('asset', 'liability', 'equity', 'income', 'expense', 'cogs')),
    category TEXT DEFAULT 'general',     -- sub-category: 'bank', 'receivable', 'payable', etc.
    parent_account_id UUID REFERENCES capital_accounts(id) ON DELETE SET NULL,
    is_header BOOLEAN DEFAULT false,     -- true = group header (no direct transactions)
    is_active BOOLEAN DEFAULT true,
    description TEXT,
    current_balance DECIMAL(14,2) DEFAULT 0,
    display_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_accounts_type ON capital_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_capital_accounts_parent ON capital_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_capital_accounts_code ON capital_accounts(code);

-- Trigger
DROP TRIGGER IF EXISTS trigger_capital_accounts_updated ON capital_accounts;
CREATE TRIGGER trigger_capital_accounts_updated
    BEFORE UPDATE ON capital_accounts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- =============================================================================
-- 2. CAPITAL TRANSACTIONS
--    Manual journal entries + auto-generated from capital_flows, payments, etc.
-- =============================================================================
CREATE TABLE IF NOT EXISTS capital_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    transaction_type TEXT NOT NULL
        CHECK (transaction_type IN (
            'rto_payment', 'down_payment', 'late_fee',
            'acquisition', 'investor_deposit', 'investor_return',
            'commission', 'insurance', 'tax', 'operating_expense',
            'transfer', 'adjustment', 'other_income', 'other_expense'
        )),
    amount DECIMAL(14,2) NOT NULL,
    is_income BOOLEAN NOT NULL,
    account_id UUID REFERENCES capital_accounts(id) ON DELETE SET NULL,
    description TEXT NOT NULL,
    -- Linked entities
    investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    rto_contract_id UUID REFERENCES rto_contracts(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    capital_flow_id UUID REFERENCES capital_flows(id) ON DELETE SET NULL,
    rto_payment_id UUID REFERENCES rto_payments(id) ON DELETE SET NULL,
    -- Payment details
    payment_method TEXT,
    payment_reference TEXT,
    counterparty_name TEXT,
    notes TEXT,
    -- Status
    status TEXT NOT NULL DEFAULT 'confirmed'
        CHECK (status IN ('draft', 'pending', 'confirmed', 'reconciled', 'voided')),
    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_transactions_date ON capital_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_type ON capital_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_account ON capital_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_status ON capital_transactions(status);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_investor ON capital_transactions(investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_property ON capital_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_capital_transactions_contract ON capital_transactions(rto_contract_id);

-- Trigger
DROP TRIGGER IF EXISTS trigger_capital_transactions_updated ON capital_transactions;
CREATE TRIGGER trigger_capital_transactions_updated
    BEFORE UPDATE ON capital_transactions
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- =============================================================================
-- 3. CAPITAL BANK ACCOUNTS
--    Bank accounts / cash held by Maninos Capital LLC.
-- =============================================================================
CREATE TABLE IF NOT EXISTS capital_bank_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                  -- e.g., 'Operating Account', 'Caja Chica'
    bank_name TEXT,                      -- e.g., 'Chase', 'Bank of America', NULL for cash
    account_number TEXT,                 -- masked or last-4
    account_type TEXT NOT NULL DEFAULT 'checking'
        CHECK (account_type IN ('checking', 'savings', 'cash', 'credit_card', 'loan', 'other')),
    current_balance DECIMAL(14,2) DEFAULT 0,
    is_primary BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    routing_number TEXT,
    zelle_email TEXT,
    zelle_phone TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_bank_accounts_type ON capital_bank_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_capital_bank_accounts_active ON capital_bank_accounts(is_active);

-- Trigger
DROP TRIGGER IF EXISTS trigger_capital_bank_accounts_updated ON capital_bank_accounts;
CREATE TRIGGER trigger_capital_bank_accounts_updated
    BEFORE UPDATE ON capital_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- =============================================================================
-- 4. ADD bank_account_id TO CAPITAL TRANSACTIONS
--    Link transactions to a specific bank/cash account.
-- =============================================================================
ALTER TABLE capital_transactions
ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES capital_bank_accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capital_transactions_bank ON capital_transactions(bank_account_id);

