-- Migración 119: fecha de la venta (lista de Abby, punto 2)
--
-- Las ventas no tenían fecha propia: todo (factura a Capital, comisiones,
-- costo de la casa, informes por mes) usaba el día en que se registró en la
-- app. Ventas cerradas antes de registrarlas caían en el mes equivocado.
-- Las existentes toman la fecha en que se crearon (lo que se usaba hasta hoy).
--
-- Idempotente.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS sale_date DATE;

UPDATE public.sales SET sale_date = (created_at AT TIME ZONE 'America/Chicago')::date
WHERE sale_date IS NULL;

ALTER TABLE public.sales ALTER COLUMN sale_date SET DEFAULT ((now() AT TIME ZONE 'America/Chicago')::date);

-- Comprobación:  SELECT id, created_at, sale_date FROM public.sales ORDER BY created_at DESC LIMIT 10;
