"""
Capital KYC - Manual Identity Verification

Flow:
1. Capital clicks "Solicitar Verificación" → sets kyc_requested=True on client
2. Client logs into portal, sees KYC banner → uploads ID photos + selfie
3. Capital reviews the uploaded documents → approves or rejects
4. If rejected, client can re-upload

No external services needed. Photos stored in Supabase Storage.
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/kyc", tags=["Capital - KYC"])


# =============================================================================
# SCHEMAS
# =============================================================================

class KYCRequestVerification(BaseModel):
    """Capital requests a client to verify their identity."""
    client_id: str


class KYCReviewDocuments(BaseModel):
    """Capital reviews uploaded KYC documents."""
    client_id: str
    decision: str  # "approved" or "rejected"
    reviewed_by: str = "admin"
    notes: Optional[str] = None


class KYCManualVerify(BaseModel):
    """Manual verification without documents (admin override)."""
    client_id: str
    verified_by: str = "admin"
    id_type: str = "manual"
    notes: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/status/{client_id}")
async def get_kyc_status(client_id: str):
    """Get current KYC verification status for a client, including uploaded doc URLs."""
    try:
        result = sb.table("clients") \
            .select("id, name, email, phone, kyc_verified, kyc_verified_at, kyc_status, kyc_type, kyc_failure_reason, kyc_requested, kyc_requested_at, kyc_documents, kyc_reviewed_by, kyc_reviewed_at") \
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
                "kyc_failure_reason": None,
                "kyc_requested": False,
                "kyc_requested_at": None,
                "kyc_documents": None,
                "kyc_reviewed_by": None,
                "kyc_reviewed_at": None,
                "has_documents": False,
                "client_found": False,
            }

        client = result.data[0]
        docs = client.get("kyc_documents") or {}

        return {
            "ok": True,
            "client_id": client["id"],
            "client_name": client.get("name"),
            "client_email": client.get("email"),
            "client_phone": client.get("phone"),
            "kyc_verified": client.get("kyc_verified", False),
            "kyc_status": client.get("kyc_status", "unverified"),
            "kyc_verified_at": client.get("kyc_verified_at"),
            "kyc_type": client.get("kyc_type"),
            "kyc_failure_reason": client.get("kyc_failure_reason"),
            "kyc_requested": client.get("kyc_requested", False),
            "kyc_requested_at": client.get("kyc_requested_at"),
            "kyc_documents": docs,
            "kyc_reviewed_by": client.get("kyc_reviewed_by"),
            "kyc_reviewed_at": client.get("kyc_reviewed_at"),
            "has_documents": bool(docs.get("id_front_url") or docs.get("selfie_url")),
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
            "kyc_failure_reason": None,
            "kyc_reviewed_by": None,
            "kyc_reviewed_at": None,
        }).eq("id", data.client_id).execute()

        logger.info(f"[KYC] Verification requested for client {data.client_id} ({client.get('name')})")

        return {
            "ok": True,
            "message": f"Solicitud de verificación enviada a {client.get('name')}. El cliente debe subir sus documentos desde su portal.",
            "client_name": client.get("name"),
            "client_email": client.get("email"),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error requesting KYC for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/review")
async def review_kyc_documents(data: KYCReviewDocuments):
    """
    Capital reviews the uploaded KYC documents and approves or rejects.
    
    Decision:
    - "approved" → kyc_verified=True, kyc_status='verified'
    - "rejected" → kyc_verified=False, kyc_status='failed', client can re-upload
    """
    try:
        if data.decision not in ("approved", "rejected"):
            raise HTTPException(status_code=400, detail="Decisión inválida. Use 'approved' o 'rejected'.")

        client_result = sb.table("clients") \
            .select("id, name, kyc_verified, kyc_status, kyc_documents") \
            .eq("id", data.client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]

        if client.get("kyc_verified"):
            return {"ok": True, "message": "Cliente ya verificado", "already_verified": True}

        docs = client.get("kyc_documents") or {}
        if not docs.get("id_front_url"):
            raise HTTPException(status_code=400, detail="El cliente no ha subido documentos aún.")

        now = datetime.utcnow().isoformat()

        if data.decision == "approved":
            sb.table("clients").update({
                "kyc_verified": True,
                "kyc_verified_at": now,
                "kyc_status": "verified",
                "kyc_type": docs.get("id_type", "document"),
                "kyc_failure_reason": None,
                "kyc_requested": False,
                "kyc_reviewed_by": data.reviewed_by,
                "kyc_reviewed_at": now,
            }).eq("id", data.client_id).execute()

            logger.info(f"[KYC] Client {data.client_id} ({client.get('name')}) APPROVED by {data.reviewed_by}")

            return {
                "ok": True,
                "message": f"✅ {client.get('name')} verificado exitosamente.",
                "verified": True,
            }
        else:
            reason = data.notes or "Los documentos enviados no cumplieron los requisitos. Por favor, vuelve a subirlos."
            sb.table("clients").update({
                "kyc_verified": False,
                "kyc_status": "failed",
                "kyc_failure_reason": reason,
                "kyc_reviewed_by": data.reviewed_by,
                "kyc_reviewed_at": now,
            }).eq("id", data.client_id).execute()

            logger.info(f"[KYC] Client {data.client_id} ({client.get('name')}) REJECTED by {data.reviewed_by}: {reason}")

            return {
                "ok": True,
                "message": f"❌ Documentos de {client.get('name')} rechazados. El cliente puede reintentar.",
                "verified": False,
            }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reviewing KYC for {data.client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/manual-verify")
async def manual_verify(data: KYCManualVerify):
    """
    Manually verify a client's identity (admin override).
    Use for trusted clients or when document upload isn't needed.
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

        now = datetime.utcnow().isoformat()
        sb.table("clients").update({
            "kyc_verified": True,
            "kyc_verified_at": now,
            "kyc_status": "verified",
            "kyc_type": data.id_type,
            "kyc_failure_reason": None,
            "kyc_requested": False,
            "kyc_reviewed_by": data.verified_by,
            "kyc_reviewed_at": now,
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
