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
    send_investor_welcome_email,
    send_investor_followup_email,
    send_investor_completion_email,
    process_investor_followup_emails,
    send_client_post_purchase_email,
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


@router.post("/investor/test-welcome")
async def test_investor_welcome_email(
    to: str = Query("mariasebares9@gmail.com", description="Test recipient email"),
):
    """Test: Send investor welcome email with sample data."""
    sample_note = {
        "id": "test-note-id",
        "loan_amount": 50000,
        "annual_rate": 12,
        "term_months": 12,
        "total_interest": 6000,
        "total_due": 56000,
        "start_date": "2026-03-01",
        "maturity_date": "2027-03-01",
    }
    result = send_investor_welcome_email(
        investor_email=to,
        investor_name="Inversor de Prueba",
        note_data=sample_note,
    )
    return result


@router.post("/investor/test-followup")
async def test_investor_followup_email(
    to: str = Query("mariasebares9@gmail.com", description="Test recipient email"),
):
    """Test: Send investor follow-up email with sample data."""
    sample_summary = {
        "total_invested": 100000,
        "total_returned": 25000,
        "outstanding": 81000,
        "active_notes": 2,
        "notes": [
            {"loan_amount": 50000, "annual_rate": 12, "maturity_date": "2027-03-01", "paid_amount": 15000, "status": "active"},
            {"loan_amount": 50000, "annual_rate": 10, "maturity_date": "2026-09-01", "paid_amount": 10000, "status": "active"},
        ],
    }
    result = send_investor_followup_email(
        investor_email=to,
        investor_name="Inversor de Prueba",
        summary=sample_summary,
    )
    return result


@router.post("/investor/test-completion")
async def test_investor_completion_email(
    to: str = Query("mariasebares9@gmail.com", description="Test recipient email"),
):
    """Test: Send investor completion email with sample data."""
    sample_note = {
        "loan_amount": 50000,
        "annual_rate": 12,
        "total_interest": 6000,
        "total_due": 56000,
        "paid_amount": 56000,
        "start_date": "2025-03-01",
        "maturity_date": "2026-03-01",
    }
    result = send_investor_completion_email(
        investor_email=to,
        investor_name="Inversor de Prueba",
        note_data=sample_note,
    )
    return result


@router.post("/client/test-post-purchase")
async def test_client_post_purchase_email(
    to: str = Query("mariasebares9@gmail.com", description="Test recipient email"),
):
    """Test: Send client post-purchase options email with sample data."""
    sample_options = {
        "financial_summary": {
            "purchase_price": 45000,
            "total_paid": 52000,
        },
        "options": [
            {
                "key": "repurchase",
                "title": "Opcion 1: Recompra de la Casa",
                "description": "Te ofrecemos recomprar tu casa a valor de mercado con un descuento especial por lealtad.",
                "details": [
                    "Recompra a valor de mercado menos 5% de descuento por lealtad (ahorro estimado: $2,250.00)",
                    "Podemos revender o re-alquilar la propiedad a un nuevo inquilino",
                ],
                "estimated_discount": 2250,
            },
            {
                "key": "upgrade",
                "title": "Opcion 2: Upgrade a Nueva Casa",
                "description": "Programa trade-in: intercambia tu casa actual por una nueva con un nuevo contrato RTO.",
                "details": [
                    "Intercambiar tu casa actual por una nueva mobile home con nuevo contrato",
                    "Credito del 20% de tus pagos anteriores hacia el nuevo contrato (credito estimado: $10,400.00)",
                ],
                "credit_amount": 10400,
            },
        ],
        "loyalty_programs": {
            "title": "Programas de Lealtad",
            "programs": [
                {"key": "referral_bonus", "title": "Bono por Referido",
                 "description": "Bonos por referir nuevos inquilinos", "min_bonus": 500, "max_bonus": 1000},
                {"key": "repeat_discount", "title": "Descuento Repeat Customer",
                 "description": "Descuentos en contratos futuros para clientes recurrentes"},
                {"key": "satisfaction_survey", "title": "Encuesta de Satisfaccion",
                 "description": "Tu opinion nos ayuda a mejorar"},
            ],
        },
    }
    result = send_client_post_purchase_email(
        client_email=to,
        client_name="Cliente de Prueba",
        property_address="123 Main St, Houston TX",
        options_data=sample_options,
    )
    return result


@router.post("/investor/send-all-followups")
async def send_all_investor_followups():
    """Manually trigger monthly investor follow-up emails to all active investors."""
    result = process_investor_followup_emails()
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

