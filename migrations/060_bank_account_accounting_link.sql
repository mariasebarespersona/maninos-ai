-- Link bank_accounts to their corresponding QuickBooks accounting account
ALTER TABLE bank_accounts
  ADD COLUMN IF NOT EXISTS accounting_account_id UUID REFERENCES accounting_accounts(id);

-- Link paired double-entry transactions together
ALTER TABLE accounting_transactions
  ADD COLUMN IF NOT EXISTS linked_transaction_id UUID REFERENCES accounting_transactions(id);
