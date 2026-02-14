-- Migration 009: Add checklist fields to market_listings
-- The checklist is completed BEFORE purchasing a property

-- Add checklist fields
ALTER TABLE market_listings 
ADD COLUMN IF NOT EXISTS checklist_data JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS checklist_completed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS checklist_percentage DECIMAL(5, 2) DEFAULT 0;

-- Add index for filtering by checklist status
CREATE INDEX IF NOT EXISTS idx_market_listings_checklist ON market_listings(checklist_completed);

-- Comment
COMMENT ON COLUMN market_listings.checklist_data IS 'JSON object with checklist items: {item_id: true/false}';
COMMENT ON COLUMN market_listings.checklist_completed IS 'TRUE if >= 80% of checklist items are checked';
COMMENT ON COLUMN market_listings.checklist_percentage IS 'Percentage of checklist items completed (0-100)';


