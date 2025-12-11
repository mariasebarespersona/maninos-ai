-- Migration: Add 'documents_pending' stage to acquisition workflow
-- Date: 2025-12-11
-- Description: Adds Paso 0 (Documents Collection) before 70% check

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;

-- Add new constraint with 'documents_pending' stage
ALTER TABLE properties ADD CONSTRAINT properties_acquisition_stage_check 
CHECK (acquisition_stage IN (
    'documents_pending',
    'initial',
    'passed_70_rule',
    'inspection_done',
    'passed_80_rule',
    'rejected'
));

-- Update status constraint to include documents-related status
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;

ALTER TABLE properties ADD CONSTRAINT properties_status_check 
CHECK (status IN (
    'New',
    'Pending Documents',
    'Proceed to Inspection',
    'Ready to Buy',
    'Rejected',
    'Under Contract'
));

COMMENT ON COLUMN properties.acquisition_stage IS 'Current stage: documents_pending -> initial -> passed_70_rule -> inspection_done -> passed_80_rule -> rejected';

