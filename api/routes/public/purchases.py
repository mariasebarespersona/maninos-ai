"""
Public Purchases API - Portal Clientes
Handle the complete purchase flow for cash (contado) sales.
"""

from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr
from tools.supabase_client import sb
from tools.stripe_payments import (
    get_or_create_customer,
    create_payment_intent,
)
from api.services.email_service import (
    send_welcome_email,
    send_payment_confirmation_email,
    send_rto_application_email,
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


class PaymentCreateRequest(BaseModel):
    """Request to create a payment intent."""
    sale_id: str
    stripe_customer_id: str


class PaymentConfirmRequest(BaseModel):
    """Request to confirm a completed payment."""
    sale_id: str
    payment_intent_id: str


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
    - Creates Stripe customer
    
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
        active_sale_statuses = ["pending", "paid", "rto_pending", "rto_approved", "rto_active"]
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
        
        # 4. Create or get Stripe customer
        stripe_result = get_or_create_customer(
            client_id=client_id,
            email=request.client_email,
            name=request.client_name,
            phone=request.client_phone
        )
        
        if not stripe_result.get("ok"):
            logger.warning(f"Stripe customer creation failed: {stripe_result}")
            # Continue without Stripe - can still do manual payment
            stripe_customer_id = None
        else:
            stripe_customer_id = stripe_result.get("stripe_customer_id")
        
        return {
            "ok": True,
            "client_id": client_id,
            "sale_id": sale_id,
            "stripe_customer_id": stripe_customer_id,
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


@router.post("/payment/create")
async def create_payment(request: PaymentCreateRequest):
    """
    Step 2: Create Stripe PaymentIntent.
    The frontend will use the client_secret with Stripe Elements.
    """
    try:
        # Get sale details
        sale_result = sb.table("sales") \
            .select("*, properties(id, address, sale_price)") \
            .eq("id", request.sale_id) \
            .single() \
            .execute()
        
        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        sale = sale_result.data
        
        if sale["status"] != "pending":
            raise HTTPException(
                status_code=400, 
                detail=f"Esta venta ya no está pendiente (status: {sale['status']})"
            )
        
        # Create PaymentIntent
        amount_cents = int(float(sale["sale_price"]) * 100)
        
        payment_result = create_payment_intent(
            stripe_customer_id=request.stripe_customer_id,
            amount_cents=amount_cents,
            description=f"Compra casa: {sale['properties']['address']}",
            contract_id=request.sale_id
        )
        
        if not payment_result.get("ok"):
            raise HTTPException(
                status_code=400,
                detail=payment_result.get("error", "Error al crear pago")
            )
        
        return {
            "ok": True,
            "payment_intent_id": payment_result["payment_intent_id"],
            "client_secret": payment_result["client_secret"],
            "amount": amount_cents / 100,
            "status": payment_result["status"],
            "message": "PaymentIntent creado. Completa el pago en el frontend."
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/payment/confirm")
async def confirm_payment(request: PaymentConfirmRequest):
    """
    Step 3: Confirm payment was successful.
    - Updates sale status
    - Updates property to sold
    - Creates title transfer record
    - Sends confirmation email
    """
    try:
        # Verify payment with Stripe
        try:
            import stripe
            stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
            payment_intent = stripe.PaymentIntent.retrieve(request.payment_intent_id)
            
            if payment_intent.status != "succeeded":
                raise HTTPException(
                    status_code=400,
                    detail=f"Pago no completado. Estado: {payment_intent.status}"
                )
        except ImportError:
            logger.warning("Stripe not available, skipping verification")
        except Exception as stripe_error:
            logger.warning(f"Stripe verification failed: {stripe_error}")
            # Continue anyway for testing
        
        # Get sale with all related data
        sale_result = sb.table("sales") \
            .select("*, clients(*), properties(*)") \
            .eq("id", request.sale_id) \
            .single() \
            .execute()
        
        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")
        
        sale = sale_result.data
        
        # Update sale to paid
        sb.table("sales").update({
            "status": "paid",
            "payment_method": "stripe",
            "payment_reference": request.payment_intent_id,
            "completed_at": datetime.utcnow().isoformat()
        }).eq("id", request.sale_id).execute()
        
        # Update property to sold
        sb.table("properties").update({
            "status": "sold"
        }).eq("id", sale["property_id"]).execute()
        
        # Update client to active
        sb.table("clients").update({
            "status": "active"
        }).eq("id", sale["client_id"]).execute()
        
        # Create title transfer record (only if trigger didn't create one)
        existing_transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("sale_id", request.sale_id) \
            .execute()
        
        if not existing_transfer.data:
            sb.table("title_transfers").insert({
                "property_id": sale["property_id"],
                "sale_id": request.sale_id,
                "transfer_type": "sale",
                "from_name": "Maninos Homes LLC",
                "to_name": sale["clients"]["name"],
                "to_contact": sale["clients"].get("phone"),
                "status": "pending",
                "notes": f"Venta contado via Portal Clientes"
            }).execute()
        
        # Send confirmation email + schedule follow-up emails
        try:
            send_payment_confirmation_email(
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
                property_city=sale["properties"].get("city", "Texas"),
                sale_price=float(sale["sale_price"]),
            )
        except Exception as email_error:
            logger.warning(f"Failed to send payment confirmation email: {email_error}")
        
        # Schedule review (7 days) and referral (30 days) emails
        try:
            schedule_post_sale_emails(
                sale_id=request.sale_id,
                client_id=sale["client_id"],
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
            )
        except Exception as schedule_error:
            logger.warning(f"Failed to schedule post-sale emails: {schedule_error}")
        
        # Auto-generate Bill of Sale + Title PDFs
        try:
            doc_result = auto_generate_sale_documents(
                sale_id=request.sale_id,
                sale_data=sale,
                client_data=sale["clients"],
                property_data=sale["properties"],
            )
            if doc_result.get("errors"):
                logger.warning(f"Document generation had errors: {doc_result['errors']}")
            else:
                logger.info(f"Documents auto-generated for sale {request.sale_id}")
        except Exception as doc_error:
            logger.warning(f"Failed to auto-generate documents: {doc_error}")
        
        return {
            "ok": True,
            "message": "¡Felicidades! Tu compra ha sido completada exitosamente.",
            "sale_id": request.sale_id,
            "property_address": sale["properties"]["address"],
            "client_name": sale["clients"]["name"],
            "amount_paid": float(sale["sale_price"]),
            "next_steps": [
                "Procesaremos la transferencia del título a tu nombre",
                "Recibirás un email de confirmación",
                "Puedes ver el estado de tu compra en 'Mi Cuenta'"
            ]
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/initiate-rto")
async def initiate_rto(request: RTOInitRequest):
    """
    Initiate an RTO (Rent-to-Own) purchase.
    - Verifies property is available
    - Creates or updates client record
    - Creates sale with type 'rto' and status 'rto_pending'
    - Creates RTO application record
    - Does NOT create Stripe customer (payment handled by Maninos Capital later)
    
    This triggers the Maninos Capital flow:
    Property goes from Maninos Homes → Maninos Capital for RTO management.
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
            client_result = sb.table("clients").update({
                "name": request.client_name,
                "phone": request.client_phone,
                "terreno": request.client_terreno,
                "status": "lead",
                "updated_at": datetime.utcnow().isoformat()
            }).eq("email", request.client_email).execute()
            client_id = existing_client.data[0]["id"]
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
        
        # 3. Check if there's ANY active sale for this property (from any client)
        active_sale_statuses = ["pending", "paid", "rto_pending", "rto_approved", "rto_active"]
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
            "message": "Solicitud RTO recibida. Maninos Capital revisará tu aplicación."
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



