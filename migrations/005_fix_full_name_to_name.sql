-- Migration 005: Fix full_name to name in triggers
-- The clients table uses 'name' not 'full_name'

-- Fix the create_sale_transfer trigger
CREATE OR REPLACE FUNCTION create_sale_transfer()
RETURNS TRIGGER AS $$
DECLARE
    client_name TEXT;
    client_contact TEXT;
BEGIN
    -- Only create for contado sales
    IF NEW.sale_type = 'contado' THEN
        -- Get client info (using 'name' not 'full_name')
        SELECT name, phone INTO client_name, client_contact
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

-- Note: Run this migration in Supabase SQL Editor


