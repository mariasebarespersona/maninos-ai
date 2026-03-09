"""
Sales API Routes
Handles Paso 5: Cierre de Venta (Contado flow for MVP)
"""

import logging
from datetime import datetime
from decimal import Decimal
from typing import Optional
from fastapi import APIRouter, HTTPException, Query

from api.models.schemas import (
    SaleCreate,
    SaleComplete,
    SaleResponse,
    SaleStatus,
    SaleType,
    PropertyStatus,
    ClientStatus,
)
from api.services.property_service import PropertyService
from api.services.email_service import send_sale_completed_email, schedule_post_sale_emails
from api.services.document_service import auto_generate_sale_documents
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()


# ============================================================================
# SALES CRUD
# ============================================================================

@router.get("", response_model=list[SaleResponse])
async def list_sales(
    status: Optional[SaleStatus] = Query(None, description="Filter by status"),
    sale_type: Optional[SaleType] = Query(None, description="Filter by sale type"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """List all sales with optional filters."""
    query = sb.table("sales").select("*")
    
    if status:
        query = query.eq("status", status.value)
    
    if sale_type:
        query = query.eq("sale_type", sale_type.value)
    
    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    if not result.data:
        return []
    
    # Get property and client info
    property_ids = list(set(s["property_id"] for s in result.data))
    client_ids = list(set(s["client_id"] for s in result.data))
    
    props = sb.table("properties").select("id, address").in_("id", property_ids).execute()
    clients = sb.table("clients").select("id, name").in_("id", client_ids).execute()
    
    props_map = {p["id"]: p["address"] for p in (props.data or [])}
    clients_map = {c["id"]: c["name"] for c in (clients.data or [])}
    
    return [
        _format_sale(s, props_map.get(s["property_id"]), clients_map.get(s["client_id"]))
        for s in result.data
    ]


# NOTE: This route MUST come BEFORE /{sale_id} to avoid being captured by the UUID pattern
@router.get("/stats/summary")
async def get_sales_summary():
    """Get summary statistics for sales dashboard."""
    all_sales = sb.table("sales").select("status, sale_price, sale_type, sold_before_renovation").execute()
    
    stats = {
        "total_sales": 0,
        "total_revenue": 0,
        "pending": 0,
        "paid": 0,
        "completed": 0,
        "cancelled": 0,
        "contado": 0,
        "rto": 0,
        "rto_approved": 0,
        "rto_pending": 0,
        "rto_active": 0,
        "sold_before_renovation": 0,
        "sold_after_renovation": 0,
    }
    
    for sale in (all_sales.data or []):
        stats["total_sales"] += 1
        stats[sale["status"]] = stats.get(sale["status"], 0) + 1
        stats[sale["sale_type"]] = stats.get(sale["sale_type"], 0) + 1
        
        if sale["status"] == "completed":
            stats["total_revenue"] += float(sale.get("sale_price", 0) or 0)
            
            if sale.get("sold_before_renovation"):
                stats["sold_before_renovation"] += 1
            else:
                stats["sold_after_renovation"] += 1
    
    return stats


@router.get("/capital-payments")
async def get_capital_payments():
    """
    Get payments from Capital to Homes for RTO purchases.
    
    When Capital approves an RTO, it effectively purchases the house from Homes.
    This endpoint returns all such transactions visible to Homes employees.
    """
    # Get all RTO-approved sales
    rto_sales = sb.table("sales").select("*") \
        .eq("sale_type", "rto") \
        .in_("status", ["rto_approved", "rto_active", "completed"]) \
        .order("created_at", desc=True) \
        .execute()
    
    if not rto_sales.data:
        return {"payments": []}
    
    # Gather property/client info
    property_ids = list(set(s["property_id"] for s in rto_sales.data))
    client_ids = list(set(s["client_id"] for s in rto_sales.data))
    
    props = sb.table("properties").select("id, address, purchase_price").in_("id", property_ids).execute()
    clients = sb.table("clients").select("id, name").in_("id", client_ids).execute()
    
    props_map = {p["id"]: p for p in (props.data or [])}
    clients_map = {c["id"]: c["name"] for c in (clients.data or [])}
    
    # Check for RTO application approval dates
    rto_apps = sb.table("rto_applications").select("sale_id, status, updated_at") \
        .in_("sale_id", [s["id"] for s in rto_sales.data]) \
        .execute()
    rto_map = {a["sale_id"]: a for a in (rto_apps.data or [])}
    
    payments = []
    for sale in rto_sales.data:
        prop = props_map.get(sale["property_id"], {})
        rto_app = rto_map.get(sale["id"], {})
        
        # Capital pays Homes the purchase price of the property
        capital_amount = float(prop.get("purchase_price") or sale["sale_price"])
        
        payments.append({
            "sale_id": sale["id"],
            "property_address": prop.get("address", "Dirección desconocida"),
            "client_name": clients_map.get(sale["client_id"], "Cliente"),
            "amount": capital_amount,
            "sale_price": float(sale["sale_price"]),
            "status": "received" if sale["status"] in ("rto_active", "completed") else "pending",
            "rto_approved_at": rto_app.get("updated_at") if rto_app.get("status") in ("approved", "active") else None,
        })
    
    return {"payments": payments}


@router.get("/pending-transfers")
async def get_pending_transfers():
    """
    Get all pending contado transfers (status=transfer_reported).
    Used by the Notificaciones page for Abigail to confirm payments.
    """
    try:
        sales_result = sb.table("sales") \
            .select("*") \
            .eq("status", "transfer_reported") \
            .eq("sale_type", "contado") \
            .order("created_at", desc=True) \
            .execute()

        if not sales_result.data:
            return {"transfers": []}

        # Gather property and client IDs
        property_ids = list(set(s["property_id"] for s in sales_result.data))
        client_ids = list(set(s["client_id"] for s in sales_result.data))

        props = sb.table("properties") \
            .select("id, address, city, sale_price, photos") \
            .in_("id", property_ids) \
            .execute()
        clients = sb.table("clients") \
            .select("id, name, email, phone") \
            .in_("id", client_ids) \
            .execute()

        props_map = {p["id"]: p for p in (props.data or [])}
        clients_map = {c["id"]: c for c in (clients.data or [])}

        transfers = []
        for sale in sales_result.data:
            prop = props_map.get(sale["property_id"], {})
            client = clients_map.get(sale["client_id"], {})
            transfers.append({
                "sale_id": sale["id"],
                "sale_price": float(sale["sale_price"]),
                "reported_at": sale.get("client_reported_at") or sale["created_at"],
                "property_id": sale["property_id"],
                "property_address": prop.get("address"),
                "property_city": prop.get("city"),
                "client_id": sale["client_id"],
                "client_name": client.get("name"),
                "client_email": client.get("email"),
                "client_phone": client.get("phone"),
            })

        return {"ok": True, "transfers": transfers}

    except Exception as e:
        logger.error(f"Error fetching pending transfers: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{sale_id}", response_model=SaleResponse)
async def get_sale(sale_id: str):
    """Get a single sale by ID."""
    result = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    # Get property and client info
    prop = sb.table("properties").select("address").eq("id", result.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", result.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data,
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("", response_model=SaleResponse)
async def create_sale(data: SaleCreate):
    """
    Create a new sale (Paso 5: Cierre de Venta).
    
    This initiates the sale process:
    1. Validates property is in 'published' status
    2. Creates sale record with 'pending' status
    3. Updates client status to 'active'
    4. If RTO: creates rto_applications record in Capital
    
    Note: Property status is NOT changed until sale is completed.
    """
    from postgrest.exceptions import APIError as PGError
    
    # Validate property exists and is available for sale
    try:
        property_result = sb.table("properties").select("*").eq("id", data.property_id).single().execute()
    except PGError:
        raise HTTPException(status_code=404, detail="Property not found")
    
    prop = property_result.data
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    
    if prop["status"] not in (PropertyStatus.PUBLISHED.value, PropertyStatus.RESERVED.value):
        raise HTTPException(
            status_code=400,
            detail=f"Property must be published to sell (current status: {prop['status']})"
        )
    
    # Validate client exists
    try:
        client_result = sb.table("clients").select("*").eq("id", data.client_id).single().execute()
    except PGError:
        raise HTTPException(status_code=404, detail="Client not found")
    
    if not client_result.data:
        raise HTTPException(status_code=404, detail="Client not found")
    
    # Check if property already has pending sale
    existing_sale = sb.table("sales").select("id").eq(
        "property_id", data.property_id
    ).in_("status", ["pending", "paid"]).execute()
    
    if existing_sale.data:
        raise HTTPException(
            status_code=400,
            detail="Property already has a pending or paid sale"
        )
    
    # Determine if selling before renovation
    sold_before_renovation = PropertyService.is_sold_before_renovation(
        prop.get("is_renovated", False),
        PropertyStatus.SOLD,
    )
    
    # Calculate commission
    from api.utils.commissions import calculate_commission
    commission = calculate_commission(
        sale_type=data.sale_type.value,
        found_by_employee_id=data.found_by_employee_id,
        sold_by_employee_id=data.sold_by_employee_id,
    )
    
    # Create sale
    insert_data = {
        "property_id": data.property_id,
        "client_id": data.client_id,
        "sale_type": data.sale_type.value,
        "sale_price": float(data.sale_price),
        "status": SaleStatus.PENDING.value,
        "sold_before_renovation": sold_before_renovation,
        # Commission fields
        "found_by_employee_id": data.found_by_employee_id,
        "sold_by_employee_id": data.sold_by_employee_id,
        "commission_amount": float(commission["commission_amount"]),
        "commission_found_by": float(commission["commission_found_by"]),
        "commission_sold_by": float(commission["commission_sold_by"]),
    }
    
    result = sb.table("sales").insert(insert_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create sale")
    
    sale_record = result.data[0]
    
    # Reserve the property — removes it from the public catalog immediately
    if prop["status"] == PropertyStatus.PUBLISHED.value:
        sb.table("properties").update({
            "status": PropertyStatus.RESERVED.value,
        }).eq("id", data.property_id).execute()
        logger.info(f"[sales] Property {data.property_id} reserved (sale {sale_record['id']})")
    
    # Update client status
    new_client_status = ClientStatus.ACTIVE.value
    if data.sale_type == SaleType.RTO:
        new_client_status = ClientStatus.RTO_APPLICANT.value
    
    sb.table("clients").update({
        "status": new_client_status
    }).eq("id", data.client_id).execute()
    
    # If RTO sale, automatically create an RTO application in Capital
    if data.sale_type == SaleType.RTO:
        try:
            rto_app_data = {
                "sale_id": sale_record["id"],
                "client_id": data.client_id,
                "property_id": data.property_id,
                "status": "submitted",
                "monthly_income": float(client_result.data.get("monthly_income", 0)) if client_result.data.get("monthly_income") else None,
            }
            sb.table("rto_applications").insert(rto_app_data).execute()
            logger.info(f"[sales] RTO application created for sale {sale_record['id']}")
        except Exception as e:
            logger.error(f"[sales] Failed to create RTO application: {e}")
            # Don't fail the sale - the application can be created manually
    
    return _format_sale(
        sale_record,
        prop["address"],
        client_result.data["name"],
    )


@router.post("/{sale_id}/pay", response_model=SaleResponse)
async def mark_sale_paid(sale_id: str, data: SaleComplete):
    """
    Mark a sale as paid.
    
    For Contado flow: Records payment method and reference.
    Transition: pending -> paid
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] != SaleStatus.PENDING.value:
        raise HTTPException(
            status_code=400,
            detail=f"Sale is not pending (current status: {sale.data['status']})"
        )
    
    # Update sale
    update_data = {
        "status": SaleStatus.PAID.value,
        "payment_method": data.payment_method,
        "payment_reference": data.payment_reference,
    }
    
    result = sb.table("sales").update(update_data).eq("id", sale_id).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", sale.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("/{sale_id}/confirm-transfer")
async def confirm_transfer(sale_id: str):
    """
    Confirm a bank transfer for a contado sale.
    Abigail confirms payment received → sale goes to paid, docs generated, email sent.

    Transition: transfer_reported -> paid
    """
    try:
        # 1. Verify sale exists and is in transfer_reported status
        sale_result = sb.table("sales") \
            .select("*, clients(*), properties(*)") \
            .eq("id", sale_id) \
            .single() \
            .execute()

        if not sale_result.data:
            raise HTTPException(status_code=404, detail="Venta no encontrada")

        sale = sale_result.data

        if sale["status"] != "transfer_reported":
            raise HTTPException(
                status_code=400,
                detail=f"Esta venta no está en estado 'transfer_reported' (status actual: {sale['status']})"
            )

        # 2. Update sale status to paid
        sb.table("sales").update({
            "status": "paid",
            "payment_method": "transferencia",
            "completed_at": datetime.utcnow().isoformat(),
        }).eq("id", sale_id).execute()

        # 3. Update property status to sold
        sb.table("properties").update({
            "status": PropertyStatus.SOLD.value,
        }).eq("id", sale["property_id"]).execute()
        logger.info(f"[sales] Property {sale['property_id']} marked SOLD (transfer confirmed, sale {sale_id})")

        # 4. Update client status to active
        sb.table("clients").update({
            "status": ClientStatus.ACTIVE.value,
        }).eq("id", sale["client_id"]).execute()

        # 5. Create title_transfers record
        existing_transfer = sb.table("title_transfers") \
            .select("id") \
            .eq("sale_id", sale_id) \
            .execute()

        if not existing_transfer.data:
            sb.table("title_transfers").insert({
                "property_id": sale["property_id"],
                "sale_id": sale_id,
                "transfer_type": "sale",
                "from_name": "Maninos Homes LLC",
                "to_name": sale["clients"]["name"],
                "to_contact": sale["clients"].get("phone"),
                "status": "pending",
                "notes": "Venta contado - transferencia bancaria confirmada"
            }).execute()

        # 6. Auto-generate Bill of Sale + Title PDFs
        documents = {}
        try:
            doc_result = auto_generate_sale_documents(
                sale_id=sale_id,
                sale_data=sale,
                client_data=sale["clients"],
                property_data=sale["properties"],
            )
            if doc_result.get("errors"):
                logger.warning(f"Document generation had errors: {doc_result['errors']}")
            else:
                logger.info(f"Documents auto-generated for sale {sale_id}")
            documents = {
                "bill_of_sale": doc_result.get("bill_of_sale"),
                "title": doc_result.get("title"),
            }
        except Exception as doc_error:
            logger.warning(f"Failed to auto-generate documents: {doc_error}")

        # 7. Send "Venta Completada" email to client
        try:
            send_sale_completed_email(
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
                property_city=sale["properties"].get("city", "Texas"),
                sale_price=float(sale["sale_price"]),
            )
        except Exception as email_error:
            logger.warning(f"Failed to send sale completed email: {email_error}")

        # 8. Schedule post-sale emails (review 7d + referral 30d)
        try:
            schedule_post_sale_emails(
                sale_id=sale_id,
                client_id=sale["client_id"],
                client_email=sale["clients"]["email"],
                client_name=sale["clients"]["name"],
                property_address=sale["properties"]["address"],
            )
        except Exception as schedule_error:
            logger.warning(f"Failed to schedule post-sale emails: {schedule_error}")

        # 9. Create accounting transaction for bank reconciliation
        try:
            from datetime import date as date_type
            today = date_type.today()
            prefix = f"TXN-{today.strftime('%y%m%d')}-"
            existing_txns = sb.table("accounting_transactions") \
                .select("transaction_number") \
                .like("transaction_number", f"{prefix}%") \
                .execute()
            txn_count = len(existing_txns.data) if existing_txns.data else 0
            txn_number = f"{prefix}{txn_count + 1:03d}"

            # Resolve account_id from category "ventas_contado"
            acct_result = sb.table("accounting_accounts") \
                .select("id") \
                .eq("category", "ventas_contado") \
                .eq("is_active", True) \
                .limit(1) \
                .execute()
            account_id = acct_result.data[0]["id"] if acct_result.data else None

            # Get property yard_id for proper categorization
            prop_yard = sb.table("properties") \
                .select("yard_id") \
                .eq("id", sale["property_id"]) \
                .single() \
                .execute()
            yard_id = prop_yard.data.get("yard_id") if prop_yard.data else None

            txn_insert = {
                "transaction_number": txn_number,
                "transaction_date": today.isoformat(),
                "transaction_type": "sale_cash",
                "amount": float(sale["sale_price"]),
                "is_income": True,
                "account_id": account_id,
                "entity_type": "sale",
                "entity_id": sale_id,
                "property_id": sale["property_id"],
                "yard_id": yard_id,
                "payment_method": "transferencia",
                "counterparty_name": sale["clients"]["name"],
                "counterparty_type": "client",
                "description": f"Venta contado - {sale['properties']['address']} - {sale['clients']['name']}",
                "status": "confirmed",
            }
            txn_insert = {k: v for k, v in txn_insert.items() if v is not None}
            sb.table("accounting_transactions").insert(txn_insert).execute()
            logger.info(f"[sales] Accounting transaction {txn_number} created for sale {sale_id}")
        except Exception as acct_error:
            logger.warning(f"Failed to create accounting transaction: {acct_error}")

        return {
            "ok": True,
            "sale_id": sale_id,
            "documents": documents,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error confirming transfer: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{sale_id}/complete", response_model=SaleResponse)
async def complete_sale(sale_id: str):
    """
    Complete a sale.
    
    This finalizes the sale:
    1. Marks sale as 'completed'
    2. Updates property status to 'sold'
    3. Updates client status to 'completed'
    
    Transition: paid -> completed
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] != SaleStatus.PAID.value:
        raise HTTPException(
            status_code=400,
            detail=f"Sale must be paid before completing (current status: {sale.data['status']})"
        )
    
    # Update sale
    result = sb.table("sales").update({
        "status": SaleStatus.COMPLETED.value,
        "completed_at": datetime.utcnow().isoformat(),
    }).eq("id", sale_id).execute()
    
    # Update property to sold (from published or reserved)
    sb.table("properties").update({
        "status": PropertyStatus.SOLD.value,
    }).eq("id", sale.data["property_id"]).execute()
    logger.info(f"[sales] Property {sale.data['property_id']} marked SOLD (sale {sale_id} completed)")
    
    # Update client to completed
    sb.table("clients").update({
        "status": ClientStatus.COMPLETED.value,
    }).eq("id", sale.data["client_id"]).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name, email").eq("id", sale.data["client_id"]).single().execute()
    
    # Schedule post-sale follow-up emails (review 7d + referral 30d)
    if client.data and client.data.get("email"):
        try:
            from api.services.email_service import schedule_post_sale_emails
            schedule_post_sale_emails(
                sale_id=sale_id,
                client_id=sale.data["client_id"],
                client_email=client.data["email"],
                client_name=client.data.get("name", "Cliente"),
                property_address=prop.data["address"] if prop.data else "N/A",
            )
            logger.info(f"[sales] Scheduled post-sale emails for sale {sale_id}")
        except Exception as e:
            logger.warning(f"[sales] Failed to schedule post-sale emails: {e}")
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
async def cancel_sale(sale_id: str):
    """
    Cancel a pending sale.
    
    Only pending sales can be cancelled.
    Client status is reverted to 'lead'.
    """
    # Get current sale
    sale = sb.table("sales").select("*").eq("id", sale_id).single().execute()
    if not sale.data:
        raise HTTPException(status_code=404, detail="Sale not found")
    
    if sale.data["status"] not in [SaleStatus.PENDING.value, SaleStatus.PAID.value]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot cancel sale with status: {sale.data['status']}"
        )
    
    # Update sale
    result = sb.table("sales").update({
        "status": SaleStatus.CANCELLED.value,
    }).eq("id", sale_id).execute()
    
    # Revert property to published (if it was reserved for this sale)
    prop_check = sb.table("properties").select("status").eq("id", sale.data["property_id"]).single().execute()
    if prop_check.data and prop_check.data["status"] == PropertyStatus.RESERVED.value:
        # Only un-reserve if there are no OTHER active sales on this property
        other_sales = sb.table("sales").select("id") \
            .eq("property_id", sale.data["property_id"]) \
            .neq("id", sale_id) \
            .in_("status", ["pending", "paid", "rto_pending", "rto_approved"]) \
            .execute()
        
        if not other_sales.data:
            sb.table("properties").update({
                "status": PropertyStatus.PUBLISHED.value,
            }).eq("id", sale.data["property_id"]).execute()
            logger.info(f"[sales] Property {sale.data['property_id']} reverted to PUBLISHED (sale {sale_id} cancelled)")
    
    # Revert client status
    sb.table("clients").update({
        "status": ClientStatus.LEAD.value,
    }).eq("id", sale.data["client_id"]).execute()
    
    # Get property and client info for response
    prop = sb.table("properties").select("address").eq("id", sale.data["property_id"]).single().execute()
    client = sb.table("clients").select("name").eq("id", sale.data["client_id"]).single().execute()
    
    return _format_sale(
        result.data[0],
        prop.data["address"] if prop.data else None,
        client.data["name"] if client.data else None,
    )


# ============================================================================
# HELPERS
# ============================================================================

def _safe_sale_status(value: str) -> SaleStatus:
    """Safely convert a string to SaleStatus, defaulting to PENDING for unknown values."""
    try:
        return SaleStatus(value)
    except ValueError:
        logger.warning(f"Unknown sale status '{value}', defaulting to PENDING")
        return SaleStatus.PENDING


def _resolve_employee_name(employee_id: Optional[str]) -> Optional[str]:
    """Look up an employee name by ID from the users table."""
    if not employee_id:
        return None
    try:
        result = sb.table("users").select("name").eq("id", employee_id).single().execute()
        return result.data["name"] if result.data else None
    except Exception:
        return None


def _format_sale(
    data: dict, 
    property_address: Optional[str] = None,
    client_name: Optional[str] = None,
) -> SaleResponse:
    """Format database row to SaleResponse."""
    return SaleResponse(
        id=data["id"],
        property_id=data["property_id"],
        client_id=data["client_id"],
        sale_type=SaleType(data["sale_type"]),
        sale_price=Decimal(str(data["sale_price"])),
        status=_safe_sale_status(data["status"]),
        sold_before_renovation=data.get("sold_before_renovation", False),
        payment_method=data.get("payment_method"),
        payment_reference=data.get("payment_reference"),
        created_at=data["created_at"],
        completed_at=data.get("completed_at"),
        updated_at=data["updated_at"],
        # Commission
        found_by_employee_id=data.get("found_by_employee_id"),
        sold_by_employee_id=data.get("sold_by_employee_id"),
        commission_amount=Decimal(str(data["commission_amount"])) if data.get("commission_amount") else None,
        commission_found_by=Decimal(str(data["commission_found_by"])) if data.get("commission_found_by") else None,
        commission_sold_by=Decimal(str(data["commission_sold_by"])) if data.get("commission_sold_by") else None,
        found_by_name=_resolve_employee_name(data.get("found_by_employee_id")),
        sold_by_name=_resolve_employee_name(data.get("sold_by_employee_id")),
        property_address=property_address,
        client_name=client_name,
    )


# ============================================================================
# COMMISSION REPORTS
# ============================================================================

@router.get("/commissions/report")
async def commission_report(
    month: Optional[int] = Query(None, description="Month (1-12)"),
    year: Optional[int] = Query(None, description="Year"),
):
    """
    Monthly commission report for all employees.
    
    Rules (Feb 2026):
    - Cash: $1,500 | RTO: $1,000
    - Split 50/50 between found_by and sold_by
    - Same person = 100%
    """
    from datetime import date
    
    # Default to current month
    today = date.today()
    target_month = month or today.month
    target_year = year or today.year
    
    # Get all completed sales for the month
    start_date = f"{target_year}-{target_month:02d}-01"
    if target_month == 12:
        end_date = f"{target_year + 1}-01-01"
    else:
        end_date = f"{target_year}-{target_month + 1:02d}-01"
    
    sales = sb.table("sales")\
        .select("*, properties(address), clients(name)")\
        .gte("created_at", start_date)\
        .lt("created_at", end_date)\
        .in_("status", ["paid", "completed", "rto_active", "rto_approved"])\
        .execute()
    
    if not sales.data:
        return {
            "month": target_month,
            "year": target_year,
            "total_sales": 0,
            "total_commission": 0,
            "employees": [],
        }
    
    # Aggregate by employee
    employee_commissions = {}
    total_commission = Decimal("0")
    
    for sale in sales.data:
        found_by = sale.get("found_by_employee_id")
        sold_by = sale.get("sold_by_employee_id")
        comm_found = Decimal(str(sale.get("commission_found_by") or 0))
        comm_sold = Decimal(str(sale.get("commission_sold_by") or 0))
        
        total_commission += comm_found + comm_sold
        
        if found_by and comm_found > 0:
            if found_by not in employee_commissions:
                employee_commissions[found_by] = {
                    "employee_id": found_by,
                    "total_earned": Decimal("0"),
                    "sales_found": 0,
                    "sales_closed": 0,
                    "details": [],
                }
            employee_commissions[found_by]["total_earned"] += comm_found
            employee_commissions[found_by]["sales_found"] += 1
            employee_commissions[found_by]["details"].append({
                "sale_id": sale["id"],
                "role": "found_by",
                "amount": float(comm_found),
                "sale_type": sale["sale_type"],
            })
        
        if sold_by and comm_sold > 0 and sold_by != found_by:
            if sold_by not in employee_commissions:
                employee_commissions[sold_by] = {
                    "employee_id": sold_by,
                    "total_earned": Decimal("0"),
                    "sales_found": 0,
                    "sales_closed": 0,
                    "details": [],
                }
            employee_commissions[sold_by]["total_earned"] += comm_sold
            employee_commissions[sold_by]["sales_closed"] += 1
            employee_commissions[sold_by]["details"].append({
                "sale_id": sale["id"],
                "role": "sold_by",
                "amount": float(comm_sold),
                "sale_type": sale["sale_type"],
            })
    
    # Resolve employee names
    employee_list = []
    for emp_id, data in employee_commissions.items():
        try:
            emp = sb.table("users").select("name").eq("id", emp_id).single().execute()
            data["name"] = emp.data["name"] if emp.data else "Desconocido"
        except Exception:
            data["name"] = "Desconocido"
        data["total_earned"] = float(data["total_earned"])
        employee_list.append(data)
    
    # Sort by total earned (gamification: top earner first)
    employee_list.sort(key=lambda x: x["total_earned"], reverse=True)
    
    return {
        "month": target_month,
        "year": target_year,
        "total_sales": len(sales.data),
        "total_commission": float(total_commission),
        "employees": employee_list,
    }

