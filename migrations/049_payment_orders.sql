-- Migration 049: Payment Orders
-- Pending payment order workflow: Gabriel creates orders, Abigail (Treasury) completes them
-- Status flow: pending → completed | cancelled

CREATE TABLE IF NOT EXISTS payment_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Property reference
  property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
  property_address TEXT,

  -- Who created it
  created_by TEXT,

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'cancelled')),

  -- Payee snapshot (denormalized so order is self-contained)
  payee_id UUID REFERENCES payees(id) ON DELETE SET NULL,
  payee_name TEXT NOT NULL,
  bank_name TEXT,
  routing_number_last4 TEXT,
  account_number_last4 TEXT,
  account_type TEXT DEFAULT 'checking',

  -- Payment details
  amount NUMERIC(12, 2) NOT NULL,
  method TEXT NOT NULL DEFAULT 'transferencia',
  reference TEXT,           -- confirmation # filled by Abigail
  payment_date DATE,        -- actual payment date filled by Abigail

  -- Accounting bridge
  accounting_transaction_id UUID,
  bank_account_id UUID,     -- which bank account Abigail paid from

  -- Metadata
  notes TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ,
  cancelled_by TEXT,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Fast filtering by status
CREATE INDEX idx_payment_orders_status ON payment_orders(status);
CREATE INDEX idx_payment_orders_property ON payment_orders(property_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_payment_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_orders_updated_at
  BEFORE UPDATE ON payment_orders
  FOR EACH ROW
  EXECUTE FUNCTION update_payment_orders_updated_at();
