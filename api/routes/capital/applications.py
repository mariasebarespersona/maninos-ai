"""
Capital Applications - Review and manage RTO applications
Phase 2: Adquirir
"""

from datetime import datetime, date
from dateutil.relativedelta import relativedelta
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/applications", tags=["Capital - Applications"])


# =============================================================================
# SCHEMAS
# =============================================================================

class ApplicationReview(BaseModel):
    """Review an RTO application."""
    status: str  # 'approved', 'rejected', 'needs_info', 'under_review'
    review_notes: Optional[str] = None
    reviewed_by: Optional[str] = None
    # If approving, optionally set financial terms
    monthly_rent: Optional[float] = None
    term_months: Optional[int] = None
    down_payment: Optional[float] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.get("/")
async def list_applications(status: Optional[str] = None):
    """List all RTO applications, optionally filtered by status."""
    try:
        query = sb.table("rto_applications") \
            .select("*, clients(id, name, email, phone, kyc_verified, kyc_status), properties(id, address, city, state, sale_price, photos), sales(id, sale_price, status)")
        
        if status:
            query = query.eq("status", status)
        
        result = query.order("created_at", desc=True).execute()
        return {"ok": True, "applications": result.data or []}
    except Exception as e:
        logger.error(f"Error listing applications: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{application_id}")
