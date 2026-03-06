"""
Purchase Payments API - Bank transfer payments for property acquisition (Paso 1.4)

When Maninos Homes buys a house from a seller, this handles bank transfer payments.
Also provides payee management (save/reuse seller bank info).
"""

import os
import logging
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, field_validator

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# =============================================================================
# SCHEMAS
# =============================================================================

class PayeeCreate(BaseModel):
    """Create a new payee (seller bank info)."""
    name: str
    bank_name: str
    routing_number: str
    account_number: str
    account_type: str = "checking"  # 'checking' or 'savings'
    address: Optional[str] = None
    bank_address: Optional[str] = None
    memo: Optional[str] = None

    @field_validator("routing_number")
    @classmethod
    def validate_routing(cls, v: str) -> str:
        v = v.strip()
        if len(v) != 9 or not v.isdigit():
            raise ValueError("Routing number must be exactly 9 digits")
        return v

    @field_validator("account_type")
    @classmethod
    def validate_account_type(cls, v: str) -> str:
        if v not in ("checking", "savings"):
            raise ValueError("Account type must be 'checking' or 'savings'")
        return v


class PurchasePaymentRequest(BaseModel):
    """Payment for purchasing a property (Maninos buys from seller). Bank transfer only."""
    property_id: str
    amount: float
    method: str = "transferencia"
    payee_id: Optional[str] = None  # Reference to saved payee
    reference: Optional[str] = None  # Confirmation number after transfer
    date: Optional[str] = None  # ISO date
    seller_name: Optional[str] = None
    notes: Optional[str] = None


