-- Migración 118: clase (yard) en los movimientos de estado de cuenta
--
-- Lista de Abby (2026-10-13), punto 8: al subir un estado de cuenta y asignar
-- la cuenta contable de cada movimiento no se podía elegir la Clase (Houston,
-- Conroe, Dallas), así que los asientos que genera salían sin clase y el P&L
-- por ubicación no los repartía. Las facturas y los asientos ya tienen
-- yard_id (migraciones 017/026/027); faltaba aquí.
--
-- Idempotente.

ALTER TABLE public.statement_movements
    ADD COLUMN IF NOT EXISTS yard_id UUID REFERENCES public.yards(id) ON DELETE SET NULL;

-- Comprobación:  SELECT id, description, yard_id FROM public.statement_movements ORDER BY created_at DESC LIMIT 10;
