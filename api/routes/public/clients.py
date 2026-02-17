"""
Public Clients API - Portal Clientes
Client lookup, data access, and KYC endpoints.
"""

import os
import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/clients", tags=["Public - Clients"])

STRIPE_SECRET_KEY = os.getenv("STRIPE_SECRET_KEY")


@router.get("/lookup")
async def lookup_client(email: str = Query(..., description="Client email")):
    """
    Look up a client by email for login purposes.
    """
    try:
        result = sb.table("clients") \
            .select("id, name, email, phone, terreno, status") \
            .eq("email", email.lower()) \
            .single() \
            .execute()
        
        if not result.data:
            return {"ok": False, "error": "Client not found"}
        
        return {
            "ok": True,
            "client": result.data
        }
        
    except Exception as e:
        logger.error(f"Error looking up client: {e}")
        return {"ok": False, "error": "Client not found"}


@router.get("/{client_id}/purchases")
async def get_client_purchases(client_id: str):
    """
    Get all purchases for a client, including RTO info.
    """
    try:
        result = sb.table("sales") \
            .select("""
                id,
                property_id,
                sale_price,
                sale_type,
                status,
                payment_method,
                rto_contract_id,
                rto_monthly_payment,
                rto_term_months,
                created_at,
                completed_at,
                properties(address, city, state, photos),
                title_transfers(id, status, transfer_date)
            """) \
            .eq("client_id", client_id) \
            .order("created_at", desc=True) \
            .execute()
        
        return {
            "ok": True,
            "purchases": result.data
        }
        
    except Exception as e:
        logger.error(f"Error getting client purchases: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{client_id}/rto-contract/{sale_id}")
