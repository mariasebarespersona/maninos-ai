-- ============================================================================
-- ONE-OFF: Create kyc-documents storage bucket + policies
-- Run this in Supabase SQL Editor
-- ============================================================================

-- 1. Create the bucket (public so getPublicUrl works)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'kyc-documents', 
    'kyc-documents', 
    true,
    10485760,  -- 10MB
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 10485760,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

-- 2. Allow anyone to READ (public bucket for getPublicUrl)
CREATE POLICY "Public read kyc-documents"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'kyc-documents');

-- 3. Allow service_role to INSERT (upload)
CREATE POLICY "Service role upload kyc-documents"
    ON storage.objects FOR INSERT
    TO service_role
    WITH CHECK (bucket_id = 'kyc-documents');

-- 4. Allow service_role to UPDATE (upsert)
CREATE POLICY "Service role update kyc-documents"
    ON storage.objects FOR UPDATE
    TO service_role
    USING (bucket_id = 'kyc-documents');

-- 5. Allow service_role to DELETE
CREATE POLICY "Service role delete kyc-documents"
    ON storage.objects FOR DELETE
    TO service_role
    USING (bucket_id = 'kyc-documents');

-- Verify
SELECT id, name, public FROM storage.buckets WHERE id = 'kyc-documents';

