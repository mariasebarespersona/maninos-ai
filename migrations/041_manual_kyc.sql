-- Migration 041: Manual KYC - Replace Sumsub with document upload
-- 
-- Flow: Client uploads ID photos + selfie → Capital reviews and approves/rejects
-- No external service needed.
--
-- The kyc_documents JSONB column already exists (migration 012).
-- We'll store: { id_front_url, id_back_url, selfie_url, id_type, submitted_at }

-- Add review tracking columns
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_reviewed_by TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_reviewed_at TIMESTAMPTZ;

-- Clean up: allow 'pending_review' as a kyc_status value
-- Drop old constraint and create a more flexible one
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_kyc_status_check;
ALTER TABLE clients ADD CONSTRAINT clients_kyc_status_check 
    CHECK (kyc_status IN ('unverified', 'pending', 'pending_review', 'verified', 'failed', 'requires_input'));

