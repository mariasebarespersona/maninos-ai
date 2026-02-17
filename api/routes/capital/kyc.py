"""
Capital KYC - Identity verification via Stripe Identity

Correct flow:
1. Capital clicks "Solicitar Verificación" → sets kyc_requested=True on client
2. Client logs into portal, sees KYC banner → clicks to start Stripe Identity
3. Client completes verification on Stripe
4. Capital sees result (via polling or webhook)
"""

import os
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["Capital - KYC"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")


# =============================================================================
# SCHEMAS
# =============================================================================

class KYCRequestVerification(BaseModel):
    """Capital requests a client to verify their identity."""
    client_id: str


class KYCCreateSession(BaseModel):
    """Client initiates their own KYC session from client portal."""
    client_id: str
    return_url: Optional[str] = None  # URL to redirect after verification


class KYCManualVerify(BaseModel):
    """Manual verification when Stripe Identity is not available."""
    client_id: str
    verified_by: str = "admin"
    id_type: str = "manual"  # driver_license, passport, state_id, manual
    notes: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/status/{client_id}")
async def get_kyc_status(client_id: str):
    """Get current KYC verification status for a client."""
    try:
        result = sb.table("clients") \
            .select("id, name, email, kyc_verified, kyc_verified_at, kyc_status, kyc_session_id, kyc_type, kyc_failure_reason, kyc_requested, kyc_requested_at") \
            .eq("id", client_id) \
            .execute()

        if not result.data:
            return {
                "ok": True,
                "client_id": client_id,
                "client_name": None,
                "kyc_verified": False,
                "kyc_status": "unverified",
                "kyc_verified_at": None,
                "kyc_type": None,
                "kyc_session_id": None,
                "failure_reason": None,
                "kyc_requested": False,
                "kyc_requested_at": None,
                "client_found": False,
            }

        client = result.data[0]

        return {
            "ok": True,
            "client_id": client["id"],
            "client_name": client.get("name"),
            "kyc_verified": client.get("kyc_verified", False),
            "kyc_status": client.get("kyc_status", "unverified"),
            "kyc_verified_at": client.get("kyc_verified_at"),
            "kyc_type": client.get("kyc_type"),
            "kyc_session_id": client.get("kyc_session_id"),
            "failure_reason": client.get("kyc_failure_reason"),
            "kyc_requested": client.get("kyc_requested", False),
            "kyc_requested_at": client.get("kyc_requested_at"),
            "client_found": True,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting KYC status for {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/request-verification")
async def request_verification(data: KYCRequestVerification):
    """
    Capital requests a client to verify their identity.
    Sets kyc_requested=True so the client portal shows the verification banner.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, name, email, kyc_verified, kyc_requested") \
            .eq("id", data.client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]

        if client.get("kyc_verified"):
            return {
                "ok": True,
                "already_verified": True,
                "message": "Este cliente ya está verificado."
            }

        # Set the request flag and RESET any stale KYC state from previous tests/sessions
        sb.table("clients").update({
            "kyc_requested": True,
            "kyc_requested_at": datetime.utcnow().isoformat(),
            "kyc_status": "unverified",
            "kyc_verified": False,
            "kyc_verified_at": None,
            "kyc_session_id": None,
            "kyc_failure_reason": None,
            "kyc_report_id": None,
        }).eq("id", data.client_id).execute()

        logger.info(f"[KYC] Verification requested for client {data.client_id} ({client.get('name')})")

        return {
            "ok": True,
            "message": f"Solicitud de verificación enviada a {client.get('name')}. El cliente debe verificar su identidad desde su portal.",
            "client_name": client.get("name"),
            "client_email": client.get("email"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting KYC for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/create-session")
async def create_verification_session(data: KYCCreateSession):
    """
    Create a Stripe Identity Verification Session.
    Called from the CLIENT portal when the client clicks to verify.
    Returns a URL the client visits to complete identity verification.
    """
    try:
        # Validate client exists
        client_result = sb.table("clients") \
            .select("id, name, email, kyc_verified, kyc_status") \
            .eq("id", data.client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]

        if client.get("kyc_verified"):
            return {
                "ok": True,
                "already_verified": True,
                "message": "Tu identidad ya está verificada."
            }

        if not STRIPE_SECRET_KEY:
            raise HTTPException(
                status_code=503,
                detail="Stripe no configurado. Contacta a soporte."
            )

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        # Build return URL — goes back to the CLIENT portal (not Capital)
        base_url = data.return_url or os.getenv("FRONTEND_URL", "http://localhost:3000")
        return_url = f"{base_url}/clientes/mi-cuenta/verificacion?status=complete"

        # Create verification session
        session = stripe.identity.VerificationSession.create(
            type="document",
            metadata={
                "client_id": data.client_id,
                "client_name": client.get("name", ""),
                "client_email": client.get("email", ""),
            },
            options={
                "document": {
                    "allowed_types": ["driving_license", "passport", "id_card"],
                    "require_id_number": False,
                    "require_matching_selfie": True,
                },
            },
            return_url=return_url,
        )

        # Update client with session info
        sb.table("clients").update({
            "kyc_session_id": session.id,
            "kyc_status": "pending",
            "kyc_type": "document",
            "kyc_failure_reason": None,
        }).eq("id", data.client_id).execute()

        return {
            "ok": True,
            "session_id": session.id,
            "url": session.url,
            "client_secret": session.client_secret,
            "status": session.status,
            "message": "Sesión de verificación creada. Completa la verificación."
        }

    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Librería Stripe no instalada."
        )
    except Exception as e:
        logger.error(f"Error creating KYC session for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-session/{client_id}")
async def check_verification_session(client_id: str):
    """
    Check the status of a pending verification session with Stripe.
    Called from Capital to poll the verification result.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, kyc_session_id, kyc_status, kyc_requested") \
            .eq("id", client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]
        session_id = client.get("kyc_session_id")

        # Guard: if Capital never requested KYC, don't process stale sessions
        if not client.get("kyc_requested"):
            return {
                "ok": True,
                "status": "not_requested",
                "verified": False,
                "message": "No se ha solicitado verificación para este cliente. Use 'Solicitar Verificación' primero."
            }

        if not session_id:
            return {
                "ok": True,
                "status": "no_session",
                "verified": False,
                "message": "No hay sesión de verificación activa. El cliente aún no ha iniciado la verificación."
            }

        if not STRIPE_SECRET_KEY:
            raise HTTPException(status_code=503, detail="Stripe no configurado")

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        session = stripe.identity.VerificationSession.retrieve(session_id)

        # Map Stripe status to our status
        status_map = {
            "requires_input": "requires_input",
            "processing": "pending",
            "verified": "verified",
            "canceled": "failed",
        }
        our_status = status_map.get(session.status, "pending")
        is_verified = session.status == "verified"

        update_data = {
            "kyc_status": our_status,
            "kyc_verified": is_verified,
        }

        if is_verified:
            update_data["kyc_verified_at"] = datetime.utcnow().isoformat()
            update_data["kyc_requested"] = False  # Request fulfilled
            if session.last_verification_report:
                update_data["kyc_report_id"] = session.last_verification_report

        if session.status == "canceled" and session.last_error:
            update_data["kyc_failure_reason"] = str(session.last_error.get("reason", "unknown"))
        
        if session.status == "requires_input":
            reason = "La verificación no se completó correctamente"
            if hasattr(session, 'last_error') and session.last_error:
                reason = str(session.last_error.get("reason", reason))
            update_data["kyc_failure_reason"] = reason

        sb.table("clients").update(update_data).eq("id", client_id).execute()

        messages = {
            "verified": "✅ Verificación de identidad completada exitosamente.",
            "failed": "❌ La verificación fue cancelada o rechazada.",
            "requires_input": "⚠️ El cliente necesita completar o reintentar la verificación.",
            "pending": "⏳ La verificación aún está en proceso...",
        }

        return {
            "ok": True,
            "status": our_status,
            "verified": is_verified,
            "stripe_status": session.status,
            "message": messages.get(our_status, f"Estado: {session.status}")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking KYC session for {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/manual-verify")
async def manual_verify(data: KYCManualVerify):
    """
    Manually verify a client's identity (admin override).
    Use when Stripe Identity is unavailable or for trusted clients.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, name, kyc_verified") \
            .eq("id", data.client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        if client_result.data[0].get("kyc_verified"):
            return {"ok": True, "message": "Cliente ya verificado", "already_verified": True}

        sb.table("clients").update({
            "kyc_verified": True,
            "kyc_verified_at": datetime.utcnow().isoformat(),
            "kyc_status": "verified",
            "kyc_type": data.id_type,
            "kyc_failure_reason": None,
        }).eq("id", data.client_id).execute()

        logger.info(f"[KYC] Manual verification for client {data.client_id} by {data.verified_by}")

        return {
            "ok": True,
            "message": f"Cliente verificado manualmente por {data.verified_by}",
            "verified": True,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error manual KYC for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/webhook")
async def kyc_webhook(request: Request):
    """
    Stripe Identity webhook handler.
    Set up in Stripe Dashboard: Events → identity.verification_session.verified
    """
    try:
        if not STRIPE_SECRET_KEY:
            raise HTTPException(status_code=503, detail="Stripe no configurado")

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        payload = await request.body()
        sig_header = request.headers.get("stripe-signature")
        webhook_secret = os.getenv("STRIPE_IDENTITY_WEBHOOK_SECRET")

        if webhook_secret and sig_header:
            try:
                event = stripe.Webhook.construct_event(
                    payload, sig_header, webhook_secret
                )
            except stripe.error.SignatureVerificationError:
                raise HTTPException(status_code=400, detail="Invalid signature")
        else:
            import json
            event = json.loads(payload)

        event_type = event.get("type", "")
        session_data = event.get("data", {}).get("object", {})
        client_id = session_data.get("metadata", {}).get("client_id")

        if not client_id:
            return {"ok": True, "message": "No client_id in metadata, skipping"}

        # Only process if Capital actually requested KYC for this client
        client_check = sb.table("clients") \
            .select("id, kyc_requested, kyc_verified") \
            .eq("id", client_id) \
            .execute()

        if not client_check.data:
            return {"ok": True, "message": f"Client {client_id} not found, skipping"}

        client_row = client_check.data[0]

        # Guard: ignore webhook if Capital never requested verification
        if not client_row.get("kyc_requested") and not client_row.get("kyc_verified"):
            logger.warning(f"[KYC Webhook] Ignoring event for client {client_id} — kyc_requested=false")
            return {"ok": True, "message": "KYC not requested by Capital, ignoring", "client_id": client_id}

        if event_type == "identity.verification_session.verified":
            sb.table("clients").update({
                "kyc_verified": True,
                "kyc_verified_at": datetime.utcnow().isoformat(),
                "kyc_status": "verified",
                "kyc_requested": False,  # Request fulfilled
                "kyc_report_id": session_data.get("last_verification_report"),
            }).eq("id", client_id).execute()

            logger.info(f"[KYC Webhook] Client {client_id} verified via Stripe Identity")

        elif event_type in ("identity.verification_session.canceled",
                          "identity.verification_session.requires_input"):
            status = "failed" if "canceled" in event_type else "requires_input"
            reason = session_data.get("last_error", {}).get("reason", "unknown")

            sb.table("clients").update({
                "kyc_status": status,
                "kyc_failure_reason": reason,
            }).eq("id", client_id).execute()

            logger.info(f"[KYC Webhook] Client {client_id} status: {status} - {reason}")

        return {"ok": True, "event_type": event_type, "client_id": client_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"KYC webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
