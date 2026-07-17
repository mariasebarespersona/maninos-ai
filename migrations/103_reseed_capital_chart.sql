-- Migration 103: RE-SEED the CAPITAL chart of accounts (capital_accounts ONLY).
--
-- Migration 102 (clean-slate wipe) TRUNCATE'd `capital_accounts`, leaving
-- Maninos CAPITAL with NO chart of accounts — so every Capital ledger posting
-- (investor deposits, RTO income, investor returns, interest, acquisitions…)
-- FAILS with "Chart account with code 'XXXXX' not found". This restores the
-- canonical Capital chart by replaying the exact seed blocks from migrations
-- 042 + 045 + 097. Every INSERT is ON CONFLICT (code) DO NOTHING, so it is
-- idempotent and safe to run more than once.
--
-- ⚠️  This touches ONLY `capital_accounts` (Maninos CAPITAL). It does NOT touch
--     Homes' `accounting_accounts` — the Homes chart was never wiped (102 only
--     removed the per-house sub-accounts, keeping the Homes template intact).
--
-- Run in the Supabase SQL editor.

BEGIN;

-- ===== from migration 042 (base tree, banks, expenses, equity) =============
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('1000', 'Assets', 'asset', 'general', true, 'balance_sheet', 100)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1001', 'Current Assets', 'asset', 'general', true, 'balance_sheet', 110,
  (SELECT id FROM capital_accounts WHERE code = '1000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1010', 'Bank Accounts', 'asset', 'bank', true, 'balance_sheet', 120,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10100', 'Bank and Cash Equivalents', 'asset', 'bank', true, 'balance_sheet', 130,
  (SELECT id FROM capital_accounts WHERE code = '1010'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10110', 'BANK OF AMERICA', 'asset', 'bank', false, 'balance_sheet', 131,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10120', 'BOA CAPITAL 9197', 'asset', 'bank', false, 'balance_sheet', 132,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10130', 'Cash', 'asset', 'bank', false, 'balance_sheet', 133,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10140', 'MONEX BANK', 'asset', 'bank', false, 'balance_sheet', 134,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('10150', 'PNC', 'asset', 'bank', false, 'balance_sheet', 135,
  (SELECT id FROM capital_accounts WHERE code = '10100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1200', 'Accounts Receivable', 'asset', 'receivable', true, 'balance_sheet', 140,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('12000', 'Accounts Receivable (A/R)', 'asset', 'receivable', false, 'balance_sheet', 141,
  (SELECT id FROM capital_accounts WHERE code = '1200'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('1400', 'Other Current Assets', 'asset', 'general', true, 'balance_sheet', 150,
  (SELECT id FROM capital_accounts WHERE code = '1001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14100', 'Loans to others', 'asset', 'general', true, 'balance_sheet', 160,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14110', 'Dallas Opening Costs', 'asset', 'general', false, 'balance_sheet', 161,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14120', 'Loan to Gabriel Cantu', 'asset', 'general', false, 'balance_sheet', 162,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14130', 'SGZ', 'asset', 'general', false, 'balance_sheet', 163,
  (SELECT id FROM capital_accounts WHERE code = '14100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14200', 'Loan to Related Parties', 'asset', 'general', true, 'balance_sheet', 170,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14210', 'Maninos Homes', 'asset', 'general', false, 'balance_sheet', 171,
  (SELECT id FROM capital_accounts WHERE code = '14200'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('2000', 'Liabilities', 'liability', 'general', true, 'balance_sheet', 200)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2001', 'Current Liabilities', 'liability', 'general', true, 'balance_sheet', 210,
  (SELECT id FROM capital_accounts WHERE code = '2000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2200', 'Other Current Liabilities', 'liability', 'general', true, 'balance_sheet', 220,
  (SELECT id FROM capital_accounts WHERE code = '2001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22000', 'Loan from Related Parties', 'liability', 'general', true, 'balance_sheet', 230,
  (SELECT id FROM capital_accounts WHERE code = '2200'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22010', 'Maninos Homes', 'liability', 'general', false, 'balance_sheet', 231,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22020', 'Para Transferir A Maninos Homes', 'liability', 'general', false, 'balance_sheet', 232,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22030', 'SGZ', 'liability', 'general', false, 'balance_sheet', 233,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22040', 'Monex - La Agustedad', 'liability', 'general', false, 'balance_sheet', 234,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('22050', 'La Agustedad - Cofine Loan', 'liability', 'general', false, 'balance_sheet', 235,
  (SELECT id FROM capital_accounts WHERE code = '22000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('2300', 'Long-term Liabilities', 'liability', 'general', true, 'balance_sheet', 240,
  (SELECT id FROM capital_accounts WHERE code = '2000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23000', 'Debt Securities', 'liability', 'general', true, 'balance_sheet', 250,
  (SELECT id FROM capital_accounts WHERE code = '2300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23100', 'VALTO 2', 'liability', 'general', false, 'balance_sheet', 251,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23200', 'VALTO #4 (7)', 'liability', 'general', false, 'balance_sheet', 252,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23300', 'VALTO 5 (8/9)', 'liability', 'general', false, 'balance_sheet', 253,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('3000', 'Equity', 'equity', 'general', true, 'balance_sheet', 300)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('34000', 'Opening balance equity', 'equity', 'general', false, 'balance_sheet', 310,
  (SELECT id FROM capital_accounts WHERE code = '3000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('35000', 'Retained Earnings', 'equity', 'general', false, 'balance_sheet', 320,
  (SELECT id FROM capital_accounts WHERE code = '3000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('4000', 'Income', 'income', 'general', true, 'profit_loss', 400)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('40000', 'Operating Income', 'income', 'general', true, 'profit_loss', 410,
  (SELECT id FROM capital_accounts WHERE code = '4000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('44000', 'Interest earned', 'income', 'general', false, 'profit_loss', 420,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('6000', 'Expenses', 'expense', 'general', true, 'profit_loss', 500)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60000', 'General and Administrative Business Expenses', 'expense', 'general', true, 'profit_loss', 510,
  (SELECT id FROM capital_accounts WHERE code = '6000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60100', 'Commissions & fees', 'expense', 'general', false, 'profit_loss', 520,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60300', 'Legal & accounting services', 'expense', 'general', true, 'profit_loss', 530,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60330', 'Consulting Services', 'expense', 'general', false, 'profit_loss', 531,
  (SELECT id FROM capital_accounts WHERE code = '60300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60340', 'Representation Expenses', 'expense', 'general', false, 'profit_loss', 532,
  (SELECT id FROM capital_accounts WHERE code = '60300'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60500', 'Office expenses', 'expense', 'general', false, 'profit_loss', 540,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('7000', 'Other Income', 'income', 'other', true, 'profit_loss', 600)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('70000', 'OTHER INCOME', 'income', 'other', false, 'profit_loss', 610,
  (SELECT id FROM capital_accounts WHERE code = '7000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order)
VALUES ('7100', 'Other Expenses', 'expense', 'other', true, 'profit_loss', 700)
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('71000', 'Other Business Expenses', 'expense', 'other', true, 'profit_loss', 710,
  (SELECT id FROM capital_accounts WHERE code = '7100'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('71400', 'Interest paid', 'expense', 'other', false, 'profit_loss', 720,
  (SELECT id FROM capital_accounts WHERE code = '71000'))
ON CONFLICT (code) DO NOTHING;

-- ===== from migration 045 (income placeholders 41000/42000/43000) ==========
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('41000', 'RTO Rental Income', 'income', 'general', false, 'profit_loss', 411,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('42000', 'Down Payment Income', 'income', 'general', false, 'profit_loss', 412,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('43000', 'Late Fee Income', 'income', 'general', false, 'profit_loss', 413,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

-- ===== from migration 097 (parity: 23900, 21000, 14300, 60600, 60900…) ====
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('21000', 'Accounts Payable (A/P)', 'liability', 'payable', false, 'balance_sheet', 205,
  (SELECT id FROM capital_accounts WHERE code = '2001'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('41000', 'RTO Rental Income', 'income', 'rto', false, 'profit_loss', 405,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('42000', 'Down Payment Income', 'income', 'rto', false, 'profit_loss', 406,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('43000', 'Late Fee Income', 'income', 'rto', false, 'profit_loss', 407,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('14300', 'RTO Properties', 'asset', 'inventory', false, 'balance_sheet', 165,
  (SELECT id FROM capital_accounts WHERE code = '1400'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('23900', 'Investor Notes Payable', 'liability', 'investor_debt', false, 'balance_sheet', 245,
  (SELECT id FROM capital_accounts WHERE code = '23000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60600', 'Bank fees & service charges', 'expense', 'general', false, 'profit_loss', 612,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('60900', 'Operating Expenses (General)', 'expense', 'general', false, 'profit_loss', 615,
  (SELECT id FROM capital_accounts WHERE code = '60000'))
ON CONFLICT (code) DO NOTHING;

COMMIT;

-- Verify:
--   SELECT COUNT(*) FROM capital_accounts;                         → ~61
--   SELECT code,name FROM capital_accounts WHERE code IN ('23900','71400') ORDER BY code;
