-- Migración 112: recordar en qué estado estaba la casa antes de venderse
--
-- Al crear una venta, la casa pasa a 'reserved' y, al cobrarse o aprobarse, a
-- 'sold'. Pero el estado ANTERIOR no se guardaba en ningún sitio, así que al
-- cancelar la venta no había forma de devolverla a donde estaba: el código
-- solo sabía poner 'published', y encima únicamente si la casa seguía en
-- 'reserved'. Si ya estaba en 'sold' —que es lo normal en cuanto se cobra— no
-- la tocaba, y la casa se quedaba marcada como vendida para siempre.
--
-- Es el caso que reportó Abby con la H42.
--
-- Guardar el estado previo permite devolver la casa EXACTAMENTE a donde estaba
-- (una casa en obra vuelve a 'renovating', una consignación a 'purchased'),
-- en vez de mandarlas todas a 'published' y dar por hecho que estaban ahí.
--
-- Idempotente.

ALTER TABLE sales
    ADD COLUMN IF NOT EXISTS property_status_before TEXT;

COMMENT ON COLUMN sales.property_status_before IS
    'Estado de la propiedad justo antes de reservarla para esta venta. Se usa para restaurarlo si la venta se cancela.';

-- Comprobación:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'sales' AND column_name = 'property_status_before';
