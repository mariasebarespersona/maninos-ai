"""
Market Listings API Routes.

Endpoints for managing properties found by BuscadorAgent.
These are properties scraped from external websites, not Maninos inventory.
"""

from fastapi import APIRouter, HTTPException, Query
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime
import logging
import os
import uuid
from supabase import create_client, Client
from api.utils.tdhca_parser import parse_tdhca_detail_page, build_structured_tdhca_data, sanitize_tdhca_url

logger = logging.getLogger(__name__)

router = APIRouter()

# Supabase client
supabase: Client = create_client(
    os.environ.get("SUPABASE_URL", ""),
    os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
)


# ============================================
# HELPERS
# ============================================

def _normalize_address(address: str) -> str:
    """
    Extract and normalize the street part from an address for dedup matching.
    Removes listing title noise like '2022 BLISS single section for sale.'
    and normalizes all whitespace/punctuation.
    """
    import re
    if not address:
        return ""
    
    addr = address.strip().lower()
    
    # Remove common listing title noise (applied globally, not just prefix)
    noise_words = [
        r'for\s+sale\.?',
        r'\bfeatured\b',
        r'\bmobile\s+home\b',
        r'\bsingle\s+section\b',
        r'\bdouble\s+wide\b',
        r'\bmanufactured\s+home\b',
        r'^(19|20)\d{2}\s+[a-z]+\s+',  # "2022 BLISS " year prefix at start (only 1900-2099)
    ]
    
    for pattern in noise_words:
        addr = re.sub(pattern, ' ', addr, flags=re.IGNORECASE)
    
    # Normalize punctuation: remove dots, normalize comma-space
    addr = addr.replace('.', ' ')
    addr = re.sub(r'\s*,\s*', ', ', addr)  # uniform ", " after commas
    addr = re.sub(r'\s*#\s*', ' #', addr)  # uniform " #" before unit numbers
    
    # Collapse all whitespace
    addr = re.sub(r'\s+', ' ', addr).strip()
    
    # Remove leading/trailing commas
    addr = addr.strip(', ')
    
    return addr


def _is_already_purchased(source_url: str, address: str) -> bool:
    """
    Check if a listing should be skipped (already purchased, rejected, or dismissed).
    Checks:
      1. market_listings table — by source_url (exact match)
      2. market_listings table — by normalized address (catches URL variations)
      3. properties table (matching street address — already in Maninos inventory)
    
    Address matching uses normalized street addresses to avoid false positives
    from listing titles like "2022 BLISS single section for sale."
    """
    SKIP_STATUSES = ("purchased", "rejected", "dismissed")
    try:
        # Check 1: market_listing exists with non-available status (exact URL match)
        if source_url:
            existing = supabase.table("market_listings")\
                .select("id, status")\
                .eq("source_url", source_url)\
                .limit(1).execute()
            if existing.data and existing.data[0].get("status") in SKIP_STATUSES:
                return True
        
        # Check 2: Same address dismissed/purchased/rejected in market_listings
        # This catches cases where the source_url changed slightly between scrapes
        if address:
            normalized = _normalize_address(address)
            
            # Only check if we have a meaningful street address (at least a number + street name)
            if len(normalized) < 10:
                pass  # Skip address check but continue to properties check
            else:
                # Check dismissed/purchased/rejected listings by address
                dismissed = supabase.table("market_listings")\
                    .select("id, status, address")\
                    .in_("status", list(SKIP_STATUSES))\
                    .execute()
                
                if dismissed.data:
                    for d in dismissed.data:
                        d_normalized = _normalize_address(d.get("address", ""))
                        if d_normalized and normalized:
                            if normalized in d_normalized or d_normalized in normalized:
                                logger.info(f"[Dedup] Address match (dismissed/skipped): '{normalized}' ↔ '{d_normalized}'")
                                return True
        
        # Check 3: address exists in Maninos properties inventory
        if address:
            normalized = _normalize_address(address)
            
            if len(normalized) < 10:
                return False
            
            # Get all properties and compare normalized addresses
            props = supabase.table("properties")\
                .select("id, address")\
                .execute()
            
            if props.data:
                for prop in props.data:
                    prop_normalized = _normalize_address(prop.get("address", ""))
                    # Require substantial overlap: one must contain the other
                    if prop_normalized and normalized:
                        if normalized in prop_normalized or prop_normalized in normalized:
                            logger.info(f"[Dedup] Address match (property): '{normalized}' ↔ '{prop_normalized}'")
                            return True
        
        return False
    except Exception as e:
        logger.warning(f"[Dedup] Error checking purchase status: {e}")
        return False


# ============================================
# SCHEMAS
# ============================================

class MarketListingCreate(BaseModel):
    source: str = Field(description="Source: mhvillage, mobilehome, mhbay, facebook, whatsapp, instagram, other")
    source_url: str
    source_id: Optional[str] = None
    
    address: str
    city: str
    state: str = "TX"
    zip_code: Optional[str] = None
    
    listing_price: float
    estimated_arv: Optional[float] = None
    estimated_renovation: Optional[float] = None
    
    year_built: Optional[int] = None
    sqft: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    
    photos: List[str] = Field(default_factory=list)
    thumbnail_url: Optional[str] = None
    
    # Price type: "full" = full asking price, "down_payment" = only the down payment
    price_type: str = Field(default="full", description="'full' or 'down_payment'")
    estimated_full_price: Optional[float] = Field(default=None, description="Estimated total price when price_type=down_payment")


class MarketListingResponse(BaseModel):
    id: str
    source: str
    source_url: str
    address: str
    city: str
    state: str
    listing_price: float
    estimated_arv: Optional[float]
    estimated_renovation: Optional[float]
    max_offer_70_rule: Optional[float]
    passes_70_rule: Optional[bool]
    passes_age_rule: Optional[bool]
    passes_location_rule: Optional[bool]
    is_qualified: bool
    qualification_score: int
    qualification_reasons: Optional[List[str]]
    year_built: Optional[int]
    sqft: Optional[int]
    bedrooms: Optional[int]
    bathrooms: Optional[float]
    estimated_roi: Optional[float]
    photos: Optional[List[str]]
    thumbnail_url: Optional[str]
    status: str
    scraped_at: Optional[str]
    price_type: Optional[str] = "full"
    estimated_full_price: Optional[float] = None


# ============================================
# ENDPOINTS
# ============================================

@router.get("")
async def list_market_listings(
    qualified_only: bool = Query(default=True, description="Only show qualified listings"),
    city: Optional[str] = Query(default=None, description="Filter by city"),
    min_price: Optional[float] = Query(default=5000, description="Minimum price ($5K default)"),
    max_price: Optional[float] = Query(default=80000, description="Maximum price ($80K default)"),
    bedrooms: Optional[int] = Query(default=None, description="Filter by bedrooms"),
    min_year: Optional[int] = Query(default=None, description="Minimum year built"),
    max_year: Optional[int] = Query(default=None, description="Maximum year built"),
    source: Optional[str] = Query(default=None, description="Filter by source (facebook, mhvillage, etc.)"),
    limit: int = Query(default=50, description="Number of listings to return"),
    offset: int = Query(default=0, description="Offset for pagination"),
):
    """
    List market listings from external sources.

    By default, returns only qualified listings (pass all 3 rules).
    Enforces $5K-$80K price range by default.
    Includes both 'available' and 'negotiating' listings.
    """
    try:
        query = supabase.table("market_listings").select("*")

        if qualified_only:
            query = query.eq("is_qualified", True)

        query = query.in_("status", ["available", "negotiating"])
        
        # Always enforce price range (defaults: $5K-$80K)
        query = query.gte("listing_price", min_price)
        query = query.lte("listing_price", max_price)
        
        if city:
            query = query.ilike("city", f"%{city}%")
        if bedrooms:
            query = query.eq("bedrooms", bedrooms)
        if min_year:
            query = query.gte("year_built", min_year)
        if max_year:
            query = query.lte("year_built", max_year)
        if source:
            query = query.eq("source", source)

        query = query.order("scraped_at", desc=True)
        # Fetch more than needed so we can sort Facebook first, then apply limit
        query = query.range(0, max(limit + 50, 500) - 1)

        response = query.execute()

        # Sort: Facebook first, then rest by scraped date
        listings = response.data or []
        listings.sort(key=lambda x: (0 if x.get("source") == "facebook" else 1))

        # Apply pagination after sort
        listings = listings[offset:offset + limit]

        return {
            "listings": listings,
            "count": len(listings),
            "qualified_only": qualified_only,
        }
        
    except Exception as e:
        logger.error(f"Error listing market listings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/count")
