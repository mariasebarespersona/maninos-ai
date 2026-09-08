-- Migración 109: el eslabón que falta en la cadena de títulos, Homes → Capital
--
-- Capital le COMPRA la casa a Homes para financiarla, pero esa entrega de
-- título no existía en los datos. Los traspasos registrados solo cubrían dos
-- tramos y se saltaban a Capital entera:
--
--     Vendedor       ──►  Maninos Homes       (transfer_type = 'purchase')
--     Maninos Homes  ──►  Cliente             (transfer_type = 'sale')
--
-- La cadena real de una casa financiada es de TRES tramos:
--
--     1. Vendedor        ──►  Maninos Homes      'purchase'
--     2. Maninos Homes   ──►  Maninos Capital    'homes_to_capital'   ← NUEVO
--     3. Maninos Capital ──►  Cliente            'sale'
--
-- No es cosmética. El tramo 2 es el papel que respalda al inversionista: sin él,
-- el dinero que puso está garantizado por una casa que documentalmente sigue
-- siendo de Homes. Y el tramo 3 debe SALIR de Capital, porque es Capital quien
-- es dueña durante el RTO (confirmado por Maria el 2026-09-08).
--
-- OJO CON EL ENUM: `transfer_type` no es texto, es un tipo enumerado. En
-- PostgreSQL, un valor recién añadido a un enum NO puede usarse en la misma
-- transacción en que se añadió, así que esta migración NO va envuelta en
-- BEGIN/COMMIT. Ejecuta el bloque 1, y solo después el bloque 2.

-- ── BLOQUE 1: añadir el valor al enum ────────────────────────────────────────
-- Ejecútalo SOLO, sin nada más seleccionado.
ALTER TYPE transfer_type ADD VALUE IF NOT EXISTS 'homes_to_capital';


-- ── BLOQUE 2: corregir de quién sale el título al cliente ────────────────────
-- Ejecútalo DESPUÉS del bloque 1, en una ejecución aparte.
--
-- Solo toca los traspasos de venta de casas que de verdad son financiadas por
-- Capital (venta RTO). Una venta de contado la entrega Homes y debe quedarse
-- como está.
UPDATE title_transfers t
SET from_name = 'Maninos Capital LLC',
    updated_at = NOW()
FROM sales s
WHERE t.sale_id = s.id
  AND t.transfer_type = 'sale'
  AND s.sale_type = 'rto'
  AND COALESCE(t.from_name, '') <> 'Maninos Capital LLC';


-- ── Comprobación ─────────────────────────────────────────────────────────────
--
--   SELECT transfer_type, from_name, to_name, COUNT(*)
--   FROM title_transfers
--   GROUP BY 1, 2, 3
--   ORDER BY 1;
--
-- Debe verse 'sale' saliendo de Maninos Capital LLC en las casas RTO.
