-- Migration 075: Save "Revisar Casa" progress
-- Allows users to save their review progress and resume later

ALTER TABLE market_listings
    ADD COLUMN IF NOT EXISTS review_progress JSONB,
    ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS review_started_by TEXT;

COMMENT ON COLUMN market_listings.review_progress IS 'Saved state of the review process: step, documents, checklist, payment, TDHCA data, Bill of Sale data, etc.';
