-- Migration 095: Enable RLS on EVERY backend-only table in the public schema.
--
-- This supersedes / includes migration 094 (materials, renovation_items,
-- title_transfers, moves). If 094 already ran, those 4 are simply skipped
-- here (their RLS is already on). You only need to run THIS file.
--
-- WHY THIS IS SAFE — VERIFIED 2026-06-01 against the codebase:
--   The browser side of the Maninos app talks to Supabase ONLY for:
--     - Supabase Auth   (login / session)        → `auth`   schema, not public
--     - Supabase Storage (file uploads/downloads) → `storage` schema, not public
--   Every database TABLE read/write goes through Next.js → FastAPI on Railway,
--   and FastAPI builds its Supabase client with SUPABASE_SERVICE_ROLE_KEY.
--   Confirmed: there is NO `supabase.from('<table>')` query anywhere in
--   web/src — the only `.from(...)` calls in the frontend target Storage
--   buckets (property-photos, transaction-documents, documents, KYC).
--
--   Two PostgreSQL facts make this a zero-risk change for the backend:
--     1. The `service_role` key has the BYPASSRLS attribute, so PostgREST
--        calls made by FastAPI ignore RLS entirely.
--     2. `ENABLE ROW LEVEL SECURITY` (without FORCE) does NOT apply to the
--        table OWNER or to superusers. So the direct Postgres connection
--        used by LangGraph (Session Pooler, owner role) also keeps full
--        access.
--
--   Net effect:
--     ✓ Backend (service_role + owner connection) → full read/write, no change
--     ✗ Anon / authenticated browser sessions      → ZERO direct table access
--
-- WHAT THIS DOES:
--   Loops over every ORDINARY TABLE (relkind = 'r') in `public` that does
--   not already have RLS, and enables it WITHOUT adding any policy. With RLS
--   on and zero policies, PostgREST returns 0 rows / 403 for any non-service
--   caller — exactly what we want for backend-only tables.
--
--   Skipped on purpose:
--     - Views and materialized views (RLS is meaningless on them; if the
--       advisor flags a "security definer view" that is a SEPARATE lint with
--       a different fix — handled elsewhere).
--     - Tables owned by an extension (pg_depend deptype 'e'), e.g. PostGIS
--       spatial_ref_sys — we don't own those and shouldn't alter them here.
--
-- Idempotent: re-running is a no-op once every table has RLS.

BEGIN;

DO $$
DECLARE
  r RECORD;
  n INT := 0;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    WHERE ns.nspname = 'public'
      AND c.relkind = 'r'              -- ordinary base tables only
      AND c.relrowsecurity = false     -- only those still missing RLS
      AND NOT EXISTS (                 -- skip extension-owned tables
        SELECT 1 FROM pg_depend d
        WHERE d.objid = c.oid AND d.deptype = 'e'
      )
    ORDER BY c.relname
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.relname);
    RAISE NOTICE 'RLS enabled on public.%', r.relname;
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'Migration 095: enabled RLS on % table(s).', n;
END $$;

COMMIT;

-- ── Verification ────────────────────────────────────────────────────
-- 1) Every public table should now have RLS on (expect ZERO rows back):
--
--   SELECT c.relname
--   FROM pg_class c
--   JOIN pg_namespace ns ON ns.oid = c.relnamespace
--   WHERE ns.nspname = 'public'
--     AND c.relkind = 'r'
--     AND c.relrowsecurity = false
--     AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e');
--
-- 2) Anon can't read a backend-only table (expect []):
--
--   curl -s "$SUPABASE_URL/rest/v1/sales?limit=1" \
--        -H "apikey: $SUPABASE_ANON_KEY" \
--        -H "Authorization: Bearer $SUPABASE_ANON_KEY"
--
-- 3) Service role still works (expect row data):
--
--   curl -s "$SUPABASE_URL/rest/v1/sales?limit=1" \
--        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
--        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
--
-- After running, smoke-test the app: Homes ops, Capital portal, Clientes
-- catalog/purchase — all go through FastAPI, so all should be unaffected.
