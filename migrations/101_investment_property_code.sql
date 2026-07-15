-- ============================================================================
-- Migration 101: manual house code on investments
--   Lets an investor's ticket reference an OLD house by code (e.g. "H13") that
--   isn't in the property dropdown. If the code matches an existing property the
--   ticket still links via property_id; the free-text code is kept for display
--   and for houses that aren't in the system as property records.
-- Additive.
-- ============================================================================

ALTER TABLE investments ADD COLUMN IF NOT EXISTS property_code TEXT;
