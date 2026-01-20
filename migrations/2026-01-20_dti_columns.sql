-- ============================================================================
-- MIGRACIÓN: DTI (Debt-to-Income) Columns
-- Fecha: 2026-01-20
-- Proceso: INCORPORAR - Procedimiento 3 (Evaluar aspectos financieros)
-- ============================================================================

-- Añadir columna dti_score a tabla clients
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS dti_score NUMERIC,
    ADD COLUMN IF NOT EXISTS risk_profile TEXT;

-- Comentarios
COMMENT ON COLUMN clients.dti_score IS 'DTI score calculado (porcentaje)';
COMMENT ON COLUMN clients.risk_profile IS 'Perfil de riesgo: low, medium, high';

