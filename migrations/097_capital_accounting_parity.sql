-- ============================================================================
-- Migration 097: Capital accounting parity with Homes
-- ============================================================================
-- Brings Maninos Capital's accounting to the same level as Maninos Homes:
--   1. capital_transactions gains double-entry support columns
--      (transaction_number, entity_type/entity_id, counterparty_type,
--      reconciled_at) and a wider transaction_type CHECK.
--   2. New tables mirroring Homes:
--        capital_invoices            (≙ accounting_invoices)
--        capital_invoice_payments    (≙ accounting_invoice_payments)
--        capital_payment_orders      (≙ payment_orders)
--        capital_recurring_expenses  (≙ recurring_expenses)
--        capital_audit_log           (≙ accounting_audit_log)
--        capital_receipts            (≙ receipts)
--   3. Missing chart accounts the ledger engine needs (A/P, RTO income
--      accounts, RTO properties asset, investor notes payable, bank fees).
--   4. RLS enabled on all new tables (same pattern as migration 095: RLS on,
--      zero policies — service_role bypasses, browser gets nothing).
--
-- ⚠️ PREREQUISITE: run migration 042 FIRST (idempotent) — it seeds the
--    Capital chart of accounts, which is currently empty in production.
--
-- Idempotent: safe to re-run.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. capital_transactions — double-entry support
-- ============================================================================

ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS transaction_number TEXT;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS entity_type TEXT;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS entity_id UUID;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS counterparty_type TEXT;
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS reconciled_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS uq_capital_transactions_number
    ON capital_transactions(transaction_number)
    WHERE transaction_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_capital_transactions_entity
    ON capital_transactions(entity_type, entity_id);

-- Wider transaction_type CHECK: original 14 types + ledger-engine types
ALTER TABLE capital_transactions
    DROP CONSTRAINT IF EXISTS capital_transactions_transaction_type_check;
ALTER TABLE capital_transactions
    ADD CONSTRAINT capital_transactions_transaction_type_check
    CHECK (transaction_type IN (
        'rto_payment', 'down_payment', 'late_fee',
        'acquisition', 'investor_deposit', 'investor_return',
        'commission', 'insurance', 'tax', 'operating_expense',
        'transfer', 'adjustment', 'other_income', 'other_expense',
        -- added by 097 (ledger engine / invoicing / transfers)
        'invoice_ar', 'invoice_ap', 'bank_transfer',
        'opening_balance', 'bank_fee'
    ));

-- ============================================================================
-- 2. capital_invoices (mirror of accounting_invoices)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_number TEXT UNIQUE NOT NULL,     -- FAC-YYMMDD-NNN / BILL-YYMMDD-NNN
    direction TEXT NOT NULL CHECK (direction IN ('receivable', 'payable')),

    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,

    counterparty_name TEXT NOT NULL,
    counterparty_type TEXT,                  -- 'client', 'investor', 'vendor', 'homes'
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,

    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    rto_contract_id UUID REFERENCES rto_contracts(id) ON DELETE SET NULL,
    rto_payment_id UUID REFERENCES rto_payments(id) ON DELETE SET NULL,

    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(14,2) DEFAULT 0,
    balance_due DECIMAL(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,

    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'sent', 'partial', 'paid', 'overdue', 'voided'
    )),

    description TEXT,
    line_items JSONB DEFAULT '[]'::jsonb,
    notes TEXT,
    payment_terms TEXT,

    created_by TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_invoices_direction ON capital_invoices(direction);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_status ON capital_invoices(status);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_due_date ON capital_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_client ON capital_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_investor ON capital_invoices(investor_id);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_contract ON capital_invoices(rto_contract_id);
CREATE INDEX IF NOT EXISTS idx_capital_invoices_rto_payment ON capital_invoices(rto_payment_id);

DROP TRIGGER IF EXISTS trg_capital_invoices_updated ON capital_invoices;
CREATE TRIGGER trg_capital_invoices_updated
    BEFORE UPDATE ON capital_invoices
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 3. capital_invoice_payments (mirror of accounting_invoice_payments)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_invoice_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    invoice_id UUID NOT NULL REFERENCES capital_invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES capital_transactions(id) ON DELETE SET NULL,

    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(14,2) NOT NULL,
    payment_method TEXT,
    payment_reference TEXT,
    notes TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_invoice_payments_invoice
    ON capital_invoice_payments(invoice_id);

