-- Capital accounting improvements: reconciliation, double-entry, bank linking
-- Mirrors Homes accounting improvements for Capital tables

-- Source tracking on transactions (manual vs bank_statement)
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';

-- Double-entry linking between P&L and bank-side transactions
ALTER TABLE capital_transactions ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES capital_transactions(id);

-- Link bank accounts to their QB chart-of-accounts entry (for Balance Sheet)
ALTER TABLE capital_bank_accounts ADD COLUMN IF NOT EXISTS accounting_account_id UUID REFERENCES capital_accounts(id);

-- Link statement movements to matched transactions (reconciliation)
ALTER TABLE capital_statement_movements ADD COLUMN IF NOT EXISTS matched_transaction_id UUID REFERENCES capital_transactions(id);
