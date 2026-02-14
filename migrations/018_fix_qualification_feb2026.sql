-- Migration 018: Fix qualification trigger for Feb 2026 rules
-- 
-- PROBLEM: The old trigger (migration 008) was overriding Python-calculated values:
--   - It forced passes_age_rule = false when year_built IS NULL
--   - This made is_qualified = false for every listing without year_built
--   
-- NEW RULES (confirmed with Maninos, Feb 2026):
--   1. 60% Rule: price <= market_value * 0.60 (calculated by Python API)
--   2. NO year/age filter (they buy any age)
--   3. Location: 200mi of Houston OR Dallas (calculated by Python API)  
--   4. Price range: $0 - $80,000 (calculated by Python API)
--
-- SOLUTION: The trigger now PRESERVES values set by the Python API.
--   The Python code in api/utils/qualification.py is the single source of truth.
--   The trigger only updates timestamp and sets defaults for NULL values.

-- ============================================
-- UPDATED TRIGGER: Respects API-set values
-- ============================================

CREATE OR REPLACE FUNCTION calculate_listing_qualification()
RETURNS TRIGGER AS $$
BEGIN
    -- The Python API (api/utils/qualification.py) is the single source of truth
    -- for all qualification logic. This trigger ONLY:
    --   1. Sets defaults for NULL values
    --   2. Updates the timestamp
    --   3. Does NOT override API-calculated values
    
    -- Default location rule if not set by API
    IF NEW.passes_location_rule IS NULL THEN
        NEW.passes_location_rule := UPPER(NEW.state) = 'TX' OR UPPER(NEW.state) = 'TEXAS';
    END IF;
    
    -- Default passes_70_rule (now used for 60% rule) if not set
    IF NEW.passes_70_rule IS NULL THEN
        NEW.passes_70_rule := false;
    END IF;
    
    -- Default passes_age_rule (now repurposed as price range check) if not set
    -- NOTE: This field is NO LONGER an age check. It stores the price range result.
    -- The Python API sets this to true/false based on $0-$80K range check.
    IF NEW.passes_age_rule IS NULL THEN
        NEW.passes_age_rule := true;  -- Default true (no age filter anymore)
    END IF;
    
    -- Calculate overall qualification from the 3 fields
    -- (all 3 are set by Python API during scraping/creation)
    NEW.is_qualified := COALESCE(NEW.passes_70_rule, false) 
                       AND COALESCE(NEW.passes_age_rule, true)  -- default true (no age filter)
                       AND COALESCE(NEW.passes_location_rule, false);
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger already exists from migration 006, this just updates the function.
-- No need to recreate the trigger since it references the same function name.

-- ============================================
-- Also update the status CHECK constraint to include new pipeline statuses
-- ============================================

ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_status_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_status_check 
    CHECK (status IN (
        'available', 'reviewing', 'purchased', 'rejected', 'expired',
        'contacted', 'negotiating', 'evaluating', 'docs_pending', 'locked',
        'dismissed'
    ));

-- ============================================
-- Also update the source CHECK constraint to include new sources
-- ============================================

ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_source_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_source_check 
    CHECK (source IN (
        'mhvillage', 'mobilehome', 'zillow', 'mhbay', 
        'facebook_marketplace', 'facebook', 'manual', 'other'
    ));

-- ============================================
-- RE-QUALIFY existing listings with the fixed trigger
-- This will fire the updated trigger for each row
-- ============================================

UPDATE market_listings 
SET updated_at = NOW()
WHERE is_qualified = false 
  AND passes_70_rule = true 
  AND passes_location_rule = true;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON COLUMN market_listings.passes_age_rule IS 'Feb 2026: Repurposed as price range check ($0-$80K). No longer an age filter.';
COMMENT ON COLUMN market_listings.passes_70_rule IS 'Feb 2026: Now stores 60% rule result. Column name kept for backward compatibility.';
COMMENT ON COLUMN market_listings.is_qualified IS 'TRUE if property passes ALL rules: 60% price, $0-$80K range, 200mi zone';

