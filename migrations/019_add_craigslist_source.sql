-- Migration 019: Add craigslist as a valid source for market_listings
-- 
-- Adding Craigslist as a scraping source (no auth needed, reliable backup for FB Marketplace)

ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_source_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_source_check 
    CHECK (source IN (
        'mhvillage', 'mobilehome', 'zillow', 'mhbay', 
        'facebook_marketplace', 'facebook', 'craigslist',
        'manual', 'other'
    ));

