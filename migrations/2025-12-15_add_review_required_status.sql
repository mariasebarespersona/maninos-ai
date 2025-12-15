-- Migration: Add 'Review Required' status
-- Date: 2025-12-15
-- Description: Adds 'Review Required' status for when 70% Rule needs review

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;

-- Add updated constraint with 'Review Required'
ALTER TABLE properties ADD CONSTRAINT properties_status_check 
CHECK (status IN (
    'New',
    'Pending Documents',
    'Review Required',
    'Proceed to Inspection',
    'Ready to Buy',
    'Rejected',
    'Under Contract'
));

COMMENT ON COLUMN properties.status IS 'Status: New (initial), Pending Documents (docs needed), Review Required (70% check failed), Proceed to Inspection (70% passed), Ready to Buy (80% passed), Rejected, Under Contract';

