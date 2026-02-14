-- ============================================================================
-- Migration 033: Link bank_statements to bank_accounts table (dynamic accounts)
-- ============================================================================
-- Adds bank_account_id FK to bank_statements so accounts are dynamic,
-- not limited to the original hardcoded set.
-- Also seeds the 4 original hardcoded accounts into bank_accounts if missing.
-- ============================================================================

-- 1. Seed the 4 original bank accounts if they don't already exist
INSERT INTO bank_accounts (name, account_type, current_balance, is_active)
SELECT 'Cuenta Conroe', 'checking', 0, true
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE LOWER(name) LIKE '%conroe%');

INSERT INTO bank_accounts (name, account_type, current_balance, is_active)
SELECT 'Cuenta Houston', 'checking', 0, true
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE LOWER(name) LIKE '%houston%');

INSERT INTO bank_accounts (name, account_type, current_balance, is_active)
SELECT 'Cuenta Dallas', 'checking', 0, true
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE LOWER(name) LIKE '%dallas%');

INSERT INTO bank_accounts (name, account_type, current_balance, is_active)
SELECT 'Cuenta Cash', 'other', 0, true
WHERE NOT EXISTS (SELECT 1 FROM bank_accounts WHERE LOWER(name) LIKE '%cash%');

-- 2. Add bank_account_id column
ALTER TABLE bank_statements
  ADD COLUMN IF NOT EXISTS bank_account_id UUID REFERENCES bank_accounts(id);

-- 3. Drop the CHECK constraint on account_key so new dynamic account keys work
DO $$
BEGIN
  BEGIN
    ALTER TABLE bank_statements DROP CONSTRAINT IF EXISTS bank_statements_account_key_check;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END $$;

-- 4. Back-fill bank_account_id for existing statements by matching account_key to bank_account name
-- Maps 'conroe' -> bank account with name ILIKE '%conroe%', etc.
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

-- 5. Create index on the new column
CREATE INDEX IF NOT EXISTS idx_bank_statements_bank_account_id ON bank_statements(bank_account_id);
