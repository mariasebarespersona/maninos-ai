-- Migration 038: KYC Request Flow
-- Adds columns so Capital can REQUEST a client to verify identity,
-- and the client completes it from their own portal.

-- Flag: Capital has requested KYC verification from this client
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_requested BOOLEAN DEFAULT FALSE;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS kyc_requested_at TIMESTAMPTZ;

-- Add index for fast lookup of clients with pending KYC requests
CREATE INDEX IF NOT EXISTS idx_clients_kyc_requested ON clients (kyc_requested) WHERE kyc_requested = TRUE AND kyc_verified = FALSE;

