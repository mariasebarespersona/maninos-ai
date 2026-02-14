-- Migration 021: Track which employee created/found each client
-- This enables automatic commission assignment:
--   found_by = whoever created the client (lead)
--   sold_by = whoever is creating the sale
--
-- Run this in Supabase SQL Editor.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES users(id);

COMMENT ON COLUMN clients.created_by_user_id IS 'The team member (user) who created/found this client. Used for automatic found_by commission assignment.';

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by_user_id);

