-- ============================================================================
-- Migration 026: Accounting System for Maninos Homes
-- ============================================================================
-- Full accounting system inspired by AppFolio:
--   - Chart of accounts (plan de cuentas)
--   - Financial transactions journal
--   - Bank accounts tracking
--   - Automatic categorization from existing data
--   - Sub-accounts by yard/location
-- ============================================================================

-- ============================================================================
-- 1. CHART OF ACCOUNTS (Plan de Cuentas)
-- ============================================================================
-- Hierarchical account structure: type → category → sub-account
-- Examples:
--   income/ventas_contado/conroe
--   expense/compras_casas/houston
--   expense/renovaciones/dallas

CREATE TABLE IF NOT EXISTS accounting_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Account identity
    code TEXT UNIQUE NOT NULL,           -- e.g., "ING-001", "GAS-001"
    name TEXT NOT NULL,                  -- e.g., "Ventas Contado"
    description TEXT,
    
    -- Hierarchy
    account_type TEXT NOT NULL CHECK (account_type IN (
        'income',     -- Ingresos
        'expense',    -- Gastos
        'asset',      -- Activos (bank accounts, inventory)
        'liability'   -- Pasivos (deudas, préstamos)
    )),
    category TEXT NOT NULL,              -- e.g., "ventas_contado", "compras_casas"
    parent_account_id UUID REFERENCES accounting_accounts(id),
    
    -- Location tracking
    yard_id UUID REFERENCES yards(id),  -- NULL = all yards
    
    -- Config
    is_active BOOLEAN DEFAULT true,
    is_system BOOLEAN DEFAULT false,     -- System accounts can't be deleted
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 2. BANK ACCOUNTS (Cuentas Bancarias)
-- ============================================================================

