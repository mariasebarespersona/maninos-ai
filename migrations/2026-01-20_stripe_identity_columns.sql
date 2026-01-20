-- ============================================================================
-- MIGRACIÓN: Stripe Identity Columns for KYC
-- Fecha: 2026-01-20
-- ============================================================================

-- Añadir columnas para Stripe Identity en tabla clients
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS stripe_verification_session_id TEXT,
    ADD COLUMN IF NOT EXISTS stripe_verification_url TEXT,
    ADD COLUMN IF NOT EXISTS stripe_verification_status TEXT;

-- Actualizar CHECK constraint de kyc_status para incluir nuevos estados de Stripe
-- Primero eliminamos el constraint existente
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_kyc_status_check;

-- Luego creamos el nuevo constraint con más valores
ALTER TABLE clients ADD CONSTRAINT clients_kyc_status_check 
    CHECK (kyc_status IN ('pending', 'processing', 'verified', 'rejected', 'canceled', 'requires_input'));

-- Índice para búsqueda por session_id de Stripe
CREATE INDEX IF NOT EXISTS idx_clients_stripe_session ON clients(stripe_verification_session_id);

-- Comentario
COMMENT ON COLUMN clients.stripe_verification_session_id IS 'Stripe Identity verification session ID';
COMMENT ON COLUMN clients.stripe_verification_url IS 'URL de verificación para el cliente';
COMMENT ON COLUMN clients.stripe_verification_status IS 'Estado de Stripe: requires_input, processing, verified, canceled';

