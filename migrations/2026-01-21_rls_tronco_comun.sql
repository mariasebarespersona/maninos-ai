-- ============================================================================
-- MIGRACIÓN: Row Level Security (RLS) para Tronco Común
-- Fecha: 2026-01-21
-- Descripción: Políticas de seguridad para todas las tablas
-- ============================================================================

-- ============================================================================
-- HABILITAR RLS EN TODAS LAS TABLAS
-- ============================================================================

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE investors ENABLE ROW LEVEL SECURITY;
ALTER TABLE rto_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE investments ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_logs ENABLE ROW LEVEL SECURITY;

-- Properties ya tiene RLS habilitado, pero actualizamos políticas
-- ALTER TABLE properties ENABLE ROW LEVEL SECURITY; -- Ya habilitado

-- ============================================================================
-- POLÍTICAS PARA: clients
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

-- Eliminar políticas existentes si las hay
DROP POLICY IF EXISTS "Employees can view all clients" ON clients;
DROP POLICY IF EXISTS "Employees can create clients" ON clients;
DROP POLICY IF EXISTS "Employees can update clients" ON clients;
DROP POLICY IF EXISTS "Employees can delete clients" ON clients;

-- SELECT: Empleados autenticados pueden ver todos los clientes
CREATE POLICY "Employees can view all clients" ON clients
    FOR SELECT
    TO authenticated
    USING (true);

-- INSERT: Empleados autenticados pueden crear clientes
CREATE POLICY "Employees can create clients" ON clients
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Empleados autenticados pueden actualizar clientes
CREATE POLICY "Employees can update clients" ON clients
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

-- DELETE: Empleados autenticados pueden eliminar clientes (soft delete preferido)
CREATE POLICY "Employees can delete clients" ON clients
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA: investors
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

DROP POLICY IF EXISTS "Employees can view all investors" ON investors;
DROP POLICY IF EXISTS "Employees can create investors" ON investors;
DROP POLICY IF EXISTS "Employees can update investors" ON investors;
DROP POLICY IF EXISTS "Employees can delete investors" ON investors;

CREATE POLICY "Employees can view all investors" ON investors
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create investors" ON investors
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Employees can update investors" ON investors
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Employees can delete investors" ON investors
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA: rto_contracts
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

DROP POLICY IF EXISTS "Employees can view all rto_contracts" ON rto_contracts;
DROP POLICY IF EXISTS "Employees can create rto_contracts" ON rto_contracts;
DROP POLICY IF EXISTS "Employees can update rto_contracts" ON rto_contracts;
DROP POLICY IF EXISTS "Employees can delete rto_contracts" ON rto_contracts;

CREATE POLICY "Employees can view all rto_contracts" ON rto_contracts
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create rto_contracts" ON rto_contracts
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Employees can update rto_contracts" ON rto_contracts
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Employees can delete rto_contracts" ON rto_contracts
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA: payments
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

DROP POLICY IF EXISTS "Employees can view all payments" ON payments;
DROP POLICY IF EXISTS "Employees can create payments" ON payments;
DROP POLICY IF EXISTS "Employees can update payments" ON payments;
DROP POLICY IF EXISTS "Employees can delete payments" ON payments;

CREATE POLICY "Employees can view all payments" ON payments
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create payments" ON payments
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Employees can update payments" ON payments
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Employees can delete payments" ON payments
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA: investments
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

DROP POLICY IF EXISTS "Employees can view all investments" ON investments;
DROP POLICY IF EXISTS "Employees can create investments" ON investments;
DROP POLICY IF EXISTS "Employees can update investments" ON investments;
DROP POLICY IF EXISTS "Employees can delete investments" ON investments;

CREATE POLICY "Employees can view all investments" ON investments
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create investments" ON investments
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Employees can update investments" ON investments
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Employees can delete investments" ON investments
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA: process_logs
-- Por ahora: Solo empleados autenticados pueden acceder
-- ============================================================================

DROP POLICY IF EXISTS "Employees can view all process_logs" ON process_logs;
DROP POLICY IF EXISTS "Employees can create process_logs" ON process_logs;

CREATE POLICY "Employees can view all process_logs" ON process_logs
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create process_logs" ON process_logs
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- No UPDATE/DELETE para logs (inmutables)

-- ============================================================================
-- ACTUALIZAR POLÍTICAS PARA: properties
-- Reemplazar política permisiva con política de empleados
-- ============================================================================

DROP POLICY IF EXISTS "Allow all access to properties" ON properties;
DROP POLICY IF EXISTS "Employees can view all properties" ON properties;
DROP POLICY IF EXISTS "Employees can create properties" ON properties;
DROP POLICY IF EXISTS "Employees can update properties" ON properties;
DROP POLICY IF EXISTS "Employees can delete properties" ON properties;

CREATE POLICY "Employees can view all properties" ON properties
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Employees can create properties" ON properties
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Employees can update properties" ON properties
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Employees can delete properties" ON properties
    FOR DELETE
    TO authenticated
    USING (true);

-- ============================================================================
-- POLÍTICAS PARA SERVICE ROLE (Backend API)
-- El backend usa service_role key que bypassa RLS automáticamente
-- No se necesitan políticas adicionales para service_role
-- ============================================================================

-- ============================================================================
-- COMENTARIOS
-- ============================================================================

COMMENT ON POLICY "Employees can view all clients" ON clients IS 
    'Empleados autenticados pueden ver todos los clientes. En el futuro se puede restringir por rol.';

COMMENT ON POLICY "Employees can view all investors" ON investors IS 
    'Empleados autenticados pueden ver todos los inversionistas.';

COMMENT ON POLICY "Employees can view all rto_contracts" ON rto_contracts IS 
    'Empleados autenticados pueden ver todos los contratos RTO.';

COMMENT ON POLICY "Employees can view all payments" ON payments IS 
    'Empleados autenticados pueden ver todos los pagos.';

COMMENT ON POLICY "Employees can view all investments" ON investments IS 
    'Empleados autenticados pueden ver todas las inversiones.';

-- ============================================================================
-- FIN DE MIGRACIÓN RLS
-- ============================================================================