async def get_client_rto_contract(client_id: str, sale_id: str):
    """
    Get RTO contract details and payment schedule for a client.
    """
    try:
        # Verify the sale belongs to this client
        sale_result = sb.table("sales") \
            .select("id, client_id, rto_contract_id, sale_type") \
            .eq("id", sale_id) \
            .eq("client_id", client_id) \
            .execute()
        
        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        sale = type('Sale', (), {'data': sale_result.data[0]})()
        
        if sale.data.get("sale_type") != "rto":
            raise HTTPException(status_code=400, detail="Esta compra no es Rent-to-Own")
        
        contract_id = sale.data.get("rto_contract_id")
        if not contract_id:
            return {
                "ok": True,
                "contract": None,
                "payments": [],
                "progress": None,
                "message": "Tu solicitud RTO está en revisión. Te notificaremos cuando el contrato esté listo."
            }
        
        # Get contract details
        contract = sb.table("rto_contracts") \
            .select("*, properties(address, city, state, photos, square_feet)") \
            .eq("id", contract_id) \
            .single() \
            .execute()
        
        if not contract.data:
            raise HTTPException(status_code=404, detail="Contrato no encontrado")
        
        c = contract.data
        
        # Get payments
        payments = sb.table("rto_payments") \
            .select("id, payment_number, amount, due_date, paid_date, paid_amount, payment_method, status") \
            .eq("rto_contract_id", contract_id) \
            .order("payment_number") \
            .execute()
        
        payments_data = payments.data or []
        paid = [p for p in payments_data if p["status"] == "paid"]
        total_paid = sum(float(p.get("paid_amount", 0)) for p in paid)
        total_expected = sum(float(p.get("amount", 0)) for p in payments_data)
        
        # Only return safe info to client (no internal notes)
        safe_contract = {
            "id": c["id"],
            "monthly_rent": c["monthly_rent"],
            "purchase_price": c["purchase_price"],
            "down_payment": c["down_payment"],
            "term_months": c["term_months"],
            "start_date": c["start_date"],
            "end_date": c["end_date"],
            "payment_due_day": c.get("payment_due_day", 15),
            "status": c["status"],
            "properties": c.get("properties"),
        }
        
        return {
            "ok": True,
            "contract": safe_contract,
            "payments": payments_data,
            "progress": {
                "payments_made": len(paid),
                "total_payments": len(payments_data),
                "total_paid": total_paid,
                "total_expected": total_expected,
                "remaining_balance": total_expected - total_paid,
                "percentage": round((len(paid) / len(payments_data) * 100), 1) if payments_data else 0,
            }
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting RTO contract for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _extract_docs_from_checklist(checklist: dict, transfer_type: str, transfer_id: str) -> list:
    """Extract documents from title_transfers.documents_checklist JSONB."""
    docs = []
    if not checklist:
        return docs
    
    doc_labels = {
        "bill_of_sale": "Bill of Sale",
        "title_application": "Título de Propiedad",
        "id_copies": "Copias de Identificación",
        "tax_receipt": "Recibo de Impuestos",
        "lien_release": "Lien Release",
        "notarized_forms": "Formularios Notarizados",
    }
    
    for doc_key, doc_info in checklist.items():
        if isinstance(doc_info, dict) and doc_info.get("checked") and doc_info.get("file_url"):
            docs.append({
                "id": f"{transfer_id}_{doc_key}",
                "doc_type": doc_key,
                "doc_label": doc_labels.get(doc_key, doc_key),
                "file_url": doc_info["file_url"],
                "file_name": doc_info["file_url"].split("/")[-1] if doc_info.get("file_url") else None,
                "uploaded_at": doc_info.get("uploaded_at"),
                "source": transfer_type,
            })
    
    return docs


@router.get("/{client_id}/documents")
async def get_client_documents(client_id: str):
    """
    Get all documents for a client's purchases.
    Documents come from title_transfers.documents_checklist (JSONB).
    For each sale we return:
      - Sale title_transfer docs (type=sale, linked to this sale)
      - Purchase title_transfer docs (type=purchase, same property) — e.g. Bill of Sale from when Maninos bought
    """
    try:
        # Get all paid sales for this client with property info
        sales_result = sb.table("sales") \
            .select("id, property_id, sale_price, completed_at") \
            .eq("client_id", client_id) \
            .eq("status", "paid") \
            .execute()
        
        sales_with_docs = []
        
        for sale in sales_result.data or []:
            property_id = sale["property_id"]
            sale_id = sale["id"]
            
            # Fetch property address separately to avoid join issues
            prop_result = sb.table("properties") \
                .select("address, city, state") \
                .eq("id", property_id) \
                .single() \
                .execute()
            
            prop = prop_result.data or {}
            property_address = prop.get("address", "Dirección no disponible")
            property_city = prop.get("city", "")
            property_state = prop.get("state", "TX")
            
            # Get ALL title_transfers for this property
            transfers_result = sb.table("title_transfers") \
                .select("id, transfer_type, status, documents_checklist, notes") \
                .eq("property_id", property_id) \
                .execute()
            
            all_docs = []
            title_status = "pending"
            
            for transfer in transfers_result.data or []:
                # Sale transfer linked to this specific sale
                if transfer["transfer_type"] == "sale" and transfer.get("id"):
                    # Check if this sale transfer belongs to this sale
                    sale_transfer = sb.table("title_transfers") \
                        .select("id, status, documents_checklist") \
                        .eq("property_id", property_id) \
                        .eq("transfer_type", "sale") \
                        .eq("sale_id", sale_id) \
                        .execute()
                    
                    if sale_transfer.data:
                        t = sale_transfer.data[0]
                        title_status = t.get("status", "pending")
                        docs = _extract_docs_from_checklist(
                            t.get("documents_checklist", {}),
                            "sale",
                            t["id"]
                        )
                        all_docs.extend(docs)
                    break
                
            # Also get purchase documents for this property (Maninos' original purchase)
            purchase_transfers = sb.table("title_transfers") \
                .select("id, documents_checklist") \
                .eq("property_id", property_id) \
                .eq("transfer_type", "purchase") \
                .execute()
            
            for pt in purchase_transfers.data or []:
                checklist = pt.get("documents_checklist", {})
                if checklist:
                    # Only include bill_of_sale and title from purchase
                    for key in ["bill_of_sale", "title_application"]:
                        info = checklist.get(key, {})
                        if isinstance(info, dict) and info.get("checked") and info.get("file_url"):
                            # Avoid duplicates
                            exists = any(d["doc_type"] == key and d["source"] == "purchase" for d in all_docs)
                            if not exists:
                                all_docs.append({
                                    "id": f"{pt['id']}_{key}",
                                    "doc_type": key,
                                    "doc_label": "Bill of Sale (Compra)" if key == "bill_of_sale" else "Título (Compra Original)",
                                    "file_url": info["file_url"],
                                    "file_name": info["file_url"].split("/")[-1],
                                    "uploaded_at": info.get("uploaded_at"),
                                    "source": "purchase",
                                })
            
            sales_with_docs.append({
                "id": sale_id,
                "property_address": property_address,
                "property_city": property_city,
                "property_state": property_state,
                "sale_price": sale["sale_price"],
                "completed_at": sale["completed_at"],
                "title_status": title_status,
                "documents": all_docs,
            })
        
        return {
            "ok": True,
            "sales": sales_with_docs,
        }
        
    except Exception as e:
        logger.error(f"Error getting client documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# =============================================================================
# CLIENT KYC — called from the client portal
# =============================================================================

class ClientKYCStart(BaseModel):
    return_url: Optional[str] = None


@router.get("/{client_id}/kyc-status")
async def get_client_kyc_status(client_id: str):
    """
    Client checks their own KYC status.
    Shows whether Capital has requested verification and current status.
    """
    try:
        result = sb.table("clients") \
            .select("id, name, kyc_verified, kyc_verified_at, kyc_status, kyc_requested, kyc_requested_at, kyc_failure_reason, kyc_session_id") \
            .eq("id", client_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        c = result.data[0]

        return {
            "ok": True,
            "kyc_verified": c.get("kyc_verified", False),
            "kyc_status": c.get("kyc_status", "unverified"),
            "kyc_verified_at": c.get("kyc_verified_at"),
            "kyc_requested": c.get("kyc_requested", False),
            "kyc_requested_at": c.get("kyc_requested_at"),
            "kyc_failure_reason": c.get("kyc_failure_reason"),
            "has_session": bool(c.get("kyc_session_id")),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting KYC status for {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/kyc-start")
async def client_start_kyc(client_id: str, data: ClientKYCStart):
    """
    Client initiates their Stripe Identity verification.
    Called from the client portal when they click "Verificar mi identidad".
    """
    try:
        client_result = sb.table("clients") \
            .select("id, name, email, kyc_verified, kyc_status") \
            .eq("id", client_id) \
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
                detail="Servicio de verificación no disponible. Contacta soporte."
            )

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        # Return URL goes back to client portal
        base_url = data.return_url or os.getenv("FRONTEND_URL", "http://localhost:3000")
        return_url = f"{base_url}/clientes/mi-cuenta/verificacion?status=complete"

        # Create verification session
        session = stripe.identity.VerificationSession.create(
            type="document",
            metadata={
                "client_id": client_id,
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

        # Update client record
        sb.table("clients").update({
            "kyc_session_id": session.id,
            "kyc_status": "pending",
            "kyc_type": "document",
            "kyc_failure_reason": None,
        }).eq("id", client_id).execute()

        logger.info(f"[KYC] Client {client_id} started Stripe verification, session {session.id}")

        return {
            "ok": True,
            "session_id": session.id,
            "url": session.url,
            "client_secret": session.client_secret,
            "message": "Sesión de verificación creada. Completa la verificación."
        }

    except HTTPException:
        raise
    except ImportError:
        raise HTTPException(status_code=503, detail="Servicio de verificación no disponible")
    except Exception as e:
        logger.error(f"Error starting KYC for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{client_id}/kyc-check")
async def client_check_kyc(client_id: str):
    """
    Client polls their KYC status after returning from Stripe.
    Updates the DB with the latest Stripe status.
    """
    try:
        client_result = sb.table("clients") \
            .select("id, kyc_session_id, kyc_status, kyc_verified") \
            .eq("id", client_id) \
            .execute()

        if not client_result.data:
            raise HTTPException(status_code=404, detail="Cliente no encontrado")

        client = client_result.data[0]

        if client.get("kyc_verified"):
            return {"ok": True, "verified": True, "status": "verified", "message": "✅ Tu identidad está verificada."}

        session_id = client.get("kyc_session_id")
        if not session_id:
            return {"ok": True, "verified": False, "status": "no_session", "message": "No hay verificación en proceso."}

        if not STRIPE_SECRET_KEY:
            raise HTTPException(status_code=503, detail="Servicio no disponible")

        import stripe
        stripe.api_key = STRIPE_SECRET_KEY

        session = stripe.identity.VerificationSession.retrieve(session_id)

        status_map = {
            "requires_input": "requires_input",
            "processing": "pending",
            "verified": "verified",
            "canceled": "failed",
        }
        our_status = status_map.get(session.status, "pending")
        is_verified = session.status == "verified"

        update_data = {"kyc_status": our_status, "kyc_verified": is_verified}
        if is_verified:
            update_data["kyc_verified_at"] = datetime.utcnow().isoformat()
        if session.status == "requires_input":
            reason = "Verificación incompleta"
            if hasattr(session, 'last_error') and session.last_error:
                reason = str(getattr(session.last_error, 'reason', reason))
            update_data["kyc_failure_reason"] = reason

        sb.table("clients").update(update_data).eq("id", client_id).execute()

        messages = {
            "verified": "✅ ¡Tu identidad ha sido verificada exitosamente!",
            "failed": "❌ La verificación fue cancelada.",
            "requires_input": "⚠️ La verificación no se completó. Puedes reintentar.",
            "pending": "⏳ Tu verificación está siendo procesada...",
        }

        return {
            "ok": True,
            "verified": is_verified,
            "status": our_status,
            "message": messages.get(our_status, f"Estado: {session.status}")
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking KYC for client {client_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

