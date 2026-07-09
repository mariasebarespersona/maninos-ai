-- ============================================================================
-- Migration 098: "House Sales - RTO" income account
-- ============================================================================
-- Splits financed (RTO) sale income from cash (contado) sale income so the
-- "Desglose de Ingresos" can show a real "Ventas RTO" bucket. Before this,
-- RTO down payments + the financed portion all credited "House Sales"
-- (contado), so "Ventas RTO" was always $0.
--
-- The chart uses the account NAME as its `code` (see api/services/ledger.py).
-- RTO income (sale_down_payment_received event + the [CAPFIN:] receivable
-- invoice to Maninos Capital) now credits "House Sales - RTO".
--
-- Idempotent.
-- ============================================================================

INSERT INTO accounting_accounts (code, name, account_type, category, parent_account_id, is_header, is_active, display_order, description)
SELECT 'House Sales - RTO', 'House Sales - RTO', 'Income', 'ventas_rto',
       (SELECT id FROM accounting_accounts WHERE code = 'House Sales' LIMIT 1),
       false, true, 140, 'Ingreso de ventas financiadas (RTO): enganche + porción financiada'
WHERE NOT EXISTS (SELECT 1 FROM accounting_accounts WHERE code = 'House Sales - RTO');
