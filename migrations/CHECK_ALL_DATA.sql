-- ============================================================================
-- VERIFICACIÓN: Comprobar que no queda data de clientes/propiedades
-- Ejecutar en Supabase SQL Editor
-- ============================================================================

-- Clientes
SELECT 'clients' as tabla, COUNT(*) as registros FROM clients
UNION ALL
-- Propiedades
SELECT 'properties', COUNT(*) FROM properties
UNION ALL
-- Contratos RTO
SELECT 'rto_contracts', COUNT(*) FROM rto_contracts
UNION ALL
-- Pagos
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
-- Transferencias de título
SELECT 'title_transfers', COUNT(*) FROM title_transfers
UNION ALL
-- Bonos de referido
SELECT 'referral_bonuses', COUNT(*) FROM referral_bonuses
UNION ALL
-- Historial de referidos (puede no existir)
SELECT 'referral_history', COUNT(*) FROM referral_history
UNION ALL
-- Inspecciones de propiedades
SELECT 'property_inspections', COUNT(*) FROM property_inspections
UNION ALL
-- Documentos
SELECT 'maninos_documents', COUNT(*) FROM maninos_documents
UNION ALL
-- RAG chunks (embeddings)
SELECT 'rag_chunks', COUNT(*) FROM rag_chunks
UNION ALL
-- Logs de proceso
SELECT 'process_logs', COUNT(*) FROM process_logs
UNION ALL
-- Contratos legacy
SELECT 'contracts', COUNT(*) FROM contracts
ORDER BY tabla;

-- Si todo está en 0, la base de datos está limpia 🧹

