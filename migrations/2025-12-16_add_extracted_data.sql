-- Migration: Add extracted_data column for auto-extraction from documents
-- Date: 2025-12-16
-- Purpose: Store extracted values from documents (asking_price, market_value, etc.)
--          to propose to user instead of asking manually

-- Add extracted_data column to properties table
ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS extracted_data JSONB DEFAULT NULL;

-- Create index for JSONB queries (optional but recommended for performance)
CREATE INDEX IF NOT EXISTS idx_properties_extracted_data 
ON properties USING GIN (extracted_data);

-- Add comment
COMMENT ON COLUMN properties.extracted_data IS 
'Stores auto-extracted data from uploaded documents. Format:
{
  "asking_price": {
    "value": 32500,
    "confidence": 0.95,
    "source": "property_listing.pdf",
    "extracted_at": "2025-12-16T12:00:00Z"
  },
  "market_value": {
    "value": 45000,
    "confidence": 0.90,
    "source": "property_listing.pdf",
    "extracted_at": "2025-12-16T12:00:00Z"
  },
  "bedrooms": {...},
  "bathrooms": {...},
  "year_built": {...}
}';

-- Verification query (run separately to test):
-- SELECT id, name, extracted_data FROM properties WHERE extracted_data IS NOT NULL;

