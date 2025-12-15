-- Migration: Add 'review_required' stage
-- Date: 2025-12-15
-- Description: Adds 'review_required' stage for properties that fail 70% rule but can continue with human justification

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;

-- Add updated constraint with 'review_required'
ALTER TABLE properties ADD CONSTRAINT properties_acquisition_stage_check 
CHECK (acquisition_stage IN (
    'documents_pending',
    'initial',
    'review_required',      -- ⬅️ NEW: For 70% rule failures requiring justification
    'passed_70_rule',
    'inspection_done',
    'passed_80_rule',
    'contract_generated',
    'rejected'
));

COMMENT ON COLUMN properties.acquisition_stage IS 'Current stage: documents_pending -> initial -> (review_required if 70% fails) -> passed_70_rule -> inspection_done -> passed_80_rule -> contract_generated -> rejected';

