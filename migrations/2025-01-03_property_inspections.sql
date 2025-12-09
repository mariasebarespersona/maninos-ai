-- Migration: Property Inspections Table (MANINOS AI)
-- Purpose: Store inspection history for mobile homes
-- Created: 2025-01-02

-- Create property_inspections table
CREATE TABLE IF NOT EXISTS property_inspections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    
    -- Inspection data
    defects JSONB NOT NULL DEFAULT '[]'::jsonb,  -- List of defect keys: ["roof", "hvac", "plumbing"]
    title_status TEXT,  -- "Clean/Blue", "Missing", "Lien", "Other"
    repair_estimate NUMERIC(12, 2),  -- Auto-calculated from defects
    
    -- Notes
    notes TEXT,
    
    -- Metadata
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT,  -- Optional: user/agent who created
    
    -- Indexes
    CONSTRAINT valid_title_status CHECK (title_status IN ('Clean/Blue', 'Missing', 'Lien', 'Other', NULL))
);

-- Create indexes for performance (idempotent)
CREATE INDEX IF NOT EXISTS idx_property_inspections_property_id ON property_inspections(property_id);
CREATE INDEX IF NOT EXISTS idx_property_inspections_created_at ON property_inspections(created_at DESC);

-- Enable Row Level Security
ALTER TABLE property_inspections ENABLE ROW LEVEL SECURITY;

-- Create policy: Allow all operations (no auth yet) - Idempotent
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'property_inspections' 
        AND policyname = 'Allow all access to property_inspections'
    ) THEN
        CREATE POLICY "Allow all access to property_inspections"
            ON property_inspections
            FOR ALL
            USING (true)
            WITH CHECK (true);
    END IF;
END $$;

-- Comment
COMMENT ON TABLE property_inspections IS 'Inspection history for mobile homes (MANINOS AI)';
COMMENT ON COLUMN property_inspections.defects IS 'List of defect keys found during inspection (e.g., ["roof", "hvac"])';
COMMENT ON COLUMN property_inspections.repair_estimate IS 'Auto-calculated repair cost based on defects using DEFECT_COSTS';

