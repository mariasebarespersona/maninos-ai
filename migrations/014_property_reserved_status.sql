-- ============================================================================
-- Migration 014: Add 'reserved' status to properties
-- ============================================================================
-- When a sale is initiated (contado or RTO), the property is marked as 'reserved'
-- to prevent other clients from purchasing the same property.
-- If the sale is cancelled, the property reverts to 'published'.
-- Once the sale is completed/paid, the property transitions to 'sold'.
-- ============================================================================

-- 1. Drop the old constraint
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_status_check;

-- 2. Add the new constraint with 'reserved'
ALTER TABLE properties ADD CONSTRAINT properties_status_check
    CHECK (status IN ('purchased', 'published', 'reserved', 'renovating', 'sold'));

-- 3. Fix existing data: properties with active sales should be 'reserved'
-- Properties with pending/paid/rto_pending/rto_approved sales but still 'published'
UPDATE properties 
SET status = 'reserved' 
WHERE status = 'published' 
AND id IN (
    SELECT DISTINCT property_id 
    FROM sales 
    WHERE status IN ('pending', 'paid', 'rto_pending', 'rto_approved', 'rto_active')
);

