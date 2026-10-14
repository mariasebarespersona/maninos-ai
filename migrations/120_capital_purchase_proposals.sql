-- Migración 120: propuestas de compra de Capital
--
-- Proceso de Capital, paso "Calcular renta y margen": la plataforma calcula la
-- renta sugerida por plazo (24/36/48) y enganche, el margen anual frente al
-- coste del fondeo, y confirma que hay fondeo disponible. El resultado es una
-- PROPUESTA DE COMPRA que se guarda (con la foto de los números de ese día) y
-- se aprueba o rechaza. Solo Capital: no toca Homes ni la contabilidad.
--
-- Idempotente.

CREATE TABLE IF NOT EXISTS public.capital_purchase_proposals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    origen TEXT CHECK (origen IN ('homes', 'mercado', 'recompra')),
    property_id UUID REFERENCES public.properties(id) ON DELETE SET NULL,
    casa TEXT,                         -- código o dirección de la casa
    precio DECIMAL(12, 2) NOT NULL CHECK (precio > 0),
    enganche DECIMAL(12, 2) NOT NULL DEFAULT 0,
    plazo_meses INTEGER NOT NULL CHECK (plazo_meses > 0),
    mensualidad DECIMAL(12, 2) NOT NULL CHECK (mensualidad > 0),
    margen_anual DECIMAL(8, 4),        -- (renta × plazo − financiado) ÷ financiado ÷ años
    costo_fondeo DECIMAL(8, 4),        -- tasa media de los pagarés vivos ese día
    semaforo TEXT,                     -- rojo / amarillo / verde
    valor_mercado DECIMAL(12, 2),
    renta_mercado DECIMAL(12, 2),
    fondeo_disponible DECIMAL(14, 2),
    detalle JSONB,                     -- evaluación completa tal como se vio
    status TEXT NOT NULL DEFAULT 'borrador' CHECK (status IN ('borrador', 'aprobada', 'rechazada')),
    notas TEXT,
    created_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    decided_by TEXT,
    decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_capital_purchase_proposals_created ON public.capital_purchase_proposals(created_at DESC);

-- Comprobación:  SELECT casa, precio, mensualidad, margen_anual, semaforo, status FROM public.capital_purchase_proposals ORDER BY created_at DESC;
