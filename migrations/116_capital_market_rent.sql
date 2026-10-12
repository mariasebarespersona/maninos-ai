-- Migración 116: renta de mercado en la evaluación de compra (Capital)
--
-- Jorge (2026-10-12): además de que la compra quede por debajo del valor de
-- mercado, la RENTA que paga el cliente tampoco puede estar fuera de mercado.
-- La app no tiene datos de rentas, así que el responsable la escribe a mano
-- con su fuente, igual que el valor de mercado manual (migración 115).
--
-- Una fila puede traer solo el valor, solo la renta o los dos: por eso el
-- valor y su fuente dejan de ser obligatorios (la API exige la fuente de lo
-- que se informe).
--
-- Idempotente.

ALTER TABLE public.capital_market_valuations
    ADD COLUMN IF NOT EXISTS market_rent DECIMAL(12, 2) CHECK (market_rent > 0),
    ADD COLUMN IF NOT EXISTS rent_source TEXT;

ALTER TABLE public.capital_market_valuations ALTER COLUMN market_value DROP NOT NULL;
ALTER TABLE public.capital_market_valuations ALTER COLUMN source DROP NOT NULL;

-- Comprobación:  SELECT sale_id, market_value, source, market_rent, rent_source FROM public.capital_market_valuations;
