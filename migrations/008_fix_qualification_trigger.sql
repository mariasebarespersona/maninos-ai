-- Migration 008: Fix qualification trigger
-- The old trigger was overriding our calculated is_qualified value
-- because it required estimated_renovation which we don't use anymore

-- ============================================
-- NEW SIMPLER TRIGGER
-- ============================================

-- Our 70% rule is simpler:
-- listing_price <= market_value * 0.70
-- We calculate this in the API and store the result directly

CREATE OR REPLACE FUNCTION calculate_listing_qualification()
RETURNS TRIGGER AS $$
BEGIN
    -- If is_qualified is already set by the API, keep it
    -- Only recalculate if it's null or if passes_70_rule is null
    
    -- Rule 2: Age Rule (>= 1995)
    IF NEW.year_built IS NOT NULL THEN
        NEW.passes_age_rule := NEW.year_built >= 1995;
    ELSE
        NEW.passes_age_rule := false;
    END IF;
    
    -- Rule 3: Location Rule (Texas only)
    NEW.passes_location_rule := UPPER(NEW.state) = 'TX' OR UPPER(NEW.state) = 'TEXAS';
    
    -- Rule 1: 70% Rule - Only calculate if not already set
    -- We use estimated_arv as the market value average
    IF NEW.passes_70_rule IS NULL AND NEW.estimated_arv IS NOT NULL THEN
        NEW.passes_70_rule := NEW.listing_price <= (NEW.estimated_arv * 0.70);
    END IF;
    
    -- If passes_70_rule is still null, default to false
    IF NEW.passes_70_rule IS NULL THEN
        NEW.passes_70_rule := false;
    END IF;
    
    -- Calculate overall qualification
    NEW.is_qualified := NEW.passes_70_rule 
                       AND NEW.passes_age_rule 
                       AND NEW.passes_location_rule;
    
    -- Update timestamp
    NEW.updated_at := NOW();
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- The trigger already exists, this just updates the function


