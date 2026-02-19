-- ============================================================================
-- Migration 043: Saved Financial Statements (Balance Sheet & P&L snapshots)
-- ============================================================================
-- Allows users to save/snapshot financial reports after bank movements are posted.
-- Works for both Capital and Homes portals.
-- ============================================================================

CREATE TABLE IF NOT EXISTS saved_financial_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Portal: 'capital' or 'homes'
    portal TEXT NOT NULL CHECK (portal IN ('capital', 'homes')),

    -- Report type: 'balance_sheet' or 'profit_loss'
    report_type TEXT NOT NULL CHECK (report_type IN ('balance_sheet', 'profit_loss')),

    -- Human-readable name (e.g., "Balance Sheet - February 2026", "P&L Q1 2026")
    name TEXT NOT NULL,

    -- Period info
    as_of_date DATE,                         -- For balance sheets
    period_start DATE,                       -- For P&L
    period_end DATE,                         -- For P&L

    -- The full report data (JSON snapshot — frozen at save time)
    report_data JSONB NOT NULL,

    -- Summary totals for quick display without parsing full JSON
    total_assets DECIMAL(14,2),
    total_liabilities DECIMAL(14,2),
    total_equity DECIMAL(14,2),
    total_income DECIMAL(14,2),
    total_expenses DECIMAL(14,2),
    net_income DECIMAL(14,2),

    -- Metadata
    notes TEXT,
    saved_by TEXT,                            -- Employee name or ID
    status TEXT NOT NULL DEFAULT 'saved'
        CHECK (status IN ('saved', 'final', 'archived')),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_saved_fin_stmts_portal ON saved_financial_statements(portal);
CREATE INDEX IF NOT EXISTS idx_saved_fin_stmts_type ON saved_financial_statements(report_type);
CREATE INDEX IF NOT EXISTS idx_saved_fin_stmts_portal_type ON saved_financial_statements(portal, report_type);
CREATE INDEX IF NOT EXISTS idx_saved_fin_stmts_created ON saved_financial_statements(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_fin_stmts_status ON saved_financial_statements(status);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS trigger_saved_fin_stmts_updated ON saved_financial_statements;
CREATE TRIGGER trigger_saved_fin_stmts_updated
    BEFORE UPDATE ON saved_financial_statements
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

