-- ============================================================================
-- Migration 033: Link bank_statements to bank_accounts table (dynamic accounts)
-- ============================================================================
-- Adds bank_account_id FK to bank_statements so accounts are dynamic,
-- not limited to the original hardcoded set.
-- ============================================================================

-- 1. Add bank_account_id column
ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- 2. Drop the CHECK constraint on account_key so new dynamic account keys work
-- PostgreSQL requires knowing the constraint name; we drop and re-create without the restriction.
DO $$
BEGIN
  -- Try to drop the check constraint (name may vary)
  BEGIN
    ALTER TABLE bank_statements DROP CONSTRAINT IF EXISTS bank_statements_account_key_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- constraint doesn't exist, that's fine
  END;
END $$;

-- 3. Back-fill bank_account_id for existing statements by matching account_key to bank_account name patterns
-- This maps 'conroe' -> bank account with name ILIKE '%conroe%', etc.
DO $$
DECLARE
  _key TEXT;
  _ba_id UUID;
BEGIN
  FOR _key IN SELECT DISTINCT account_key FROM bank_statements WHERE bank_account_id IS NULL
  LOOP
    SELECT id INTO _ba_id FROM bank_accounts
      WHERE is_active = true AND LOWER(name) LIKE '%' || _key || '%'
      LIMIT 1;
    IF _ba_id IS NOT NULL THEN
      UPDATE bank_statements SET bank_account_id = _ba_id WHERE account_key = _key AND bank_account_id IS NULL;
    END IF;
  END LOOP;
END $$;

-- 4. Create index on the new column
CREATE INDEX IF NOT EXISTS idx_bank_statements_bank_account_id ON bank_statements(bank_account_id);