async def get_listings_count(
    qualified_only: bool = Query(default=True),
):
    """
    Get count of market listings.
    Used by BuscadorAgent to check if replenishment is needed.
    """
    try:
        query = supabase.table("market_listings").select("id", count="exact")
        
        if qualified_only:
            query = query.eq("is_qualified", True)
        
        query = query.eq("status", "available")
        
        response = query.execute()
        
        return {
            "count": response.count or 0,
            "target": 10,
            "needs_replenishment": (response.count or 0) < 10,
        }
        
    except Exception as e:
        logger.error(f"Error getting count: {e}")
        return {"count": 0, "target": 10, "needs_replenishment": True}


@router.delete("/cleanup-unqualified")
async def cleanup_unqualified_listings():
    """
    Delete all non-qualified listings from the database.
    Only keeps listings where is_qualified = true.
    """
    try:
        # Delete non-qualified listings
        response = supabase.table("market_listings")\
            .delete()\
            .eq("is_qualified", False)\
            .execute()
        
        deleted_count = len(response.data) if response.data else 0
        
        logger.info(f"[Cleanup] Deleted {deleted_count} non-qualified listings")
        
        return {
            "success": True,
            "deleted": deleted_count,
            "message": f"Deleted {deleted_count} non-qualified listings",
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/fix-facebook-qualified")
async def fix_facebook_qualified():
    """Fix Facebook listings qualification status."""
    try:
        result = supabase.table("market_listings").update({
            "is_qualified": True,
            "qualification_score": 80,
            "passes_70_rule": True,
        }).eq("source", "facebook").execute()
        count = len(result.data) if result.data else 0
        return {"ok": True, "updated": count}
    except Exception as e:
        return {"ok": False, "error": str(e)}


@router.delete("/all")
async def delete_all_listings():
    """
    Delete ALL market listings from the database.
    Used for full reset before re-scraping with image persistence.
    Also cleans up any stored images in Supabase Storage.
    """
    try:
        # First get count
        count_resp = supabase.table("market_listings")\
            .select("id", count="exact")\
            .execute()
        total = count_resp.count if hasattr(count_resp, 'count') and count_resp.count else len(count_resp.data or [])
        
        # Delete all listings (Supabase requires a filter, so use neq on a non-null column)
        response = supabase.table("market_listings")\
            .delete()\
            .neq("id", "00000000-0000-0000-0000-000000000000")\
            .execute()
        
        deleted_count = len(response.data) if response.data else total
        
        # Clean up stored images in Supabase Storage
        try:
            files = supabase.storage.from_("listing-photos").list()
            if files:
                paths = [f["name"] for f in files if f.get("name")]
                if paths:
                    supabase.storage.from_("listing-photos").remove(paths)
                    logger.info(f"[DeleteAll] Cleaned up {len(paths)} stored images")
        except Exception as storage_err:
            logger.warning(f"[DeleteAll] Could not clean storage (bucket may not exist yet): {storage_err}")
        
        logger.info(f"[DeleteAll] Deleted {deleted_count} market listings")
        
        return {
            "success": True,
            "deleted": deleted_count,
            "message": f"Deleted {deleted_count} market listings",
        }
        
    except Exception as e:
        logger.error(f"Error deleting all listings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats")
async def get_listings_stats():
    """
    Get statistics about market listings and latest market analysis.
    
    Returns:
    - Qualified listings in DB
    - Latest market value (from market_analysis table)
    - Sources breakdown
    """
    try:
        # ============================================
        # LISTINGS COUNTS (from market_listings)
        # ============================================
        from api.utils.qualification import MIN_PRICE, MAX_PRICE

        # Total available in DB (any price)
        all_query = supabase.table("market_listings")\
            .select("id, source, city, listing_price, is_qualified")\
            .eq("status", "available")\
            .execute()

        total_in_db = len(all_query.data) if all_query.data else 0

        # Qualified = is_qualified AND in price range
        listings_query_data = [
            l for l in (all_query.data or [])
            if l.get("is_qualified") and
               MIN_PRICE <= (l.get("listing_price") or 0) <= MAX_PRICE
        ]
        qualified_count = len(listings_query_data)
        
        # By source (count ALL listings in DB by source)
        by_source = {}
        for listing in (all_query.data or []):
            source = listing.get("source", "other")
            by_source[source] = by_source.get(source, 0) + 1

        # By city (qualified only)
        city_counts = {}
        for listing in listings_query_data:
            city = listing.get("city", "Unknown")
            city_counts[city] = city_counts.get(city, 0) + 1
        top_cities = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:5]

        # Price range of qualified listings
        listing_prices = [l.get("listing_price", 0) for l in listings_query_data if l.get("listing_price")]
        qualified_price_min = min(listing_prices) if listing_prices else 0
        qualified_price_max = max(listing_prices) if listing_prices else 0
        
        # ============================================
        # LATEST MARKET ANALYSIS (from market_analysis table)
        # ============================================
        
        try:
            analysis_query = supabase.table("market_analysis")\
                .select("*")\
                .order("scraped_at", desc=True)\
                .limit(1)\
                .execute()
            
            latest_analysis = analysis_query.data[0] if analysis_query.data else None
        except Exception as e:
            logger.warning(f"Could not fetch market_analysis (table may not exist): {e}")
            latest_analysis = None
        
        # ============================================
        # BUILD RESPONSE
        # ============================================
        
        response = {
            "total_in_db": total_in_db,
            "qualified_in_db": qualified_count,
            "by_source": by_source,
            "top_cities": [{"city": c[0], "count": c[1]} for c in top_cities],
            "target": 10,
            "qualified_price_range": {
                "min": qualified_price_min,
                "max": qualified_price_max,
            },
        }
        
        # Add market analysis if available
        if latest_analysis:
            response["market_analysis"] = {
                "id": latest_analysis.get("id"),
                "city": latest_analysis.get("city"),
                "total_scraped": latest_analysis.get("total_scraped", 0),
                "market_value_avg": latest_analysis.get("market_value_avg", 0),
                "max_offer_70_percent": latest_analysis.get("max_offer_70_percent", 0),
                "sources": latest_analysis.get("sources", {}),
                "scraped_at": latest_analysis.get("scraped_at"),
            }
        else:
            response["market_analysis"] = None
        
        return response
        
    except Exception as e:
        logger.error(f"Error getting stats: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/historical-stats")
async def get_historical_stats():
    """
    Get summary statistics from Maninos historical data (2025).
    Used to display a stats banner on the market dashboard.
    """
    from api.utils.price_predictor import get_summary_stats
    
    try:
        stats = get_summary_stats()
        return {"success": True, "stats": stats}
    except Exception as e:
        logger.error(f"[HistoricalStats] Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/{listing_id}")
async def get_listing(listing_id: str):
    """
    Get a single market listing by ID.
    """
    try:
        response = supabase.table("market_listings")\
            .select("*")\
            .eq("id", listing_id)\
            .single()\
            .execute()
        
        return response.data
        
    except Exception as e:
        logger.error(f"Error getting listing: {e}")
        raise HTTPException(status_code=404, detail="Listing not found")


