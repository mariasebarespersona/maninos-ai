-- Migration 050: Add full bank details to payment_orders
-- Abigail needs routing_number + account_number to execute the transfer

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS routing_number TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS payee_address TEXT;
ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS bank_address TEXT;
