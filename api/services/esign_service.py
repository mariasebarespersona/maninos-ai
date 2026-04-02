"""
Electronic Signature Service — Self-hosted DocuSign alternative.

Flow:
1. Create envelope with document + signers
2. Generate unsigned PDF
3. Send signing emails with unique token links
4. Signer opens link → views doc → types/draws signature → submits
5. Server overlays signature on PDF → saves signed version
6. When all signers complete → envelope marked as completed → notify all parties

Legal basis: Texas UETA + Federal ESIGN Act.
"""

import logging
import uuid
from datetime import datetime, timedelta
from typing import List, Dict, Optional, Any
from io import BytesIO

logger = logging.getLogger(__name__)


def _get_sb():
    from tools.supabase_client import sb
    return sb


# ═══════════════════════════════════════════════════════════════════
# ENVELOPE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════

def create_envelope(
    name: str,
    document_type: str,
    transaction_type: str = "purchase",
    property_id: Optional[str] = None,
    sale_id: Optional[str] = None,
    signers: List[Dict[str, str]] = None,
    unsigned_pdf_url: Optional[str] = None,
    initiated_by: str = "system",
) -> Dict[str, Any]:
    """
    Create a signature envelope with one or more signers.

    signers: [{"role": "seller", "name": "John Doe", "email": "john@email.com"}, ...]
    """
    sb = _get_sb()
    envelope_id = str(uuid.uuid4())

    # Create envelope
    envelope_data = {
        "id": envelope_id,
        "name": name,
        "document_type": document_type,
        "transaction_type": transaction_type,
        "related_property_id": property_id,
        "related_sale_id": sale_id,
        "unsigned_pdf_url": unsigned_pdf_url,
        "status": "draft",
        "initiated_by": initiated_by,
    }
    sb.table("signature_envelopes").insert(envelope_data).execute()

    # Create signature requests for each signer
    signatures = []
    for signer in (signers or []):
        token = str(uuid.uuid4())
        sig_data = {
            "envelope_id": envelope_id,
            "document_type": document_type,
            "transaction_type": transaction_type,
            "related_property_id": property_id,
            "related_sale_id": sale_id,
            "signer_role": signer["role"],
            "signer_name": signer["name"],
            "signer_email": signer["email"],
            "token": token,
            "token_expires_at": (datetime.utcnow() + timedelta(days=7)).isoformat(),
            "status": "pending",
            "unsigned_pdf_url": unsigned_pdf_url,
            "audit_log": [{"event": "created", "timestamp": datetime.utcnow().isoformat()}],
        }
        result = sb.table("document_signatures").insert(sig_data).execute()
        signatures.append({**sig_data, "id": result.data[0]["id"] if result.data else None})

    logger.info(f"[ESign] Created envelope {envelope_id} with {len(signatures)} signers")
    return {
        "envelope_id": envelope_id,
        "signatures": signatures,
        "status": "draft",
    }