@router.patch("/{listing_id}/checklist")
async def save_listing_checklist(listing_id: str, data: dict):
    """
    Save checklist data for a market listing.
    The checklist is completed BEFORE purchasing the property.
    """
    try:
        checklist_data = data.get("checklist_data", {})
        
        # Calculate completion percentage
        # Checklist oficial de Maninos: 28 items
        # Estructura(4) + Instalaciones(5) + Documentación(5) + Financiero(4) + Especificaciones(5) + Cierre(5)
        total_items = 28
        completed_items = sum(1 for v in checklist_data.values() if v)
        completion_percentage = round((completed_items / total_items) * 100, 1)
        
        response = supabase.table("market_listings")\
            .update({
                "checklist_data": checklist_data,
                "checklist_completed": completion_percentage >= 80,  # 80% minimum
                "checklist_percentage": completion_percentage,
            })\
            .eq("id", listing_id)\
            .execute()
        
        if not response.data:
            raise HTTPException(status_code=404, detail="Listing not found")
        
        logger.info(f"[Checklist] Saved for {listing_id}: {completed_items}/{total_items} ({completion_percentage}%)")
        
        return {
            "success": True,
            "listing_id": listing_id,
            "completed": completed_items,
            "total": total_items,
            "percentage": completion_percentage,
            "can_purchase": completion_percentage >= 80,
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error saving checklist: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class ManualFieldsUpdate(BaseModel):
    manual_price: Optional[float] = None
    manual_bedrooms: Optional[int] = None
    manual_bathrooms: Optional[float] = None
    manual_sqft: Optional[int] = None
    manual_year: Optional[int] = None


@router.patch("/{listing_id}/manual-fields")
async def update_manual_fields(listing_id: str, data: ManualFieldsUpdate):
    """
    Update manual override fields for price prediction.
    These values take priority over scraped data when running predictions.
    """
    try:
        update_data = {k: v for k, v in data.model_dump().items() if v is not None}
        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        response = supabase.table("market_listings")\
            .update(update_data)\
            .eq("id", listing_id)\
            .execute()

        if not response.data:
            raise HTTPException(status_code=404, detail="Listing not found")

        return {"success": True, "listing_id": listing_id, "updated_fields": list(update_data.keys())}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating manual fields: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_listing(listing: MarketListingCreate):
    """
    Create a new market listing.
    
    The database trigger will automatically calculate:
    - max_offer_70_rule
    - passes_70_rule
    - passes_age_rule
    - passes_location_rule
    - is_qualified
    - qualification_score
    
    Rejects listings for properties already purchased or in Maninos inventory.
    """
    try:
        # Generate unique source_url if empty (manual entries from FB, etc.)
        source_url = (listing.source_url or "").strip()
        if not source_url:
            source_url = f"manual-{uuid.uuid4().hex[:12]}"
            logger.info(f"[Create] Generated source_url for manual listing: {source_url}")
        
        # Check if already purchased or in inventory
        if _is_already_purchased(source_url, listing.address):
            raise HTTPException(
                status_code=409,
                detail="Esta propiedad ya fue comprada o está en el inventario de Maninos"
            )
        
        # Check if exists with non-available status (don't resurrect purchased/rejected)
        if not source_url.startswith("manual-"):
            existing = supabase.table("market_listings")\
                .select("id, status")\
                .eq("source_url", source_url)\
                .limit(1).execute()
            
            if existing.data and existing.data[0].get("status") in ("purchased", "rejected"):
                raise HTTPException(
                    status_code=409,
                    detail=f"Listing already exists with status: {existing.data[0]['status']}"
                )
        
        data = listing.model_dump()
        data["source_url"] = source_url
        data["scraped_at"] = datetime.now().isoformat()
        data["status"] = "available"
        
        # WORKAROUND: DB trigger (migration 008) forces passes_age_rule=false
        # when year_built IS NULL. Set dummy year to bypass until trigger is updated.
        # TODO: Remove after running migration 018_fix_qualification_feb2026.sql
        if not data.get("year_built"):
            data["year_built"] = 2000
        
        # ============================================
        # Calculate qualification rules (Feb 2026: 60%, range, zone)
        # ============================================
        from api.utils.qualification import qualify_listing, qualification_to_db_fields
        
        # Get latest market value for 60% rule
        market_value = None
        try:
            analysis = supabase.table("market_analysis")\
                .select("market_value_avg")\
                .order("scraped_at", desc=True)\
                .limit(1).execute()
            if analysis.data:
                market_value = analysis.data[0].get("market_value_avg")
        except Exception:
            pass
        
        price = data.get("listing_price", 0) or 0
        listing_city = data.get("city", "")
        listing_state = (data.get("state") or "TX").upper()
        
        # If price is a down payment, use estimated_full_price for qualification
        qualification_price = price
        price_type = data.get("price_type", "full")
        if price_type == "down_payment" and data.get("estimated_full_price"):
            qualification_price = data["estimated_full_price"]
            logger.info(f"[Create] Down payment listing: using estimated_full_price ${qualification_price:,.0f} for qualification (listed: ${price:,.0f})")
        elif price_type == "down_payment":
            logger.warning(f"[Create] Down payment listing without estimated_full_price — qualification may be inaccurate")
        
        q = qualify_listing(
            listing_price=qualification_price,
            market_value=market_value or 0,
            city=listing_city,
            state=listing_state,
        )
        
        # Map to DB columns (backward compat)
        db_qual = qualification_to_db_fields(q)
        data.update(db_qual)
        data["max_offer_70_rule"] = q.get("max_offer_60_rule")  # Column name compat
        
        logger.info(f"[Create] Qualification: qualified={data['is_qualified']} score={data['qualification_score']} "
                     f"(60%={q['passes_60_rule']}, range={q['passes_price_range']}, zone={q['passes_zone_rule']}"
                     f"{', price_type='+price_type if price_type != 'full' else ''})")
        
        response = supabase.table("market_listings")\
            .insert(data)\
            .execute()
        
        created = response.data[0] if response.data else None
        
        # Persist images to Supabase Storage (replaces expiring CDN URLs)
        if created and (data.get("thumbnail_url") or data.get("photos")):
            try:
                from api.utils.image_storage import persist_listing_images
                new_thumb, new_photos = await persist_listing_images(
                    thumbnail_url=data.get("thumbnail_url"),
                    photos=data.get("photos"),
                    listing_id=created["id"],
                )
                if new_thumb or new_photos:
                    update_img = {}
                    if new_thumb:
                        update_img["thumbnail_url"] = new_thumb
                    if new_photos:
                        update_img["photos"] = new_photos
                    img_resp = supabase.table("market_listings")\
                        .update(update_img)\
                        .eq("id", created["id"])\
                        .execute()
                    if img_resp.data:
                        created = img_resp.data[0]
                    logger.info(f"[Create] 📸 Images persisted for listing {created['id']}")
            except Exception as img_err:
                logger.warning(f"[Create] 📸 Image persistence failed: {img_err}")
        
        return created
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating listing: {e}")
        # Check if duplicate
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=409, detail="Listing already exists")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/bulk")
async def create_listings_bulk(listings: List[MarketListingCreate]):
    """
    Create multiple listings at once.
    Used by BuscadorAgent after scraping.
    Skips listings that are already purchased or in Maninos inventory.
    """
    try:
        # Filter out already-purchased listings
        filtered = []
        skipped = 0
        for l in listings:
            if _is_already_purchased(l.source_url, l.address):
                skipped += 1
                continue
            item = l.model_dump()
            item["scraped_at"] = datetime.now().isoformat()
            item["status"] = "available"
            filtered.append(item)
        
        if not filtered:
            return {
                "created": 0,
                "skipped": skipped,
                "message": f"All {skipped} listings already purchased or in inventory",
            }
        
        # Get existing non-available listings to avoid overwriting their status
        source_urls = [item["source_url"] for item in filtered if item.get("source_url")]
        if source_urls:
            existing = supabase.table("market_listings")\
                .select("source_url, status")\
                .in_("source_url", source_urls)\
                .neq("status", "available")\
                .execute()
            
            non_available_urls = {r["source_url"] for r in (existing.data or [])}
            filtered = [item for item in filtered if item["source_url"] not in non_available_urls]
            skipped += len(non_available_urls)
        
        if not filtered:
            return {
                "created": 0,
                "skipped": skipped,
                "message": f"All listings already purchased or in inventory",
            }
        
        response = supabase.table("market_listings")\
            .upsert(filtered, on_conflict="source_url")\
            .execute()
        
        created_count = len(response.data) if response.data else 0
        
        # Persist images to Supabase Storage for all created listings
        images_persisted = 0
        if response.data:
            try:
                from api.utils.image_storage import persist_listing_images
                
                for saved in response.data:
                    if saved.get("thumbnail_url") or saved.get("photos"):
                        try:
                            new_thumb, new_photos = await persist_listing_images(
                                thumbnail_url=saved.get("thumbnail_url"),
                                photos=saved.get("photos"),
                                listing_id=saved["id"],
                            )
                            if new_thumb or new_photos:
                                update_img = {}
                                if new_thumb:
                                    update_img["thumbnail_url"] = new_thumb
                                if new_photos:
                                    update_img["photos"] = new_photos
                                supabase.table("market_listings")\
                                    .update(update_img)\
                                    .eq("id", saved["id"])\
                                    .execute()
                                images_persisted += 1
                        except Exception as img_err:
                            logger.warning(f"[Bulk] 📸 Image persistence failed for {saved.get('address', 'unknown')}: {img_err}")
                
                logger.info(f"[Bulk] 📸 Images persisted: {images_persisted}/{created_count}")
            except Exception as img_err:
                logger.warning(f"[Bulk] 📸 Image module error: {img_err}")
        
        return {
            "created": created_count,
            "skipped": skipped,
            "images_persisted": images_persisted,
            "message": f"Processed {len(filtered)} listings, skipped {skipped}, images persisted: {images_persisted}",
        }
        
    except Exception as e:
        logger.error(f"Error bulk creating listings: {e}")
        raise HTTPException(status_code=500, detail=str(e))


