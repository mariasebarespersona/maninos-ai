-- ============================================================================
-- Migration 031: Moves (Movida) — Track house transport/relocation
-- ============================================================================
-- Each mobile home may need to be physically moved from the seller's lot
-- to a Maninos yard (Conroe, Houston, Dallas) or to the buyer's location.
-- ============================================================================

CREATE TABLE IF NOT EXISTS moves (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

    -- Move details
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending','scheduled','in_transit','completed','cancelled')),
    move_type TEXT NOT NULL DEFAULT 'purchase'
        CHECK (move_type IN ('purchase','sale','yard_transfer')),

    -- Locations
    origin_address TEXT,
    origin_city TEXT,
    origin_state TEXT DEFAULT 'TX',
    destination_address TEXT,
    destination_city TEXT,
    destination_state TEXT DEFAULT 'TX',
    destination_yard TEXT CHECK (destination_yard IN ('conroe','houston','dallas')),

    -- Logistics
    moving_company TEXT,
    driver_name TEXT,
    driver_phone TEXT,
    estimated_distance_miles NUMERIC(8,1),
    requires_escort BOOLEAN DEFAULT FALSE,
    requires_wide_load_permit BOOLEAN DEFAULT FALSE,
    permit_number TEXT,

    -- Dates
    scheduled_date DATE,
    actual_pickup_date TIMESTAMPTZ,
    actual_delivery_date TIMESTAMPTZ,

    -- Costs
    quoted_cost NUMERIC(10,2) DEFAULT 0,
    final_cost NUMERIC(10,2) DEFAULT 0,
    deposit_paid NUMERIC(10,2) DEFAULT 0,
    payment_status TEXT DEFAULT 'pending'
        CHECK (payment_status IN ('pending','deposit_paid','paid','cancelled')),

    -- Notes
    notes TEXT DEFAULT '',
    special_instructions TEXT DEFAULT '',

    -- Metadata
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_moves_property ON moves(property_id);
CREATE INDEX IF NOT EXISTS idx_moves_status ON moves(status);
CREATE INDEX IF NOT EXISTS idx_moves_scheduled ON moves(scheduled_date);

COMMENT ON TABLE moves IS 'Tracks physical transport/relocation of mobile homes between locations';

