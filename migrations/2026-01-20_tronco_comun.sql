-- ============================================================================
-- MIGRACIÓN: Tronco Común Maninos AI Platform
-- Fecha: 2026-01-20
-- Descripción: Tablas para los 6 macroprocesos de la Cadena de Valor
-- ============================================================================

-- ============================================================================
-- TABLA: clients (Proceso: INCORPORAR)
-- Campos basados en Anexo 1 - Solicitud de Crédito
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- INFORMACIÓN DEL SOLICITANTE (Anexo 1)
    full_name TEXT NOT NULL,
    date_of_birth DATE,
    ssn_itin TEXT,  -- Encrypted or masked in production
    marital_status TEXT CHECK (marital_status IN ('soltero', 'casado', 'otro')),
    phone TEXT,
    email TEXT,
    
    -- Dirección actual
    current_address TEXT,
    current_city TEXT,
    current_state TEXT,
    current_zip TEXT,
    residence_type TEXT CHECK (residence_type IN ('propia', 'rentada', 'otra')),
    
    -- INFORMACIÓN LABORAL
    employer_name TEXT,
    occupation TEXT,
    employer_address TEXT,
    employer_phone TEXT,
    monthly_income NUMERIC,
    employment_years INTEGER,
    employment_months INTEGER,
    has_other_income BOOLEAN DEFAULT FALSE,
    other_income_amount NUMERIC,
    
    -- INFORMACIÓN CRÉDITO SOLICITADO
    requested_amount NUMERIC,
    loan_purpose TEXT CHECK (loan_purpose IN ('compra_vivienda', 'remodelacion', 'otro')),
    desired_term_months INTEGER,
    preferred_payment_method TEXT CHECK (preferred_payment_method IN ('transferencia', 'cheque', 'otro')),
    
    -- REFERENCIAS PERSONALES (stored as JSONB for flexibility)
    personal_references JSONB DEFAULT '[]',
    -- Format: [{"name": "...", "phone": "...", "relationship": "..."}, ...]
    
    -- KYC & Verificación
    kyc_status TEXT DEFAULT 'pending' CHECK (kyc_status IN ('pending', 'verified', 'rejected')),
    kyc_verified_at TIMESTAMP,
    kyc_verified_by UUID,  -- Reference to employee who verified
    
    -- DTI (Debt-to-Income)
    dti_ratio NUMERIC,
    dti_calculated_at TIMESTAMP,
    prequalification_status TEXT CHECK (prequalification_status IN ('pending', 'approved', 'rejected')),
    
    -- Proceso
    process_stage TEXT DEFAULT 'datos_basicos' CHECK (process_stage IN (
        'datos_basicos', 'kyc_pending', 'kyc_verified', 'dti_calculated', 
        'prequalified', 'contract_pending', 'active', 'completed', 'rejected'
    )),
    
    -- Referidos
    referred_by_client_id UUID REFERENCES clients(id),
    referral_code TEXT UNIQUE,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID  -- Employee who created the client
);

-- Índices para clients
CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
CREATE INDEX IF NOT EXISTS idx_clients_phone ON clients(phone);
CREATE INDEX IF NOT EXISTS idx_clients_process_stage ON clients(process_stage);
CREATE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);
CREATE INDEX IF NOT EXISTS idx_clients_kyc_status ON clients(kyc_status);

