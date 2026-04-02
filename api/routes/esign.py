"""
Electronic Signature API Routes.

Public endpoints for signing (no auth — token is auth).
Protected endpoints for creating/managing envelopes (staff only).
"""

from fastapi import APIRouter, HTTPException, Request, Query
from pydantic import BaseModel
from typing import Optional, List
import logging
import os

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/esign", tags=["E-Signatures"])

APP_URL = os.environ.get("APP_URL", "https://maninos-ai.vercel.app")


# ═══════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════

class SignerInput(BaseModel):
    role: str  # 'seller', 'buyer', 'buyer2', 'landlord', 'tenant'
    name: str
    email: str


class CreateEnvelopeRequest(BaseModel):
    name: str
    document_type: str  # 'bill_of_sale', 'title_application', 'rto_lease'
    transaction_type: str = "purchase"
    property_id: Optional[str] = None
    sale_id: Optional[str] = None
    signers: List[SignerInput]
    unsigned_pdf_url: Optional[str] = None
    send_immediately: bool = True
    data: Optional[dict] = None  # Extra data (listing_id, etc.)


class SignatureSubmission(BaseModel):
    type: str  # 'typed' or 'drawn'
    value: str  # Name string or base64 image
    font: Optional[str] = None
    consent: bool = True  # Must be True


# ═══════════════════════════════════════════════════════════════════
# STAFF ENDPOINTS (create/manage envelopes)
# ═══════════════════════════════════════════════════════════════════

@router.post("/envelopes")
async def create_envelope(req: CreateEnvelopeRequest):
    """Create a signature envelope and optionally send signing emails."""
    from api.services.esign_service import create_envelope, send_signing_emails

    result = create_envelope(
        name=req.name,
        document_type=req.document_type,
        transaction_type=req.transaction_type,
        property_id=req.property_id,
        sale_id=req.sale_id,
        signers=[s.model_dump() for s in req.signers],
        unsigned_pdf_url=req.unsigned_pdf_url,
        data=req.data,
    )

    if req.send_immediately:
        send_result = send_signing_emails(result["envelope_id"], base_url=APP_URL)
        result["emails_sent"] = send_result.get("sent", 0)

    return {"ok": True, **result}


@router.get("/envelopes/{envelope_id}")
async def get_envelope(envelope_id: str):
    """Get envelope status with all signature details."""
    from api.services.esign_service import get_envelope_status

    result = get_envelope_status(envelope_id)
    if not result:
        raise HTTPException(status_code=404, detail="Envelope not found")

    return {"ok": True, **result}


@router.post("/envelopes/{envelope_id}/send")
async def send_envelope(envelope_id: str):
    """Send (or resend) signing emails for an envelope."""
    from api.services.esign_service import send_signing_emails

    result = send_signing_emails(envelope_id, base_url=APP_URL)
    return result


@router.post("/envelopes/{envelope_id}/void")
async def void_envelope(envelope_id: str):
    """Void/cancel an envelope — revokes all pending signatures."""
    from tools.supabase_client import sb

    sb.table("signature_envelopes").update({
        "status": "voided",
        "voided_at": __import__("datetime").datetime.utcnow().isoformat(),
    }).eq("id", envelope_id).execute()

    sb.table("document_signatures").update({
        "status": "revoked",
    }).eq("envelope_id", envelope_id).neq("status", "signed").execute()

    return {"ok": True, "voided": True}


# ═══════════════════════════════════════════════════════════════════
# PUBLIC ENDPOINTS (signing — no auth, token is auth)
# ═══════════════════════════════════════════════════════════════════

@router.get("/sign/{token}")
async def get_signing_page(token: str):
    """Get document data for signing (public endpoint)."""
    from api.services.esign_service import get_signing_data

    data = get_signing_data(token)
    if not data:
        raise HTTPException(status_code=404, detail="Enlace inválido o expirado")

    return {
        "ok": True,
        "signer_name": data.get("signer_name"),
        "signer_role": data.get("signer_role"),
        "document_type": data.get("document_type"),
        "unsigned_pdf_url": data.get("unsigned_pdf_url"),
        "envelope_name": data.get("signature_envelopes", {}).get("name") if data.get("signature_envelopes") else None,
        "already_signed": data.get("already_signed", False),
        "status": data.get("status"),
    }


@router.post("/sign/{token}")
async def submit_signature(token: str, sig: SignatureSubmission, request: Request):
    """Submit a signature (public endpoint)."""
    if not sig.consent:
        raise HTTPException(status_code=400, detail="Debe aceptar el consentimiento de firma electrónica")

    from api.services.esign_service import apply_signature

    ip = request.client.host if request.client else ""
    ua = request.headers.get("user-agent", "")

    result = apply_signature(
        token=token,
        signature_data={"type": sig.type, "value": sig.value, "font": sig.font},
        ip_address=ip,
        user_agent=ua,
    )

    if not result.get("ok"):
        raise HTTPException(status_code=400, detail=result.get("error", "Error al firmar"))

    return {"ok": True, "signed": True, "all_complete": result.get("all_complete", False)}


@router.get("/property/{property_id}/envelopes")
async def list_property_envelopes(property_id: str):
    """List all signature envelopes for a property."""
    from tools.supabase_client import sb

    result = sb.table("signature_envelopes").select("*, document_signatures(*)") \
        .eq("related_property_id", property_id) \
        .order("created_at", desc=True).execute()

    return {"ok": True, "envelopes": result.data or []}


@router.get("/listing/{listing_id}/envelopes")
async def list_listing_envelopes(listing_id: str):
    """List all signature envelopes for a market listing (pre-purchase, no property yet)."""
    from tools.supabase_client import sb

    # Envelopes store listing_id in the 'data' JSONB column
    result = sb.table("signature_envelopes").select("*, document_signatures(*)") \
        .order("created_at", desc=True).execute()

    # Filter by listing_id in data JSON (Supabase doesn't support JSONB path filter easily)
    envelopes = [
        e for e in (result.data or [])
        if (e.get("data") or {}).get("listing_id") == listing_id
    ]

    return {"ok": True, "envelopes": envelopes}
