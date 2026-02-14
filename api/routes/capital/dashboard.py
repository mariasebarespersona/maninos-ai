"""
Capital Dashboard - KPIs and overview metrics
"""

from fastapi import APIRouter
from tools.supabase_client import sb
from datetime import datetime
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Capital - Dashboard"])


def safe_query(table: str, query_fn):
    """Execute a Supabase query, returning empty result if table doesn't exist."""
    try:
        return query_fn()
    except Exception as e:
        if "PGRST205" in str(e) or "Could not find" in str(e):
            logger.debug(f"Table {table} not found, returning empty")
            return type('obj', (object,), {'data': []})()
        raise


@router.get("")
@router.get("/summary")
async def get_dashboard_summary():
    """Get overview KPIs for Maninos Capital dashboard."""
    try:
        now = datetime.utcnow()
        month_start = now.replace(day=1, hour=0, minute=0, second=0).isoformat()
        
        # Active contracts
        contracts_result = safe_query("rto_contracts", lambda:
            sb.table("rto_contracts")
            .select("id, monthly_rent, purchase_price, status")
            .execute()
        )
        contracts = contracts_result.data or []
        active_contracts = [c for c in contracts if c.get("status") == "active"]
        
        # Pending applications
        apps_result = safe_query("rto_applications", lambda:
            sb.table("rto_applications")
            .select("id, status")
            .in_("status", ["submitted", "under_review", "needs_info"])
            .execute()
        )
        pending_apps = len(apps_result.data or [])
        
        # Monthly expected revenue
        monthly_revenue = sum(float(c.get("monthly_rent", 0)) for c in active_contracts)
        portfolio_value = sum(float(c.get("purchase_price", 0)) for c in active_contracts)
        
        # Payments this month
        payments_result = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, amount, paid_amount, status, due_date")
            .gte("due_date", month_start)
            .lte("due_date", now.isoformat())
            .execute()
        )
        payments_data = payments_result.data or []
        paid_this_month = sum(float(p.get("paid_amount", 0)) for p in payments_data if p.get("status") == "paid")
        pending_this_month = sum(float(p.get("amount", 0)) for p in payments_data if p.get("status") in ("pending", "late"))
        
        # Late payments
        late_result = safe_query("rto_payments", lambda:
            sb.table("rto_payments").select("id").eq("status", "late").execute()
        )
        total_late = len(late_result.data or [])
        
        # Investors
        inv_result = safe_query("investors", lambda:
            sb.table("investors")
            .select("id, total_invested, available_capital")
            .eq("status", "active")
            .execute()
        )
        investors_data = inv_result.data or []
        total_invested = sum(float(i.get("total_invested", 0)) for i in investors_data)
        available_capital = sum(float(i.get("available_capital", 0)) for i in investors_data)
        
        return {
            "ok": True,
            "kpis": {
                "active_contracts": len(active_contracts),
                "total_contracts": len(contracts),
                "pending_applications": pending_apps,
                "monthly_expected_revenue": monthly_revenue,
                "portfolio_value": portfolio_value,
                "paid_this_month": paid_this_month,
                "pending_this_month": pending_this_month,
                "late_payments": total_late,
                "active_investors": len(investors_data),
                "total_invested": total_invested,
                "available_capital": available_capital,
            }
        }
    except Exception as e:
        logger.error(f"Error getting dashboard summary: {e}")
        return {"ok": False, "error": str(e), "kpis": {}}


@router.get("/recent-activity")
async def get_recent_activity():
    """Get recent activity for the dashboard feed."""
    try:
        activities = []
        
        # Recent applications
        apps = safe_query("rto_applications", lambda:
            sb.table("rto_applications")
            .select("*, clients(name, email), properties(address, city)")
            .order("created_at", desc=True)
            .limit(5)
            .execute()
        )
        
        for app in (apps.data or []):
            client_name = app.get("clients", {}).get("name", "Cliente") if app.get("clients") else "Cliente"
            prop_addr = app.get("properties", {}).get("address", "Propiedad") if app.get("properties") else "Propiedad"
            activities.append({
                "type": "application",
                "id": app["id"],
                "title": "Nueva solicitud RTO",
                "description": f"{client_name} - {prop_addr}",
                "status": app["status"],
                "date": app["created_at"]
            })
        
        # Recent payments
        payments = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("*, rto_contracts(client_id, clients(name))")
            .eq("status", "paid")
            .order("paid_date", desc=True)
            .limit(5)
            .execute()
        )
        
        for p in (payments.data or []):
            client_name = "Cliente"
            if p.get("rto_contracts") and p["rto_contracts"].get("clients"):
                client_name = p["rto_contracts"]["clients"]["name"]
            activities.append({
                "type": "payment",
                "id": p["id"],
                "title": f"Pago recibido #{p.get('payment_number', '?')}",
                "description": f"{client_name} - ${float(p.get('paid_amount', p.get('amount', 0))):,.2f}",
                "status": p["status"],
                "date": p.get("paid_date") or p["created_at"]
            })
        
        # Sort by date
        activities.sort(key=lambda x: x.get("date", ""), reverse=True)
        
        return {"ok": True, "activities": activities[:10]}
    except Exception as e:
        logger.error(f"Error getting recent activity: {e}")
        return {"ok": False, "activities": [], "error": str(e)}
