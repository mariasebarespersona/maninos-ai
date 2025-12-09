-- Fix status CHECK constraint to include "Proceed to Inspection"
-- This is needed because calculate_maninos_deal returns this status for Step 2

-- Drop existing constraint
ALTER TABLE public.properties DROP CONSTRAINT IF EXISTS properties_status_check;

-- Add new constraint with "Proceed to Inspection"
ALTER TABLE public.properties 
ADD CONSTRAINT properties_status_check 
CHECK (status IN ('New', 'Review Required', 'Ready to Buy', 'Rejected', 'Proceed to Inspection'));

-- Update any existing properties with NULL status to 'New'
UPDATE public.properties 
SET status = 'New' 
WHERE status IS NULL;

