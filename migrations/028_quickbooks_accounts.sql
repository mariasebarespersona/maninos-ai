-- ============================================================================
-- Migration 028: QuickBooks Chart of Accounts for Maninos Homes
-- ============================================================================
-- Replicates the EXACT hierarchical chart of accounts used in QuickBooks,
-- including all account codes, section headers, and parent-child relationships.
-- Also adds support for 'equity' and 'cogs' account types, and makes the
-- chart editable by employees.
-- ============================================================================

-- 1. Add new columns for hierarchy display
ALTER TABLE accounting_accounts ADD COLUMN IF NOT EXISTS is_header BOOLEAN DEFAULT false;
ALTER TABLE accounting_accounts ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
ALTER TABLE accounting_accounts ADD COLUMN IF NOT EXISTS current_balance DECIMAL(14,2) DEFAULT 0;

-- 2. Expand account_type to include 'equity' and 'cogs'
ALTER TABLE accounting_accounts DROP CONSTRAINT IF EXISTS accounting_accounts_account_type_check;
ALTER TABLE accounting_accounts ADD CONSTRAINT accounting_accounts_account_type_check
    CHECK (account_type IN ('income', 'expense', 'asset', 'liability', 'equity', 'cogs'));

-- 3. Helper function for upserting accounts with parent references
CREATE OR REPLACE FUNCTION _upsert_qb_account(
    p_code TEXT, p_name TEXT, p_type TEXT, p_category TEXT,
    p_is_header BOOLEAN, p_order INTEGER, p_parent_code TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_id UUID;
    v_parent UUID;
BEGIN
    IF p_parent_code IS NOT NULL THEN
        SELECT id INTO v_parent FROM accounting_accounts WHERE code = p_parent_code;
    END IF;

    INSERT INTO accounting_accounts (code, name, account_type, category, is_header, is_system, display_order, parent_account_id)
    VALUES (p_code, p_name, p_type, p_category, p_is_header, true, p_order, v_parent)
    ON CONFLICT (code) DO UPDATE SET
        name = EXCLUDED.name, display_order = EXCLUDED.display_order,
        is_header = EXCLUDED.is_header, parent_account_id = EXCLUDED.parent_account_id,
        account_type = EXCLUDED.account_type, category = EXCLUDED.category
    RETURNING id INTO v_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 4. INSERT FULL QUICKBOOKS CHART OF ACCOUNTS
-- ============================================================================

DO $$
BEGIN

-- ======================== BALANCE SHEET: ASSETS ========================

PERFORM _upsert_qb_account('BS_ASSETS',           'Assets',                  'asset', 'header', true, 1000, NULL);
PERFORM _upsert_qb_account('BS_CURRENT_ASSETS',   'Current Assets',          'asset', 'header', true, 1100, 'BS_ASSETS');

-- Bank Accounts
PERFORM _upsert_qb_account('BS_BANK_ACCOUNTS',    'Bank Accounts',           'asset', 'header', true, 1110, 'BS_CURRENT_ASSETS');
PERFORM _upsert_qb_account('10100',               '10100 Banks',             'asset', 'banks',  true, 1111, 'BS_BANK_ACCOUNTS');
PERFORM _upsert_qb_account('10101',               '10101 BOA DFW 0623',      'asset', 'bank',   false, 1112, '10100');
PERFORM _upsert_qb_account('10102',               '10102 HOUSTON 0636',      'asset', 'bank',   false, 1113, '10100');
PERFORM _upsert_qb_account('10103',               '10103 BANK OF AMERICA',   'asset', 'bank',   false, 1114, '10100');
PERFORM _upsert_qb_account('10104',               '10104 Wells Fargo 1007',  'asset', 'bank',   false, 1115, '10100');
PERFORM _upsert_qb_account('10105',               '10105 Wells Fargo 6382',  'asset', 'bank',   false, 1116, '10100');
PERFORM _upsert_qb_account('10106',               '10106 Cash on hand',      'asset', 'bank',   false, 1117, '10100');
PERFORM _upsert_qb_account('10107',               'CASH DFW',                'asset', 'bank',   false, 1118, '10100');
PERFORM _upsert_qb_account('10108',               'CASH HOUSTON',            'asset', 'bank',   false, 1119, '10100');

-- Accounts Receivable
PERFORM _upsert_qb_account('BS_AR',               'Accounts Receivable',     'asset', 'header', true, 1120, 'BS_CURRENT_ASSETS');
PERFORM _upsert_qb_account('12000',               '12000 Accounts receivable (A/R)', 'asset', 'ar', false, 1121, 'BS_AR');

-- Other Current Assets
PERFORM _upsert_qb_account('BS_OTHER_CURRENT',    'Other Current Assets',    'asset', 'header', true, 1130, 'BS_CURRENT_ASSETS');
PERFORM _upsert_qb_account('11000',               '11000 Inventory',         'asset', 'inventory', true, 1131, 'BS_OTHER_CURRENT');
PERFORM _upsert_qb_account('11200',               '11200 LAND #T1',          'asset', 'inventory', false, 1132, '11000');
PERFORM _upsert_qb_account('11300',               '11300 LAND #T2',          'asset', 'inventory', false, 1133, '11000');
PERFORM _upsert_qb_account('14100',               '14100 LOAN TO OTHERS',    'asset', 'loans',  false, 1140, 'BS_OTHER_CURRENT');
PERFORM _upsert_qb_account('14200',               '14200 Loans to officers', 'asset', 'loans',  true, 1141, 'BS_OTHER_CURRENT');
PERFORM _upsert_qb_account('14210',               '14210 Loan to Maninos Capital', 'asset', 'loans', false, 1142, '14200');
PERFORM _upsert_qb_account('14500',               '14500 Prepaid expenses',  'asset', 'prepaid', false, 1150, 'BS_OTHER_CURRENT');
PERFORM _upsert_qb_account('INV_ASSET',           'Inventory Asset',         'asset', 'inventory', false, 1151, 'BS_OTHER_CURRENT');

-- Fixed Assets
PERFORM _upsert_qb_account('BS_FIXED_ASSETS',     'Fixed Assets',            'asset', 'header', true, 1200, 'BS_ASSETS');
PERFORM _upsert_qb_account('15600',               '15600 Tools, machinery, and equipment', 'asset', 'fixed', false, 1201, 'BS_FIXED_ASSETS');
PERFORM _upsert_qb_account('15700',               '15700 Vehicles',          'asset', 'fixed',  false, 1202, 'BS_FIXED_ASSETS');

-- Other Assets
PERFORM _upsert_qb_account('BS_OTHER_ASSETS',     'Other Assets',            'asset', 'header', true, 1300, 'BS_ASSETS');
PERFORM _upsert_qb_account('SEC_DEP',             'Security deposits',       'asset', 'other',  false, 1301, 'BS_OTHER_ASSETS');

-- ======================== BALANCE SHEET: LIABILITIES ========================

PERFORM _upsert_qb_account('BS_LIABILITIES',      'Liabilities',             'liability', 'header', true, 2000, NULL);
PERFORM _upsert_qb_account('BS_CURRENT_LIAB',     'Current Liabilities',     'liability', 'header', true, 2100, 'BS_LIABILITIES');

-- Accounts Payable
PERFORM _upsert_qb_account('BS_AP',               'Accounts Payable',        'liability', 'header', true, 2110, 'BS_CURRENT_LIAB');
PERFORM _upsert_qb_account('20000',               '20000 Accounts Payable (A/P)', 'liability', 'ap', false, 2111, 'BS_AP');

-- Other Current Liabilities
PERFORM _upsert_qb_account('BS_OTHER_CUR_LIAB',   'Other Current Liabilities','liability', 'header', true, 2120, 'BS_CURRENT_LIAB');
PERFORM _upsert_qb_account('23000',               '23000 Debt Securities',   'liability', 'debt', true, 2121, 'BS_OTHER_CUR_LIAB');
PERFORM _upsert_qb_account('23001',               'GGZ',                     'liability', 'debt', false, 2122, '23000');
PERFORM _upsert_qb_account('23002',               'LA AGUSTEDAD',            'liability', 'debt', false, 2123, '23000');
PERFORM _upsert_qb_account('23003',               'LA AGUSTEDAD-COFINE',     'liability', 'debt', false, 2124, '23000');
PERFORM _upsert_qb_account('23004',               'MANINOS CAPITAL',         'liability', 'debt', false, 2125, '23000');
PERFORM _upsert_qb_account('23005',               'GABRIEL CANTU',           'liability', 'debt', false, 2126, '23000');
PERFORM _upsert_qb_account('23006',               'Jack Leal',               'liability', 'debt', false, 2127, '23000');
PERFORM _upsert_qb_account('23007',               'LA AGUSTEDAD MONEX',      'liability', 'debt', false, 2128, '23000');
PERFORM _upsert_qb_account('23008',               'LAETIUTITA (SUREHAUL TRANSPORT LLC)', 'liability', 'debt', false, 2129, '23000');
PERFORM _upsert_qb_account('23009',               'PARA TRANSFERIR A MANINOS CAPITAL', 'liability', 'debt', false, 2130, '23000');
PERFORM _upsert_qb_account('23010',               'SGZ',                     'liability', 'debt', false, 2131, '23000');
PERFORM _upsert_qb_account('23011',               'Vicente Gonzalez',        'liability', 'debt', false, 2132, '23000');
PERFORM _upsert_qb_account('24300',               '24300 Prepaid Land Lease','liability', 'prepaid', false, 2140, 'BS_OTHER_CUR_LIAB');

-- Long-term Liabilities
PERFORM _upsert_qb_account('BS_LONGTERM_LIAB',    'Long-term Liabilities',   'liability', 'header', true, 2200, 'BS_LIABILITIES');
PERFORM _upsert_qb_account('LT_BUSINESS_LOANS',   'Long-term business loans','liability', 'loans', true, 2201, 'BS_LONGTERM_LIAB');
PERFORM _upsert_qb_account('LT_GABRIEL',          'Gabriel',                 'liability', 'loans', false, 2202, 'LT_BUSINESS_LOANS');

-- ======================== BALANCE SHEET: EQUITY ========================

PERFORM _upsert_qb_account('BS_EQUITY',           'Equity',                  'equity', 'header', true, 3000, NULL);
PERFORM _upsert_qb_account('30000',               '30000 Member''s contributions', 'equity', 'contributions', true, 3010, 'BS_EQUITY');
PERFORM _upsert_qb_account('30001',               'BSGZ',                    'equity', 'contributions', false, 3011, '30000');
PERFORM _upsert_qb_account('30002',               'EMANUEL / JACOB',         'equity', 'contributions', false, 3012, '30000');
PERFORM _upsert_qb_account('30003',               'GABRIEL CANTU',           'equity', 'contributions', false, 3013, '30000');
PERFORM _upsert_qb_account('30004',               'MARIA FAZ',               'equity', 'contributions', false, 3014, '30000');
PERFORM _upsert_qb_account('30200',               '30200 Dividends paid',    'equity', 'dividends', false, 3020, 'BS_EQUITY');
PERFORM _upsert_qb_account('32000',               '32000 Opening balance equity', 'equity', 'opening', false, 3030, 'BS_EQUITY');
PERFORM _upsert_qb_account('33000',               '33000 Retained Earnings', 'equity', 'retained', false, 3040, 'BS_EQUITY');

-- ======================== P&L: INCOME ========================

PERFORM _upsert_qb_account('PL_INCOME',           'Income',                  'income', 'header', true, 4000, NULL);
PERFORM _upsert_qb_account('40000',               '40000 House Sales',       'income', 'sales',  false, 4010, 'PL_INCOME');

-- ======================== P&L: COST OF GOODS SOLD ========================

PERFORM _upsert_qb_account('PL_COGS',             'Cost of Goods Sold',      'cogs', 'header', true, 5000, NULL);
PERFORM _upsert_qb_account('50000',               '50000 Cost of goods sold','cogs', 'cogs',   true, 5010, 'PL_COGS');
PERFORM _upsert_qb_account('50020',               '50020 House Sales - COGS','cogs', 'cogs',   false, 5020, '50000');

-- ======================== P&L: EXPENSES (Operating) ========================

PERFORM _upsert_qb_account('PL_EXPENSES',         'Expenses',                'expense', 'header', true, 6000, NULL);
PERFORM _upsert_qb_account('60000',               '60000 Operating Expenses','expense', 'header', true, 6010, 'PL_EXPENSES');

-- General & Administrative
PERFORM _upsert_qb_account('60100',               '60100 General and Administrative Expenses', 'expense', 'header', true, 6100, '60000');

PERFORM _upsert_qb_account('60500',               '60500 Office expenses',   'expense', 'header', true, 6110, '60100');
PERFORM _upsert_qb_account('60510',               '60510 Office supplies',   'expense', 'office', false, 6111, '60500');
PERFORM _upsert_qb_account('60560',               '60560 Software & apps',   'expense', 'office', false, 6112, '60500');
PERFORM _upsert_qb_account('60570',               'GASTOS DE CREDITO',       'expense', 'office', false, 6113, '60500');

PERFORM _upsert_qb_account('60600',               '60600 Other business expenses', 'expense', 'header', true, 6120, '60100');
PERFORM _upsert_qb_account('60620',               '60620 Memberships & subscriptions', 'expense', 'business', false, 6121, '60600');
PERFORM _upsert_qb_account('60640',               '60640 Commissions & fees','expense', 'business', false, 6122, '60600');
PERFORM _upsert_qb_account('60660',               '60660 Rent',              'expense', 'business', false, 6123, '60600');

PERFORM _upsert_qb_account('60800',               '60800 Utilities',         'expense', 'header', true, 6130, '60600');
PERFORM _upsert_qb_account('60810',               '60810 Disposal & waste fees', 'expense', 'utilities', false, 6131, '60800');
PERFORM _upsert_qb_account('60820',               '60820 Electricity',       'expense', 'utilities', false, 6132, '60800');
PERFORM _upsert_qb_account('60850',               '60850 Phone service',     'expense', 'utilities', false, 6133, '60800');
PERFORM _upsert_qb_account('60860',               '60860 Water & sewer',     'expense', 'utilities', false, 6134, '60800');

PERFORM _upsert_qb_account('60120',               '60120 Bank fees & service charges', 'expense', 'banking', false, 6140, '60000');

-- Labor Costs
PERFORM _upsert_qb_account('61000',               '61000 Labor Costs',       'expense', 'header', true, 6200, '60000');
PERFORM _upsert_qb_account('61300',               '61300 Other Contractors', 'expense', 'labor',  false, 6201, '61000');
PERFORM _upsert_qb_account('61400',               '61400 Cleaning Expense',  'expense', 'labor',  false, 6202, '61000');
PERFORM _upsert_qb_account('61500',               '61500 Landscaping Expenses', 'expense', 'labor', false, 6203, '61000');
PERFORM _upsert_qb_account('61700',               '61700 Supplies & materials', 'expense', 'labor', false, 6204, '61000');

-- Professional Fees
PERFORM _upsert_qb_account('65000',               '65000 Professional Fees', 'expense', 'header', true, 6300, '60000');
PERFORM _upsert_qb_account('65010',               '65010 Accounting fees',   'expense', 'professional', false, 6301, '65000');
PERFORM _upsert_qb_account('65020',               '65020 Legal Fees',        'expense', 'professional', false, 6302, '65000');
PERFORM _upsert_qb_account('65040',               '65040 Consulting services','expense', 'professional', false, 6303, '65000');

-- Vehicle Expenses
PERFORM _upsert_qb_account('67000',               '67000 Vehicle expenses',  'expense', 'header', true, 6400, '60000');
PERFORM _upsert_qb_account('67300',               '67300 Vehicle gas & fuel','expense', 'vehicle', false, 6401, '67000');
PERFORM _upsert_qb_account('67500',               '67500 Vehicle registration', 'expense', 'vehicle', false, 6402, '67000');

-- Advertising
PERFORM _upsert_qb_account('68000',               '68000 Advertising & marketing', 'expense', 'header', true, 6500, '60000');
PERFORM _upsert_qb_account('68120',               '68120 Social media',      'expense', 'marketing', false, 6501, '68000');

-- Standalone expenses under PL_EXPENSES
PERFORM _upsert_qb_account('68500',               '68500 Interest Expense',  'expense', 'interest', false, 6600, 'PL_EXPENSES');
PERFORM _upsert_qb_account('68510',               '68510 Other Consulting Fees', 'expense', 'consulting', false, 6610, 'PL_EXPENSES');

-- Other Operating Expenses
PERFORM _upsert_qb_account('69000',               '69000 Other Operating Expenses', 'expense', 'header', true, 6700, 'PL_EXPENSES');
PERFORM _upsert_qb_account('69100',               '69100 Post-Sales Service Income', 'expense', 'post_sale', false, 6701, '69000');
PERFORM _upsert_qb_account('69110',               '69110 Post-Sale Service Expenses', 'expense', 'post_sale', false, 6702, '69000');
PERFORM _upsert_qb_account('69200',               '69200 House Lease Income','expense', 'lease',  false, 6703, '69000');
PERFORM _upsert_qb_account('69210',               '69210 Land Lease Income', 'expense', 'lease',  false, 6704, '69000');

-- ======================== P&L: OTHER EXPENSES ========================

PERFORM _upsert_qb_account('PL_OTHER_EXPENSES',   'Other Expenses',          'expense', 'header', true, 8000, NULL);
PERFORM _upsert_qb_account('80000',               '80000 Distribution Costs','expense', 'header', true, 8010, 'PL_OTHER_EXPENSES');
PERFORM _upsert_qb_account('80010',               '80010 Los Maninos Mx',    'expense', 'distribution', false, 8011, '80000');
PERFORM _upsert_qb_account('80020',               '80020 Gabriel Gonzalez',  'expense', 'distribution', false, 8012, '80000');
PERFORM _upsert_qb_account('80040',               '80040 Maria Faz',         'expense', 'distribution', false, 8013, '80000');

END $$;

-- 5. Cleanup helper function
DROP FUNCTION IF EXISTS _upsert_qb_account;

-- 6. Add index for hierarchy queries
CREATE INDEX IF NOT EXISTS idx_acct_parent ON accounting_accounts(parent_account_id);
CREATE INDEX IF NOT EXISTS idx_acct_display_order ON accounting_accounts(display_order);

