-- Migración 117: enlazar cada pago de una venta con su orden de cobro
--
-- Lista de Abby (2026-10-13): pagos editados en Ventas que nunca llegaron al
-- banco. Un sale_payment y la payment_order que lo lleva a contabilidad no
-- estaban enlazados, así que editar el importe del pago no podía corregir la
-- orden (ni saber si ya estaba contabilizada), y una orden fallida o borrada
-- dejaba el pago "huérfano" sin que nadie lo notara.
--
-- Con el enlace, editar un pago pendiente ajusta su orden, y un pago ya
-- contabilizado no se puede editar a ciegas.
--
-- Idempotente.

ALTER TABLE public.sale_payments
    ADD COLUMN IF NOT EXISTS payment_order_id UUID REFERENCES public.payment_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sale_payments_payment_order_id ON public.sale_payments(payment_order_id);

-- Comprobación:  SELECT id, amount, payment_order_id FROM public.sale_payments ORDER BY created_at DESC LIMIT 10;
