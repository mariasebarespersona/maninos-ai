-- Migration: Add acquisition_stage to existing properties
-- Purpose: Track acquisition flow progress for MANINOS AI
-- Created: 2025-01-02

-- Add acquisition_stage column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'properties' 
        AND column_name = 'acquisition_stage'
    ) THEN
        ALTER TABLE public.properties 
        ADD COLUMN acquisition_stage TEXT DEFAULT 'initial' 
        CHECK (acquisition_stage IN ('initial', 'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected'));
        
        COMMENT ON COLUMN public.properties.acquisition_stage IS 'Acquisition flow stage: initial -> passed_70_rule -> inspection_done -> passed_80_rule or rejected';
    END IF;
END $$;

-- Update existing properties to have initial stage
UPDATE public.properties 
SET acquisition_stage = 'initial' 
WHERE acquisition_stage IS NULL;

