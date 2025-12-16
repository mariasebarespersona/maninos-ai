-- Migration: Drop legacy storage_key column from maninos_documents table
-- Date: 2025-12-16
-- Issue: storage_key (old column) still has NOT NULL constraint, causing inserts to fail
-- Reason: Previous migration added storage_path but didn't drop storage_key
-- This migration removes the old storage_key column completely

-- Step 1: Ensure storage_path has all data from storage_key (safety check)
UPDATE maninos_documents 
SET storage_path = storage_key 
WHERE storage_path IS NULL AND storage_key IS NOT NULL;

-- Step 2: Drop the old storage_key column
ALTER TABLE maninos_documents DROP COLUMN IF EXISTS storage_key;

-- Verification query (run separately to confirm storage_key is gone):
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'maninos_documents' 
-- AND column_name IN ('storage_key', 'storage_path');
-- 
-- Expected result: Only storage_path should exist

