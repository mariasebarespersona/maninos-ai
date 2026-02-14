-- Migration 010: Add notes column to properties table
-- Run this in Supabase SQL Editor

ALTER TABLE properties 
ADD COLUMN IF NOT EXISTS notes TEXT;

-- Add comment for documentation
COMMENT ON COLUMN properties.notes IS 'Additional notes about the property (e.g., source, payment info)';


