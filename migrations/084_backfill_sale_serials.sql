-- ============================================================================
-- Migration 084: Backfill tdhca_serial / tdhca_label on sale transfers
-- ============================================================================
-- Bug: When a property was sold, the new title_transfer (transfer_type='sale')
-- was created without the serial/label from the purchase transfer. As a result
-- the Títulos page showed sold houses without their serial number.
--
-- This backfill copies tdhca_serial, tdhca_label, and tdhca_owner_name from
-- the purchase transfer to the corresponding sale transfer of the same
-- property, only when the sale transfer has those fields NULL.
-- ============================================================================

UPDATE title_transfers AS sale_t
SET
    tdhca_serial     = COALESCE(sale_t.tdhca_serial,     purchase_t.tdhca_serial),
    tdhca_label      = COALESCE(sale_t.tdhca_label,      purchase_t.tdhca_label),
    tdhca_owner_name = COALESCE(sale_t.tdhca_owner_name, purchase_t.tdhca_owner_name)
FROM title_transfers AS purchase_t
WHERE sale_t.transfer_type = 'sale'
  AND purchase_t.transfer_type = 'purchase'
  AND sale_t.property_id = purchase_t.property_id
  AND (
    sale_t.tdhca_serial IS NULL
    OR sale_t.tdhca_label IS NULL
    OR sale_t.tdhca_owner_name IS NULL
  );
