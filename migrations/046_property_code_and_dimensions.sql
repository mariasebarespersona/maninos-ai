-- Migration 046: Add property_code (editable ID like A1, A2...) and dimensions (length x width)
-- Run this in Supabase SQL Editor

-- Property code: short identifier shown alongside property name (e.g. "A1", "A2")
ALTER TABLE properties ADD COLUMN IF NOT EXISTS property_code TEXT;

-- Dimensions: length × width in feet (displayed alongside square footage)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS length_ft INTEGER;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS width_ft INTEGER;

-- Unique index on property_code (only non-null values)
CREATE UNIQUE INDEX IF NOT EXISTS idx_properties_code_unique 
ON properties (property_code) WHERE property_code IS NOT NULL;

-- Comments
COMMENT ON COLUMN properties.property_code IS 'Short property identifier (e.g. A1, A2). Auto-generated on purchase, editable by employees.';
COMMENT ON COLUMN properties.length_ft IS 'Property length in feet (for dimensions display)';
COMMENT ON COLUMN properties.width_ft IS 'Property width in feet (for dimensions display)';

