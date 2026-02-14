-- ============================================================================
-- MANINOS AI - Initial Database Schema
-- Portal Homes MVP: Comercializar Flow + Contado Payment
-- ============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- USERS (Empleados)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('admin', 'comprador', 'renovador', 'vendedor')),
    portal_access TEXT[] DEFAULT ARRAY['homes'],
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- PROPERTIES (Propiedades)
-- Flujo flexible: purchased -> published -> [sold | renovating -> published -> sold]
-- ============================================================================
CREATE TABLE IF NOT EXISTS properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    address TEXT NOT NULL,
    city TEXT,
    state TEXT DEFAULT 'Texas',
    zip_code TEXT,
    hud_number TEXT,
    year INTEGER,
    
    -- Financials
    purchase_price DECIMAL(12,2),
    sale_price DECIMAL(12,2),
    
    -- Details
    bedrooms INTEGER,
    bathrooms DECIMAL(3,1),
    square_feet INTEGER,
    
    -- Status (flexible flow)
    status TEXT NOT NULL DEFAULT 'purchased' 
        CHECK (status IN ('purchased', 'published', 'renovating', 'sold')),
    is_renovated BOOLEAN DEFAULT false,
    
    -- Photos (JSON array of URLs)
    photos JSONB DEFAULT '[]'::jsonb,
    
    -- Checklist (from Paso 1)
    checklist_completed BOOLEAN DEFAULT false,
    checklist_data JSONB DEFAULT '{}'::jsonb,
    
    -- Metadata
    created_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- CLIENTS (Compradores)
-- ============================================================================
CREATE TABLE IF NOT EXISTS clients (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Basic Info
    name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    
    -- Terreno (requerido para Contado)
    terreno TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'lead' 
        CHECK (status IN ('lead', 'active', 'completed')),
    
    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- SALES (Ventas)
-- ============================================================================
CREATE TABLE IF NOT EXISTS sales (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relations
    property_id UUID NOT NULL REFERENCES properties(id),
    client_id UUID NOT NULL REFERENCES clients(id),
    
    -- Sale Details
    sale_type TEXT NOT NULL DEFAULT 'contado' 
        CHECK (sale_type IN ('contado', 'rto')),
    sale_price DECIMAL(12,2) NOT NULL,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'pending' 
        CHECK (status IN ('pending', 'paid', 'completed', 'cancelled')),
    
    -- Track if sold before renovation
    sold_before_renovation BOOLEAN DEFAULT false,
    
    -- Payment tracking
    payment_method TEXT,
    payment_reference TEXT,
    
    -- Dates
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- RENOVATIONS (Renovaciones - Opcional)
-- ============================================================================
CREATE TABLE IF NOT EXISTS renovations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Relation
    property_id UUID NOT NULL REFERENCES properties(id),
    
    -- Materials checklist with costs (voice input compatible)
    materials JSONB DEFAULT '[]'::jsonb,
    -- Example: [{"item": "Pintura", "quantity": 5, "unit_cost": 25, "total": 125}, ...]
    
    -- Totals
    total_cost DECIMAL(12,2) DEFAULT 0,
    
    -- Notes (can include voice transcription)
    notes TEXT,
    
    -- Status
    status TEXT NOT NULL DEFAULT 'in_progress' 
        CHECK (status IN ('in_progress', 'completed')),
    
    -- Track if property was moved
    was_moved BOOLEAN DEFAULT false,
    
    -- Dates
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- DOCUMENTS (Documentos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- Polymorphic relation
    entity_type TEXT NOT NULL CHECK (entity_type IN ('property', 'client', 'sale', 'renovation')),
    entity_id UUID NOT NULL,
    
    -- Document info
    doc_type TEXT NOT NULL,
    -- For properties: 'texas_page', 'bill_of_sale', 'title_change', 'photo'
    -- For sales: 'receipt', 'contract'
    -- For clients: 'id', 'proof_of_income'
    
    file_name TEXT,
    file_url TEXT NOT NULL,
    storage_path TEXT,
    
    -- Metadata
    uploaded_by UUID REFERENCES users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- AUDIT_LOGS (Para seguimiento)
-- ============================================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    
    -- What changed
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    
    -- Details
    old_value JSONB,
    new_value JSONB,
    
    -- Who did it
    performed_by UUID REFERENCES users(id),
    
    -- When
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_properties_status ON properties(status);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
CREATE INDEX IF NOT EXISTS idx_sales_status ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sales_property ON sales(property_id);
CREATE INDEX IF NOT EXISTS idx_sales_client ON sales(client_id);
CREATE INDEX IF NOT EXISTS idx_renovations_property ON renovations(property_id);
CREATE INDEX IF NOT EXISTS idx_documents_entity ON documents(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);

-- ============================================================================
-- UPDATED_AT TRIGGER
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply to all tables with updated_at
DROP TRIGGER IF EXISTS update_users_updated_at ON users;
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_properties_updated_at ON properties;
CREATE TRIGGER update_properties_updated_at
    BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_clients_updated_at ON clients;
CREATE TRIGGER update_clients_updated_at
    BEFORE UPDATE ON clients
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_sales_updated_at ON sales;
CREATE TRIGGER update_sales_updated_at
    BEFORE UPDATE ON sales
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_renovations_updated_at ON renovations;
CREATE TRIGGER update_renovations_updated_at
    BEFORE UPDATE ON renovations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- ROW LEVEL SECURITY (Simplificado para MVP)
-- ============================================================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE renovations ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- For MVP: Allow all authenticated users to access everything
-- (Will be refined later for multi-portal access)

CREATE POLICY "Allow all for authenticated users" ON users
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON properties
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON clients
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON sales
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON renovations
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON documents
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON audit_logs
    FOR ALL USING (auth.role() = 'authenticated');

-- Service role bypass (for API)
CREATE POLICY "Service role bypass" ON users
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON properties
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON clients
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON sales
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON renovations
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON documents
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON audit_logs
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

