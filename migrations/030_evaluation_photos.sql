-- ============================================================================
-- Migration 030: Add photos column to evaluation_reports
-- ============================================================================
-- Stores URLs of uploaded evaluation photos in Supabase Storage
-- so they are persisted alongside the AI analysis results.
-- ============================================================================

ALTER TABLE evaluation_reports ADD COLUMN IF NOT EXISTS photos JSONB DEFAULT '[]'::jsonb;
COMMENT ON COLUMN evaluation_reports.photos IS 'Array of Supabase Storage URLs for uploaded evaluation photos';

