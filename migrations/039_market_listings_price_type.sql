-- Migration 039: Add price_type and estimated_full_price to market_listings
-- Many Facebook Marketplace listings show the DOWN PAYMENT instead of the full price.
-- This migration adds columns to distinguish between full price and down payment listings,
-- and to store the estimated full price when only a down payment is shown.

-- Add price_type column: "full" (default) or "down_payment"
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS price_type TEXT DEFAULT 'full';

-- Add estimated_full_price: when price_type = 'down_payment', this stores the estimated total price
ALTER TABLE market_listings ADD COLUMN IF NOT EXISTS estimated_full_price DECIMAL(12, 2);

-- Add constraint for valid price types
ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_price_type_check;
ALTER TABLE market_listings ADD CONSTRAINT market_listings_price_type_check
    CHECK (price_type IN ('full', 'down_payment'));

-- Add index for quick filtering
CREATE INDEX IF NOT EXISTS idx_market_listings_price_type ON market_listings(price_type);

COMMENT ON COLUMN market_listings.price_type IS 'Whether listing_price is the full asking price or just a down payment. Values: full, down_payment';
COMMENT ON COLUMN market_listings.estimated_full_price IS 'Estimated total price when price_type=down_payment. Derived from description analysis or heuristic calculation.';

