-- Migración 108: permitir firmar PAGARÉS con el sistema de firma electrónica
--
-- Las tablas de firma (migración 074) se hicieron para los documentos de Homes
-- —bill of sale, cambio de título, contrato RTO— y sus columnas llevan CHECK con
-- la lista cerrada de valores de entonces. Al mandar un pagaré a firmar, la
-- inserción falla con:
--
--   new row for relation "document_signatures"
--   violates check constraint "document_signatures_document_type_check"
--
-- Son TRES restricciones distintas las que hay que ampliar (document_type,
-- transaction_type y signer_role), no solo la que salta primero: el CHECK que
-- falla es el primero que se evalúa, y al arreglarlo aparecería el siguiente.
--
-- Los roles son note_signer_1 y note_signer_2 porque identifican el HUECO del
-- documento (izquierda = Maker, derecha = Co-Obligado), no a la persona. Así la
-- firma queda anclada al bloque que se firmó, sin depender de quién lo firmara.
--
-- Idempotente: se puede volver a ejecutar sin efecto.

BEGIN;

-- ── document_signatures.document_type ────────────────────────────────────────
ALTER TABLE document_signatures
    DROP CONSTRAINT IF EXISTS document_signatures_document_type_check;
ALTER TABLE document_signatures
    ADD CONSTRAINT document_signatures_document_type_check
    CHECK (document_type IN (
        'bill_of_sale', 'title_application', 'rto_lease', 'deposit_agreement',
        'promissory_note'
    ));

-- ── document_signatures.transaction_type ─────────────────────────────────────
-- Un pagaré no es compra ni venta: es una operación de inversión.
ALTER TABLE document_signatures
    DROP CONSTRAINT IF EXISTS document_signatures_transaction_type_check;
ALTER TABLE document_signatures
    ADD CONSTRAINT document_signatures_transaction_type_check
    CHECK (transaction_type IN ('purchase', 'sale', 'investment'));

-- ── document_signatures.signer_role ──────────────────────────────────────────
ALTER TABLE document_signatures
    DROP CONSTRAINT IF EXISTS document_signatures_signer_role_check;
ALTER TABLE document_signatures
    ADD CONSTRAINT document_signatures_signer_role_check
    CHECK (signer_role IN (
        'seller', 'buyer', 'buyer2', 'landlord', 'tenant', 'maninos',
        'note_signer_1', 'note_signer_2'
    ));

COMMIT;

-- Comprobación (debe devolver las tres restricciones con sus valores nuevos):
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conrelid = 'document_signatures'::regclass
--     AND conname LIKE '%_check'
--   ORDER BY conname;
