"""
Stripe Identity Integration - Verificación KYC automatizada

Integración con Stripe Identity para verificación de documentos de identidad.
https://docs.stripe.com/identity

Flujo:
1. start_kyc_verification() - Crea sesión de verificación
2. Cliente completa verificación en URL de Stripe
3. check_kyc_verification() - Consulta estado
4. Webhook recibe actualización automática (opcional)

Requisitos:
- STRIPE_SECRET_KEY en variables de entorno
- Stripe Identity habilitado en dashboard de Stripe
"""

import os
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Stripe API
try:
    import stripe
    STRIPE_AVAILABLE = True
except ImportError:
    STRIPE_AVAILABLE = False
    logger.warning("[stripe_identity] stripe package not installed. Run: pip install stripe")


def _get_stripe_client():
    """Obtiene cliente de Stripe configurado."""
    if not STRIPE_AVAILABLE:
        raise ImportError("stripe package not installed. Run: pip install stripe")
    
    api_key = os.getenv("STRIPE_SECRET_KEY")
    if not api_key:
        raise ValueError("STRIPE_SECRET_KEY not configured in environment variables")
    
    stripe.api_key = api_key
    return stripe


def start_kyc_verification(
    client_id: str,
    client_email: str,
    client_name: str,
    return_url: Optional[str] = None
) -> Dict[str, Any]:
    """
    Inicia una sesión de verificación de identidad con Stripe Identity.
    
    Args:
        client_id: UUID del cliente en nuestra base de datos
        client_email: Email del cliente
        client_name: Nombre completo del cliente
        return_url: URL a donde redirigir después de verificación (opcional)
    
    Returns:
        Dict con:
        - ok: bool
        - session_id: ID de la sesión de Stripe
        - verification_url: URL donde el cliente debe completar verificación
        - client_secret: Secret para usar con Stripe.js (frontend)
    """
    try:
        stripe_client = _get_stripe_client()
        
        # Crear sesión de verificación
        # type="document" verifica documento de identidad
        # options: "id_number" (SSN/ITIN), "address", "dob"
        session = stripe_client.identity.VerificationSession.create(
            type="document",
            provided_details={
                "email": client_email,
            },
            metadata={
                "client_id": client_id,
                "client_name": client_name,
                "source": "maninos_ai"
            },
            options={
                "document": {
                    "allowed_types": ["driving_license", "passport", "id_card"],
                    "require_id_number": False,  # No requerir SSN en el doc
                    "require_live_capture": True,  # Foto en vivo, no subida
                    "require_matching_selfie": True,  # Selfie que coincida con doc
                }
            },
            return_url=return_url or os.getenv("APP_URL", "https://maninos.app") + "/kyc/complete"
        )
        
        logger.info(f"[start_kyc_verification] Session created: {session.id} for client {client_id}")
        
        return {
            "ok": True,
            "session_id": session.id,
            "verification_url": session.url,
            "client_secret": session.client_secret,
            "status": session.status,
            "message": f"Sesión de verificación creada. El cliente debe completar en: {session.url}"
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"[start_kyc_verification] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[start_kyc_verification] Error: {e}")
        return {"ok": False, "error": str(e)}


def check_kyc_verification(session_id: str) -> Dict[str, Any]:
    """
    Consulta el estado de una sesión de verificación de Stripe Identity.
    
    Args:
        session_id: ID de la sesión de verificación (vs_xxx)
    
    Returns:
        Dict con:
        - ok: bool
        - status: Estado de la verificación
        - verified: bool si está verificado
        - last_error: Error si hubo fallo
        - verified_outputs: Datos verificados (nombre, DOB, etc.)
    """
    try:
        stripe_client = _get_stripe_client()
        
        session = stripe_client.identity.VerificationSession.retrieve(
            session_id,
            expand=["verified_outputs", "last_error"]
        )
        
        # Estados posibles:
        # - requires_input: Esperando que cliente complete
        # - processing: Stripe está procesando
        # - verified: Verificación exitosa
        # - canceled: Sesión cancelada
        
        result = {
            "ok": True,
            "session_id": session.id,
            "status": session.status,
            "verified": session.status == "verified",
            "created": datetime.fromtimestamp(session.created).isoformat(),
            "client_id": session.metadata.get("client_id"),
        }
        
        # Si está verificado, incluir outputs
        if session.status == "verified" and session.verified_outputs:
            outputs = session.verified_outputs
            result["verified_outputs"] = {
                "first_name": outputs.get("first_name"),
                "last_name": outputs.get("last_name"),
                "dob": outputs.get("dob"),
                "address": outputs.get("address"),
                "id_number": outputs.get("id_number"),  # Solo si se solicitó
                "document_type": outputs.get("document", {}).get("type") if outputs.get("document") else None,
            }
        
        # Si hay error, incluirlo
        if session.last_error:
            result["last_error"] = {
                "code": session.last_error.code,
                "reason": session.last_error.reason,
            }
        
        # Mensaje según estado
        status_messages = {
            "requires_input": "Esperando que el cliente complete la verificación",
            "processing": "Stripe está procesando la verificación",
            "verified": "✅ Identidad verificada exitosamente",
            "canceled": "❌ Sesión de verificación cancelada",
        }
        result["message"] = status_messages.get(session.status, f"Estado: {session.status}")
        
        logger.info(f"[check_kyc_verification] Session {session_id}: {session.status}")
        
        return result
        
    except stripe.error.StripeError as e:
        logger.error(f"[check_kyc_verification] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[check_kyc_verification] Error: {e}")
        return {"ok": False, "error": str(e)}


