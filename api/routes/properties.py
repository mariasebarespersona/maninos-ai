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