"""
PURCHASE PIPELINE STATUSES (Feb 2026 — D1):
  available    → BuscadorAgent found it
  contacted    → Employee reached out to seller
  negotiating  → In negotiation (offers, counter-offers)
  evaluating   → 26-point checklist in progress
  docs_pending → Waiting for title application + bill of sale
  locked       → Docs received, payment pending
  purchased    → Payment made → auto-creates property in inventory
  rejected     → Not interested / didn't pass evaluation
  expired      → Listing too old
"""

LISTING_STATUSES = [
    "available", "contacted", "negotiating", "evaluating",
    "docs_pending", "locked", "purchased", "rejected", "expired",
    "dismissed",  # User trash/hide — won't reappear in future scrapes
    # Legacy compat
    "reviewing",
]

# Valid forward transitions
LISTING_TRANSITIONS: dict[str, list[str]] = {
    "available":    ["contacted", "negotiating", "rejected", "expired", "dismissed"],
    "contacted":    ["negotiating", "rejected", "expired", "dismissed"],
    "negotiating":  ["evaluating", "rejected"],
    "evaluating":   ["docs_pending", "rejected"],
    "docs_pending": ["locked", "rejected"],
    "locked":       ["purchased", "rejected"],
    "purchased":    [],  # final
    "rejected":     ["available"],  # can re-consider
    "expired":      ["available"],  # can re-scrape
    "dismissed":    ["available"],  # can un-dismiss
    # Legacy
    "reviewing":    ["negotiating", "evaluating", "purchased", "rejected"],
}


@router.patch("/{listing_id}/status")
async def update_listing_status(
    listing_id: str,
    status: str = Query(description="New status for the listing"),
    force: bool = Query(False, description="Skip transition validation"),
):
    """
    Update the status of a market listing through the purchase pipeline:
      available → contacted → negotiating → evaluating → docs_pending → locked → purchased

    When status is set to 'purchased', triggers replenishment check.
    """
    if status not in LISTING_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Estado inválido '{status}'. Válidos: {LISTING_STATUSES}",
        )
    
    try:
        # Get current status for transition validation
        current = supabase.table("market_listings")\
            .select("id, status")\
            .eq("id", listing_id)\
            .limit(1).execute()

        if not current.data:
            raise HTTPException(status_code=404, detail="Listing no encontrado")

        current_status = current.data[0].get("status", "available")

        # Validate transition (unless forced)
        if not force:
            valid_next = LISTING_TRANSITIONS.get(current_status, [])
            if status not in valid_next:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        f"No se puede pasar de '{current_status}' a '{status}'. "
                        f"Transiciones válidas: {valid_next}"
                    ),
                )

        response = supabase.table("market_listings")\
            .update({"status": status})\
            .eq("id", listing_id)\
            .execute()
        
        result = {
            "updated": True,
            "listing_id": listing_id,
            "previous_status": current_status,
            "new_status": status,
        }
        
        # If purchased, check if replenishment needed
        if status == "purchased":
            count_response = await get_listings_count(qualified_only=True)
            result["dashboard_count"] = count_response["count"]
            result["needs_replenishment"] = count_response["needs_replenishment"]
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/{listing_id}")
async def delete_listing(listing_id: str):
    """
    Delete a market listing.
    """
    try:
        supabase.table("market_listings")\
            .delete()\
            .eq("id", listing_id)\
            .execute()
        
        return {"deleted": True, "listing_id": listing_id}
        
    except Exception as e:
        logger.error(f"Error deleting listing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/expired/cleanup")
async def cleanup_expired():
    """
    Remove expired listings (older than 30 days).
    """
    try:
        from datetime import timedelta
        
        cutoff = (datetime.now() - timedelta(days=30)).isoformat()
        
        response = supabase.table("market_listings")\
            .delete()\
            .lt("scraped_at", cutoff)\
            .execute()
        
        return {
            "cleaned_up": len(response.data) if response.data else 0,
            "cutoff_date": cutoff,
        }
        
    except Exception as e:
        logger.error(f"Error cleaning up: {e}")
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# FACEBOOK-ONLY SCRAPE ENDPOINT
# ============================================

@router.post("/scrape-facebook")
async def scrape_facebook_only(
    min_price: float = Query(default=5000),
    max_price: float = Query(default=80000),
):
    """Scrape Facebook Marketplace only and save results to DB."""
    try:
        from api.agents.buscador.fb_auth import FacebookAuth

        # Auto-login if cookies expired
        is_auth = await FacebookAuth.ensure_authenticated()
        if not is_auth:
            return {"success": True, "facebook": 0, "message": "Facebook not connected — set FB_EMAIL/FB_PASSWORD env vars for auto-login"}

        from api.agents.buscador.fb_scraper import FacebookMarketplaceScraper
        from api.agents.buscador.scraper import ScrapedListing
        from api.utils.qualification import is_within_zone, MIN_PRICE, MAX_PRICE

        # Use SAME logic as test-scrape diagnostic (which returns 22 listings)
        # Instead of _scrape_with_requests which returns 0 for unknown reasons
        import requests as req
        import re as re_mod
        import random as rand
        from api.agents.buscador.fb_scraper import FacebookMarketplaceScraper as FBScraper, USER_AGENTS, PROXY_URL, FBListing

        logger.info("[FB Scrape] Starting Facebook-only scrape (direct HTTP)...")
        cookies = FacebookAuth.load_cookies()
        fb_results = []

        try:
            session = req.Session()
            for c in cookies:
                session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".facebook.com"), path=c.get("path", "/"))
            if PROXY_URL:
                session.proxies = {"http": PROXY_URL, "https": PROXY_URL}

            ua = rand.choice(USER_AGENTS)
            session.headers.update({
                "User-Agent": ua,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
                "Accept-Encoding": "gzip, deflate, br, zstd",
                "Referer": "https://www.facebook.com/marketplace/",
                "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="121", "Google Chrome";v="121"',
                "Sec-Ch-Ua-Mobile": "?0",
                "Sec-Ch-Ua-Platform": '"macOS"',
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "same-origin",
                "Sec-Fetch-User": "?1",
                "Upgrade-Insecure-Requests": "1",
            })

            # Search Houston, Dallas, San Antonio with multiple terms
            search_configs = [
                ("houston", "mobile%20home", "Houston"),
                ("houston", "manufactured%20home", "Houston"),
                ("houston", "trailer%20home", "Houston"),
                ("dallas", "mobile%20home", "Dallas"),
                ("dallas", "manufactured%20home", "Dallas"),
                ("sanantonio", "mobile%20home", "San Antonio"),
                ("dallas", "casa%20movil", "Dallas"),
            ]
            rand.shuffle(search_configs)

            for city_slug, query_term, city_label in search_configs:  # Search all combos
                url = f"https://www.facebook.com/marketplace/{city_slug}/search?query={query_term}&minPrice={int(min_price)}&maxPrice={int(max_price)}&exact=false"
                logger.info(f"[FB Scrape] Fetching: {url}")

                response = session.get(url, allow_redirects=True, timeout=30)
                logger.info(f"[FB Scrape] Response: {response.status_code}, URL: {response.url[:80]}, HTML: {len(response.text)} bytes")

                if "/login" in response.url:
                    logger.warning("[FB Scrape] Redirected to login — cookies invalid")
                    break
                else:
                    results = FBScraper._extract_json_from_html(response.text, city_label)
                    logger.info(f"[FB Scrape] Extracted {len(results)} listings from {city_label}")
                    fb_results.extend(results)

                # Delay between requests to avoid detection
                import time
                time.sleep(rand.uniform(5, 12))
        except Exception as http_err:
            logger.error(f"[FB Scrape] HTTP error: {http_err}")

        logger.info(f"[FB Scrape] Got {len(fb_results)} raw FBListing objects")

        saved = 0
        skipped_price = 0
        skipped_unqualified = 0
        from api.utils.qualification import qualify_listing
        from api.agents.buscador.fb_scraper import detect_price_type

        for fb in fb_results:
            if fb.price <= 0:
                skipped_price += 1
                continue
            city_name = fb.city or "Houston"
            state_name = fb.state or "TX"

            # Detect if price is down payment vs full price
            price_type, estimated_full = detect_price_type(
                fb.title or "", fb.description or "", fb.price
            )

            # Use estimated full price for qualification if it's a down payment
            qualification_price = estimated_full if (price_type == "down_payment" and estimated_full) else fb.price

            # Qualify using the real/estimated price
            qual = qualify_listing(
                listing_price=qualification_price,
                market_value=qualification_price,
                city=city_name,
                state=state_name,
            )

            # Include ALL listings from Facebook — even with low/garbage prices
            # Gabriel can negotiate the real price later
            # Low prices are marked as "down_payment" so prediction ignores them
            is_low_price = fb.price < 5000
            if is_low_price:
                price_type = "down_payment"  # Mark as not the real price

            # Facebook listings in TX are always qualified (Gabriel decides)
            is_qualified = True
            qualification_score = qual["qualification_score"] if qual["is_qualified"] else 50

            try:
                listing_data = {
                    "source": "facebook",
                    "source_url": fb.url or f"fb-{hash(fb.title)}",
                    "address": fb.title or "Facebook Marketplace",
                    "city": city_name,
                    "state": state_name,
                    "listing_price": fb.price,
                    "year_built": fb.year_built,
                    "sqft": fb.sqft,
                    "bedrooms": fb.bedrooms,
                    "bathrooms": fb.bathrooms,
                    "thumbnail_url": fb.image_url,
                    "is_qualified": is_qualified,
                    "qualification_score": qualification_score,
                    "qualification_reasons": qual["qualification_reasons"],
                    "passes_70_rule": qual["passes_60_rule"],
                    "passes_age_rule": True,  # Always pass for FB
                    "passes_location_rule": qual["passes_zone_rule"],
                    "price_type": price_type,
                    "estimated_full_price": estimated_full,
                    "status": "available",
                    "scraped_at": datetime.now().isoformat(),
                }
                supabase.table("market_listings").upsert(listing_data, on_conflict="source_url").execute()
                saved += 1
            except Exception as e:
                logger.warning(f"[FB Scrape] Save error: {e}")

        # Update the latest market_analysis to include Facebook count
        if saved > 0:
            try:
                latest = supabase.table("market_analysis").select("id, sources, total_scraped").order("scraped_at", desc=True).limit(1).execute()
                if latest.data:
                    existing_sources = latest.data[0].get("sources") or {}
                    existing_sources["facebook"] = saved
                    new_total = (latest.data[0].get("total_scraped") or 0) + saved
                    supabase.table("market_analysis").update({
                        "sources": existing_sources,
                        "total_scraped": new_total,
                    }).eq("id", latest.data[0]["id"]).execute()
                    logger.info(f"[FB Scrape] Updated market_analysis with facebook={saved}")
            except Exception as ma_err:
                logger.warning(f"[FB Scrape] Could not update market_analysis: {ma_err}")

        logger.info(f"[FB Scrape] ✅ Saved {saved} Facebook listings (skipped: {skipped_price} no price)")
        return {"success": True, "facebook": saved, "total_raw": len(fb_results), "skipped_no_price": skipped_price, "message": f"{saved} casas de Facebook guardadas"}
    except Exception as e:
        logger.error(f"[FB Scrape] Error: {e}")
        return {"success": False, "facebook": 0, "message": str(e)}


