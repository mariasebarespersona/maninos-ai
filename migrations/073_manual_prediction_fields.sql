-- Migration 073: Add manual prediction fields to market_listings
-- These allow users to override scraped values for price prediction

ALTER TABLE market_listings
  ADD COLUMN IF NOT EXISTS manual_price NUMERIC,
  ADD COLUMN IF NOT EXISTS manual_bedrooms INTEGER,
  ADD COLUMN IF NOT EXISTS manual_bathrooms NUMERIC,
  ADD COLUMN IF NOT EXISTS manual_sqft INTEGER,
  ADD COLUMN IF NOT EXISTS manual_year INTEGER;

COMMENT ON COLUMN market_listings.manual_price IS 'User-overridden price for prediction (overrides listing_price)';
COMMENT ON COLUMN market_listings.manual_bedrooms IS 'User-overridden bedrooms for prediction';
COMMENT ON COLUMN market_listings.manual_bathrooms IS 'User-overridden bathrooms for prediction';
COMMENT ON COLUMN market_listings.manual_sqft IS 'User-overridden sqft for prediction';
COMMENT ON COLUMN market_listings.manual_year IS 'User-overridden year for prediction';
