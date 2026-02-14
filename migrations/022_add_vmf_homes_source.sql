-- Migration 022: Add vmf_homes (Vanderbilt) as a valid source for market_listings
-- 
-- VMF Homes (Vanderbilt Mortgage & Finance) is a major mobile home seller in Texas.
-- URL: https://www.vmfhomes.com/homesearch
-- Also updates min price from $0 to $5,000 in the price range.

ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_source_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_source_check 
    CHECK (source IN (
        'mhvillage', 'mobilehome', 'zillow', 'mhbay', 'vmf_homes',
        'facebook_marketplace', 'facebook', 'craigslist',
        'whatsapp', 'instagram',
        'manual', 'other'
    ));


