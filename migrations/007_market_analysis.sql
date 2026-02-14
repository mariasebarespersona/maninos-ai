-- Migration 007: Market Analysis Table
-- Stores market value calculations from each scraping session
-- Separate from market_listings to keep market analysis history

-- ============================================
-- MARKET ANALYSIS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS market_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Search parameters
    city TEXT NOT NULL,
    state TEXT DEFAULT 'TX',
    min_price DECIMAL(12, 2),
    max_price DECIMAL(12, 2),
    
    -- Scraping results
    total_scraped INTEGER NOT NULL,  -- Total houses found
    sources JSONB NOT NULL,  -- {"mhvillage": 20, "mobilehome": 11, "mhbay": 11}
    
    -- Market value calculation
    market_value_avg DECIMAL(12, 2) NOT NULL,  -- Average of ALL scraped prices
    max_offer_70_percent DECIMAL(12, 2) NOT NULL,  -- 70% of market value
    price_min DECIMAL(12, 2),
    price_max DECIMAL(12, 2),
    
    -- Qualification results
    qualified_count INTEGER DEFAULT 0,  -- How many passed all 3 rules
    
    -- Timestamps
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_market_analysis_city ON market_analysis(city);
CREATE INDEX IF NOT EXISTS idx_market_analysis_date ON market_analysis(scraped_at DESC);

-- ============================================
-- ADD REFERENCE TO MARKET_LISTINGS
-- ============================================

-- Add column to link listings to their market analysis
ALTER TABLE market_listings 
ADD COLUMN IF NOT EXISTS market_analysis_id UUID REFERENCES market_analysis(id);

-- Index for the foreign key
CREATE INDEX IF NOT EXISTS idx_market_listings_analysis ON market_listings(market_analysis_id);

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE market_analysis IS 'Stores market value calculations from each web scraping session';
COMMENT ON COLUMN market_analysis.market_value_avg IS 'Average price of ALL scraped listings (not just qualified)';
COMMENT ON COLUMN market_analysis.max_offer_70_percent IS 'Maximum price Maninos should pay (70% rule)';
COMMENT ON COLUMN market_analysis.qualified_count IS 'Number of listings that passed all 3 qualification rules';