class StripePaymentIntentRequest(BaseModel):
    """Create a Stripe PaymentIntent for property purchase."""
    property_id: str
    amount: float
    description: Optional[str] = None


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/stripe/create-intent")
async def create_purchase_payment_intent(request: StripePaymentIntentRequest):
    """
    Create a Stripe PaymentIntent for purchasing a property.
    
    Used when Maninos pays a seller via Stripe (card payment).
    LOCK: Cannot pay until title application AND bill of sale received.
    Returns the client_secret for Stripe Elements.
    """
    try:
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
        
        if not stripe.api_key:
            raise HTTPException(
                status_code=500,
                detail="Stripe not configured. Set STRIPE_SECRET_KEY."
            )
        
        # Check purchase lock — cannot pay seller until docs received
        try:
            transfer = sb.table("title_transfers")\
                .select("id, payment_locked, title_application_received, bill_of_sale_received")\
                .eq("property_id", request.property_id)\
                .eq("transfer_type", "purchase")\
                .limit(1).execute()
            
            if transfer.data:
                t = transfer.data[0]
                if t.get("payment_locked", True):
                    missing_docs = []
                    if not t.get("title_application_received"):
                        missing_docs.append("Solicitud de cambio de título (Title Application)")
                    if not t.get("bill_of_sale_received"):
                        missing_docs.append("Bill of Sale")
                    raise HTTPException(
                        status_code=403,
                        detail=f"🔒 PAGO BLOQUEADO: Faltan documentos del vendedor: {', '.join(missing_docs)}. "
                               f"No se puede pagar hasta recibir ambos documentos."
                    )
        except HTTPException:
            raise
        except Exception as lock_err:
            logger.warning(f"[purchase_payment] Could not check lock: {lock_err}")
            # If table doesn't exist yet, allow payment (backward compat)
        
        # Try to find the property in `properties` table first, then `market_listings`
        address = "Propiedad"
        
        try:
            # Check properties table
            prop = sb.table("properties").select("id, address, purchase_price") \
                .eq("id", request.property_id).limit(1).execute()
            
            if prop.data:
                address = prop.data[0].get("address", "Propiedad")
            else:
                # Check market_listings table (before purchase, listings are here)
                ml = sb.table("market_listings").select("id, address") \
                    .eq("id", request.property_id).limit(1).execute()
                if ml.data:
                    address = ml.data[0].get("address", "Propiedad del Mercado")
        except Exception as lookup_err:
            logger.warning(f"[purchase_payment] Could not look up property {request.property_id}: {lookup_err}")
            # Continue anyway — address stays as "Propiedad"
        
        amount_cents = int(request.amount * 100)
        description = request.description or f"Compra propiedad: {address}"
        
        payment_intent = stripe.PaymentIntent.create(
            amount=amount_cents,
            currency="usd",
            description=description,
            metadata={
                "type": "property_purchase",
                "property_id": request.property_id,
                "property_address": address,
                "source": "maninos_homes",
            },
            automatic_payment_methods={"enabled": True},
        )
        
        logger.info(f"[purchase_payment] Created PaymentIntent {payment_intent.id} for ${request.amount:,.2f}")
        
        return {
            "ok": True,
            "payment_intent_id": payment_intent.id,
            "client_secret": payment_intent.client_secret,
            "amount": request.amount,
            "property_address": address,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[purchase_payment] Error creating PaymentIntent: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stripe/confirm")
async def confirm_purchase_payment(
    property_id: str,
    payment_intent_id: str,
):
    """
    Confirm a Stripe payment for property purchase.
    
    Called after the frontend Stripe Elements form confirms the payment.
    Updates the title transfer record with the Stripe payment reference.
    """
    try:
        import stripe
        stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
        
        # Verify payment succeeded
        pi = stripe.PaymentIntent.retrieve(payment_intent_id)
        
        if pi.status != "succeeded":
            raise HTTPException(
                status_code=400,
                detail=f"Pago no completado. Estado: {pi.status}"
            )
        
        amount = pi.amount / 100
        
        # Update title transfer record if exists
        transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("property_id", property_id) \
            .eq("transfer_type", "purchase") \
            .execute()
        
        if transfer.data:
            sb.table("title_transfers").update({
                "payment_method": "stripe",
                "payment_reference": payment_intent_id,
                "payment_amount": amount,
                "status": "completed",
            }).eq("id", transfer.data[0]["id"]).execute()
        
        logger.info(f"[purchase_payment] Stripe payment confirmed for property {property_id}: ${amount:,.2f}")
        
        return {
            "ok": True,
            "message": f"Pago de ${amount:,.2f} confirmado vía Stripe",
            "payment_intent_id": payment_intent_id,
            "amount": amount,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[purchase_payment] Error confirming payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/register")
async def register_purchase_payment(request: PurchasePaymentRequest):
    """
    Register a property purchase payment (any method).
    
    Updates the title_transfers record with payment details.
    Works for: stripe, transferencia, cheque, efectivo, zelle.
    """
    try:
        # Verify property exists
        try:
            prop = sb.table("properties").select("id, address") \
                .eq("id", request.property_id).single().execute()
        except Exception:
            prop = type('R', (), {'data': None})()
        
        if not prop.data:
            raise HTTPException(status_code=404, detail="Propiedad no encontrada")
        
        # Find or create title transfer record for this purchase
        transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("property_id", request.property_id) \
            .eq("transfer_type", "purchase") \
            .execute()
        
        payment_data = {
            "payment_method": request.method,
            "payment_reference": request.reference or "",
            "payment_amount": request.amount,
            "status": "completed",
        }
        
        if request.date:
            payment_data["transfer_date"] = request.date
        
        if transfer.data:
            sb.table("title_transfers").update(payment_data) \
                .eq("id", transfer.data[0]["id"]).execute()
        else:
            # Create new transfer record
            payment_data.update({
                "property_id": request.property_id,
                "transfer_type": "purchase",
                "from_name": request.seller_name or "Vendedor",
                "to_name": "Maninos Homes LLC",
                "notes": request.notes or f"Compra de {prop.data['address']}",
            })
            sb.table("title_transfers").insert(payment_data).execute()
        
        logger.info(f"[purchase_payment] Payment registered: {request.method} ${request.amount:,.2f} for {prop.data['address']}")
        
        return {
            "ok": True,
            "message": f"Pago de ${request.amount:,.2f} registrado ({request.method})",
            "method": request.method,
            "amount": request.amount,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[purchase_payment] Error registering payment: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PAYEES — Saved seller bank info for reuse
# ============================================================================

@router.get("/payees")
async def list_payees():
    """List all saved payees (seller bank accounts)."""
    try:
        result = sb.table("payees").select("*").order("name").execute()
        # Mask account numbers in response (show last 4 only)
        payees = []
        for p in (result.data or []):
            masked = {**p}
            acct = p.get("account_number", "")
            masked["account_number_masked"] = f"****{acct[-4:]}" if len(acct) >= 4 else "****"
            payees.append(masked)
        return {"ok": True, "data": payees}
    except Exception as e:
        logger.error(f"[payees] Error listing payees: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/payees")
async def create_payee(request: PayeeCreate):
    """Save a new payee (seller bank info) for future reuse."""
    try:
        data = {
            "name": request.name.strip(),
            "bank_name": request.bank_name.strip(),
            "routing_number": request.routing_number.strip(),
            "account_number": request.account_number.strip(),
            "account_type": request.account_type,
        }
        if request.address:
            data["address"] = request.address.strip()
        if request.bank_address:
            data["bank_address"] = request.bank_address.strip()
        if request.memo:
            data["memo"] = request.memo.strip()

        result = sb.table("payees").insert(data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Error saving payee")

        payee = result.data[0]
        logger.info(f"[payees] Created payee: {payee['name']} at {payee['bank_name']}")

        return {"ok": True, "data": payee, "message": f"Beneficiario '{payee['name']}' guardado"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[payees] Error creating payee: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/payees/{payee_id}")
async def get_payee(payee_id: str):
    """Get a single payee by ID (full details for payment form)."""
    try:
        result = sb.table("payees").select("*").eq("id", payee_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Beneficiario no encontrado")
        return {"ok": True, "data": result.data}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[payees] Error getting payee {payee_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================================================
# PURCHASE DOCUMENT LOCK
# ============================================================================

class ReceiveDocumentRequest(BaseModel):
    property_id: str
    document_type: str  # "title_application" or "bill_of_sale"
    notes: Optional[str] = None


@router.post("/receive-document")
async def receive_purchase_document(request: ReceiveDocumentRequest):
    """
    Mark a purchase document as received.
    
    When BOTH title_application AND bill_of_sale are received,
    the payment lock is automatically released.
    
    Flow: negotiate → evaluate → docs → LOCK → pay
    """
    valid_types = ["title_application", "bill_of_sale"]
    if request.document_type not in valid_types:
        raise HTTPException(
            status_code=400,
            detail=f"Tipo de documento inválido. Opciones: {valid_types}"
        )
    
    # Find the title transfer for this purchase
    transfer = sb.table("title_transfers")\
        .select("*")\
        .eq("property_id", request.property_id)\
        .eq("transfer_type", "purchase")\
        .limit(1).execute()
    
    if not transfer.data:
        # Create one
        new_transfer = {
            "property_id": request.property_id,
            "transfer_type": "purchase",
            "from_name": "Vendedor",
            "to_name": "Maninos Homes LLC",
            "status": "pending",
            "payment_locked": True,
        }
        result = sb.table("title_transfers").insert(new_transfer).execute()
        if not result.data:
            raise HTTPException(status_code=500, detail="Error creating transfer record")
        transfer_data = result.data[0]
    else:
        transfer_data = transfer.data[0]
    
    # Update the specific document field
    update = {}
    now = datetime.utcnow().isoformat()
    
    if request.document_type == "title_application":
        update["title_application_received"] = True
        update["title_application_date"] = now
    elif request.document_type == "bill_of_sale":
        update["bill_of_sale_received"] = True
        update["bill_of_sale_date"] = now
    
    if request.notes:
        update["notes"] = request.notes
    
    sb.table("title_transfers").update(update)\
        .eq("id", transfer_data["id"]).execute()
    
    # Refresh to check if both docs are now received
    refreshed = sb.table("title_transfers")\
        .select("*")\
        .eq("id", transfer_data["id"])\
        .single().execute()
    
    t = refreshed.data
    both_received = t.get("title_application_received") and t.get("bill_of_sale_received")
    
    if both_received and t.get("payment_locked"):
        # UNLOCK payment
        sb.table("title_transfers").update({
            "payment_locked": False,
            "payment_unlocked_at": now,
        }).eq("id", t["id"]).execute()
        
        logger.info(f"[purchase_payment] 🔓 Payment UNLOCKED for property {request.property_id}")
        
        return {
            "ok": True,
            "message": "✅ Documento recibido. ¡AMBOS documentos recibidos! Pago DESBLOQUEADO.",
            "payment_locked": False,
            "title_application_received": True,
            "bill_of_sale_received": True,
        }
    
    return {
        "ok": True,
        "message": f"✅ Documento '{request.document_type}' marcado como recibido.",
        "payment_locked": True,
        "title_application_received": t.get("title_application_received", False),
        "bill_of_sale_received": t.get("bill_of_sale_received", False),
    }

