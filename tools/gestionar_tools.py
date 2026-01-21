"""
Tools for GestionarAgent (Gestionar Cartera)
Manages RTO contracts, payments, portfolio risk, and reporting.

Tools (5):
1. setup_automatic_payment - Configure Stripe auto-payments
2. monitor_payment_status - Check payment status and delinquency
3. assess_portfolio_risk - Classify portfolio by risk level
4. generate_monthly_report - Generate monthly performance report
5. (generate_rto_contract is shared from incorporar_tools)
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from decimal import Decimal

logger = logging.getLogger(__name__)


def setup_automatic_payment(
    client_id: str,
    contract_id: str,
    payment_method_id: Optional[str] = None,
    payment_day: int = 15
) -> Dict[str, Any]:
    """
    Configura cobros automáticos via Stripe para un contrato RTO.
    
    KPI Target: Cobranza puntual ≥95%
    
    Flujo:
    1. Obtiene datos del contrato y cliente
    2. Crea/obtiene cliente en Stripe
    3. Crea precio para la renta mensual
    4. Retorna URL para que el cliente agregue método de pago
    5. Una vez tenga método de pago, se puede crear la suscripción
    
    Args:
        client_id: UUID del cliente
        contract_id: UUID del contrato RTO
        payment_method_id: ID del método de pago en Stripe (opcional)
        payment_day: Día del mes para el cobro (default 15)
    
    Returns:
        Dict con estado de configuración y URLs para completar setup
    """
    from .supabase_client import sb
    from .stripe_payments import (
        setup_automatic_payment_full,
        create_subscription,
        get_customer_payment_methods
    )
    import os
    
    try:
        # Get contract details
        contract_result = sb.table("rto_contracts").select(
            "*, clients(full_name, email, phone)"
        ).eq("id", contract_id).eq("client_id", client_id).execute()
        
        if not contract_result.data:
            return {"ok": False, "error": "Contrato no encontrado"}
        
        contract = contract_result.data[0]
        client = contract.get("clients", {})
        
        # Check if auto-payment already enabled with active subscription
        if contract.get("auto_payment_enabled") and contract.get("stripe_subscription_id"):
            return {
                "ok": True,
                "already_configured": True,
                "message": f"✅ Pago automático ya configurado para {client.get('full_name')}",
                "payment_day": contract.get("payment_day", 15),
                "stripe_subscription_id": contract.get("stripe_subscription_id")
            }
        
        # Get monthly rent in cents
        monthly_rent = float(contract.get("monthly_rent", 695))
        monthly_rent_cents = int(monthly_rent * 100)
        
        # Check if Stripe is configured
        if not os.getenv("STRIPE_SECRET_KEY"):
            # Fallback to simulation mode
            logger.warning("[setup_automatic_payment] STRIPE_SECRET_KEY not configured - using simulation mode")
            return _setup_automatic_payment_simulation(
                client_id, contract_id, contract, client, payment_day
            )
        
        # === REAL STRIPE INTEGRATION ===
        
        # Setup automatic payment via Stripe
        stripe_result = setup_automatic_payment_full(
            client_id=client_id,
            client_email=client.get("email", ""),
            client_name=client.get("full_name", ""),
            contract_id=contract_id,
            monthly_rent_cents=monthly_rent_cents,
            payment_day=payment_day
        )
        
        if not stripe_result.get("ok"):
            return stripe_result
        
        stripe_customer_id = stripe_result["stripe_customer_id"]
        price_id = stripe_result["price_id"]
        
        # Update contract with Stripe info
        update_data = {
            "stripe_customer_id": stripe_customer_id,
            "stripe_price_id": price_id,
            "payment_day": payment_day,
            "updated_at": datetime.now().isoformat()
        }
        
        # If client already has payment method, create subscription immediately
        if stripe_result.get("ready_for_subscription"):
            sub_result = create_subscription(
                stripe_customer_id=stripe_customer_id,
                price_id=price_id,
                contract_id=contract_id
            )
            
            if sub_result.get("ok"):
                update_data["auto_payment_enabled"] = True
                update_data["stripe_subscription_id"] = sub_result["subscription_id"]
                
                # Calculate next payment date
                today = datetime.now()
                if today.day >= payment_day:
                    next_month = today.replace(day=1) + timedelta(days=32)
                    next_payment = next_month.replace(day=payment_day)
                else:
                    next_payment = today.replace(day=payment_day)
                update_data["next_payment_due"] = next_payment.date().isoformat()
        
        sb.table("rto_contracts").update(update_data).eq("id", contract_id).execute()
        
        # Log action
        try:
            sb.table("process_logs").insert({
                "entity_type": "contract",
                "entity_id": contract_id,
                "process": "GESTIONAR_CARTERA",
                "action": "auto_payment_setup_initiated",
                "details": {
                    "client_name": client.get("full_name"),
                    "payment_day": payment_day,
                    "monthly_rent": monthly_rent,
                    "stripe_customer_id": stripe_customer_id,
                    "ready_for_subscription": stripe_result.get("ready_for_subscription", False)
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[setup_automatic_payment] Failed to log: {log_error}")
        
        logger.info(f"[setup_automatic_payment] Stripe setup for contract {contract_id}")
        
        # Build response
        result = {
            "ok": True,
            "contract_id": contract_id,
            "client_name": client.get("full_name"),
            "payment_day": payment_day,
            "monthly_rent": monthly_rent,
            "stripe_customer_id": stripe_customer_id,
        }
        
        if stripe_result.get("ready_for_subscription"):
            result["auto_payment_enabled"] = True
            result["stripe_subscription_id"] = update_data.get("stripe_subscription_id")
            result["next_payment_date"] = update_data.get("next_payment_due")
            result["message"] = f"✅ Pago automático ACTIVADO. Próximo cobro: día {payment_day} (${monthly_rent:,.2f}/mes)"
        else:
            result["auto_payment_enabled"] = False
            result["checkout_url"] = stripe_result.get("checkout_url")
            result["setup_intent_id"] = stripe_result.get("setup_intent_id")
            result["client_secret"] = stripe_result.get("client_secret")
            result["next_step"] = stripe_result.get("next_step")
            result["message"] = f"⏳ El cliente debe agregar método de pago para activar cobros automáticos de ${monthly_rent:,.2f}/mes"
        
        return result
        
    except Exception as e:
        logger.error(f"[setup_automatic_payment] Error: {e}")
        return {"ok": False, "error": str(e)}


def _setup_automatic_payment_simulation(
    client_id: str,
    contract_id: str,
    contract: Dict,
    client: Dict,
    payment_day: int
) -> Dict[str, Any]:
    """
    Modo simulación cuando Stripe no está configurado.
    """
    from .supabase_client import sb
    
    stripe_customer_id = contract.get("stripe_customer_id") or f"cus_sim_{contract_id[:8]}"
    
    # Update contract with simulated auto-payment settings
    update_data = {
        "auto_payment_enabled": True,
        "payment_day": payment_day,
        "stripe_customer_id": stripe_customer_id,
        "updated_at": datetime.now().isoformat()
    }
    
    sb.table("rto_contracts").update(update_data).eq("id", contract_id).execute()
    
    # Calculate next payment date
    today = datetime.now()
    if today.day >= payment_day:
        next_month = today.replace(day=1) + timedelta(days=32)
        next_payment = next_month.replace(day=payment_day)
    else:
        next_payment = today.replace(day=payment_day)
    
    sb.table("rto_contracts").update({
        "next_payment_due": next_payment.date().isoformat()
    }).eq("id", contract_id).execute()
    
    logger.info(f"[setup_automatic_payment] Simulation mode for contract {contract_id}")
    
    return {
        "ok": True,
        "contract_id": contract_id,
        "client_name": client.get("full_name"),
        "payment_day": payment_day,
        "monthly_rent": float(contract.get("monthly_rent", 0)),
        "next_payment_date": next_payment.date().isoformat(),
        "stripe_customer_id": stripe_customer_id,
        "simulation_mode": True,
        "message": f"✅ Pago automático configurado (SIMULACIÓN). Próximo cobro: día {payment_day} (${contract.get('monthly_rent', 0):,.2f}/mes)"
    }


def monitor_payment_status(
    contract_id: Optional[str] = None,
    client_id: Optional[str] = None,
    status_filter: Optional[str] = None,
    include_late_only: bool = False
) -> Dict[str, Any]:
    """
    Revisa estado de pagos y morosidad de contratos.
    
    KPI Target: Morosidad ≤5%
    
    Args:
        contract_id: UUID del contrato específico (opcional)
        client_id: UUID del cliente (opcional)
        status_filter: Filtrar por estado: 'current', 'preventive', 'administrative', 'extrajudicial', 'judicial'
        include_late_only: Si True, solo muestra contratos con pagos atrasados
    
    Returns:
        Dict con estado de pagos y métricas de morosidad
    """
    from .supabase_client import sb
    
    try:
        # Build query
        query = sb.table("rto_contracts").select(
            "*, clients(full_name, email, phone), properties(address)"
        )
        
        if contract_id:
            query = query.eq("id", contract_id)
        if client_id:
            query = query.eq("client_id", client_id)
        if status_filter:
            query = query.eq("portfolio_status", status_filter)
        if include_late_only:
            query = query.gt("days_delinquent", 0)
        
        result = query.eq("status", "active").execute()
        
        if not result.data:
            return {
                "ok": True,
                "contracts_found": 0,
                "message": "No se encontraron contratos con los criterios especificados"
            }
        
        contracts = result.data
        
        # Calculate portfolio metrics
        total_contracts = len(contracts)
        current_count = sum(1 for c in contracts if c.get("portfolio_status") == "current")
        preventive_count = sum(1 for c in contracts if c.get("portfolio_status") == "preventive")
        administrative_count = sum(1 for c in contracts if c.get("portfolio_status") == "administrative")
        extrajudicial_count = sum(1 for c in contracts if c.get("portfolio_status") == "extrajudicial")
        judicial_count = sum(1 for c in contracts if c.get("portfolio_status") == "judicial")
        
        delinquent_count = preventive_count + administrative_count + extrajudicial_count + judicial_count
        delinquency_rate = (delinquent_count / total_contracts * 100) if total_contracts > 0 else 0
        
        # Format contract details
        contract_details = []
        for c in contracts:
            client = c.get("clients", {})
            prop = c.get("properties", {})
            
            detail = {
                "contract_id": c["id"],
                "client_name": client.get("full_name"),
                "property_address": prop.get("address"),
                "monthly_rent": float(c.get("monthly_rent", 0)),
                "portfolio_status": c.get("portfolio_status", "current"),
                "days_delinquent": c.get("days_delinquent", 0),
                "total_paid": float(c.get("total_paid", 0)),
                "total_late_fees": float(c.get("total_late_fees", 0)),
                "last_payment_date": c.get("last_payment_date"),
                "next_payment_due": c.get("next_payment_due"),
                "auto_payment_enabled": c.get("auto_payment_enabled", False)
            }
            
            # Add urgency flag
            if c.get("days_delinquent", 0) > 30:
                detail["urgency"] = "HIGH"
            elif c.get("days_delinquent", 0) > 5:
                detail["urgency"] = "MEDIUM"
            else:
                detail["urgency"] = "LOW"
            
            contract_details.append(detail)
        
        # Sort by days delinquent (most urgent first)
        contract_details.sort(key=lambda x: x["days_delinquent"], reverse=True)
        
        logger.info(f"[monitor_payment_status] Found {total_contracts} contracts, {delinquency_rate:.1f}% delinquent")
        
        return {
            "ok": True,
            "contracts_found": total_contracts,
            "summary": {
                "total_contracts": total_contracts,
                "current": current_count,
                "preventive_1_5_days": preventive_count,
                "administrative_6_30_days": administrative_count,
                "extrajudicial_31_60_days": extrajudicial_count,
                "judicial_over_60_days": judicial_count,
            "delinquency_rate": round(delinquency_rate, 2),
                "kpi_status": "✅ CUMPLE" if delinquency_rate <= 5 else "⚠️ ALERTA"
            },
            "contracts": contract_details[:20],  # Limit to 20 for readability
            "message": f"Cartera: {total_contracts} contratos activos. Morosidad: {delinquency_rate:.1f}% {'✅' if delinquency_rate <= 5 else '⚠️'}"
        }
        
    except Exception as e:
        logger.error(f"[monitor_payment_status] Error: {e}")
        return {"ok": False, "error": str(e)}


def assess_portfolio_risk(
    recalculate: bool = True
) -> Dict[str, Any]:
    """
    Clasifica la cartera por nivel de riesgo y actualiza estados de morosidad.
    
    KPI Target: Reducción impagos ≥10%/año
    
    Clasificación:
    - current: Al día (0 días)
    - preventive: 1-5 días de mora
    - administrative: 6-30 días de mora
    - extrajudicial: 31-60 días de mora
    - judicial: >60 días de mora
    
    Args:
        recalculate: Si True, recalcula días de morosidad basado en fechas
    
    Returns:
        Dict con clasificación de cartera y métricas de riesgo
    """
    from .supabase_client import sb
    
    try:
        # Get all active contracts
        result = sb.table("rto_contracts").select(
            "id, client_id, monthly_rent, next_payment_due, last_payment_date, "
            "days_delinquent, portfolio_status, total_paid, total_late_fees"
        ).eq("status", "active").execute()
        
        if not result.data:
            return {
                "ok": True,
                "message": "No hay contratos activos en la cartera",
                "total_contracts": 0
            }
        
        contracts = result.data
        today = datetime.now().date()
        
        # Recalculate delinquency if requested
        if recalculate:
            for contract in contracts:
                next_due = contract.get("next_payment_due")
                if next_due:
                    due_date = datetime.strptime(next_due, "%Y-%m-%d").date() if isinstance(next_due, str) else next_due
                    days_late = (today - due_date).days
                    
                    if days_late < 0:
                        days_late = 0
                    
                    # Determine portfolio status
                    if days_late == 0:
                        status = "current"
                    elif days_late <= 5:
                        status = "preventive"
                    elif days_late <= 30:
                        status = "administrative"
                    elif days_late <= 60:
                        status = "extrajudicial"
                    else:
                        status = "judicial"
                    
                    # Calculate late fees ($15/day after 5th day)
                    late_fee = max(0, (days_late - 5) * 15) if days_late > 5 else 0
                    
                    # Update contract
                    sb.table("rto_contracts").update({
                        "days_delinquent": days_late,
                        "portfolio_status": status,
                        "total_late_fees": float(contract.get("total_late_fees", 0)) + late_fee,
                        "updated_at": datetime.now().isoformat()
                    }).eq("id", contract["id"]).execute()
                    
                    contract["days_delinquent"] = days_late
                    contract["portfolio_status"] = status
        
        # Calculate risk metrics
        total = len(contracts)
        by_status = {
            "current": [],
            "preventive": [],
            "administrative": [],
            "extrajudicial": [],
            "judicial": []
        }
        
        total_monthly_rent = 0
        at_risk_amount = 0
        
        for c in contracts:
            status = c.get("portfolio_status", "current")
            if status in by_status:
                by_status[status].append(c)
            
            rent = float(c.get("monthly_rent", 0))
            total_monthly_rent += rent
            
            if status != "current":
                at_risk_amount += rent
        
        delinquency_rate = (len(contracts) - len(by_status["current"])) / total * 100 if total > 0 else 0
        at_risk_percentage = at_risk_amount / total_monthly_rent * 100 if total_monthly_rent > 0 else 0
        
        # Log assessment
        try:
            sb.table("process_logs").insert({
                "entity_type": "portfolio",
                "entity_id": None,
                "process": "GESTIONAR_CARTERA",
                "action": "risk_assessment",
                "details": {
                    "total_contracts": total,
                    "delinquency_rate": delinquency_rate,
                    "at_risk_amount": at_risk_amount,
                    "assessment_date": today.isoformat()
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[assess_portfolio_risk] Failed to log: {log_error}")
        
        logger.info(f"[assess_portfolio_risk] Assessed {total} contracts, {delinquency_rate:.1f}% delinquent")
        
        return {
            "ok": True,
            "assessment_date": today.isoformat(),
            "total_contracts": total,
            "classification": {
                "current": {
                    "count": len(by_status["current"]),
                    "percentage": round(len(by_status["current"]) / total * 100, 1) if total > 0 else 0,
                    "description": "Al día"
                },
                "preventive": {
                    "count": len(by_status["preventive"]),
                    "percentage": round(len(by_status["preventive"]) / total * 100, 1) if total > 0 else 0,
                    "description": "1-5 días de mora"
                },
                "administrative": {
                    "count": len(by_status["administrative"]),
                    "percentage": round(len(by_status["administrative"]) / total * 100, 1) if total > 0 else 0,
                    "description": "6-30 días de mora"
                },
                "extrajudicial": {
                    "count": len(by_status["extrajudicial"]),
                    "percentage": round(len(by_status["extrajudicial"]) / total * 100, 1) if total > 0 else 0,
                    "description": "31-60 días de mora"
                },
                "judicial": {
                    "count": len(by_status["judicial"]),
                    "percentage": round(len(by_status["judicial"]) / total * 100, 1) if total > 0 else 0,
                    "description": ">60 días de mora"
                }
            },
            "risk_metrics": {
                "delinquency_rate": round(delinquency_rate, 2),
                "at_risk_amount": round(at_risk_amount, 2),
                "total_monthly_rent": round(total_monthly_rent, 2),
                "at_risk_percentage": round(at_risk_percentage, 2),
                "kpi_status": "✅ CUMPLE" if delinquency_rate <= 5 else "⚠️ ALERTA"
            },
            "recommendations": _get_risk_recommendations(by_status),
            "message": f"Evaluación de riesgo completada. Morosidad: {delinquency_rate:.1f}%. Monto en riesgo: ${at_risk_amount:,.2f}"
        }
        
    except Exception as e:
        logger.error(f"[assess_portfolio_risk] Error: {e}")
        return {"ok": False, "error": str(e)}


def _get_risk_recommendations(by_status: Dict) -> List[str]:
    """Generate recommendations based on portfolio status."""
    recommendations = []
    
    if by_status["judicial"]:
        recommendations.append(f"⚠️ URGENTE: {len(by_status['judicial'])} contratos en cobranza judicial. Iniciar proceso legal.")
    
    if by_status["extrajudicial"]:
        recommendations.append(f"🔴 {len(by_status['extrajudicial'])} contratos en cobranza extrajudicial. Contactar clientes inmediatamente.")
    
    if by_status["administrative"]:
        recommendations.append(f"🟡 {len(by_status['administrative'])} contratos en cobranza administrativa. Enviar recordatorios.")
    
    if by_status["preventive"]:
        recommendations.append(f"🟢 {len(by_status['preventive'])} contratos en etapa preventiva. Monitorear.")
    
    if not recommendations:
        recommendations.append("✅ Cartera saludable. Todos los contratos al día.")
    
    return recommendations


def generate_monthly_report(
    month: Optional[int] = None,
    year: Optional[int] = None
) -> Dict[str, Any]:
    """
    Genera informe mensual de rentabilidad y ocupación.
    
    KPI Target: Reportes 100%
    
    Args:
        month: Mes del reporte (default: mes actual)
        year: Año del reporte (default: año actual)
    
    Returns:
        Dict con métricas mensuales de la cartera
    """
    from .supabase_client import sb
    
    try:
        # Default to current month/year
        today = datetime.now()
        month = month or today.month
        year = year or today.year
        
        # Date range for the month
        start_date = datetime(year, month, 1)
        if month == 12:
            end_date = datetime(year + 1, 1, 1)
        else:
            end_date = datetime(year, month + 1, 1)
        
        # Get contracts data
        contracts_result = sb.table("rto_contracts").select(
            "id, client_id, property_id, monthly_rent, status, portfolio_status, "
            "total_paid, total_late_fees, days_delinquent, start_date"
        ).execute()
        
        contracts = contracts_result.data or []
        
        # Get payments for the month
        payments_result = sb.table("payments").select("*").gte(
            "created_at", start_date.isoformat()
        ).lt("created_at", end_date.isoformat()).execute()
        
        payments = payments_result.data or []
        
        # Get properties data
        properties_result = sb.table("properties").select(
            "id, inventory_status, listing_active"
        ).execute()
        
        properties = properties_result.data or []
        
        # Calculate metrics
        active_contracts = [c for c in contracts if c.get("status") == "active"]
        total_expected_rent = sum(float(c.get("monthly_rent", 0)) for c in active_contracts)
        
        # Payment metrics
        paid_payments = [p for p in payments if p.get("status") == "paid"]
        total_collected = sum(float(p.get("amount", 0)) for p in paid_payments)
        total_late_fees = sum(float(p.get("late_fee", 0)) for p in paid_payments)
        
        collection_rate = (total_collected / total_expected_rent * 100) if total_expected_rent > 0 else 0
        
        # Occupancy metrics
        total_properties = len(properties)
        occupied = len([p for p in properties if p.get("inventory_status") == "occupied"])
        available = len([p for p in properties if p.get("inventory_status") == "available"])
        occupancy_rate = (occupied / total_properties * 100) if total_properties > 0 else 0
        
        # Delinquency metrics
        delinquent_contracts = [c for c in active_contracts if c.get("days_delinquent", 0) > 0]
        delinquency_rate = (len(delinquent_contracts) / len(active_contracts) * 100) if active_contracts else 0
        
        # Build report
        report = {
            "ok": True,
            "report_period": f"{year}-{month:02d}",
            "generated_at": datetime.now().isoformat(),
            "revenue_metrics": {
                "expected_rent": round(total_expected_rent, 2),
                "collected": round(total_collected, 2),
                "late_fees_collected": round(total_late_fees, 2),
                "total_revenue": round(total_collected + total_late_fees, 2),
                "collection_rate": round(collection_rate, 1),
                "variance": round(total_collected - total_expected_rent, 2)
            },
            "occupancy_metrics": {
                "total_properties": total_properties,
                "occupied": occupied,
                "available": available,
                "in_process": total_properties - occupied - available,
                "occupancy_rate": round(occupancy_rate, 1)
            },
            "portfolio_health": {
                "active_contracts": len(active_contracts),
                "delinquent_contracts": len(delinquent_contracts),
                "delinquency_rate": round(delinquency_rate, 1),
                "avg_days_delinquent": round(
                    sum(c.get("days_delinquent", 0) for c in delinquent_contracts) / len(delinquent_contracts), 1
                ) if delinquent_contracts else 0
            },
            "kpi_summary": {
                "collection_rate_target": "≥95%",
                "collection_rate_actual": f"{collection_rate:.1f}%",
                "collection_status": "✅" if collection_rate >= 95 else "⚠️",
                "occupancy_target": "≥90%",
                "occupancy_actual": f"{occupancy_rate:.1f}%",
                "occupancy_status": "✅" if occupancy_rate >= 90 else "⚠️",
                "delinquency_target": "≤5%",
                "delinquency_actual": f"{delinquency_rate:.1f}%",
                "delinquency_status": "✅" if delinquency_rate <= 5 else "⚠️"
            },
            "message": f"Reporte {year}-{month:02d}: Recaudado ${total_collected:,.2f} ({collection_rate:.1f}%), Ocupación {occupancy_rate:.1f}%, Morosidad {delinquency_rate:.1f}%"
            }
        
        # Log report generation
        try:
            sb.table("process_logs").insert({
                "entity_type": "report",
                "entity_id": None,
                "process": "GESTIONAR_CARTERA",
                "action": "monthly_report_generated",
                "details": {
                    "period": f"{year}-{month:02d}",
                    "total_revenue": report["revenue_metrics"]["total_revenue"],
                    "collection_rate": collection_rate,
                    "delinquency_rate": delinquency_rate
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[generate_monthly_report] Failed to log: {log_error}")
        
        logger.info(f"[generate_monthly_report] Generated report for {year}-{month:02d}")
        
        return report
        
    except Exception as e:
        logger.error(f"[generate_monthly_report] Error: {e}")
        return {"ok": False, "error": str(e)}
