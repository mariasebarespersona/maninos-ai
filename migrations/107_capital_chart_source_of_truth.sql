-- ============================================================================
-- Migration 107: CAPITAL chart of accounts = SOURCE OF TRUTH
-- Source: Maninos_Capital_Model_Account_List_updated.xlsx (QuickBooks export).
-- 200 numbered accounts. Idempotent upsert by code + parent linkage.
--
-- Touches ONLY capital_accounts (Maninos CAPITAL). Does NOT touch Homes'
-- accounting_accounts. Legacy codes not in the source (23900, 23950, 10170,
-- 60600, old header tree) are left untouched here and deactivated in the
-- WS7 data-fix AFTER their ledger rows are remapped.
--
-- Run in the Supabase SQL editor.
-- ============================================================================

BEGIN;

-- 1) Columns needed by the source-of-truth chart -----------------------------
ALTER TABLE capital_accounts ADD COLUMN IF NOT EXISTS subtype TEXT;
ALTER TABLE capital_accounts ADD COLUMN IF NOT EXISTS normal_balance TEXT;   -- 'debit' | 'credit'
ALTER TABLE capital_accounts ADD COLUMN IF NOT EXISTS statement_group TEXT;  -- QuickBooks 'Estado financiero'
ALTER TABLE capital_accounts ADD COLUMN IF NOT EXISTS detail_type TEXT;      -- QuickBooks 'Account subtype'

-- 1b) Link investor notes to their per-investor Debt Securities child account.
--     Each pagaré / investor maps to a child of 23000. Populated by the WS7
--     data-fix (name match) and by new-note creation going forward.
ALTER TABLE promissory_notes ADD COLUMN IF NOT EXISTS chart_account_code TEXT;
ALTER TABLE investors        ADD COLUMN IF NOT EXISTS chart_account_code TEXT;

-- 1c) Journal Entries support: group id + allow the 'journal_entry' type.
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS journal_entry_id UUID;
CREATE INDEX IF NOT EXISTS idx_capital_txn_journal_entry ON capital_transactions(journal_entry_id);
ALTER TABLE capital_transactions DROP CONSTRAINT IF EXISTS capital_transactions_transaction_type_check;
ALTER TABLE capital_transactions ADD CONSTRAINT capital_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'rto_payment', 'down_payment', 'late_fee',
    'acquisition', 'investor_deposit', 'investor_return',
    'commission', 'insurance', 'tax', 'operating_expense',
    'transfer', 'adjustment', 'other_income', 'other_expense',
    'journal_entry'
  ));

