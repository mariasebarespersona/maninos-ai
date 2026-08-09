---
name: Title transfer monitoring flow (TDHCA + manual uploads)
description: How serial/label populate works, BOS fallback, and how manual uploads bypass the daily scheduler.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
Title transfers (`title_transfers` table) track Texas Department of Housing & Community Affairs (TDHCA) ownership changes.

**Auto flow** (`api/services/title_monitor.py`):
- `populate_tdhca_fields_from_document_data(transfer_id)` reads `properties.document_data`:
  1. First tries `title_app_{purchase|sale}.tdhca_serial` and `.tdhca_label`.
  2. **Fallback**: if empty, reads `bos_{type}.hud_label_number`. This is critical for legacy properties (e.g. B70) where the title was only captured in the Bill-of-Sale step, not in a TDHCA application.
- Daily 10:00 CT job hits TDHCA web (`mhweb.tdhca.state.tx.us`), looks up serial, fuzzy-matches owner name vs `to_name`. Sets `title_name_updated=TRUE` when match.

**Manual uploads** (`ManualTitleUploadModal` + `POST /api/transfers/manual-upload`):
- For old houses already title-transferred outside the system.
- Always saved with `status='completed'` and `title_name_updated=TRUE` so the scheduler **skips them**.
- `is_manual_upload=TRUE`, `manual_upload_notes` populated. Migration 086.
- If property is sold (`sold_to_name` provided OR `property.status='sold'`), creates a SALE transfer too (not just purchase).

**UI**:
- `/homes/transfers` page. Serial/Label column is a clickable link to `https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp` for both auto and manual uploads.
- "Nombre TDHCA" column shows `tdhca_owner_name` (the name TDHCA returns, used for fuzzy matching).
- Manual upload endpoint always **INSERT** new row (no upsert) — there can be multiple transfers of the same type per property (purchase + multiple resales). User explicitly reverted an upsert change on 2026-04-22.

**How to apply:** When someone reports "no serial showing" — first check `properties.document_data.bos_{type}.hud_label_number`. When debugging "scheduler didn't update X" — check that `title_name_updated` isn't already TRUE (manual uploads are excluded by design).
