-- Migration 051: Add 'pending_payment' to properties status check constraint
-- Required for the payment order workflow where property waits for Abigail's payment

ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;
ALTER TABLE properties ADD CONSTRAINT properties_status_check
  CHECK (status IN ('pending_payment', 'purchased', 'published', 'reserved', 'renovating', 'sold'));