async def get_application(application_id: str):
    """Get detailed application info."""
    try:
        result = sb.table("rto_applications") \
            .select("*, clients(*), properties(*), sales!rto_applications_sale_id_fkey(*)") \
            .eq("id", application_id) \
            .execute()
        
        if not result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        return {"ok": True, "application": result.data[0]}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting application {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.put("/{application_id}/review")
@router.post("/{application_id}/review")
async def review_application(application_id: str, review: ApplicationReview):
    """
    Review an RTO application.
    - If approved: updates sales status, can optionally set contract terms.
    - If rejected: updates application and sales status.
    """
    try:
        # Get application
        app_result = sb.table("rto_applications") \
            .select("*, sales(*), properties(*), clients(*)") \
            .eq("id", application_id) \
            .single() \
            .execute()
        
        if not app_result.data:
            raise HTTPException(status_code=404, detail="Solicitud no encontrada")
        
        application = app_result.data
        
        # Validate status transition
        valid_statuses = ["approved", "rejected", "needs_info", "under_review"]
        if review.status not in valid_statuses:
            raise HTTPException(
                status_code=400,
                detail=f"Estado inválido. Usa: {', '.join(valid_statuses)}"
            )
        
        # Update application
        update_data = {
            "status": review.status,
            "reviewed_at": datetime.utcnow().isoformat(),
            "review_notes": review.review_notes,
            "reviewed_by": review.reviewed_by or "admin",
        }
        
        sb.table("rto_applications") \
            .update(update_data) \
            .eq("id", application_id) \
            .execute()
        
        # Side effects based on decision
        if review.status == "approved":
            # Get property info for contract
            prop_result = sb.table("properties") \
                .select("sale_price, hud_number, year") \
                .eq("id", application["property_id"]) \
                .execute()
            prop_data = prop_result.data[0] if prop_result.data else {}
            
            sale_price = float(prop_data.get("sale_price") or 0)
            monthly_rent = review.monthly_rent or 0
            term_months = review.term_months or 36
            down_payment = review.down_payment or 0
            
            # Update sale status to rto_approved
            sb.table("sales").update({
                "status": "rto_approved",
                "rto_monthly_payment": monthly_rent,
                "rto_term_months": term_months,
                "rto_down_payment": down_payment,
            }).eq("id", application["sale_id"]).execute()
            
            # Update client status to rto_active
            sb.table("clients").update({
                "status": "rto_active"
            }).eq("id", application["client_id"]).execute()
            
            # Create RTO contract automatically
            start = date.today()
            end = start + relativedelta(months=term_months)
            
            existing_contract = sb.table("rto_contracts") \
                .select("id") \
                .eq("sale_id", application["sale_id"]) \
                .execute()
            
            if not existing_contract.data:
                contract_data = {
                    "sale_id": application["sale_id"],
                    "property_id": application["property_id"],
                    "client_id": application["client_id"],
                    "monthly_rent": monthly_rent,
                    "purchase_price": sale_price,
                    "down_payment": down_payment,
                    "term_months": term_months,
                    "start_date": start.isoformat(),
                    "end_date": end.isoformat(),
                    "hud_number": prop_data.get("hud_number"),
                    "property_year": prop_data.get("year"),
                    "status": "draft",
                    "notes": f"Contrato generado automáticamente al aprobar solicitud {application_id}",
                }
                sb.table("rto_contracts").insert(contract_data).execute()
                logger.info(f"[capital] RTO contract created for application {application_id}")
            
            # Create title transfer: Maninos Homes → Maninos Capital
            # (Capital acquires the property — docs come in Capital's name)
            existing_transfer = sb.table("title_transfers") \
                .select("id") \
                .eq("property_id", application["property_id"]) \
                .eq("to_name", "Maninos Capital LLC") \
                .eq("transfer_type", "sale") \
                .execute()
            
            if not existing_transfer.data:
                # Look for existing purchase transfer (Seller → Homes) to carry over documents
                purchase_transfer = sb.table("title_transfers") \
                    .select("documents_checklist") \
                    .eq("property_id", application["property_id"]) \
                    .eq("transfer_type", "purchase") \
                    .execute()
                
                # Build documents checklist, copying any existing docs from purchase
                docs_checklist = {
                    "bill_of_sale": False,
                    "titulo": False,
                    "title_application": False,
                    "tax_receipt": False,
                    "id_copies": False,
                    "lien_release": False,
                    "notarized_forms": False,
                }
                
                if purchase_transfer.data:
                    purchase_docs = purchase_transfer.data[0].get("documents_checklist", {})
                    for doc_key in ["bill_of_sale", "titulo", "title_application", "tax_receipt", "id_copies", "lien_release", "notarized_forms"]:
                        src = purchase_docs.get(doc_key)
                        if src and isinstance(src, dict) and src.get("file_url"):
                            # Copy the file URL from the purchase transfer
                            docs_checklist[doc_key] = {
                                "checked": True,
                                "file_url": src["file_url"],
                                "uploaded_at": src.get("uploaded_at"),
                                "copied_from": "purchase_transfer",
                            }
                            logger.info(f"[capital] Copied {doc_key} from purchase transfer for property {application['property_id']}")
                        elif src and isinstance(src, bool) and src:
                            docs_checklist[doc_key] = True
                
                sb.table("title_transfers").insert({
                    "property_id": application["property_id"],
                    "sale_id": application["sale_id"],
                    "transfer_type": "sale",
                    "from_name": "Maninos Homes LLC",
                    "to_name": "Maninos Capital LLC",
                    "status": "pending",
                    "documents_checklist": docs_checklist,
                    "notes": f"Adquisición RTO - Capital adquiere propiedad de Homes. Solicitud {application_id}"
                }).execute()
                logger.info(f"[capital] Title transfer Homes→Capital created for property {application['property_id']}")
        
        elif review.status == "rejected":
            # Update sale status back and re-publish property
            sb.table("sales").update({
                "status": "cancelled",
                "rto_notes": f"Solicitud rechazada: {review.review_notes or 'Sin notas'}"
            }).eq("id", application["sale_id"]).execute()
            
            # Re-publish property
            sb.table("properties").update({
                "status": "published"
            }).eq("id", application["property_id"]).execute()
            
            # Reset client status
            sb.table("clients").update({
                "status": "lead"
            }).eq("id", application["client_id"]).execute()
        
        return {
            "ok": True,
            "message": f"Solicitud {review.status}",
            "application_id": application_id,
            "new_status": review.status
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reviewing application {application_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

