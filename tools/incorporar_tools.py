"""
Incorporar Tools - Herramientas para el proceso INCORPORAR

Según el Excel del cliente, INCORPORAR tiene 5 procedimientos:
1. Perfilar cliente - create_client_profile (Anexo 1)
2. Verificar identidad (KYC) - verify_client_kyc
3. Evaluar aspectos financieros (DTI) - calculate_client_dti
4. Personalizar contrato - generate_rto_contract (Anexo 3)
5. Comunicar y dar seguimiento - send_client_update
"""

import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, date
from dateutil.relativedelta import relativedelta

logger = logging.getLogger(__name__)


# ============================================================================
# CAMPOS DEL ANEXO 1 (Solicitud de Crédito)
# ============================================================================

ANEXO_1_FIELDS = {
    "info_solicitante": [
        "full_name", "date_of_birth", "ssn_itin", "marital_status",
        "phone", "email", "address", "city", "state", "zip_code", "residence_type"
    ],
    "info_laboral": [
        "employer", "occupation", "employer_address", "employer_phone",
        "monthly_income", "years_at_employer", "months_at_employer",
        "other_income_source", "other_income_amount"
    ],
    "credito_solicitado": [
        "credit_requested_amount", "credit_purpose", "desired_term_years",
        "desired_term_months", "preferred_payment_method"
    ],
    "referencias": [
        "reference1_name", "reference1_phone", "reference1_relationship",
        "reference2_name", "reference2_phone", "reference2_relationship"
    ],
    "autorizacion": [
        "applicant_signature", "signature_date", "authorize_credit_check"
    ]
}


# ============================================================================
# HERRAMIENTA 0: get_client_info (CONSULTA)
# Permite consultar información de un cliente existente
# ============================================================================

