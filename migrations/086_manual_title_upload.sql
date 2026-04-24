-- ============================================================================
-- Migration 086: Flag for manually-uploaded titles (old houses without TDHCA)
-- ============================================================================
-- Use case: ops needs to register a title for an older property that was never
-- captured via the Revisar Casa + TDHCA flow. The data is entered by hand and
-- optionally accompanied by a PDF of the physical title.
--
-- is_manual_upload=true tells the UI + scheduler to render these rows with a
-- small "Manual" badge so staff know the tdhca_owner_name might not reflect a
-- real TDHCA lookup yet.
-- ============================================================================

ALTER TABLE title_transfers
    ADD COLUMN IF NOT EXISTS is_manual_upload BOOLEAN DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS manual_upload_notes TEXT;

COMMENT ON COLUMN title_transfers.is_manual_upload IS
    'TRUE when this transfer was created by the manual-title-upload feature (old house, no TDHCA record during purchase)';
