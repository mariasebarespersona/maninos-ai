"""
Properties API Routes
Handles the Comercializar flow steps 1-4:
  1. Compra Casa
  2. Fotos/Publicar  
  3. Renovar (optional)
  4. Volver a Publicar

SELL RULE (Feb 2026):
  Max sale price = 80% of blended market value.
  Market value = avg(historical Maninos sales, web scraping avg).
"""

import logging
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from datetime import datetime

from api.models.schemas import (
    PropertyCreate,
    PropertyUpdate,
    PropertyResponse,
    PropertyStatus,
    RenovationCreate,
    RenovationUpdate,
    RenovationResponse,
)
from api.services.property_service import PropertyService
from api.utils.qualification import (
    SELL_PERCENT,
    get_sell_price_recommendation,
    calculate_max_sell_price,
    calculate_market_value,
)
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter()

MARGIN_FIXED = 9500  # Fixed margin per business rule
COMMISSION_MAX = 1500  # Max commission (contado = $1500, RTO = $1000)


def _calculate_post_renovation_price(property_id: str, purchase_price: float) -> dict:
    """
    Calculate the recommended sale price post-renovation.
    Formula: 9500 + purchase_price + commission + renovation_cost + move_cost
    """
    # Renovation cost
    reno_cost = 0.0
    try:
        reno = sb.table("renovations").select("total_cost, status") \
            .eq("property_id", property_id) \
            .order("created_at", desc=True).limit(1).execute()
        if reno.data:
            reno_cost = float(reno.data[0].get("total_cost", 0) or 0)
    except Exception as e:
        logger.warning(f"[price_calc] Could not fetch renovation cost: {e}")

    # Move cost (sum of all completed or quoted moves for this property)
    move_cost = 0.0
    try:
        moves = sb.table("moves").select("quoted_cost, final_cost, status") \
            .eq("property_id", property_id).execute()
        for m in (moves.data or []):
            cost = float(m.get("final_cost") or m.get("quoted_cost") or 0)
            if cost > 0:
                move_cost += cost
    except Exception as e:
        logger.warning(f"[price_calc] Could not fetch move cost: {e}")

    commission = COMMISSION_MAX
    total = MARGIN_FIXED + purchase_price + commission + reno_cost + move_cost

    return {
        "margin": MARGIN_FIXED,
        "purchase_price": purchase_price,
        "commission": commission,
        "renovation_cost": round(reno_cost, 2),
        "move_cost": round(move_cost, 2),
        "recommended_sale_price": round(total, 2),
    }


# ============================================================================
# PROPERTIES CRUD
# ============================================================================

