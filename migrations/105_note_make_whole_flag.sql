-- Migration 105: per-note early-payoff interest policy (CAPITAL only).
--
-- make_whole = FALSE (default) → PRO-RATA: on early payoff the investor is owed
--   only interest accrued to date; future unearned interest is condoned.
-- make_whole = TRUE → the investor is owed the FULL scheduled interest even if
--   Capital pays the note off early.
--
-- ⚠️  Touches ONLY promissory_notes (Maninos CAPITAL). Idempotent.

BEGIN;
ALTER TABLE promissory_notes ADD COLUMN IF NOT EXISTS make_whole BOOLEAN DEFAULT FALSE;
COMMIT;
