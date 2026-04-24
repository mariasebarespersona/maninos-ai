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
import os
import time
from contextlib import contextmanager
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


def _persist_run_start(job_name: str) -> Optional[str]:
    """Insert a scheduler_runs row at job start. Returns row id or None if
    the table doesn't exist yet (migration 085 not applied)."""
    try:
        from tools.supabase_client import sb
        res = sb.table("scheduler_runs").insert({
            "job_name": job_name,
            "started_at": datetime.utcnow().isoformat() + "Z",
        }).execute()
        return res.data[0]["id"] if res.data else None
    except Exception as e:
        logger.debug(f"[scheduler] Could not persist run start for {job_name}: {e}")
        return None


def _persist_run_end(run_id: Optional[str], ok: bool, duration_ms: int,
                     summary: dict, error: Optional[str]):
    """Close a scheduler_runs row after the job completes."""
    if not run_id:
        return
    try:
        from tools.supabase_client import sb
        sb.table("scheduler_runs").update({
            "finished_at": datetime.utcnow().isoformat() + "Z",
            "ok": ok,
            "duration_ms": duration_ms,
            "summary": summary,
            "error": error,
        }).eq("id", run_id).execute()
    except Exception as e:
        logger.debug(f"[scheduler] Could not persist run end for {run_id}: {e}")


@contextmanager
def _track_run(job_name: str):
    """Context manager that records start/finish of a scheduler job to both
    the in-memory history and the persistent scheduler_runs table.

    Usage:
        with _track_run("title_monitor") as tracker:
            result = do_work()
            tracker.set_result(result)
    """
    class _Tracker:
        def __init__(self):
            self.result: dict = {"ok": False}
        def set_result(self, r: dict):
            self.result = r or {"ok": False}

    tracker = _Tracker()
    run_id = _persist_run_start(job_name)
    t0 = time.monotonic()
    err_msg: Optional[str] = None
    try:
        yield tracker
    except Exception as e:
        err_msg = f"{type(e).__name__}: {e}"
        tracker.result = {"ok": False, "error": err_msg}
        raise
    finally:
        duration_ms = int((time.monotonic() - t0) * 1000)
        r = tracker.result or {}
        ok = bool(r.get("ok", False))
        summary = {k: v for k, v in r.items() if k != "ok"}
        _log_job(job_name, r)
        _persist_run_end(run_id, ok, duration_ms, summary, err_msg)


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
        from api.services.scrapers.partner_scrapers import VMFHomesScraper, TwentyFirstMortgageScraper
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