@router.get("", response_model=list[PropertyResponse])
async def list_properties(
    status: Optional[PropertyStatus] = Query(None, description="Filter by status"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """List all properties with optional status filter."""
    query = sb.table("properties").select("*")

    if status:
        query = query.eq("status", status.value)
    else:
        # By default, hide pending_payment properties (not yet paid)
        query = query.neq("status", "pending_payment")

    query = query.order("created_at", desc=True).range(offset, offset + limit - 1)
    
    result = query.execute()
    
    return [_format_property(p) for p in result.data]


@router.get("/financial-summary")
async def financial_summary():
    """
    Consolidated financial summary for ALL properties.
    Returns costs, sale data, payment totals — used by Resumen Financiero page (admin only).
    """
    try:
        # 1. All properties
        props_result = sb.table("properties") \
            .select("id, address, property_code, city, status, purchase_price, sale_price") \
            .order("created_at", desc=True) \
            .execute()
        properties = props_result.data or []
        if not properties:
            return {"ok": True, "properties": []}

        prop_ids = [p["id"] for p in properties]

        # 2. Renovation costs (latest per property)
        reno_map = {}
        try:
            renos = sb.table("renovations") \
                .select("property_id, total_cost, created_at") \
                .in_("property_id", prop_ids) \
                .order("created_at", desc=True) \
                .execute()
            for r in (renos.data or []):
                pid = r["property_id"]
                if pid not in reno_map:  # Keep latest only
                    reno_map[pid] = float(r.get("total_cost") or 0)
        except Exception as e:
            logger.warning(f"[financial-summary] reno error: {e}")

        # 3. Move costs (sum per property)
        move_map = {}
        try:
            moves = sb.table("moves") \
                .select("property_id, quoted_cost, final_cost") \
                .in_("property_id", prop_ids) \
                .execute()
            for m in (moves.data or []):
                pid = m["property_id"]
                cost = float(m.get("final_cost") or m.get("quoted_cost") or 0)
                move_map[pid] = move_map.get(pid, 0) + cost
        except Exception as e:
            logger.warning(f"[financial-summary] moves error: {e}")

        # 4. Sale data per property (latest active/completed sale)
        sale_map = {}
        try:
            sales = sb.table("sales") \
                .select("id, property_id, sale_price, sale_type, status, amount_paid, amount_pending, commission_amount, client_id") \
                .in_("property_id", prop_ids) \
                .neq("status", "cancelled") \
                .order("created_at", desc=True) \
                .execute()

            # Get client names
            client_ids = list(set(s["client_id"] for s in (sales.data or []) if s.get("client_id")))
            client_map = {}
            if client_ids:
                clients = sb.table("clients").select("id, name").in_("id", client_ids).execute()
                client_map = {c["id"]: c["name"] for c in (clients.data or [])}

            for s in (sales.data or []):
                pid = s["property_id"]
                if pid not in sale_map:  # Keep latest
                    sale_map[pid] = {
                        "sale_id": s["id"],
                        "sale_price": float(s.get("sale_price") or 0),
                        "sale_type": s.get("sale_type"),
                        "sale_status": s.get("status"),
                        "amount_paid": float(s.get("amount_paid") or 0),
                        "amount_pending": float(s.get("amount_pending") or 0),
                        "commission": float(s.get("commission_amount") or 0),
                        "client_name": client_map.get(s.get("client_id"), ""),
                    }
        except Exception as e:
            logger.warning(f"[financial-summary] sales error: {e}")

        # 5. Payment orders per property (count + total)
        po_map = {}
        try:
            pos = sb.table("payment_orders") \
                .select("property_id, amount, status") \
                .in_("property_id", prop_ids) \
                .execute()
            for po in (pos.data or []):
                pid = po["property_id"]
                if pid not in po_map:
                    po_map[pid] = {"count": 0, "total": 0}
                po_map[pid]["count"] += 1
                po_map[pid]["total"] += float(po.get("amount") or 0)
        except Exception as e:
            logger.warning(f"[financial-summary] payment_orders error: {e}")

        # 6. Accounting transaction count per property
        txn_map = {}
        try:
            txns = sb.table("accounting_transactions") \
                .select("property_id") \
                .in_("property_id", prop_ids) \
                .execute()
            for t in (txns.data or []):
                pid = t.get("property_id")
                if pid:
                    txn_map[pid] = txn_map.get(pid, 0) + 1
        except Exception as e:
            logger.warning(f"[financial-summary] txn error: {e}")

        # Build response
        result = []
        for p in properties:
            pid = p["id"]
            pp = float(p.get("purchase_price") or 0)
            reno = reno_map.get(pid, 0)
            move = move_map.get(pid, 0)
            sale = sale_map.get(pid, {})
            sp = sale.get("sale_price") or float(p.get("sale_price") or 0)
            commission = sale.get("commission", COMMISSION_MAX)
            total_inv = pp + reno + move
            profit = sp - total_inv - commission - MARGIN_FIXED if sp > 0 else 0
            po = po_map.get(pid, {"count": 0, "total": 0})

            result.append({
                "id": pid,
                "address": p.get("address", ""),
                "property_code": p.get("property_code", ""),
                "city": p.get("city", ""),
                "status": p.get("status", ""),
                "purchase_price": round(pp, 2),
                "renovation_cost": round(reno, 2),
                "move_cost": round(move, 2),
                "commission": round(commission, 2),
                "margin": MARGIN_FIXED,
                "total_investment": round(total_inv, 2),
                "sale_price": round(sp, 2),
                "profit": round(profit, 2),
                "amount_paid": sale.get("amount_paid", 0),
                "amount_pending": sale.get("amount_pending", 0),
                "sale_id": sale.get("sale_id"),
                "sale_status": sale.get("sale_status"),
                "sale_type": sale.get("sale_type"),
                "client_name": sale.get("client_name", ""),
                "payment_orders_count": po["count"],
                "payment_orders_total": round(po["total"], 2),
                "accounting_txn_count": txn_map.get(pid, 0),
            })

        return {"ok": True, "properties": result}
    except Exception as e:
        logger.error(f"[financial-summary] Error: {e}")
        return {"ok": False, "properties": [], "error": str(e)}


@router.get("/{property_id}/financial-detail")
async def financial_detail(property_id: str):
    """
    Full financial detail for ONE property — used by Resumen Financiero expanded view.
    Returns property info, renovation, moves, sale, payments, payment orders, title, transactions.
    """
    try:
        # Property
        prop_result = sb.table("properties") \
            .select("id, address, property_code, city, status, purchase_price, sale_price, seller_name, seller_contact, created_at") \
            .eq("id", property_id).single().execute()
        if not prop_result.data:
            from fastapi import HTTPException
            raise HTTPException(status_code=404, detail="Property not found")
        prop = prop_result.data

        # Renovation (latest)
        renovation = None
        try:
            reno = sb.table("renovations") \
                .select("total_cost, materials, status, notes, created_at, updated_at") \
                .eq("property_id", property_id) \
                .order("created_at", desc=True).limit(1).execute()
            if reno.data:
                r = reno.data[0]
                mats = r.get("materials") or {}
                # Extract items summary
                items = mats.get("items", {})
                active_items = [k for k, v in items.items() if isinstance(v, dict) and (float(v.get("mano_obra", 0)) + float(v.get("materiales", 0)) > 0)]
                renovation = {
                    "total_cost": float(r.get("total_cost") or 0),
                    "status": r.get("status"),
                    "responsable": mats.get("responsable", ""),
                    "approval_status": mats.get("approval_status", ""),
                    "fecha_inicio": mats.get("fecha_inicio", ""),
                    "fecha_fin": mats.get("fecha_fin", ""),
                    "items_summary": ", ".join(active_items[:8]),
                    "items_count": len(active_items),
                    "created_at": r.get("created_at"),
                }
        except Exception:
            pass

        # Moves
        moves = []
        try:
            moves_result = sb.table("moves") \
                .select("id, origin_yard, destination_yard, quoted_cost, final_cost, status, payment_status, transport_company, move_date, created_at") \
                .eq("property_id", property_id) \
                .order("created_at", desc=True).execute()
            moves = [
                {
                    "origin": m.get("origin_yard", ""),
                    "destination": m.get("destination_yard", ""),
                    "quoted_cost": float(m.get("quoted_cost") or 0),
                    "final_cost": float(m.get("final_cost") or 0),
                    "cost": float(m.get("final_cost") or m.get("quoted_cost") or 0),
                    "status": m.get("status"),
                    "payment_status": m.get("payment_status"),
                    "company": m.get("transport_company", ""),
                    "date": m.get("move_date"),
                }
                for m in (moves_result.data or [])
            ]
        except Exception:
            pass

        # Sale (latest non-cancelled)
        sale = None
        sale_id = None
        try:
            sale_result = sb.table("sales") \
                .select("id, sale_type, sale_price, status, amount_paid, amount_pending, commission_amount, commission_found_by, commission_sold_by, found_by_employee_id, sold_by_employee_id, payment_method, created_at, completed_at, client_id") \
                .eq("property_id", property_id) \
                .neq("status", "cancelled") \
                .order("created_at", desc=True).limit(1).execute()
            if sale_result.data:
                s = sale_result.data[0]
                sale_id = s["id"]
                # Resolve client + employee names
                client_name = ""
                if s.get("client_id"):
                    try:
                        c = sb.table("clients").select("name, email, phone").eq("id", s["client_id"]).single().execute()
                        client_name = c.data.get("name", "") if c.data else ""
                    except Exception:
                        pass
                found_name = ""
                sold_name = ""
                if s.get("found_by_employee_id"):
                    try:
                        e = sb.table("users").select("name").eq("id", s["found_by_employee_id"]).single().execute()
                        found_name = e.data.get("name", "") if e.data else ""
                    except Exception:
                        pass
                if s.get("sold_by_employee_id"):
                    try:
                        e = sb.table("users").select("name").eq("id", s["sold_by_employee_id"]).single().execute()
                        sold_name = e.data.get("name", "") if e.data else ""
                    except Exception:
                        pass
                sale = {
                    "id": sale_id,
                    "type": s.get("sale_type"),
                    "price": float(s.get("sale_price") or 0),
                    "status": s.get("status"),
                    "amount_paid": float(s.get("amount_paid") or 0),
                    "amount_pending": float(s.get("amount_pending") or 0),
                    "commission_total": float(s.get("commission_amount") or 0),
                    "commission_found": float(s.get("commission_found_by") or 0),
                    "commission_sold": float(s.get("commission_sold_by") or 0),
                    "found_by": found_name,
                    "sold_by": sold_name,
                    "payment_method": s.get("payment_method"),
                    "client_name": client_name,
                    "created_at": s.get("created_at"),
                    "completed_at": s.get("completed_at"),
                }
        except Exception:
            pass

        # Sale payments
        payments = []
        if sale_id:
            try:
                pay_result = sb.table("sale_payments") \
                    .select("*") \
                    .eq("sale_id", sale_id) \
                    .order("created_at").execute()
                payments = pay_result.data or []
            except Exception:
                pass

        # Payment orders (for THIS property only)
        payment_orders = []
        try:
            po_result = sb.table("payment_orders") \
                .select("id, amount, status, payee_name, method, reference, payment_date, notes, concept, created_by, created_at, completed_at") \
                .eq("property_id", property_id) \
                .order("created_at", desc=True).execute()
            payment_orders = po_result.data or []
        except Exception:
            pass

        # Title transfer
        title_transfer = None
        try:
            tt_result = sb.table("title_transfers") \
                .select("id, status, from_name, to_name, transfer_type, created_at, completed_at") \
                .eq("property_id", property_id) \
                .order("created_at", desc=True).limit(1).execute()
            if tt_result.data:
                title_transfer = tt_result.data[0]
        except Exception:
            pass

        # Accounting transactions
        transactions = []
        try:
            txn_result = sb.table("accounting_transactions") \
                .select("id, transaction_type, amount, is_income, status, description, transaction_date, counterparty_name") \
                .eq("property_id", property_id) \
                .order("transaction_date", desc=True).execute()
            transactions = txn_result.data or []
        except Exception:
            pass

        return {
            "ok": True,
            "property": prop,
            "renovation": renovation,
            "moves": moves,
            "sale": sale,
            "payments": payments,
            "payment_orders": payment_orders,
            "title_transfer": title_transfer,
            "transactions": transactions,
        }
    except Exception as e:
        logger.error(f"[financial-detail] Error: {e}")
        from fastapi import HTTPException
        if isinstance(e, HTTPException):
            raise
        return {"ok": False, "error": str(e)}


@router.get("/stats")
async def get_property_stats():
    """Get property statistics for the dashboard."""
    try:
        # Get all properties
        result = sb.table("properties").select("status, purchase_price, sale_price, city").execute()
        
        properties = result.data or []
        
        # Count by status
        status_counts = {}
        total_invested = 0
        total_sold = 0
        cities = {}
        
        for p in properties:
            status = p.get("status", "unknown")
            status_counts[status] = status_counts.get(status, 0) + 1
            
            # Sum purchase prices
            if p.get("purchase_price"):
                try:
                    total_invested += float(p["purchase_price"])
                except (ValueError, TypeError):
                    pass
            
            # Sum sale prices for sold properties
            if status == "sold" and p.get("sale_price"):
                try:
                    total_sold += float(p["sale_price"])
                except (ValueError, TypeError):
                    pass
            
            # Count by city
            city = p.get("city") or "Sin ciudad"
            cities[city] = cities.get(city, 0) + 1
        
        return {
            "total": len(properties),
            "by_status": status_counts,
            "total_invested": round(total_invested, 2),
            "total_sold": round(total_sold, 2),
            "profit": round(total_sold - total_invested, 2) if total_sold else 0,
            "by_city": [{"city": k, "count": v} for k, v in sorted(cities.items(), key=lambda x: x[1], reverse=True)[:10]],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{property_id}", response_model=PropertyResponse)
async def get_property(property_id: str):
    """Get a single property by ID."""
    result = sb.table("properties").select("*").eq("id", property_id).single().execute()
    
    if not result.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    return _format_property(result.data)


@router.post("", response_model=PropertyResponse)
async def create_property(data: PropertyCreate):
    """
    Create a new property (Paso 1: Compra Casa).
    Property starts in 'purchased' status.
    Auto-generates property_code (A1, A2, ...) if not provided.
    """
    # Get data from request
    request_data = data.model_dump(exclude_none=True)
    
    # Auto-generate property_code if not provided
    if "property_code" not in request_data or not request_data.get("property_code"):
        request_data["property_code"] = _generate_next_property_code()
    
    # Build insert data with defaults, but respect values from request
    insert_data = {
        **request_data,
        "status": request_data.get("status", PropertyStatus.PURCHASED.value),
        "is_renovated": request_data.get("is_renovated", False),
        "photos": request_data.get("photos", []),
        "checklist_completed": request_data.get("checklist_completed", False),
        "checklist_data": request_data.get("checklist_data", {}),
        "document_data": request_data.get("document_data", {}),
    }
    
    # Convert Decimal to float for JSON serialization
    for key in ["purchase_price", "sale_price", "bathrooms"]:
        if key in insert_data and insert_data[key] is not None:
            insert_data[key] = float(insert_data[key])
    for key in ["year", "bedrooms", "square_feet", "length_ft", "width_ft"]:
        if key in insert_data and insert_data[key] is not None:
            insert_data[key] = int(insert_data[key])
    
    logger.info(f"[properties] Creating property with status='{insert_data.get('status')}', address='{insert_data.get('address')}'")

    try:
        result = sb.table("properties").insert(insert_data).execute()
    except Exception as e:
        logger.error(f"Supabase insert error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error creating property: {e}",
        )
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create property")
    
    return _format_property(result.data[0])


@router.patch("/{property_id}", response_model=PropertyResponse)
async def update_property(property_id: str, data: PropertyUpdate):
    """Update property details."""
    # Get current property
    try:
        current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    except Exception as e:
        logger.error(f"Error fetching property {property_id}: {e}")
        raise HTTPException(status_code=404, detail=f"Property not found: {e}")
    
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    update_data = data.model_dump(exclude_none=True)
    
    # Strip out columns that may not exist yet (migration 046/047)
    # so the update doesn't fail if the migration hasn't been run.
    db_columns = set(current.data.keys())
    unknown_cols = [k for k in update_data if k not in db_columns]
    if unknown_cols:
        logger.warning(
            f"Stripping unknown columns from update payload for property "
            f"{property_id}: {unknown_cols}. Run pending migrations (046 for length_ft/width_ft, 047 for document_data)."
        )
        # If document_data is being stripped, return a clear error instead of silently losing data
        if "document_data" in unknown_cols:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot save document_data: column does not exist. "
                    f"Run migration 047 in Supabase SQL Editor to add the document_data column."
                ),
            )
        for col in unknown_cols:
            del update_data[col]
    
    # Convert Decimal to float for JSON serialization
    for key in ["purchase_price", "sale_price", "bathrooms"]:
        if key in update_data and update_data[key] is not None:
            update_data[key] = float(update_data[key])
    for key in ["year", "bedrooms", "square_feet", "length_ft", "width_ft"]:
        if key in update_data and update_data[key] is not None:
            update_data[key] = int(update_data[key])
    
    if not update_data:
        return _format_property(current.data)
    
    try:
        result = sb.table("properties").update(update_data).eq("id", property_id).execute()
    except Exception as e:
        logger.error(f"Supabase update error for property {property_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error updating property: {e}",
        )
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update property")
    
    return _format_property(result.data[0])


@router.delete("/{property_id}")
async def delete_property(property_id: str):
    """Delete a property and all related records (only if not sold)."""
    import logging
    logger = logging.getLogger(__name__)
    
    # Check current status
    current = sb.table("properties").select("status").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    if current.data["status"] in (PropertyStatus.SOLD.value, PropertyStatus.RESERVED.value):
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete a property with status '{current.data['status']}'"
        )
    
    deleted_records = []
    
    try:
        # Delete related records first (in correct order due to foreign keys)
        # Each delete is wrapped in try/except to handle missing tables/columns
        
        # 1. Delete renovation_items (linked to renovations)
        try:
            renovations = sb.table("renovations").select("id").eq("property_id", property_id).execute()
            if renovations.data:
                for reno in renovations.data:
                    sb.table("renovation_items").delete().eq("renovation_id", reno["id"]).execute()
                deleted_records.append("renovation_items")
        except Exception as e:
            logger.warning(f"Could not delete renovation_items: {e}")
        
        # 2. Delete renovations
        try:
            sb.table("renovations").delete().eq("property_id", property_id).execute()
            deleted_records.append("renovations")
        except Exception as e:
            logger.warning(f"Could not delete renovations: {e}")
        
        # 3. Delete title_transfers
        try:
            sb.table("title_transfers").delete().eq("property_id", property_id).execute()
            deleted_records.append("title_transfers")
        except Exception as e:
            logger.warning(f"Could not delete title_transfers: {e}")
        
        # 4. Delete sales
        try:
            sb.table("sales").delete().eq("property_id", property_id).execute()
            deleted_records.append("sales")
        except Exception as e:
            logger.warning(f"Could not delete sales: {e}")
        
        # 5. Finally delete the property
        sb.table("properties").delete().eq("id", property_id).execute()
        deleted_records.append("property")
        
        return {
            "message": "Property deleted successfully",
            "deleted": deleted_records
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting property: {str(e)}")


@router.put("/{property_id}/photos", response_model=PropertyResponse)
async def update_property_photos(property_id: str, photos: list[str]):
    """
    Update photos for a property.
    Replaces all existing photos with the new list.
    Used by the PhotoUploader component.
    """
    current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    result = sb.table("properties").update({
        "photos": photos
    }).eq("id", property_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update photos")
    
    return _format_property(result.data[0])


@router.put("/{property_id}/checklist", response_model=PropertyResponse)
async def update_property_checklist(property_id: str, data: dict):
    """
    Update the purchase checklist for a property.
    The checklist contains 26 verification points for property purchase.
    """
    current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    checklist_data = data.get("purchase_checklist", {})
    
    # Count completed items to determine if checklist is complete
    completed_count = sum(1 for v in checklist_data.values() if v)
    total_items = 26  # Total checklist items
    is_complete = completed_count == total_items
    
    result = sb.table("properties").update({
        "checklist_data": checklist_data,
        "checklist_completed": is_complete
    }).eq("id", property_id).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update checklist")
    
    return _format_property(result.data[0])


# ============================================================================
# SELL-PRICE RECOMMENDATION (80% rule — Feb 2026)
# ============================================================================

def _get_market_value_data(city: str) -> dict:
    """
    Fetch market value components for a city:
      1. scraping_avg  — latest market_analysis for the city
      2. historical_avg — average sale_price from Maninos' own completed sales
    """
    scraping_avg = None
    historical_avg = None

    # Web scraping average
    try:
        analysis = sb.table("market_analysis") \
            .select("market_value_avg") \
            .order("scraped_at", desc=True) \
            .limit(1).execute()
        if analysis.data:
            scraping_avg = float(analysis.data[0].get("market_value_avg") or 0)
    except Exception:
        pass

    # Maninos historical average (completed sales in the same city)
    try:
        hist = sb.table("sales") \
            .select("sale_price, properties!inner(city)") \
            .eq("status", "completed") \
            .execute()
        if hist.data:
            # Filter to matching city if possible
            prices = []
            for s in hist.data:
                prop = s.get("properties", {}) or {}
                s_city = (prop.get("city") or "").lower().strip()
                if city and s_city == city.lower().strip():
                    prices.append(float(s.get("sale_price", 0)))
            # If not enough city-specific data, use all sales
            if len(prices) < 3:
                prices = [float(s.get("sale_price", 0))
                          for s in hist.data if s.get("sale_price")]
            if prices:
                historical_avg = round(sum(prices) / len(prices), 2)
    except Exception as e:
        logger.warning(f"Could not fetch historical sales avg: {e}")

    return {"scraping_avg": scraping_avg, "historical_avg": historical_avg}


@router.get("/{property_id}/recommended-price")
async def get_recommended_price(property_id: str):
    """
    Calculate recommended sell price for a property using the 80% rule.

    Market value = average of (web scraping avg + Maninos historical sales avg).
    Max sell price = market_value × 80%.

    Returns full breakdown including profit, ROI, and sources.
    """
    prop = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    purchase_price = float(prop.data.get("purchase_price", 0) or 0)
    city = prop.data.get("city", "")

    # Get renovation cost
    reno_cost = 0.0
    try:
        reno = sb.table("renovations") \
            .select("total_cost") \
            .eq("property_id", property_id) \
            .order("created_at", desc=True) \
            .limit(1).execute()
        if reno.data:
            reno_cost = float(reno.data[0].get("total_cost", 0) or 0)
    except Exception:
        pass

    mv = _get_market_value_data(city)

    result = get_sell_price_recommendation(
        purchase_price=purchase_price,
        renovation_cost=reno_cost,
        scraping_avg=mv["scraping_avg"],
        historical_avg=mv["historical_avg"],
    )

    result["property_id"] = property_id
    result["purchase_price"] = purchase_price
    result["renovation_cost"] = reno_cost
    result["city"] = city
    result["sell_rule_pct"] = int(SELL_PERCENT * 100)

    return result


# ============================================================================
# PROPERTY ACTIONS (State Transitions)
# ============================================================================

@router.post("/{property_id}/publish", response_model=PropertyResponse)
async def publish_property(
    property_id: str, 
    sale_price: float = Query(..., description="Sale price for the property"),
    photos: Optional[list[str]] = Query(None, description="List of photo URLs"),
    force: bool = Query(False, description="Force publish even if price exceeds 80% rule"),
):
    """
    Publish a property (Paso 2: Fotos/Publicar).
    Transitions: purchased -> published OR renovating -> published.

    Validates sale_price against the 80% rule:
      sale_price ≤ market_value × 80%.
    Pass force=true to override the warning (the price is still stored).
    """
    current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    current_status = PropertyStatus(current.data["status"])
    
    # Validate transition
    is_valid, error = PropertyService.validate_transition(
        current_status, PropertyStatus.PUBLISHED
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)

    # ---- 80% rule validation (disabled — price at seller's discretion) ----
    if False:
        city = current.data.get("city", "")
        mv = _get_market_value_data(city)
        market_value = calculate_market_value(mv["scraping_avg"], mv["historical_avg"])

        if market_value and market_value > 0:
            max_sell = calculate_max_sell_price(market_value)
            if sale_price > max_sell:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Precio de venta ${sale_price:,.0f} excede el máximo permitido "
                        f"(80% del valor de mercado ${market_value:,.0f} = ${max_sell:,.0f}). "
                        f"Puedes forzar la publicación con force=true."
                    ),
                )
            logger.info(
                f"[Publish] 80% rule OK: ${sale_price:,.0f} ≤ ${max_sell:,.0f} "
                f"(market ${market_value:,.0f})"
            )
    
    update_data = {
        "status": PropertyStatus.PUBLISHED.value,
        "sale_price": sale_price,
    }
    
    if photos:
        # Append new photos to existing
        existing_photos = current.data.get("photos", []) or []
        update_data["photos"] = existing_photos + photos
    
    result = sb.table("properties").update(update_data).eq("id", property_id).execute()
    
    return _format_property(result.data[0])


