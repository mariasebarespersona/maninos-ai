-- Migration 048: Title Monitoring
-- Adds columns to title_transfers for automated TDHCA title name monitoring.
-- The system periodically checks if the TDHCA owner name has been updated
-- to match the new owner (to_name) after a property purchase/sale.

-- Monitoring columns on title_transfers
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS tdhca_serial TEXT;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS tdhca_label TEXT;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS tdhca_owner_name TEXT;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS title_name_updated BOOLEAN DEFAULT FALSE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS last_tdhca_check TIMESTAMPTZ;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS next_tdhca_check TIMESTAMPTZ;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS tdhca_check_count INTEGER DEFAULT 0;

-- Index for the monitoring cron job to find transfers needing a check
CREATE INDEX IF NOT EXISTS idx_title_transfers_next_check
  ON title_transfers(next_tdhca_check)
  WHERE title_name_updated = FALSE AND tdhca_serial IS NOT NULL;

COMMENT ON COLUMN title_transfers.tdhca_serial IS 'Serial number from title application, used for TDHCA lookups';
COMMENT ON COLUMN title_transfers.tdhca_label IS 'Label/seal number from title application';
COMMENT ON COLUMN title_transfers.tdhca_owner_name IS 'Current owner name on TDHCA website (last check)';
COMMENT ON COLUMN title_transfers.title_name_updated IS 'TRUE when TDHCA owner matches the transfer to_name';
COMMENT ON COLUMN title_transfers.last_tdhca_check IS 'Last time we checked TDHCA for this transfer';
COMMENT ON COLUMN title_transfers.next_tdhca_check IS 'Next scheduled TDHCA check (set ~30 days after creation or last check)';
COMMENT ON COLUMN title_transfers.tdhca_check_count IS 'Number of times TDHCA has been checked for this transfer';
