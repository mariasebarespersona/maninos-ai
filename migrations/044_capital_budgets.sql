-- ============================================================================
-- Migration 044: Capital Budgets (Presupuestos)
-- Budget tracking for Maninos Capital LLC accounting.
-- Same structure as accounting_budgets but for Capital accounts.
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_budgets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    account_id UUID REFERENCES capital_accounts(id),

    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL,

    budgeted_amount DECIMAL(14,2) NOT NULL DEFAULT 0,

    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(account_id, period_month, period_year)
);

CREATE INDEX IF NOT EXISTS idx_capital_budgets_account ON capital_budgets(account_id);
CREATE INDEX IF NOT EXISTS idx_capital_budgets_period ON capital_budgets(period_year, period_month);

-- Trigger
DROP TRIGGER IF EXISTS trigger_capital_budgets_updated ON capital_budgets;
CREATE TRIGGER trigger_capital_budgets_updated
    BEFORE UPDATE ON capital_budgets
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- RLS
ALTER TABLE capital_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Auth users capital_budgets" ON capital_budgets FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Service role capital_budgets" ON capital_budgets FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

