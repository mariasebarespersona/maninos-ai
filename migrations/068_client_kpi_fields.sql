-- Migration 068: Add KPI-related fields to clients table
-- Supports strategic KPIs: NPS score tracking and referral tracking.

-- NPS score (0-100) — filled via satisfaction surveys
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nps_score INTEGER;

-- Who referred this client (client_id of referrer)
ALTER TABLE clients ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES clients(id);

-- Optional: when the NPS score was last collected
ALTER TABLE clients ADD COLUMN IF NOT EXISTS nps_collected_at TIMESTAMPTZ;
