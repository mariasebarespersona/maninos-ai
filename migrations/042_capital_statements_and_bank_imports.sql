-- ============================================================================
-- Migration 042: Capital Financial Statements + Bank Statement Imports
-- ============================================================================
-- 1) Add report_section to capital_accounts (balance_sheet vs profit_loss)
-- 2) Seed chart of accounts from Maninos Capital QuickBooks data
-- 3) Create capital_bank_statements + capital_statement_movements tables
-- ============================================================================


-- ============================================================================
-- 1. ADD report_section TO capital_accounts
-- ============================================================================
ALTER TABLE capital_accounts
ADD COLUMN IF NOT EXISTS report_section TEXT DEFAULT 'balance_sheet'
    CHECK (report_section IN ('balance_sheet', 'profit_loss'));

-- Set report_section based on account_type for any existing rows
-- NOTE: Cannot use IS NULL because DEFAULT already fills the value on ADD COLUMN
UPDATE capital_accounts SET report_section = 'balance_sheet'
WHERE account_type IN ('asset', 'liability', 'equity');
UPDATE capital_accounts SET report_section = 'profit_loss'
WHERE account_type IN ('income', 'expense', 'cogs');


-- ============================================================================
-- 2. SEED CHART OF ACCOUNTS FROM QUICKBOOKS IMAGES
--    Using ON CONFLICT (code) DO NOTHING so we don't break existing data.
-- ============================================================================

-- ── ASSETS (Balance Sheet) ──────────────────────────────────────────────

-- Top-level header: Assets
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('1000', 'Assets', 'asset', 'general', true, 'balance_sheet', 100)
ON CONFLICT (code) DO NOTHING;

-- Current Assets header
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1001', 'Current Assets', 'asset', 'general', true, 'balance_sheet', 110,
  (SELECT id FROM capital_accounts WHERE code = '1000'))
ON CONFLICT (code) DO NOTHING;

-- Bank Accounts header
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1010', 'Bank Accounts', 'asset', 'bank', true, 'balance_sheet', 120,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

-- 10100 Bank and Cash Equivalents (header)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10100', 'Bank and Cash Equivalents', 'asset', 'bank', true, 'balance_sheet', 130,
  (SELECT id FROM capital_accounts WHERE code = '1010'))
ON CONFLICT (code) DO NOTHING;

-- Detail bank accounts
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10110', 'BANK OF AMERICA', 'asset', 'bank', false, 'balance_sheet', 131,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10120', 'BOA CAPITAL 9197', 'asset', 'bank', false, 'balance_sheet', 132,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10130', 'Cash', 'asset', 'bank', false, 'balance_sheet', 133,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10140', 'MONEX BANK', 'asset', 'bank', false, 'balance_sheet', 134,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10150', 'PNC', 'asset', 'bank', false, 'balance_sheet', 135,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

-- Accounts Receivable header
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1200', 'Accounts Receivable', 'asset', 'receivable', true, 'balance_sheet', 140,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('12000', 'Accounts Receivable (A/R)', 'asset', 'receivable', false, 'balance_sheet', 141,
  (SELECT id FROM capital_accounts WHERE code = '1200'))
ON CONFLICT (code) DO NOTHING;

-- Other Current Assets header
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1400', 'Other Current Assets', 'asset', 'general', true, 'balance_sheet', 150,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

-- 14100 Loans to others (header)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14100', 'Loans to others', 'asset', 'general', true, 'balance_sheet', 160,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14110', 'Dallas Opening Costs', 'asset', 'general', false, 'balance_sheet', 161,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14120', 'Loan to Gabriel Cantu', 'asset', 'general', false, 'balance_sheet', 162,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14130', 'SGZ', 'asset', 'general', false, 'balance_sheet', 163,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

-- 14200 Loan to Related Parties (header)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14200', 'Loan to Related Parties', 'asset', 'general', true, 'balance_sheet', 170,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14210', 'Maninos Homes', 'asset', 'general', false, 'balance_sheet', 171,
  (SELECT id FROM capital_accounts WHERE code = '14200'))
