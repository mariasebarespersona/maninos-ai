-- Migración 115: valor de mercado manual por casa financiada (Capital)
--
-- Tarea "Evaluar precio vs. mercado" del Responsable de Adquisiciones: el
-- precio que paga Capital por la casa se compara con su valor de mercado
-- (regla: ≤ 70%). El valor sale primero del histórico de ventas de Maninos y
-- luego de los anuncios scrapeados; cuando ninguno da base suficiente, el
-- responsable lo escribe a mano CON SU FUENTE (comparables, tasación…). Ese
-- valor manual vive aquí, uno por venta, y prevalece sobre el automático.
--
-- Solo es un dato de evaluación: no genera asientos ni toca la contabilidad.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS capital_market_valuations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sale_id UUID NOT NULL UNIQUE REFERENCES sales(id) ON DELETE CASCADE,
    market_value DECIMAL(12, 2) NOT NULL CHECK (market_value > 0),
    -- De dónde sale el número. Obligatorio: un valor sin fuente no se audita.
    source TEXT NOT NULL CHECK (length(trim(source)) > 0),
    notes TEXT,
    evaluated_by TEXT,
    evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Comprobación:  SELECT sale_id, market_value, source, evaluated_by FROM capital_market_valuations;