def cancel_kyc_verification(session_id: str) -> Dict[str, Any]:
    """
    Cancela una sesión de verificación pendiente.
    
    Args:
        session_id: ID de la sesión de verificación
    
    Returns:
        Dict con resultado de cancelación
    """
    try:
        stripe_client = _get_stripe_client()
        
        session = stripe_client.identity.VerificationSession.cancel(session_id)
        
        logger.info(f"[cancel_kyc_verification] Session {session_id} canceled")
        
        return {
            "ok": True,
            "session_id": session.id,
            "status": session.status,
            "message": "Sesión de verificación cancelada"
        }
        
    except stripe.error.StripeError as e:
        logger.error(f"[cancel_kyc_verification] Stripe error: {e}")
        return {"ok": False, "error": f"Error de Stripe: {str(e)}"}
    except Exception as e:
        logger.error(f"[cancel_kyc_verification] Error: {e}")
        return {"ok": False, "error": str(e)}


def process_identity_webhook(payload: bytes, sig_header: str) -> Dict[str, Any]:
    """
    Procesa webhook de Stripe Identity.
    
    Eventos relevantes:
    - identity.verification_session.verified
    - identity.verification_session.requires_input
    - identity.verification_session.canceled
    
    Args:
        payload: Body del request (bytes)
        sig_header: Header Stripe-Signature
    
    Returns:
        Dict con evento procesado
    """
    try:
        stripe_client = _get_stripe_client()
        
        webhook_secret = os.getenv("STRIPE_IDENTITY_WEBHOOK_SECRET")
        if not webhook_secret:
            logger.warning("[process_identity_webhook] STRIPE_IDENTITY_WEBHOOK_SECRET not configured")
            # En desarrollo, procesar sin verificar firma
            import json
            event = json.loads(payload)
        else:
            event = stripe_client.Webhook.construct_event(
                payload, sig_header, webhook_secret
            )
        
        event_type = event.get("type") if isinstance(event, dict) else event.type
        data = event.get("data", {}).get("object", {}) if isinstance(event, dict) else event.data.object
        
        logger.info(f"[process_identity_webhook] Received event: {event_type}")
        
        # Extraer client_id de metadata
        client_id = data.get("metadata", {}).get("client_id")
        session_id = data.get("id")
        status = data.get("status")
        
        result = {
            "ok": True,
            "event_type": event_type,
            "session_id": session_id,
            "client_id": client_id,
            "status": status,
        }
        
        # Procesar según tipo de evento
        if event_type == "identity.verification_session.verified":
            result["action"] = "update_kyc_verified"
            result["message"] = f"Cliente {client_id} verificado exitosamente"
            
        elif event_type == "identity.verification_session.requires_input":
            result["action"] = "notify_client"
            result["message"] = f"Cliente {client_id} necesita completar verificación"
            
        elif event_type == "identity.verification_session.canceled":
            result["action"] = "update_kyc_canceled"
            result["message"] = f"Verificación de cliente {client_id} cancelada"
        
        return result
        
    except stripe.error.SignatureVerificationError as e:
        logger.error(f"[process_identity_webhook] Invalid signature: {e}")
        return {"ok": False, "error": "Invalid webhook signature"}
    except Exception as e:
        logger.error(f"[process_identity_webhook] Error: {e}")
        return {"ok": False, "error": str(e)}

