-- One-off fix: Backfill amount_paid/amount_pending for existing sales
-- The trigger only fires on sale_payments changes, so we need to directly set values
-- for sales that have no sale_payment records.

-- Completed sales: fully paid
UPDATE sales
SET amount_paid = sale_price, amount_pending = 0
WHERE status = 'completed';

-- Cancelled sales: nothing paid
UPDATE sales
SET amount_paid = 0, amount_pending = 0
WHERE status = 'cancelled';

-- All other active sales without any sale_payments: pending = sale_price
UPDATE sales
SET amount_paid = 0, amount_pending = sale_price
WHERE status NOT IN ('completed', 'cancelled')
  AND id NOT IN (SELECT DISTINCT sale_id FROM sale_payments);

-- Sales WITH sale_payments: let the trigger handle it by doing a no-op update on each payment
-- (This recalculates totals from confirmed payments)
UPDATE sale_payments SET updated_at = NOW()
WHERE sale_id IN (SELECT DISTINCT sale_id FROM sale_payments);