@router.post("/{property_id}/start-renovation", response_model=RenovationResponse)
async def start_renovation(property_id: str, data: RenovationCreate):
    """
    Start renovation process (Paso 3: Renovar).
    Transition: published -> renovating
    
    Renovation is OPTIONAL - only done if property doesn't sell initially.
    """
    current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    current_status = PropertyStatus(current.data["status"])
    
    # Validate transition
    is_valid, error = PropertyService.validate_transition(
        current_status, PropertyStatus.RENOVATING
    )
    if not is_valid:
        raise HTTPException(status_code=400, detail=error)
    
    # Update property status
    sb.table("properties").update({
        "status": PropertyStatus.RENOVATING.value
    }).eq("id", property_id).execute()
    
    # Create renovation record
    renovation_data = {
        "property_id": property_id,
        "materials": [],
        "total_cost": 0,
        "notes": data.notes,
        "status": "in_progress",
        "was_moved": data.was_moved,
    }
    
    result = sb.table("renovations").insert(renovation_data).execute()
    
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create renovation record")
    
    return _format_renovation(result.data[0])


@router.patch("/{property_id}/renovation", response_model=RenovationResponse)
async def update_renovation(property_id: str, data: RenovationUpdate):
    """
    Update renovation details (add materials, costs, notes).
    Supports voice input for materials via notes field.
    """
    # Get current renovation
    renovation = sb.table("renovations").select("*").eq("property_id", property_id).eq("status", "in_progress").single().execute()
    
    if not renovation.data:
        raise HTTPException(status_code=404, detail="No active renovation found for this property")
    
    update_data = {}
    
    if data.materials is not None:
        materials_list = [m.model_dump() for m in data.materials]
        # Convert Decimal to float
        for m in materials_list:
            m["unit_cost"] = float(m["unit_cost"])
            m["total"] = float(m["total"]) if m["total"] else float(m["unit_cost"]) * m["quantity"]
        update_data["materials"] = materials_list
        update_data["total_cost"] = sum(m["total"] for m in materials_list)
    
    if data.notes is not None:
        update_data["notes"] = data.notes
    
    if data.was_moved is not None:
        update_data["was_moved"] = data.was_moved
    
    if not update_data:
        return _format_renovation(renovation.data)
    
    result = sb.table("renovations").update(update_data).eq("id", renovation.data["id"]).execute()

    return _format_renovation(result.data[0])


