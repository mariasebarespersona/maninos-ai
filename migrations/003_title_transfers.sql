-- ============================================
-- Migration 003: Title Transfers Tracking
-- ============================================
-- Tracks title transfers in two scenarios:
-- 1. PURCHASE: Seller → Maninos Homes (when buying a property)
-- 2. SALE: Maninos Homes → Client (when selling contado)

-- Create types only if they don't exist
DO $$ BEGIN
    CREATE TYPE transfer_type AS ENUM ('purchase', 'sale');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE transfer_status AS ENUM ('pending', 'in_progress', 'completed', 'cancelled');
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS title_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Related entities
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,  -- Only for 'sale' type
    
    -- Transfer details
    transfer_type transfer_type NOT NULL,
    status transfer_status NOT NULL DEFAULT 'pending',
    
    -- Parties involved
    from_name TEXT NOT NULL,        -- Seller name or "Maninos Homes"
    from_contact TEXT,              -- Phone/email
    to_name TEXT NOT NULL,          -- "Maninos Homes" or Client name
    to_contact TEXT,                -- Phone/email
    
    -- Documents checklist (stored as JSONB for flexibility)
    documents_checklist JSONB DEFAULT '{
        "bill_of_sale": false,
        "title_application": false,
        "tax_receipt": false,
        "id_copies": false,
        "lien_release": false,
        "notarized_forms": false
    }'::jsonb,
    
    -- Dates
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    submitted_at TIMESTAMPTZ,           -- When docs submitted to DMV/county
    expected_completion DATE,
    completed_at TIMESTAMPTZ,
    
    -- Additional info
    tracking_number TEXT,               -- DMV/county reference number
    notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (IF NOT EXISTS)
CREATE INDEX IF NOT EXISTS idx_title_transfers_property ON title_transfers(property_id);
CREATE INDEX IF NOT EXISTS idx_title_transfers_sale ON title_transfers(sale_id);
CREATE INDEX IF NOT EXISTS idx_title_transfers_status ON title_transfers(status);
CREATE INDEX IF NOT EXISTS idx_title_transfers_type ON title_transfers(transfer_type);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS title_transfers_updated_at ON title_transfers;
CREATE TRIGGER title_transfers_updated_at
    BEFORE UPDATE ON title_transfers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to auto-create purchase transfer when property is created
CREATE OR REPLACE FUNCTION create_purchase_transfer()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO title_transfers (
        property_id,
        transfer_type,
        from_name,
        to_name
    ) VALUES (
        NEW.id,
        'purchase',
        COALESCE(NEW.seller_name, 'Vendedor Original'),
        'Maninos Homes'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add seller_name to properties if not exists
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' AND column_name = 'seller_name'
    ) THEN
        ALTER TABLE properties ADD COLUMN seller_name TEXT;
        ALTER TABLE properties ADD COLUMN seller_contact TEXT;
    END IF;
END $$;

-- Trigger to auto-create transfer on property insert
DROP TRIGGER IF EXISTS auto_create_purchase_transfer ON properties;
CREATE TRIGGER auto_create_purchase_transfer
    AFTER INSERT ON properties
    FOR EACH ROW
    EXECUTE FUNCTION create_purchase_transfer();

-- Function to auto-create sale transfer when sale is created (contado only)
CREATE OR REPLACE FUNCTION create_sale_transfer()
RETURNS TRIGGER AS $$
DECLARE
    client_name TEXT;
    client_contact TEXT;
BEGIN
    -- Only create for contado sales
    IF NEW.sale_type = 'contado' THEN
        -- Get client info
        SELECT full_name, phone INTO client_name, client_contact
        FROM clients WHERE id = NEW.client_id;
        
        INSERT INTO title_transfers (
            property_id,
            sale_id,
            transfer_type,
            from_name,
            to_name,
            to_contact
        ) VALUES (
            NEW.property_id,
            NEW.id,
            'sale',
            'Maninos Homes',
            COALESCE(client_name, 'Cliente'),
            client_contact
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-create sale transfer
DROP TRIGGER IF EXISTS auto_create_sale_transfer ON sales;
CREATE TRIGGER auto_create_sale_transfer
    AFTER INSERT ON sales
    FOR EACH ROW
    EXECUTE FUNCTION create_sale_transfer();