def get_client_info(
    client_id: Optional[str] = None,
    email: Optional[str] = None,
    phone: Optional[str] = None,
    full_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Consulta información de un cliente existente.
    
    Puede buscar por ID, email, teléfono o nombre.
    
    Args:
        client_id: UUID del cliente (búsqueda exacta)
        email: Email del cliente (búsqueda exacta)
        phone: Teléfono del cliente (búsqueda exacta)
        full_name: Nombre del cliente (búsqueda parcial)
    
    Returns:
        Dict con información del cliente o lista de clientes encontrados
    """
    from .supabase_client import sb
    
    try:
        query = sb.table("clients").select("*")
        
        if client_id:
            query = query.eq("id", client_id)
        elif email:
            query = query.eq("email", email)
        elif phone:
            query = query.eq("phone", phone)
        elif full_name:
            query = query.ilike("full_name", f"%{full_name}%")
        else:
            # Return recent clients if no filter
            query = query.order("created_at", desc=True).limit(10)
        
        result = query.execute()
        
        if not result.data:
            return {
                "ok": False,
                "error": "No se encontró ningún cliente con esos criterios",
                "suggestion": "Verifica el ID, email o nombre del cliente"
            }
        
        clients = result.data
        
        if len(clients) == 1:
            client = clients[0]
            
            # Format response with key info
            return {
                "ok": True,
                "client": {
                    "id": client["id"],
                    "full_name": client["full_name"],
                    "email": client.get("email"),
                    "phone": client.get("phone"),
                    "marital_status": client.get("marital_status"),
                    "address": f"{client.get('current_address', '')} {client.get('current_city', '')}, {client.get('current_state', '')} {client.get('current_zip', '')}".strip(),
                    "employer": client.get("employer_name"),
                    "occupation": client.get("occupation"),
                    "monthly_income": client.get("monthly_income"),
                    "kyc_status": client.get("kyc_status"),
                    "process_stage": client.get("process_stage"),
                    "dti_score": client.get("dti_score"),
                    "risk_profile": client.get("risk_profile"),
                    "referral_code": client.get("referral_code"),
                    "created_at": client.get("created_at"),
                },
                "summary": f"Cliente: {client['full_name']} | KYC: {client.get('kyc_status', 'pending')} | Etapa: {client.get('process_stage', 'datos_basicos')}",
                "message": f"Información del cliente '{client['full_name']}' encontrada exitosamente."
            }
        else:
            # Multiple clients found
            client_list = [
                {
                    "id": c["id"],
                    "full_name": c["full_name"],
                    "email": c.get("email"),
                    "phone": c.get("phone"),
                    "kyc_status": c.get("kyc_status"),
                    "process_stage": c.get("process_stage")
                }
                for c in clients
            ]
            
            return {
                "ok": True,
                "count": len(clients),
                "clients": client_list,
                "message": f"Se encontraron {len(clients)} clientes. Especifica el ID para ver detalles completos."
            }
            
    except Exception as e:
        logger.error(f"[get_client_info] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 1: create_client_profile
# Procedimiento: Perfilar cliente (Agente de éxito)
# ============================================================================

def create_client_profile(
    # Info Solicitante
    full_name: str,
    email: str,
    phone: str,
    date_of_birth: Optional[str] = None,
    ssn_itin: Optional[str] = None,
    marital_status: Optional[str] = None,  # single, married, other
    address: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    residence_type: Optional[str] = None,  # owned, rented, other
    # Info Laboral
    employer: Optional[str] = None,
    occupation: Optional[str] = None,
    employer_address: Optional[str] = None,
    employer_phone: Optional[str] = None,
    monthly_income: Optional[float] = None,
    years_at_employer: Optional[int] = None,
    months_at_employer: Optional[int] = None,
    other_income_source: bool = False,
    other_income_amount: Optional[float] = None,
    # Crédito Solicitado
    credit_requested_amount: Optional[float] = None,
    credit_purpose: Optional[str] = None,
    desired_term_months: Optional[int] = None,
    preferred_payment_method: Optional[str] = None,
    # Referencias
    reference1_name: Optional[str] = None,
    reference1_phone: Optional[str] = None,
    reference1_relationship: Optional[str] = None,
    reference2_name: Optional[str] = None,
    reference2_phone: Optional[str] = None,
    reference2_relationship: Optional[str] = None,
    # Propiedad de interés
    property_id: Optional[str] = None,
    # Código de referido (si fue referido por otro cliente)
    referral_code: Optional[str] = None
) -> Dict[str, Any]:
    """
    Crea el perfil de un cliente capturando información personal y financiera (Anexo 1).
    
    Procedimiento 1 del Excel: Capturar la información personal y financiera del cliente.
    
    Formato: Anexo 1 (Solicitud de Crédito)
    KPI: Tasa de cumplimiento ≥95%
    
    Args:
        full_name: Nombre completo del cliente
        email: Correo electrónico
        phone: Teléfono
        date_of_birth: Fecha de nacimiento (YYYY-MM-DD)
        ssn_itin: SSN o ITIN
        marital_status: Estado civil (single, married, other)
        address: Dirección actual
        city: Ciudad
        state: Estado
        zip_code: Código postal
        residence_type: Tipo de residencia (owned, rented, other)
        employer: Nombre del empleador
        occupation: Ocupación
        employer_address: Dirección del empleador
        employer_phone: Teléfono del empleador
        monthly_income: Ingreso mensual
        years_at_employer: Años en el empleo
        months_at_employer: Meses adicionales en el empleo
        other_income_source: Si tiene otra fuente de ingresos
        other_income_amount: Monto de otra fuente de ingresos
        credit_requested_amount: Monto de crédito solicitado
        credit_purpose: Propósito del crédito
        desired_term_months: Plazo deseado en meses
        preferred_payment_method: Método de pago preferido
        reference1_name, reference1_phone, reference1_relationship: Primera referencia
        reference2_name, reference2_phone, reference2_relationship: Segunda referencia
        property_id: UUID de la propiedad de interés (opcional)
    
    Returns:
        Dict con perfil del cliente creado
    """
    from .supabase_client import sb
    
    # Normalize values to match database CHECK constraints (Spanish values)
    marital_status_map = {
        "single": "soltero", "soltero": "soltero",
        "married": "casado", "casado": "casado",
        "other": "otro", "otro": "otro"
    }
    residence_type_map = {
        "owned": "propia", "propia": "propia",
        "rented": "rentada", "rentada": "rentada", "alquilada": "rentada",
        "other": "otra", "otra": "otra"
    }
    loan_purpose_map = {
        "home_purchase": "compra_vivienda", "compra_vivienda": "compra_vivienda",
        "compra vivienda": "compra_vivienda", "home": "compra_vivienda",
        "remodel": "remodelacion", "remodelacion": "remodelacion", "remodelación": "remodelacion",
        "other": "otro", "otro": "otro"
    }
    
    # Apply normalization
    if marital_status:
        marital_status = marital_status_map.get(marital_status.lower(), marital_status)
    if residence_type:
        residence_type = residence_type_map.get(residence_type.lower(), residence_type)
    if credit_purpose:
        credit_purpose = loan_purpose_map.get(credit_purpose.lower(), credit_purpose)
    
    try:
        # Check if client already exists by email
        existing = sb.table("clients").select("id, full_name").eq("email", email).execute()
        
        if existing.data:
            client_id = existing.data[0]["id"]
            logger.info(f"[create_client_profile] Client already exists: {client_id}")
            
            # Update existing client with new data
            update_data = {
                "full_name": full_name,
                "phone": phone,
                "updated_at": datetime.now().isoformat()
            }
            
            # Add optional fields if provided - using correct column names from migration
            optional_fields = {
                "date_of_birth": date_of_birth,
                "ssn_itin": ssn_itin,
                "marital_status": marital_status,
                "current_address": address,
                "current_city": city,
                "current_state": state,
                "current_zip": zip_code,
                "residence_type": residence_type,
                "employer_name": employer,
                "occupation": occupation,
                "employer_address": employer_address,
                "employer_phone": employer_phone,
                "monthly_income": monthly_income,
                "employment_years": years_at_employer,
                "employment_months": months_at_employer,
                "has_other_income": other_income_source,
                "other_income_amount": other_income_amount,
                "requested_amount": credit_requested_amount,
                "loan_purpose": credit_purpose,
                "desired_term_months": desired_term_months,
                "preferred_payment_method": preferred_payment_method,
            }
            
            for key, value in optional_fields.items():
                if value is not None:
                    update_data[key] = value
            
            # Build personal_references JSONB array
            references = []
            if reference1_name:
                references.append({
                    "name": reference1_name,
                    "phone": reference1_phone,
                    "relationship": reference1_relationship
                })
            if reference2_name:
                references.append({
                    "name": reference2_name,
                    "phone": reference2_phone,
                    "relationship": reference2_relationship
                })
            if references:
                update_data["personal_references"] = references
            
            sb.table("clients").update(update_data).eq("id", client_id).execute()
            
            return {
                "ok": True,
                "client_id": client_id,
                "is_new": False,
                "full_name": full_name,
                "email": email,
                "message": f"Perfil de cliente '{full_name}' actualizado"
            }
        
        # Create new client
        client_data = {
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "kyc_status": "pending",
            "process_stage": "datos_basicos"
        }
        
        # Add optional fields - using correct column names from migration
        optional_fields = {
            "date_of_birth": date_of_birth,
            "ssn_itin": ssn_itin,
            "marital_status": marital_status,
            "current_address": address,
            "current_city": city,  # Matches migration
            "current_state": state,  # Matches migration
            "current_zip": zip_code,  # Matches migration
            "residence_type": residence_type,
            "employer_name": employer,  # Matches migration
            "occupation": occupation,
            "employer_address": employer_address,
            "employer_phone": employer_phone,
            "monthly_income": monthly_income,
            "employment_years": years_at_employer,  # Matches migration
            "employment_months": months_at_employer,  # Matches migration
            "has_other_income": other_income_source,  # Matches migration
            "other_income_amount": other_income_amount,
            "requested_amount": credit_requested_amount,  # Matches migration
            "loan_purpose": credit_purpose,  # Matches migration
            "desired_term_months": desired_term_months,
            "preferred_payment_method": preferred_payment_method,
        }
        
        for key, value in optional_fields.items():
            if value is not None:
                client_data[key] = value
        
        # Build personal_references JSONB array (matches migration structure)
        references = []
        if reference1_name:
            references.append({
                "name": reference1_name,
                "phone": reference1_phone,
                "relationship": reference1_relationship
            })
        if reference2_name:
            references.append({
                "name": reference2_name,
                "phone": reference2_phone,
                "relationship": reference2_relationship
            })
        if references:
            client_data["personal_references"] = references
        
        # Handle referral code if provided
        referrer_info = None
        if referral_code:
            code = referral_code.upper().strip()
            referrer_result = sb.table("clients").select(
                "id, full_name, email, referral_count"
            ).eq("referral_code", code).execute()
            
            if referrer_result.data:
                referrer = referrer_result.data[0]
                client_data["referred_by_client_id"] = referrer["id"]
                client_data["referred_by_code"] = code
                referrer_info = {
                    "id": referrer["id"],
                    "name": referrer["full_name"],
                    "code": code
                }
        
        result = sb.table("clients").insert(client_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al crear cliente"}
        
        client_id = result.data[0]["id"]
        
        # If referred, create referral history record and notify referrer
        if referrer_info:
            try:
                # Create referral history record
                sb.table("referral_history").insert({
                    "referrer_client_id": referrer_info["id"],
                    "referred_client_id": client_id,
                    "referral_code": referrer_info["code"],
                    "referred_name": full_name,
                    "referred_email": email,
                    "referred_phone": phone,
                    "status": "registered",
                    "bonus_amount": 500.0  # Default bonus
                }).execute()
                
                # Update referrer's count
                sb.table("clients").update({
                    "referral_count": (referrer_result.data[0].get("referral_count") or 0) + 1,
                    "updated_at": datetime.now().isoformat()
                }).eq("id", referrer_info["id"]).execute()
                
                # Notify referrer
                try:
                    from .email_tool import send_email
                    send_email(
                        to_email=referrer_result.data[0]["email"],
                        subject="🎉 ¡Tu referido se registró!",
                        body=f"Hola {referrer_info['name']},\n\n"
                             f"¡Excelentes noticias! {full_name} usó tu código de referido.\n\n"
                             f"Cuando {full_name} firme un contrato, recibirás tu bono de $500.\n\n"
                             f"¡Gracias por referir a Maninos!\n\n"
                             f"Equipo Maninos"
                    )
                except Exception as email_err:
                    logger.warning(f"[create_client_profile] Referral email failed: {email_err}")
                    
            except Exception as ref_err:
                logger.warning(f"[create_client_profile] Referral tracking failed: {ref_err}")
        
        # Calculate profile completion
        total_fields = len(ANEXO_1_FIELDS["info_solicitante"]) + len(ANEXO_1_FIELDS["info_laboral"])
        filled_fields = sum(1 for v in client_data.values() if v is not None and v != "")
        completion_pct = (filled_fields / total_fields) * 100 if total_fields > 0 else 0
        
        # Log profile creation
        log_details = {
            "completion_pct": round(completion_pct, 1),
            "property_of_interest": property_id
        }
        if referrer_info:
            log_details["referred_by"] = referrer_info["name"]
            log_details["referral_code_used"] = referrer_info["code"]
            
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "INCORPORAR",
            "action": "profile_created",
            "details": log_details
        }).execute()
        
        logger.info(f"[create_client_profile] New client created: {client_id}")
        
        response = {
            "ok": True,
            "client_id": client_id,
            "is_new": True,
            "full_name": full_name,
            "email": email,
            "phone": phone,
            "profile_completion": f"{completion_pct:.1f}%",
            "next_step": "Verificar identidad (KYC)",
            "kpi_check": f"{'✅' if completion_pct >= 95 else '⚠️'} Cumplimiento: {completion_pct:.1f}% (meta: ≥95%)",
            "message": f"Perfil de cliente '{full_name}' creado exitosamente"
        }
        
        if referrer_info:
            response["referred_by"] = referrer_info["name"]
            response["referral_code_used"] = referrer_info["code"]
            response["message"] += f" (Referido por {referrer_info['name']})"
        
        return response
        
    except Exception as e:
        logger.error(f"[create_client_profile] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 2: start_kyc_verification (Stripe Identity)
# Procedimiento: Verificar identidad (KYC) (Cumplimiento)
# ============================================================================

def start_kyc_verification(
    client_id: str,
    return_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Inicia verificación de identidad automática con Stripe Identity.
    
    Procedimiento 2 del Excel: Confirmar identidad, historial crediticio y antecedentes.
    
    Formato: Stripe Identity (verificación automática de documentos)
    KPI: Cumplimiento KYC 100%
    
    Flujo:
    1. Esta función crea una sesión de verificación en Stripe
    2. El cliente recibe un link para subir su ID y selfie
    3. Stripe verifica automáticamente el documento
    4. Usar check_kyc_status() para consultar resultado
    
    Args:
        client_id: UUID del cliente
        return_url: URL a donde redirigir después de verificación (opcional)
    
    Returns:
        Dict con:
        - verification_url: URL para que el cliente complete verificación
        - session_id: ID de sesión de Stripe para consultar estado
    """
    from .supabase_client import sb
    from .stripe_identity import start_kyc_verification as stripe_start_kyc
    
    try:
        # Get client
        client_result = sb.table("clients").select(
            "id, full_name, email, kyc_status, stripe_verification_session_id"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        
        # Check if already verified
        if client.get("kyc_status") == "verified":
            return {
                "ok": True,
                "client_id": client_id,
                "client_name": client["full_name"],
                "kyc_status": "verified",
                "message": f"El cliente '{client['full_name']}' ya está verificado"
            }
        
        # Check if there's a pending session
        if client.get("stripe_verification_session_id"):
            # Check status of existing session
            from .stripe_identity import check_kyc_verification as stripe_check
            existing = stripe_check(client["stripe_verification_session_id"])
            
            if existing.get("ok") and existing.get("status") == "requires_input":
                return {
                    "ok": True,
                    "client_id": client_id,
                    "client_name": client["full_name"],
                    "session_id": client["stripe_verification_session_id"],
                    "kyc_status": "pending",
                    "message": f"Ya existe una sesión pendiente. El cliente debe completar la verificación.",
                    "next_step": "El cliente debe completar la verificación en el link enviado anteriormente"
                }
        
        # Create new verification session
        stripe_result = stripe_start_kyc(
            client_id=client_id,
            client_email=client["email"],
            client_name=client["full_name"],
            return_url=return_url
        )
        
        if not stripe_result.get("ok"):
            return stripe_result
        
        session_id = stripe_result["session_id"]
        verification_url = stripe_result["verification_url"]
        
        # Update client with session ID
        sb.table("clients").update({
            "kyc_status": "pending",
            "stripe_verification_session_id": session_id,
            "process_stage": "kyc_pending",
            "updated_at": datetime.now().isoformat()
        }).eq("id", client_id).execute()
        
        # Log KYC initiation
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "INCORPORAR",
            "action": "kyc_started",
            "details": {
                "stripe_session_id": session_id,
                "method": "stripe_identity"
            }
        }).execute()
        
        logger.info(f"[start_kyc_verification] Session {session_id} created for client {client_id}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "client_email": client["email"],
            "session_id": session_id,
            "verification_url": verification_url,
            "kyc_status": "pending",
            "next_step": f"Enviar link de verificación al cliente: {verification_url}",
            "kpi_check": "⏳ KYC iniciado - Esperando que cliente complete verificación",
            "message": f"Verificación KYC iniciada para '{client['full_name']}'. Link: {verification_url}"
        }
        
    except Exception as e:
        logger.error(f"[start_kyc_verification] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 2b: check_kyc_status (Stripe Identity)
# Consulta el estado de verificación KYC
# ============================================================================

def check_kyc_status(
    client_id: str
) -> Dict[str, Any]:
    """
    Consulta el estado de verificación KYC de un cliente.
    
    Args:
        client_id: UUID del cliente
    
    Returns:
        Dict con estado actual de verificación KYC
    """
    from .supabase_client import sb
    from .stripe_identity import check_kyc_verification as stripe_check
    
    try:
        # Get client
        client_result = sb.table("clients").select(
            "id, full_name, email, kyc_status, stripe_verification_session_id"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        session_id = client.get("stripe_verification_session_id")
        
        # If no session, return current status
        if not session_id:
            return {
                "ok": True,
                "client_id": client_id,
                "client_name": client["full_name"],
                "kyc_status": client.get("kyc_status", "not_started"),
                "message": "No hay sesión de verificación. Usar start_kyc_verification() para iniciar."
            }
        
        # Check Stripe session status
        stripe_result = stripe_check(session_id)
        
        if not stripe_result.get("ok"):
            return stripe_result
        
        stripe_status = stripe_result["status"]
        verified = stripe_result.get("verified", False)
        
        # Map Stripe status to our status
        status_map = {
            "requires_input": "pending",
            "processing": "processing",
            "verified": "verified",
            "canceled": "canceled"
        }
        kyc_status = status_map.get(stripe_status, stripe_status)
        
        # Update client if status changed
        if kyc_status != client.get("kyc_status"):
            update_data = {
                "kyc_status": kyc_status,
                "updated_at": datetime.now().isoformat()
            }
            
            if verified:
                update_data["process_stage"] = "kyc_verified"
                
                # Extract verified data if available
                if stripe_result.get("verified_outputs"):
                    outputs = stripe_result["verified_outputs"]
                    if outputs.get("first_name") and outputs.get("last_name"):
                        update_data["verified_name"] = f"{outputs['first_name']} {outputs['last_name']}"
                    if outputs.get("dob"):
                        update_data["verified_dob"] = str(outputs["dob"])
            
            sb.table("clients").update(update_data).eq("id", client_id).execute()
            
            # Log status change
            sb.table("process_logs").insert({
                "entity_type": "client",
                "entity_id": client_id,
                "process": "INCORPORAR",
                "action": "kyc_status_updated",
                "details": {
                    "stripe_session_id": session_id,
                    "old_status": client.get("kyc_status"),
                    "new_status": kyc_status,
                    "verified": verified,
                    "verified_outputs": stripe_result.get("verified_outputs")
                }
            }).execute()
        
        # Determine next step
        if verified:
            next_step = "Evaluar DTI (aspectos financieros)"
        elif kyc_status == "pending":
            next_step = "Esperando que cliente complete verificación"
        elif kyc_status == "processing":
            next_step = "Stripe está procesando la verificación"
        elif kyc_status == "canceled":
            next_step = "Reiniciar verificación con start_kyc_verification()"
        else:
            next_step = "Revisar estado manualmente"
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "session_id": session_id,
            "kyc_status": kyc_status,
            "verified": verified,
            "stripe_status": stripe_status,
            "verified_outputs": stripe_result.get("verified_outputs"),
            "next_step": next_step,
            "kpi_check": f"{'✅' if verified else '⏳'} KYC: {kyc_status}",
            "message": stripe_result.get("message", f"Estado KYC: {kyc_status}")
        }
        
    except Exception as e:
        logger.error(f"[check_kyc_status] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 3: calculate_client_dti
# Procedimiento: Evaluar aspectos financieros (DTI) (Finanzas)
# ============================================================================

def calculate_client_dti(
    client_id: str,
    monthly_income: Optional[float] = None,
    other_income: Optional[float] = None,
    monthly_rent: float = 0,
    monthly_debt_payments: float = 0,
    monthly_utilities: float = 0,
    monthly_other_expenses: float = 0,
    proposed_monthly_payment: Optional[float] = None
) -> Dict[str, Any]:
    """
    Calcula el DTI (Debt-to-Income) del cliente para evaluar su capacidad financiera.
    
    Procedimiento 3 del Excel: Revisar relación deuda/ingreso y estabilidad financiera.
    
    Formato: Anexo 1
    KPI: Evaluaciones completadas ≤48h
    
    Args:
        client_id: UUID del cliente
        monthly_income: Ingreso mensual (si no se proporciona, se obtiene de BD)
        other_income: Otros ingresos mensuales
        monthly_rent: Renta mensual actual
        monthly_debt_payments: Pagos mensuales de deudas
        monthly_utilities: Servicios mensuales
        monthly_other_expenses: Otros gastos mensuales
        proposed_monthly_payment: Pago mensual propuesto para el RTO
    
    Returns:
        Dict con análisis de DTI
    """
    from .supabase_client import sb
    
    try:
        # Get client data
        client_result = sb.table("clients").select(
            "id, full_name, monthly_income, other_income_amount, dti_score"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        
        # Use provided income or get from DB
        total_monthly_income = monthly_income or client.get("monthly_income") or 0
        total_other_income = other_income or client.get("other_income_amount") or 0
        total_income = total_monthly_income + total_other_income
        
        if total_income <= 0:
            return {"ok": False, "error": "Se requiere ingreso mensual para calcular DTI"}
        
        # Calculate total monthly expenses/debt
        total_monthly_obligations = (
            monthly_rent +
            monthly_debt_payments +
            monthly_utilities +
            monthly_other_expenses
        )
        
        # Current DTI (without new payment)
        current_dti = (total_monthly_obligations / total_income) * 100
        
        # DTI with proposed payment
        dti_with_payment = None
        can_afford = None
        max_affordable_payment = None
        
        # Standard DTI limit
        max_dti = 43.0
        
        # Calculate max affordable payment
        max_total_obligations = total_income * (max_dti / 100)
        max_affordable_payment = max_total_obligations - total_monthly_obligations
        max_affordable_payment = max(0, max_affordable_payment)
        
        if proposed_monthly_payment:
            new_total_obligations = total_monthly_obligations + proposed_monthly_payment
            dti_with_payment = (new_total_obligations / total_income) * 100
            can_afford = dti_with_payment <= max_dti
        
        # Determine qualification
        if current_dti <= 35:
            qualification = "EXCELENTE"
            risk_level = "bajo"
        elif current_dti <= 43:
            qualification = "BUENO"
            risk_level = "moderado"
        elif current_dti <= 50:
            qualification = "LIMITADO"
            risk_level = "alto"
        else:
            qualification = "NO CALIFICA"
            risk_level = "muy_alto"
        
        # Update client with DTI
        sb.table("clients").update({
            "dti_score": round(current_dti, 2),
            "risk_profile": risk_level,
            "process_stage": "dti_calculated",
            "updated_at": datetime.now().isoformat()
        }).eq("id", client_id).execute()
        
        # Log DTI calculation
        dti_record = {
            "total_income": total_income,
            "monthly_income": total_monthly_income,
            "other_income": total_other_income,
            "total_obligations": total_monthly_obligations,
            "current_dti": round(current_dti, 2),
            "max_dti_allowed": max_dti,
            "max_affordable_payment": round(max_affordable_payment, 2),
            "proposed_payment": proposed_monthly_payment,
            "dti_with_payment": round(dti_with_payment, 2) if dti_with_payment else None,
            "can_afford": can_afford,
            "qualification": qualification,
            "risk_level": risk_level
        }
        
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "INCORPORAR",
            "action": "dti_calculated",
            "details": dti_record
        }).execute()
        
        logger.info(f"[calculate_client_dti] DTI for {client_id}: {current_dti:.1f}% - {qualification}")
        
        # Build response
        result = {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "financial_summary": {
                "total_income": total_income,
                "total_obligations": total_monthly_obligations,
                "available_income": total_income - total_monthly_obligations
            },
            "dti_analysis": {
                "current_dti": round(current_dti, 2),
                "max_dti_allowed": max_dti,
                "max_affordable_payment": round(max_affordable_payment, 2)
            },
            "qualification": qualification,
            "risk_level": risk_level,
            "next_step": "Personalizar contrato RTO" if qualification != "NO CALIFICA" else "Revisar opciones",
            "kpi_check": "✅ Evaluación DTI completada",
            "message": f"DTI: {current_dti:.1f}%. Calificación: {qualification}. Pago máximo: ${max_affordable_payment:,.2f}/mes"
        }
        
        if proposed_monthly_payment:
            result["proposed_payment_analysis"] = {
                "proposed_payment": proposed_monthly_payment,
                "dti_with_payment": round(dti_with_payment, 2),
                "can_afford": can_afford,
                "message": f"{'✅ CALIFICA' if can_afford else '❌ NO CALIFICA'} para pago de ${proposed_monthly_payment:,.2f}/mes"
            }
        
        return result
        
    except Exception as e:
        logger.error(f"[calculate_client_dti] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 4: generate_rto_contract
# Procedimiento: Personalizar contrato (Agente de éxito)
# ============================================================================

def generate_rto_contract(
    client_id: str,
    property_id: str,
    term_months: int = 36,  # 24, 36, or 48
    monthly_rent: float = 0,
    down_payment: float = 0,
    purchase_option_price: float = 0,
    payment_day: int = 15,
    include_late_fees: bool = True,
    late_fee_per_day: float = 15.0,
    nsf_fee: float = 250.0,
    notes: Optional[str] = None
) -> Dict[str, Any]:
    """
    Genera un contrato RTO personalizado (Anexo 3) según el perfil del cliente.
    
    Procedimiento 4 del Excel: Ajustar el plan rent-to-own (24, 36 o 48 meses)
    según perfil de riesgo.
    
    Formato: Anexo 3 (Lease Agreement RTO - 33 cláusulas)
    KPI: Tiempo de generación ≤2 días
    
    Args:
        client_id: UUID del cliente
        property_id: UUID de la propiedad
        term_months: Plazo en meses (24, 36, 48)
        monthly_rent: Renta mensual
        down_payment: Enganche
        purchase_option_price: Precio de opción de compra
        payment_day: Día del mes para pago (default 15)
        include_late_fees: Si incluir cargos por mora
        late_fee_per_day: Cargo por día de mora (default $15)
        nsf_fee: Cargo por cheque devuelto (default $250)
        notes: Notas adicionales
    
    Returns:
        Dict con contrato generado
    """
    from .supabase_client import sb
    
    try:
        # Get client data
        client_result = sb.table("clients").select(
            "id, full_name, email, phone, current_address, dti_score, risk_profile"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        
        # Get property data
        prop_result = sb.table("properties").select(
            "id, name, address, hud_number, year_built, lot_rent, park_name"
        ).eq("id", property_id).execute()
        
        if not prop_result.data:
            return {"ok": False, "error": "Propiedad no encontrada"}
        
        prop = prop_result.data[0]
        
        # Validate term
        if term_months not in [24, 36, 48]:
            return {"ok": False, "error": "Plazo debe ser 24, 36 o 48 meses"}
        
        # Calculate dates
        start_date = date.today()
        end_date = start_date + relativedelta(months=term_months)
        
        # Create contract record
        # Note: purchase_price and purchase_option_price are the same (total sale price)
        contract_data = {
            "client_id": client_id,
            "property_id": property_id,
            "lease_term_months": term_months,
            "monthly_rent": monthly_rent,
            "down_payment": down_payment,
            "purchase_price": purchase_option_price,  # Required NOT NULL field
            "purchase_option_price": purchase_option_price,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "payment_day": payment_day,
            "late_fee_per_day": late_fee_per_day if include_late_fees else 0,
            "nsf_fee": nsf_fee,
            "status": "draft",
            "hud_number": prop.get("hud_number"),
            "property_year": prop.get("year_built")
        }
        
        # Check for existing draft contract
        existing = sb.table("rto_contracts").select("id").eq("client_id", client_id).eq("property_id", property_id).eq("status", "draft").execute()
        
        if existing.data:
            # Update existing draft
            contract_id = existing.data[0]["id"]
            contract_data["updated_at"] = datetime.now().isoformat()
            sb.table("rto_contracts").update(contract_data).eq("id", contract_id).execute()
        else:
            # Create new contract
            result = sb.table("rto_contracts").insert(contract_data).execute()
            if not result.data:
                return {"ok": False, "error": "Error al crear contrato"}
            contract_id = result.data[0]["id"]
        
        # Update property status
        sb.table("properties").update({
            "inventory_status": "reserved",
            "assigned_client_id": client_id,
            "updated_at": datetime.now().isoformat()
        }).eq("id", property_id).execute()
        
        # Update client stage
        sb.table("clients").update({
            "process_stage": "contract_pending",
            "updated_at": datetime.now().isoformat()
        }).eq("id", client_id).execute()
        
        # Log contract generation (non-blocking - don't fail if logging fails)
        try:
            sb.table("process_logs").insert({
                "entity_type": "client",  # Use 'client' instead of 'contract' to match CHECK constraint
                "entity_id": client_id,   # Link to client instead of contract
                "process": "INCORPORAR",
                "action": "contract_generated",
                "details": {
                    "contract_id": contract_id,
                    "client_name": client["full_name"],
                    "property_address": prop["address"],
                    "term_months": term_months,
                    "monthly_rent": monthly_rent,
                    "purchase_price": purchase_option_price,
                    "notes": notes
                }
            }).execute()
        except Exception as log_error:
            logger.warning(f"[generate_rto_contract] Logging failed (non-critical): {log_error}")
        
        logger.info(f"[generate_rto_contract] Contract {contract_id} generated for client {client_id}")
        
        # Contract summary (Anexo 3 key terms)
        contract_summary = {
            "contract_id": contract_id,
            "tenant": client["full_name"],
            "property": prop["address"],
            "park_name": prop.get("park_name"),
            "hud_number": prop.get("hud_number"),
            "property_year": prop.get("year_built"),
            "term": f"{term_months} meses",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "monthly_rent": monthly_rent,
            "lot_rent": prop.get("lot_rent"),
            "down_payment": down_payment,
            "purchase_option_price": purchase_option_price,
            "payment_day": f"Día {payment_day} del mes",
            "late_fee": f"${late_fee_per_day}/día después del 5to día" if include_late_fees else "N/A",
            "nsf_fee": f"${nsf_fee}",
            "zelle_phone": "832-745-9600",
            "closing_period": "21 días tras ejercer opción",
            "deposits_refundable": False,
            "warranty": "Solo interior por remodelación, AS IS",
            "default_cure_period": "7 días"
        }
        
        # =====================================================================
        # GENERATE PDF (Anexo 3 - 33 clauses)
        # =====================================================================
        pdf_url = None
        try:
            from .pdf_generator import generate_rto_contract_pdf, upload_pdf_to_storage
            
            # Prepare data for PDF
            pdf_contract_data = {
                "contract_id": contract_id,
                "lease_term_months": term_months,
                "start_date": start_date.isoformat(),
                "end_date": end_date.isoformat(),
                "monthly_rent": monthly_rent,
                "down_payment": down_payment,
                "purchase_option_price": purchase_option_price,
                "payment_day": payment_day,
                "late_fee_per_day": late_fee_per_day,
                "nsf_fee": nsf_fee,
                "status": "draft"
            }
            
            # Generate PDF
            pdf_result = generate_rto_contract_pdf(
                contract_data=pdf_contract_data,
                client_data=client,
                property_data=prop
            )
            
            if pdf_result.get("ok") and pdf_result.get("pdf_bytes"):
                # Try to upload to Supabase Storage
                try:
                    upload_result = upload_pdf_to_storage(
                        pdf_bytes=pdf_result["pdf_bytes"],
                        filename=pdf_result["filename"],
                        contract_id=contract_id
                    )
                    
                    if upload_result.get("ok"):
                        pdf_url = upload_result.get("public_url")
                        
                        # Update contract with PDF URL
                        sb.table("rto_contracts").update({
                            "pdf_url": pdf_url
                        }).eq("id", contract_id).execute()
                        
                        logger.info(f"[generate_rto_contract] PDF uploaded: {pdf_url}")
                    else:
                        logger.warning(f"[generate_rto_contract] PDF upload failed: {upload_result.get('error')}")
                except Exception as upload_error:
                    logger.warning(f"[generate_rto_contract] PDF upload error (non-critical): {upload_error}")
            else:
                logger.warning(f"[generate_rto_contract] PDF generation failed: {pdf_result.get('error')}")
                
        except Exception as pdf_error:
            logger.warning(f"[generate_rto_contract] PDF generation skipped: {pdf_error}")
        
        result = {
            "ok": True,
            "contract_id": contract_id,
            "client_id": client_id,
            "client_name": client["full_name"],
            "property_id": property_id,
            "property_address": prop["address"],
            "contract_summary": contract_summary,
            "status": "draft",
            "next_step": "Revisar contrato y enviar para firma",
            "kpi_check": "✅ Contrato generado",
        }
        
        if pdf_url:
            result["pdf_url"] = pdf_url
            result["pdf_download_link"] = pdf_url  # Explicit field for the link
            result["message"] = (
                f"✅ Contrato RTO de {term_months} meses generado para '{client['full_name']}'\n\n"
                f"📄 **DESCARGAR CONTRATO PDF:**\n{pdf_url}"
            )
        else:
            result["message"] = f"Contrato RTO de {term_months} meses generado para '{client['full_name']}'"
        
        return result
        
    except Exception as e:
        logger.error(f"[generate_rto_contract] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 5: send_client_update
# Procedimiento: Comunicar y dar seguimiento (Agente de éxito)
# ============================================================================

def send_client_update(
    client_id: str,
    update_type: str,  # "status", "payment_reminder", "welcome", "contract_ready", "custom"
    subject: Optional[str] = None,
    message: Optional[str] = None,
    include_payment_calendar: bool = False,
    contract_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Envía comunicación al cliente informando estatus, condiciones o calendario de pagos.
    
    Procedimiento 5 del Excel: Informar estatus, condiciones y calendario de pagos.
    
    Formato: Dashboard de seguimiento
    KPI: Satisfacción del cliente (NPS) ≥80
    
    Args:
        client_id: UUID del cliente
        update_type: Tipo de actualización (status, payment_reminder, welcome, contract_ready, custom)
        subject: Asunto del mensaje (opcional, se genera automáticamente)
        message: Mensaje personalizado (opcional)
        include_payment_calendar: Si incluir calendario de pagos
        contract_id: UUID del contrato (para información de pagos)
    
    Returns:
        Dict con confirmación de comunicación enviada
    """
    from .supabase_client import sb
    
    try:
        # Get client data
        client_result = sb.table("clients").select(
            "id, full_name, email, phone, process_stage"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": "Cliente no encontrado"}
        
        client = client_result.data[0]
        
        # Generate subject and message based on type
        templates = {
            "welcome": {
                "subject": "¡Bienvenido a Maninos Capital!",
                "message": f"Hola {client['full_name']},\n\n¡Gracias por tu interés en Maninos Capital! Hemos recibido tu información y estamos procesando tu solicitud.\n\nNos pondremos en contacto contigo pronto.\n\nSaludos,\nEquipo Maninos"
            },
            "status": {
                "subject": "Actualización de tu solicitud - Maninos Capital",
                "message": f"Hola {client['full_name']},\n\nQueremos informarte que tu solicitud está en proceso. Tu estado actual es: {client['process_stage']}.\n\nSi tienes preguntas, no dudes en contactarnos.\n\nSaludos,\nEquipo Maninos"
            },
            "contract_ready": {
                "subject": "¡Tu contrato está listo! - Maninos Capital",
                "message": f"Hola {client['full_name']},\n\n¡Excelentes noticias! Tu contrato de renta con opción a compra está listo para tu revisión.\n\nPor favor revisa los términos y condiciones. Estamos disponibles para resolver cualquier duda.\n\nSaludos,\nEquipo Maninos"
            },
            "payment_reminder": {
                "subject": "Recordatorio de pago - Maninos Capital",
                "message": f"Hola {client['full_name']},\n\nEste es un recordatorio amigable de que tu próximo pago está por vencer.\n\nRecuerda que puedes realizar tu pago por Zelle al 832-745-9600.\n\nSaludos,\nEquipo Maninos"
            },
            "custom": {
                "subject": subject or "Mensaje de Maninos Capital",
                "message": message or f"Hola {client['full_name']},\n\n{message}\n\nSaludos,\nEquipo Maninos"
            }
        }
        
        template = templates.get(update_type, templates["status"])
        final_subject = subject or template["subject"]
        final_message = message or template["message"]
        
        # Add payment calendar if requested
        payment_calendar = None
        if include_payment_calendar and contract_id:
            contract_result = sb.table("rto_contracts").select(
                "id, monthly_rent, start_date, end_date, lease_term_months, payment_day"
            ).eq("id", contract_id).execute()
            
            if contract_result.data:
                contract = contract_result.data[0]
                payment_calendar = {
                    "monthly_rent": contract["monthly_rent"],
                    "payment_day": contract["payment_day"],
                    "total_payments": contract["lease_term_months"],
                    "start_date": contract["start_date"],
                    "end_date": contract["end_date"]
                }
                
                final_message += f"\n\n📅 CALENDARIO DE PAGOS:\n"
                final_message += f"• Monto mensual: ${contract['monthly_rent']:,.2f}\n"
                final_message += f"• Día de pago: {contract['payment_day']} de cada mes\n"
                final_message += f"• Total de pagos: {contract['lease_term_months']}\n"
                final_message += f"• Fecha de término: {contract['end_date']}\n"
        
        # Try to send email
        email_sent = False
        try:
            from .email_tool import send_email
            email_result = send_email(
                to_email=client["email"],
                subject=final_subject,
                body=final_message
            )
            email_sent = email_result.get("ok", False)
        except Exception as email_error:
            logger.warning(f"[send_client_update] Email not sent: {email_error}")
        
        # Log the communication
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "INCORPORAR",
            "action": "client_communication",
            "details": {
                "update_type": update_type,
                "subject": final_subject,
                "email_sent": email_sent,
                "payment_calendar_included": include_payment_calendar
            }
        }).execute()
        
        logger.info(f"[send_client_update] Update sent to client {client_id}: {update_type}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "client_email": client["email"],
            "update_type": update_type,
            "subject": final_subject,
            "email_sent": email_sent,
            "payment_calendar": payment_calendar,
            "kpi_check": "✅ Comunicación enviada (NPS target: ≥80)",
            "message": f"Actualización '{update_type}' enviada a {client['full_name']}"
        }
        
    except Exception as e:
        logger.error(f"[send_client_update] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 7: generate_referral_code
# Genera código de referido único para un cliente
# ============================================================================

def generate_referral_code(
    client_id: str
) -> Dict[str, Any]:
    """
    Genera un código de referido único para un cliente.
    
    El código se genera en formato NOMBRE2026 (primeras 4 letras del nombre + año).
    Si ya existe, añade un número secuencial (JUAN20261, JUAN20262, etc.)
    
    Args:
        client_id: UUID del cliente
    
    Returns:
        Dict con el código de referido generado
    """
    from .supabase_client import sb
    import re
    
    try:
        # Get client info
        client_result = sb.table("clients").select(
            "id, full_name, email, referral_code"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": f"Cliente {client_id} no encontrado"}
        
        client = client_result.data[0]
        
        # If client already has a code, return it
        if client.get("referral_code"):
            return {
                "ok": True,
                "client_id": client_id,
                "client_name": client["full_name"],
                "referral_code": client["referral_code"],
                "is_new": False,
                "message": f"El cliente ya tiene código de referido: {client['referral_code']}"
            }
        
        # Generate base code: First 4 letters of name (uppercase) + year
        name_clean = re.sub(r'[^a-zA-Z]', '', client["full_name"])  # Remove non-letters
        base_name = name_clean[:4].upper() if len(name_clean) >= 4 else name_clean.upper().ljust(4, 'X')
        year = datetime.now().year
        base_code = f"{base_name}{year}"
        
        # Check if code exists and add counter if needed
        final_code = base_code
        counter = 0
        
        while True:
            existing = sb.table("clients").select("id").eq("referral_code", final_code).execute()
            if not existing.data:
                break
            counter += 1
            final_code = f"{base_code}{counter}"
        
        # Update client with the new code
        sb.table("clients").update({
            "referral_code": final_code,
            "updated_at": datetime.now().isoformat()
        }).eq("id", client_id).execute()
        
        # Log the action
        sb.table("process_logs").insert({
            "entity_type": "client",
            "entity_id": client_id,
            "process": "INCORPORAR",
            "action": "referral_code_generated",
            "details": {
                "referral_code": final_code,
                "client_name": client["full_name"]
            }
        }).execute()
        
        logger.info(f"[generate_referral_code] Generated code {final_code} for client {client_id}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "referral_code": final_code,
            "is_new": True,
            "share_message": f"¡Refiere a tus amigos! Usa el código {final_code} y ambos ganan.",
            "message": f"Código de referido '{final_code}' generado para {client['full_name']}"
        }
        
    except Exception as e:
        logger.error(f"[generate_referral_code] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 8: validate_referral_code
# Valida un código de referido y retorna info del referidor
# ============================================================================

def validate_referral_code(
    referral_code: str
) -> Dict[str, Any]:
    """
    Valida un código de referido y retorna información del cliente que refiere.
    
    Args:
        referral_code: Código de referido a validar (ej: "JUAN2026")
    
    Returns:
        Dict con información del referidor si el código es válido
    """
    from .supabase_client import sb
    
    try:
        # Normalize code to uppercase
        code = referral_code.upper().strip()
        
        # Search for client with this code
        result = sb.table("clients").select(
            "id, full_name, email, phone, referral_count, referral_bonus_earned"
        ).eq("referral_code", code).execute()
        
        if not result.data:
            return {
                "ok": False,
                "valid": False,
                "referral_code": code,
                "error": f"Código de referido '{code}' no encontrado",
                "suggestion": "Verifica que el código esté escrito correctamente"
            }
        
        referrer = result.data[0]
        
        logger.info(f"[validate_referral_code] Code {code} is valid, belongs to {referrer['full_name']}")
        
        return {
            "ok": True,
            "valid": True,
            "referral_code": code,
            "referrer": {
                "id": referrer["id"],
                "name": referrer["full_name"],
                "referral_count": referrer.get("referral_count", 0),
                "total_bonus_earned": referrer.get("referral_bonus_earned", 0)
            },
            "message": f"Código válido. Referido por: {referrer['full_name']}"
        }
        
    except Exception as e:
        logger.error(f"[validate_referral_code] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 9: register_referral
# Registra un referido (cuando alguien usa un código al aplicar)
# ============================================================================

def register_referral(
    referral_code: str,
    referred_name: str,
    referred_email: Optional[str] = None,
    referred_phone: Optional[str] = None,
    referred_client_id: Optional[str] = None,
    bonus_amount: float = 500.0  # Default $500 bonus
) -> Dict[str, Any]:
    """
    Registra un referido cuando alguien usa un código de referido.
    
    Este registro puede hacerse antes de que el referido se convierta en cliente.
    El bono se marca como pendiente hasta que el referido firme un contrato.
    
    Args:
        referral_code: Código usado por el referido
        referred_name: Nombre del referido
        referred_email: Email del referido (opcional)
        referred_phone: Teléfono del referido (opcional)
        referred_client_id: ID del cliente referido si ya existe (opcional)
        bonus_amount: Monto del bono por referido exitoso (default $500)
    
    Returns:
        Dict con información del registro de referido
    """
    from .supabase_client import sb
    
    try:
        # First validate the code
        code = referral_code.upper().strip()
        referrer_result = sb.table("clients").select(
            "id, full_name, email, referral_count"
        ).eq("referral_code", code).execute()
        
        if not referrer_result.data:
            return {
                "ok": False,
                "error": f"Código de referido '{code}' no válido"
            }
        
        referrer = referrer_result.data[0]
        
        # Check if this referral already exists
        existing = sb.table("referral_history").select("id, status").eq(
            "referral_code", code
        ).eq("referred_email", referred_email).execute() if referred_email else None
        
        if existing and existing.data:
            return {
                "ok": False,
                "error": f"Este referido ya está registrado con código {code}",
                "existing_status": existing.data[0].get("status")
            }
        
        # Create referral history record
        referral_data = {
            "referrer_client_id": referrer["id"],
            "referral_code": code,
            "referred_name": referred_name,
            "referred_email": referred_email,
            "referred_phone": referred_phone,
            "referred_client_id": referred_client_id,
            "status": "registered" if referred_client_id else "pending",
            "bonus_amount": bonus_amount
        }
        
        result = sb.table("referral_history").insert(referral_data).execute()
        
        if not result.data:
            return {"ok": False, "error": "Error al registrar referido"}
        
        referral_id = result.data[0]["id"]
        
        # Log the action
        sb.table("process_logs").insert({
            "entity_type": "referral",
            "entity_id": referral_id,
            "process": "INCORPORAR",
            "action": "referral_registered",
            "details": {
                "referrer_id": referrer["id"],
                "referrer_name": referrer["full_name"],
                "referred_name": referred_name,
                "referral_code": code,
                "bonus_amount": bonus_amount
            }
        }).execute()
        
        # Try to notify referrer
        try:
            from .email_tool import send_email
            send_email(
                to_email=referrer["email"],
                subject="🎉 ¡Tu referido se registró!",
                body=f"Hola {referrer['full_name']},\n\n"
                     f"¡Excelentes noticias! {referred_name} usó tu código de referido {code}.\n\n"
                     f"Si {referred_name} firma un contrato, recibirás un bono de ${bonus_amount:,.2f}.\n\n"
                     f"¡Gracias por referir a Maninos!\n\n"
                     f"Equipo Maninos"
            )
        except Exception as email_error:
            logger.warning(f"[register_referral] Email notification failed: {email_error}")
        
        logger.info(f"[register_referral] Registered referral: {referred_name} by {referrer['full_name']}")
        
        return {
            "ok": True,
            "referral_id": referral_id,
            "referrer": {
                "id": referrer["id"],
                "name": referrer["full_name"]
            },
            "referred": {
                "name": referred_name,
                "email": referred_email,
                "phone": referred_phone
            },
            "referral_code": code,
            "bonus_amount": bonus_amount,
            "status": "pending" if not referred_client_id else "registered",
            "message": f"Referido '{referred_name}' registrado exitosamente. {referrer['full_name']} será notificado."
        }
        
    except Exception as e:
        logger.error(f"[register_referral] Error: {e}")
        return {"ok": False, "error": str(e)}


# ============================================================================
# HERRAMIENTA 10: get_referral_stats
# Obtiene estadísticas de referidos de un cliente
# ============================================================================

def get_referral_stats(
    client_id: str
) -> Dict[str, Any]:
    """
    Obtiene las estadísticas de referidos de un cliente.
    
    Args:
        client_id: UUID del cliente
    
    Returns:
        Dict con estadísticas de referidos
    """
    from .supabase_client import sb
    
    try:
        # Get client info
        client_result = sb.table("clients").select(
            "id, full_name, referral_code, referral_count, referral_bonus_earned, referral_bonus_pending"
        ).eq("id", client_id).execute()
        
        if not client_result.data:
            return {"ok": False, "error": f"Cliente {client_id} no encontrado"}
        
        client = client_result.data[0]
        
        # Get referral history
        history_result = sb.table("referral_history").select(
            "id, referred_name, referred_email, status, bonus_amount, created_at, bonus_paid_at"
        ).eq("referrer_client_id", client_id).order("created_at", desc=True).execute()
        
        referrals = history_result.data if history_result.data else []
        
        # Count by status
        status_counts = {
            "pending": 0,
            "registered": 0,
            "converted": 0,
            "bonus_paid": 0,
            "expired": 0
        }
        for r in referrals:
            status = r.get("status", "pending")
            if status in status_counts:
                status_counts[status] += 1
        
        # Format referral list
        referral_list = [
            {
                "name": r["referred_name"],
                "email": r.get("referred_email"),
                "status": r["status"],
                "bonus": r.get("bonus_amount", 0),
                "date": r["created_at"][:10] if r.get("created_at") else None
            }
            for r in referrals[:10]  # Last 10
        ]
        
        logger.info(f"[get_referral_stats] Retrieved stats for client {client_id}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "client_name": client["full_name"],
            "referral_code": client.get("referral_code"),
            "stats": {
                "total_referrals": len(referrals),
                "pending": status_counts["pending"],
                "registered": status_counts["registered"],
                "converted": status_counts["converted"],
                "bonus_paid": status_counts["bonus_paid"],
                "expired": status_counts["expired"]
            },
            "earnings": {
                "total_earned": client.get("referral_bonus_earned", 0),
                "pending_payment": client.get("referral_bonus_pending", 0)
            },
            "recent_referrals": referral_list,
            "message": f"{client['full_name']} tiene {len(referrals)} referidos. Código: {client.get('referral_code', 'No generado')}"
        }
        
    except Exception as e:
        logger.error(f"[get_referral_stats] Error: {e}")
        return {"ok": False, "error": str(e)}

