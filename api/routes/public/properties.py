"""
Public Properties API - Portal Clientes
Read-only access to published properties + partner listings (Vanderbilt, 21st Mortgage).
"""

import logging
from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from tools.supabase_client import sb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/properties", tags=["Public - Properties"])

# Partner sources shown in client portal (alliance with Vanderbilt + 21st Mortgage)
PARTNER_SOURCES = ["vmf_homes", "21st_mortgage"]


@router.get("")
async def list_published_properties(
    city: Optional[str] = Query(None, description="Filter by city"),
    min_price: Optional[float] = Query(None, description="Minimum sale price"),
    max_price: Optional[float] = Query(None, description="Maximum sale price"),
    bedrooms: Optional[int] = Query(None, description="Number of bedrooms"),
    limit: int = Query(200, le=500),
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


@router.get("/partners")
async def list_partner_properties(
    city: Optional[str] = Query(None, description="Filter by city"),
    min_price: Optional[float] = Query(None, description="Minimum price"),
    max_price: Optional[float] = Query(None, description="Maximum price"),
    bedrooms: Optional[int] = Query(None, description="Number of bedrooms"),
    source: Optional[str] = Query(None, description="Filter by source: vmf_homes, 21st_mortgage"),
    limit: int = Query(200, le=500),
    offset: int = Query(0, ge=0),
):
    """
    List available properties from partner sources (Vanderbilt, 21st Mortgage).
    These are NOT in Maninos' inventory — they come from alliance partners.
    """
    try:
        query = sb.table("market_listings") \
            .select("id, address, city, state, zip_code, listing_price, bedrooms, bathrooms, sqft, year_built, photos, thumbnail_url, source, source_url, scraped_at") \
            .eq("status", "available")
        
        # Filter to partner sources only
        if source and source in PARTNER_SOURCES:
            query = query.eq("source", source)
        else:
            query = query.in_("source", PARTNER_SOURCES)
        
        if city:
            query = query.ilike("city", f"%{city}%")
        if min_price:
            query = query.gte("listing_price", min_price)
        if max_price:
            query = query.lte("listing_price", max_price)
        if bedrooms:
            query = query.eq("bedrooms", bedrooms)
        
        query = query.order("listing_price", desc=False).range(offset, offset + limit - 1)
        result = query.execute()
        
        # Normalize to match properties format for the frontend
        listings = []
        for item in (result.data or []):
            listings.append({
                "id": item["id"],
                "address": item["address"],
                "city": item["city"],
                "state": item.get("state", "TX"),
                "zip_code": item.get("zip_code"),
                "sale_price": item["listing_price"],
                "bedrooms": item.get("bedrooms"),
                "bathrooms": item.get("bathrooms"),
                "square_feet": item.get("sqft"),
                "year": item.get("year_built"),
                "photos": item.get("photos") or ([item["thumbnail_url"]] if item.get("thumbnail_url") else []),
                "is_renovated": False,
                "source": item["source"],
                "source_url": item.get("source_url"),
                "is_partner": True,
                "partner_name": "Vanderbilt" if item["source"] == "vmf_homes" else "21st Mortgage",
            })
        
        return {
            "ok": True,
            "properties": listings,
            "count": len(listings),
            "offset": offset,
            "limit": limit,
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


@router.post("/partners/refresh")
async def refresh_partner_listings():
    """
    Quick scrape of ONLY partner sources (VMF Homes + 21st Mortgage).
    Both use direct JSON APIs — fast, no browser needed.
    Saves results to market_listings table.
    """
    import asyncio
    
    try:
        from api.agents.buscador.scraper import VMFHomesScraper, TwentyFirstMortgageScraper
        
        logger.info("[Partners] Refreshing partner listings (VMF + 21st)...")
        
        # Scrape both in parallel — both are pure HTTP, no browser
        vmf_task = VMFHomesScraper.scrape(min_price=5000, max_price=80000, max_listings=150)
        m21_task = TwentyFirstMortgageScraper.scrape(min_price=5000, max_price=80000, max_listings=150)
        
        vmf_listings, m21_listings = await asyncio.gather(vmf_task, m21_task, return_exceptions=True)
        
        # Handle errors
        if isinstance(vmf_listings, Exception):
            logger.error(f"[Partners] VMF scrape error: {vmf_listings}")
            vmf_listings = []
        if isinstance(m21_listings, Exception):
            logger.error(f"[Partners] 21st scrape error: {m21_listings}")
            m21_listings = []
        
        all_listings = list(vmf_listings) + list(m21_listings)
        logger.info(f"[Partners] Scraped {len(vmf_listings)} VMF + {len(m21_listings)} 21st = {len(all_listings)} total")
        
        if not all_listings:
            return {"ok": True, "message": "No listings found", "saved": 0, "vmf": 0, "mortgage21": 0}
        
        # Save to database via upsert
        saved_count = 0
        for listing in all_listings:
            try:
                data = {
                    "source": listing.source,
                    "source_url": listing.source_url,
                    "source_id": listing.source_id,
                    "address": listing.address,
                    "city": listing.city,
                    "state": listing.state,
                    "zip_code": listing.zip_code,
                    "listing_price": listing.listing_price,
                    "year_built": listing.year_built or 2000,
                    "sqft": listing.sqft,
                    "bedrooms": listing.bedrooms,
                    "bathrooms": listing.bathrooms,
                    "photos": listing.photos,
                    "thumbnail_url": listing.thumbnail_url,
                    "scraped_at": listing.scraped_at or datetime.now().isoformat(),
                    "status": "available",
                }
                
                # Don't overwrite purchased/rejected listings
                existing = sb.table("market_listings") \
                    .select("id, status") \
                    .eq("source_url", listing.source_url) \
                    .limit(1).execute()
                
                if existing.data and existing.data[0].get("status") not in ("available", None):
                    continue
                
                sb.table("market_listings") \
                    .upsert(data, on_conflict="source_url") \
                    .execute()
                saved_count += 1
            except Exception as e:
                logger.warning(f"[Partners] Error saving: {e}")
                continue
        
        logger.info(f"[Partners] ✅ Saved {saved_count} partner listings")
        
        return {
            "ok": True,
            "vmf": len(vmf_listings),
            "mortgage21": len(m21_listings),
            "total_scraped": len(all_listings),
            "saved": saved_count,
        }
        
    except Exception as e:
        logger.error(f"[Partners] Refresh failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/partners/diagnostics")
async def partner_diagnostics():
    """
    Diagnostic endpoint: show how many partner listings exist per source and status.
    Useful for debugging why Vanderbilt / 21st Mortgage listings may not appear.
    """
    try:
        # Get counts per source + status
        result = sb.table("market_listings") \
            .select("source, status") \
            .in_("source", PARTNER_SOURCES) \
            .execute()
        
        items = result.data or []
        counts = {}
        for item in items:
            key = f"{item['source']}:{item['status']}"
            counts[key] = counts.get(key, 0) + 1
        
        # Also check most recent scraped_at per source
        recent = {}
        for src in PARTNER_SOURCES:
            r = sb.table("market_listings") \
                .select("source, scraped_at, address, status") \
                .eq("source", src) \
                .order("scraped_at", desc=True) \
                .limit(3) \
                .execute()
            recent[src] = r.data or []
        
        return {
            "ok": True,
            "counts_by_source_status": counts,
            "total_partner_rows": len(items),
            "most_recent_by_source": recent,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats/summary")
async def get_public_stats():
    """
    Get public statistics about available properties (Maninos + partners).
    """
    try:
        # Maninos inventory
        result = sb.table("properties") \
            .select("id, sale_price, city, bedrooms") \
            .eq("status", "published") \
            .execute()
        
        properties = result.data or []
        
        # Partner listings (Vanderbilt + 21st Mortgage)
        partner_result = sb.table("market_listings") \
            .select("id, listing_price, city") \
            .eq("status", "available") \
            .in_("source", PARTNER_SOURCES) \
            .execute()
        
        partner_listings = partner_result.data or []
        
        all_prices = [p["sale_price"] for p in properties if p.get("sale_price")]
        all_prices += [p["listing_price"] for p in partner_listings if p.get("listing_price")]
        
        all_cities = set()
        for p in properties:
            if p.get("city"):
                all_cities.add(p["city"])
        for p in partner_listings:
            if p.get("city"):
                all_cities.add(p["city"])
        
        total = len(properties) + len(partner_listings)
        
        return {
            "ok": True,
            "total_available": total,
            "maninos_count": len(properties),
            "partner_count": len(partner_listings),
            "price_range": {
                "min": min(all_prices) if all_prices else 0,
                "max": max(all_prices) if all_prices else 0,
                "avg": sum(all_prices) / len(all_prices) if all_prices else 0
            },
            "cities_count": len(all_cities),
            "cities": sorted(list(all_cities))
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