-- ============================================================================
-- TABLA: investors (Proceso: FONDEAR)
-- ============================================================================
CREATE TABLE IF NOT EXISTS investors (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Información básica
    full_name TEXT NOT NULL,
    email TEXT UNIQUE,
    phone TEXT,
    
    -- Tipo de inversionista
    investor_type TEXT DEFAULT 'individual' CHECK (investor_type IN ('individual', 'entity', 'fund')),
    entity_name TEXT,  -- If investor_type = 'entity' or 'fund'
    
    -- Información financiera
    total_committed NUMERIC DEFAULT 0,  -- Monto total comprometido
    total_invested NUMERIC DEFAULT 0,   -- Monto actualmente invertido
    total_returned NUMERIC DEFAULT 0,   -- Monto total retornado (principal + intereses)
    
    -- Configuración
    preferred_rate NUMERIC,  -- Tasa preferida de retorno (%)
    preferred_term_months INTEGER,  -- Plazo preferido
    
    -- Estado
    status TEXT DEFAULT 'active' CHECK (status IN ('prospect', 'active', 'inactive', 'blocked')),
    
    -- Documentos (pagarés, contratos)
    documents JSONB DEFAULT '[]',
    -- Format: [{"type": "pagare", "url": "...", "signed_at": "..."}, ...]
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Índices para investors
CREATE INDEX IF NOT EXISTS idx_investors_email ON investors(email);
CREATE INDEX IF NOT EXISTS idx_investors_status ON investors(status);

-- ============================================================================
-- TABLA: rto_contracts (Proceso: INCORPORAR → GESTIONAR CARTERA)
-- Contratos Rent-to-Own basados en Anexo 3 (33 cláusulas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS rto_contracts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencias
    client_id UUID NOT NULL REFERENCES clients(id),
    property_id UUID NOT NULL REFERENCES properties(id),
    
    -- DATOS DEL CONTRATO (Anexo 3 - 33 cláusulas)
    -- Cláusula 1: REAL PROPERTY
    hud_number TEXT,
    property_year INTEGER,
    property_location TEXT,  -- Full address
    
    -- Cláusula 2: TERM
    lease_term_months INTEGER NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    
    -- Cláusula 3: RENT
    monthly_rent NUMERIC NOT NULL,
    payment_due_day INTEGER DEFAULT 15,
    late_fee_per_day NUMERIC DEFAULT 15,
    late_fee_grace_days INTEGER DEFAULT 5,
    nsf_fee NUMERIC DEFAULT 250,
    payment_method TEXT DEFAULT 'Zelle 832-745-9600',
    
    -- Cláusula 14: HOLD OVER
    holdover_rent NUMERIC DEFAULT 695,
    
    -- Cláusula 33: OPTION TO PURCHASE
    purchase_price NUMERIC NOT NULL,
    down_payment NUMERIC NOT NULL,
    closing_days INTEGER DEFAULT 21,
    
    -- Estado del contrato
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'pending_signature', 'active', 'completed', 
        'defaulted', 'cancelled', 'converted_to_purchase'
    )),
    
    -- Firmas
    signed_by_tenant_at TIMESTAMP,
    signed_by_landlord_at TIMESTAMP,
    
    -- PDF generado
    contract_pdf_url TEXT,
    contract_pdf_generated_at TIMESTAMP,
    
    -- Resumen financiero (calculado)
    total_rent_paid NUMERIC DEFAULT 0,
    total_late_fees_paid NUMERIC DEFAULT 0,
    months_paid INTEGER DEFAULT 0,
    months_remaining INTEGER,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by UUID,  -- Employee who created
    notes TEXT
);

-- Índices para rto_contracts
CREATE INDEX IF NOT EXISTS idx_rto_contracts_client_id ON rto_contracts(client_id);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_property_id ON rto_contracts(property_id);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_status ON rto_contracts(status);
CREATE INDEX IF NOT EXISTS idx_rto_contracts_end_date ON rto_contracts(end_date);

-- ============================================================================
-- TABLA: payments (Proceso: GESTIONAR CARTERA)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencias
    rto_contract_id UUID NOT NULL REFERENCES rto_contracts(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Detalles del pago
    amount NUMERIC NOT NULL,
    payment_type TEXT DEFAULT 'rent' CHECK (payment_type IN (
        'rent', 'down_payment', 'late_fee', 'nsf_fee', 'other'
    )),
    
    -- Fechas
    due_date DATE NOT NULL,
    paid_date DATE,
    
    -- Estado
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'paid', 'late', 'partial', 'waived', 'refunded'
    )),
    
    -- Late fee (calculado automáticamente)
    days_late INTEGER DEFAULT 0,
    late_fee_amount NUMERIC DEFAULT 0,
    late_fee_paid BOOLEAN DEFAULT FALSE,
    
    -- Método de pago
    payment_method TEXT,  -- Zelle, Check, Cash, Stripe, etc.
    payment_reference TEXT,  -- Transaction ID, check number, etc.
    
    -- Stripe (si aplica)
    stripe_payment_intent_id TEXT,
    stripe_charge_id TEXT,
    
    -- Recibo
    receipt_number TEXT,
    receipt_sent_at TIMESTAMP,
    receipt_email TEXT,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    recorded_by UUID,  -- Employee who recorded the payment
    notes TEXT
);