def send_signing_emails(envelope_id: str, base_url: str = "") -> Dict[str, Any]:
    """Send signing request emails to all pending signers in an envelope."""
    sb = _get_sb()

    # Get envelope and signatures
    envelope = sb.table("signature_envelopes").select("*").eq("id", envelope_id).single().execute()
    if not envelope.data:
        return {"ok": False, "error": "Envelope not found"}

    signatures = sb.table("document_signatures").select("*").eq("envelope_id", envelope_id).eq("status", "pending").execute()

    sent = 0
    for sig in (signatures.data or []):
        try:
            signing_url = f"{base_url}/firmar/{sig['token']}"

            # Send email via Resend
            from tools.email_tool import send_email as _send_email
            _send_email(
                to=[sig["signer_email"]],
                subject=f"Firma requerida: {envelope.data['name']}",
                html=f"""
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                    <div style="background: linear-gradient(135deg, #1a2744 0%, #2d3a5c 100%); padding: 30px; text-align: center; border-radius: 12px 12px 0 0;">
                        <h1 style="color: white; margin: 0; font-size: 24px;">Maninos Homes</h1>
                        <p style="color: #c9a96e; margin: 8px 0 0 0; font-size: 14px;">Firma Electrónica</p>
                    </div>
                    <div style="padding: 30px; background: #f9fafb; border-radius: 0 0 12px 12px;">
                        <p style="color: #333; font-size: 16px;">Hola <strong>{sig['signer_name']}</strong>,</p>
                        <p style="color: #555;">Se requiere tu firma en el siguiente documento:</p>
                        <div style="background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0;">
                            <p style="font-weight: bold; color: #1a2744; margin: 0 0 8px 0;">{envelope.data['name']}</p>
                            <p style="color: #666; margin: 0; font-size: 14px;">Rol: {sig['signer_role'].replace('_', ' ').title()}</p>
                        </div>
                        <div style="text-align: center; margin: 25px 0;">
                            <a href="{signing_url}" style="display: inline-block; background: #c9a96e; color: white; text-decoration: none; padding: 14px 40px; border-radius: 8px; font-weight: bold; font-size: 16px;">
                                Firmar Documento
                            </a>
                        </div>
                        <p style="color: #888; font-size: 12px; text-align: center;">
                            Este enlace expira en 7 días. Si no solicitaste esta firma, ignora este email.
                        </p>
                    </div>
                </div>
                """,
            )

            # Update status and audit log
            sb.table("document_signatures").update({
                "status": "pending",
                "audit_log": sig.get("audit_log", []) + [
                    {"event": "email_sent", "timestamp": datetime.utcnow().isoformat(), "email": sig["signer_email"]}
                ],
            }).eq("id", sig["id"]).execute()

            sent += 1
        except Exception as e:
            logger.error(f"[ESign] Failed to send email to {sig['signer_email']}: {e}")

    # Update envelope status
    if sent > 0:
        sb.table("signature_envelopes").update({"status": "sent"}).eq("id", envelope_id).execute()

    logger.info(f"[ESign] Sent {sent} signing emails for envelope {envelope_id}")
    return {"ok": True, "sent": sent}


def get_signing_data(token: str) -> Optional[Dict[str, Any]]:
    """Get document and signer info for a signing token (public endpoint)."""
    sb = _get_sb()

    result = sb.table("document_signatures").select("*, signature_envelopes(*)").eq("token", token).single().execute()
    if not result.data:
        return None

    sig = result.data

    # Check expiry
    if sig.get("token_expires_at"):
        expires = datetime.fromisoformat(sig["token_expires_at"].replace("Z", "+00:00"))
        if datetime.utcnow().replace(tzinfo=expires.tzinfo) > expires:
            sb.table("document_signatures").update({"status": "expired"}).eq("id", sig["id"]).execute()
            return None

    # Check if already signed
    if sig["status"] == "signed":
        return {**sig, "already_signed": True}

    # Mark as viewed
    if sig["status"] == "pending":
        sb.table("document_signatures").update({
            "status": "viewed",
            "audit_log": sig.get("audit_log", []) + [
                {"event": "viewed", "timestamp": datetime.utcnow().isoformat()}
            ],
        }).eq("id", sig["id"]).execute()

    return sig