# ============================================
# MHVILLAGE SCRAPE ENDPOINT
# ============================================

@router.post("/scrape-mhvillage")
async def scrape_mhvillage(
    min_price: float = Query(default=5000),
    max_price: float = Query(default=80000),
    max_listings: int = Query(default=50),
):
    """Scrape MHBay.com for mobile homes in Texas (replaces MHVillage which is SPA-only)."""
    import requests as req
    import re as re_mod

    logger.info(f"[MHBay] Starting scrape: ${min_price:,.0f}-${max_price:,.0f}")
    saved = 0

    try:
        from api.utils.qualification import qualify_listing

        headers = {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.0.0 Safari/537.36",
            "Accept": "text/html",
        }

        # MHBay has server-rendered HTML with listing data
        search_urls = [
            "https://www.mhbay.com/mobile-homes-for-sale/TX",
            "https://www.mhbay.com/mobile-homes-for-sale/TX/houston",
            "https://www.mhbay.com/mobile-homes-for-sale/TX/dallas",
            "https://www.mhbay.com/mobile-homes-for-sale/TX/san-antonio",
        ]

        all_listings = []
        for search_url in search_urls:
            try:
                response = req.get(search_url, headers=headers, timeout=45)
                if response.status_code != 200:
                    continue

                html = response.text

                # Extract listing links and prices from HTML
                # MHBay format: /mobile-homes/ID-title-in-city-state
                listing_links = re_mod.findall(r'href="(/mobile-homes/\d+[^"]*)"', html)
                prices_raw = re_mod.findall(r'\$(\d{1,3}(?:,\d{3})*)', html)
                prices = [int(p.replace(',', '')) for p in prices_raw if int(p.replace(',', '')) >= min_price and int(p.replace(',', '')) <= max_price]

                # Extract listing titles for addresses
                titles = re_mod.findall(r'<a[^>]*href="/mobile-homes/\d+[^"]*"[^>]*>\s*([^<]+)', html)

                # Parse city from links
                for i, link in enumerate(listing_links[:max_listings]):
                    try:
                        # Extract city from URL: /mobile-homes/123-title-in-city-state
                        city_match = re_mod.search(r'in-([a-z-]+)-(?:tx|texas)', link.lower())
                        city = city_match.group(1).replace('-', ' ').title() if city_match else "TX"

                        price = prices[i] if i < len(prices) else 0
                        title = titles[i].strip() if i < len(titles) else link
                        source_url = f"https://www.mhbay.com{link}"

                        if price <= 0:
                            continue

                        all_listings.append({
                            "price": price,
                            "title": title,
                            "city": city,
                            "source_url": source_url,
                        })
                    except Exception:
                        continue

                logger.info(f"[MHBay] {search_url}: {len(listing_links)} links, {len(prices)} prices")
            except Exception as e:
                logger.warning(f"[MHBay] Error scraping {search_url}: {e}")
                continue

        # Deduplicate by source_url
        seen = set()
        unique = []
        for l in all_listings:
            if l["source_url"] not in seen:
                seen.add(l["source_url"])
                unique.append(l)
        all_listings = unique

        # Save to database
        for item in all_listings[:max_listings]:
            try:
                price = item["price"]
                qual = qualify_listing(listing_price=price, market_value=price, city=item["city"], state="TX")

                listing_data = {
                    "source": "mhbay",
                    "source_url": item["source_url"],
                    "address": item["title"][:500],
                    "city": item["city"],
                    "state": "TX",
                    "listing_price": price,
                    "is_qualified": qual["is_qualified"],
                    "qualification_score": qual["qualification_score"],
                    "status": "available",
                    "scraped_at": datetime.now().isoformat(),
                }
                supabase.table("market_listings").upsert(listing_data, on_conflict="source_url").execute()
                saved += 1
            except Exception as save_err:
                logger.warning(f"[MHBay] Save error: {save_err}")

        logger.info(f"[MHBay] ✅ Saved {saved} listings from {len(all_listings)} results")
        return {"success": True, "mhvillage": saved, "total_raw": len(all_listings)}

    except Exception as e:
        logger.error(f"[MHBay] Error: {e}")
        return {"success": False, "mhvillage": 0, "message": str(e)}


# ============================================
# MOBILEHOME.NET SCRAPE ENDPOINT
# ============================================

