-- Migration 079: Add direction to payment_orders (inbound vs outbound)
-- inbound = money coming IN (client payments to Maninos)
-- outbound = money going OUT (Maninos pays vendor/employee)

ALTER TABLE payment_orders ADD COLUMN IF NOT EXISTS direction TEXT DEFAULT 'outbound';

-- Backfill: pago_venta orders are inbound
UPDATE payment_orders SET direction = 'inbound' WHERE concept = 'pago_venta';

-- Everything else stays outbound (compra, renovacion, movida, comision, etc.)

CREATE INDEX IF NOT EXISTS idx_payment_orders_direction ON payment_orders(direction);
