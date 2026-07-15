-- Migration 101: allow ad-hoc (non-employee) commission recipients.
--
-- A commission half (found_by / sold_by) can now go to a FREE-TEXT person name
-- — someone external without a Maninos user account or email — not only a
-- Maninos employee. Everything downstream (the payable invoice, the accrual
-- Comisión→A/P, the payment A/P→bank, the pending/paid tracking) is unchanged;
-- only "who" can now be a plain name.
--
--   commission_payments.employee_id  -> nullable (was NOT NULL, FK to users)
--   commission_payments.payee_name   -> the recipient's name (always set now,
--                                       for both employees and ad-hoc people)
--   sales.found_by_name / sold_by_name -> the ad-hoc name for each role (NULL
--                                         when a Maninos employee is used)
--
-- Safe / idempotent. Run in the Supabase SQL editor.

ALTER TABLE commission_payments ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE commission_payments ADD COLUMN IF NOT EXISTS payee_name TEXT;

ALTER TABLE sales ADD COLUMN IF NOT EXISTS found_by_name TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_by_name TEXT;
