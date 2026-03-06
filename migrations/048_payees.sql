-- 048: Payees table — stores seller bank info for property purchases
-- Maninos Homes pays sellers via bank transfer (80%+ of purchases)
-- This table allows reusing saved payees across purchases

CREATE TABLE IF NOT EXISTS payees (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,                          -- Beneficiary full legal name
  bank_name TEXT NOT NULL,                     -- Bank name (e.g., Chase, Wells Fargo)
  routing_number TEXT NOT NULL,                -- ABA routing number (9 digits)
  account_number TEXT NOT NULL,                -- Bank account number
  account_type TEXT NOT NULL DEFAULT 'checking', -- 'checking' or 'savings'
  address TEXT,                                -- Beneficiary address (optional)
  bank_address TEXT,                           -- Bank address (optional)
  memo TEXT,                                   -- Default memo/reference
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT payees_account_type_check CHECK (account_type IN ('checking', 'savings')),
  CONSTRAINT payees_routing_number_check CHECK (length(routing_number) = 9)
);

-- Index for searching payees by name
CREATE INDEX IF NOT EXISTS idx_payees_name ON payees(name);

-- RLS
ALTER TABLE payees ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users full access (internal employees only)
CREATE POLICY "payees_all" ON payees FOR ALL USING (true) WITH CHECK (true);
