-- Migración 111: clase contable (Houston / Conroe) también en Capital
--
-- En Homes esto ya existía desde la 017: `accounting_invoices.yard_id` y
-- `accounting_transactions.yard_id`. Capital se construyó después, en espejo,
-- pero sin ese campo — está anotado en api/services/ledger.py:
--
--     # Homes' transactions table has yard_id; Capital's doesn't.
--
-- Así que para poder separar Houston de Conroe en los estados financieros de
-- Capital hay que añadir la columna en los dos sitios. En las facturas para
-- poder asignarla, y en los asientos porque es de ahí de donde se calculan los
-- informes: una factura etiquetada cuyos asientos no lo están no movería ni un
-- dólar de columna.
--
-- Las clases (filas de `yards`) son COMPARTIDAS con Homes: son los mismos
-- patios físicos. No se duplican.
--
-- Idempotente.

ALTER TABLE capital_transactions
    ADD COLUMN IF NOT EXISTS yard_id UUID REFERENCES yards(id) ON DELETE SET NULL;

ALTER TABLE capital_invoices
    ADD COLUMN IF NOT EXISTS yard_id UUID REFERENCES yards(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_capital_txn_yard ON capital_transactions(yard_id);
CREATE INDEX IF NOT EXISTS idx_capital_inv_yard ON capital_invoices(yard_id);

-- Comprobación:
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name IN ('capital_transactions','capital_invoices')
--     AND column_name = 'yard_id';
