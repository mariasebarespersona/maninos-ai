-- ============================================================================
-- Migration 017: Team Roles & Yards (Feb 2026 — D1 Texas trip)
--
-- Roles (updated from D1 answers):
--   admin          → Full access to all portals
--   operations     → Buying team (search, buy, renovate, sell)
--   treasury       → Payments, accounting, commissions
--   yard_manager   → Manages specific yards, property inventory
--
-- Yards:
--   Physical locations where properties are stored/managed.
--   Each property can belong to one yard.
--   yard_managers are assigned to 1+ yards.
-- ============================================================================

-- 1. Update the CHECK constraint on users.role to accept new roles
--    (keep old roles for backward compat, add new ones)
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN (
    'admin',
    'operations',
    'treasury',
    'yard_manager',
    -- Legacy (kept for backward compat, can be migrated later)
    'comprador',
    'renovador',
    'vendedor'
  ));

-- 2. Create yards table
CREATE TABLE IF NOT EXISTS yards (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    address TEXT,
    city TEXT NOT NULL DEFAULT 'Houston',
    state TEXT NOT NULL DEFAULT 'TX',
    capacity INTEGER DEFAULT 50,          -- max number of homes
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Create yard_assignments (many-to-many: users ↔ yards)
CREATE TABLE IF NOT EXISTS yard_assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    yard_id UUID NOT NULL REFERENCES yards(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT false,     -- primary yard for this user
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, yard_id)
);

-- 4. Add yard_id to properties (optional FK — which yard is the house at)
ALTER TABLE properties ADD COLUMN IF NOT EXISTS yard_id UUID REFERENCES yards(id);

-- 5. Add department field to users for display purposes
ALTER TABLE users ADD COLUMN IF NOT EXISTS department TEXT;

-- 6. RLS policies for new tables
ALTER TABLE yards ENABLE ROW LEVEL SECURITY;
ALTER TABLE yard_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for authenticated users" ON yards
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow all for authenticated users" ON yard_assignments
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Service role bypass" ON yards
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass" ON yard_assignments
    FOR ALL USING (auth.jwt() ->> 'role' = 'service_role');

-- 7. Indexes
CREATE INDEX IF NOT EXISTS idx_yard_assignments_user ON yard_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_yard_assignments_yard ON yard_assignments(yard_id);
CREATE INDEX IF NOT EXISTS idx_properties_yard ON properties(yard_id);

-- 8. Updated_at trigger for yards
CREATE OR REPLACE FUNCTION update_yards_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_yards_updated_at
    BEFORE UPDATE ON yards
    FOR EACH ROW
    EXECUTE FUNCTION update_yards_updated_at();