@router.post("/{property_id}/renovation/request-payment")
async def request_renovation_payment(property_id: str):
    """
    Create a payment order for a renovation.
    Goes through the approval flow: Sebastian approves → Abigail pays.
    """
    from datetime import datetime

    # Get renovation with property info
    reno = sb.table("renovations").select("*") \
        .eq("property_id", property_id) \
        .order("created_at", desc=True).limit(1).execute()

    if not reno.data:
        raise HTTPException(status_code=404, detail="No hay renovación para esta propiedad")

    renovation = reno.data[0]
    cost = float(renovation.get("total_cost") or 0)
    if cost <= 0:
        raise HTTPException(status_code=400, detail="La renovación no tiene costo asignado")

    # Get property info
    prop = sb.table("properties").select("address, city").eq("id", property_id).single().execute()
    prop_address = ""
    if prop.data:
        prop_address = f"{prop.data.get('address', 'N/A')}, {prop.data.get('city', '')}"

    # Check if payment order already exists for this renovation
    existing = sb.table("payment_orders").select("id") \
        .eq("property_id", property_id) \
        .like("notes", f"%Renovación%{renovation['id'][:8]}%") \
        .in_("status", ["pending", "approved"]) \
        .execute()
    if existing.data:
        raise HTTPException(status_code=400, detail="Ya existe una orden de pago para esta renovación")

    # Create payment order
    order_data = {
        "property_id": property_id,
        "property_address": prop_address,
        "payee_name": "Proveedor Renovación",
        "amount": cost,
        "method": "transferencia",
        "status": "pending",
        "notes": f"Pago renovación: {prop_address}\nCosto total: ${cost:,.2f}\nRenovación ID: {renovation['id'][:8]}",
        "created_by": "sistema_renovaciones",
    }

    order_result = sb.table("payment_orders").insert(order_data).execute()
    if not order_result.data:
        raise HTTPException(status_code=500, detail="Error al crear orden de pago")

    logger.info(f"[properties] Payment order created for renovation on {property_id}: ${cost}")

    return {
        "ok": True,
        "payment_order": order_result.data[0],
        "message": f"Orden de pago por ${cost:,.2f} creada para renovación",
    }


