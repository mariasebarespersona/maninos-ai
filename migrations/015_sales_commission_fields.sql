-- Migration 015: Add commission fields to sales table
-- Date: Feb 2026
-- Reason: Maninos commission rules confirmed D1 Texas trip
--   Cash: $1,500 | RTO: $1,000 | Split 50/50 found_by/sold_by
--
-- NOTE: found_by/sold_by reference the existing `users` table (employees = users).
--   No separate employees table needed — users already has name, email, role.

-- Add employee tracking fields (references users table)
ALTER TABLE sales ADD COLUMN IF NOT EXISTS found_by_employee_id UUID REFERENCES users(id);
ALTER TABLE sales ADD COLUMN IF NOT EXISTS sold_by_employee_id UUID REFERENCES users(id);

-- Add commission calculation fields
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_amount DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_found_by DECIMAL(10,2) DEFAULT 0;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS commission_sold_by DECIMAL(10,2) DEFAULT 0;

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_sales_found_by ON sales(found_by_employee_id);
CREATE INDEX IF NOT EXISTS idx_sales_sold_by ON sales(sold_by_employee_id);

-- Comments
COMMENT ON COLUMN sales.found_by_employee_id IS 'User (employee) who found the client/lead';
COMMENT ON COLUMN sales.sold_by_employee_id IS 'User (employee) who closed the sale';
COMMENT ON COLUMN sales.commission_amount IS 'Total commission: $1500 cash, $1000 RTO';
COMMENT ON COLUMN sales.commission_found_by IS '50% for found_by (or 100% if same person)';
COMMENT ON COLUMN sales.commission_sold_by IS '50% for sold_by (or 0% if same person)';

