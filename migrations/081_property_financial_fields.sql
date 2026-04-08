-- Add financial override fields to properties table
-- These allow manual edits to renovation_cost, move_cost, commission, and margin
-- When NULL, the system calculates them from renovations/moves tables and business rules

ALTER TABLE properties ADD COLUMN IF NOT EXISTS renovation_cost DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS move_cost DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS commission DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS margin DECIMAL(12,2) DEFAULT NULL;
