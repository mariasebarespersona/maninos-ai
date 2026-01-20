"""
Comercializar Tools - Herramientas para el proceso COMERCIALIZAR

Según el Excel del cliente, COMERCIALIZAR tiene 7 procedimientos:
1. Adquirir activos - create_acquisition_committee_record
2. Finiquitar activos - process_disbursement
3. Promover activos - promote_property_listing
4. Evaluar crédito y determinar riesgo - evaluate_credit_risk
5. Formalizar venta - formalize_sale
6. Administrar cartera y recuperar - manage_portfolio_recovery
7. Fidelizar - process_loyalty_program
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date
import json

logger = logging.getLogger(__name__)


# ============================================================================
# HERRAMIENTA 1: create_acquisition_committee_record
# Procedimiento: Adquirir activos (Operaciones)
# ============================================================================

def create_acquisition_committee_record(
    property_id: str,
    committee_date: str,
    market_analysis: str,
    technical_analysis: str,
    legal_analysis: str,
    financial_analysis: str,
    inspection_certified: bool,
    roi_projected: float,
    recommendation: str,  # "aprobar", "rechazar", "revisar"
    committee_members: List[str],
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crea un acta de comité para la adquisición de un activo.
    
    Procedimiento 1 del Excel: Identificación de mercados, análisis técnico,
    legal y financiero del activo, inspección certificada y autorización de compra.
    
    Formato: Checklist técnico, expediente del activo, acta de comité
    KPI: % activos con expediente completo, ROI proyectado vs real
    
    Args:
        property_id: UUID de la propiedad
        committee_date: Fecha del comité (YYYY-MM-DD)
        market_analysis: Resumen del análisis de mercado
        technical_analysis: Resumen del análisis técnico
        legal_analysis: Resumen del análisis legal
        financial_analysis: Resumen del análisis financiero
        inspection_certified: Si la inspección está certificada
        roi_projected: ROI proyectado (%)
        recommendation: Recomendación del comité
        committee_members: Lista de miembros del comité
        notes: Notas adicionales
    
    Returns:
        Dict con el acta de comité creada
    """
    from .supabase_client import sb
    
    try:
        # Verify property exists
        prop_result = sb.table("properties").select("id, name, address, purchase_price, market_value").eq("id", property_id).execute()
        
        if not prop_result.data:
            return {"ok": False, "error": "Propiedad no encontrada"}
        
        prop = prop_result.data[0]
        
        # Create committee record
        committee_record = {
            "entity_type": "property",
            "entity_id": property_id,
            "process": "COMERCIALIZAR",
            "action": "acquisition_committee",
            "details": {
                "committee_date": committee_date,
                "property_name": prop.get("name"),
                "property_address": prop.get("address"),
                "market_analysis": market_analysis,
                "technical_analysis": technical_analysis,
                "legal_analysis": legal_analysis,
                "financial_analysis": financial_analysis,
                "inspection_certified": inspection_certified,
                "roi_projected": roi_projected,
                "recommendation": recommendation,
                "committee_members": committee_members,
                "notes": notes,
                "purchase_price": prop.get("purchase_price"),
                "market_value": prop.get("market_value")
            }
        }
        
        result = sb.table("process_logs").insert(committee_record).execute()
        
        # Update property status if approved
        if recommendation == "aprobar":
            sb.table("properties").update({
                "acquisition_stage": "comite_aprobado",
                "updated_at": datetime.now().isoformat()
            }).eq("id", property_id).execute()
        
        logger.info(f"[create_acquisition_committee_record] Committee record created for property {property_id}")
        
        return {
            "ok": True,
            "property_id": property_id,
            "property_name": prop.get("name"),
            "committee_date": committee_date,
            "recommendation": recommendation,
            "roi_projected": roi_projected,
            "inspection_certified": inspection_certified,
            "message": f"Acta de comité creada. Recomendación: {recommendation.upper()}"
        }
        
    except Exception as e:
        logger.error(f"[create_acquisition_committee_record] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 2: process_disbursement
# Procedimiento: Finiquitar activos (Tesorería)
# ============================================================================

def process_disbursement(
    property_id: str,
    amount: float,
    disbursement_type: str,  # "compra", "reparacion", "legal", "otro"
    payment_method: str,  # "transferencia", "cheque", "wire"
    authorized_by: str,
    bank_account: Optional[str] = None,
    reference_number: Optional[str] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Procesa un desembolso para finiquitar la adquisición de un activo.
    
    Procedimiento 2 del Excel: Autorización final, ejecución del desembolso,
    registro contable y conciliación.
    
    Formato: Solicitud de desembolso
    KPI: Errores en desembolso, Conciliaciones correctas
    
    Args:
        property_id: UUID de la propiedad
        amount: Monto del desembolso
        disbursement_type: Tipo de desembolso
        payment_method: Método de pago
        authorized_by: Nombre de quien autoriza
        bank_account: Cuenta bancaria destino (opcional)
        reference_number: Número de referencia (opcional)
        notes: Notas adicionales
    
    Returns:
        Dict con confirmación del desembolso
    """
    from .supabase_client import sb
    
    try:
        # Verify property exists
        prop_result = sb.table("properties").select("id, name, purchase_price").eq("id", property_id).execute()
        
        if not prop_result.data:
            return {"ok": False, "error": "Propiedad no encontrada"}
        
        prop = prop_result.data[0]
        
        # Create disbursement record
        disbursement_record = {
            "entity_type": "property",
            "entity_id": property_id,
            "process": "COMERCIALIZAR",
            "action": "disbursement",
            "details": {
                "amount": amount,
                "disbursement_type": disbursement_type,
                "payment_method": payment_method,
                "authorized_by": authorized_by,
                "bank_account": bank_account,
                "reference_number": reference_number,
                "notes": notes,
                "disbursement_date": datetime.now().isoformat(),
                "status": "completado"
            }
        }
        
        result = sb.table("process_logs").insert(disbursement_record).execute()
        
        # Update property if this is a purchase disbursement
        if disbursement_type == "compra":
            sb.table("properties").update({
                "acquisition_stage": "finiquitado",
                "status": "owned",
                "updated_at": datetime.now().isoformat()
            }).eq("id", property_id).execute()
        
        logger.info(f"[process_disbursement] Disbursement of ${amount:,.2f} processed for property {property_id}")
        
        return {
            "ok": True,
            "property_id": property_id,
            "property_name": prop.get("name"),
            "amount": amount,
            "disbursement_type": disbursement_type,
            "payment_method": payment_method,
            "authorized_by": authorized_by,
            "reference_number": reference_number,
            "message": f"Desembolso de ${amount:,.2f} procesado exitosamente"
        }
        
    except Exception as e:
        logger.error(f"[process_disbursement] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 3: promote_property_listing
# Procedimiento: Promover activos (Promotor)
# ============================================================================

def promote_property_listing(
    property_id: Optional[str] = None,
    client_name: Optional[str] = None,
    client_email: Optional[str] = None,
    client_phone: Optional[str] = None,
    documents_received: Optional[List[str]] = None,
    identity_validated: bool = False,
    income_validated: bool = False,
    references_validated: bool = False,
    create_credit_application: bool = False
) -> Dict[str, Any]:
    """
    Promueve activos y gestiona solicitudes de crédito entrantes.
    
    Procedimiento 3 del Excel: Recepción de solicitud, integración de documentos,
    validación de identidad, ingresos y referencias.
    
    Formato: Solicitud de crédito
    KPI: % solicitudes completas, Tiempo de integración
    
    Args:
        property_id: UUID de la propiedad de interés (opcional)
        client_name: Nombre del cliente
        client_email: Email del cliente
        client_phone: Teléfono del cliente
        documents_received: Lista de documentos recibidos
        identity_validated: Si la identidad fue validada
        income_validated: Si los ingresos fueron validados
        references_validated: Si las referencias fueron validadas
        create_credit_application: Si crear solicitud de crédito
    
    Returns:
        Dict con estado de la promoción/solicitud
    """
    from .supabase_client import sb
    
    try:
        result_data = {
            "ok": True,
            "actions_taken": []
        }
        
        # If property_id provided, update listing status
        if property_id:
            prop_result = sb.table("properties").select("id, name, listing_active").eq("id", property_id).execute()
            
            if prop_result.data:
                prop = prop_result.data[0]
                
                # Activate listing if not active
                if not prop.get("listing_active"):
                    sb.table("properties").update({
                        "listing_active": True,
                        "inventory_status": "available",
                        "updated_at": datetime.now().isoformat()
                    }).eq("id", property_id).execute()
                    result_data["actions_taken"].append(f"Propiedad '{prop.get('name')}' activada en catálogo")
                
                result_data["property_id"] = property_id
                result_data["property_name"] = prop.get("name")
        
        # If client info provided, create or update lead
        if client_name and client_email:
            # Check if client exists
            existing = sb.table("clients").select("id").eq("email", client_email).execute()
            
            if existing.data:
                client_id = existing.data[0]["id"]
                # Update validation status
                update_data = {"updated_at": datetime.now().isoformat()}
                if identity_validated:
                    update_data["kyc_status"] = "identity_verified"
                
                sb.table("clients").update(update_data).eq("id", client_id).execute()
                result_data["actions_taken"].append(f"Cliente {client_name} actualizado")
                result_data["client_id"] = client_id
                result_data["is_new_client"] = False
            else:
                # Create new client
                new_client = {
                    "full_name": client_name,
                    "email": client_email,
                    "phone": client_phone,
                    "kyc_status": "pending",
                    "process_stage": "solicitud_recibida"
                }
                
                client_result = sb.table("clients").insert(new_client).execute()
                if client_result.data:
                    client_id = client_result.data[0]["id"]
                    result_data["actions_taken"].append(f"Cliente {client_name} creado")
                    result_data["client_id"] = client_id
                    result_data["is_new_client"] = True
            
            # Log the credit application if requested
            if create_credit_application and 'client_id' in result_data:
                sb.table("process_logs").insert({
                    "entity_type": "client",
                    "entity_id": result_data["client_id"],
                    "process": "COMERCIALIZAR",
                    "action": "credit_application_received",
                    "details": {
                        "documents_received": documents_received or [],
                        "identity_validated": identity_validated,
                        "income_validated": income_validated,
                        "references_validated": references_validated,
                        "property_of_interest": property_id
                    }
                }).execute()
                result_data["actions_taken"].append("Solicitud de crédito registrada")
        
        # Calculate completion percentage
        validations = [identity_validated, income_validated, references_validated]
        completion_pct = (sum(validations) / len(validations)) * 100 if validations else 0
        result_data["validation_completion"] = f"{completion_pct:.0f}%"
        
        result_data["message"] = f"Promoción procesada. Acciones: {len(result_data['actions_taken'])}"
        
        logger.info(f"[promote_property_listing] Actions taken: {result_data['actions_taken']}")
        
        return result_data
        
    except Exception as e:
        logger.error(f"[promote_property_listing] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 4: evaluate_credit_risk
# Procedimiento: Evaluar crédito y determinar riesgo (Analista Crédito)
# ============================================================================

def evaluate_credit_risk(
    client_id: str,
    monthly_income: float,
    monthly_expenses: float,
    monthly_debt: float,
    credit_score: Optional[int] = None,
    credit_bureau_consulted: bool = False,
    employment_years: Optional[float] = None,
    property_id: Optional[str] = None,
    desired_monthly_payment: Optional[float] = None
) -> Dict[str, Any]:
    """
    Evalúa el riesgo crediticio de un cliente y genera dictamen.
    
    Procedimiento 4 del Excel: Consulta de buró, cálculo de capacidad de pago,
    análisis de riesgo y elaboración de dictamen.
    
    Formato: Dictamen crediticio y minutas de comité
    KPI: Tasa de aprobación, Morosidad temprana
    
    Args:
        client_id: UUID del cliente
        monthly_income: Ingreso mensual bruto
        monthly_expenses: Gastos mensuales fijos
        monthly_debt: Deudas mensuales actuales
        credit_score: Puntaje de crédito (opcional)
        credit_bureau_consulted: Si se consultó buró
        employment_years: Años en empleo actual (opcional)
        property_id: UUID de propiedad de interés (opcional)
        desired_monthly_payment: Pago mensual deseado (opcional)
    
    Returns:
        Dict con dictamen crediticio completo
    """
    from .supabase_client import sb
    
    try:
        # Verify client exists
        client_result = sb.table("clients").select("id, full_name, email").eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        
        # Calculate DTI (Debt-to-Income)
        if monthly_income <= 0:
            return {"ok": False, "error": "El ingreso mensual debe ser mayor a 0"}
        
        current_dti = ((monthly_debt + monthly_expenses) / monthly_income) * 100
        
        # Calculate payment capacity
        max_dti = 43.0  # Standard DTI limit
        available_for_payment = (max_dti / 100 * monthly_income) - monthly_debt - monthly_expenses
        available_for_payment = max(0, available_for_payment)
        
        # Risk factors
        risk_factors = []
        risk_score = 0
        
        # DTI risk
        if current_dti > 50:
            risk_factors.append("DTI muy alto (>50%)")
            risk_score += 30
        elif current_dti > 43:
            risk_factors.append("DTI alto (>43%)")
            risk_score += 20
        elif current_dti > 35:
            risk_factors.append("DTI moderado (>35%)")
            risk_score += 10
        
        # Credit score risk
        if credit_score:
            if credit_score < 580:
                risk_factors.append("Puntaje de crédito bajo (<580)")
                risk_score += 30
            elif credit_score < 620:
                risk_factors.append("Puntaje de crédito regular (580-620)")
                risk_score += 20
            elif credit_score < 680:
                risk_factors.append("Puntaje de crédito aceptable (620-680)")
                risk_score += 10
        else:
            risk_factors.append("Sin puntaje de crédito disponible")
            risk_score += 15
        
        # Employment stability
        if employment_years:
            if employment_years < 1:
                risk_factors.append("Empleo reciente (<1 año)")
                risk_score += 15
            elif employment_years < 2:
                risk_factors.append("Empleo relativamente nuevo (1-2 años)")
                risk_score += 5
        
        # Determine recommendation
        if risk_score <= 20 and current_dti <= 43:
            recommendation = "APROBAR"
            risk_level = "bajo"
        elif risk_score <= 40 and current_dti <= 50:
            recommendation = "APROBAR CON CONDICIONES"
            risk_level = "moderado"
        else:
            recommendation = "RECHAZAR"
            risk_level = "alto"
        
        # Check if can afford desired payment
        can_afford_desired = None
        if desired_monthly_payment:
            new_dti = ((monthly_debt + monthly_expenses + desired_monthly_payment) / monthly_income) * 100
            can_afford_desired = new_dti <= max_dti
        
        # Create dictamen (credit decision document)
        dictamen = {
            "client_id": client_id,
            "client_name": client["full_name"],
            "evaluation_date": datetime.now().isoformat(),
            "financial_summary": {
                "monthly_income": monthly_income,
                "monthly_expenses": monthly_expenses,
                "monthly_debt": monthly_debt,
                "current_dti": round(current_dti, 2),
                "max_dti_allowed": max_dti,
                "payment_capacity": round(available_for_payment, 2)
            },
            "credit_info": {
                "credit_score": credit_score,
                "bureau_consulted": credit_bureau_consulted,
                "employment_years": employment_years
            },
            "risk_assessment": {
                "risk_score": risk_score,
                "risk_level": risk_level,
                "risk_factors": risk_factors
            },
            "recommendation": recommendation
        }
        
        # Log the credit evaluation
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "COMERCIALIZAR",
            "action": "credit_evaluation",
            "details": dictamen
        }).execute()
        
        # Update client with DTI score and risk profile
        sb.table("clients").update({
            "dti_score": round(current_dti, 2),
            "risk_profile": risk_level,
            "updated_at": datetime.now().isoformat()
        }).eq("id", client_id).execute()
        
        logger.info(f"[evaluate_credit_risk] Evaluated client {client_id}: {recommendation}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "dti": round(current_dti, 2),
            "payment_capacity": round(available_for_payment, 2),
            "risk_level": risk_level,
            "risk_score": risk_score,
            "risk_factors": risk_factors,
            "recommendation": recommendation,
            "can_afford_desired": can_afford_desired,
            "dictamen": dictamen,
            "message": f"Dictamen: {recommendation}. DTI: {current_dti:.1f}%. Riesgo: {risk_level}"
        }
        
    except Exception as e:
        logger.error(f"[evaluate_credit_risk] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 5: formalize_sale
# Procedimiento: Formalizar venta (Operaciones)
# ============================================================================

def formalize_sale(
    client_id: str,
    property_id: str,
    contract_type: str,  # "rto_24", "rto_36", "rto_48", "compra_directa"
    monthly_payment: float,
    down_payment: float,
    purchase_price: float,
    legal_validation_complete: bool = False,
    expediente_complete: bool = False,
    checklist_items: Optional[Dict[str, bool]] = None
) -> Dict[str, Any]:
    """
    Formaliza una venta creando el contrato y validando el expediente.
    
    Procedimiento 5 del Excel: Elaboración de contrato, validación legal,
    verificación de expediente completo y autorización final.
    
    Formato: Contrato estandarizado, checklist mesa de control
    KPI: % expedientes sin observaciones, Tiempo de formalización
    
    Args:
        client_id: UUID del cliente
        property_id: UUID de la propiedad
        contract_type: Tipo de contrato
        monthly_payment: Pago mensual
        down_payment: Enganche
        purchase_price: Precio de compra
        legal_validation_complete: Si la validación legal está completa
        expediente_complete: Si el expediente está completo
        checklist_items: Items del checklist de mesa de control
    
    Returns:
        Dict con resultado de la formalización
    """
    from .supabase_client import sb
    
    try:
        # Verify client and property exist
        client_result = sb.table("clients").select("id, full_name, email, kyc_status").eq("id", client_id).execute()
        prop_result = sb.table("properties").select("id, name, address").eq("id", property_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        if not prop_result.data:
            return {"ok": False, "error": "Propiedad no encontrada"}
        
        client = client_result.data[0]
        prop = prop_result.data[0]
        
        # Default checklist if not provided
        if not checklist_items:
            checklist_items = {
                "identidad_verificada": client.get("kyc_status") == "verified",
                "ingresos_validados": False,
                "referencias_contactadas": False,
                "documentos_completos": expediente_complete,
                "validacion_legal": legal_validation_complete,
                "propiedad_disponible": True,
                "precio_acordado": True,
                "enganche_recibido": False
            }
        
        # Calculate checklist completion
        total_items = len(checklist_items)
        completed_items = sum(1 for v in checklist_items.values() if v)
        completion_pct = (completed_items / total_items) * 100 if total_items > 0 else 0
        
        # Determine contract term in months
        term_months = {
            "rto_24": 24,
            "rto_36": 36,
            "rto_48": 48,
            "compra_directa": 0
        }.get(contract_type, 36)
        
        # Calculate dates
        start_date = date.today()
        if term_months > 0:
            end_date = date(start_date.year + (term_months // 12), 
                          start_date.month + (term_months % 12) if start_date.month + (term_months % 12) <= 12 else (start_date.month + term_months % 12) - 12,
                          start_date.day)
        else:
            end_date = start_date
        
        # Create or check for existing contract
        existing_contract = sb.table("rto_contracts").select("id").eq("client_id", client_id).eq("property_id", property_id).eq("status", "draft").execute()
        
        contract_data = {
            "client_id": client_id,
            "property_id": property_id,
            "lease_term_months": term_months,
            "monthly_rent": monthly_payment,
            "down_payment": down_payment,
            "purchase_option_price": purchase_price,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "status": "draft" if not (legal_validation_complete and expediente_complete) else "ready_to_sign",
            "updated_at": datetime.now().isoformat()
        }
        
        if existing_contract.data:
            # Update existing draft
            contract_id = existing_contract.data[0]["id"]
            sb.table("rto_contracts").update(contract_data).eq("id", contract_id).execute()
        else:
            # Create new contract
            result = sb.table("rto_contracts").insert(contract_data).execute()
            contract_id = result.data[0]["id"] if result.data else None
        
        # Log formalization
        sb.table("process_logs").insert({
            "entity_type": "contract",
            "entity_id": contract_id,
            "process": "COMERCIALIZAR",
            "action": "sale_formalized",
            "details": {
                "client_id": client_id,
                "property_id": property_id,
                "contract_type": contract_type,
                "checklist": checklist_items,
                "completion_pct": completion_pct,
                "legal_validation": legal_validation_complete,
                "expediente_complete": expediente_complete
            }
        }).execute()
        
        # Update property status
        sb.table("properties").update({
            "inventory_status": "reserved",
            "assigned_client_id": client_id,
            "updated_at": datetime.now().isoformat()
        }).eq("id", property_id).execute()
        
        logger.info(f"[formalize_sale] Sale formalized: client {client_id}, property {property_id}")
        
        observations = [k for k, v in checklist_items.items() if not v]
        
        return {
            "ok": True,
            "contract_id": contract_id,
            "client_id": client_id,
            "client_name": client["full_name"],
            "property_id": property_id,
            "property_name": prop["name"],
            "contract_type": contract_type,
            "term_months": term_months,
            "monthly_payment": monthly_payment,
            "down_payment": down_payment,
            "purchase_price": purchase_price,
            "checklist_completion": f"{completion_pct:.0f}%",
            "observations": observations,
            "status": contract_data["status"],
            "message": f"Venta formalizada. Expediente: {completion_pct:.0f}% completo. Observaciones: {len(observations)}"
        }
        
    except Exception as e:
        logger.error(f"[formalize_sale] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 6: manage_portfolio_recovery
# Procedimiento: Administrar cartera y recuperar (CxC)
# ============================================================================

def manage_portfolio_recovery(
    action: str,  # "classify", "collect", "recover", "report"
    contract_id: Optional[str] = None,
    client_id: Optional[str] = None,
    days_overdue: Optional[int] = None,
    collection_action: Optional[str] = None,  # "llamada", "email", "visita", "legal"
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Administra la cartera de contratos y gestiona la recuperación de pagos.
    
    Procedimiento 6 del Excel: Cobro automatizado, clasificación de cartera
    (preventiva, adm., extrajud., jud.), gestión de recuperación.
    
    Formato: Bitácoras, clasificación de cartera
    KPI: Cartera vencida, Tasa de recuperación
    
    Args:
        action: Acción a realizar (classify, collect, recover, report)
        contract_id: UUID del contrato (para acciones específicas)
        client_id: UUID del cliente (para acciones específicas)
        days_overdue: Días de atraso
        collection_action: Tipo de acción de cobranza
        notes: Notas de la gestión
    
    Returns:
        Dict con resultado de la gestión
    """
    from .supabase_client import sb
    
    try:
        result_data = {"ok": True, "action": action}
        
        if action == "classify":
            # Classify all contracts by delinquency status
            contracts = sb.table("rto_contracts").select(
                "id, client_id, status, monthly_rent"
            ).eq("status", "active").execute()
            
            if not contracts.data:
                return {"ok": True, "message": "No hay contratos activos", "classification": {}}
            
            # Get payments and classify
            classification = {
                "al_dia": [],
                "preventivo": [],      # 1-5 días
                "administrativo": [],  # 6-30 días
                "extrajudicial": [],   # 31-60 días
                "judicial": []         # >60 días
            }
            
            for contract in contracts.data:
                # Get latest payment status
                payments = sb.table("payments").select(
                    "id, due_date, paid_date, status"
                ).eq("rto_contract_id", contract["id"]).order("due_date", desc=True).limit(1).execute()
                
                if payments.data:
                    payment = payments.data[0]
                    if payment["status"] == "paid":
                        classification["al_dia"].append(contract["id"])
                    elif payment["status"] in ["pending", "late"]:
                        # Calculate days overdue
                        due_date = datetime.fromisoformat(payment["due_date"])
                        days_late = (datetime.now().date() - due_date.date()).days
                        
                        if days_late <= 0:
                            classification["al_dia"].append(contract["id"])
                        elif days_late <= 5:
                            classification["preventivo"].append(contract["id"])
                        elif days_late <= 30:
                            classification["administrativo"].append(contract["id"])
                        elif days_late <= 60:
                            classification["extrajudicial"].append(contract["id"])
                        else:
                            classification["judicial"].append(contract["id"])
                else:
                    classification["al_dia"].append(contract["id"])
            
            total = len(contracts.data)
            delinquent = total - len(classification["al_dia"])
            
            result_data["classification"] = {k: len(v) for k, v in classification.items()}
            result_data["total_contracts"] = total
            result_data["delinquent_count"] = delinquent
            result_data["delinquency_rate"] = f"{(delinquent/total)*100:.1f}%" if total > 0 else "0%"
            result_data["message"] = f"Cartera clasificada. {delinquent} de {total} contratos con atraso"
            
        elif action == "collect" and contract_id:
            # Register collection action
            sb.table("process_logs").insert({
                "entity_type": "contract",
                "entity_id": contract_id,
                "process": "COMERCIALIZAR",
                "action": "collection_attempt",
                "details": {
                    "collection_action": collection_action,
                    "days_overdue": days_overdue,
                    "notes": notes,
                    "timestamp": datetime.now().isoformat()
                }
            }).execute()
            
            result_data["contract_id"] = contract_id
            result_data["collection_action"] = collection_action
            result_data["message"] = f"Acción de cobranza '{collection_action}' registrada"
            
        elif action == "recover" and contract_id:
            # Register recovery action (payment arrangement, etc.)
            sb.table("process_logs").insert({
                "entity_type": "contract",
                "entity_id": contract_id,
                "process": "COMERCIALIZAR",
                "action": "recovery_action",
                "details": {
                    "recovery_type": collection_action,
                    "notes": notes,
                    "timestamp": datetime.now().isoformat()
                }
            }).execute()
            
            result_data["contract_id"] = contract_id
            result_data["message"] = f"Acción de recuperación registrada"
            
        elif action == "report":
            # Generate portfolio report
            contracts = sb.table("rto_contracts").select("id, status, monthly_rent").execute()
            
            total_contracts = len(contracts.data) if contracts.data else 0
            active = sum(1 for c in contracts.data if c["status"] == "active") if contracts.data else 0
            total_monthly = sum(c["monthly_rent"] for c in contracts.data if c["status"] == "active" and c["monthly_rent"]) if contracts.data else 0
            
            result_data["report"] = {
                "total_contracts": total_contracts,
                "active_contracts": active,
                "total_monthly_revenue": total_monthly,
                "report_date": datetime.now().isoformat()
            }
            result_data["message"] = f"Reporte generado. {active} contratos activos, ${total_monthly:,.2f}/mes"
        
        else:
            return {"ok": False, "error": f"Acción '{action}' no reconocida o faltan parámetros"}
        
        logger.info(f"[manage_portfolio_recovery] Action: {action}")
        
        return result_data
        
    except Exception as e:
        logger.error(f"[manage_portfolio_recovery] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 7: process_loyalty_program
# Procedimiento: Fidelizar (Promotor)
# ============================================================================

def process_loyalty_program(
    action: str,  # "final_inspection", "title_transfer", "tax_report", "referral", "recompra"
    client_id: str,
    contract_id: Optional[str] = None,
    property_id: Optional[str] = None,
    referral_client_name: Optional[str] = None,
    referral_client_email: Optional[str] = None,
    referral_bonus: Optional[float] = None,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Gestiona el programa de fidelización: inspección final, transferencia de título,
    reportes fiscales y programas de recompra o referidos.
    
    Procedimiento 7 del Excel: Inspección final, transferencia de título,
    reportes fiscales y programas de recompra o referidos.
    
    Formato: TDHCA, IRS 1099-S
    KPI: NPS, % recompra/upgrade
    
    Args:
        action: Acción a realizar
        client_id: UUID del cliente
        contract_id: UUID del contrato (opcional)
        property_id: UUID de la propiedad (opcional)
        referral_client_name: Nombre del cliente referido (para acción referral)
        referral_client_email: Email del cliente referido
        referral_bonus: Monto del bono de referido
        notes: Notas adicionales
    
    Returns:
        Dict con resultado de la acción de fidelización
    """
    from .supabase_client import sb
    
    try:
        # Verify client exists
        client_result = sb.table("clients").select("id, full_name, email, referral_code").eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        result_data = {"ok": True, "action": action, "client_id": client_id, "client_name": client["full_name"]}
        
        if action == "final_inspection":
            # Log final inspection
            sb.table("process_logs").insert({
                "entity_type": "contract",
                "entity_id": contract_id,
                "process": "COMERCIALIZAR",
                "action": "final_inspection",
                "details": {
                    "client_id": client_id,
                    "property_id": property_id,
                    "inspection_date": datetime.now().isoformat(),
                    "notes": notes
                }
            }).execute()
            
            result_data["message"] = "Inspección final registrada"
            
        elif action == "title_transfer":
            # Generate TDHCA document info
            if not property_id:
                return {"ok": False, "error": "Se requiere property_id para transferencia de título"}
            
            prop_result = sb.table("properties").select("*").eq("id", property_id).execute()
            if not prop_result.data:
                return {"ok": False, "error": "Propiedad no encontrada"}
            
            prop = prop_result.data[0]
            
            tdhca_data = {
                "document_type": "TDHCA_TITLE_TRANSFER",
                "client_name": client["full_name"],
                "property_address": prop.get("address"),
                "hud_number": prop.get("hud_number"),
                "property_year": prop.get("year_built"),
                "transfer_date": datetime.now().isoformat(),
                "status": "ready_to_submit"
            }
            
            # Log title transfer
            sb.table("process_logs").insert({
                "entity_type": "property",
                "entity_id": property_id,
                "process": "COMERCIALIZAR",
                "action": "title_transfer",
                "details": {
                    "client_id": client_id,
                    "contract_id": contract_id,
                    "tdhca_data": tdhca_data
                }
            }).execute()
            
            # Update property status
            sb.table("properties").update({
                "inventory_status": "sold",
                "updated_at": datetime.now().isoformat()
            }).eq("id", property_id).execute()
            
            # Update contract status
            if contract_id:
                sb.table("rto_contracts").update({
                    "status": "completed",
                    "updated_at": datetime.now().isoformat()
                }).eq("id", contract_id).execute()
            
            result_data["tdhca_data"] = tdhca_data
            result_data["message"] = "Transferencia de título procesada. Documento TDHCA listo para enviar"
            
        elif action == "tax_report":
            # Generate IRS 1099-S info
            irs_data = {
                "document_type": "IRS_1099_S",
                "client_name": client["full_name"],
                "tax_year": datetime.now().year,
                "property_id": property_id,
                "status": "ready_to_generate"
            }
            
            sb.table("process_logs").insert({
                "entity_type": "client",
                "entity_id": client_id,
                "process": "COMERCIALIZAR",
                "action": "tax_report_generated",
                "details": irs_data
            }).execute()
            
            result_data["irs_data"] = irs_data
            result_data["message"] = "Reporte fiscal IRS 1099-S preparado"
            
        elif action == "referral":
            # Process referral
            if not referral_client_name or not referral_client_email:
                return {"ok": False, "error": "Se requiere nombre y email del referido"}
            
            # Create new client from referral
            referral_data = {
                "full_name": referral_client_name,
                "email": referral_client_email,
                "referred_by": client_id,
                "kyc_status": "pending",
                "process_stage": "referido"
            }
            
            new_client = sb.table("clients").insert(referral_data).execute()
            
            # Log referral
            sb.table("process_logs").insert({
                "entity_type": "client",
                "entity_id": client_id,
                "process": "COMERCIALIZAR",
                "action": "referral_submitted",
                "details": {
                    "referred_client_id": new_client.data[0]["id"] if new_client.data else None,
                    "referred_name": referral_client_name,
                    "bonus": referral_bonus
                }
            }).execute()
            
            result_data["referred_client_id"] = new_client.data[0]["id"] if new_client.data else None
            result_data["referral_bonus"] = referral_bonus
            result_data["message"] = f"Referido '{referral_client_name}' registrado. Bono: ${referral_bonus or 0:,.2f}"
            
        elif action == "recompra":
            # Log recompra/upgrade interest
            sb.table("process_logs").insert({
                "entity_type": "client",
                "entity_id": client_id,
                "process": "COMERCIALIZAR",
                "action": "recompra_interest",
                "details": {
                    "current_contract_id": contract_id,
                    "current_property_id": property_id,
                    "notes": notes
                }
            }).execute()
            
            result_data["message"] = "Interés en recompra/upgrade registrado"
        
        else:
            return {"ok": False, "error": f"Acción '{action}' no reconocida"}
        
        logger.info(f"[process_loyalty_program] Action: {action} for client {client_id}")
        
        return result_data
        
    except Exception as e:
        logger.error(f"[process_loyalty_program] Error: {e}")
        return {"ok": False, "error": str(e)}
