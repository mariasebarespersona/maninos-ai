-- Migration 078: Add concept column to payment_orders
-- Distinguishes purchase vs renovation vs move orders

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS concept TEXT;

-- Backfill from notes field
UPDATE payment_orders SET concept = 'compra'
WHERE concept IS NULL AND (notes ILIKE '%compra%' OR created_by IS NULL);

UPDATE payment_orders SET concept = 'renovacion'
WHERE concept IS NULL AND (notes ILIKE '%renovacion%' OR notes ILIKE '%renovación%' OR created_by = 'sistema_renovacion' OR created_by = 'sistema_renovaciones');

UPDATE payment_orders SET concept = 'movida'
WHERE concept IS NULL AND (notes ILIKE '%movida%' OR created_by = 'sistema_movidas');

-- Default remaining to 'otro'
UPDATE payment_orders SET concept = 'otro' WHERE concept IS NULL;

CREATE INDEX IF NOT EXISTS idx_payment_orders_concept ON payment_orders(concept);
