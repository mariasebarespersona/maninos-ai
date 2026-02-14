"""
Public Properties API - Portal Clientes
Read-only access to published properties.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from tools.supabase_client import sb

router = APIRouter(prefix="/public/properties", tags=["Public - Properties"])


@router.get("")
async def list_published_properties(
    city: Optional[str] = Query(None, description="Filter by city"),
    min_price: Optional[float] = Query(None, description="Minimum sale price"),
    max_price: Optional[float] = Query(None, description="Maximum sale price"),
    bedrooms: Optional[int] = Query(None, description="Number of bedrooms"),
    limit: int = Query(50, le=100),
    offset: int = Query(0, ge=0),
):
    """
    List all published properties for the public portal.
    Only returns properties with status='published'.
    """
    try:
        query = sb.table("properties") \
            .select("id, address, city, state, zip_code, sale_price, bedrooms, bathrooms, square_feet, year, photos, is_renovated, created_at") \
            .eq("status", "published") \
            .order("created_at", desc=True)
        
        if city:
            query = query.ilike("city", f"%{city}%")
        if min_price:
            query = query.gte("sale_price", min_price)
        if max_price:
            query = query.lte("sale_price", max_price)
        if bedrooms:
            query = query.eq("bedrooms", bedrooms)
        
        query = query.range(offset, offset + limit - 1)
        result = query.execute()
        
        return {
            "ok": True,
            "properties": result.data,
            "count": len(result.data),
            "offset": offset,
            "limit": limit
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{property_id}")
async def get_property_detail(property_id: str):
    """
    Get detailed information about a property.
    Returns the property with its availability status.
    - status='published' → available for purchase
    - status='reserved'  → sale in progress (not available)
    - status='sold'      → already sold (not available)
    """
    try:
        result = sb.table("properties") \
            .select("*") \
            .eq("id", property_id) \
            .in_("status", ["published", "reserved", "sold"]) \
            .single() \
            .execute()
        
        if not result.data:
            raise HTTPException(
                status_code=404, 
                detail="Propiedad no encontrada o no disponible"
            )
        
        # Remove sensitive fields
        property_data = result.data
        property_data.pop("checklist_data", None)
        property_data.pop("created_by", None)
        
        # Determine availability
        is_available = property_data["status"] == "published"
        
        return {
            "ok": True,
            "property": property_data,
            "is_available": is_available,
            "availability_message": (
                None if is_available
                else "Esta propiedad ya ha sido vendida o tiene una venta en proceso."
            )
        }
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/cities/list")
async def list_available_cities():
    """
    Get list of cities with published properties.
    Useful for filter dropdowns.
    """
    try:
        result = sb.table("properties") \
            .select("city") \
            .eq("status", "published") \
            .not_.is_("city", "null") \
            .execute()
        
        # Get unique cities
        cities = list(set([p["city"] for p in result.data if p["city"]]))
        cities.sort()
        
        return {
            "ok": True,
            "cities": cities
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_public_stats():
    """
    Get public statistics about available properties.
    """
    try:
        result = sb.table("properties") \
            .select("id, sale_price, city, bedrooms") \
            .eq("status", "published") \
            .execute()
        
        properties = result.data
        
        if not properties:
            return {
                "ok": True,
                "total_available": 0,
                "price_range": {"min": 0, "max": 0},
                "cities_count": 0
            }
        
        prices = [p["sale_price"] for p in properties if p["sale_price"]]
        cities = set([p["city"] for p in properties if p["city"]])
        
        return {
            "ok": True,
            "total_available": len(properties),
            "price_range": {
                "min": min(prices) if prices else 0,
                "max": max(prices) if prices else 0,
                "avg": sum(prices) / len(prices) if prices else 0
            },
            "cities_count": len(cities),
            "cities": list(cities)
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


