-- Migration 016: Purchase document lock fields
-- Date: Feb 2026
-- Reason: Cannot pay seller until title application + bill of sale received
-- Flow: negotiate → evaluate → docs → LOCK → pay via bank transfer

-- Add document tracking fields to title_transfers (purchase)
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS title_application_received BOOLEAN DEFAULT FALSE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS title_application_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS bill_of_sale_received BOOLEAN DEFAULT FALSE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS bill_of_sale_date TIMESTAMP WITH TIME ZONE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS payment_locked BOOLEAN DEFAULT TRUE;
ALTER TABLE title_transfers ADD COLUMN IF NOT EXISTS payment_unlocked_at TIMESTAMP WITH TIME ZONE;

-- Comments
COMMENT ON COLUMN title_transfers.title_application_received IS 'Has seller submitted title change application?';
COMMENT ON COLUMN title_transfers.bill_of_sale_received IS 'Has Bill of Sale been signed?';
COMMENT ON COLUMN title_transfers.payment_locked IS 'TRUE = cannot pay seller yet. Unlocks when both docs received.';

