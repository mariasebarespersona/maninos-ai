-- Migration: Add 'review_required*' stages
-- Date: 2025-12-15
-- Description: Adds blocking stages for:
--   - 70% rule failures (review_required)
--   - Title status issues (review_required_title)
--   - 80% rule failures (review_required_80)

-- Drop existing constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;

-- Add updated constraint with all review stages
ALTER TABLE properties ADD CONSTRAINT properties_acquisition_stage_check 
CHECK (acquisition_stage IN (
    'documents_pending',
    'initial',
    'review_required',          -- ⬅️ NEW: 70% rule failed - needs justification
    'passed_70_rule',
    'review_required_title',    -- ⬅️ NEW: Title Missing/Lien - needs action plan
    'inspection_done',
    'review_required_80',       -- ⬅️ NEW: 80% rule failed - needs justification
    'passed_80_rule',
    'contract_generated',
    'rejected'
));

COMMENT ON COLUMN properties.acquisition_stage IS 'Current stage: documents_pending -> initial -> (review_required if 70% fails) -> passed_70_rule -> (review_required_title if title problematic) -> inspection_done -> (review_required_80 if 80% fails) -> passed_80_rule -> contract_generated -> rejected';

