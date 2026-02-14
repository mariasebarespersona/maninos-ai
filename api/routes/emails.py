"""
Email Routes - Process scheduled emails and manage email queue.
Includes automatic background scheduler (APScheduler) and manual triggers.
"""

import logging
from fastapi import APIRouter, Query
from typing import Optional

from api.services.email_service import (
    process_scheduled_emails,
    process_rto_reminders,
    process_rto_overdue_alerts,
)
from api.services.scheduler_service import get_scheduler_status
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/scheduler/status")
async def scheduler_status():
    """
    Get current email scheduler status.
    Shows all background jobs, next run times, and recent execution history.
    """
    return get_scheduler_status()


@router.post("/scheduler/run-all")
async def run_all_jobs_now():
    """
    Manually trigger all scheduled email jobs right now.
    Useful for testing or forcing immediate processing.
    """
    results = {}
    
    results["scheduled_emails"] = process_scheduled_emails()
    results["rto_reminders"] = process_rto_reminders()
    results["rto_overdue_alerts"] = process_rto_overdue_alerts()
    
    return {
        "ok": True,
        "message": "All email jobs executed",
        "results": results,
    }


@router.post("/process")
async def process_pending_emails():
    """
    Process all pending scheduled emails that are due.
    
    Also runs automatically every 30 minutes via background scheduler.
    """
    result = process_scheduled_emails()
    return result


@router.get("/queue")
async def get_email_queue(
    status: Optional[str] = Query(None, description="Filter by status"),
    limit: int = Query(20, le=100),
):
    """Get the current email queue for monitoring."""
    query = sb.table("scheduled_emails") \
        .select("id, email_type, to_email, to_name, subject, scheduled_for, status, sent_at, attempts, last_error") \
        .order("scheduled_for", desc=True) \
        .limit(limit)
    
    if status:
        query = query.eq("status", status)
    
    result = query.execute()
    
    return {
        "ok": True,
        "emails": result.data or [],
        "count": len(result.data or []),
    }


@router.post("/rto/reminders")
async def process_rto_payment_reminders():
    """
    Process RTO payment reminders.
    
    Sends reminders to clients:
    - 3 days before due date
    - On the due date
    - 1 day after due date (if unpaid)
    
    Should be called daily via cron job.
    """
    result = process_rto_reminders()
    return result


@router.post("/rto/overdue-alerts")
async def process_overdue_alerts(
    admin_email: str = Query("info@maninoscapital.com", description="Admin email for alerts"),
):
    """
    Check for overdue RTO payments and send alert to admin.
    
    Checks for payments past the grace period (5+ days late).
    Should be called daily via cron job.
    """
    result = process_rto_overdue_alerts(admin_email=admin_email)
    return result


@router.get("/stats")
async def get_email_stats():
    """Get email sending statistics."""
    all_emails = sb.table("scheduled_emails").select("status, email_type").execute()
    
    stats = {
        "total": 0,
        "pending": 0,
        "sent": 0,
        "failed": 0,
        "cancelled": 0,
        "by_type": {},
    }
    
    for email in (all_emails.data or []):
        stats["total"] += 1
        status = email["status"]
        stats[status] = stats.get(status, 0) + 1
        
        email_type = email["email_type"]
        if email_type not in stats["by_type"]:
            stats["by_type"][email_type] = {"pending": 0, "sent": 0, "failed": 0}
        stats["by_type"][email_type][status] = stats["by_type"][email_type].get(status, 0) + 1
    
    return stats

