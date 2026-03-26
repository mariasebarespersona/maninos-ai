-- Migration 076: Create notifications table for centralized notifications
-- Events from sales, commissions, payments, renovations, signatures, etc.

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Type categorization
    type TEXT NOT NULL,  -- 'purchase', 'sale', 'commission', 'payment_order', 'renovation', 'move', 'signature', 'capital_payment', 'cash_payment'
    category TEXT DEFAULT 'general',  -- 'homes', 'capital', 'both'

    -- Content
    title TEXT NOT NULL,
    message TEXT NOT NULL,

    -- Linking
    related_entity_type TEXT,  -- 'property', 'sale', 'payment_order', 'renovation', 'contract'
    related_entity_id UUID,
    property_id UUID REFERENCES properties(id) ON DELETE SET NULL,
    property_address TEXT,  -- Denormalized for quick display
    property_code TEXT,     -- e.g. "A10"

    -- Financial info (for payment-type notifications)
    amount DECIMAL(12,2),

    -- Status
    priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
    is_read BOOLEAN DEFAULT FALSE,
    read_at TIMESTAMPTZ,
    read_by TEXT,

    -- Action tracking
    action_required BOOLEAN DEFAULT FALSE,
    action_type TEXT,  -- 'approve', 'confirm', 'review', 'pay'
    action_completed BOOLEAN DEFAULT FALSE,
    action_completed_at TIMESTAMPTZ,

    -- Metadata
    created_by TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(type);
CREATE INDEX IF NOT EXISTS idx_notif_category ON notifications(category);
CREATE INDEX IF NOT EXISTS idx_notif_property ON notifications(property_id);
CREATE INDEX IF NOT EXISTS idx_notif_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notif_created ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notif_priority ON notifications(priority);
