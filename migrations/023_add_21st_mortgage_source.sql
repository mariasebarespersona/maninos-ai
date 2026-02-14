-- Migration 023: Add 21st Mortgage as a source + latitude/longitude columns
-- 
-- 21st Mortgage (21stmortgage.com) is a major mobile/manufactured home lender
-- that publishes their entire repo inventory as a public JSON.
-- They provide exact GPS coordinates for each listing.
--
-- Also adds latitude/longitude columns to market_listings for any source
-- that provides them (21st Mortgage, VMF Homes, etc.)

-- 1. Add latitude/longitude columns
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION DEFAULT NULL;
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION DEFAULT NULL;

-- 2. Update source check constraint to include 21st_mortgage
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_source_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_source_check 
    CHECK (source IN (
        'mhvillage', 'mobilehome', 'zillow', 'mhbay', 'vmf_homes', '21st_mortgage',
        'facebook_marketplace', 'facebook', 'craigslist',
        'whatsapp', 'instagram',
        'manual', 'other'
    ));

