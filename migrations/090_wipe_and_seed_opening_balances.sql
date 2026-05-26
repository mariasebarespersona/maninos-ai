-- Migration 090: Wipe transactional accounting data + seed opening balances
--
-- ⚠️  DESTRUCTIVE — IRREVERSIBLE  ⚠️
-- This wipes ALL accounting transactional data and then writes one
-- "opening balance" journal entry per bank account. Run ONLY when
-- the client is ready to start clean.
--
-- Master data preserved:
--   - accounting_accounts  (chart of accounts stays)
--   - bank_accounts        (the 6 banks stay; just their derived balance resets)
--
-- Truncated:
--   - accounting_transactions
--   - accounting_invoices
--   - accounting_invoice_payments
--   - bank_statements
--   - statement_movements
--   - accounting_audit_log
--   - commission_payments  (their accounting_transaction_id FKs would dangle)
--   - sale_payments        (same — they were attribution rows that drove
--                           inbound payment_orders, which we also clear)
--   - payment_orders       (their accounting_transaction_id FKs would dangle)

BEGIN;

-- ---- Wipe -----------------------------------------------------------------
TRUNCATE TABLE
  statement_movements,
  bank_statements,
  accounting_invoice_payments,
  accounting_invoices,
  accounting_audit_log,
  accounting_transactions,
  commission_payments,
  sale_payments,
  payment_orders
RESTART IDENTITY CASCADE;

-- Reset the stored current_balance column so legacy callers don't see stale
-- numbers between the wipe and the first /api/accounting/bank-accounts call
-- (where the API recomputes it from the ledger).
UPDATE bank_accounts SET current_balance = 0;

-- ---- Opening balance journal entries -------------------------------------
-- One pair per bank: debit bank chart account, credit "Opening balance equity".
-- The derived-balance machinery (api.services.ledger.get_bank_balance) reads
-- accounting_transactions filtered by bank_account_id, so the bank-leg row
-- here is what makes the saldo show up in the UI.
--
-- Reference numbers chosen at random (mid-five-figures total) so you have
-- something to test against. Adjust before running if you want different
-- starting points.

DO $$
DECLARE
  v_ob_account_id UUID;
  v_today DATE := CURRENT_DATE;

  v_bank RECORD;
  v_serial INT := 1;
  v_serial_str TEXT;
  v_debit_id UUID;
  v_credit_id UUID;

  v_opening_balances JSONB := '[
    {"bank": "Cuenta Dallas",       "amount": 45237.18},
    {"bank": "Cuenta Houston",      "amount": 28492.55},
    {"bank": "Cuenta Conroe",       "amount": 15890.41},
    {"bank": "Cuenta Dallas Cash",  "amount": 3650.00},
    {"bank": "Cuenta Houston Cash", "amount": 4275.89},
    {"bank": "Cuenta Conroe Cash",  "amount": 2810.50}
  ]'::JSONB;

  v_entry JSONB;
  v_bank_id UUID;
  v_bank_chart_id UUID;
  v_amount NUMERIC;
BEGIN
  -- Resolve the equity account once
  SELECT id INTO v_ob_account_id
  FROM accounting_accounts
  WHERE code = 'Opening balance equity'
  LIMIT 1;

  IF v_ob_account_id IS NULL THEN
    RAISE EXCEPTION 'Could not find "Opening balance equity" chart account. Aborting.';
  END IF;

  FOR v_entry IN SELECT * FROM jsonb_array_elements(v_opening_balances) LOOP
    SELECT id, accounting_account_id
      INTO v_bank_id, v_bank_chart_id
      FROM bank_accounts
      WHERE name = v_entry->>'bank'
      LIMIT 1;

    IF v_bank_id IS NULL THEN
      RAISE NOTICE 'Bank "%" not found — skipping', v_entry->>'bank';
      CONTINUE;
    END IF;
    IF v_bank_chart_id IS NULL THEN
      RAISE NOTICE 'Bank "%" has no accounting_account_id (run migration 089 first) — skipping', v_entry->>'bank';
      CONTINUE;
    END IF;

    v_amount := (v_entry->>'amount')::NUMERIC;
    v_serial_str := 'TXN-OB-' || TO_CHAR(v_today, 'YYMMDD') || '-' || LPAD(v_serial::TEXT, 3, '0');

    -- Debit: bank receives cash (the seed balance arrives in the bank).
    INSERT INTO accounting_transactions (
      transaction_number, transaction_date, transaction_type,
      amount, is_income,
      account_id, bank_account_id,
      counterparty_name, counterparty_type,
      entity_type, entity_id,
      description, status, notes
    ) VALUES (
      v_serial_str || '-D', v_today, 'adjustment',
      v_amount, TRUE,
      v_bank_chart_id, v_bank_id,
      'Opening balance', 'system',
      'opening_balance', NULL,
      'Saldo inicial: ' || (v_entry->>'bank'), 'reconciled',
      'Asiento de apertura — migration 090'
    )
    RETURNING id INTO v_debit_id;

    -- Credit: Opening Balance Equity (no bank leg).
    INSERT INTO accounting_transactions (
      transaction_number, transaction_date, transaction_type,
      amount, is_income,
      account_id, bank_account_id,
      counterparty_name, counterparty_type,
      entity_type, entity_id,
      description, status, notes,
      linked_transaction_id
    ) VALUES (
      -- is_income=TRUE on the equity contra so it aligns with the
      -- convention post_to_ledger uses (credit-to-equity-account stores
      -- is_income=TRUE so _signed_balance treats it as a positive
      -- contribution). Previously this was FALSE which produced a
      -- negative equity total on the Balance Sheet.
      v_serial_str || '-C', v_today, 'adjustment',
      v_amount, TRUE,
      v_ob_account_id, NULL,
      'Opening balance', 'system',
      'opening_balance', NULL,
      'Saldo inicial: ' || (v_entry->>'bank'), 'reconciled',
      'Asiento de apertura — migration 090',
      v_debit_id
    )
    RETURNING id INTO v_credit_id;

    -- Wire the debit's linked_transaction_id back to the credit.
    UPDATE accounting_transactions
      SET linked_transaction_id = v_credit_id
      WHERE id = v_debit_id;

    -- Mirror the derived balance into the stored column (legacy UI reads this).
    UPDATE bank_accounts SET current_balance = v_amount WHERE id = v_bank_id;

    v_serial := v_serial + 1;
  END LOOP;
END $$;

COMMIT;

-- After running this, verify in the SQL editor:
--   SELECT name, current_balance FROM bank_accounts ORDER BY name;
-- and via the API:
--   curl https://maninos-ai-production.up.railway.app/api/accounting/bank-accounts
-- should show derived_balance matching the opening balances above.
