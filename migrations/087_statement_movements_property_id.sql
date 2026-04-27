-- Add property_id to statement_movements for per-property cost tracking
-- This follows the standard accounting approach: tag transactions with property
-- instead of creating sub-accounts per property in the chart of accounts.
ALTER TABLE statement_movements ADD COLUMN IF NOT EXISTS property_id UUID REFERENCES properties(id);
