-- ============================================
-- Migration 004: Document Uploads
-- ============================================
-- Changes documents_checklist from boolean to object with file URLs
-- Each document now stores: { checked: boolean, file_url: string | null, uploaded_at: timestamp | null }

-- Update the default value for new records
ALTER TABLE title_transfers 
ALTER COLUMN documents_checklist 
SET DEFAULT '{
    "bill_of_sale": {"checked": false, "file_url": null, "uploaded_at": null},
    "title_application": {"checked": false, "file_url": null, "uploaded_at": null},
    "tax_receipt": {"checked": false, "file_url": null, "uploaded_at": null},
    "id_copies": {"checked": false, "file_url": null, "uploaded_at": null},
    "lien_release": {"checked": false, "file_url": null, "uploaded_at": null},
    "notarized_forms": {"checked": false, "file_url": null, "uploaded_at": null}
}'::jsonb;

-- Migrate existing data: convert boolean values to new format
UPDATE title_transfers
SET documents_checklist = jsonb_build_object(
    'bill_of_sale', jsonb_build_object('checked', COALESCE((documents_checklist->>'bill_of_sale')::boolean, false), 'file_url', null, 'uploaded_at', null),
    'title_application', jsonb_build_object('checked', COALESCE((documents_checklist->>'title_application')::boolean, false), 'file_url', null, 'uploaded_at', null),
    'tax_receipt', jsonb_build_object('checked', COALESCE((documents_checklist->>'tax_receipt')::boolean, false), 'file_url', null, 'uploaded_at', null),
    'id_copies', jsonb_build_object('checked', COALESCE((documents_checklist->>'id_copies')::boolean, false), 'file_url', null, 'uploaded_at', null),
    'lien_release', jsonb_build_object('checked', COALESCE((documents_checklist->>'lien_release')::boolean, false), 'file_url', null, 'uploaded_at', null),
    'notarized_forms', jsonb_build_object('checked', COALESCE((documents_checklist->>'notarized_forms')::boolean, false), 'file_url', null, 'uploaded_at', null)
)
WHERE documents_checklist IS NOT NULL;

-- ============================================
-- BUCKET SETUP (run in Supabase Dashboard)
-- ============================================
-- 1. Go to Storage in Supabase Dashboard
-- 2. Create bucket named: "transaction-documents"
-- 3. Set as PUBLIC (for easy download links)
-- 4. Or keep PRIVATE and use signed URLs

