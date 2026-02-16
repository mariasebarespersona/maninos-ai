"""
Capital Dashboard - KPIs, overview metrics, cartera health
"""

from fastapi import APIRouter
from tools.supabase_client import sb
from datetime import datetime, date, timedelta
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


@router.get("/cartera-health")
async def get_cartera_health():
    """
    Portfolio health metrics: delinquency, aging, collection rate, at-risk clients.
    This powers the Dashboard 'Salud de Cartera' section.
    """
    try:
        today = date.today()
        today_str = today.isoformat()
        month_start = today.replace(day=1).isoformat()

        # ── Active contracts ──
        contracts = safe_query("rto_contracts", lambda:
            sb.table("rto_contracts")
            .select("id, client_id, property_id, monthly_rent, purchase_price, status, term_months, clients(id, name, email, phone), properties(id, address, city)")
            .eq("status", "active")
            .execute()
        ).data or []

        portfolio_value = sum(float(c.get("purchase_price", 0)) for c in contracts)
        monthly_expected = sum(float(c.get("monthly_rent", 0)) for c in contracts)

        # ── ALL pending/late payments (for aging analysis) ──
        overdue_result = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, rto_contract_id, client_id, amount, due_date, status, days_late, late_fee_amount")
            .in_("status", ["pending", "late"])
            .lt("due_date", today_str)
            .execute()
        ).data or []

        # Aging buckets
        aging = {"0_30": 0, "31_60": 0, "61_90": 0, "90_plus": 0}
        aging_amount = {"0_30": 0.0, "31_60": 0.0, "61_90": 0.0, "90_plus": 0.0}
        total_overdue_amount = 0.0
        total_late_fees = 0.0
        client_overdue_map: dict = {}  # client_id -> { count, amount, max_days_late }

        for p in overdue_result:
            due = datetime.strptime(p["due_date"], "%Y-%m-%d").date()
            days = (today - due).days
            amt = float(p.get("amount", 0))
            total_overdue_amount += amt
            total_late_fees += float(p.get("late_fee_amount", 0) or 0)

            if days <= 30:
                aging["0_30"] += 1
                aging_amount["0_30"] += amt
            elif days <= 60:
                aging["31_60"] += 1
                aging_amount["31_60"] += amt
            elif days <= 90:
                aging["61_90"] += 1
                aging_amount["61_90"] += amt
            else:
                aging["90_plus"] += 1
                aging_amount["90_plus"] += amt

            cid = p.get("client_id")
            if cid:
                if cid not in client_overdue_map:
                    client_overdue_map[cid] = {"count": 0, "amount": 0.0, "max_days_late": 0}
                client_overdue_map[cid]["count"] += 1
                client_overdue_map[cid]["amount"] += amt
                client_overdue_map[cid]["max_days_late"] = max(client_overdue_map[cid]["max_days_late"], days)

        # ── Paid this month ──
        paid_result = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, paid_amount")
            .eq("status", "paid")
            .gte("paid_date", month_start)
            .execute()
        ).data or []
        paid_this_month = sum(float(p.get("paid_amount", 0)) for p in paid_result)

        # Collection rate
        due_this_month_result = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, amount, status")
            .gte("due_date", month_start)
            .lte("due_date", today_str)
            .execute()
        ).data or []
        due_this_month = sum(float(p.get("amount", 0)) for p in due_this_month_result)
        paid_of_due = sum(float(p.get("amount", 0)) for p in due_this_month_result if p.get("status") == "paid")
        collection_rate = round((paid_of_due / due_this_month * 100), 1) if due_this_month > 0 else 100.0
        delinquency_rate = round((total_overdue_amount / monthly_expected * 100), 1) if monthly_expected > 0 else 0.0

        # ── At-risk clients (sorted by max_days_late desc) ──
        at_risk_clients = []
        contracts_map = {c["client_id"]: c for c in contracts if c.get("client_id")}
        for cid, info in sorted(client_overdue_map.items(), key=lambda x: x[1]["max_days_late"], reverse=True)[:10]:
            contract = contracts_map.get(cid, {})
            client = contract.get("clients", {}) if contract else {}
            prop = contract.get("properties", {}) if contract else {}
            at_risk_clients.append({
                "client_id": cid,
                "client_name": client.get("name", "N/A") if client else "N/A",
                "client_phone": client.get("phone") if client else None,
                "property_address": prop.get("address", "N/A") if prop else "N/A",
                "overdue_payments": info["count"],
                "overdue_amount": round(info["amount"], 2),
                "max_days_late": info["max_days_late"],
                "risk_level": "critical" if info["max_days_late"] > 60 else ("high" if info["max_days_late"] > 30 else "medium"),
                "contract_id": contract.get("id"),
            })

        return {
            "ok": True,
            "cartera": {
                "active_contracts": len(contracts),
                "portfolio_value": round(portfolio_value, 2),
                "monthly_expected": round(monthly_expected, 2),
                "paid_this_month": round(paid_this_month, 2),
                "collection_rate": collection_rate,
                "delinquency_rate": delinquency_rate,
                "total_overdue_payments": len(overdue_result),
                "total_overdue_amount": round(total_overdue_amount, 2),
                "total_late_fees_accrued": round(total_late_fees, 2),
                "aging": {
                    "0_30_days": {"count": aging["0_30"], "amount": round(aging_amount["0_30"], 2)},
                    "31_60_days": {"count": aging["31_60"], "amount": round(aging_amount["31_60"], 2)},
                    "61_90_days": {"count": aging["61_90"], "amount": round(aging_amount["61_90"], 2)},
                    "90_plus_days": {"count": aging["90_plus"], "amount": round(aging_amount["90_plus"], 2)},
                },
                "at_risk_clients": at_risk_clients,
                "clients_in_mora": len(client_overdue_map),
            }
        }
    except Exception as e:
        logger.error(f"Error getting cartera health: {e}")
        return {"ok": False, "error": str(e), "cartera": {}}


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
