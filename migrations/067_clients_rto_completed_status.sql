-- Migration 067: Add 'rto_completed' to clients status check constraint
-- Used when client completes all RTO payments and title is delivered.

ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_status_check;

ALTER TABLE clients ADD CONSTRAINT clients_status_check
  CHECK (status IN ('lead', 'active', 'rto_applicant', 'rto_active', 'completed', 'rto_completed', 'inactive'));
