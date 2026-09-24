-- Migración 114: transportistas guardados (movidas)
--
-- Los proveedores de movida estaban escritos a fuego en el código (Angel
-- Trujillo y Josue Koko), así que contratar a uno nuevo obligaba a teclear su
-- nombre, conductor y teléfono cada vez, sin que quedara guardado ni pudiera
-- mandársele el SMS de presupuesto.
--
-- Los dos de siempre se siembran aquí con sus mismos identificadores
-- ('trujillo', 'koko') para no romper nada que ya los referencie.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS movers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    -- Solo dígitos, para el enlace de SMS. Se rellena solo al dar de alta.
    phone_raw TEXT,
    notes TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO movers (id, name, company, phone, phone_raw)
SELECT 'trujillo', 'Angel Trujillo', 'Trujillo''s Mobile Homes', '(936) 718-3321', '19367183321'
WHERE NOT EXISTS (SELECT 1 FROM movers WHERE id = 'trujillo');

INSERT INTO movers (id, name, company, phone, phone_raw)
SELECT 'koko', 'Josue Koko', NULL, '(832) 358-6264', '18323586264'
WHERE NOT EXISTS (SELECT 1 FROM movers WHERE id = 'koko');

-- Comprobación:  SELECT id, name, company, phone FROM movers ORDER BY name;
