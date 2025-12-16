-- Migration: Fix acquisition_stage CHECK constraint to include all valid stages
-- Date: 2025-12-17
-- Issue: acquisition_stage constraint is outdated and missing newer stages like 
--        'review_required', 'review_required_80', 'review_required_title', 
--        'documents_pending', 'contract_generated'
-- This causes UPDATE failures when trying to set these stages or transition between them

-- Step 1: Drop the old constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;

-- Step 2: Add updated constraint with ALL valid stages
ALTER TABLE properties 
ADD CONSTRAINT properties_acquisition_stage_check 
CHECK (acquisition_stage IN (
    'initial',
    'documents_pending',
    'passed_70_rule',
    'review_required',
    'inspection_done',
    'review_required_title',
    'passed_80_rule',
    'review_required_80',
    'contract_generated',
    'rejected'
));

-- Verification query (run separately to confirm all stages are valid):
-- SELECT DISTINCT acquisition_stage FROM properties ORDER BY acquisition_stage;

COMMENT ON CONSTRAINT properties_acquisition_stage_check ON properties IS 'Valid acquisition stages for mobile home purchase workflow';

