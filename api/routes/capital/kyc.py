"""
Capital KYC - Identity verification via Sumsub

Flow:
1. Capital clicks "Solicitar Verificación" → sets kyc_requested=True on client
2. Client logs into portal, sees KYC banner → clicks to start verification
3. Sumsub Web SDK loads inline, client completes document + selfie verification
4. Sumsub processes automatically (AI matching, liveness, document OCR)
5. Sumsub webhook fires → backend updates client status
6. Capital sees result (via polling or webhook)
"""

import json
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel
from tools.supabase_client import sb
from api.services import sumsub_service

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["Capital - KYC"])


# =============================================================================
# SCHEMAS
# =============================================================================

class KYCRequestVerification(BaseModel):
    """Capital requests a client to verify their identity."""
    client_id: str


class KYCCreateSession(BaseModel):
    """Create a Sumsub verification session."""
    client_id: str
    return_url: Optional[str] = None


class KYCManualVerify(BaseModel):
    """Manual verification when Sumsub is not available."""
    client_id: str
    verified_by: str = "admin"
    id_type: str = "manual"
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
                "has_session": False,
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
            "has_session": bool(client.get("kyc_session_id")),
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

        # Set the request flag and RESET any stale KYC state
        sb.table("clients").update({
            "kyc_requested": True,
            "kyc_requested_at": datetime.utcnow().isoformat(),
            "kyc_status": "unverified",
            "kyc_verified": False,
            "kyc_verified_at": None,
            "kyc_session_id": None,
            "kyc_failure_reason": None,
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
    Create a Sumsub verification session.
    Returns an access token for the Sumsub Web SDK.
    Called from the CLIENT portal when the client clicks to verify.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, name, email, phone, kyc_verified, kyc_status, kyc_session_id") \
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

        if not sumsub_service.is_configured():
            raise HTTPException(
                status_code=503,
                detail="Servicio de verificación no configurado. Contacta a soporte."
            )

        # Create or get existing Sumsub applicant
        external_user_id = data.client_id
        applicant = await sumsub_service.get_applicant_by_external_id(external_user_id)

        if not applicant:
            applicant = await sumsub_service.create_applicant(
                external_user_id=external_user_id,
                email=client.get("email", ""),
                phone=client.get("phone", ""),
                name=client.get("name", ""),
            )

        applicant_id = applicant.get("id")

        # Generate access token for Web SDK
        token_data = await sumsub_service.get_access_token(external_user_id)
        access_token = token_data.get("token")

        # Update client with Sumsub applicant ID
        sb.table("clients").update({
            "kyc_session_id": applicant_id,
            "kyc_status": "pending",
            "kyc_type": "sumsub",
            "kyc_failure_reason": None,
        }).eq("id", data.client_id).execute()

        logger.info(f"[KYC] Sumsub session created for client {data.client_id}, applicant {applicant_id}")

        return {
            "ok": True,
            "access_token": access_token,
            "applicant_id": applicant_id,
            "message": "Sesión de verificación creada. Completa la verificación."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating KYC session for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/check-session/{client_id}")
async def check_verification_session(client_id: str):
    """
    Check the status of a pending verification with Sumsub.
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
        applicant_id = client.get("kyc_session_id")

        if not client.get("kyc_requested"):
            return {
                "ok": True,
                "status": "not_requested",
                "verified": False,
                "message": "No se ha solicitado verificación para este cliente. Use 'Solicitar Verificación' primero."
            }

        if not applicant_id:
            return {
                "ok": True,
                "status": "no_session",
                "verified": False,
                "message": "No hay sesión de verificación activa. El cliente aún no ha iniciado la verificación."
            }

        if not sumsub_service.is_configured():
            raise HTTPException(status_code=503, detail="Sumsub no configurado")

        # Check Sumsub applicant status
        status_data = await sumsub_service.get_applicant_status(applicant_id)

        review_status = status_data.get("reviewStatus", "init")
        review_result = status_data.get("reviewResult", {})
        review_answer = review_result.get("reviewAnswer", "")
        reject_labels = review_result.get("rejectLabels", [])

        # Map Sumsub status to our internal status
        if review_answer == "GREEN":
            our_status = "verified"
            is_verified = True
        elif review_answer == "RED":
            our_status = "failed"
            is_verified = False
        elif review_status in ("pending", "queued", "prechecked"):
            our_status = "pending"
            is_verified = False
        elif review_status == "init":
            our_status = "requires_input"
            is_verified = False
        else:
            our_status = "pending"
            is_verified = False

        update_data = {
            "kyc_status": our_status,
            "kyc_verified": is_verified,
        }

        if is_verified:
            update_data["kyc_verified_at"] = datetime.utcnow().isoformat()
            update_data["kyc_requested"] = False

        if our_status == "failed":
            reason = ", ".join(reject_labels) if reject_labels else "Verificación rechazada"
            update_data["kyc_failure_reason"] = reason

        if our_status == "requires_input":
            update_data["kyc_failure_reason"] = "El cliente necesita completar o reintentar la verificación."

        sb.table("clients").update(update_data).eq("id", client_id).execute()

        messages = {
            "verified": "✅ Verificación de identidad completada exitosamente.",
            "failed": "❌ La verificación fue rechazada.",
            "requires_input": "⚠️ El cliente necesita completar o reintentar la verificación.",
            "pending": "⏳ La verificación aún está en proceso...",
        }

        return {
            "ok": True,
            "status": our_status,
            "verified": is_verified,
            "sumsub_status": review_status,
            "message": messages.get(our_status, f"Estado: {review_status}")
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
    Use when Sumsub is unavailable or for trusted clients.
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
    Sumsub webhook handler.
    Receives applicantReviewed events when verification is complete.

    Set up in Sumsub Dashboard → Webhooks:
    - URL: https://your-api.com/api/capital/kyc/webhook
    - Events: applicantReviewed, applicantPending
    """
    try:
        payload = await request.body()

        # Verify webhook signature
        digest = request.headers.get("x-payload-digest", "")
        if not sumsub_service.verify_webhook_signature(payload, digest):
            raise HTTPException(status_code=400, detail="Invalid webhook signature")

        event = json.loads(payload)
        event_type = event.get("type", "")
        external_user_id = event.get("externalUserId", "")
        applicant_id = event.get("applicantId", "")
        review_result = event.get("reviewResult", {})
        review_answer = review_result.get("reviewAnswer", "")
        reject_labels = review_result.get("rejectLabels", [])

        if not external_user_id:
            return {"ok": True, "message": "No externalUserId in payload, skipping"}

        # Find client by ID (external_user_id = client_id)
        client_check = sb.table("clients") \
            .select("id, kyc_requested, kyc_verified") \
            .eq("id", external_user_id) \
            .execute()

        if not client_check.data:
            return {"ok": True, "message": f"Client {external_user_id} not found, skipping"}

        client_row = client_check.data[0]

        # Guard: ignore webhook if Capital never requested verification
        if not client_row.get("kyc_requested") and not client_row.get("kyc_verified"):
            logger.warning(f"[KYC Webhook] Ignoring event for client {external_user_id} — kyc_requested=false")
            return {"ok": True, "message": "KYC not requested by Capital, ignoring", "client_id": external_user_id}

        if event_type == "applicantReviewed":
            if review_answer == "GREEN":
                sb.table("clients").update({
                    "kyc_verified": True,
                    "kyc_verified_at": datetime.utcnow().isoformat(),
                    "kyc_status": "verified",
                    "kyc_requested": False,
                    "kyc_failure_reason": None,
                }).eq("id", external_user_id).execute()

                logger.info(f"[KYC Webhook] Client {external_user_id} VERIFIED via Sumsub")

            elif review_answer == "RED":
                reason = ", ".join(reject_labels) if reject_labels else "Verificación rechazada"
                reject_type = review_result.get("reviewRejectType", "FINAL")

                sb.table("clients").update({
                    "kyc_status": "failed" if reject_type == "FINAL" else "requires_input",
                    "kyc_failure_reason": reason,
                }).eq("id", external_user_id).execute()

                logger.info(f"[KYC Webhook] Client {external_user_id} REJECTED: {reason} (type: {reject_type})")

        elif event_type == "applicantPending":
            sb.table("clients").update({
                "kyc_status": "pending",
            }).eq("id", external_user_id).execute()

            logger.info(f"[KYC Webhook] Client {external_user_id} pending review")

        return {"ok": True, "event_type": event_type, "client_id": external_user_id}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"KYC webhook error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
