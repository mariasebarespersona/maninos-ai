-- ============================================
-- Migration 002: Renovation Materials & Costs
-- ============================================

-- Table: Catálogo de materiales con precios de referencia
CREATE TABLE IF NOT EXISTS materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    unit TEXT NOT NULL,  -- ml, hoja, cubo, gal, m2, pz, kit, m, rollo
    unit_price DECIMAL(10, 2) NOT NULL,
    category TEXT NOT NULL,  -- pisos, paredes, plomeria, electrico, pintura, cerrajeria, otros
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Table: Items de renovación por propiedad
CREATE TABLE IF NOT EXISTS renovation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    renovation_id UUID REFERENCES renovations(id) ON DELETE CASCADE,
    material_id UUID REFERENCES materials(id),
    
    -- Si no usa material del catálogo, puede ser custom
    custom_name TEXT,
    custom_unit TEXT,
    
    quantity DECIMAL(10, 2) NOT NULL DEFAULT 1,
    unit_price DECIMAL(10, 2) NOT NULL,  -- Precio usado (puede diferir del catálogo)
    total_price DECIMAL(10, 2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
    
    notes TEXT,
    purchased BOOLEAN DEFAULT false,
    purchase_date DATE,
    supplier TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert materiales de referencia (lista de Maninos)
INSERT INTO materials (name, unit, unit_price, category) VALUES
    -- Paredes / Tablaroca
    ('Moldura MDF 2"', 'ml', 1.50, 'paredes'),
    ('Tablaroca 3/8" 4x8', 'hoja', 9.80, 'paredes'),
    ('Compuesto para juntas (joint compound)', 'cubo', 19.90, 'paredes'),
    ('Cinta malla para tablaroca', 'rollo', 6.50, 'paredes'),
    
    -- Pintura
    ('Pintura blanca ceiling (galón)', 'gal', 21.50, 'pintura'),
    ('Kilz / Sellador manchas (spray)', 'pz', 6.90, 'pintura'),
    ('Spray Popcorn Texture', 'pz', 15.80, 'pintura'),
    ('Silicón', 'pz', 4.20, 'pintura'),
    ('Cinta masking', 'rollo', 2.10, 'pintura'),
    
    -- Techos / Exterior
    ('Shingle asfáltico', 'm2', 6.80, 'techos'),
    ('Plywood 3/4" 4x8', 'hoja', 29.00, 'techos'),
    
    -- Plomería
    ('Gabinete base 30"', 'pz', 135.00, 'plomeria'),
    ('Lavamanos con grifería (kit)', 'kit', 95.00, 'plomeria'),
    ('Sanitario económico', 'pz', 125.00, 'plomeria'),
    ('Tarja de cocina + mezcladora', 'kit', 110.00, 'plomeria'),
    
    -- Eléctrico
    ('Cable THHN (calibre variable)', 'm', 0.45, 'electrico'),
    ('Apagador sencillo', 'pz', 3.20, 'electrico'),
    ('Contacto dúplex', 'pz', 3.10, 'electrico'),
    
    -- Cerrajería
    ('Cerradura perilla', 'pz', 14.00, 'cerrajeria'),
    ('Cerradura de entrada', 'pz', 35.00, 'cerrajeria'),
    ('Manija gabinete', 'pz', 1.20, 'cerrajeria')
ON CONFLICT DO NOTHING;

-- Index para búsquedas
CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
CREATE INDEX IF NOT EXISTS idx_renovation_items_property ON renovation_items(property_id);
CREATE INDEX IF NOT EXISTS idx_renovation_items_renovation ON renovation_items(renovation_id);

-- Function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
DROP TRIGGER IF EXISTS materials_updated_at ON materials;
CREATE TRIGGER materials_updated_at
    BEFORE UPDATE ON materials
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS renovation_items_updated_at ON renovation_items;
CREATE TRIGGER renovation_items_updated_at
    BEFORE UPDATE ON renovation_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