@router.post("/{property_id}/complete-renovation", response_model=PropertyResponse)
async def complete_renovation(
    property_id: str,
    new_sale_price: Optional[float] = None,
    force: bool = Query(False, description="Force publish even if price exceeds 80% rule"),
):
    """
    Complete renovation and republish (Paso 4: Volver a Publicar).
    Transition: renovating -> published.

    Validates new_sale_price against the 80% rule (same as publish).
    """
    current = sb.table("properties").select("*").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    current_status = PropertyStatus(current.data["status"])
    
    if current_status != PropertyStatus.RENOVATING:
        raise HTTPException(
            status_code=400, 
            detail=f"Property is not in renovating status (current: {current_status.value})"
        )
    
    # ---- 80% rule validation on new price (disabled) ----
    if False:
        city = current.data.get("city", "")
        mv = _get_market_value_data(city)
        market_value = calculate_market_value(mv["scraping_avg"], mv["historical_avg"])

        if market_value and market_value > 0:
            max_sell = calculate_max_sell_price(market_value)
            if new_sale_price > max_sell:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"Nuevo precio ${new_sale_price:,.0f} excede el máximo (80% de "
                        f"${market_value:,.0f} = ${max_sell:,.0f}). Usa force=true para forzar."
                    ),
                )

    # Complete renovation record
    sb.table("renovations").update({
        "status": "completed",
        "completed_at": datetime.utcnow().isoformat()
    }).eq("property_id", property_id).eq("status", "in_progress").execute()
    
    # Update property
    update_data = {
        "status": PropertyStatus.PUBLISHED.value,
        "is_renovated": True,
    }

    if new_sale_price:
        update_data["sale_price"] = new_sale_price
    else:
        # Auto-calculate price using formula: 9500 + compra + comision + reparacion + movida
        purchase_price = float(current.data.get("purchase_price", 0) or 0)
        if purchase_price > 0:
            calc = _calculate_post_renovation_price(property_id, purchase_price)
            update_data["sale_price"] = calc["recommended_sale_price"]
            logger.info(f"[properties] Auto-calculated post-renovation price for {property_id}: ${calc['recommended_sale_price']:,.2f}")

    result = sb.table("properties").update(update_data).eq("id", property_id).execute()

    return _format_property(result.data[0])


