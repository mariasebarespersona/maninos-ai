-- Migration 056: Client Tracking / Follow-up
-- Adds assigned employee and client notes for follow-up tracking

-- Add assigned employee to clients
ALTER TABLE clients ADD COLUMN IF NOT EXISTS assigned_employee_id UUID REFERENCES users(id);

-- Create client_notes table
CREATE TABLE IF NOT EXISTS client_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id),
  note_type TEXT NOT NULL DEFAULT 'observation' CHECK (note_type IN ('observation', 'comment', 'follow_up', 'call_log')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_client_notes_client_id ON client_notes(client_id);
CREATE INDEX IF NOT EXISTS idx_client_notes_author_id ON client_notes(author_id);