-- 2) Upsert the 200 source accounts (no parent yet) --------------------------
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10100', 'Bank and Cash Equivalents', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', true, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10110', 'BANK OF AMERICA', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: BANK OF AMERICA.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10120', 'BOA CAPITAL 9197', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: BOA CAPITAL 9197.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10130', 'Cash', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: Cash.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10140', 'MONEX BANK', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: MONEX BANK.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10150', 'PNC', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: PNC.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('10160', 'BOA 0623 C2', 'asset', 'bank', 'Bank', 'Current', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cuenta bancaria operativa; refleja el saldo de efectivo depositado en una institucion financiera especifica, disponible para pagos y cobros del negocio. Subcuenta especifica de ''Bank and Cash Equivalents'' correspondiente a: BOA 0623 C2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('12000', 'Accounts Receivable (A/R)', 'asset', 'receivable', 'Accounts receivable (A/R)', 'Accounts Receivable (A/R)', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Representa los montos que terceros (clientes, arrendatarios) adeudan a la empresa por bienes o servicios entregados y aun no cobrados; en este modelo refleja principalmente rentas devengadas y pendientes de cobro.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('12100', 'Rents Receivable', 'asset', 'receivable', 'Accounts receivable (A/R)', 'Accounts Receivable (A/R)', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Representa los montos que terceros (clientes, arrendatarios) adeudan a la empresa por bienes o servicios entregados y aun no cobrados; en este modelo refleja principalmente rentas devengadas y pendientes de cobro.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14000', 'Prepaid Expenses.', 'asset', 'general', 'Other Current Assets', 'Prepaid Expenses', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Pagos realizados por anticipado por bienes o servicios que se recibiran o consumiran en periodos futuros; se reconoce como gasto conforme se devenga.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14010', 'Payments to deposit', 'asset', 'general', 'Other Current Assets', 'Undeposited Funds', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Cobros recibidos (efectivo o cheques) que ya fueron registrados pero que aun no se han depositado fisicamente en la cuenta bancaria.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14100', 'Loans to partners', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14200', 'Loans to others', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', true, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14210', 'Dallas Opening Costs', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo. Subcuenta especifica de ''Loans to others'' correspondiente a: Dallas Opening Costs.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14220', 'Loan to Gabriel Cantu', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo. Subcuenta especifica de ''Loans to others'' correspondiente a: Loan to Gabriel Cantu.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14230', 'SGZ', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo. Subcuenta especifica de ''Loans to others'' correspondiente a: SGZ.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14300', 'Loan to Related Parties', 'asset', 'general', 'Other Current Assets', 'Allowance for bad debts', 'credit', 'balance_sheet', 'Balance General - Activo Circulante', true, true, 'Cuenta de valuacion (contra-activo) que estima la porcion de las cuentas por cobrar que probablemente no se recuperara; reduce el valor neto de realizacion de las cuentas por cobrar.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14310', 'Maninos Homes', 'asset', 'general', 'Other Current Assets', 'Loans to Others', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Prestamos otorgados por la empresa a terceros, socios o partes relacionadas; representa un derecho de cobro que se espera recuperar en efectivo. Subcuenta especifica de ''Loan to Related Parties'' correspondiente a: Maninos Homes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('17200', 'Uncategorized Asset', 'asset', 'general', 'Other Current Assets', 'Other current assets', 'debit', 'balance_sheet', 'Balance General - Activo Circulante', false, true, 'Partida residual de activos circulantes que no encaja en una categoria especifica; representa recursos de corto plazo pendientes de clasificar o depurar.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13000', 'Properties', 'asset', 'general', 'Fixed Assets', 'Buildings', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', true, true, 'Valor de costo de las construcciones e inmuebles propiedad de la empresa, utilizados en la operacion (en este modelo, principalmente las propiedades/casas moviles que generan renta).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13010', 'Mobile Homes', 'asset', 'general', 'Fixed Assets', 'Buildings', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', true, true, 'Valor de costo de las construcciones e inmuebles propiedad de la empresa, utilizados en la operacion (en este modelo, principalmente las propiedades/casas moviles que generan renta). Subcuenta especifica de ''Properties'' correspondiente a: Mobile Homes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13020', 'Accumulated depreciation', 'asset', 'general', 'Fixed Assets', 'Accumulated depreciation on property, plant and equipment', 'credit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Cuenta de valuacion (contra-activo) que acumula la depreciacion reconocida sobre los activos fijos; reduce el valor en libros del activo relacionado.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13100', 'Land', 'asset', 'general', 'Fixed Assets', 'Land', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Costo del terreno propiedad de la empresa; al no depreciarse, mantiene su valor de adquisicion en libros.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13200', 'Vehicles', 'asset', 'general', 'Fixed Assets', 'Vehicles', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Costo de los vehiculos propiedad de la empresa utilizados en la operacion.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13300', 'Office Equipment', 'asset', 'general', 'Fixed Assets', 'Other fixed assets', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Activos fijos que no se clasifican en una categoria especifica (por ejemplo, equipo de oficina).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13400', 'Tools, machinery, and equipment', 'asset', 'general', 'Fixed Assets', 'Machinery and equipment', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Costo de maquinaria, herramientas y equipo utilizados en la operacion del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13500', 'Buildings', 'asset', 'general', 'Fixed Assets', 'Buildings', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Valor de costo de las construcciones e inmuebles propiedad de la empresa, utilizados en la operacion (en este modelo, principalmente las propiedades/casas moviles que generan renta).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13550', 'Improvements', 'asset', 'general', 'Fixed Assets', 'Leasehold Improvements', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Mejoras y adaptaciones realizadas a propiedades arrendadas u ocupadas por la empresa, capitalizadas y amortizadas durante la vida util o el plazo del contrato.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('13600', 'Furniture & fixtures', 'asset', 'general', 'Fixed Assets', 'Furniture and Fixtures', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Costo de mobiliario y accesorios utilizados en las oficinas u operaciones de la empresa.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('14050', 'Accumulated amortization', 'asset', 'general', 'Fixed Assets', 'Accumulated depreciation on property, plant and equipment', 'credit', 'balance_sheet', 'Balance General - Activo No Circulante (Propiedad, Planta y Equipo)', false, true, 'Cuenta de valuacion (contra-activo) que acumula la depreciacion reconocida sobre los activos fijos; reduce el valor en libros del activo relacionado.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('15000', 'Startup & organizational costs', 'asset', 'general', 'Other Assets', 'Other non-current assets', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', false, true, 'Activos de largo plazo que no se ajustan a una categoria especifica (costos de arranque, prestamos de largo plazo a partes relacionadas, etc.).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('15010', 'Loan Origination Costs', 'asset', 'general', 'Other Assets', 'Other non-current assets', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', true, true, 'Activos de largo plazo que no se ajustan a una categoria especifica (costos de arranque, prestamos de largo plazo a partes relacionadas, etc.).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('15020', 'Accumulated Amortization (LOC)', 'asset', 'general', 'Other Assets', 'Other non-current assets', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', false, true, 'Activos de largo plazo que no se ajustan a una categoria especifica (costos de arranque, prestamos de largo plazo a partes relacionadas, etc.). Subcuenta especifica de ''Loan Origination Costs'' correspondiente a: Accumulated Amortization (LOC).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('15100', 'Security deposits', 'asset', 'general', 'Other Assets', 'Security Deposits', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', false, true, 'Depositos en garantia entregados a terceros (por ejemplo, arrendadores) que se recuperaran al finalizar el contrato correspondiente.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('17010', 'Long-term loans to related parties', 'asset', 'general', 'Other Assets', 'Other non-current assets', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', false, true, 'Activos de largo plazo que no se ajustan a una categoria especifica (costos de arranque, prestamos de largo plazo a partes relacionadas, etc.).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('17100', 'Deferred income taxes', 'asset', 'general', 'Other Assets', 'Deferred tax', 'debit', 'balance_sheet', 'Balance General - Activo No Circulante', false, true, 'Impuesto sobre la renta diferido activo; representa beneficios fiscales futuros originados por diferencias temporales entre el registro contable y el fiscal.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('20000', 'Accounts Payable A/P', 'liability', 'payable', 'Accounts payable (A/P)', 'Accounts Payable (A/P)', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones de pago pendientes con proveedores por bienes o servicios recibidos a credito en el curso normal del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('20020', 'Accounts Payable (A/P)', 'liability', 'payable', 'Accounts payable (A/P)', 'Accounts Payable (A/P)', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones de pago pendientes con proveedores por bienes o servicios recibidos a credito en el curso normal del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('20100', 'Accrued Expenses', 'liability', 'general', 'Other Current Liabilities', 'Accrued liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones devengadas y no facturadas o pagadas aun, correspondientes a gastos ya incurridos (por ejemplo, nomina o servicios).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('20110', 'Customer prepayments', 'liability', 'general', 'Other Current Liabilities', 'Other current liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones de corto plazo que no encajan en una categoria especifica.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('20190', 'Clearing Account', 'liability', 'general', 'Other Current Liabilities', 'Accrued liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones devengadas y no facturadas o pagadas aun, correspondientes a gastos ya incurridos (por ejemplo, nomina o servicios).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('21000', 'Deferred Rents', 'liability', 'general', 'Other Current Liabilities', 'Accrued liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones devengadas y no facturadas o pagadas aun, correspondientes a gastos ya incurridos (por ejemplo, nomina o servicios).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('21100', 'Downpayment', 'liability', 'general', 'Other Current Liabilities', 'Other current liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Obligaciones de corto plazo que no encajan en una categoria especifica.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22000', 'Loan from Related Parties', 'liability', 'general', 'Other Current Liabilities', 'Loan Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', true, true, 'Prestamos recibidos por la empresa que deben liquidarse en el corto plazo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22010', 'Maninos Homes', 'liability', 'general', 'Other Current Liabilities', 'Loan Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Prestamos recibidos por la empresa que deben liquidarse en el corto plazo. Subcuenta especifica de ''Loan from Related Parties'' correspondiente a: Maninos Homes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22020', 'Para Transferir A Maninos Homes', 'liability', 'general', 'Other Current Liabilities', 'Loan Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Prestamos recibidos por la empresa que deben liquidarse en el corto plazo. Subcuenta especifica de ''Loan from Related Parties'' correspondiente a: Para Transferir A Maninos Homes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22030', 'Short-term loans from partners', 'liability', 'general', 'Other Current Liabilities', 'Loan Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Prestamos recibidos por la empresa que deben liquidarse en el corto plazo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22040', 'Monex - La Agustedad', 'liability', 'general', 'Other Current Liabilities', 'Loan Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Prestamos recibidos por la empresa que deben liquidarse en el corto plazo. Subcuenta especifica de ''Loan from Related Parties'' correspondiente a: Monex - La Agustedad.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22060', 'Lines of credit', 'liability', 'general', 'Other Current Liabilities', 'Line of Credit', 'credit', 'balance_sheet', 'Balance General - Pasivo Circulante', false, true, 'Saldo dispuesto de una linea de credito revolvente contratada con una institucion financiera.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22050', 'La Agustedad - Cofine Loan', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: La Agustedad - Cofine Loan.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22100', 'Loan From Others', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', true, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('22110', 'Argo Communities', 'liability', 'general', 'Long Term Liabilities', 'Other non-current liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Obligaciones de largo plazo que no se ajustan a una categoria especifica. Subcuenta especifica de ''Loan From Others'' correspondiente a: Argo Communities.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23000', 'Debt Securities', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', true, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23001', 'ALEJANDRO EYSSAUTIER BLAN', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: ALEJANDRO EYSSAUTIER BLAN.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23002', 'COFINE USD', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: COFINE USD.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23004', 'DENER', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: DENER.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23005', 'EMANUEL GONZALEZ', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: EMANUEL GONZALEZ.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23006', 'GABRIEL GONZALEZ 1', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: GABRIEL GONZALEZ 1.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23007', 'GABRIEL GONZALEZ 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: GABRIEL GONZALEZ 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23008', 'GABRIEL GONZALEZ 3', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: GABRIEL GONZALEZ 3.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23009', 'GABRIEL GONZALEZ 4', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: GABRIEL GONZALEZ 4.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23010', 'INVERSIONISTA DESCONOCIDO 4K', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: INVERSIONISTA DESCONOCIDO 4K.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23011', 'JACK LEAL', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JACK LEAL.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23012', 'JACK LEAL 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JACK LEAL 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23013', 'JERONIMO CREEL 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JERONIMO CREEL 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23014', 'JERONIMO CREEL MORENO', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JERONIMO CREEL MORENO.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23015', 'JESUS SOLORZANO', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JESUS SOLORZANO.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23016', 'JINX', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JINX.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23017', 'JORGE DE LA TORRE', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JORGE DE LA TORRE.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23018', 'JOSE ALONSO', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JOSE ALONSO.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23019', 'JOSE ALONSO 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: JOSE ALONSO 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23020', 'LA AGUSTEDAD', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23021', 'LA AGUSTEDAD 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23022', 'LA AGUSTEDAD 3', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 3.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23023', 'LA AGUSTEDAD 4', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 4.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23024', 'LA AGUSTEDAD 5', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 5.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23025', 'LA AGUSTEDAD 6', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 6.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23026', 'LA AGUSTEDAD 7', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LA AGUSTEDAD 7.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23027', 'LETICIA CEPEDA 1', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: LETICIA CEPEDA 1.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23028', 'MANINOS', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MANINOS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23029', 'MANUEL PEREZ SALAZAR', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MANUEL PEREZ SALAZAR.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23030', 'MARCELO BREMER', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23031', 'MARCELO BREMER 1', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 1.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23032', 'MARCELO BREMER 10', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 10.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23034', 'MARCELO BREMER 11', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 11.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23035', 'MARCELO BREMER 12', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 12.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23036', 'MARCELO BREMER 13', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 13.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23037', 'MARCELO BREMER 14', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 14.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23038', 'MARCELO BREMER 15', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 15.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23039', 'MARCELO BREMER 16', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 16.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23040', 'Marcelo Bremer 17', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: Marcelo Bremer 17.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23041', 'MARCELO BREMER 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23042', 'MARCELO BREMER 3', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 3.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23043', 'MARCELO BREMER 5', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 5.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23044', 'MARCELO BREMER 6', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 6.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23045', 'MARCELO BREMER 7', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 7.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23046', 'MARCELO BREMER 8', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 8.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23047', 'MARCELO BREMER 9', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 9.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23048', 'MERCEDES ROSAS TORRES', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: MERCEDES ROSAS TORRES.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23049', 'RAYMUNDO DE LA GARZA', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: RAYMUNDO DE LA GARZA.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23050', 'SGZ', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: SGZ.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23051', 'VALTO', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23052', 'VALTO #4 (7)', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO #4 (7).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23053', 'Valto 11', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: Valto 11.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23054', 'VALTO 2', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO 2.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23055', 'VALTO 3', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO 3.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23056', 'VALTO 5 (8/9)', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO 5 (8/9).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23057', 'VALTO 6 (10)', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VALTO 6 (10).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23058', 'VICENTE GONZALEZ', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Debt Securities'' correspondiente a: VICENTE GONZALEZ.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23059', 'MARCELO BREMER 18', 'liability', 'general', 'Long Term Liabilities', 'Accrued holiday payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Provision por dias de vacaciones u otras prestaciones devengadas por los empleados y pendientes de pago o disfrute. Subcuenta especifica de ''Debt Securities'' correspondiente a: MARCELO BREMER 18.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23060', 'Jose Juanmarcos', 'liability', 'general', 'Long Term Liabilities', 'Accrued holiday payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Provision por dias de vacaciones u otras prestaciones devengadas por los empleados y pendientes de pago o disfrute. Subcuenta especifica de ''Debt Securities'' correspondiente a: Jose Juanmarcos.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23061', 'ALEJANDRO DIAZ CEBALLOS', 'liability', 'general', 'Long Term Liabilities', 'Accrued holiday payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Provision por dias de vacaciones u otras prestaciones devengadas por los empleados y pendientes de pago o disfrute. Subcuenta especifica de ''Debt Securities'' correspondiente a: ALEJANDRO DIAZ CEBALLOS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('23500', 'JT Group - Debt Securities', 'liability', 'general', 'Long Term Liabilities', 'Accrued holiday payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', true, true, 'Provision por dias de vacaciones u otras prestaciones devengadas por los empleados y pendientes de pago o disfrute. Subcuenta especifica de ''Debt Securities'' correspondiente a: JT Group - Debt Securities.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('25000', 'Long-term loans from partners', 'liability', 'general', 'Long Term Liabilities', 'Long-term debt', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', true, true, 'Deuda financiera (prestamos, notas) cuyo vencimiento es mayor a doce meses.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('25100', 'SEBASTIAN GONZALEZ', 'liability', 'general', 'Long Term Liabilities', 'Notes Payable', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Documentos o pagares formales suscritos por la empresa como reconocimiento de una deuda, con vencimiento de largo plazo. Subcuenta especifica de ''Long-term loans from partners'' correspondiente a: SEBASTIAN GONZALEZ.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('26000', 'Mortgages', 'liability', 'general', 'Long Term Liabilities', 'Other non-current liabilities', 'credit', 'balance_sheet', 'Balance General - Pasivo No Circulante', false, true, 'Obligaciones de largo plazo que no se ajustan a una categoria especifica.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('30000', 'Partner investments', 'equity', 'general', 'Equity', 'Partner Contributions', 'credit', 'balance_sheet', 'Balance General - Capital Contable', false, true, 'Aportaciones de capital realizadas por los socios a la empresa.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('31000', 'Partner distributions', 'equity', 'general', 'Equity', 'Partner Distributions', 'debit', 'balance_sheet', 'Balance General - Capital Contable', false, true, 'Distribuciones de efectivo o utilidades entregadas a los socios; disminuye el capital contable.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('34000', 'Opening balance equity', 'equity', 'general', 'Equity', 'Opening Balance Equity', 'credit', 'balance_sheet', 'Balance General - Capital Contable', false, true, 'Cuenta tecnica generada automaticamente por el sistema contable al capturar los saldos iniciales de apertura; debe depurarse y reclasificarse a las cuentas de capital correspondientes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('35000', 'Retained Earnings Allocated', 'equity', 'general', 'Equity', 'Owner''s Equity', 'credit', 'balance_sheet', 'Balance General - Capital Contable', false, true, 'Capital aportado y acumulado por el o los propietarios del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('40000', 'Operating Income', 'income', 'general', 'Income', 'Other Primary Income', 'credit', 'profit_loss', 'Estado de Resultados - Ingresos', true, true, 'Ingresos ordinarios de la operacion principal del negocio que no se clasifican en una subcategoria especifica de ventas.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('41000', 'Rent Income', 'income', 'general', 'Income', 'Other Primary Income', 'credit', 'profit_loss', 'Estado de Resultados - Ingresos', false, true, 'Ingresos ordinarios de la operacion principal del negocio que no se clasifican en una subcategoria especifica de ventas.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('42000', 'Sales', 'income', 'general', 'Income', 'Sales of Product Income', 'credit', 'profit_loss', 'Estado de Resultados - Ingresos', false, true, 'Ingresos por la venta de productos.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('43000', 'Service Incoe', 'income', 'general', 'Income', 'Service/Fee Income', 'credit', 'profit_loss', 'Estado de Resultados - Ingresos', false, true, 'Ingresos generados por la prestacion de servicios o cobro de cuotas (en este modelo, principalmente ingresos por renta de las propiedades).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('44000', 'Interest earned', 'income', 'general', 'Income', 'Sales of Product Income', 'credit', 'profit_loss', 'Estado de Resultados - Ingresos', false, true, 'Ingresos por la venta de productos. Subcuenta especifica de ''Operating Income'' correspondiente a: Interest earned.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('50000', 'Cost of goods sold', 'cogs', 'general', 'Cost of Goods Sold', 'Other costs of sales - COS', 'debit', 'profit_loss', 'Estado de Resultados - Costo de Ventas', true, true, 'Otros costos directos de venta que no se clasifican en una subcategoria especifica.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('50010', 'Cost of labor - COGS', 'cogs', 'general', 'Cost of Goods Sold', 'Cost of labour - COS', 'debit', 'profit_loss', 'Estado de Resultados - Costo de Ventas', false, true, 'Costo de mano de obra directamente atribuible a la generacion de los ingresos (costo de ventas). Subcuenta especifica de ''Cost of goods sold'' correspondiente a: Cost of labor - COGS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('50020', 'Equipment rental - COGS', 'cogs', 'general', 'Cost of Goods Sold', 'Equipment rental - COS', 'debit', 'profit_loss', 'Estado de Resultados - Costo de Ventas', false, true, 'Costo de renta de equipo directamente relacionado con la generacion de los ingresos. Subcuenta especifica de ''Cost of goods sold'' correspondiente a: Equipment rental - COGS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('50030', 'Freight in - COGS', 'cogs', 'general', 'Cost of Goods Sold', 'Freight and delivery - COS', 'debit', 'profit_loss', 'Estado de Resultados - Costo de Ventas', false, true, 'Costo de fletes y entrega de mercancia, directamente atribuible a las ventas. Subcuenta especifica de ''Cost of goods sold'' correspondiente a: Freight in - COGS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('50040', 'Supplies & materials - COGS', 'cogs', 'general', 'Cost of Goods Sold', 'Supplies and materials - COS', 'debit', 'profit_loss', 'Estado de Resultados - Costo de Ventas', false, true, 'Costo de insumos y materiales consumidos directamente en la generacion de los ingresos. Subcuenta especifica de ''Cost of goods sold'' correspondiente a: Supplies & materials - COGS.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60000', 'General and Administrative Business Expenses', 'expense', 'general', 'Expenses', 'Advertising/Promotional', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos incurridos en publicidad y promocion del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60100', 'Commissions & fees', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Commissions & fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60300', 'Legal & accounting services', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Legal & accounting services.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60310', 'Accounting fees', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Accounting fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60320', 'Legal fees', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Legal fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60330', 'Consulting Services', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Consulting Services.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60340', 'Representation Expenses', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Representation Expenses.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60350', 'Gastos de Viaje', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Gastos de Viaje.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60500', 'Office expenses', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Office expenses.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60510', 'Office supplies', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Office supplies.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60520', 'Printing & photocopying', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Printing & photocopying.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60530', 'Shipping & postage', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Shipping & postage.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60540', 'Small tools & equipment', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Small tools & equipment.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60550', 'Software & apps', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Software & apps.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60560', 'EVICTION EXPENSES', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: EVICTION EXPENSES.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('60990', 'Merchant account fees', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General and Administrative Business Expenses'' correspondiente a: Merchant account fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('61000', 'Advertising & marketing', 'expense', 'general', 'Expenses', 'Advertising/Promotional', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos incurridos en publicidad y promocion del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('61010', 'Listing fees', 'expense', 'general', 'Expenses', 'Advertising/Promotional', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos incurridos en publicidad y promocion del negocio. Subcuenta especifica de ''Advertising & marketing'' correspondiente a: Listing fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('61020', 'Social media', 'expense', 'general', 'Expenses', 'Advertising/Promotional', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos incurridos en publicidad y promocion del negocio. Subcuenta especifica de ''Advertising & marketing'' correspondiente a: Social media.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('61030', 'Website ads', 'expense', 'general', 'Expenses', 'Advertising/Promotional', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos incurridos en publicidad y promocion del negocio. Subcuenta especifica de ''Advertising & marketing'' correspondiente a: Website ads.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('64200', 'Payroll taxes', 'expense', 'general', 'Expenses', 'Payroll Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto de nomina, incluyendo sueldos, salarios y prestaciones del personal.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('64500', 'Payroll Expense', 'expense', 'general', 'Expenses', 'Payroll Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto de nomina, incluyendo sueldos, salarios y prestaciones del personal.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('64510', 'Payments to partners', 'expense', 'general', 'Expenses', 'Payroll Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto de nomina, incluyendo sueldos, salarios y prestaciones del personal. Subcuenta especifica de ''Payroll Expenses'' correspondiente a: Payments to partners.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('64520', 'Salaries & wages', 'expense', 'general', 'Expenses', 'Payroll Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto de nomina, incluyendo sueldos, salarios y prestaciones del personal. Subcuenta especifica de ''Payroll Expenses'' correspondiente a: Salaries & wages.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65000', 'General business expenses', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65010', 'Bank fees & service charges', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General business expenses'' correspondiente a: Bank fees & service charges.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65020', 'Continuing education', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General business expenses'' correspondiente a: Continuing education.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65030', 'Memberships & subscriptions', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General business expenses'' correspondiente a: Memberships & subscriptions.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65040', 'Uniforms', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''General business expenses'' correspondiente a: Uniforms.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65100', 'Insurance', 'expense', 'general', 'Expenses', 'Insurance', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Primas de seguros pagadas para proteger los activos y operaciones de la empresa.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65110', 'Business insurance', 'expense', 'general', 'Expenses', 'Insurance', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Primas de seguros pagadas para proteger los activos y operaciones de la empresa. Subcuenta especifica de ''Insurance'' correspondiente a: Business insurance.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65120', 'Liability insurance', 'expense', 'general', 'Expenses', 'Insurance', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Primas de seguros pagadas para proteger los activos y operaciones de la empresa. Subcuenta especifica de ''Insurance'' correspondiente a: Liability insurance.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65130', 'Property insurance', 'expense', 'general', 'Expenses', 'Insurance', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Primas de seguros pagadas para proteger los activos y operaciones de la empresa. Subcuenta especifica de ''Insurance'' correspondiente a: Property insurance.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65200', 'Interest P', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65210', 'Business loan interest', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''Interest P'' correspondiente a: Business loan interest.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65220', 'Credit card interest', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''Interest P'' correspondiente a: Credit card interest.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('65230', 'Mortgage interest', 'expense', 'general', 'Expenses', 'Office/General Administrative Expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos generales y administrativos de oficina necesarios para la operacion del negocio. Subcuenta especifica de ''Interest P'' correspondiente a: Mortgage interest.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('66000', 'Repairs & maintenance', 'expense', 'general', 'Expenses', 'Repair and maintenance', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de reparacion y mantenimiento de activos e instalaciones.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('66010', 'Supplies Expenses', 'expense', 'general', 'Expenses', 'Supplies and materials', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Costo de insumos y materiales de uso general en la operacion (no directamente atribuibles al costo de ventas).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('66020', 'Supplies & materials', 'expense', 'general', 'Expenses', 'Supplies and materials', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Costo de insumos y materiales de uso general en la operacion (no directamente atribuibles al costo de ventas). Subcuenta especifica de ''Supplies'' correspondiente a: Supplies & materials.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('67000', 'Rent', 'expense', 'general', 'Expenses', 'Rent or Lease of Buildings', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gasto por renta o arrendamiento de inmuebles utilizados en la operacion.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('67010', 'Building & land rent', 'expense', 'general', 'Expenses', 'Rent or Lease of Buildings', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por renta o arrendamiento de inmuebles utilizados en la operacion. Subcuenta especifica de ''Rent'' correspondiente a: Building & land rent.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('67020', 'Equipment rental', 'expense', 'general', 'Expenses', 'Equipment rental', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por renta de equipo utilizado en la operacion, sin relacion directa con el costo de ventas.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68000', 'Utilities Expense', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.).')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68010', 'Disposal & waste fees', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Disposal & waste fees.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68020', 'Electricity', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Electricity.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68030', 'Heating & cooling', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Heating & cooling.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68040', 'Internet & TV services', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Internet & TV services.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68050', 'Phone service', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Phone service.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68060', 'Water & sewer', 'expense', 'general', 'Expenses', 'Utilities', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gasto por servicios publicos (agua, luz, gas, telefono, internet, etc.). Subcuenta especifica de ''Utilities'' correspondiente a: Water & sewer.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68100', 'Travel', 'expense', 'general', 'Expenses', 'Travel expenses - general and admin expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos de viaje relacionados con actividades administrativas generales.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68110', 'Airfare', 'expense', 'general', 'Expenses', 'Travel expenses - general and admin expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de viaje relacionados con actividades administrativas generales. Subcuenta especifica de ''Travel'' correspondiente a: Airfare.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68120', 'Hotels', 'expense', 'general', 'Expenses', 'Travel expenses - general and admin expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de viaje relacionados con actividades administrativas generales. Subcuenta especifica de ''Travel'' correspondiente a: Hotels.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68130', 'Taxis or shared rides', 'expense', 'general', 'Expenses', 'Travel expenses - general and admin expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de viaje relacionados con actividades administrativas generales. Subcuenta especifica de ''Travel'' correspondiente a: Taxis or shared rides.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68140', 'Vehicle rental', 'expense', 'general', 'Expenses', 'Travel expenses - general and admin expenses', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de viaje relacionados con actividades administrativas generales. Subcuenta especifica de ''Travel'' correspondiente a: Vehicle rental.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68200', 'Meals', 'expense', 'general', 'Expenses', 'Meals and entertainment', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', true, true, 'Gastos de alimentos y entretenimiento relacionados con la operacion o atencion a clientes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68210', 'Meals with clients', 'expense', 'general', 'Expenses', 'Meals and entertainment', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de alimentos y entretenimiento relacionados con la operacion o atencion a clientes. Subcuenta especifica de ''Meals'' correspondiente a: Meals with clients.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68220', 'Team meals', 'expense', 'general', 'Expenses', 'Meals and entertainment', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de alimentos y entretenimiento relacionados con la operacion o atencion a clientes. Subcuenta especifica de ''Meals'' correspondiente a: Team meals.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('68230', 'Entertainment', 'expense', 'general', 'Expenses', 'Meals and entertainment', 'debit', 'profit_loss', 'Estado de Resultados - Gastos Operativos', false, true, 'Gastos de alimentos y entretenimiento relacionados con la operacion o atencion a clientes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('49000', 'Uncategorized Income', 'income', 'general', 'Other Income', 'Other Miscellaneous Income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', false, true, 'Otros ingresos diversos ajenos a la operacion principal del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('70000', 'OTHER INCOME', 'income', 'general', 'Other Income', 'Other Miscellaneous Income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', true, true, 'Otros ingresos diversos ajenos a la operacion principal del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('72000', 'Sale of investments', 'income', 'general', 'Other Income', 'Other Miscellaneous Income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', false, true, 'Otros ingresos diversos ajenos a la operacion principal del negocio. Subcuenta especifica de ''OTHER INCOME'' correspondiente a: Sale of investments.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('72100', 'Sale of an asset', 'income', 'general', 'Other Income', 'Other Miscellaneous Income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', false, true, 'Otros ingresos diversos ajenos a la operacion principal del negocio. Subcuenta especifica de ''OTHER INCOME'' correspondiente a: Sale of an asset.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('72200', 'Late Payment Fee', 'income', 'general', 'Other Income', 'Dividend income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', false, true, 'Ingresos por dividendos recibidos de inversiones en otras empresas. Subcuenta especifica de ''OTHER INCOME'' correspondiente a: Late Payment Fee.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('73000', 'Insurance claims', 'income', 'general', 'Other Income', 'Other Miscellaneous Income', 'credit', 'profit_loss', 'Estado de Resultados - Otros Ingresos', false, true, 'Otros ingresos diversos ajenos a la operacion principal del negocio.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('69000', 'Uncategorized Expense', 'expense', 'general', 'Other Expense', 'Other Miscellaneous Expense', 'debit', 'profit_loss', 'Estado de Resultados - Otros Gastos', false, true, 'Otros gastos diversos que no se clasifican en una categoria especifica y son ajenos a la operacion principal.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('71000', 'Other Business Expenses', 'expense', 'general', 'Other Expense', 'Amortisation', 'debit', 'profit_loss', 'Estado de Resultados - Otros Gastos', true, true, 'Gasto por amortizacion de activos (por ejemplo, costos de originacion de prestamos) reconocido en el periodo.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('71100', 'Taxes paid', 'expense', 'general', 'Other Expense', 'Amortisation', 'debit', 'profit_loss', 'Estado de Resultados - Otros Gastos', false, true, 'Gasto por amortizacion de activos (por ejemplo, costos de originacion de prestamos) reconocido en el periodo. Subcuenta especifica de ''Other Business Expenses'' correspondiente a: Taxes paid.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('71400', 'Interest paid', 'expense', 'general', 'Other Expense', 'Amortisation', 'debit', 'profit_loss', 'Estado de Resultados - Otros Gastos', false, true, 'Gasto por amortizacion de activos (por ejemplo, costos de originacion de prestamos) reconocido en el periodo. Subcuenta especifica de ''Other Business Expenses'' correspondiente a: Interest paid.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();
INSERT INTO capital_accounts (code, name, account_type, category, subtype, detail_type, normal_balance, report_section, statement_group, is_header, is_active, description)
VALUES ('71500', 'Property taxes', 'expense', 'general', 'Other Expense', 'Amortisation', 'debit', 'profit_loss', 'Estado de Resultados - Otros Gastos', false, true, 'Gasto por amortizacion de activos (por ejemplo, costos de originacion de prestamos) reconocido en el periodo. Subcuenta especifica de ''Other Business Expenses'' correspondiente a: Property taxes.')
ON CONFLICT (code) DO UPDATE SET
  name=EXCLUDED.name, account_type=EXCLUDED.account_type, category=EXCLUDED.category,
  subtype=EXCLUDED.subtype, detail_type=EXCLUDED.detail_type, normal_balance=EXCLUDED.normal_balance,
  report_section=EXCLUDED.report_section, statement_group=EXCLUDED.statement_group,
  is_header=EXCLUDED.is_header, is_active=true, description=EXCLUDED.description, updated_at=NOW();

-- 3) Link parents (second pass so every code already exists) -----------------
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10110';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10120';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10130';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10140';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10150';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='10100') WHERE code='10160';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='14200') WHERE code='14210';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='14200') WHERE code='14220';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='14200') WHERE code='14230';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='14300') WHERE code='14310';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='13000') WHERE code='13010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='13010') WHERE code='13020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='15010') WHERE code='15020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='22000') WHERE code='22010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='22000') WHERE code='22020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='22000') WHERE code='22040';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='22050';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='22100') WHERE code='22110';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23001';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23002';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23004';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23005';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23006';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23007';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23008';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23009';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23011';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23012';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23013';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23014';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23015';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23016';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23017';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23018';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23019';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23021';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23022';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23023';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23024';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23025';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23026';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23027';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23028';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23029';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23030';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23031';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23032';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23034';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23035';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23036';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23037';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23038';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23039';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23040';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23041';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23042';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23043';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23044';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23045';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23046';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23047';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23500') WHERE code='23048';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23049';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23050';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23051';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23052';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23053';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23054';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23055';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23056';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23057';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23058';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23059';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23060';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23061';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='23000') WHERE code='23500';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='25000') WHERE code='25100';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='40000') WHERE code='42000';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='40000') WHERE code='44000';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='50000') WHERE code='50010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='50000') WHERE code='50020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='50000') WHERE code='50030';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='50000') WHERE code='50040';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60000') WHERE code='60100';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60000') WHERE code='60300';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60300') WHERE code='60310';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60300') WHERE code='60320';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60300') WHERE code='60330';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60300') WHERE code='60340';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60300') WHERE code='60350';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60000') WHERE code='60500';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60510';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60520';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60530';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60540';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60550';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60560';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='60500') WHERE code='60990';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='61000') WHERE code='61010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='61000') WHERE code='61020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='61000') WHERE code='61030';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65000') WHERE code='65010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65000') WHERE code='65020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65000') WHERE code='65030';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65000') WHERE code='65040';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65100') WHERE code='65110';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65100') WHERE code='65120';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65100') WHERE code='65130';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65200') WHERE code='65210';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65200') WHERE code='65220';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='65200') WHERE code='65230';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='67000') WHERE code='67010';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='67000') WHERE code='67020';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68100') WHERE code='68110';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68100') WHERE code='68120';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68100') WHERE code='68130';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68100') WHERE code='68140';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68200') WHERE code='68210';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='68200') WHERE code='68220';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='70000') WHERE code='72000';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='70000') WHERE code='72100';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='70000') WHERE code='72200';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='71000') WHERE code='71100';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='71000') WHERE code='71400';
UPDATE capital_accounts SET parent_account_id=(SELECT id FROM capital_accounts WHERE code='71000') WHERE code='71500';

COMMIT;