ON CONFLICT (code) DO NOTHING;


-- ── LIABILITIES (Balance Sheet) ─────────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('2000', 'Liabilities', 'liability', 'general', true, 'balance_sheet', 200)
ON CONFLICT (code) DO NOTHING;

-- Current Liabilities
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2001', 'Current Liabilities', 'liability', 'general', true, 'balance_sheet', 210,
  (SELECT id FROM capital_accounts WHERE code = '2000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2200', 'Other Current Liabilities', 'liability', 'general', true, 'balance_sheet', 220,
  (SELECT id FROM capital_accounts WHERE code = '2001'))
ON CONFLICT (code) DO NOTHING;

-- 22000 Loan from Related Parties
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22000', 'Loan from Related Parties', 'liability', 'general', true, 'balance_sheet', 230,
  (SELECT id FROM capital_accounts WHERE code = '2200'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22010', 'Maninos Homes', 'liability', 'general', false, 'balance_sheet', 231,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22020', 'Para Transferir A Maninos Homes', 'liability', 'general', false, 'balance_sheet', 232,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22030', 'SGZ', 'liability', 'general', false, 'balance_sheet', 233,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22040', 'Monex - La Agustedad', 'liability', 'general', false, 'balance_sheet', 234,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22050', 'La Agustedad - Cofine Loan', 'liability', 'general', false, 'balance_sheet', 235,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

-- Long-term Liabilities
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2300', 'Long-term Liabilities', 'liability', 'general', true, 'balance_sheet', 240,
  (SELECT id FROM capital_accounts WHERE code = '2000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23000', 'Debt Securities', 'liability', 'general', true, 'balance_sheet', 250,
  (SELECT id FROM capital_accounts WHERE code = '2300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23100', 'VALTO 2', 'liability', 'general', false, 'balance_sheet', 251,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23200', 'VALTO #4 (7)', 'liability', 'general', false, 'balance_sheet', 252,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23300', 'VALTO 5 (8/9)', 'liability', 'general', false, 'balance_sheet', 253,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;


-- ── EQUITY (Balance Sheet) ──────────────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('3000', 'Equity', 'equity', 'general', true, 'balance_sheet', 300)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('34000', 'Opening balance equity', 'equity', 'general', false, 'balance_sheet', 310,
  (SELECT id FROM capital_accounts WHERE code = '3000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('35000', 'Retained Earnings', 'equity', 'general', false, 'balance_sheet', 320,
  (SELECT id FROM capital_accounts WHERE code = '3000'))
ON CONFLICT (code) DO NOTHING;


-- ── INCOME (Profit & Loss) ──────────────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('4000', 'Income', 'income', 'general', true, 'profit_loss', 400)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('40000', 'Operating Income', 'income', 'general', true, 'profit_loss', 410,
  (SELECT id FROM capital_accounts WHERE code = '4000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('44000', 'Interest earned', 'income', 'general', false, 'profit_loss', 420,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;


-- ── EXPENSES (Profit & Loss) ────────────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('6000', 'Expenses', 'expense', 'general', true, 'profit_loss', 500)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60000', 'General and Administrative Business Expenses', 'expense', 'general', true, 'profit_loss', 510,
  (SELECT id FROM capital_accounts WHERE code = '6000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60100', 'Commissions & fees', 'expense', 'general', false, 'profit_loss', 520,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60300', 'Legal & accounting services', 'expense', 'general', true, 'profit_loss', 530,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60330', 'Consulting Services', 'expense', 'general', false, 'profit_loss', 531,
  (SELECT id FROM capital_accounts WHERE code = '60300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60340', 'Representation Expenses', 'expense', 'general', false, 'profit_loss', 532,
  (SELECT id FROM capital_accounts WHERE code = '60300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60500', 'Office expenses', 'expense', 'general', false, 'profit_loss', 540,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;


-- ── OTHER INCOME (Profit & Loss) ────────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('7000', 'Other Income', 'income', 'other', true, 'profit_loss', 600)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('70000', 'OTHER INCOME', 'income', 'other', false, 'profit_loss', 610,
  (SELECT id FROM capital_accounts WHERE code = '7000'))
ON CONFLICT (code) DO NOTHING;


-- ── OTHER EXPENSES (Profit & Loss) ──────────────────────────────────────

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('7100', 'Other Expenses', 'expense', 'other', true, 'profit_loss', 700)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('71000', 'Other Business Expenses', 'expense', 'other', true, 'profit_loss', 710,
  (SELECT id FROM capital_accounts WHERE code = '7100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('71400', 'Interest paid', 'expense', 'other', false, 'profit_loss', 720,
  (SELECT id FROM capital_accounts WHERE code = '71000'))
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- 3. CAPITAL BANK STATEMENTS (for bank statement imports)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_bank_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Which bank account this statement belongs to
    bank_account_id UUID REFERENCES capital_bank_accounts(id) ON DELETE SET NULL,
    account_label TEXT NOT NULL,

    -- File info
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'csv')),
    storage_path TEXT,
    file_url TEXT,

    -- Statement metadata (extracted from the document)
    bank_name TEXT,
    account_number_last4 TEXT,
    statement_period_start DATE,
    statement_period_end DATE,
    beginning_balance DECIMAL(14,2),
    ending_balance DECIMAL(14,2),

    -- Processing status
    status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded', 'parsing', 'parsed', 'review', 'partial', 'completed', 'error'
    )),
    error_message TEXT,

    -- Extracted content
    raw_extracted_text TEXT,
    total_movements INT DEFAULT 0,
    classified_movements INT DEFAULT 0,
    posted_movements INT DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_bank_stmts_bank ON capital_bank_statements(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_capital_bank_stmts_status ON capital_bank_statements(status);

DROP TRIGGER IF EXISTS trigger_capital_bank_stmts_updated ON capital_bank_statements;
CREATE TRIGGER trigger_capital_bank_stmts_updated
    BEFORE UPDATE ON capital_bank_statements
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();


-- ============================================================================
-- 4. CAPITAL STATEMENT MOVEMENTS (parsed movements from bank statements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_statement_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    statement_id UUID NOT NULL REFERENCES capital_bank_statements(id) ON DELETE CASCADE,

    -- Movement data (extracted from file)
    movement_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    is_credit BOOLEAN DEFAULT true,
    reference TEXT,
    payment_method TEXT,
    counterparty TEXT,
    sort_order INT DEFAULT 0,

    -- AI classification
    suggested_account_id UUID REFERENCES capital_accounts(id) ON DELETE SET NULL,
    suggested_account_code TEXT,
    suggested_account_name TEXT,
    suggested_transaction_type TEXT,
    ai_confidence DECIMAL(3,2) DEFAULT 0,
    ai_reasoning TEXT,
    needs_subcategory BOOLEAN DEFAULT false,

    -- Final (accountant-confirmed) classification
    final_account_id UUID REFERENCES capital_accounts(id) ON DELETE SET NULL,
    final_transaction_type TEXT,
    final_notes TEXT,

    -- Linking to capital_transactions after posting
    transaction_id UUID REFERENCES capital_transactions(id) ON DELETE SET NULL,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'suggested', 'confirmed', 'posted', 'skipped'
    )),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_stmt_mvs_stmt ON capital_statement_movements(statement_id);
CREATE INDEX IF NOT EXISTS idx_capital_stmt_mvs_status ON capital_statement_movements(status);
CREATE INDEX IF NOT EXISTS idx_capital_stmt_mvs_date ON capital_statement_movements(movement_date);

DROP TRIGGER IF EXISTS trigger_capital_stmt_mvs_updated ON capital_statement_movements;
CREATE TRIGGER trigger_capital_stmt_mvs_updated
    BEFORE UPDATE ON capital_statement_movements
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