def _job_promissory_maturity_alerts():
    """Job: Check for promissory notes maturing within 90 days and alert admin."""
    from api.services.email_service import process_promissory_maturity_alerts
    try:
        result = process_promissory_maturity_alerts()
        _log_job("promissory_maturity_alerts", result)
        alerts = result.get("alerts_sent", 0)
        if alerts > 0:
            logger.info(f"[scheduler] Sent promissory maturity alerts for {alerts} notes")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in promissory_maturity_alerts: {e}")
        _log_job("promissory_maturity_alerts", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_investor_followup_emails():
    """Job: Send monthly follow-up emails to all active investors."""
    from api.services.email_service import process_investor_followup_emails
    try:
        result = process_investor_followup_emails()
        _log_job("investor_followup_emails", result)
        sent = result.get("sent", 0)
        if sent > 0:
            logger.info(f"[scheduler] Sent investor followup emails to {sent} investors")
        return result
    except Exception as e:
        logger.error(f"[scheduler] Error in investor_followup_emails: {e}")
        _log_job("investor_followup_emails", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_title_monitor():
    """Job: Check TDHCA for title name updates on pending transfers.
    Persists start/finish to scheduler_runs so runs can be audited even
    across Railway restarts."""
    from api.services.title_monitor import run_title_monitor_job
    with _track_run("title_monitor") as tracker:
        try:
            result = run_title_monitor_job() or {"ok": True}
            if "ok" not in result:
                result["ok"] = True
            tracker.set_result(result)
            checked = result.get("checked", 0)
            matched = result.get("matched", 0)
            if checked > 0:
                logger.info(f"[scheduler] Title monitor: checked {checked}, matched {matched}")
            return result
        except Exception as e:
            logger.error(f"[scheduler] Error in title_monitor: {e}")
            tracker.set_result({"ok": False, "error": str(e)})
            return {"ok": False, "error": str(e)}


# =========================================================================
# SCHEDULER LIFECYCLE
# =========================================================================

def _job_facebook_auto_scrape():
    """
    Job: Auto-scrape Facebook Marketplace via Apify every 10 minutes.
    No cookies or login needed — Apify handles everything.
    Requires APIFY_API_TOKEN env var.
    """
    import requests as req
    import random
    from datetime import datetime as dt

    try:
        apify_token = os.environ.get("APIFY_API_TOKEN", "")
        if not apify_token:
            _log_job("facebook_auto_scrape", {"ok": True, "skipped": "no_apify_token"})
            return {"ok": True, "skipped": True}

        from api.utils.qualification import qualify_listing
        from tools.supabase_client import sb

        city = random.choice(["houston", "dallas", "sanantonio"])
        logger.info(f"[scheduler] FB auto-scrape via Apify: {city}")

        run_resp = req.post(
            "https://api.apify.com/v2/acts/apify~facebook-marketplace-scraper/runs?waitForFinish=300",
            headers={"Authorization": f"Bearer {apify_token}", "Content-Type": "application/json"},
            json={
                "startUrls": [{"url": f"https://www.facebook.com/marketplace/{city}/search?query=mobile%20home&minPrice=5000&maxPrice=80000&exact=false"}],
                "maxItems": 50,
            },
            timeout=320,
        )

        if run_resp.status_code != 201:
            _log_job("facebook_auto_scrape", {"ok": False, "error": f"Apify {run_resp.status_code}"})
            return {"ok": False}

        dataset_id = run_resp.json().get("data", {}).get("defaultDatasetId")
        if not dataset_id:
            return {"ok": False, "error": "No dataset"}

        items = req.get(
            f"https://api.apify.com/v2/datasets/{dataset_id}/items?limit=100",
            headers={"Authorization": f"Bearer {apify_token}"}, timeout=30,
        ).json()

        saved = 0
        for item in items:
            try:
                price_data = item.get("listing_price", {})
                price = float(price_data.get("amount", 0)) if isinstance(price_data, dict) else float(price_data or 0)
                if price <= 0:
                    continue
                location = item.get("location", {})
                reverse = location.get("reverse_geocode", {}) if isinstance(location, dict) else {}
                item_city = reverse.get("city", "TX")
                state = reverse.get("state", "TX")
                source_url = item.get("listingUrl", "")
                photo = item.get("primary_listing_photo", {})
                thumbnail = photo.get("photo_image_url", "") if isinstance(photo, dict) else ""
                title = item.get("marketplace_listing_title") or f"Facebook - {item_city}"
                qual = qualify_listing(listing_price=price, market_value=price, city=item_city, state=state)

                sb.table("market_listings").upsert({
                    "source": "facebook",
                    "source_url": source_url,
                    "address": title[:500],
                    "city": item_city,
                    "state": state,
                    "listing_price": price,
                    "thumbnail_url": thumbnail,
                    "is_qualified": True,
                    "qualification_score": qual["qualification_score"] if qual["is_qualified"] else 50,
                    "passes_70_rule": True,
                    "passes_age_rule": True,
                    "passes_location_rule": qual["passes_zone_rule"],
                    "price_type": "down_payment" if price < 5000 else "full",
                    "status": "available",
                    "scraped_at": dt.now().isoformat(),
                }, on_conflict="source_url").execute()
                saved += 1
            except Exception:
                pass

        result = {"ok": True, "city": city, "raw": len(items), "saved": saved}
        _log_job("facebook_auto_scrape", result)
        if saved > 0:
            logger.info(f"[scheduler] ✅ FB via Apify: {saved} from {city}")
        return result

    except Exception as e:
        logger.error(f"[scheduler] FB auto-scrape error: {e}")
        _log_job("facebook_auto_scrape", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


def _job_expire_old_listings():
    """
    Job: Mark listings older than 14 days as expired.
    Keeps the dashboard fresh — old listings are likely already sold.
    Only expires 'available' listings (not negotiating, reviewing, etc.)
    """
    from datetime import datetime as dt, timedelta
    try:
        from tools.supabase_client import sb

        cutoff = (dt.now() - timedelta(days=14)).isoformat()

        # Expire old available listings
        result = sb.table("market_listings")\
            .update({"status": "expired"})\
            .eq("status", "available")\
            .lt("scraped_at", cutoff)\
            .execute()

        expired_count = len(result.data) if result.data else 0

        _log_job("expire_old_listings", {"ok": True, "expired": expired_count, "cutoff": cutoff[:10]})
        if expired_count > 0:
            logger.info(f"[scheduler] Expired {expired_count} listings older than 14 days")
        return {"ok": True, "expired": expired_count}

    except Exception as e:
        logger.error(f"[scheduler] Expire listings error: {e}")
        _log_job("expire_old_listings", {"ok": False, "error": str(e)})
        return {"ok": False, "error": str(e)}


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

    # Job 6: Title monitor - DAILY at 10:00 AM CT
    # Checks TDHCA for owner name updates on pending title transfers
    _scheduler.add_job(
        _job_title_monitor,
        trigger=CronTrigger(hour=10, minute=0),
        id="title_monitor",
        name="TDHCA Title Name Monitor (daily)",
        replace_existing=True,
    )

    # Job 7: Investor follow-up emails - 1st of every month at 10:30 AM CT
    _scheduler.add_job(
        _job_investor_followup_emails,
        trigger=CronTrigger(day=1, hour=10, minute=30),
        id="investor_followup_emails",
        name="Monthly Investor Follow-up Emails",
        replace_existing=True,
    )

    # Job 8: Promissory note maturity alerts - daily at 9:30 AM CT
    # Checks for notes maturing within 90 days, skips if alerted in last 7 days
    _scheduler.add_job(
        _job_promissory_maturity_alerts,
        trigger=CronTrigger(hour=9, minute=30),
        id="promissory_maturity_alerts",
        name="Promissory Note Maturity Alerts (90/60/30 day)",
        replace_existing=True,
    )

    # Job 9: Facebook Marketplace auto-scrape — Monday & Thursday 7:00 AM CT
    # Uses Apify ($2-3 per run) — 2x/week fits in $29/month Starter plan
    _scheduler.add_job(
        _job_facebook_auto_scrape,
        trigger=CronTrigger(day_of_week="mon,thu", hour=7, minute=0),
        id="facebook_auto_scrape",
        name="Facebook Marketplace Auto-Scrape (Mon & Thu 7am)",
        replace_existing=True,
    )

    # Job 10: Auto-expire old listings — daily at 6:00 AM CT
    # Marks listings older than 14 days as expired
    _scheduler.add_job(
        _job_expire_old_listings,
        trigger=CronTrigger(hour=6, minute=0),
        id="expire_old_listings",
        name="Expire Old Listings (>14 days)",
        replace_existing=True,
    )

    _scheduler.start()
    logger.info("[scheduler] ✅ Scheduler started with 10 jobs")
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

