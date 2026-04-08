-- Migration 081: Add financial override fields to properties table
-- These allow manual edits to renovation_cost, move_cost, commission, and margin
-- When NULL, the system calculates them from renovations/moves tables and business rules
-- Run this in Supabase SQL Editor

ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS renovation_cost DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS move_cost DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS commission DECIMAL(12,2) DEFAULT NULL;
ALTER TABLE public.properties ADD COLUMN IF NOT EXISTS margin DECIMAL(12,2) DEFAULT NULL;

COMMENT ON COLUMN public.properties.renovation_cost IS 'Manual override for renovation cost. NULL = auto-calculated from renovations table.';
COMMENT ON COLUMN public.properties.move_cost IS 'Manual override for move cost. NULL = auto-calculated from moves table.';
COMMENT ON COLUMN public.properties.commission IS 'Manual override for commission. NULL = default $1,500.';
COMMENT ON COLUMN public.properties.margin IS 'Manual override for margin. NULL = default $9,500.';
