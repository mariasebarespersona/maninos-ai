-- Migration 055: Add 'transfer_reported' status for contado bank transfers
--
-- When a client pays via bank transfer and clicks "Ya he hecho la transferencia",
-- the sale enters 'transfer_reported' status. Staff must confirm payment receipt
-- before the sale progresses to 'paid'.

-- 1. Drop the old CHECK constraint and add the new one with 'transfer_reported'
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_status_check;
ALTER TABLE sales ADD CONSTRAINT sales_status_check
    CHECK (status IN (
        'pending',              -- Sale created, awaiting action
        'transfer_reported',    -- Client reports bank transfer made (awaiting staff confirmation)
        'paid',                 -- Payment confirmed
        'rto_pending',          -- RTO application submitted
        'rto_approved',         -- RTO approved by Capital
        'rto_active',           -- RTO contract active
        'completed',            -- Sale fully completed
        'cancelled'             -- Sale cancelled
    ));

-- 2. Add client_reported_at column for tracking when client reported the transfer
ALTER TABLE sales ADD COLUMN IF NOT EXISTS client_reported_at TIMESTAMPTZ;
