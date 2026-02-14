-- ============================================================================
-- Migration 008: Scheduled Emails
-- Supports automated post-sale emails (review requests, referral requests)
-- ============================================================================

-- Email status type
DO $$ BEGIN
    CREATE TYPE email_status AS ENUM ('pending', 'sent', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Scheduled emails table
CREATE TABLE IF NOT EXISTS scheduled_emails (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    email_type TEXT NOT NULL,  -- 'welcome', 'payment_confirmation', 'review_request', 'referral_request'
    to_email TEXT NOT NULL,
    to_name TEXT NOT NULL,
    subject TEXT NOT NULL,
    metadata JSONB DEFAULT '{}',  -- Extra data (property_address, etc.)
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending',  -- Using TEXT for flexibility with email_status
    sent_at TIMESTAMPTZ,
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_scheduled_emails_status_date 
    ON scheduled_emails(status, scheduled_for) 
    WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_sale 
    ON scheduled_emails(sale_id);

CREATE INDEX IF NOT EXISTS idx_scheduled_emails_client 
    ON scheduled_emails(client_id);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_scheduled_emails_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_scheduled_emails_timestamp ON scheduled_emails;
CREATE TRIGGER trigger_update_scheduled_emails_timestamp
    BEFORE UPDATE ON scheduled_emails
    FOR EACH ROW
    EXECUTE FUNCTION update_scheduled_emails_timestamp();


