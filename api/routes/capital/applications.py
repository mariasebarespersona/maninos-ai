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
            existing_transfer = sb.table("title_transfers") \
                .select("id") \
                .eq("sale_id", application["sale_id"]) \
                .eq("transfer_type", "sale") \
                .execute()
            
            if not existing_transfer.data:
                sb.table("title_transfers").insert({
                    "property_id": application["property_id"],
                    "sale_id": application["sale_id"],
                    "transfer_type": "sale",
                    "from_name": "Maninos Homes LLC",
                    "to_name": "Maninos Capital LLC",
                    "status": "pending",
                    "notes": f"Transferencia RTO - Solicitud {application_id}"
                }).execute()
        
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

