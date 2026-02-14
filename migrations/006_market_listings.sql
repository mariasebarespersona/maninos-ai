-- Migration 006: Market Listings for BuscadorAgent
-- Stores properties found by the agent from external websites
-- Automatically maintained to always have ~10 qualified listings

-- ============================================
-- MARKET LISTINGS TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS market_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source information
    source TEXT NOT NULL CHECK (source IN ('mhvillage', 'mobilehome', 'zillow')),
    source_url TEXT NOT NULL UNIQUE,
    source_id TEXT,  -- ID from the source website
    
    -- Property details
    address TEXT NOT NULL,
    city TEXT NOT NULL,
    state TEXT DEFAULT 'TX',
    zip_code TEXT,
    
    -- Pricing
    listing_price DECIMAL(12, 2) NOT NULL,
    estimated_arv DECIMAL(12, 2),  -- After Repair Value (from comparables)
    estimated_renovation DECIMAL(12, 2),
    
    -- Financial analysis
    max_offer_70_rule DECIMAL(12, 2),  -- ARV * 0.70 - renovation
    passes_70_rule BOOLEAN DEFAULT false,
    estimated_roi DECIMAL(5, 2),  -- Percentage
    
    -- Property specs
    year_built INTEGER,
    sqft INTEGER,
    bedrooms INTEGER,
    bathrooms DECIMAL(3, 1),
    
    -- Validation rules
    passes_age_rule BOOLEAN DEFAULT false,  -- year >= 1995
    passes_location_rule BOOLEAN DEFAULT false,  -- state = TX
    
    -- Overall status
    is_qualified BOOLEAN DEFAULT false,  -- Passes ALL rules
    qualification_score INTEGER DEFAULT 0,  -- 0-100 score for ranking
    qualification_reasons TEXT[],  -- Array of reasons why it passed/failed
    
    -- Photos
    photos TEXT[],  -- Array of photo URLs
    thumbnail_url TEXT,
    
    -- Status
    status TEXT DEFAULT 'available' CHECK (status IN ('available', 'reviewing', 'purchased', 'rejected', 'expired')),
    
    -- Timestamps
    scraped_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_market_listings_source ON market_listings(source);
CREATE INDEX IF NOT EXISTS idx_market_listings_status ON market_listings(status);
CREATE INDEX IF NOT EXISTS idx_market_listings_qualified ON market_listings(is_qualified);
CREATE INDEX IF NOT EXISTS idx_market_listings_city ON market_listings(city);
CREATE INDEX IF NOT EXISTS idx_market_listings_price ON market_listings(listing_price);
CREATE INDEX IF NOT EXISTS idx_market_listings_score ON market_listings(qualification_score DESC);

-- ============================================
-- UPDATED_AT TRIGGER
-- ============================================

CREATE OR REPLACE FUNCTION update_market_listings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS market_listings_updated_at ON market_listings;
CREATE TRIGGER market_listings_updated_at
    BEFORE UPDATE ON market_listings
    FOR EACH ROW
    EXECUTE FUNCTION update_market_listings_timestamp();

-- ============================================
-- AUTO-QUALIFICATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION calculate_listing_qualification()
RETURNS TRIGGER AS $$
DECLARE
    reasons TEXT[] := '{}';
    score INTEGER := 0;
BEGIN
    -- Rule 1: 70% Rule
    IF NEW.estimated_arv IS NOT NULL AND NEW.estimated_renovation IS NOT NULL THEN
        NEW.max_offer_70_rule := (NEW.estimated_arv * 0.70) - COALESCE(NEW.estimated_renovation, 0);
        NEW.passes_70_rule := NEW.listing_price <= NEW.max_offer_70_rule;
        
        IF NEW.passes_70_rule THEN
            reasons := array_append(reasons, '✓ Pasa regla del 70%');
            score := score + 40;
        ELSE
            reasons := array_append(reasons, '✗ No pasa regla del 70%: precio $' || NEW.listing_price || ' > máximo $' || NEW.max_offer_70_rule);
        END IF;
    ELSE
        reasons := array_append(reasons, '⚠ Falta ARV o estimación de renovación para calcular regla 70%');
    END IF;
    
    -- Rule 2: Age Rule (>= 1995, i.e., <= 30 years old)
    IF NEW.year_built IS NOT NULL THEN
        NEW.passes_age_rule := NEW.year_built >= 1995;
        
        IF NEW.passes_age_rule THEN
            reasons := array_append(reasons, '✓ Antigüedad OK: ' || NEW.year_built);
            score := score + 30;
        ELSE
            reasons := array_append(reasons, '✗ Muy antigua: ' || NEW.year_built || ' (mínimo 1995)');
        END IF;
    ELSE
        reasons := array_append(reasons, '⚠ Año de construcción desconocido');
    END IF;
    
    -- Rule 3: Location Rule (Texas only)
    NEW.passes_location_rule := UPPER(NEW.state) = 'TX' OR UPPER(NEW.state) = 'TEXAS';
    
    IF NEW.passes_location_rule THEN
        reasons := array_append(reasons, '✓ Ubicación: Texas');
        score := score + 30;
    ELSE
        reasons := array_append(reasons, '✗ Fuera de Texas: ' || NEW.state);
    END IF;
    
    -- Calculate overall qualification
    NEW.is_qualified := COALESCE(NEW.passes_70_rule, false) 
                       AND COALESCE(NEW.passes_age_rule, false) 
                       AND NEW.passes_location_rule;
    
    NEW.qualification_score := score;
    NEW.qualification_reasons := reasons;
    
    -- Calculate estimated ROI if we have the data
    IF NEW.estimated_arv IS NOT NULL AND NEW.listing_price > 0 THEN
        NEW.estimated_roi := ((NEW.estimated_arv - NEW.listing_price - COALESCE(NEW.estimated_renovation, 0)) 
                             / (NEW.listing_price + COALESCE(NEW.estimated_renovation, 0))) * 100;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_qualification ON market_listings;
CREATE TRIGGER calculate_qualification
    BEFORE INSERT OR UPDATE ON market_listings
    FOR EACH ROW
    EXECUTE FUNCTION calculate_listing_qualification();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE market_listings IS 'Properties found by BuscadorAgent from external websites (MHVillage, MobileHome.net, Zillow)';
COMMENT ON COLUMN market_listings.max_offer_70_rule IS 'Maximum offer using 70% rule: ARV * 0.70 - renovation cost';
COMMENT ON COLUMN market_listings.is_qualified IS 'TRUE if property passes ALL rules: 70%, age, location';
COMMENT ON COLUMN market_listings.qualification_score IS 'Score 0-100 for ranking qualified properties';

