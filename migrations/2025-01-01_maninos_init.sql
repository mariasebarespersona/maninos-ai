-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create properties table for Maninos AI
CREATE TABLE IF NOT EXISTS public.properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    park_name TEXT,
    asking_price NUMERIC,
    market_value NUMERIC,
    arv NUMERIC, -- After Repair Value
    repair_estimate NUMERIC,
    title_status TEXT CHECK (title_status IN ('Clean/Blue', 'Missing', 'Lien', 'Other')),
    status TEXT DEFAULT 'New' CHECK (status IN ('New', 'Review Required', 'Ready to Buy', 'Rejected')),
    acquisition_stage TEXT DEFAULT 'initial' CHECK (acquisition_stage IN ('initial', 'passed_70_rule', 'inspection_done', 'passed_80_rule', 'rejected')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    user_id UUID -- Optional: link to auth.users if needed
);

-- Add comments for clarity
COMMENT ON COLUMN public.properties.arv IS 'After Repair Value';
COMMENT ON COLUMN public.properties.title_status IS 'Status of the mobile home title';
COMMENT ON COLUMN public.properties.acquisition_stage IS 'Acquisition flow stage: initial -> passed_70_rule -> inspection_done -> passed_80_rule or rejected';

-- Enable RLS (Row Level Security) - though specific policies are not defined here yet
ALTER TABLE public.properties ENABLE ROW LEVEL SECURITY;

-- Create policy to allow all access for now (development mode)
-- You might want to restrict this in production
CREATE POLICY "Allow all access to properties" ON public.properties
    FOR ALL USING (true) WITH CHECK (true);

