-- ============================================================================
-- Migration 085: Persistent scheduler run log
-- ============================================================================
-- Problem: Scheduler job history lived only in-memory (Python dict). Railway
-- restarts wiped the record of whether the title monitor actually ran each day,
-- so ops had no way to audit it.
--
-- Solution: Every time any scheduler job fires, insert a row here with timing,
-- result, and summary. Indexed by job_name + started_at for fast queries.
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduler_runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name      TEXT NOT NULL,        -- 'title_monitor', 'process_scheduled_emails', ...
    started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finished_at   TIMESTAMPTZ,
    ok            BOOLEAN,              -- NULL while running
    duration_ms   INTEGER,              -- null while running
    summary       JSONB,                -- job-specific metrics (checked, matched, etc.)
    error         TEXT,                 -- exception message if ok=false
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_job_time
    ON scheduler_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_started
    ON scheduler_runs (started_at DESC);

COMMENT ON TABLE scheduler_runs IS
    'Persistent log of every APScheduler job execution. Used to audit whether cron jobs (title_monitor, RTO reminders, email processor, etc.) actually fire as expected even across Railway restarts.';
COMMENT ON COLUMN scheduler_runs.summary IS
    'Job-specific payload: e.g. title_monitor writes {"checked":N, "matched":M, "errors":K}';
