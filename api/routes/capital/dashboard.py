"""
Capital Dashboard - KPIs, overview metrics, cartera health
"""

from typing import Optional
from fastapi import APIRouter
from tools.supabase_client import sb
from datetime import datetime, date, timedelta
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/dashboard", tags=["Capital - Dashboard"])


def _safe_date(value) -> Optional[date]:
    """Parse date from Supabase (handles DATE and TIMESTAMPTZ formats)."""
    if not value:
        return None
    if isinstance(value, date):
        return value
    s = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%S%z",
                "%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S.%f%z"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    try:
        return datetime.strptime(s[:10], "%Y-%m-%d").date()
    except Exception:
        return None


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
    """Get overview KPIs for Maninos Homes dashboard."""
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
            due = _safe_date(p["due_date"]) or today
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


@router.get("/kpis")
async def get_strategic_kpis():
    """
    Strategic KPIs across 4 categories: Clients, Investors, Portfolio, Purchase.
    Calculates actual values from DB and compares against targets.
    """
    try:
        today = date.today()
        today_str = today.isoformat()
        month_start = today.replace(day=1).isoformat()

        # ── Fetch all needed data ──
        applications = safe_query("rto_applications", lambda:
            sb.table("rto_applications")
            .select("id, status, created_at")
            .execute()
        ).data or []

        contracts = safe_query("rto_contracts", lambda:
            sb.table("rto_contracts")
            .select("id, client_id, status, created_at, signed_at, start_date, purchase_price")
            .execute()
        ).data or []

        clients = safe_query("clients", lambda:
            sb.table("clients")
            .select("id, status, kyc_verified, nps_score, referred_by")
            .execute()
        ).data or []

        payments_due = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, amount, status, due_date, paid_date, days_late")
            .gte("due_date", month_start)
            .lte("due_date", today_str)
            .execute()
        ).data or []

        all_overdue = safe_query("rto_payments", lambda:
            sb.table("rto_payments")
            .select("id, amount, status, due_date, days_late")
            .in_("status", ["pending", "late"])
            .lt("due_date", today_str)
            .execute()
        ).data or []

        investors = safe_query("investors", lambda:
            sb.table("investors")
            .select("id, status, total_invested, created_at")
            .execute()
        ).data or []

        investments = safe_query("investments", lambda:
            sb.table("investments")
            .select("id, investor_id, amount, created_at")
            .execute()
        ).data or []

        promissory_notes = safe_query("promissory_notes", lambda:
            sb.table("promissory_notes")
            .select("id, investor_id, interest_rate, status")
            .execute()
        ).data or []

        properties = safe_query("properties", lambda:
            sb.table("properties")
            .select("id, status")
            .execute()
        ).data or []

        # ── CLIENT KPIs ──

        # 1. Onboarding Time: avg days from application to contract signing
        onboarding_days = []
        contract_map = {c.get("client_id"): c for c in contracts if c.get("signed_at")}
        for app in applications:
            if app.get("status") == "approved":
                app_date = _safe_date(app.get("created_at"))
                # Find matching contract
                for c in contracts:
                    signed = _safe_date(c.get("signed_at") or c.get("start_date"))
                    if signed and app_date:
                        days = (signed - app_date).days
                        if 0 <= days <= 90:  # reasonable range
                            onboarding_days.append(days)
                            break
        avg_onboarding = round(sum(onboarding_days) / len(onboarding_days), 1) if onboarding_days else 0

        # 2. Customer Satisfaction (NPS) - from clients with nps_score
        nps_scores = [c.get("nps_score") for c in clients if c.get("nps_score") is not None]
        avg_nps = round(sum(nps_scores) / len(nps_scores), 1) if nps_scores else None

        # 3. KYC Compliance Rate
        rto_clients = [c for c in clients if c.get("status") in ("rto_applicant", "rto_active", "completed")]
        kyc_verified = len([c for c in rto_clients if c.get("kyc_verified")])
        kyc_rate = round(kyc_verified / len(rto_clients) * 100, 1) if rto_clients else 100.0

        # 4. Conversion Rate: approved / total applications
        total_apps = len(applications)
        approved_apps = len([a for a in applications if a.get("status") == "approved"])
        conversion_rate = round(approved_apps / total_apps * 100, 1) if total_apps > 0 else 0

        # ── INVESTOR KPIs ──

        # 1. Funding Success Rate: actual raised this month vs target ($100K)
        monthly_target = 100000
        month_investments = [
            inv for inv in investments
            if inv.get("created_at", "")[:7] == today.strftime("%Y-%m")
        ]
        raised_this_month = sum(float(inv.get("amount", 0)) for inv in month_investments)
        funding_success = round(raised_this_month / monthly_target * 100, 1) if monthly_target > 0 else 0

        # 2. Cost of Capital: avg interest rate on active promissory notes
        active_notes = [n for n in promissory_notes if n.get("status") == "active"]
        rates = [float(n.get("interest_rate", 0)) for n in active_notes if n.get("interest_rate")]
        avg_cost_capital = round(sum(rates) / len(rates), 1) if rates else 0

        # 3. Investor Retention: investors with >1 investment / total investors
        investor_inv_count = {}
        for inv in investments:
            iid = inv.get("investor_id")
            if iid:
                investor_inv_count[iid] = investor_inv_count.get(iid, 0) + 1
        repeat_investors = len([k for k, v in investor_inv_count.items() if v > 1])
        total_with_investments = len(investor_inv_count)
        investor_retention = round(repeat_investors / total_with_investments * 100, 1) if total_with_investments > 0 else 0

        # 4. Compliance Rate (SEC) - manual/static for now
        compliance_rate_investors = 100.0

        # ── PORTFOLIO KPIs ──

        # 1. Collection Rate (already calculated-style)
        due_amount = sum(float(p.get("amount", 0)) for p in payments_due)
        paid_amount = sum(float(p.get("amount", 0)) for p in payments_due if p.get("status") == "paid")
        collection_rate = round(paid_amount / due_amount * 100, 1) if due_amount > 0 else 100.0

        # 2. Delinquency Rate: % of tenants >30 days late
        active_contracts = [c for c in contracts if c.get("status") == "active"]
        clients_with_overdue_30 = set()
        for p in all_overdue:
            due = _safe_date(p.get("due_date"))
            if due and (today - due).days > 30:
                # find contract for this payment
                clients_with_overdue_30.add(p.get("client_id"))
        delinquency_rate_30 = round(len(clients_with_overdue_30) / len(active_contracts) * 100, 1) if active_contracts else 0

        # 3. Portfolio Occupancy: properties with active RTO / total sold+rto properties
        rto_properties = len([p for p in properties if p.get("status") == "sold"])
        total_sellable = len([p for p in properties if p.get("status") in ("published", "sold", "reserved")])
        occupancy = round(rto_properties / total_sellable * 100, 1) if total_sellable > 0 else 0

        # 4. System Uptime - static (monitored externally)
        system_uptime = 99.9

        # ── PURCHASE KPIs ──

        # 1. Purchase Completion Rate: delivered contracts / total activated
        delivered = len([c for c in contracts if c.get("status") == "delivered"])
        activated = len([c for c in contracts if c.get("status") in ("active", "completed", "delivered")])
        purchase_completion = round(delivered / activated * 100, 1) if activated > 0 else 0

        # 2. Customer Retention: clients with >1 contract / total clients with contracts
        client_contract_count = {}
        for c in contracts:
            cid = c.get("client_id")
            if cid:
                client_contract_count[cid] = client_contract_count.get(cid, 0) + 1
        repeat_clients = len([k for k, v in client_contract_count.items() if v > 1])
        total_clients_with_contracts = len(client_contract_count)
        customer_retention = round(repeat_clients / total_clients_with_contracts * 100, 1) if total_clients_with_contracts > 0 else 0

        # 3. Referral Rate: clients with referred_by / total
        referred = len([c for c in clients if c.get("referred_by")])
        referral_rate = round(referred / len(clients) * 100, 1) if clients else 0

        # 4. Compliance Rate (Texas/Federal) - manual/static
        compliance_rate_legal = 100.0

        return {
            "ok": True,
            "kpis": {
                "client": {
                    "title": "KPIs Clientes",
                    "metrics": [
                        {
                            "key": "onboarding_time",
                            "label": "Tiempo de Onboarding",
                            "description": "Promedio dias desde solicitud hasta firma de contrato",
                            "value": avg_onboarding,
                            "target": 5,
                            "unit": "dias",
                            "direction": "lower_is_better",
                            "status": "on_target" if avg_onboarding <= 5 else ("warning" if avg_onboarding <= 10 else "off_target"),
                        },
                        {
                            "key": "nps",
                            "label": "Satisfaccion del Cliente (NPS)",
                            "description": "Net Promoter Score promedio",
                            "value": avg_nps,
                            "target": 80,
                            "unit": "puntos",
                            "direction": "higher_is_better",
                            "status": "on_target" if (avg_nps or 0) >= 80 else ("warning" if (avg_nps or 0) >= 60 else "off_target"),
                        },
                        {
                            "key": "kyc_compliance",
                            "label": "KYC Compliance Rate",
                            "description": "Clientes verificados segun requisitos regulatorios",
                            "value": kyc_rate,
                            "target": 100,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if kyc_rate >= 100 else ("warning" if kyc_rate >= 80 else "off_target"),
                        },
                        {
                            "key": "conversion_rate",
                            "label": "Tasa de Conversion",
                            "description": "Solicitudes aprobadas para contratos RTO",
                            "value": conversion_rate,
                            "target": 70,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if conversion_rate >= 70 else ("warning" if conversion_rate >= 50 else "off_target"),
                        },
                    ],
                },
                "investor": {
                    "title": "KPIs Inversionistas",
                    "metrics": [
                        {
                            "key": "funding_success",
                            "label": "Tasa de Fondeo",
                            "description": f"Porcentaje del objetivo mensual (${monthly_target:,.0f}) alcanzado",
                            "value": funding_success,
                            "target": 90,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if funding_success >= 90 else ("warning" if funding_success >= 60 else "off_target"),
                            "extra": {"raised": raised_this_month, "target_amount": monthly_target},
                        },
                        {
                            "key": "cost_of_capital",
                            "label": "Costo de Capital",
                            "description": "Tasa de interes promedio anual en notas promisorias",
                            "value": avg_cost_capital,
                            "target": 12,
                            "unit": "%",
                            "direction": "lower_is_better",
                            "status": "on_target" if avg_cost_capital <= 12 else ("warning" if avg_cost_capital <= 15 else "off_target"),
                        },
                        {
                            "key": "investor_retention",
                            "label": "Retencion de Inversores",
                            "description": "Inversores que reinvierten en rondas subsecuentes",
                            "value": investor_retention,
                            "target": 80,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if investor_retention >= 80 else ("warning" if investor_retention >= 50 else "off_target"),
                        },
                        {
                            "key": "sec_compliance",
                            "label": "Compliance SEC",
                            "description": "Adherencia a regulaciones SEC",
                            "value": compliance_rate_investors,
                            "target": 100,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if compliance_rate_investors >= 100 else "off_target",
                        },
                    ],
                },
                "portfolio": {
                    "title": "KPIs Portfolio",
                    "metrics": [
                        {
                            "key": "collection_rate",
                            "label": "Tasa de Cobro",
                            "description": "Rentas cobradas a tiempo este mes",
                            "value": collection_rate,
                            "target": 95,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if collection_rate >= 95 else ("warning" if collection_rate >= 80 else "off_target"),
                        },
                        {
                            "key": "delinquency_rate",
                            "label": "Tasa de Morosidad",
                            "description": "Inquilinos con mas de 30 dias de atraso",
                            "value": delinquency_rate_30,
                            "target": 5,
                            "unit": "%",
                            "direction": "lower_is_better",
                            "status": "on_target" if delinquency_rate_30 <= 5 else ("warning" if delinquency_rate_30 <= 10 else "off_target"),
                        },
                        {
                            "key": "portfolio_occupancy",
                            "label": "Ocupacion del Portfolio",
                            "description": "Propiedades con RTO activo",
                            "value": occupancy,
                            "target": 90,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if occupancy >= 90 else ("warning" if occupancy >= 70 else "off_target"),
                        },
                        {
                            "key": "system_uptime",
                            "label": "Disponibilidad del Sistema",
                            "description": "Uptime de la plataforma",
                            "value": system_uptime,
                            "target": 99.9,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target",
                        },
                    ],
                },
                "purchase": {
                    "title": "KPIs Compra/Retencion",
                    "metrics": [
                        {
                            "key": "purchase_completion",
                            "label": "Tasa de Completacion de Compra",
                            "description": "Inquilinos que completan la opcion de compra",
                            "value": purchase_completion,
                            "target": 80,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if purchase_completion >= 80 else ("warning" if purchase_completion >= 50 else "off_target"),
                        },
                        {
                            "key": "customer_retention",
                            "label": "Retencion de Clientes",
                            "description": "Clientes que inician un segundo contrato RTO",
                            "value": customer_retention,
                            "target": 20,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if customer_retention >= 20 else ("warning" if customer_retention >= 10 else "off_target"),
                        },
                        {
                            "key": "referral_rate",
                            "label": "Tasa de Referidos",
                            "description": "Nuevos clientes por referidos",
                            "value": referral_rate,
                            "target": 10,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if referral_rate >= 10 else ("warning" if referral_rate >= 5 else "off_target"),
                        },
                        {
                            "key": "legal_compliance",
                            "label": "Compliance Legal",
                            "description": "Adherencia a regulaciones de Texas y federales",
                            "value": compliance_rate_legal,
                            "target": 100,
                            "unit": "%",
                            "direction": "higher_is_better",
                            "status": "on_target" if compliance_rate_legal >= 100 else "off_target",
                        },
                    ],
                },
            },
        }
    except Exception as e:
        logger.error(f"Error getting strategic KPIs: {e}")
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
