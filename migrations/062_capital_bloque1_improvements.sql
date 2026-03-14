-- Migration 062: Capital Bloque 1 Improvements
-- Split movements, down payment installments, promissory note alert tracking

-- 1. Split movements support on capital_statement_movements
ALTER TABLE capital_statement_movements ADD COLUMN IF NOT EXISTS parent_movement_id UUID REFERENCES capital_statement_movements(id);
ALTER TABLE capital_statement_movements ADD COLUMN IF NOT EXISTS is_split_parent BOOLEAN DEFAULT false;

-- 2. Down payment installments table
CREATE TABLE IF NOT EXISTS capital_down_payment_installments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES rto_contracts(id),
  installment_number INT NOT NULL,
  amount DECIMAL(14,2) NOT NULL,
  due_date DATE,
  paid_date DATE,
  payment_method TEXT,
  payment_reference TEXT,
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'paid', 'partial', 'overdue')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Promissory note alert tracking
ALTER TABLE promissory_notes ADD COLUMN IF NOT EXISTS last_maturity_alert_at TIMESTAMPTZ;
