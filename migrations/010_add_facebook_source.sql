-- Migration 010: Update market_listings source constraint
-- 1. Remove 'zillow' (not used)
-- 2. Add 'mhbay' (actual 3rd scraping source)
-- 3. Add 'facebook', 'whatsapp', 'instagram', 'other' (new manual entry sources)

-- Drop existing constraint
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_source_check;

-- Add corrected constraint with all valid sources
ALTER TABLE market_listings ADD CONSTRAINT market_listings_source_check 
    CHECK (source IN ('mhvillage', 'mobilehome', 'mhbay', 'facebook', 'whatsapp', 'instagram', 'other'));

