-- Make financial reports immutable
ALTER TABLE saved_financial_statements
  ADD COLUMN IF NOT EXISTS is_locked BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS locked_by TEXT;

-- Prevent updates to locked reports
-- (enforcement done at API level)
