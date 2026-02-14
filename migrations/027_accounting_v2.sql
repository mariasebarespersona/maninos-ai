-- ============================================================================
-- Migration 027: Accounting V2 — Full AppFolio-level features
-- ============================================================================
-- Adds:
--   - Invoices (facturas) for AR/AP
--   - Audit log for all accounting changes
--   - Additional seed accounts (AR, AP)
-- ============================================================================

-- ============================================================================
-- 1. INVOICES / BILLS (Facturas)
-- ============================================================================
-- Used for both:
--   Accounts Receivable (AR): invoices TO clients (sale invoices)
--   Accounts Payable (AP): bills FROM vendors (contractor bills, seller payments)

CREATE TABLE IF NOT EXISTS accounting_invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Identity
    invoice_number TEXT UNIQUE NOT NULL,    -- INV-YYMMDD-NNN or BILL-YYMMDD-NNN
    direction TEXT NOT NULL CHECK (direction IN ('receivable', 'payable')),
        -- 'receivable' = client owes us (AR)
        -- 'payable'    = we owe vendor (AP)
    
    -- Dates
    issue_date DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date DATE,
    
    -- Parties
    counterparty_name TEXT NOT NULL,        -- Client name or Vendor name
    counterparty_type TEXT,                 -- 'client', 'seller', 'contractor', 'capital'
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    
    -- Linked entities
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
    yard_id UUID REFERENCES yards(id),
    
    -- Amounts
    subtotal DECIMAL(14,2) NOT NULL DEFAULT 0,
    tax_amount DECIMAL(14,2) DEFAULT 0,
    total_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    amount_paid DECIMAL(14,2) DEFAULT 0,
    balance_due DECIMAL(14,2) GENERATED ALWAYS AS (total_amount - amount_paid) STORED,
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'sent', 'partial', 'paid', 'overdue', 'voided'
    )),
    
    -- Details
    description TEXT,
    line_items JSONB DEFAULT '[]'::jsonb,
        -- [{description, quantity, unit_price, amount}]
    
    notes TEXT,
    
    -- Payment
    payment_terms TEXT,                     -- "Net 30", "Due on receipt", etc.
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. INVOICE PAYMENTS (Pagos de Facturas)
-- ============================================================================
-- Track partial or full payments against invoices

CREATE TABLE IF NOT EXISTS accounting_invoice_payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    invoice_id UUID NOT NULL REFERENCES accounting_invoices(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES accounting_transactions(id) ON DELETE SET NULL,
    
    payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
    amount DECIMAL(14,2) NOT NULL,
    payment_method TEXT,
    payment_reference TEXT,
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. AUDIT LOG (Registro de Auditoría)
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounting_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What changed
    table_name TEXT NOT NULL,              -- 'accounting_transactions', 'accounting_invoices', etc.
    record_id UUID NOT NULL,               -- ID of the changed record
    action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'void', 'reconcile')),
    
    -- Changes detail
    changes JSONB,                         -- {"field": {"old": ..., "new": ...}}
    description TEXT,                      -- Human-readable description
    
    -- Who
    user_id UUID REFERENCES users(id),
    user_email TEXT,
    
    -- When
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invoices_direction ON accounting_invoices(direction);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON accounting_invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON accounting_invoices(due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_client ON accounting_invoices(client_id);
CREATE INDEX IF NOT EXISTS idx_invoices_property ON accounting_invoices(property_id);
CREATE INDEX IF NOT EXISTS idx_invoice_payments_invoice ON accounting_invoice_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_audit_table ON accounting_audit_log(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_date ON accounting_audit_log(created_at);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE TRIGGER trg_invoices_updated_at
    BEFORE UPDATE ON accounting_invoices
    FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- ============================================================================
-- ADDITIONAL SEED ACCOUNTS
-- ============================================================================

INSERT INTO accounting_accounts (code, name, description, account_type, category, is_system) VALUES
-- ASSETS
('ACT-300', 'Cuentas por Cobrar', 'Dinero que nos deben los clientes', 'asset', 'cuentas_por_cobrar', true),

-- LIABILITIES  
('PAS-200', 'Depósitos de Clientes', 'Depósitos recibidos pendientes de aplicar', 'liability', 'depositos_pendientes', true),

-- EXPENSES
('GAS-700', 'Seguros', 'Pólizas de seguro de propiedades y negocio', 'expense', 'seguros', true),
('GAS-800', 'Marketing / Publicidad', 'Gastos de marketing, anuncios, etc.', 'expense', 'marketing', true)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE accounting_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_invoice_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users accounting_invoices" ON accounting_invoices FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users accounting_invoice_payments" ON accounting_invoice_payments FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users accounting_audit_log" ON accounting_audit_log FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Service role accounting_invoices" ON accounting_invoices FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role accounting_invoice_payments" ON accounting_invoice_payments FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role accounting_audit_log" ON accounting_audit_log FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

