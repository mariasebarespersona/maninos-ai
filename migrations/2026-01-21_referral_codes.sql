-- ============================================================================
-- Migración: Sistema de Códigos de Referido
-- Fecha: 2026-01-21
-- Descripción: Añade columnas para el sistema de referidos en tabla clients
-- ============================================================================

-- Añadir columnas de referido a la tabla clients
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE,           -- Código único del cliente (ej: "JUAN2024")
    ADD COLUMN IF NOT EXISTS referred_by_client_id UUID REFERENCES clients(id),  -- Quién lo refirió
    ADD COLUMN IF NOT EXISTS referred_by_code TEXT,               -- Código usado al registrarse
    ADD COLUMN IF NOT EXISTS referral_bonus_earned NUMERIC DEFAULT 0,  -- Total de bonos ganados
    ADD COLUMN IF NOT EXISTS referral_bonus_pending NUMERIC DEFAULT 0, -- Bonos pendientes de pago
    ADD COLUMN IF NOT EXISTS referral_count INTEGER DEFAULT 0;    -- Cantidad de referidos exitosos

-- Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS idx_clients_referral_code ON clients(referral_code);
CREATE INDEX IF NOT EXISTS idx_clients_referred_by ON clients(referred_by_client_id);

-- Tabla para tracking detallado de referidos (historial)
CREATE TABLE IF NOT EXISTS referral_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_client_id UUID NOT NULL REFERENCES clients(id),  -- Cliente que refirió
    referred_client_id UUID REFERENCES clients(id),           -- Cliente referido (NULL si aún no se registró)
    referral_code TEXT NOT NULL,                              -- Código usado
    referred_name TEXT,                                        -- Nombre del referido
    referred_email TEXT,                                       -- Email del referido
    referred_phone TEXT,                                       -- Teléfono del referido
    status TEXT CHECK (status IN ('pending', 'registered', 'converted', 'bonus_paid', 'expired')) DEFAULT 'pending',
    bonus_amount NUMERIC DEFAULT 0,                           -- Monto del bono
    bonus_paid_at TIMESTAMPTZ,                                -- Cuándo se pagó el bono
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para referral_history
CREATE INDEX IF NOT EXISTS idx_referral_history_referrer ON referral_history(referrer_client_id);
CREATE INDEX IF NOT EXISTS idx_referral_history_referred ON referral_history(referred_client_id);
CREATE INDEX IF NOT EXISTS idx_referral_history_code ON referral_history(referral_code);
CREATE INDEX IF NOT EXISTS idx_referral_history_status ON referral_history(status);

-- RLS para referral_history
ALTER TABLE referral_history ENABLE ROW LEVEL SECURITY;

-- Empleados pueden ver todo
CREATE POLICY "Employees can manage referral_history"
    ON referral_history FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE id = auth.uid() AND role IN ('employee', 'admin')
        )
    );

-- Clientes pueden ver sus propios referidos
CREATE POLICY "Clients can view own referrals"
    ON referral_history FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM clients
            WHERE clients.id = referral_history.referrer_client_id
            AND clients.user_id = auth.uid()
        )
    );

-- Función para generar código de referido único
CREATE OR REPLACE FUNCTION generate_unique_referral_code(client_name TEXT)
RETURNS TEXT AS $$
DECLARE
    base_code TEXT;
    final_code TEXT;
    counter INTEGER := 0;
BEGIN
    -- Tomar primeras 4 letras del nombre en mayúsculas
    base_code := UPPER(SUBSTRING(REGEXP_REPLACE(client_name, '[^a-zA-Z]', '', 'g'), 1, 4));
    
    -- Si el nombre es muy corto, rellenar
    IF LENGTH(base_code) < 4 THEN
        base_code := RPAD(base_code, 4, 'X');
    END IF;
    
    -- Añadir año actual
    final_code := base_code || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT;
    
    -- Si existe, añadir contador
    WHILE EXISTS (SELECT 1 FROM clients WHERE referral_code = final_code) LOOP
        counter := counter + 1;
        final_code := base_code || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || counter::TEXT;
    END LOOP;
    
    RETURN final_code;
END;
$$ LANGUAGE plpgsql;

-- Comentarios
COMMENT ON COLUMN clients.referral_code IS 'Código único de referido del cliente (ej: JUAN2026)';
COMMENT ON COLUMN clients.referred_by_client_id IS 'ID del cliente que lo refirió';
COMMENT ON COLUMN clients.referral_bonus_earned IS 'Total de bonos ganados por referidos';
COMMENT ON TABLE referral_history IS 'Historial detallado de todos los referidos';

