-- ============================================================================
-- Migration 029: Bank Statements Import & AI-Assisted Classification
-- ============================================================================
-- Stores uploaded bank statements (PDF/PNG/Excel) and their parsed movements.
-- AI suggests accounting accounts; the accountant confirms before posting.
-- ============================================================================

-- ============================================================================
-- 1. BANK STATEMENTS (uploaded files)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_statements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Which account this statement belongs to
    account_key TEXT NOT NULL CHECK (account_key IN (
        'conroe', 'houston', 'dallas', 'cash'
    )),
    account_label TEXT NOT NULL,          -- "Cuenta Conroe", "Cuenta Houston", etc.

    -- File info
    original_filename TEXT NOT NULL,
    file_type TEXT NOT NULL CHECK (file_type IN ('pdf', 'png', 'jpg', 'jpeg', 'xlsx', 'xls', 'csv')),
    storage_path TEXT,                    -- Supabase Storage path
    file_url TEXT,                        -- Public URL

    -- Statement metadata (extracted from the document)
    bank_name TEXT,                       -- e.g., "Bank of America"
    account_number_last4 TEXT,            -- e.g., "9164"
    statement_period_start DATE,
    statement_period_end DATE,
    beginning_balance DECIMAL(14,2),
    ending_balance DECIMAL(14,2),

    -- Processing status
    status TEXT DEFAULT 'uploaded' CHECK (status IN (
        'uploaded',       -- File uploaded, not yet parsed
        'parsing',        -- AI is extracting movements
        'parsed',         -- Movements extracted, awaiting classification
        'classifying',    -- AI is suggesting accounts
        'review',         -- Ready for accountant review
        'partial',        -- Some movements confirmed, some pending
        'completed',      -- All movements classified and posted
        'error'           -- Processing failed
    )),
    error_message TEXT,
    
    -- Raw extracted text (for reference/debugging)
    raw_extracted_text TEXT,

    -- Stats
    total_movements INTEGER DEFAULT 0,
    classified_movements INTEGER DEFAULT 0,
    posted_movements INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES auth.users(id)
);

-- ============================================================================
-- 2. STATEMENT MOVEMENTS (parsed from statements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS statement_movements (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    statement_id UUID NOT NULL REFERENCES bank_statements(id) ON DELETE CASCADE,

    -- Movement data (extracted from statement)
    movement_date DATE NOT NULL,
    description TEXT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,          -- Positive = deposit/credit, Negative = withdrawal/debit
    is_credit BOOLEAN NOT NULL,             -- true = money in, false = money out
    reference TEXT,                          -- Check #, Conf #, Wire TRN, etc.
    payment_method TEXT,                     -- zelle, wire, check, card, ach, transfer, other
    counterparty TEXT,                       -- Extracted name of the other party

    -- AI-suggested classification
    suggested_account_id UUID REFERENCES accounting_accounts(id),
    suggested_account_code TEXT,
    suggested_account_name TEXT,
    suggested_transaction_type TEXT,         -- From accounting_transactions types
    ai_confidence DECIMAL(3,2),             -- 0.00 to 1.00
    ai_reasoning TEXT,                      -- Why the AI suggested this account
    needs_subcategory BOOLEAN DEFAULT FALSE, -- AI flagged that subcategory is needed

    -- Accountant's final classification
    final_account_id UUID REFERENCES accounting_accounts(id),
    final_transaction_type TEXT,
    final_notes TEXT,

    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending',        -- Awaiting classification
        'suggested',      -- AI has suggested an account
        'confirmed',      -- Accountant confirmed the classification
        'posted',         -- Transaction created in accounting_transactions
        'skipped',        -- Accountant decided to skip this movement
        'duplicate'       -- Detected as duplicate of existing transaction
    )),

    -- Link to created transaction (after posting)
    transaction_id UUID REFERENCES accounting_transactions(id),

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_bank_statements_account_key ON bank_statements(account_key);
CREATE INDEX IF NOT EXISTS idx_bank_statements_status ON bank_statements(status);
CREATE INDEX IF NOT EXISTS idx_bank_statements_period ON bank_statements(statement_period_start, statement_period_end);

CREATE INDEX IF NOT EXISTS idx_statement_movements_statement ON statement_movements(statement_id);
CREATE INDEX IF NOT EXISTS idx_statement_movements_status ON statement_movements(status);
CREATE INDEX IF NOT EXISTS idx_statement_movements_date ON statement_movements(movement_date);

-- ============================================================================
-- 4. RLS POLICIES
-- ============================================================================

ALTER TABLE bank_statements ENABLE ROW LEVEL SECURITY;
ALTER TABLE statement_movements ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users (internal portal)
CREATE POLICY "bank_statements_all" ON bank_statements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "statement_movements_all" ON statement_movements FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 5. UPDATED_AT TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_bank_statements_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bank_statements_updated
    BEFORE UPDATE ON bank_statements
    FOR EACH ROW EXECUTE FUNCTION update_bank_statements_updated_at();

CREATE OR REPLACE FUNCTION update_statement_movements_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_statement_movements_updated
    BEFORE UPDATE ON statement_movements
    FOR EACH ROW EXECUTE FUNCTION update_statement_movements_updated_at();

