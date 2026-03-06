-- Migration 052: Create receipts table for storing receipt photos/files
-- Used in Contabilidad → Recibos tab

CREATE TABLE IF NOT EXISTS receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT,
  vendor_name TEXT,
  amount NUMERIC(12,2),
  receipt_date DATE,
  file_url TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type TEXT,
  original_filename TEXT,
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_receipts_created_at ON receipts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipts_property_id ON receipts(property_id);
