"""
Public Purchases API - Portal Clientes
Handle the complete purchase flow for cash (contado) sales.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from tools.supabase_client import sb
from api.services.email_service import (
    send_welcome_email,
    send_payment_confirmation_email,
    send_rto_application_email,
    send_transfer_reported_email,
    schedule_post_sale_emails,
)
from api.services.document_service import auto_generate_sale_documents
import os
import logging

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/public/purchases", tags=["Public - Purchases"])

APP_URL = (os.getenv("APP_URL") or os.getenv("FRONTEND_URL") or "http://localhost:3000").rstrip("/")


# =============================================================================
# SCHEMAS
# =============================================================================

class PurchaseInitRequest(BaseModel):
    """Initial purchase request with client data."""
    property_id: str
    client_name: str
    client_email: EmailStr
    client_phone: str
    client_terreno: str  # Location where house will be placed


class RTOInitRequest(BaseModel):
    """Request to initiate an RTO purchase."""
    property_id: str
    client_name: str
    client_email: EmailStr
    client_phone: str
    client_terreno: str
    # Optional RTO-specific fields
    monthly_income: Optional[float] = None
    employment_status: Optional[str] = None
    employer_name: Optional[str] = None
    time_at_job: Optional[str] = None
    desired_term_months: Optional[int] = None
    desired_down_payment: Optional[float] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/initiate")
async def initiate_purchase(request: PurchaseInitRequest):
    """
    Step 1: Initiate purchase process.
    - Verifies property is available
    - Creates or updates client record
    - Creates pending sale
    - Reserves the property

    Returns data needed for payment step.
    """
    try:
        # 1. Verify property exists and check its status
        try:
            prop_result = sb.table("properties") \
                .select("*") \
                .eq("id", request.property_id) \
                .single() \
                .execute()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Propiedad no encontrada"
            )
        
        if not prop_result.data:
            raise HTTPException(
                status_code=400, 
                detail="Propiedad no encontrada"
            )
        
        property_data = prop_result.data
        
        # Only published properties can be purchased
        if property_data["status"] != "published":
            status_msg = {
                "reserved": "Esta propiedad ya tiene una venta en proceso. No está disponible.",
                "sold": "Esta propiedad ya ha sido vendida.",
                "purchased": "Esta propiedad aún no está publicada para venta.",
                "renovating": "Esta propiedad está en renovación. Vuelve pronto.",
            }
            raise HTTPException(
                status_code=400,
                detail=status_msg.get(property_data["status"], "Esta propiedad no está disponible para compra")
            )
        
        if not property_data.get("sale_price"):
            raise HTTPException(
                status_code=400,
                detail="Esta propiedad no tiene precio de venta definido"
            )
        
        # 2. Check if client already exists by email
        existing_client = sb.table("clients") \
            .select("*") \
            .eq("email", request.client_email) \
            .execute()
        
        if existing_client.data:
            # Update existing client
            client_result = sb.table("clients").update({
                "name": request.client_name,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("email", request.client_email).execute()
            client_id = existing_client.data[0]["id"]
        else:
            # Create new client
            client_result = sb.table("clients").insert({
                "name": request.client_name,
                "email": request.client_email,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead"
            }).execute()
            client_id = client_result.data[0]["id"]
            
            # Send welcome email to new client
            try:
                send_welcome_email(request.client_email, request.client_name)
            except Exception as email_err:
                logger.warning(f"Failed to send welcome email: {email_err}")
        
        # 3. Check if there's ANY active sale for this property (from any client)
        active_sale_statuses = ["pending", "transfer_reported", "paid", "rto_pending", "rto_approved", "rto_active"]
        existing_any_sale = sb.table("sales") \
            .select("id, client_id, status") \
            .eq("property_id", request.property_id) \
            .in_("status", active_sale_statuses) \
            .execute()
        
        if existing_any_sale.data:
            # Check if it's the same client with a pending contado sale — allow resume
            my_sale = [s for s in existing_any_sale.data if s["client_id"] == client_id and s["status"] == "pending"]
            if my_sale:
                sale_id = my_sale[0]["id"]
            else:
                # Another client already has a pending sale on this property
                raise HTTPException(
                    status_code=400,
                    detail="Esta propiedad ya tiene una venta en proceso. No está disponible."
                )
        else:
            # Create new pending sale
            sale_result = sb.table("sales").insert({
                "property_id": request.property_id,
                "client_id": client_id,
                "sale_type": "contado",
                "sale_price": float(property_data["sale_price"]),
                "status": "pending",
                "sold_before_renovation": not property_data.get("is_renovated", False)
            }).execute()
            sale_id = sale_result.data[0]["id"]
            
            # Reserve the property — removes it from the public catalog immediately
            sb.table("properties").update({
                "status": "reserved"
            }).eq("id", request.property_id).execute()
            logger.info(f"[purchases] Property {request.property_id} RESERVED for client {client_id} (sale {sale_id})")
        
        return {
            "ok": True,
            "client_id": client_id,
            "sale_id": sale_id,
            "amount": float(property_data["sale_price"]),
            "property": {
                "id": property_data["id"],
                "address": property_data["address"],
                "city": property_data.get("city"),
                "state": property_data.get("state"),
                "sale_price": float(property_data["sale_price"]),
                "photos": property_data.get("photos", [])
            },
            "next_step": "payment",
            "message": "Compra iniciada. Procede al pago."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initiating purchase: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report-transfer")
async def report_transfer(request: PurchaseInitRequest):
    """
    Contado flow: Client reports they've made a bank transfer.
    - Verifies property is available
    - Creates or updates client record
    - Creates sale with status 'transfer_reported'
    - Reserves the property
    - Sends acknowledgment email (NOT payment confirmation)
    """
    try:
        # 1. Verify property exists and check its status
        try:
            prop_result = sb.table("properties") \
                .select("*") \
                .eq("id", request.property_id) \
                .single() \
                .execute()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Propiedad no encontrada"
            )

        if not prop_result.data:
            raise HTTPException(
                status_code=400,
                detail="Propiedad no encontrada"
            )

        property_data = prop_result.data

        # Only published properties can be purchased
        if property_data["status"] != "published":
            status_msg = {
                "reserved": "Esta propiedad ya tiene una venta en proceso. No está disponible.",
                "sold": "Esta propiedad ya ha sido vendida.",
                "purchased": "Esta propiedad aún no está publicada para venta.",
                "renovating": "Esta propiedad está en renovación. Vuelve pronto.",
            }
            raise HTTPException(
                status_code=400,
                detail=status_msg.get(property_data["status"], "Esta propiedad no está disponible para compra")
            )

        if not property_data.get("sale_price"):
            raise HTTPException(
                status_code=400,
                detail="Esta propiedad no tiene precio de venta definido"
            )

        # 2. Check if client already exists by email
        existing_client = sb.table("clients") \
            .select("*") \
            .eq("email", request.client_email) \
            .execute()

        if existing_client.data:
            # Update existing client
            client_result = sb.table("clients").update({
                "name": request.client_name,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("email", request.client_email).execute()
            client_id = existing_client.data[0]["id"]
        else:
            # Create new client
            client_result = sb.table("clients").insert({
                "name": request.client_name,
                "email": request.client_email,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead"
            }).execute()
            client_id = client_result.data[0]["id"]

            # Send welcome email to new client
            try:
                send_welcome_email(request.client_email, request.client_name)
            except Exception as email_err:
                logger.warning(f"Failed to send welcome email: {email_err}")

        # 3. Check if there's ANY active sale for this property (from any client)
        active_sale_statuses = ["pending", "transfer_reported", "paid", "rto_pending", "rto_approved", "rto_active"]
        existing_any_sale = sb.table("sales") \
            .select("id, client_id, status") \
            .eq("property_id", request.property_id) \
            .in_("status", active_sale_statuses) \
            .execute()

        if existing_any_sale.data:
            # Check if it's the same client with a transfer_reported sale — allow resume
            my_sale = [s for s in existing_any_sale.data if s["client_id"] == client_id and s["status"] == "transfer_reported"]
            if my_sale:
                sale_id = my_sale[0]["id"]
            else:
                # Another client already has a pending sale on this property
                raise HTTPException(
                    status_code=400,
                    detail="Esta propiedad ya tiene una venta en proceso. No está disponible."
                )
        else:
            # Create new sale with status transfer_reported
            sale_result = sb.table("sales").insert({
                "property_id": request.property_id,
                "client_id": client_id,
                "sale_type": "contado",
                "sale_price": float(property_data["sale_price"]),
                "status": "transfer_reported",
                "payment_method": "bank_transfer",
                "client_reported_at": datetime.utcnow().isoformat(),
                "sold_before_renovation": not property_data.get("is_renovated", False)
            }).execute()
            sale_id = sale_result.data[0]["id"]

            # Reserve the property — removes it from the public catalog immediately
            sb.table("properties").update({
                "status": "reserved"
            }).eq("id", request.property_id).execute()
            logger.info(f"[purchases] Property {request.property_id} RESERVED for client {client_id} (sale {sale_id}, transfer reported)")

        # 4. Send acknowledgment email (NOT payment confirmation)
        try:
            send_transfer_reported_email(
                client_email=request.client_email,
                client_name=request.client_name,
                property_address=property_data["address"],
                property_city=property_data.get("city", "Texas"),
                sale_price=float(property_data["sale_price"]),
            )
        except Exception as email_err:
            logger.warning(f"Failed to send transfer reported email: {email_err}")

        return {
            "ok": True,
            "sale_id": sale_id,
            "client_id": client_id,
            "message": "Hemos registrado tu reporte de transferencia. Nuestro equipo verificará el pago."
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reporting transfer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/initiate-rto")
async def initiate_rto(request: RTOInitRequest):
    """
    Initiate an RTO (Rent-to-Own) purchase.
    - Verifies property is available
    - Creates or updates client record
    - Creates sale with type 'rto' and status 'rto_pending'
    - Creates RTO application record
    - Does NOT create Stripe customer (payment handled by Maninos Homes later)
    
    This triggers the Maninos Homes flow:
    Property goes from Maninos Homes → Maninos Homes for RTO management.
    """
    try:
        # 1. Verify property exists and check its status
        try:
            prop_result = sb.table("properties") \
                .select("*") \
                .eq("id", request.property_id) \
                .single() \
                .execute()
        except Exception:
            raise HTTPException(
                status_code=400,
                detail="Propiedad no encontrada"
            )
        
        if not prop_result.data:
            raise HTTPException(
                status_code=400,
                detail="Propiedad no encontrada"
            )
        
        property_data = prop_result.data
        
        # Only published properties can be purchased
        if property_data["status"] != "published":
            status_msg = {
                "reserved": "Esta propiedad ya tiene una venta en proceso. No está disponible.",
                "sold": "Esta propiedad ya ha sido vendida.",
                "purchased": "Esta propiedad aún no está publicada para venta.",
                "renovating": "Esta propiedad está en renovación. Vuelve pronto.",
            }
            raise HTTPException(
                status_code=400,
                detail=status_msg.get(property_data["status"], "Esta propiedad no está disponible para compra")
            )
        
        if not property_data.get("sale_price"):
            raise HTTPException(
                status_code=400,
                detail="Esta propiedad no tiene precio de venta definido"
            )
        
        # Validate minimum 30% down payment if provided
        if request.desired_down_payment is not None:
            rto_sale_price = float(property_data["sale_price"])
            min_dp = rto_sale_price * 0.30
            if request.desired_down_payment < min_dp:
                raise HTTPException(
                    status_code=400,
                    detail=f"El enganche mínimo es 30% del precio de venta (${min_dp:,.0f})"
                )
        
        # 2. Check if client already exists by email
        # Use order desc + limit 1 to match the same client the login lookup returns
        existing_client = sb.table("clients") \
            .select("*") \
            .eq("email", request.client_email.lower()) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if existing_client.data:
            client_id = existing_client.data[0]["id"]
            sb.table("clients").update({
                "name": request.client_name,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("id", client_id).execute()
        else:
            client_result = sb.table("clients").insert({
                "name": request.client_name,
                "email": request.client_email,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead"
            }).execute()
            client_id = client_result.data[0]["id"]
            
            # Send welcome email
            try:
                send_welcome_email(request.client_email, request.client_name)
            except Exception as email_err:
                logger.warning(f"Failed to send welcome email: {email_err}")

        # Reset KYC for new RTO application — client must re-verify
        sb.table("clients").update({
            "kyc_verified": False,
            "kyc_status": "unverified",
            "kyc_requested": False,
            "kyc_verified_at": None,
            "kyc_failure_reason": None,
        }).eq("id", client_id).execute()

        # 3. Check if there's ANY active sale for this property (from any client)
        active_sale_statuses = ["pending", "transfer_reported", "paid", "rto_pending", "rto_approved", "rto_active"]
        existing_any_sale = sb.table("sales") \
            .select("id, client_id, status, sale_type") \
            .eq("property_id", request.property_id) \
            .in_("status", active_sale_statuses) \
            .execute()

        if existing_any_sale.data:
            # Check if it's the same client with an RTO pending sale — allow resume
            my_rto_sale = [s for s in existing_any_sale.data
                          if s["client_id"] == client_id and s["sale_type"] == "rto"
                          and s["status"] in ("rto_pending", "pending")]
            if my_rto_sale:
                sale_id = my_rto_sale[0]["id"]
            else:
                # Another client (or same client with contado) already has an active sale
                raise HTTPException(
                    status_code=400,
                    detail="Esta propiedad ya tiene una venta en proceso. No está disponible."
                )
        else:
            # Create new RTO sale
            sale_result = sb.table("sales").insert({
                "property_id": request.property_id,
                "client_id": client_id,
                "sale_type": "rto",
                "sale_price": float(property_data["sale_price"]),
                "status": "rto_pending",
                "sold_before_renovation": not property_data.get("is_renovated", False),
                "rto_notes": "Solicitud RTO recibida desde Portal Clientes"
            }).execute()
            sale_id = sale_result.data[0]["id"]
            
            # Reserve the property — removes it from the public catalog immediately
            sb.table("properties").update({
                "status": "reserved"
            }).eq("id", request.property_id).execute()
            logger.info(f"[purchases] Property {request.property_id} RESERVED for RTO client {client_id} (sale {sale_id})")
        
        # 4. Create RTO application
        existing_app = sb.table("rto_applications") \
            .select("id") \
            .eq("sale_id", sale_id) \
            .execute()
        
        if not existing_app.data:
            app_data = {
                "sale_id": sale_id,
                "client_id": client_id,
                "property_id": request.property_id,
                "status": "submitted",
            }
            # Add optional financial info if provided
            if request.monthly_income:
                app_data["monthly_income"] = request.monthly_income
            if request.employment_status:
                app_data["employment_status"] = request.employment_status
            if request.employer_name:
                app_data["employer_name"] = request.employer_name
            if request.time_at_job:
                app_data["time_at_job"] = request.time_at_job
            if request.desired_term_months:
                app_data["desired_term_months"] = request.desired_term_months
            if request.desired_down_payment:
                app_data["desired_down_payment"] = request.desired_down_payment
            
            sb.table("rto_applications").insert(app_data).execute()
        
        # 5. Send email notification about RTO application
        try:
            send_rto_application_email(
                client_email=request.client_email,
                client_name=request.client_name,
                property_address=property_data["address"],
                property_city=property_data.get("city", "Texas"),
                sale_price=float(property_data["sale_price"]),
            )
        except Exception as email_err:
            logger.warning(f"Failed to send RTO application email: {email_err}")
        
        return {
            "ok": True,
            "client_id": client_id,
            "sale_id": sale_id,
            "sale_type": "rto",
            "amount": float(property_data["sale_price"]),
            "property": {
                "id": property_data["id"],
                "address": property_data["address"],
                "city": property_data.get("city"),
                "state": property_data.get("state"),
                "sale_price": float(property_data["sale_price"]),
                "photos": property_data.get("photos", [])
            },
            "message": "Solicitud RTO recibida. Maninos Homes revisará tu aplicación."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error initiating RTO: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status/{sale_id}")
async def get_purchase_status(sale_id: str, client_email: str):
    """
    Get status of a purchase.
    Requires client email for verification.
    """
    try:
        sale_result = sb.table("sales") \
            .select("*, clients(name, email), properties(address, city), title_transfers(status)") \
            .eq("id", sale_id) \
            .single() \
            .execute()
        
        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Compra no encontrada")
        
        sale = sale_result.data
        
        # Verify email matches
        if sale["clients"]["email"].lower() != client_email.lower():
            raise HTTPException(status_code=403, detail="Email no coincide")
        
        title_status = "pending"
        if sale.get("title_transfers") and len(sale["title_transfers"]) > 0:
            title_status = sale["title_transfers"][0]["status"]
        
        return {
            "ok": True,
            "sale": {
                "id": sale["id"],
                "status": sale["status"],
                "sale_type": sale.get("sale_type", "contado"),
                "amount": float(sale["sale_price"]),
                "completed_at": sale.get("completed_at"),
                "property_address": sale["properties"]["address"],
                "property_city": sale["properties"].get("city"),
                "title_status": title_status
            }
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