-- Índices para payments
CREATE INDEX IF NOT EXISTS idx_payments_contract_id ON payments(rto_contract_id);
CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_due_date ON payments(due_date);
CREATE INDEX IF NOT EXISTS idx_payments_paid_date ON payments(paid_date);

-- ============================================================================
-- TABLA: investments (Proceso: FONDEAR)
-- Inversiones de inversionistas en propiedades
-- ============================================================================
CREATE TABLE IF NOT EXISTS investments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Referencias
    investor_id UUID NOT NULL REFERENCES investors(id),
    property_id UUID REFERENCES properties(id),  -- Nullable if general fund
    
    -- Detalles de la inversión
    amount NUMERIC NOT NULL,
    interest_rate NUMERIC NOT NULL,  -- % anual
    term_months INTEGER NOT NULL,
    
    -- Fechas
    investment_date DATE NOT NULL,
    maturity_date DATE NOT NULL,
    
    -- Estado
    status TEXT DEFAULT 'active' CHECK (status IN (
        'pending', 'active', 'paid', 'defaulted', 'cancelled'
    )),
    
    -- Pagos al inversionista
    total_interest_due NUMERIC,  -- Calculado
    total_interest_paid NUMERIC DEFAULT 0,
    total_principal_paid NUMERIC DEFAULT 0,
    next_payment_date DATE,
    
    -- Documentos
    pagare_url TEXT,
    pagare_signed_at TIMESTAMP,
    
    -- Metadata
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT
);

-- Índices para investments
CREATE INDEX IF NOT EXISTS idx_investments_investor_id ON investments(investor_id);
CREATE INDEX IF NOT EXISTS idx_investments_property_id ON investments(property_id);
CREATE INDEX IF NOT EXISTS idx_investments_status ON investments(status);
CREATE INDEX IF NOT EXISTS idx_investments_maturity_date ON investments(maturity_date);

-- ============================================================================
-- TABLA: process_logs (Para tracking de todos los procesos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS process_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Entidad afectada
    entity_type TEXT NOT NULL CHECK (entity_type IN (
        'property', 'client', 'investor', 'rto_contract', 'payment', 'investment'
    )),
    entity_id UUID NOT NULL,
    
    -- Proceso de la Cadena de Valor
    process TEXT NOT NULL CHECK (process IN (
        'COMERCIALIZAR', 'ADQUIRIR', 'INCORPORAR', 
        'GESTIONAR_CARTERA', 'FONDEAR', 'ENTREGAR'
    )),
    
    -- Transición de estado
    from_stage TEXT,
    to_stage TEXT,
    
    -- Detalles
    action TEXT NOT NULL,  -- e.g., "created", "stage_changed", "payment_recorded"
    details JSONB,  -- Additional context
    
    -- Quién y cuándo
    performed_by UUID,  -- User ID
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Agent que ejecutó (si aplica)
    agent_name TEXT  -- e.g., "ComercializarAgent", "AdquirirAgent"
);

-- Índices para process_logs
CREATE INDEX IF NOT EXISTS idx_process_logs_entity ON process_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_process_logs_process ON process_logs(process);
CREATE INDEX IF NOT EXISTS idx_process_logs_performed_at ON process_logs(performed_at);

-- ============================================================================
-- ACTUALIZAR TABLA: properties (añadir campos para inventario y venta)
-- ============================================================================
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS inventory_status TEXT DEFAULT 'available' 
        CHECK (inventory_status IN ('available', 'reserved', 'sold', 'rented', 'maintenance')),
    ADD COLUMN IF NOT EXISTS sale_price NUMERIC,
    ADD COLUMN IF NOT EXISTS monthly_rent_estimate NUMERIC,
    ADD COLUMN IF NOT EXISTS assigned_client_id UUID REFERENCES clients(id),
    ADD COLUMN IF NOT EXISTS listing_active BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS listing_photos JSONB DEFAULT '[]',
    ADD COLUMN IF NOT EXISTS listing_description TEXT,
    ADD COLUMN IF NOT EXISTS bedrooms INTEGER,
    ADD COLUMN IF NOT EXISTS bathrooms NUMERIC,
    ADD COLUMN IF NOT EXISTS square_feet INTEGER,
    ADD COLUMN IF NOT EXISTS year_built INTEGER,
    ADD COLUMN IF NOT EXISTS lot_rent NUMERIC;