CREATE TABLE IF NOT EXISTS bank_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name TEXT NOT NULL,                  -- e.g., "Chase Business Checking"
    bank_name TEXT,                      -- e.g., "Chase"
    account_number_last4 TEXT,           -- Last 4 digits only (security)
    routing_number TEXT,                 -- For display to clients (Abigail's transfers)
    account_type TEXT DEFAULT 'checking' CHECK (account_type IN (
        'checking', 'savings', 'zelle', 'other'
    )),
    
    -- Balance tracking
    current_balance DECIMAL(14,2) DEFAULT 0,
    
    -- Config
    is_primary BOOLEAN DEFAULT false,    -- Primary account for operations
    is_active BOOLEAN DEFAULT true,
    currency TEXT DEFAULT 'USD',
    
    -- Zelle info (80% of payments are Zelle per memory)
    zelle_email TEXT,
    zelle_phone TEXT,                    -- 832-745-9600
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 3. FINANCIAL TRANSACTIONS (Diario Contable)
-- ============================================================================
-- Every money movement is recorded here.
-- Links back to the source entity (property, sale, renovation, etc.)

CREATE TABLE IF NOT EXISTS accounting_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Transaction identity
    transaction_number TEXT UNIQUE,      -- Auto-generated: TXN-YYMMDD-NNN
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Classification
    transaction_type TEXT NOT NULL CHECK (transaction_type IN (
        -- Income types
        'sale_cash',              -- Venta contado (client → Homes)
        'sale_rto_capital',       -- Capital paga a Homes por RTO
        'deposit_received',       -- Depósito inicial del cliente
        'other_income',           -- Otros ingresos
        
        -- Expense types
        'purchase_house',         -- Compra de casa (Homes → seller)
        'renovation',             -- Gasto de renovación
        'moving_transport',       -- Transporte/movida de casa
        'commission',             -- Comisión empleado
        'operating_expense',      -- Gastos operativos (renta yard, etc.)
        'other_expense',          -- Otros gastos
        
        -- Transfers
        'bank_transfer',          -- Transferencia entre cuentas
        'adjustment'              -- Ajuste contable
    )),
    
    -- Money flow
    amount DECIMAL(14,2) NOT NULL,
    is_income BOOLEAN NOT NULL,          -- true=entrada, false=salida
    
    -- Account mapping
    account_id UUID REFERENCES accounting_accounts(id),
    bank_account_id UUID REFERENCES bank_accounts(id),
    
    -- Source entity (polymorphic)
    entity_type TEXT,                    -- 'property', 'sale', 'renovation', 'commission'
    entity_id UUID,                      -- ID of the source record
    
    -- Location
    yard_id UUID REFERENCES yards(id),
    
    -- Payment details
    payment_method TEXT,                 -- transferencia, zelle, cheque, efectivo, stripe
    payment_reference TEXT,              -- Check #, Zelle conf, Stripe ID
    
    -- Parties
    counterparty_name TEXT,              -- Who paid / who received
    counterparty_type TEXT,              -- 'seller', 'client', 'contractor', 'employee', 'capital'
    
    -- Details
    description TEXT NOT NULL,
    notes TEXT,
    
    -- Property link (for per-property P&L)
    property_id UUID REFERENCES properties(id),
    
    -- Status
    status TEXT DEFAULT 'confirmed' CHECK (status IN (
        'pending', 'confirmed', 'reconciled', 'voided'
    )),
    
    -- Reconciliation
    reconciled_at TIMESTAMPTZ,
    reconciled_by UUID REFERENCES users(id),
    
    -- Audit
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 4. RECURRING EXPENSES (Gastos Recurrentes)
-- ============================================================================
-- For things like yard rent, insurance, utilities

CREATE TABLE IF NOT EXISTS recurring_expenses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    name TEXT NOT NULL,                  -- e.g., "Renta Yard Conroe"
    amount DECIMAL(12,2) NOT NULL,
    frequency TEXT NOT NULL CHECK (frequency IN ('weekly', 'biweekly', 'monthly', 'quarterly', 'yearly')),
    
    account_id UUID REFERENCES accounting_accounts(id),
    bank_account_id UUID REFERENCES bank_accounts(id),
    yard_id UUID REFERENCES yards(id),
    
    counterparty_name TEXT,
    description TEXT,
    
    -- Schedule
    next_due_date DATE,
    is_active BOOLEAN DEFAULT true,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 5. BUDGET (Presupuesto)
-- ============================================================================

CREATE TABLE IF NOT EXISTS accounting_budgets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    account_id UUID REFERENCES accounting_accounts(id),
    yard_id UUID REFERENCES yards(id),
    
    period_month INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
    period_year INTEGER NOT NULL,
    
    budgeted_amount DECIMAL(14,2) NOT NULL DEFAULT 0,
    
    notes TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(account_id, yard_id, period_month, period_year)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_acct_txn_date ON accounting_transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_acct_txn_type ON accounting_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_acct_txn_account ON accounting_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_bank ON accounting_transactions(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_property ON accounting_transactions(property_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_yard ON accounting_transactions(yard_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_entity ON accounting_transactions(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_acct_txn_status ON accounting_transactions(status);
CREATE INDEX IF NOT EXISTS idx_acct_accounts_type ON accounting_accounts(account_type);
CREATE INDEX IF NOT EXISTS idx_acct_accounts_category ON accounting_accounts(category);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_active ON bank_accounts(is_active);
CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_expenses(is_active);

-- ============================================================================
-- TRIGGERS
-- ============================================================================

CREATE OR REPLACE FUNCTION update_accounting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_acct_accounts_updated_at
    BEFORE UPDATE ON accounting_accounts
    FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

CREATE TRIGGER trg_acct_transactions_updated_at
    BEFORE UPDATE ON accounting_transactions
    FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

CREATE TRIGGER trg_bank_accounts_updated_at
    BEFORE UPDATE ON bank_accounts
    FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

CREATE TRIGGER trg_recurring_expenses_updated_at
    BEFORE UPDATE ON recurring_expenses
    FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- ============================================================================
-- SEED: Default Chart of Accounts for Maninos Homes
-- ============================================================================

INSERT INTO accounting_accounts (code, name, description, account_type, category, is_system) VALUES
-- INCOME
('ING-100', 'Ventas Contado', 'Ingresos por ventas al contado a clientes', 'income', 'ventas_contado', true),
('ING-200', 'Ventas Capital (RTO)', 'Pagos de Capital a Homes cuando Capital compra casa para RTO', 'income', 'ventas_capital', true),
('ING-300', 'Depósitos Recibidos', 'Depósitos iniciales de clientes', 'income', 'depositos', true),
('ING-900', 'Otros Ingresos', 'Otros ingresos no categorizados', 'income', 'otros_ingresos', true),

-- EXPENSES
('GAS-100', 'Compra de Casas', 'Pagos a vendedores por compra de propiedades', 'expense', 'compras_casas', true),
('GAS-200', 'Renovaciones', 'Gastos de remodelación y materiales', 'expense', 'renovaciones', true),
('GAS-300', 'Transporte / Movida', 'Costo de mover casas entre ubicaciones', 'expense', 'transporte', true),
('GAS-400', 'Comisiones Empleados', 'Comisiones por ventas ($1,500 contado / $1,000 RTO)', 'expense', 'comisiones', true),
('GAS-500', 'Gastos Operativos', 'Renta de yards, seguros, servicios, etc.', 'expense', 'operativos', true),
('GAS-600', 'Alineación', 'Alineación de casas en terreno', 'expense', 'alineacion', true),
('GAS-900', 'Otros Gastos', 'Gastos no categorizados', 'expense', 'otros_gastos', true),

-- ASSETS
('ACT-100', 'Banco Principal', 'Cuenta bancaria principal de operaciones', 'asset', 'banco', true),
('ACT-200', 'Inventario de Casas', 'Valor de casas en inventario (compradas, no vendidas)', 'asset', 'inventario', true),

-- LIABILITIES
('PAS-100', 'Cuentas por Pagar', 'Deudas pendientes con proveedores/vendedores', 'liability', 'cuentas_por_pagar', true)

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- RLS Policies
-- ============================================================================

ALTER TABLE accounting_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_budgets ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users
CREATE POLICY "Auth users accounting_accounts" ON accounting_accounts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users bank_accounts" ON bank_accounts FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users accounting_transactions" ON accounting_transactions FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users recurring_expenses" ON recurring_expenses FOR ALL USING (auth.role() = 'authenticated');
CREATE POLICY "Auth users accounting_budgets" ON accounting_budgets FOR ALL USING (auth.role() = 'authenticated');

-- Service role bypass
CREATE POLICY "Service role accounting_accounts" ON accounting_accounts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role bank_accounts" ON bank_accounts FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role accounting_transactions" ON accounting_transactions FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role recurring_expenses" ON recurring_expenses FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');
CREATE POLICY "Service role accounting_budgets" ON accounting_budgets FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

