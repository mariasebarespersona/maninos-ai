-- Migration 025: Evaluation Reports
-- Persistent evaluation reports with unique IDs, linked to properties

-- Sequence for report numbers
CREATE SEQUENCE IF NOT EXISTS eval_report_seq START 1;

-- Evaluation reports table
CREATE TABLE IF NOT EXISTS evaluation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_number TEXT UNIQUE NOT NULL,
  -- Linked property (nullable — linked later when purchasing)
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  -- Market listing ID (optional — from which listing evaluation was triggered)
  listing_id UUID,
  -- Checklist: array of {id, category, label, status, confidence, note}
  checklist JSONB NOT NULL DEFAULT '[]',
  -- Extra notes added by employee (free text items)
  extra_notes JSONB DEFAULT '[]',
  -- AI-generated summary
  ai_summary TEXT,
  score INTEGER,
  recommendation TEXT,
  recommendation_reason TEXT,
  -- Property info detected from photos
  property_type TEXT,
  estimated_year TEXT,
  estimated_bedrooms INTEGER,
  photos_coverage TEXT,
  -- Metadata
  photos_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'completed')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_eval_reports_number ON evaluation_reports(report_number);
CREATE INDEX IF NOT EXISTS idx_eval_reports_property ON evaluation_reports(property_id);
CREATE INDEX IF NOT EXISTS idx_eval_reports_status ON evaluation_reports(status);

-- Enable RLS
ALTER TABLE evaluation_reports ENABLE ROW LEVEL SECURITY;

-- Policy: allow all for authenticated users
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'evaluation_reports_all' AND tablename = 'evaluation_reports') THEN
    CREATE POLICY evaluation_reports_all ON evaluation_reports FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

