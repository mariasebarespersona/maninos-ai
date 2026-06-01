-- Migration 096: Fix the "Security Definer View" lint on
-- public.v_bank_accounts_needing_chart_link.
--
-- THE ISSUE:
--   A normal Postgres view runs with the privileges of the view OWNER, not
--   the querying user (this is the SECURITY DEFINER behavior the Supabase
--   advisor flags). That means the view would BYPASS the row level security
--   we just enabled on bank_accounts in migration 095 — an anon/authenticated
--   caller could read bank_accounts data *through* this view even though the
--   table itself is locked down.
--
-- THE FIX:
--   Set `security_invoker = on` so the view enforces the permissions and RLS
--   of the CALLER instead of the owner (Postgres 15+, which Supabase runs).
--
-- WHY THIS IS SAFE — VERIFIED 2026-06-01:
--   - This view is NOT referenced anywhere in the codebase (api/, core/,
--     tools/, web/src) — it is a manual "which banks still need a chart
--     link" diagnostic helper, created in migration 089.
--   - Backend uses the service_role key (BYPASSRLS), so with security_invoker
--     on it still sees every row — no functional change to any flow.
--   - Browser sessions get 0 rows (bank_accounts has RLS + no policies after
--     095) — which is the desired, secure behavior.
--
-- Idempotent: ALTER VIEW ... SET is safe to re-run.

BEGIN;

ALTER VIEW public.v_bank_accounts_needing_chart_link SET (security_invoker = on);

COMMIT;

-- ── Verification ────────────────────────────────────────────────────
-- Confirm the view now runs as invoker (reloptions should contain
-- security_invoker=on):
--
--   SELECT relname, reloptions
--   FROM pg_class
--   WHERE relname = 'v_bank_accounts_needing_chart_link';
--
--   Expected: reloptions = {security_invoker=on}
--
-- Anon should get [] through the view; service_role should still get rows.