-- ============================================================================
-- 4. capital_payment_orders (mirror of payment_orders, Capital-flavored)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_payment_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Linked entities (Capital world)
    investor_id UUID REFERENCES investors(id) ON DELETE SET NULL,
    promissory_note_id UUID REFERENCES promissory_notes(id) ON DELETE SET NULL,
    rto_contract_id UUID REFERENCES rto_contracts(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,

    created_by TEXT,

    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'completed', 'cancelled')),

    direction TEXT NOT NULL DEFAULT 'outbound'
        CHECK (direction IN ('outbound', 'inbound')),

    concept TEXT NOT NULL DEFAULT 'otro'
        CHECK (concept IN (
            -- outbound
            'retorno_inversionista', 'pago_nota', 'gasto_operativo',
            'comision', 'seguro', 'impuesto', 'adquisicion', 'otro',
            -- inbound
            'pago_rto', 'enganche', 'deposito_inversionista', 'otro_ingreso'
        )),

    -- Payee snapshot (denormalized so the order is self-contained)
    payee_name TEXT NOT NULL,
    bank_name TEXT,
    routing_number TEXT,
    account_number TEXT,
    routing_number_last4 TEXT,
    account_number_last4 TEXT,
    account_type TEXT DEFAULT 'checking',
    payee_address TEXT,
    bank_address TEXT,

    amount NUMERIC(12, 2) NOT NULL,
    method TEXT NOT NULL DEFAULT 'transferencia',
    reference TEXT,
    payment_date DATE,

    -- Accounting bridge
    accounting_transaction_id UUID,
    bank_account_id UUID REFERENCES capital_bank_accounts(id) ON DELETE SET NULL,
    expense_account_code TEXT,   -- optional chart code override for 'otro'/'gasto_operativo'

    notes TEXT,
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    completed_by TEXT,
    completed_at TIMESTAMPTZ,
    cancelled_by TEXT,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capital_payment_orders_status ON capital_payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_capital_payment_orders_investor ON capital_payment_orders(investor_id);

DROP TRIGGER IF EXISTS trg_capital_payment_orders_updated ON capital_payment_orders;
CREATE TRIGGER trg_capital_payment_orders_updated
    BEFORE UPDATE ON capital_payment_orders
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 5. capital_recurring_expenses (mirror of recurring_expenses)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_recurring_expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    name TEXT NOT NULL,
    amount DECIMAL(14,2) NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'monthly'
        CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),

    account_id UUID REFERENCES capital_accounts(id) ON DELETE SET NULL,
    bank_account_id UUID REFERENCES capital_bank_accounts(id) ON DELETE SET NULL,

    counterparty_name TEXT,
    description TEXT,
    next_due_date DATE,
    is_active BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_capital_recurring_updated ON capital_recurring_expenses;
CREATE TRIGGER trg_capital_recurring_updated
    BEFORE UPDATE ON capital_recurring_expenses
    FOR EACH ROW EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- 6. capital_audit_log (mirror of accounting_audit_log, wider action CHECK)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    table_name TEXT NOT NULL,
    record_id UUID NOT NULL,
    action TEXT NOT NULL CHECK (action IN (
        'create', 'update', 'delete', 'void', 'reconcile',
        'approve', 'complete', 'cancel', 'auto_paid_from_statement'
    )),

    changes JSONB,
    description TEXT,

    user_id UUID REFERENCES users(id),
    user_email TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_audit_table ON capital_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_capital_audit_date ON capital_audit_log(created_at);

-- ============================================================================
-- 7. capital_receipts (mirror of receipts)
-- ============================================================================

CREATE TABLE IF NOT EXISTS capital_receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    transaction_id UUID REFERENCES capital_transactions(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES capital_invoices(id) ON DELETE CASCADE,

    file_url TEXT NOT NULL,
    storage_path TEXT,
    file_type TEXT,
    original_filename TEXT,

    vendor_name TEXT,
    amount DECIMAL(14,2),
    receipt_date DATE,
    description TEXT,
    notes TEXT,
    uploaded_by TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_capital_receipts_txn ON capital_receipts(transaction_id);

-- ============================================================================
-- 8. Missing chart accounts (the 042 seed lacks these; the ledger engine
--    and the type→account mapping need them)
-- ============================================================================

-- Accounts Payable (A/P) — liability, under Current Liabilities
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('21000', 'Accounts Payable (A/P)', 'liability', 'payable', false, 'balance_sheet', 205,
  (SELECT id FROM capital_accounts WHERE code = '2001'))
ON CONFLICT (code) DO NOTHING;

-- RTO income accounts — under Operating Income (40000)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('41000', 'RTO Rental Income', 'income', 'rto', false, 'profit_loss', 405,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('42000', 'Down Payment Income', 'income', 'rto', false, 'profit_loss', 406,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('43000', 'Late Fee Income', 'income', 'rto', false, 'profit_loss', 407,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

-- RTO properties held — asset, under Other Current Assets (1400).
-- (Acquisitions were mapped to header 14100 before; headers must not
--  receive postings.)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14300', 'RTO Properties', 'asset', 'inventory', false, 'balance_sheet', 165,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

-- Investor notes payable — default posting account for investor deposits /
-- returns, under Debt Securities (23000). Specific VALTO accounts stay for
-- manual classification.
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23900', 'Investor Notes Payable', 'liability', 'investor_debt', false, 'balance_sheet', 245,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

-- Bank fees — expense, under G&A (60000)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60600', 'Bank fees & service charges', 'expense', 'general', false, 'profit_loss', 612,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

-- General operating expenses bucket (postable; 60000 is a header)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60900', 'Operating Expenses (General)', 'expense', 'general', false, 'profit_loss', 615,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 9. RLS on new tables (pattern of migration 095: enabled, zero policies)
-- ============================================================================

ALTER TABLE capital_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_payment_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE capital_receipts ENABLE ROW LEVEL SECURITY;

COMMIT;
