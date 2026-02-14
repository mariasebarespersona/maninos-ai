-- Migration 020: Add 'dismissed' to market_listings status check constraint
-- This allows users to dismiss/trash listings they don't want.
-- Dismissed listings won't reappear in future scrapes.
--
-- Run this in Supabase SQL Editor.

ALTER TABLE market_listings DROP CONSTRAINT IF EXISTS market_listings_status_check;

ALTER TABLE market_listings ADD CONSTRAINT market_listings_status_check 
  CHECK (status IN (
    'available', 'contacted', 'negotiating', 'evaluating',
    'docs_pending', 'locked', 'purchased', 'rejected', 'expired',
    'dismissed', 'reviewing'
  ));

