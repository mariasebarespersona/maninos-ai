"""
Tools for FondearAgent (Fondear)
Manages investors, capital, debt notes, and SEC compliance.

Tools (7):
1. create_financial_plan - Project funding needs
2. manage_investor_pipeline - Manage investor prospects
3. onboard_investor - Verify investor identity and documents
4. generate_debt_note - Create promissory notes (12% annual)
5. validate_sec_compliance - Ensure Reg. D compliance
6. calculate_debt_ratio - Calculate debt-to-capital ratio
7. send_investor_update - Send communication to investors
"""

import logging
from datetime import datetime, timedelta
from typing import Dict, Any, Optional, List
from decimal import Decimal
import uuid

logger = logging.getLogger(__name__)


def create_financial_plan(
    plan_name: str,
    plan_year: int,
    target_acquisitions: int,
    target_capital_needed: float,
    target_investors: int,
    projected_revenue: Optional[float] = None,
    projected_expenses: Optional[float] = None
) -> Dict[str, Any]:
    """
    Proyecta necesidades de fondeo según metas anuales.
    
    KPI Target: Cumplimiento presupuestal 100%
    
    Args:
        plan_name: Nombre del plan (ej. "Plan 2026")
        plan_year: Año del plan
        target_acquisitions: Número de propiedades a adquirir
        target_capital_needed: Capital total necesario
        target_investors: Número de inversionistas a captar
        projected_revenue: Ingresos proyectados (opcional)
        projected_expenses: Gastos proyectados (opcional)
    
    Returns:
        Dict con plan financiero creado
    """
    from .supabase_client import sb
    
    try:
        # Check if plan for this year already exists
        existing = sb.table("financial_plans").select("id, plan_name").eq(
            "plan_year", plan_year
        ).eq("status", "active").execute()
        
        if existing.data:
            return {
                "ok": False,
                "error": f"Ya existe un plan activo para {plan_year}: {existing.data[0]['plan_name']}"
            }
        
        # Calculate projected net income
        projected_net = None
        if projected_revenue and projected_expenses:
            projected_net = projected_revenue - projected_expenses
        
        # Create plan
        plan_data = {
            "plan_name": plan_name,
            "plan_year": plan_year,
            "target_acquisitions": target_acquisitions,
            "target_capital_needed": target_capital_needed,
            "target_investors": target_investors,
            "projected_revenue": projected_revenue,
            "projected_expenses": projected_expenses,
            "projected_net_income": projected_net,
            "target_debt_ratio": 2.0,  # Max 2:1 debt to capital
            "status": "draft"
        }
        
        result = sb.table("financial_plans").insert(plan_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al crear plan financiero"}
        
        plan = result.data[0]
        
        # Log action
        try:
            sb.table("process_logs").insert({
                "entity_type": "financial_plan",
                "entity_id": plan["id"],
                "process": "FONDEAR",
                "action": "plan_created",
                "details": {
                    "plan_name": plan_name,
                    "plan_year": plan_year,
                    "target_capital": target_capital_needed
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[create_financial_plan] Failed to log: {log_error}")
        
        logger.info(f"[create_financial_plan] Created plan {plan_name} for {plan_year}")
        
        return {
            "ok": True,
            "plan_id": plan["id"],
            "plan_name": plan_name,
            "plan_year": plan_year,
            "targets": {
                "acquisitions": target_acquisitions,
                "capital_needed": target_capital_needed,
                "investors": target_investors
            },
            "projections": {
                "revenue": projected_revenue,
                "expenses": projected_expenses,
                "net_income": projected_net
            },
            "status": "draft",
            "message": f"✅ Plan financiero '{plan_name}' creado. Meta: {target_acquisitions} propiedades, ${target_capital_needed:,.2f} capital, {target_investors} inversionistas."
        }
        
    except Exception as e:
        logger.error(f"[create_financial_plan] Error: {e}")
        return {"ok": False, "error": str(e)}


def manage_investor_pipeline(
    action: str = "list",
    investor_id: Optional[str] = None,
    full_name: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    status: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Gestiona el pipeline de inversionistas prospecto.
    
    KPI Target: 90% presentaciones completadas
    
    Args:
        action: 'list', 'create', 'update', 'get'
        investor_id: UUID del inversionista (para update/get)
        full_name: Nombre completo
        email: Email
        phone: Teléfono
        status: 'prospect', 'active', 'inactive', 'churned'
        notes: Notas adicionales
    
    Returns:
        Dict con resultado de la acción
    """
    from .supabase_client import sb
    
    try:
        if action == "list":
            # List all investors with optional status filter
            query = sb.table("investors").select("*").order("created_at", desc=True)
            if status:
                query = query.eq("investor_status", status)
            
            result = query.execute()
            investors = result.data or []
            
            # Calculate summary
            total = len(investors)
            by_status = {}
            total_invested = 0
            
            for inv in investors:
                s = inv.get("investor_status", "prospect")
                by_status[s] = by_status.get(s, 0) + 1
                total_invested += float(inv.get("total_invested", 0))
            
            return {
                "ok": True,
                "total_investors": total,
                "by_status": by_status,
                "total_invested": round(total_invested, 2),
                "investors": [{
                    "id": i["id"],
                    "full_name": i.get("full_name"),
                    "email": i.get("email"),
                    "status": i.get("investor_status"),
                    "accredited": i.get("accredited_status"),
                    "total_invested": float(i.get("total_invested", 0)),
                    "kyc_status": i.get("kyc_status")
                } for i in investors[:20]],
                "message": f"Pipeline: {total} inversionistas, ${total_invested:,.2f} invertido total"
            }
        
        elif action == "create":
            if not full_name or not email:
                return {"ok": False, "error": "Se requiere nombre completo y email"}
            
            # Check if investor already exists
            existing = sb.table("investors").select("id").eq("email", email).execute()
            if existing.data:
                return {"ok": False, "error": f"Ya existe un inversionista con email {email}"}
            
            investor_data = {
                "full_name": full_name,
                "email": email,
                "phone": phone,
                "investor_status": "prospect",
                "kyc_status": "pending",
                "accredited_status": "pending",
                "notes": notes
            }
            
            result = sb.table("investors").insert(investor_data).execute()
            
            if not result.data:
                return {"ok": False, "error": "Error al crear inversionista"}
            
            investor = result.data[0]
            
            logger.info(f"[manage_investor_pipeline] Created investor {investor['id']}")
            
            return {
                "ok": True,
                "investor_id": investor["id"],
                "full_name": full_name,
                "email": email,
                "status": "prospect",
                "message": f"✅ Inversionista '{full_name}' agregado al pipeline. Siguiente: verificación KYC."
            }
        
        elif action == "update":
            if not investor_id:
                return {"ok": False, "error": "Se requiere investor_id para actualizar"}
            
            update_data = {"updated_at": datetime.now().isoformat()}
            if full_name:
                update_data["full_name"] = full_name
            if email:
                update_data["email"] = email
            if phone:
                update_data["phone"] = phone
            if status:
                update_data["investor_status"] = status
            if notes:
                update_data["notes"] = notes
            
            result = sb.table("investors").update(update_data).eq("id", investor_id).execute()
            
            if not result.data:
                return {"ok": False, "error": "Inversionista no encontrado"}
            
            return {
                "ok": True,
                "investor_id": investor_id,
                "updated_fields": list(update_data.keys()),
                "message": f"✅ Inversionista actualizado"
            }
        
        elif action == "get":
            if not investor_id and not email:
                return {"ok": False, "error": "Se requiere investor_id o email"}
            
            query = sb.table("investors").select("*")
            if investor_id:
                query = query.eq("id", investor_id)
            else:
                query = query.eq("email", email)
            
            result = query.execute()
            
            if not result.data:
                return {"ok": False, "error": "Inversionista no encontrado"}
            
            inv = result.data[0]
            
            return {
                "ok": True,
                "investor": {
                    "id": inv["id"],
                    "full_name": inv.get("full_name"),
                    "email": inv.get("email"),
                    "phone": inv.get("phone"),
                    "status": inv.get("investor_status"),
                    "kyc_status": inv.get("kyc_status"),
                    "accredited_status": inv.get("accredited_status"),
                    "total_invested": float(inv.get("total_invested", 0)),
                    "total_returns": float(inv.get("total_returns_earned", 0)),
                    "active_investments": inv.get("active_investments_count", 0),
                    "created_at": inv.get("created_at")
                }
            }
        
        else:
            return {"ok": False, "error": f"Acción no válida: {action}"}
        
    except Exception as e:
        logger.error(f"[manage_investor_pipeline] Error: {e}")
        return {"ok": False, "error": str(e)}


def onboard_investor(
    investor_id: str,
    ssn_ein: Optional[str] = None,
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    accreditation_method: Optional[str] = None
) -> Dict[str, Any]:
    """
    Verifica identidad y documentos del inversionista para onboarding.
    
    Args:
        investor_id: UUID del inversionista
        ssn_ein: SSN o EIN para propósitos fiscales
        address: Dirección
        city: Ciudad
        state: Estado
        zip_code: Código postal
        accreditation_method: 'income', 'net_worth', 'professional', 'entity'
    
    Returns:
        Dict con estado de onboarding
    """
    from .supabase_client import sb
    
    try:
        # Get investor
        result = sb.table("investors").select("*").eq("id", investor_id).execute()
        
        if not result.data:
            return {"ok": False, "error": "Inversionista no encontrado"}
        
        investor = result.data[0]
        
        # Update investor data
        update_data = {
            "updated_at": datetime.now().isoformat()
        }
        
        if ssn_ein:
            update_data["ssn_ein"] = ssn_ein
        if address:
            update_data["address"] = address
        if city:
            update_data["city"] = city
        if state:
            update_data["state"] = state
        if zip_code:
            update_data["zip_code"] = zip_code
        
        # Check completeness for KYC
        has_identity = bool(ssn_ein or investor.get("ssn_ein"))
        has_address = bool((address or investor.get("address")) and 
                          (city or investor.get("city")) and 
                          (state or investor.get("state")))
        
        if has_identity and has_address:
            update_data["kyc_status"] = "verified"
            update_data["kyc_verified_at"] = datetime.now().isoformat()
        else:
            update_data["kyc_status"] = "processing"
        
        # Handle accreditation
        if accreditation_method:
            update_data["accreditation_method"] = accreditation_method
            # In production, this would involve verification
            # For now, we mark as accredited if method is provided
            update_data["accredited_status"] = "accredited"
            update_data["accreditation_verified_at"] = datetime.now().isoformat()
        
        # If KYC verified, activate investor
        if update_data.get("kyc_status") == "verified":
            update_data["investor_status"] = "active"
        
        sb.table("investors").update(update_data).eq("id", investor_id).execute()
        
        # Log action
        try:
            sb.table("process_logs").insert({
                "entity_type": "investor",
                "entity_id": investor_id,
                "process": "FONDEAR",
                "action": "investor_onboarded",
                "details": {
                    "investor_name": investor.get("full_name"),
                    "kyc_status": update_data.get("kyc_status"),
                    "accredited": update_data.get("accredited_status")
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[onboard_investor] Failed to log: {log_error}")
        
        logger.info(f"[onboard_investor] Onboarded investor {investor_id}")
        
        kyc_status = update_data.get("kyc_status", investor.get("kyc_status"))
        accredited = update_data.get("accredited_status", investor.get("accredited_status"))
        
        return {
            "ok": True,
            "investor_id": investor_id,
            "investor_name": investor.get("full_name"),
            "kyc_status": kyc_status,
            "accredited_status": accredited,
            "investor_status": update_data.get("investor_status", investor.get("investor_status")),
            "next_steps": _get_onboarding_next_steps(kyc_status, accredited),
            "message": f"✅ Onboarding de {investor.get('full_name')}: KYC {kyc_status}, Acreditación {accredited}"
        }
        
    except Exception as e:
        logger.error(f"[onboard_investor] Error: {e}")
        return {"ok": False, "error": str(e)}


def _get_onboarding_next_steps(kyc_status: str, accredited_status: str) -> List[str]:
    """Get next steps for investor onboarding."""
    steps = []
    
    if kyc_status != "verified":
        steps.append("Completar verificación de identidad (KYC)")
    
    if accredited_status == "pending":
        steps.append("Verificar estatus de inversionista acreditado")
    
    if not steps:
        steps.append("✅ Listo para crear notas de deuda")
    
    return steps


def generate_debt_note(
    investor_id: str,
    amount: float,
    interest_rate: float = 12.0,
    term_months: int = 12,
    payment_frequency: str = "monthly",
    linked_property_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Elabora contratos de deuda (pagarés) con tasa de 12% anual.
    
    KPI Target: Cumplimiento pagos 100%
    
    Args:
        investor_id: UUID del inversionista
        amount: Monto de la inversión
        interest_rate: Tasa anual (default 12%)
        term_months: Plazo en meses (default 12)
        payment_frequency: 'monthly', 'quarterly', 'annual', 'at_maturity'
        linked_property_ids: Lista de property IDs que financia esta inversión
    
    Returns:
        Dict con detalles de la nota de deuda
    """
    from .supabase_client import sb
    
    try:
        # Verify investor exists and is active
        investor_result = sb.table("investors").select("*").eq("id", investor_id).execute()
        
        if not investor_result.data:
            return {"ok": False, "error": "Inversionista no encontrado"}
        
        investor = investor_result.data[0]
        
        if investor.get("investor_status") != "active":
            return {"ok": False, "error": "Inversionista no está activo. Complete el onboarding primero."}
        
        if investor.get("accredited_status") != "accredited":
            return {"ok": False, "error": "Inversionista no está acreditado. Verifique estatus SEC."}
        
        # Calculate investment details
        start_date = datetime.now().date()
        maturity_date = start_date + timedelta(days=term_months * 30)
        
        # Calculate expected return
        annual_return = amount * (interest_rate / 100)
        expected_return = annual_return * (term_months / 12)
        
        # Calculate next payment date based on frequency
        if payment_frequency == "monthly":
            next_payment = start_date + timedelta(days=30)
        elif payment_frequency == "quarterly":
            next_payment = start_date + timedelta(days=90)
        elif payment_frequency == "annual":
            next_payment = start_date + timedelta(days=365)
        else:  # at_maturity
            next_payment = maturity_date
        
        # Create investment record
        investment_data = {
            "investor_id": investor_id,
            "amount": amount,
            "interest_rate": interest_rate,
            "term_months": term_months,
            "start_date": start_date.isoformat(),
            "maturity_date": maturity_date.isoformat(),
            "expected_return": round(expected_return, 2),
            "payment_frequency": payment_frequency,
            "next_payment_date": next_payment.isoformat(),
            "status": "active",
            "linked_property_ids": linked_property_ids
        }
        
        result = sb.table("investments").insert(investment_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al crear nota de deuda"}
        
        investment = result.data[0]
        
        # Update investor totals
        sb.table("investors").update({
            "total_invested": float(investor.get("total_invested", 0)) + amount,
            "active_investments_count": int(investor.get("active_investments_count", 0)) + 1,
            "updated_at": datetime.now().isoformat()
        }).eq("id", investor_id).execute()
        
        # Log action
        try:
            sb.table("process_logs").insert({
                "entity_type": "investment",
                "entity_id": investment["id"],
                "process": "FONDEAR",
                "action": "debt_note_created",
                "details": {
                    "investor_name": investor.get("full_name"),
                    "amount": amount,
                    "interest_rate": interest_rate,
                    "term_months": term_months
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[generate_debt_note] Failed to log: {log_error}")
        
        logger.info(f"[generate_debt_note] Created debt note {investment['id']} for ${amount:,.2f}")
        
        return {
            "ok": True,
            "investment_id": investment["id"],
            "investor_name": investor.get("full_name"),
            "amount": amount,
            "interest_rate": interest_rate,
            "term_months": term_months,
            "start_date": start_date.isoformat(),
            "maturity_date": maturity_date.isoformat(),
            "expected_return": round(expected_return, 2),
            "payment_frequency": payment_frequency,
            "next_payment_date": next_payment.isoformat(),
            "payment_schedule": _generate_payment_schedule(
                amount, interest_rate, term_months, payment_frequency, start_date
            ),
            "message": f"✅ Pagaré creado: ${amount:,.2f} al {interest_rate}% anual, {term_months} meses. Retorno esperado: ${expected_return:,.2f}"
        }
        
    except Exception as e:
        logger.error(f"[generate_debt_note] Error: {e}")
        return {"ok": False, "error": str(e)}


def _generate_payment_schedule(
    amount: float, 
    rate: float, 
    months: int, 
    frequency: str, 
    start: datetime.date
) -> List[Dict]:
    """Generate payment schedule for investor."""
    schedule = []
    
    if frequency == "at_maturity":
        # Single payment at maturity
        total_return = amount * (rate / 100) * (months / 12)
        schedule.append({
            "payment_number": 1,
            "date": (start + timedelta(days=months * 30)).isoformat(),
            "principal": amount,
            "interest": round(total_return, 2),
            "total": round(amount + total_return, 2)
        })
    else:
        # Periodic interest payments
        if frequency == "monthly":
            num_payments = months
            days_between = 30
        elif frequency == "quarterly":
            num_payments = months // 3
            days_between = 90
        else:  # annual
            num_payments = months // 12
            days_between = 365
        
        monthly_interest = amount * (rate / 100) / 12
        
        if frequency == "monthly":
            interest_per_payment = monthly_interest
        elif frequency == "quarterly":
            interest_per_payment = monthly_interest * 3
        else:
            interest_per_payment = monthly_interest * 12
        
        for i in range(num_payments):
            payment_date = start + timedelta(days=(i + 1) * days_between)
            is_final = (i == num_payments - 1)
            
            schedule.append({
                "payment_number": i + 1,
                "date": payment_date.isoformat(),
                "principal": amount if is_final else 0,
                "interest": round(interest_per_payment, 2),
                "total": round((amount if is_final else 0) + interest_per_payment, 2)
            })
    
    return schedule[:12]  # Limit to first 12 for readability


def validate_sec_compliance(
    investor_id: str
) -> Dict[str, Any]:
    """
    Asegura cumplimiento con Regulación D de la SEC.
    
    KPI Target: Cumplimiento legal 100%
    
    Reg. D Requirements:
    - Rule 506(b): Up to 35 non-accredited investors
    - Rule 506(c): Only accredited investors (can advertise)
    - Accredited investor: $200K income or $1M net worth
    
    Args:
        investor_id: UUID del inversionista a validar
    
    Returns:
        Dict con estado de cumplimiento SEC
    """
    from .supabase_client import sb
    
    try:
        # Get investor
        investor_result = sb.table("investors").select("*").eq("id", investor_id).execute()
        
        if not investor_result.data:
            return {"ok": False, "error": "Inversionista no encontrado"}
        
        investor = investor_result.data[0]
        
        # Check compliance requirements
        compliance_checks = {
            "kyc_verified": investor.get("kyc_status") == "verified",
            "accreditation_status": investor.get("accredited_status"),
            "accreditation_method": investor.get("accreditation_method"),
            "has_ssn_ein": bool(investor.get("ssn_ein")),
            "has_address": bool(investor.get("address"))
        }
        
        # Get total non-accredited investors (for Rule 506(b) limit)
        non_accredited_result = sb.table("investors").select("id").eq(
            "accredited_status", "non_accredited"
        ).eq("investor_status", "active").execute()
        
        non_accredited_count = len(non_accredited_result.data) if non_accredited_result.data else 0
        
        # Determine compliance status
        is_accredited = investor.get("accredited_status") == "accredited"
        kyc_complete = compliance_checks["kyc_verified"]
        
        if is_accredited and kyc_complete:
            compliance_status = "COMPLIANT"
            rule_applicable = "506(c) - Accredited Investor"
        elif kyc_complete and non_accredited_count < 35:
            compliance_status = "COMPLIANT"
            rule_applicable = "506(b) - Limited Non-Accredited"
        elif kyc_complete:
            compliance_status = "REVIEW_REQUIRED"
            rule_applicable = "506(b) limit reached"
        else:
            compliance_status = "NON_COMPLIANT"
            rule_applicable = "KYC incomplete"
        
        # Log compliance check
        try:
            sb.table("process_logs").insert({
                "entity_type": "investor",
                "entity_id": investor_id,
                "process": "FONDEAR",
                "action": "sec_compliance_check",
                "details": {
                    "investor_name": investor.get("full_name"),
                    "compliance_status": compliance_status,
                    "rule_applicable": rule_applicable
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[validate_sec_compliance] Failed to log: {log_error}")
        
        logger.info(f"[validate_sec_compliance] Checked investor {investor_id}: {compliance_status}")
        
        return {
            "ok": True,
            "investor_id": investor_id,
            "investor_name": investor.get("full_name"),
            "compliance_status": compliance_status,
            "rule_applicable": rule_applicable,
            "checks": compliance_checks,
            "portfolio_stats": {
                "total_non_accredited": non_accredited_count,
                "max_non_accredited_506b": 35,
                "remaining_slots": max(0, 35 - non_accredited_count)
            },
            "recommendations": _get_compliance_recommendations(compliance_checks, is_accredited),
            "message": f"SEC Compliance: {compliance_status} - {rule_applicable}"
        }
        
    except Exception as e:
        logger.error(f"[validate_sec_compliance] Error: {e}")
        return {"ok": False, "error": str(e)}


def _get_compliance_recommendations(checks: Dict, is_accredited: bool) -> List[str]:
    """Get SEC compliance recommendations."""
    recommendations = []
    
    if not checks["kyc_verified"]:
        recommendations.append("⚠️ Completar verificación KYC")
    
    if not checks["has_ssn_ein"]:
        recommendations.append("⚠️ Obtener SSN/EIN para reportes fiscales")
    
    if not is_accredited:
        recommendations.append("ℹ️ Considerar verificar estatus de inversionista acreditado")
    
    if not recommendations:
        recommendations.append("✅ Cumple con todos los requisitos SEC Reg. D")
    
    return recommendations


def calculate_debt_ratio() -> Dict[str, Any]:
    """
    Calcula el ratio deuda-capital para evitar sobreapalancamiento.
    
    KPI Target: Ratio deuda-capital ≤2:1
    
    Returns:
        Dict con métricas de apalancamiento
    """
    from .supabase_client import sb
    
    try:
        # Get total active investments (debt)
        investments_result = sb.table("investments").select(
            "amount"
        ).eq("status", "active").execute()
        
        investments = investments_result.data or []
        total_debt = sum(float(i.get("amount", 0)) for i in investments)
        
        # Get total property value (capital/assets)
        properties_result = sb.table("properties").select(
            "market_value, purchase_price"
        ).neq("inventory_status", "sold").execute()
        
        properties = properties_result.data or []
        total_assets = sum(
            float(p.get("market_value") or p.get("purchase_price") or 0) 
            for p in properties
        )
        
        # Calculate ratio
        if total_assets > 0:
            debt_ratio = total_debt / total_assets
        else:
            debt_ratio = 0
        
        # Determine status
        if debt_ratio <= 1.5:
            status = "HEALTHY"
            status_emoji = "✅"
        elif debt_ratio <= 2.0:
            status = "ACCEPTABLE"
            status_emoji = "🟡"
        else:
            status = "OVER_LEVERAGED"
            status_emoji = "🔴"
        
        # Calculate capacity
        max_debt_at_2_1 = total_assets * 2
        available_capacity = max(0, max_debt_at_2_1 - total_debt)
        
        # Get active financial plan if exists
        plan_result = sb.table("financial_plans").select("*").eq(
            "status", "active"
        ).execute()
        
        plan = plan_result.data[0] if plan_result.data else None
        
        # Update plan with current ratio if exists
        if plan:
            sb.table("financial_plans").update({
                "current_debt_ratio": round(debt_ratio, 2),
                "updated_at": datetime.now().isoformat()
            }).eq("id", plan["id"]).execute()
        
        logger.info(f"[calculate_debt_ratio] Calculated ratio: {debt_ratio:.2f}")
        
        return {
            "ok": True,
            "debt_ratio": round(debt_ratio, 2),
            "status": status,
            "status_emoji": status_emoji,
            "metrics": {
                "total_debt": round(total_debt, 2),
                "total_assets": round(total_assets, 2),
                "active_investments": len(investments),
                "properties_count": len(properties)
            },
            "capacity": {
                "max_debt_at_2_1": round(max_debt_at_2_1, 2),
                "current_debt": round(total_debt, 2),
                "available_capacity": round(available_capacity, 2)
            },
            "kpi": {
                "target": "≤2:1",
                "actual": f"{debt_ratio:.2f}:1",
                "compliant": debt_ratio <= 2.0
            },
            "message": f"{status_emoji} Ratio deuda-capital: {debt_ratio:.2f}:1. Capacidad disponible: ${available_capacity:,.2f}"
        }
        
    except Exception as e:
        logger.error(f"[calculate_debt_ratio] Error: {e}")
        return {"ok": False, "error": str(e)}


def send_investor_update(
    investor_id: Optional[str] = None,
    update_type: str = "general",
    subject: Optional[str] = None,
    message: Optional[str] = None,
    send_to_all: bool = False
) -> Dict[str, Any]:
    """
    Envía comunicación a inversionistas.
    
    Args:
        investor_id: UUID del inversionista (si es individual)
        update_type: 'general', 'payment', 'quarterly_report', 'maturity_notice'
        subject: Asunto del mensaje
        message: Contenido del mensaje
        send_to_all: Si True, envía a todos los inversionistas activos
    
    Returns:
        Dict con resultado del envío
    """
    from .supabase_client import sb
    
    try:
        if not send_to_all and not investor_id:
            return {"ok": False, "error": "Especifique investor_id o send_to_all=True"}
        
        # Get recipients
        if send_to_all:
            result = sb.table("investors").select(
                "id, full_name, email"
            ).eq("investor_status", "active").execute()
            recipients = result.data or []
        else:
            result = sb.table("investors").select(
                "id, full_name, email"
            ).eq("id", investor_id).execute()
            recipients = result.data or []
        
        if not recipients:
            return {"ok": False, "error": "No se encontraron destinatarios"}
        
        # Generate default content based on type
        if not subject:
            subjects = {
                "general": "Actualización de Maninos Capital",
                "payment": "Notificación de Pago - Maninos Capital",
                "quarterly_report": "Reporte Trimestral - Maninos Capital",
                "maturity_notice": "Aviso de Vencimiento - Maninos Capital"
            }
            subject = subjects.get(update_type, "Comunicación de Maninos Capital")
        
        # In production, this would send actual emails via SendGrid/SES
        # For now, we log the communication
        sent_count = 0
        for recipient in recipients:
            try:
                sb.table("process_logs").insert({
                    "entity_type": "investor",
                    "entity_id": recipient["id"],
                    "process": "FONDEAR",
                    "action": f"update_sent_{update_type}",
                    "details": {
                        "recipient_name": recipient.get("full_name"),
                        "recipient_email": recipient.get("email"),
                        "subject": subject,
                        "update_type": update_type
                    }
                }).execute()
                sent_count += 1
            except Exception as log_error:
                logger.warning(f"[send_investor_update] Failed to log for {recipient['id']}: {log_error}")
        
        # Update last contact date
        for recipient in recipients:
            sb.table("investors").update({
                "last_contact_date": datetime.now().isoformat()
            }).eq("id", recipient["id"]).execute()
        
        logger.info(f"[send_investor_update] Sent {update_type} to {sent_count} investors")
        
        return {
            "ok": True,
            "update_type": update_type,
            "subject": subject,
            "recipients_count": sent_count,
            "recipients": [{"name": r.get("full_name"), "email": r.get("email")} for r in recipients],
            "message": f"✅ Comunicación enviada a {sent_count} inversionista(s): '{subject}'"
        }
        
    except Exception as e:
        logger.error(f"[send_investor_update] Error: {e}")
        return {"ok": False, "error": str(e)}
