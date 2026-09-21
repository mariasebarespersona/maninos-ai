-- Migración 110: dar de alta las CLASES (yards) Houston y Conroe
--
-- El esquema ya preveía esto: `accounting_invoices.yard_id`,
-- `accounting_transactions.yard_id` y los filtros de P&L y Balance existen desde
-- la migración 017. Lo que faltaba eran las filas: la tabla `yards` estaba
-- VACÍA, así que no había nada que asignar y el campo nunca se rellenó.
--
-- Por eso la convención hasta ahora era deducir el patio del prefijo del código
-- de la casa (H=Houston, B=Conroe, DFW=Dallas). Eso solo funciona si la factura
-- está ligada a una casa, y 16 de las 25 facturas de Homes no lo están.
--
-- Idempotente: se puede ejecutar varias veces sin duplicar.

INSERT INTO yards (name, city, state)
SELECT 'Houston', 'Houston', 'TX'
WHERE NOT EXISTS (SELECT 1 FROM yards WHERE name = 'Houston');

INSERT INTO yards (name, city, state)
SELECT 'Conroe', 'Conroe', 'TX'
WHERE NOT EXISTS (SELECT 1 FROM yards WHERE name = 'Conroe');

-- Comprobación:  SELECT id, name, city FROM yards ORDER BY name;