@router.post("/scrape-mobilehome")
async def scrape_mobilehome_net(
    min_price: float = Query(default=5000),
    max_price: float = Query(default=80000),
    max_listings: int = Query(default=50),
):
    """Scrape MobileHome.net for mobile homes in Texas."""
    import requests as req
    import re as re_mod

    logger.info(f"[MobileHome.net] Starting scrape: ${min_price:,.0f}-${max_price:,.0f}")
    saved = 0

    try:
        from api.utils.qualification import qualify_listing
        import json

        all_results = []
        cities = ["houston-tx", "dallas-tx", "san-antonio-tx", "austin-tx"]

        for city_slug in cities:
            try:
                url = f"https://www.mobilehome.net/mobile-homes-for-sale/{city_slug}?min_price={int(min_price)}&max_price={int(max_price)}"
                headers = {
                    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml",
                    "Referer": "https://www.mobilehome.net/",
                }
                response = req.get(url, headers=headers, timeout=45)
                if response.status_code == 200:
                    # Extract JSON-LD or embedded listing data
                    json_matches = re_mod.findall(r'<script type="application/ld\+json">(.*?)</script>', response.text, re_mod.DOTALL)
                    for jm in json_matches:
                        try:
                            parsed = json.loads(jm)
                            if isinstance(parsed, list):
                                all_results.extend(parsed)
                            elif isinstance(parsed, dict):
                                if parsed.get("@type") in ("Product", "RealEstateListing", "Residence"):
                                    all_results.append(parsed)
                                elif "itemListElement" in parsed:
                                    for elem in parsed["itemListElement"]:
                                        if "item" in elem:
                                            all_results.append(elem["item"])
                        except json.JSONDecodeError:
                            pass

                    # Also try to find embedded JSON data objects
                    data_matches = re_mod.findall(r'window\.__INITIAL_STATE__\s*=\s*({.*?});', response.text, re_mod.DOTALL)
                    for dm in data_matches:
                        try:
                            parsed = json.loads(dm)
                            listings = parsed.get("listings") or parsed.get("homes") or []
                            all_results.extend(listings)
                        except json.JSONDecodeError:
                            pass

                    logger.info(f"[MobileHome.net] {city_slug}: found {len(json_matches)} JSON-LD blocks")
            except Exception as city_err:
                logger.warning(f"[MobileHome.net] Error for {city_slug}: {city_err}")
                continue

        # Save to database
        for item in all_results[:max_listings]:
            try:
                price = float(item.get("price") or item.get("listing_price") or item.get("offers", {}).get("price") or 0)
                address = item.get("address") or item.get("name") or ""
                city_name = "TX"
                if isinstance(address, dict):
                    city_name = address.get("addressLocality", "TX")
                    address = address.get("streetAddress", str(address))

                if price <= 0:
                    continue

                qual = qualify_listing(listing_price=price, market_value=price, city=city_name, state="TX")

                source_url = item.get("url") or f"mobilehome-{hash(str(item))}"
                listing_data = {
                    "source": "mobilehome",
                    "source_url": source_url,
                    "address": str(address)[:500],
                    "city": city_name,
                    "state": "TX",
                    "listing_price": price,
                    "year_built": item.get("year_built") or item.get("year"),
                    "sqft": item.get("sqft") or item.get("square_feet"),
                    "bedrooms": item.get("bedrooms") or item.get("beds"),
                    "bathrooms": item.get("bathrooms") or item.get("baths"),
                    "thumbnail_url": item.get("thumbnail_url") or item.get("image"),
                    "is_qualified": qual["is_qualified"],
                    "qualification_score": qual["qualification_score"],
                    "status": "available",
                    "scraped_at": datetime.now().isoformat(),
                }
                supabase.table("market_listings").upsert(listing_data, on_conflict="source_url").execute()
                saved += 1
            except Exception as save_err:
                logger.warning(f"[MobileHome.net] Save error: {save_err}")

        logger.info(f"[MobileHome.net] ✅ Saved {saved} listings from {len(all_results)} results")
        return {"success": True, "mobilehome": saved, "total_raw": len(all_results)}

    except Exception as e:
        logger.error(f"[MobileHome.net] Error: {e}")
        return {"success": False, "mobilehome": 0, "message": str(e)}


# ============================================
# SCRAPING ENDPOINT (Direct, no LLM)
# ============================================

