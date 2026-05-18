-- Migration 088: Consignment properties
-- Some properties are bought on consignment: the purchase completes without
-- creating a payment requisition. Once the seller is actually paid, an
-- employee clicks a button in the property detail page that creates the
-- payment_order then.

ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS is_consignment BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS consignment_paid_at TIMESTAMPTZ NULL;

COMMENT ON COLUMN properties.is_consignment IS
  'TRUE if this property was acquired on consignment — payment requisition is deferred.';
COMMENT ON COLUMN properties.consignment_paid_at IS
  'Timestamp when the consignment payment requisition was created (after-the-fact). NULL while still owed.';

CREATE INDEX IF NOT EXISTS idx_properties_consignment_unpaid
  ON properties(is_consignment)
  WHERE is_consignment = TRUE AND consignment_paid_at IS NULL;
