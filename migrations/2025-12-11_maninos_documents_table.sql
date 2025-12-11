-- Migration: Create maninos_documents table for Paso 0 (Documents Collection)
-- Date: 2025-12-11
-- Description: Simple table to track uploaded documents for each property

-- Drop table if exists (for clean re-runs)
DROP TABLE IF EXISTS maninos_documents CASCADE;

-- Create maninos_documents table
CREATE TABLE IF NOT EXISTS maninos_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    document_name TEXT NOT NULL,
    document_type TEXT,  -- 'title_status', 'property_listing', 'property_photos'
    storage_key TEXT NOT NULL,  -- Path in Supabase Storage
    content_type TEXT,
    signed_url TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index on property_id for faster queries
CREATE INDEX IF NOT EXISTS idx_maninos_documents_property_id 
ON maninos_documents(property_id);

-- Create index on document_type for faster filtering
CREATE INDEX IF NOT EXISTS idx_maninos_documents_type 
ON maninos_documents(document_type);

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_maninos_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists (prevents error on re-run)
DROP TRIGGER IF EXISTS maninos_documents_updated_at_trigger ON maninos_documents;

CREATE TRIGGER maninos_documents_updated_at_trigger
    BEFORE UPDATE ON maninos_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_maninos_documents_updated_at();

-- Add comment
COMMENT ON TABLE maninos_documents IS 'Tracks documents uploaded for each property in MANINOS AI (Paso 0: Documentos Iniciales)';

