-- ============================================================================
-- Migration 100: Promissory-note two-tranche terms
--   A note's term is now split into two tranches:
--     • interest_only_months — Tranche 1: pay interest only, principal fixed.
--     • amortization_months  — Tranche 2: fixed payment (principal+interest),
--       interest recomputed on the DECLINING balance, principal amortizes.
--   term_months stays = interest_only_months + amortization_months.
-- Additive. Backfill preserves existing notes' economics.
-- ============================================================================

ALTER TABLE promissory_notes
    ADD COLUMN IF NOT EXISTS interest_only_months INTEGER,
    ADD COLUMN IF NOT EXISTS amortization_months INTEGER;

-- Backfill existing notes: they were created under the old simple-interest model
-- (interest every month on the original principal, principal paid as a balloon at
-- maturity). That is exactly an all-interest-only note with a balloon, so:
--   interest_only_months = term_months, amortization_months = 0.
-- This keeps their stored total_interest / total_due unchanged.
UPDATE promissory_notes
SET interest_only_months = COALESCE(interest_only_months, term_months),
    amortization_months  = COALESCE(amortization_months, 0)
WHERE interest_only_months IS NULL OR amortization_months IS NULL;
