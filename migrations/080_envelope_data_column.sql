-- Migration 080: Add data column to signature_envelopes for extra metadata (listing_id, etc.)
ALTER TABLE signature_envelopes ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;