def apply_signature(
    token: str,
    signature_data: Dict[str, Any],
    ip_address: str = "",
    user_agent: str = "",
) -> Dict[str, Any]:
    """Apply a signature to a document."""
    sb = _get_sb()

    # Get signature request
    result = sb.table("document_signatures").select("*").eq("token", token).single().execute()
    if not result.data:
        return {"ok": False, "error": "Token not found"}

    sig = result.data
    if sig["status"] == "signed":
        return {"ok": False, "error": "Already signed"}

    # Save signature
    now = datetime.utcnow().isoformat()
    audit_entry = {
        "event": "signed",
        "timestamp": now,
        "ip": ip_address,
        "user_agent": user_agent[:200] if user_agent else "",
        "signature_type": signature_data.get("type", "typed"),
    }

    sb.table("document_signatures").update({
        "status": "signed",
        "signature_data": signature_data,
        "signed_at": now,
        "signed_ip": ip_address,
        "signed_user_agent": user_agent[:500] if user_agent else "",
        "audit_log": sig.get("audit_log", []) + [audit_entry],
    }).eq("id", sig["id"]).execute()

    logger.info(f"[ESign] Signature applied: {sig['signer_name']} ({sig['signer_role']}) on envelope {sig['envelope_id']}")

    # Update property document_data with the signature
    try:
        envelope_data = sb.table("signature_envelopes").select("name, related_property_id, document_type, transaction_type").eq("id", sig.get("envelope_id")).single().execute()
        env_name = envelope_data.data.get("name", "Documento") if envelope_data.data else "Documento"
        prop_id = envelope_data.data.get("related_property_id") if envelope_data.data else None
        doc_type = envelope_data.data.get("document_type") if envelope_data.data else None
        txn_type = envelope_data.data.get("transaction_type", "purchase") if envelope_data.data else "purchase"

        # If this is a bill_of_sale signature, update the property's document_data
        if prop_id and doc_type == "bill_of_sale":
            doc_key = f"bos_{txn_type}"  # e.g. "bos_purchase" or "bos_sale"
            try:
                prop = sb.table("properties").select("document_data").eq("id", prop_id).single().execute()
                if prop.data:
                    doc_data = prop.data.get("document_data") or {}
                    bos_data = doc_data.get(doc_key) or {}

                    # Use the ACTUAL signed value (what they typed/drew), not the pre-set signer_name
                    sig_type = signature_data.get("type", "typed")
                    sig_value = signature_data.get("value", sig["signer_name"])
                    signed_date = now[:10]  # YYYY-MM-DD

                    if sig["signer_role"] == "seller":
                        bos_data["seller_date"] = signed_date
                        bos_data["seller_signed_at"] = now
                        bos_data["seller_signature_type"] = sig_type
                        if sig_type == "drawn":
                            # Keep human name as text, store drawing as separate image
                            bos_data["seller_name"] = sig["signer_name"]
                            bos_data["seller_signature_image"] = sig_value
                        else:
                            bos_data["seller_name"] = sig_value
                    elif sig["signer_role"] in ("buyer", "buyer2"):
                        bos_data["buyer_date"] = signed_date
                        bos_data["buyer_signed_at"] = now
                        bos_data["buyer_signature_type"] = sig_type
                        if sig_type == "drawn":
                            bos_data["buyer_name"] = sig["signer_name"]
                            bos_data["buyer_signature_image"] = sig_value
                        else:
                            bos_data["buyer_name"] = sig_value

                    doc_data[doc_key] = bos_data
                    sb.table("properties").update({"document_data": doc_data}).eq("id", prop_id).execute()
                    logger.info(f"[ESign] Updated property {prop_id} document_data.{doc_key} with {sig['signer_role']} signature")
            except Exception as prop_err:
                logger.warning(f"[ESign] Could not update property document_data: {prop_err}")

        # If title_application signature, store in document_data under "title_app" key
        if prop_id and doc_type == "title_application":
            try:
                prop = sb.table("properties").select("document_data").eq("id", prop_id).single().execute()
                if prop.data:
                    doc_data = prop.data.get("document_data") or {}
                    ta_data = doc_data.get("title_app") or {}

                    if sig["signer_role"] == "seller":
                        ta_data["seller_date"] = now[:10]
                        ta_data["seller_signed_at"] = now
                        ta_data["seller_signature_type"] = sig_type
                        if sig_type == "drawn":
                            ta_data["seller_name"] = sig["signer_name"]
                            ta_data["seller_signature_image"] = sig_value
                        else:
                            ta_data["seller_name"] = sig_value
                    elif sig["signer_role"] in ("buyer", "buyer2"):
                        ta_data["buyer_date"] = now[:10]
                        ta_data["buyer_signed_at"] = now
                        ta_data["buyer_signature_type"] = sig_type
                        if sig_type == "drawn":
                            ta_data["buyer_name"] = sig["signer_name"]
                            ta_data["buyer_signature_image"] = sig_value
                        else:
                            ta_data["buyer_name"] = sig_value

                    doc_data["title_app"] = ta_data
                    sb.table("properties").update({"document_data": doc_data}).eq("id", prop_id).execute()
                    logger.info(f"[ESign] Updated property {prop_id} document_data.title_app with {sig['signer_role']} signature")
            except Exception as ta_err:
                logger.warning(f"[ESign] Could not update title_app document_data: {ta_err}")

        # Also store signature info on the envelope's listing review_progress (for pre-purchase)
        if not prop_id and envelope_data.data:
            try:
                env_json = envelope_data.data.get("data") or {}
                listing_id = env_json.get("listing_id")
                if listing_id:
                    listing = sb.table("market_listings").select("review_progress").eq("id", listing_id).single().execute()
                    if listing.data:
                        rp = listing.data.get("review_progress") or {}
                        sig_key = f"{doc_type}_{sig['signer_role']}"
                        rp[sig_key] = {
                            "signed": True,
                            "signer_name": sig["signer_name"],
                            "signature_type": sig_type,
                            "signed_at": now,
                        }
                        if sig_type == "drawn":
                            rp[sig_key]["signature_image"] = sig_value[:100] + "..."  # Store truncated ref, full is in document_signatures
                        sb.table("market_listings").update({"review_progress": rp}).eq("id", listing_id).execute()
                        logger.info(f"[ESign] Updated listing {listing_id} review_progress with {sig_key}")
            except Exception as lp_err:
                logger.warning(f"[ESign] Could not update listing review_progress: {lp_err}")

        # Also check: if no property yet (purchase from market), update the market listing's review_progress
        if not prop_id and sig.get("related_sale_id") is None:
            # Try to find the listing via the envelope name or other link
            pass  # Market listings get the property created on confirmPurchase

        sb.table("notifications").insert({
            "type": "signature_received",
            "title": f"Firma recibida: {sig['signer_name']}",
            "message": f"{sig['signer_name']} ({sig['signer_role']}) ha firmado el documento '{env_name}'",
            "related_entity_type": "property",
            "related_entity_id": prop_id,
            "priority": "high",
        }).execute()
        logger.info(f"[ESign] Notification created for signature by {sig['signer_name']}")
    except Exception as notif_err:
        logger.warning(f"[ESign] Could not create notification: {notif_err}")

    # Check if all signatures in envelope are complete
    envelope_id = sig.get("envelope_id")
    if envelope_id:
        all_sigs = sb.table("document_signatures").select("status").eq("envelope_id", envelope_id).execute()
        all_signed = all(s["status"] == "signed" for s in (all_sigs.data or []))

        if all_signed:
            sb.table("signature_envelopes").update({
                "status": "completed",
                "completed_at": now,
            }).eq("id", envelope_id).execute()

            # Notify: all signatures complete
            try:
                sb.table("notifications").insert({
                    "type": "document_completed",
                    "title": f"Documento completado: {env_name}",
                    "message": f"Todas las firmas recibidas para '{env_name}'. El documento está listo.",
                    "related_entity_type": "property",
                    "related_entity_id": prop_id,
                    "priority": "high",
                }).execute()
            except Exception:
                pass
            logger.info(f"[ESign] ✅ Envelope {envelope_id} fully signed!")

            # TODO: Generate final signed PDF with all signatures overlaid
            # TODO: Send completion email to all parties

    return {"ok": True, "signed": True, "all_complete": envelope_id and all_signed if envelope_id else False}


def get_envelope_status(envelope_id: str) -> Optional[Dict[str, Any]]:
    """Get full envelope status with all signature details."""
    sb = _get_sb()

    envelope = sb.table("signature_envelopes").select("*").eq("id", envelope_id).single().execute()
    if not envelope.data:
        return None

    signatures = sb.table("document_signatures").select("*").eq("envelope_id", envelope_id).execute()

    return {
        "envelope": envelope.data,
        "signatures": signatures.data or [],
        "all_signed": all(s["status"] == "signed" for s in (signatures.data or [])),
    }
