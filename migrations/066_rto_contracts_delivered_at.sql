-- Migration 066: Add delivered_at column and 'delivered' status to rto_contracts
-- Used when title is delivered to client after all RTO payments completed.

ALTER TABLE rto_contracts ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ;

ALTER TABLE rto_contracts DROP CONSTRAINT IF EXISTS rto_contracts_status_check;

ALTER TABLE rto_contracts ADD CONSTRAINT rto_contracts_status_check
  CHECK (status IN ('draft', 'pending_signature', 'active', 'completed', 'delivered', 'defaulted', 'terminated', 'holdover'));