@router.get("/{property_id}/post-renovation-price")
async def get_post_renovation_price(property_id: str):
    """
    Get the calculated post-renovation sale price breakdown.
    Formula: 9500 + purchase_price + commission ($1,500) + renovation_cost + move_cost
    """
    prop = sb.table("properties").select("id, purchase_price, sale_price, address, city") \
        .eq("id", property_id).single().execute()
    if not prop.data:
        raise HTTPException(status_code=404, detail="Property not found")

    purchase_price = float(prop.data.get("purchase_price", 0) or 0)
    calc = _calculate_post_renovation_price(property_id, purchase_price)
    calc["current_sale_price"] = float(prop.data.get("sale_price", 0) or 0)
    calc["property_address"] = f"{prop.data.get('address', '')}, {prop.data.get('city', '')}"

    return {"ok": True, **calc}


@router.get("/{property_id}/actions")
async def get_available_actions(property_id: str):
    """Get available actions for a property based on its current status."""
    current = sb.table("properties").select("status").eq("id", property_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Property not found")
    
    status = PropertyStatus(current.data["status"])
    actions = PropertyService.get_available_actions(status)
    
    return {
        "property_id": property_id,
        "current_status": status.value,
        "available_actions": actions,
    }


# ============================================================================
# HELPERS
# ============================================================================

def _generate_next_property_code() -> str:
    """
    Generate the next property_code in the sequence A1, A2, ..., A999, B1, B2, ...
    Queries existing codes and returns the next available one.
    """
    import re
    try:
        result = sb.table("properties") \
            .select("property_code") \
            .not_.is_("property_code", "null") \
            .execute()
        
        existing_codes = [r["property_code"] for r in (result.data or []) if r.get("property_code")]
        
        if not existing_codes:
            return "A1"
        
        # Parse codes like "A1", "A2", "B1" etc.
        max_letter = "A"
        max_number = 0
        
        for code in existing_codes:
            match = re.match(r'^([A-Z])(\d+)$', code.upper())
            if match:
                letter, num = match.group(1), int(match.group(2))
                if letter > max_letter or (letter == max_letter and num > max_number):
                    max_letter = letter
                    max_number = num
        
        # Increment
        next_number = max_number + 1
        if next_number > 999:
            # Move to next letter
            next_letter = chr(ord(max_letter) + 1)
            if next_letter > 'Z':
                next_letter = 'A'  # Wrap around (unlikely)
            return f"{next_letter}1"
        
        return f"{max_letter}{next_number}"
    except Exception as e:
        logger.warning(f"Error generating property code: {e}")
        return "A1"


def _format_property(data: dict) -> PropertyResponse:
    """Format database row to PropertyResponse.
    
    Uses `or` instead of dict.get(key, default) for boolean/collection fields
    because dict.get returns None (not the default) when the key exists with
    value None — and Pydantic rejects None for non-Optional bool fields.
    """
    return PropertyResponse(
        id=data["id"],
        address=data["address"],
        city=data.get("city"),
        state=data.get("state") or "Texas",
        zip_code=data.get("zip_code"),
        hud_number=data.get("hud_number"),
        year=data.get("year"),
        purchase_price=data.get("purchase_price"),
        sale_price=data.get("sale_price"),
        bedrooms=data.get("bedrooms"),
        bathrooms=data.get("bathrooms"),
        square_feet=data.get("square_feet"),
        property_code=data.get("property_code"),
        length_ft=data.get("length_ft"),
        width_ft=data.get("width_ft"),
        document_data=data.get("document_data") or {},
        status=PropertyStatus(data["status"]),
        is_renovated=data.get("is_renovated") or False,
        photos=data.get("photos") or [],
        checklist_completed=data.get("checklist_completed") or False,
        checklist_data=data.get("checklist_data") or {},
        created_at=data["created_at"],
        updated_at=data["updated_at"],
    )


def _format_renovation(data: dict) -> RenovationResponse:
    """Format database row to RenovationResponse."""
    return RenovationResponse(
        id=data["id"],
        property_id=data["property_id"],
        materials=data.get("materials", []) or [],
        total_cost=data.get("total_cost", 0),
        notes=data.get("notes"),
        status=data["status"],
        was_moved=data.get("was_moved", False),
        created_at=data["created_at"],
        completed_at=data.get("completed_at"),
        updated_at=data["updated_at"],
    )