-- Índice para búsqueda de inventario
CREATE INDEX IF NOT EXISTS idx_properties_inventory_status ON properties(inventory_status);
CREATE INDEX IF NOT EXISTS idx_properties_listing_active ON properties(listing_active);

-- ============================================================================
-- FUNCIONES DE UTILIDAD
-- ============================================================================

-- Función para calcular DTI
CREATE OR REPLACE FUNCTION calculate_dti(
    monthly_income NUMERIC,
    monthly_debt NUMERIC
) RETURNS NUMERIC AS $$
BEGIN
    IF monthly_income IS NULL OR monthly_income = 0 THEN
        RETURN NULL;
    END IF;
    RETURN ROUND((monthly_debt / monthly_income) * 100, 2);
END;
$$ LANGUAGE plpgsql;

-- Función para calcular late fees
CREATE OR REPLACE FUNCTION calculate_late_fee(
    due_date DATE,
    paid_date DATE,
    grace_days INTEGER DEFAULT 5,
    fee_per_day NUMERIC DEFAULT 15
) RETURNS NUMERIC AS $$
DECLARE
    days_late INTEGER;
BEGIN
    IF paid_date IS NULL OR paid_date <= due_date + grace_days THEN
        RETURN 0;
    END IF;
    days_late := paid_date - due_date - grace_days;
    RETURN days_late * fee_per_day;
END;
$$ LANGUAGE plpgsql;

-- Función para generar código de referido único
CREATE OR REPLACE FUNCTION generate_referral_code() RETURNS TEXT AS $$
DECLARE
    chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    result TEXT := '';
    i INTEGER;
BEGIN
    FOR i IN 1..8 LOOP
        result := result || substr(chars, floor(random() * length(chars) + 1)::integer, 1);
    END LOOP;
    RETURN 'REF-' || result;
END;
$$ LANGUAGE plpgsql;

-- Trigger para auto-generar referral_code en clients
CREATE OR REPLACE FUNCTION auto_generate_referral_code()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.referral_code IS NULL THEN
        NEW.referral_code := generate_referral_code();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_referral_code ON clients;
CREATE TRIGGER trigger_auto_referral_code
    BEFORE INSERT ON clients
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_referral_code();

-- ============================================================================
-- TRIGGERS PARA updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Clients
DROP TRIGGER IF EXISTS trigger_clients_updated_at ON clients;
CREATE TRIGGER trigger_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Investors
DROP TRIGGER IF EXISTS trigger_investors_updated_at ON investors;
CREATE TRIGGER trigger_investors_updated_at
    BEFORE UPDATE ON investors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RTO Contracts
DROP TRIGGER IF EXISTS trigger_rto_contracts_updated_at ON rto_contracts;
CREATE TRIGGER trigger_rto_contracts_updated_at
    BEFORE UPDATE ON rto_contracts
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Payments
DROP TRIGGER IF EXISTS trigger_payments_updated_at ON payments;
CREATE TRIGGER trigger_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Investments
DROP TRIGGER IF EXISTS trigger_investments_updated_at ON investments;
CREATE TRIGGER trigger_investments_updated_at
    BEFORE UPDATE ON investments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- COMENTARIOS DE DOCUMENTACIÓN
-- ============================================================================

COMMENT ON TABLE clients IS 'Clientes de Maninos Capital - Datos del Anexo 1 (Solicitud de Crédito)';
COMMENT ON TABLE investors IS 'Inversionistas que financian propiedades';
COMMENT ON TABLE rto_contracts IS 'Contratos Rent-to-Own - Basado en Anexo 3 (33 cláusulas)';
COMMENT ON TABLE payments IS 'Pagos de clientes - rentas, late fees, etc.';
COMMENT ON TABLE investments IS 'Inversiones de inversionistas en propiedades';
COMMENT ON TABLE process_logs IS 'Log de acciones en la Cadena de Valor';

-- ============================================================================
-- FIN DE MIGRACIÓN
-- ============================================================================


