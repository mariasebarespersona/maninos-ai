-- ============================================================================
-- Migration 045: Add placeholder RTO income accounts for Capital
-- ============================================================================
-- These accounts are needed for the auto-mapping system to correctly assign
-- synced transactions (RTO payments, down payments, late fees) to
-- accounting accounts so they appear in P&L and Balance Sheet reports.
--
-- NOTE: When Sebastian provides the complete chart of accounts,
-- these may be renamed or reassigned. The mapping in
-- api/routes/capital/accounting.py (INCOME_ACCOUNT_MAP) references
-- these codes and will auto-resolve them.
-- ============================================================================

-- 41000 RTO Rental Income (child of 40000 Operating Income)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('41000', 'RTO Rental Income', 'income', 'general', false, 'profit_loss', 411,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

-- 42000 Down Payment Income (child of 40000 Operating Income)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('42000', 'Down Payment Income', 'income', 'general', false, 'profit_loss', 412,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

-- 43000 Late Fee Income (child of 40000 Operating Income)
INSERT INTO capital_accounts (code, name, account_type, category, is_header, report_section, display_order, parent_account_id)
VALUES ('43000', 'Late Fee Income', 'income', 'general', false, 'profit_loss', 413,
  (SELECT id FROM capital_accounts WHERE code = '40000'))
ON CONFLICT (code) DO NOTHING;