@router.post("/scrape")
async def scrape_and_save(
    city: str = Query(default="Houston", description="City to search"),
    min_price: float = Query(default=5000, description="Minimum price"),
    max_price: float = Query(default=80000, description="Maximum price"),
):
    """
    Direct scraping endpoint - scrapes ALL sources and calculates market value.
    
    REGLA DEL 60% (Maninos — Feb 2026):
    1. Scrapear MHVillage, MobileHome.net, MHBay
    2. Calcular MEDIA de todos los precios = Valor de Mercado
    3. Para cada casa: ¿Precio ≤ Media × 60%? → CALIFICA
    4. Rango: $5K-$80K
    5. Zona: 200mi de Houston O Dallas
    6. NO filtro de año (compran cualquier edad)
    
    Does NOT require LLM - direct web scraping with Playwright.
    """
    try:
        from api.services.scrapers.partner_scrapers import VMFHomesScraper, TwentyFirstMortgageScraper

        logger.info(f"[Scrape] Starting scrape for {city}, ${min_price}-${max_price}")

        source_count = 2
        logger.info(f"[Scrape] Will scrape {source_count} sources: VMF, 21st Mortgage (Facebook scraped separately)")

        all_listings = []
        all_prices = []
        fb_count = 0  # Facebook scraped via separate /scrape-facebook endpoint

        # SOURCE 1: VMF Homes / Vanderbilt (JSON API)
        vmf_count = 0
        logger.info(f"[Scrape] 2/{source_count} - Scraping VMF Homes (JSON API)...")
        try:
            vmf_listings = await VMFHomesScraper.scrape(
                min_price=min_price,
                max_price=max_price,
                max_listings=100,
            )
            all_listings.extend(vmf_listings)
            all_prices.extend([l.listing_price for l in vmf_listings])
            vmf_count = len(vmf_listings)
            logger.info(f"[Scrape] ✅ VMF Homes: {vmf_count} mobile homes")
        except Exception as e:
            logger.warning(f"[Scrape] VMF Homes failed: {e}")

        # SOURCE 3: 21st Mortgage (JSON API)
        mortgage21_count = 0
        logger.info(f"[Scrape] 3/{source_count} - Scraping 21st Mortgage (JSON API)...")
        try:
            mortgage21_listings = await TwentyFirstMortgageScraper.scrape(
                min_price=min_price,
                max_price=max_price,
                max_listings=100,
            )
            all_listings.extend(mortgage21_listings)
            all_prices.extend([l.listing_price for l in mortgage21_listings])
            mortgage21_count = len(mortgage21_listings)
            logger.info(f"[Scrape] ✅ 21st Mortgage: {mortgage21_count} mobile homes")
        except Exception as e:
            logger.warning(f"[Scrape] 21st Mortgage failed: {e}")

        if not all_listings:
            return {
                "success": True,
                "message": f"No listings found for {city}",
                "scraped": 0,
                "saved": 0,
            }
        
        # ============================================
        # PASO 2: Calcular VALOR DE MERCADO (media de TODAS las casas)
        # ============================================
        
        market_value = sum(all_prices) / len(all_prices)
        max_offer_60 = market_value * 0.60  # 60% rule (Feb 2026)
        price_min = min(all_prices)
        price_max = max(all_prices)
        
        logger.info(f"[Scrape] ✓ Market Value (media de {len(all_prices)} casas): ${market_value:,.0f}")
        logger.info(f"[Scrape] ✓ Max offer (60%): ${max_offer_60:,.0f}")
        
        # ============================================
        # PASO 3: GUARDAR el análisis de mercado en la DB
        # ============================================
        
        sources_data = {
            "vmf_homes": vmf_count,
            "21st_mortgage": mortgage21_count,
            "facebook": fb_count,
        }
        
        # Import zone checker
        from api.utils.qualification import is_within_zone, MIN_PRICE, MAX_PRICE, BUY_PERCENT
        
        # First, count qualified before saving (new rules Feb 2026)
        qualified_count = 0
        for listing in all_listings:
            passes_range = MIN_PRICE <= listing.listing_price <= MAX_PRICE
            passes_zone, _ = is_within_zone(listing.city, listing.state)
            if passes_range and passes_zone:
                qualified_count += 1
        
        # Save market analysis
        market_analysis_data = {
            "city": city,
            "state": "TX",
            "min_price": min_price,
            "max_price": max_price,
            "total_scraped": len(all_listings),
            "sources": sources_data,
            "market_value_avg": round(market_value, 2),
            "max_offer_70_percent": round(max_offer_60, 2),  # DB column name kept for compat
            "price_min": price_min,
            "price_max": price_max,
            "qualified_count": qualified_count,
            "scraped_at": datetime.now().isoformat(),
        }
        
        try:
            analysis_response = supabase.table("market_analysis")\
                .insert(market_analysis_data)\
                .execute()
            
            market_analysis_id = analysis_response.data[0]["id"] if analysis_response.data else None
            logger.info(f"[Scrape] ✓ Saved market analysis: {market_analysis_id}")
        except Exception as e:
            logger.warning(f"[Scrape] Could not save market analysis (table may not exist): {e}")
            market_analysis_id = None
        
        # ============================================
        # PASO 4: Filtrar casas que CALIFICAN (3 reglas)
        # ============================================
        
        saved_count = 0
        results = []
        listings_to_persist_images = []
        
        from api.utils.qualification import qualify_listing, qualification_to_db_fields
        
        for listing in all_listings:
            # Qualify using centralized rules (60%, range, zone — Feb 2026)
            q = qualify_listing(
                listing_price=listing.listing_price,
                market_value=market_value,
                city=listing.city or city,
                state=listing.state,
            )
            
            is_qualified = q["is_qualified"]
            reasons = q["qualification_reasons"]
            score = q["qualification_score"]
            percentage_of_market = q.get("pct_of_market", 0)
            
            # Add to results for API response (all listings)
            results.append({
                "address": listing.address,
                "price": listing.listing_price,
                "percent_of_market": round(percentage_of_market, 1) if percentage_of_market else 0,
                "qualified": is_qualified,
                "score": score,
                "reasons": reasons,
            })
            
            # ============================================
            # PASO 5: GUARDAR solo casas CALIFICADAS en la DB
            # ============================================
            
            if not is_qualified:
                continue
            
            # Map qualification to DB fields (backward compat column names)
            db_qual = qualification_to_db_fields(q)
            
            listing_data = {
                "source": listing.source,
                "source_url": listing.source_url,
                "source_id": listing.source_id,
                "address": listing.address,
                "city": listing.city or city,
                "state": listing.state,
                "zip_code": listing.zip_code,
                "listing_price": listing.listing_price,
                "estimated_arv": round(market_value, 2),  # Valor de mercado (media)
                "estimated_renovation": 0,  # Not used in 60% calc
                "max_offer_70_rule": round(max_offer_60, 2),  # 60% value (column name compat)
                # WORKAROUND: DB trigger (migration 008) forces passes_age_rule=false
                # when year_built IS NULL. Set dummy year to bypass until trigger is updated.
                # TODO: Remove after running migration 018_fix_qualification_feb2026.sql
                "year_built": listing.year_built or 2000,
                "sqft": listing.sqft,
                "bedrooms": listing.bedrooms,
                "bathrooms": listing.bathrooms,
                "photos": listing.photos,
                "thumbnail_url": listing.thumbnail_url,
                # Qualification rules (new 60% / zone / range)
                **db_qual,
                "scraped_at": datetime.now().isoformat(),
            }
            
            # Add GPS coordinates if available (21st Mortgage, VMF Homes, etc.)
            if hasattr(listing, '_latitude') and listing._latitude:
                listing_data["latitude"] = listing._latitude
            if hasattr(listing, '_longitude') and listing._longitude:
                listing_data["longitude"] = listing._longitude
            
            # Add reference to market analysis if available
            if market_analysis_id:
                listing_data["market_analysis_id"] = market_analysis_id
            
            # Skip if already purchased or in Maninos inventory
            if _is_already_purchased(listing.source_url, listing.address):
                logger.info(f"[Scrape] ⏭ Skipping already-purchased: {listing.address}")
                continue
            
            # Only set status for NEW listings (don't overwrite purchased/rejected)
            listing_data["status"] = "available"
            
            try:
                # Use insert with ON CONFLICT DO NOTHING for non-available listings
                # First try to check if it exists with non-available status
                existing = supabase.table("market_listings")\
                    .select("id, status")\
                    .eq("source_url", listing.source_url)\
                    .limit(1).execute()
                
                if existing.data and existing.data[0].get("status") != "available":
                    # Already exists with purchased/rejected/expired — DON'T overwrite
                    logger.info(f"[Scrape] ⏭ Skipping (status={existing.data[0]['status']}): {listing.address}")
                    continue
                
                response = supabase.table("market_listings")\
                    .upsert(listing_data, on_conflict="source_url")\
                    .execute()
                
                if response.data:
                    saved_count += 1
                    saved_listing_id = response.data[0].get("id")
                    logger.info(f"[Scrape] ✓ Saved: {listing.address} (${listing.listing_price:,.0f})")
                    
                    # Persist images to Supabase Storage (replaces expiring CDN URLs)
                    if saved_listing_id and (listing.thumbnail_url or listing.photos):
                        listings_to_persist_images.append({
                            "id": saved_listing_id,
                            "thumbnail_url": listing.thumbnail_url,
                            "photos": listing.photos,
                            "address": listing.address,
                        })
            except Exception as e:
                logger.warning(f"[Scrape] Error saving listing: {e}")
                continue
        
        # ============================================
        # PASO 6: Persist images to Supabase Storage
        # ============================================
        
        images_persisted = 0
        if listings_to_persist_images:
            from api.utils.image_storage import persist_listing_images
            
            logger.info(f"[Scrape] 📸 Persisting images for {len(listings_to_persist_images)} listings...")
            
            for item in listings_to_persist_images:
                try:
                    new_thumb, new_photos = await persist_listing_images(
                        thumbnail_url=item["thumbnail_url"],
                        photos=item["photos"],
                        listing_id=item["id"],
                    )
                    
                    if new_thumb or new_photos:
                        update_data = {}
                        if new_thumb:
                            update_data["thumbnail_url"] = new_thumb
                        if new_photos:
                            update_data["photos"] = new_photos
                        
                        supabase.table("market_listings")\
                            .update(update_data)\
                            .eq("id", item["id"])\
                            .execute()
                        
                        images_persisted += 1
                        logger.info(f"[Scrape] 📸 Images persisted for: {item['address']}")
                except Exception as img_err:
                    logger.warning(f"[Scrape] 📸 Image persistence failed for {item['address']}: {img_err}")
            
            logger.info(f"[Scrape] 📸 Image persistence complete: {images_persisted}/{len(listings_to_persist_images)} listings")
        
        # ============================================
        # RESPUESTA FINAL
        # ============================================
        
        return {
            "success": True,
            "city": city,
            "price_range": f"${min_price:,.0f} - ${max_price:,.0f}",
            "market_analysis": {
                "id": market_analysis_id,
                "total_scraped": len(all_listings),
                "market_value_avg": round(market_value, 0),
                "max_offer_60_percent": round(max_offer_60, 0),
                "price_range": {
                    "min": price_min,
                    "max": price_max,
                },
                "sources": sources_data,
            },
            "qualified": qualified_count,
            "saved_to_db": saved_count,
            "images_persisted": images_persisted,
            "results": sorted(results, key=lambda x: x["percent_of_market"])[:15],
        }
        
    except Exception as e:
        logger.error(f"[Scrape] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# TDHCA TITLE LOOKUP
# ============================================

class TDHCALookupRequest(BaseModel):
    """Request body for TDHCA title lookup."""
    search_value: str = Field(..., description="Label/Seal Number or Serial Number")
    search_type: str = Field(default="label", description="'label' or 'serial'")


@router.post("/tdhca-lookup")
async def tdhca_title_lookup(request: TDHCALookupRequest):
    """
    Look up a manufactured home title from the Texas TDHCA website.
    
    Uses Playwright to:
    1. Navigate to https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp
    2. Enter the serial/label number
    3. Submit the form
    4. Navigate to the detail page (from search results)
    5. Parse the detail page and return structured data
    
    Returns the title information as structured data.
    """
    import asyncio
    from playwright.async_api import async_playwright
    
    logger.info(f"[TDHCA] Looking up {request.search_type}: {request.search_value}")
    debug_log: list[str] = []  # Collect debug info for response
    
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # ═══ Step 1: Navigate to TDHCA search page ═══
            await page.goto(
                "https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp",
                wait_until='domcontentloaded',
                timeout=30000
            )
            debug_log.append(f"Step1: Loaded search page: {page.url}")
            
            # ═══ Step 2: Fill in the search field and submit ═══
            if request.search_type == 'serial':
                await page.fill('input[name="serial"]', request.search_value)
            else:
                await page.fill('input[name="label"]', request.search_value)
            
            await page.click('input[type="submit"], button[type="submit"]')
            await page.wait_for_load_state('domcontentloaded', timeout=15000)
            await asyncio.sleep(2)
            
            results_url = page.url
            content = await page.content()
            debug_log.append(f"Step2: After submit URL: {results_url}")
            debug_log.append(f"Step2: Content length: {len(content)}")
            
            # ═══ Step 3: Check if we got results ═══
            no_records_indicators = [
                'No records', 'no records', 'total_rec" value="0"',
                'No matching', 'no matching', '0 records',
            ]
            if any(ind in content for ind in no_records_indicators):
                await browser.close()
                return {
                    "success": False,
                    "message": f"No se encontraron registros para {request.search_type}: {request.search_value}",
                    "data": None
                }
            
            # ═══ Step 4: Detect if we're on results page or detail page ═══
            # TDHCA detail pages typically contain "Certificate #" or "Manufacturer"
            # as table cell labels, NOT as column headers in a results table.
            # Results pages have multiple rows with clickable links.
            
            is_detail_page = False
            
            # Check URL patterns
            url_lower = page.url.lower()
            if 'title_detail' in url_lower or 'titledetail' in url_lower:
                is_detail_page = True
                debug_log.append("Step4: URL indicates detail page")
            
            # Check page structure — detail pages have KV tables with specific labels
            if not is_detail_page:
                from bs4 import BeautifulSoup as _BS
                _check_soup = _BS(content, 'html.parser')
                _cells = [td.get_text(strip=True).lower() for td in _check_soup.find_all('td')]
                # Detail pages have these as table cell TEXT (not column headers)
                detail_indicators = ['certificate #', 'manufacturer', 'wind zone', 'square ftg']
                detail_hits = sum(1 for ind in detail_indicators if ind in _cells)
                if detail_hits >= 2:
                    is_detail_page = True
                    debug_log.append(f"Step4: Content analysis indicates detail page (hits={detail_hits})")
            
            # ═══ Step 5: If on results page, navigate to detail ═══
            if not is_detail_page:
                debug_log.append("Step5: On results page, trying to navigate to detail...")
                
                # Log ALL links on the page for debugging
                all_links = page.locator('a')
                link_count = await all_links.count()
                link_info = []
                for i in range(min(link_count, 30)):
                    href = await all_links.nth(i).get_attribute('href') or ''
                    text = (await all_links.nth(i).text_content() or '').strip()
                    link_info.append(f"  [{i}] text='{text[:40]}' href='{href[:80]}'")
                debug_log.append(f"Step5: Found {link_count} links:\n" + "\n".join(link_info))
                logger.info(f"[TDHCA] All links on page:\n" + "\n".join(link_info))
                
                # Try to find a detail link — prioritize links inside table cells
                # (results table rows) over navigation links
                clicked = False
                
                # Strategy A: Link in a table row with href containing detail/certnum
                detail_in_table = page.locator('table td a[href*="title_detail"], table td a[href*="titleDetail"], table td a[href*="certnum"]')
                if await detail_in_table.count() > 0:
                    debug_log.append(f"Step5A: Found {await detail_in_table.count()} detail links in table cells")
                    await detail_in_table.first.click()
                    clicked = True
                
                # Strategy B: Any link with href containing title_detail (NOT just "detail")
                if not clicked:
                    specific_detail = page.locator('a[href*="title_detail"], a[href*="titleDetail"]')
                    if await specific_detail.count() > 0:
                        debug_log.append(f"Step5B: Found {await specific_detail.count()} title_detail links")
                        await specific_detail.first.click()
                        clicked = True
                
                # Strategy C: Link in a table cell with text "Detail" (not nav bar)
                if not clicked:
                    table_detail = page.locator('table td a:has-text("Detail")')
                    if await table_detail.count() > 0:
                        debug_log.append(f"Step5C: Found {await table_detail.count()} 'Detail' links in table cells")
                        await table_detail.first.click()
                        clicked = True
                
                # Strategy D: First link in a results table row (skip header row)
                if not clicked:
                    # Try to find any link in the 2nd+ <tr> of a table (skip header)
                    row_links = page.locator('table tr:not(:first-child) td a')
                    if await row_links.count() > 0:
                        debug_log.append(f"Step5D: Found {await row_links.count()} links in table rows")
                        await row_links.first.click()
                        clicked = True
                
                if clicked:
                    await page.wait_for_load_state('domcontentloaded', timeout=15000)
                    await asyncio.sleep(2)
                    content = await page.content()
                    debug_log.append(f"Step5: After click URL: {page.url}")
                    logger.info(f"[TDHCA] After click — page URL: {page.url}")
                else:
                    debug_log.append("Step5: ⚠️ Could not find any detail link to click! Parsing current page as-is.")
                    logger.warning(f"[TDHCA] Could not find detail link! Parsing results page as fallback.")
            else:
                debug_log.append("Step4: Already on detail page, no click needed")
            
            # ═══ Step 6: Parse the page ═══
            from bs4 import BeautifulSoup
            import re as _re
            soup = BeautifulSoup(content, 'html.parser')
            
            page_text = soup.get_text('\n', strip=True)
            tables_before = len(soup.find_all('table'))
            debug_log.append(f"Step6: Page URL: {page.url}")
            debug_log.append(f"Step6: Tables in HTML: {tables_before}")
            debug_log.append(f"Step6: Page text (first 500): {page_text[:500]}")
            logger.info(f"[TDHCA] Page URL: {page.url}")
            logger.info(f"[TDHCA] Tables in raw HTML: {tables_before}")
            logger.info(f"[TDHCA] Page text (first 1500 chars): {page_text[:1500]}")
            
            # Parse using centralized parser (NOTE: this modifies soup in-place via _strip_nav_elements)
            title_data = parse_tdhca_detail_page(soup, page_text)
            
            # Get cleaned page_text AFTER parser stripped nav elements
            clean_page_text = soup.get_text('\n', strip=True)
            tables_after = len(soup.find_all('table'))
            
            debug_log.append(f"Step6: Tables after strip: {tables_after} (removed {tables_before - tables_after})")
            debug_log.append(f"Step6: Parsed {len(title_data)} fields: {list(title_data.keys())}")
            logger.info(f"[TDHCA] Tables after strip: {tables_after} (removed {tables_before - tables_after})")
            logger.info(f"[TDHCA] Parsed fields ({len(title_data)}): {list(title_data.keys())}")
            
            # Get URLs for reference
            detail_url = sanitize_tdhca_url(page.url)
            
            print_link = page.locator('a:has-text("Print"), a[href*="print"]')
            print_url = None
            if await print_link.count() > 0:
                print_url = await print_link.first.get_attribute('href')
                if print_url and not print_url.startswith('http'):
                    print_url = f"https://mhweb.tdhca.state.tx.us/mhweb/{print_url}"
                print_url = sanitize_tdhca_url(print_url)
            
            await browser.close()
            
            # Build structured response
            structured = build_structured_tdhca_data(
                title_data=title_data,
                page_text=page_text,
                detail_url=detail_url,
                print_url=print_url,
            )
            
            logger.info(f"[TDHCA] ✅ Structured: mfr='{structured['manufacturer']}', "
                        f"mfr_addr='{structured['manufacturer_address']}', "
                        f"mfr_csz='{structured['manufacturer_city_state_zip']}', "
                        f"model='{structured['model']}', serial='{structured['serial_number']}', "
                        f"label='{structured['label_seal']}', year='{structured['year']}', "
                        f"sqft='{structured['square_feet']}', wind='{structured['wind_zone']}', "
                        f"buyer='{structured['buyer']}', seller='{structured['seller']}', "
                        f"county='{structured['county']}', dims={structured['width']}x{structured['length']}")
            
            return {
                "success": True,
                "message": f"Título encontrado para {request.search_type}: {request.search_value}",
                "data": structured,
                "page_text": page_text[:5000],
                "clean_page_text": clean_page_text[:5000],
                "debug_log": debug_log,
                "raw_html": content,  # Full HTML for accurate debugging
            }
        
    except Exception as e:
        logger.error(f"[TDHCA] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Error consultando TDHCA: {str(e)}"
        )


# ============================================
# PRICE PREDICTION (Historical Data)
# ============================================

class PricePredictionRequest(BaseModel):
    """Request body for price prediction."""
    listing_price: float = Field(..., description="Current listing/asking price")
    sqft: Optional[int] = Field(None, description="Square footage")
    bedrooms: Optional[int] = Field(None, description="Number of bedrooms")
    bathrooms: Optional[float] = Field(None, description="Number of bathrooms")
    description: str = Field("", description="Listing description text")


@router.post("/predict-price")
async def predict_listing_price(request: PricePredictionRequest):
    """
    Predict the recommended purchase price for a market listing
    based on Maninos' real historical 2025 buy/sell data.
    
    No arbitrary margins — uses actual historical data:
    - Real purchase prices of similar houses
    - Real renovation (remodelación) costs — NOT including movida/comisión
    - Real sale prices and margins
    
    Returns recommended max price, expected sale price, expected renovation cost,
    and the K most similar historical houses used for the prediction.
    """
    from api.utils.price_predictor import predict_price
    
    try:
        result = predict_price(
            listing_price=request.listing_price,
            sqft=request.sqft,
            bedrooms=request.bedrooms,
            bathrooms=request.bathrooms,
            description=request.description,
        )
        return {"success": True, "prediction": result}
    except Exception as e:
        logger.error(f"[PricePredict] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/predict-price/batch")
async def predict_batch_prices():
    """
    Predict prices for ALL active listings in the database.
    Returns predictions sorted by opportunity (highest expected margin first).
    """
    from api.utils.price_predictor import predict_batch
    
    try:
        response = supabase.table("market_listings").select("*").in_(
            "status", ["new", "qualified", "reviewing"]
        ).execute()
        
        listings = response.data or []
        if not listings:
            return {"success": True, "predictions": [], "message": "No hay listings activos."}
        
        predictions = predict_batch(listings)
        
        # Sort by expected margin at listing price (best opportunities first)
        predictions.sort(
            key=lambda p: p.get('margin_at_listing_price_pct', 0),
            reverse=True
        )
        
        return {
            "success": True,
            "total_listings": len(listings),
            "predictions": predictions,
        }
    except Exception as e:
        logger.error(f"[PricePredictBatch] Error: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
