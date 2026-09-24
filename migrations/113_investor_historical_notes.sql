-- Migración 113: histórico de pagarés ya liquidados (solo consulta)
--
-- Son los 29 pagarés cerrados que vienen de la hoja "TABLA INVERSIONISTAS" del
-- Excel CAPITAL GENERAL. Existen para poder consultarlos, nada más: no se
-- recalculan, no devengan intereses y NO tocan la contabilidad.
--
-- Por qué una tabla propia y no `promissory_notes` con estado 'paid':
-- la contabilidad filtra bien por estado, pero la ficha del inversionista suma
-- TODOS sus pagarés sin mirarlo —
--     total_lent = sum(loan_amount for n in notes_data)
-- — así que "Total prestado" y "Obligación total" en Seguimiento se inflarían
-- con $823.347,97 que ya no se deben. Separarlos físicamente evita que se
-- cuelen aunque alguien olvide un filtro en el futuro.
--
-- Solo se guardan los cuatro datos que el Excel tiene fiables. En ese bloque, la
-- columna de tasa contiene importes en dólares (150000 %, 272000 %…) y la de
-- fechas es una fórmula arrastrada (valores consecutivos fila a fila), así que
-- tasa, plazo y fechas se quedan fuera: antes vacías que inventadas.

CREATE TABLE IF NOT EXISTS investor_historical_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    investor_name TEXT NOT NULL,
    investor_number INTEGER,
    original_amount NUMERIC(14,2),
    balance NUMERIC(14,2) DEFAULT 0,
    notes TEXT,
    -- De dónde salió, para poder rehacer la carga o descartarla entera.
    source TEXT NOT NULL DEFAULT 'excel_capital_general',
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Evita duplicar la carga si el script se ejecuta dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hist_notes_unico
    ON investor_historical_notes (source, investor_name, investor_number);

COMMENT ON TABLE investor_historical_notes IS
    'Pagarés liquidados importados del Excel. SOLO CONSULTA: no entran en contabilidad, devengos ni métricas de inversionistas.';

-- Comprobación:  SELECT COUNT(*) FROM investor_historical_notes;
