"""
Scheduler Service - Maninos AI
Background job scheduling for automated emails, reminders, alerts,
and partner listing refresh.

Uses APScheduler to run:
1. Process pending scheduled emails (every 30 min)
2. RTO payment reminders (daily at 8am CT)
3. RTO overdue alerts (daily at 9am CT)
4. Portal sync (every 2 hours)
5. Partner listings refresh — VMF Homes + 21st Mortgage (every 6 hours)
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


def _job_refresh_partner_listings():
    """
    Job: Refresh partner listings from VMF Homes + 21st Mortgage.
    Both use direct JSON APIs — no browser needed, fast and reliable.
    Saves new/updated listings to market_listings table.
    """
    import asyncio
    from datetime import datetime as dt

    try:
        from api.agents.buscador.scraper import VMFHomesScraper, TwentyFirstMortgageScraper
        from tools.supabase_client import sb

        async def _scrape_and_save():
            # Scrape both in parallel
            vmf_task = VMFHomesScraper.scrape(min_price=5000, max_price=80000, max_listings=150)
            m21_task = TwentyFirstMortgageScraper.scrape(min_price=5000, max_price=80000, max_listings=150)

            results = await asyncio.gather(vmf_task, m21_task, return_exceptions=True)
            vmf_listings = results[0] if not isinstance(results[0], Exception) else []
            m21_listings = results[1] if not isinstance(results[1], Exception) else []

            if isinstance(results[0], Exception):
                logger.error(f"[scheduler] VMF scrape error: {results[0]}")
            if isinstance(results[1], Exception):
                logger.error(f"[scheduler] 21st scrape error: {results[1]}")

            all_listings = list(vmf_listings) + list(m21_listings)
            saved = 0

            for listing in all_listings:
                try:
                    data = {
                        "source": listing.source,
                        "source_url": listing.source_url,
                        "source_id": listing.source_id,
                        "address": listing.address,
                        "city": listing.city,
                        "state": listing.state,
                        "zip_code": listing.zip_code,
                        "listing_price": listing.listing_price,
                        "year_built": listing.year_built or 2000,
                        "sqft": listing.sqft,
                        "bedrooms": listing.bedrooms,
                        "bathrooms": listing.bathrooms,
                        "photos": listing.photos,
                        "thumbnail_url": listing.thumbnail_url,
                        "scraped_at": listing.scraped_at or dt.now().isoformat(),
                        "status": "available",
                    }

                    existing = sb.table("market_listings") \
                        .select("id, status") \
                        .eq("source_url", listing.source_url) \
                        .limit(1).execute()

                    if existing.data and existing.data[0].get("status") not in ("available", None):
                        continue

                    sb.table("market_listings") \
                        .upsert(data, on_conflict="source_url") \
                        .execute()
                    saved += 1
                except Exception as e:
                    logger.warning(f"[scheduler] Error saving partner listing: {e}")
                    continue

            return {
                "ok": True,
                "vmf": len(vmf_listings),
                "mortgage21": len(m21_listings),
                "saved": saved,
            }

        # Run the async scrape in the current event loop
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # APScheduler runs in the asyncio loop — create a task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                result = pool.submit(asyncio.run, _scrape_and_save()).result()
        else:
            result = asyncio.run(_scrape_and_save())

        _log_job("refresh_partner_listings", result)
        total = result.get("vmf", 0) + result.get("mortgage21", 0)
        if total > 0:
            logger.info(f"[scheduler] ✅ Partner refresh: {result['vmf']} VMF + {result['mortgage21']} 21st → {result['saved']} saved")
        return result

    except Exception as e:
        logger.error(f"[scheduler] Error in refresh_partner_listings: {e}")
        _log_job("refresh_partner_listings", {"ok": False, "error": str(e)})
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

    # Job 5: Partner listings refresh - every 6 hours
    # Scrapes VMF Homes + 21st Mortgage (both pure HTTP JSON APIs, fast)
    _scheduler.add_job(
        _job_refresh_partner_listings,
        trigger=IntervalTrigger(hours=6),
        id="refresh_partner_listings",
        name="Refresh Partner Listings (VMF + 21st Mortgage)",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("[scheduler] ✅ Scheduler started with 5 jobs")
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

