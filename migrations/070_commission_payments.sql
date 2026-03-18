-- Migration 070: Commission Payments Table
-- Track per-employee commission payments independently
-- A sale can generate 2 commission_payments rows (one for found_by, one for sold_by)

CREATE TABLE IF NOT EXISTS commission_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES users(id),
    role TEXT NOT NULL CHECK (role IN ('found_by', 'sold_by')),
    amount DECIMAL(10,2) NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
    paid_at TIMESTAMPTZ,
    paid_by UUID REFERENCES users(id),
    accounting_transaction_id UUID REFERENCES accounting_transactions(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(sale_id, employee_id, role)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_commission_payments_employee ON commission_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_commission_payments_status ON commission_payments(status);
CREATE INDEX IF NOT EXISTS idx_commission_payments_sale ON commission_payments(sale_id);

-- Backfill from existing sales that have commission data
INSERT INTO commission_payments (sale_id, employee_id, role, amount, status)
SELECT
    s.id,
    s.found_by_employee_id,
    'found_by',
    s.commission_found_by,
    'pending'
FROM sales s
WHERE s.found_by_employee_id IS NOT NULL
  AND s.commission_found_by > 0
ON CONFLICT (sale_id, employee_id, role) DO NOTHING;

INSERT INTO commission_payments (sale_id, employee_id, role, amount, status)
SELECT
    s.id,
    s.sold_by_employee_id,
    'sold_by',
    s.commission_sold_by,
    'pending'
FROM sales s
WHERE s.sold_by_employee_id IS NOT NULL
  AND s.commission_sold_by > 0
  AND s.sold_by_employee_id != s.found_by_employee_id
ON CONFLICT (sale_id, employee_id, role) DO NOTHING;
