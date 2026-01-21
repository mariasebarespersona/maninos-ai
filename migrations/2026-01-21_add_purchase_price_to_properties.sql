-- Migration: Add purchase_price column to properties table
-- Date: 2026-01-21
-- Purpose: Allow tracking of actual purchase price when property is acquired

-- Add purchase_price column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS purchase_price NUMERIC;

-- Add purchase_date column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS purchase_date DATE;

-- Add lot_rent column (monthly lot rent for mobile home parks)
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS lot_rent NUMERIC;

-- Add year_built column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS year_built INTEGER;

-- Add bedrooms column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS bedrooms INTEGER;

-- Add bathrooms column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS bathrooms NUMERIC;

-- Add square_feet column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS square_feet INTEGER;

-- Add hud_number column (HUD label number for manufactured homes)
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS hud_number TEXT;

-- Add vin_number column (Vehicle Identification Number for mobile homes)
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS vin_number TEXT;

-- Add inventory_status column (to track if property is available for RTO)
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS inventory_status TEXT DEFAULT 'potential' 
    CHECK (inventory_status IN ('potential', 'owned', 'available', 'contracted', 'sold'));

-- Add notes column
ALTER TABLE properties 
    ADD COLUMN IF NOT EXISTS notes TEXT;

-- Update acquisition_stage CHECK constraint to include new stages
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_acquisition_stage_check;
ALTER TABLE properties ADD CONSTRAINT properties_acquisition_stage_check 
    CHECK (acquisition_stage IN (
        'initial', 'sourcing', 'evaluacion', 'negociacion', 'cierre_compra',
        'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected'
    ));

-- Add index for inventory status queries
CREATE INDEX IF NOT EXISTS idx_properties_inventory_status ON properties(inventory_status);

-- Verification
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'properties' AND column_name = 'purchase_price') THEN
        RAISE NOTICE '✅ purchase_price column added to properties';
    END IF;
END $$;

