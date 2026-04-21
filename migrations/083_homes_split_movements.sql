-- Migration 083: Add split support to Homes statement_movements
-- Mirrors Capital's capital_statement_movements split feature

ALTER TABLE statement_movements ADD COLUMN IF NOT EXISTS parent_movement_id UUID REFERENCES statement_movements(id);
ALTER TABLE statement_movements ADD COLUMN IF NOT EXISTS is_split_parent BOOLEAN DEFAULT false;
