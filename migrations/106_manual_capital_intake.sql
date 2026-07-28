-- 106: Alta manual de clientes RTO antiguos desde Capital (legacy intake)
--
-- • properties.source / sales.source = 'manual_capital' marca la cadena creada
--   a mano desde Capital para clientes RTO antiguos. El portal Homes FILTRA
--   estas filas (solo se ven en Capital); no llevan contabilidad de Homes.
-- • rto_payments.is_historical = TRUE marca mensualidades cobradas ANTES de la
--   app: cuentan como pagadas en cronogramas/progreso pero NO postean ingreso
--   al ledger de Capital (mismo criterio que los pagarés pre-app).
-- • capital_down_payment_installments.is_historical idem para enganches viejos.
--
-- Idempotente. Defaults que no afectan filas existentes.

ALTER TABLE properties ADD COLUMN IF NOT EXISTS source TEXT;
ALTER TABLE sales ADD COLUMN IF NOT EXISTS source TEXT;

ALTER TABLE rto_payments ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT FALSE;
ALTER TABLE capital_down_payment_installments ADD COLUMN IF NOT EXISTS is_historical BOOLEAN DEFAULT FALSE;

-- Índices parciales: los filtros de Homes consultan "source IS DISTINCT FROM 'manual_capital'";
-- estos índices cubren el caso legacy sin encarecer el resto.
CREATE INDEX IF NOT EXISTS idx_properties_source_manual ON properties (source) WHERE source = 'manual_capital';
CREATE INDEX IF NOT EXISTS idx_sales_source_manual ON sales (source) WHERE source = 'manual_capital';

COMMENT ON COLUMN properties.source IS 'manual_capital = casa legacy dada de alta desde Capital; oculta en el portal Homes';
COMMENT ON COLUMN sales.source IS 'manual_capital = venta legacy dada de alta desde Capital; oculta en el portal Homes, sin contabilidad Homes';
COMMENT ON COLUMN rto_payments.is_historical IS 'TRUE = pago cobrado antes de usar la app: cuenta como pagado, sin asiento en el ledger de Capital';
