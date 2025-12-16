-- Migration: Fix storage_path column in maninos_documents table
-- Date: 2025-12-16
-- Issue: Documents were saved with 'storage_key' instead of 'storage_path'
-- This migration renames the column or copies data if needed

-- Step 1: Check if storage_path column exists, if not, add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'maninos_documents' 
        AND column_name = 'storage_path'
    ) THEN
        ALTER TABLE maninos_documents ADD COLUMN storage_path TEXT;
        RAISE NOTICE 'Added storage_path column';
    END IF;
END $$;

-- Step 2: If storage_key exists, copy its data to storage_path
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'maninos_documents' 
        AND column_name = 'storage_key'
    ) THEN
        -- Copy data from storage_key to storage_path
        UPDATE maninos_documents 
        SET storage_path = storage_key 
        WHERE storage_path IS NULL AND storage_key IS NOT NULL;
        
        RAISE NOTICE 'Copied storage_key data to storage_path';
        
        -- Optionally drop the old storage_key column (commented out for safety)
        -- ALTER TABLE maninos_documents DROP COLUMN IF EXISTS storage_key;
    END IF;
END $$;

-- Step 3: Add NOT NULL constraint to storage_path (optional, for data integrity)
-- Uncomment if you want to enforce this:
-- ALTER TABLE maninos_documents ALTER COLUMN storage_path SET NOT NULL;

-- Verification query (run separately to check results):
-- SELECT id, document_name, document_type, storage_key, storage_path 
-- FROM maninos_documents 
-- WHERE storage_path IS NULL;

