-- System configuration key-value store
-- Used for persistent settings like FB cookies that survive redeployments
CREATE TABLE IF NOT EXISTS system_config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE system_config ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access on system_config"
    ON system_config FOR ALL
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE system_config IS 'Persistent key-value store for system settings (FB cookies, etc.)';

