---
name: APScheduler jobs and timezone (US/Central)
description: 10 background jobs in scheduler_service.py, all US/Central. scheduler_runs table is the audit log; manual triggers also write to it.
type: project
originSessionId: f961d8b1-cc89-4a9d-977b-b2ecc108ecdc
---
`api/services/scheduler_service.py` runs APScheduler (AsyncIOScheduler) with **timezone US/Central**. Started in `api/main.py` lifespan.

10 jobs:
1. `process_scheduled_emails` — every 30 min
2. `rto_reminders` — daily 8:00 CT
3. `rto_overdue_alerts` — daily 9:00 CT
4. `portal_sync` — every 2 hours
5. `refresh_partner_listings` — every 6 hours (VMF + 21st Mortgage JSON)
6. `title_monitor` — daily **10:00 CT** (the most-asked-about one)
7. `investor_followup_emails` — 1st of month, 10:30 CT
8. `promissory_maturity_alerts` — daily 9:30 CT
9. `facebook_auto_scrape` — Mon+Thu 7:00 CT (Apify, ~$2-3/run, skipped if APIFY_API_TOKEN missing)
10. `expire_old_listings` — daily 6:00 CT

All wrap in `_track_run("job_name")` context manager → INSERT into `scheduler_runs(job_name, started_at, finished_at, ok, duration_ms, summary, error)`.

**Why this matters:** Railway redeploys reset APScheduler's in-memory state, but `scheduler_runs` persists. The SchedulerRunsWidget on `/homes/transfers` reads this table and is the source of truth for "did the scheduler run". The "Ejecutar ahora" button on the widget calls `POST /api/transfers/title-monitor/trigger` which also writes to `scheduler_runs`.

**How to apply:** When a user asks "did X scheduler run", query `scheduler_runs` ORDER BY started_at DESC LIMIT 10. Don't trust APScheduler's `next_run_time` alone — Railway restart may have lost the schedule. UTC vs CT: APScheduler's `next_run_time` is shown in UTC; the cron expression is CT — convert before reporting.
