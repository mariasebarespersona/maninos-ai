-- Migration: Fix charset for text documents in maninos_documents table
-- Date: 2025-12-16
-- Issue: Text files showing corrupted characters due to missing charset in content_type
-- This migration adds '; charset=utf-8' to all text/* content_types

-- Update all text/* documents to include charset=utf-8
UPDATE maninos_documents 
SET content_type = content_type || '; charset=utf-8'
WHERE content_type LIKE 'text/%'
AND content_type NOT LIKE '%charset%';

-- Verification query (run separately to check results):
-- SELECT id, document_name, content_type 
-- FROM maninos_documents 
-- WHERE content_type LIKE 'text/%';

