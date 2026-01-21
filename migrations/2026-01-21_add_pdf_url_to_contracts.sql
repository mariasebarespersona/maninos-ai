-- ============================================================================
-- Migration: Add PDF URL column to rto_contracts
-- Date: 2026-01-21
-- Purpose: Store generated PDF contract URLs
-- ============================================================================

-- Add pdf_url column to rto_contracts
ALTER TABLE rto_contracts 
ADD COLUMN IF NOT EXISTS pdf_url TEXT;

-- Comment for documentation
COMMENT ON COLUMN rto_contracts.pdf_url IS 'Public URL to the generated PDF contract in Supabase Storage';

-- ============================================================================
-- IMPORTANT: Create Storage Bucket manually in Supabase Dashboard
-- ============================================================================
-- 
-- 1. Go to Supabase Dashboard > Storage
-- 2. Create a new bucket called "documents"
-- 3. Make it PUBLIC (for easy PDF access)
-- 4. Or keep it private and use signed URLs
--
-- Bucket policies (run in SQL Editor if needed):

-- Create bucket via SQL (if not exists)
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('documents', 'documents', true)
-- ON CONFLICT (id) DO NOTHING;

-- Allow public read access
-- CREATE POLICY "Public read access for documents"
-- ON storage.objects FOR SELECT
-- USING (bucket_id = 'documents');

-- Allow service role to upload
-- CREATE POLICY "Service role can upload documents"
-- ON storage.objects FOR INSERT
-- WITH CHECK (bucket_id = 'documents');

-- Allow service role to update/delete
-- CREATE POLICY "Service role can manage documents"
-- ON storage.objects FOR ALL
-- USING (bucket_id = 'documents');

