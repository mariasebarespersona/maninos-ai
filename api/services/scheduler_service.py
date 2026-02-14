"""
Email Scheduler Service - Maninos AI
Background job scheduling for automated emails, reminders, and alerts.

Uses APScheduler to run:
1. Process pending scheduled emails (every hour)
2. RTO payment reminders (daily at 8am CT)
3. RTO overdue alerts (daily at 9am CT)
4. Cash sale follow-ups (process review + referral emails)
"""

import logging
from datetime import datetime
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

# Singleton scheduler instance
_scheduler: Optional[AsyncIOScheduler] = None
_job_history: list = []
MAX_HISTORY = 100


def _log_job(job_name: str, result: dict):
    """Log job execution to in-memory history."""
    entry = {
        "job": job_name,
        "timestamp": datetime.utcnow().isoformat(),
        "ok": result.get("ok", False),
        "details": {k: v for k, v in result.items() if k != "ok"},
    }
    _job_history.insert(0, entry)
    if len(_job_history) > MAX_HISTORY:
        _job_history.pop()


# =========================================================================
# JOB FUNCTIONS (sync wrappers for the email service)
# =========================================================================

def _job_process_scheduled_emails():
    """Job: Process all pending scheduled emails that are due."""
    from api.services.email_service import process_scheduled_emails
    try:
        result = process_scheduled_emails()
        _log_job("process_scheduled_emails", result)
        processed = result.get("processed", 0)
        if processed > 0:
            logger.info(f"[scheduler] Processed {processed} scheduled emails (sent={result.get('sent',0)}, failed={result.get('failed',0)})")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in process_scheduled_emails: {e}")
        _log_job("process_scheduled_emails", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_rto_reminders():
    """Job: Send RTO payment reminders (3d before, day of, 1d after)."""
    from api.services.email_service import process_rto_reminders
    try:
        result = process_rto_reminders()
        _log_job("rto_reminders", result)
        total_sent = result.get("total_sent", 0)
        if total_sent > 0:
            logger.info(f"[scheduler] Sent {total_sent} RTO payment reminders")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in rto_reminders: {e}")
        _log_job("rto_reminders", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_rto_overdue_alerts():
    """Job: Check overdue RTO payments and alert admin."""
    from api.services.email_service import process_rto_overdue_alerts
    try:
        result = process_rto_overdue_alerts()
        _log_job("rto_overdue_alerts", result)
        overdue = result.get("overdue_count", 0)
        if overdue > 0:
            logger.warning(f"[scheduler] Found {overdue} overdue RTO payments - alert sent")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in rto_overdue_alerts: {e}")
        _log_job("rto_overdue_alerts", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_portal_sync():
    """Job: Sync data between portals (Homes ↔ Capital ↔ Clientes)."""
    try:
        from tools.supabase_client import sb
        synced = 0

        # Find RTO sales missing Capital applications
        rto_sales = sb.table("sales") \
            .select("id, property_id, client_id") \
            .eq("sale_type", "rto") \
            .in_("status", ["pending", "rto_pending"]) \
            .execute()

        for sale in (rto_sales.data or []):
            existing = sb.table("rto_applications") \
                .select("id") \
                .eq("sale_id", sale["id"]) \
                .execute()
            if not existing.data:
                sb.table("rto_applications").insert({
                    "sale_id": sale["id"],
                    "client_id": sale["client_id"],
                    "property_id": sale["property_id"],
                    "status": "submitted",
                }).execute()
                synced += 1

        result = {"ok": True, "synced": synced}
        _log_job("portal_sync", result)
        if synced > 0:
            logger.info(f"[scheduler] Portal sync: created {synced} missing RTO applications")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in portal_sync: {e}")
        _log_job("portal_sync", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


# =========================================================================
# SCHEDULER LIFECYCLE
# =========================================================================

def init_scheduler() -> AsyncIOScheduler:
    """
    Initialize and start the APScheduler with all email jobs.
    Called once at application startup.
    """
    global _scheduler

    if _scheduler is not None:
        logger.info("[scheduler] Scheduler already initialized")
        return _scheduler

    _scheduler = AsyncIOScheduler(
        timezone="US/Central",  # Texas timezone
        job_defaults={
            "coalesce": True,       # Combine missed runs into one
            "max_instances": 1,     # Prevent overlapping runs
            "misfire_grace_time": 600,  # 10 min grace for missed jobs
        },
    )

    # Job 1: Process scheduled emails - every 30 minutes
    _scheduler.add_job(
        _job_process_scheduled_emails,
        trigger=IntervalTrigger(minutes=30),
        id="process_scheduled_emails",
        name="Process Pending Scheduled Emails",
        replace_existing=True,
    )

    # Job 2: RTO payment reminders - daily at 8:00 AM CT
    _scheduler.add_job(
        _job_rto_reminders,
        trigger=CronTrigger(hour=8, minute=0),
        id="rto_payment_reminders",
        name="RTO Payment Reminders (3d before, day of, 1d after)",
        replace_existing=True,
    )

    # Job 3: RTO overdue alerts - daily at 9:00 AM CT
    _scheduler.add_job(
        _job_rto_overdue_alerts,
        trigger=CronTrigger(hour=9, minute=0),
        id="rto_overdue_alerts",
        name="RTO Overdue Payment Alerts to Admin",
        replace_existing=True,
    )

    # Job 4: Portal sync - every 2 hours, ensures Homes ↔ Capital consistency
    _scheduler.add_job(
        _job_portal_sync,
        trigger=IntervalTrigger(hours=2),
        id="portal_sync",
        name="Cross-Portal Data Sync (Homes ↔ Capital)",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("[scheduler] ✅ Email scheduler started with 4 jobs")
    return _scheduler


def shutdown_scheduler():
    """Shutdown scheduler gracefully."""
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("[scheduler] Scheduler stopped")


def get_scheduler_status() -> dict:
    """Get current scheduler status and job info."""
    if not _scheduler:
        return {"ok": False, "running": False, "message": "Scheduler not initialized"}

    jobs = []
    for job in _scheduler.get_jobs():
        next_run = job.next_run_time
        jobs.append({
            "id": job.id,
            "name": job.name,
            "next_run": next_run.isoformat() if next_run else None,
            "trigger": str(job.trigger),
        })

    return {
        "ok": True,
        "running": _scheduler.running,
        "timezone": "US/Central",
        "jobs": jobs,
        "job_count": len(jobs),
        "recent_history": _job_history[:20],
    }

