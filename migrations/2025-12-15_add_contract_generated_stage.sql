-- Migration: Add 'contract_generated' stage
-- Date: 2025-12-15
-- Description: Adds Paso 5 (Contract) stage to acquisition workflow

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;

-- Add updated constraint with 'contract_generated'
ALTER TABLE properties ADD CONSTRAINT properties_acquisition_stage_check 
CHECK (acquisition_stage IN (
    'documents_pending',
    'initial',
    'passed_70_rule',
    'inspection_done',
    'passed_80_rule',
    'contract_generated',
    'rejected'
));

COMMENT ON COLUMN properties.acquisition_stage IS 'Current stage: documents_pending -> initial -> passed_70_rule -> inspection_done -> passed_80_rule -> contract_generated -> rejected';

