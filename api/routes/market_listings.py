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


# ============================================
# ENDPOINTS
# ============================================

@router.get("")
async def list_market_listings(
    qualified_only: bool = Query(default=True, description="Only show qualified listings"),
    city: Optional[str] = Query(default=None, description="Filter by city"),
    min_price: Optional[float] = Query(default=5000, description="Minimum price ($5K default)"),
    max_price: Optional[float] = Query(default=80000, description="Maximum price ($80K default)"),
    limit: int = Query(default=10, description="Number of listings to return"),
    offset: int = Query(default=0, description="Offset for pagination"),
):
    """
    List market listings from external sources.
    
    By default, returns only qualified listings (pass all 3 rules).
    Enforces $5K-$80K price range by default.
    """
    try:
        query = supabase.table("market_listings").select("*")
        
        if qualified_only:
            query = query.eq("is_qualified", True)
        
        query = query.eq("status", "available")
        
        # Always enforce price range (defaults: $5K-$80K)
        query = query.gte("listing_price", min_price)
        query = query.lte("listing_price", max_price)
        
        if city:
            query = query.ilike("city", f"%{city}%")
        
        query = query.order("qualification_score", desc=True)
        query = query.range(offset, offset + limit - 1)
        
        response = query.execute()
        
        return {
            "listings": response.data,
            "count": len(response.data),
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
        # QUALIFIED LISTINGS (from market_listings)
        # Enforce $5K-$80K range — exclude stale data from before filter update
        # ============================================
        from api.utils.qualification import MIN_PRICE, MAX_PRICE
        
        listings_query = supabase.table("market_listings")\
            .select("id, source, city, listing_price")\
            .eq("status", "available")\
            .gte("listing_price", MIN_PRICE)\
            .lte("listing_price", MAX_PRICE)\
            .execute()
        
        qualified_count = len(listings_query.data) if listings_query.data else 0
        
        # By source
        by_source = {"mhvillage": 0, "mobilehome": 0, "mhbay": 0}
        for listing in (listings_query.data or []):
            source = listing.get("source", "")
            if source in by_source:
                by_source[source] += 1
        
        # By city
        city_counts = {}
        for listing in (listings_query.data or []):
            city = listing.get("city", "Unknown")
            city_counts[city] = city_counts.get(city, 0) + 1
        top_cities = sorted(city_counts.items(), key=lambda x: x[1], reverse=True)[:5]
        
        # Price range of qualified listings
        listing_prices = [l.get("listing_price", 0) for l in (listings_query.data or []) if l.get("listing_price")]
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
        
        q = qualify_listing(
            listing_price=price,
            market_value=market_value or 0,
            city=listing_city,
            state=listing_state,
        )
        
        # Map to DB columns (backward compat)
        db_qual = qualification_to_db_fields(q)
        data.update(db_qual)
        data["max_offer_70_rule"] = q.get("max_offer_60_rule")  # Column name compat
        
        logger.info(f"[Create] Qualification: qualified={data['is_qualified']} score={data['qualification_score']} "
                     f"(60%={q['passes_60_rule']}, range={q['passes_price_range']}, zone={q['passes_zone_rule']})")
        
        response = supabase.table("market_listings")\
            .insert(data)\
            .execute()
        
        return response.data[0] if response.data else None
        
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
        
        return {
            "created": len(response.data) if response.data else 0,
            "skipped": skipped,
            "message": f"Processed {len(filtered)} listings, skipped {skipped}",
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
        from api.agents.buscador.scraper import MHVillageScraper, MobileHomeNetScraper, MHBayScraper, VMFHomesScraper, TwentyFirstMortgageScraper, BrowserManager
        from api.agents.buscador.fb_scraper import FacebookMarketplaceScraper, convert_to_scraped_listings
        from api.agents.buscador.fb_auth import FacebookAuth
        
        logger.info(f"[Scrape] Starting scrape for {city}, ${min_price}-${max_price}")
        
        # Check Facebook auth status
        fb_connected = FacebookAuth.is_authenticated()
        source_count = 6 if fb_connected else 5
        logger.info(f"[Scrape] Will scrape {source_count} sources: "
                     f"{'Facebook MP, ' if fb_connected else '(FB not connected) '}"
                     f"MHVillage, MobileHome.net, MHBay, VMF Homes, 21st Mortgage")
        
        all_listings = []
        all_prices = []
        fb_count = 0
        
        # ============================================
        # PASO 1: Scrapear TODAS LAS FUENTES
        # ============================================
        
        # SOURCE 0: Facebook Marketplace (PRIMARY - owner-to-owner, REQUIRES AUTH)
        if fb_connected:
            logger.info(f"[Scrape] 0/{source_count} - Scraping Facebook Marketplace (authenticated)...")
            try:
                fb_listings = await FacebookMarketplaceScraper.scrape(
                    max_listings=30,
                    min_price=min_price,
                    max_price=max_price,
                )
                fb_converted = convert_to_scraped_listings(fb_listings)
                all_listings.extend(fb_converted)
                all_prices.extend([l.listing_price for l in fb_converted])
                fb_count = len(fb_converted)
                logger.info(f"[Scrape] ✅ Facebook MP: {fb_count} mobile homes")
            except Exception as e:
                logger.warning(f"[Scrape] Facebook MP failed: {e}")
        else:
            logger.info("[Scrape] ⚠️ Facebook Marketplace SKIPPED - not connected. "
                        "Click 'Conectar Facebook' in the dashboard to enable.")
        
        # SOURCE 1: MHVillage (fuente principal - solo mobile homes)
        logger.info(f"[Scrape] 1/{source_count} - Scraping MHVillage...")
        mhv_listings = await MHVillageScraper.scrape(
            city=city,
            min_price=min_price,
            max_price=max_price,
            max_listings=20,
        )
        all_listings.extend(mhv_listings)
        all_prices.extend([l.listing_price for l in mhv_listings])
        logger.info(f"[Scrape] ✅ MHVillage: {len(mhv_listings)} mobile homes")
        
        # SOURCE 2: MobileHome.net (solo mobile homes)
        logger.info(f"[Scrape] 2/{source_count} - Scraping MobileHome.net...")
        mhn_listings = await MobileHomeNetScraper.scrape(
            city=city,
            max_price=max_price,
            max_listings=15,
        )
        all_listings.extend(mhn_listings)
        all_prices.extend([l.listing_price for l in mhn_listings])
        logger.info(f"[Scrape] ✅ MobileHome.net: {len(mhn_listings)} mobile homes")
        
        # SOURCE 3: MHBay (mobile homes only)
        logger.info(f"[Scrape] 3/{source_count} - Scraping MHBay...")
        mhbay_listings = await MHBayScraper.scrape(
            city=city,
            max_price=max_price,
            max_listings=15,
        )
        all_listings.extend(mhbay_listings)
        all_prices.extend([l.listing_price for l in mhbay_listings])
        logger.info(f"[Scrape] ✅ MHBay: {len(mhbay_listings)} mobile homes")
        
        # SOURCE 4: VMF Homes / Vanderbilt (mobile homes for SALE only)
        vmf_count = 0
        logger.info(f"[Scrape] 4/{source_count} - Scraping VMF Homes (Vanderbilt)...")
        try:
            vmf_listings = await VMFHomesScraper.scrape(
                min_price=min_price,
                max_price=max_price,
                max_listings=20,
            )
            all_listings.extend(vmf_listings)
            all_prices.extend([l.listing_price for l in vmf_listings])
            vmf_count = len(vmf_listings)
            logger.info(f"[Scrape] ✅ VMF Homes: {vmf_count} mobile homes")
        except Exception as e:
            logger.warning(f"[Scrape] VMF Homes failed: {e}")
        
        # SOURCE 5: 21st Mortgage (repo/used mobile homes — JSON API, no browser needed)
        mortgage21_count = 0
        logger.info(f"[Scrape] 5/{source_count} - Scraping 21st Mortgage (JSON API)...")
        try:
            mortgage21_listings = await TwentyFirstMortgageScraper.scrape(
                min_price=min_price,
                max_price=max_price,
                max_listings=50,
            )
            all_listings.extend(mortgage21_listings)
            all_prices.extend([l.listing_price for l in mortgage21_listings])
            mortgage21_count = len(mortgage21_listings)
            logger.info(f"[Scrape] ✅ 21st Mortgage: {mortgage21_count} mobile homes")
        except Exception as e:
            logger.warning(f"[Scrape] 21st Mortgage failed: {e}")
        
        # Close browser (only needed for Playwright-based scrapers)
        await BrowserManager.close()
        
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
            "facebook_marketplace": fb_count,
            "mhvillage": len(mhv_listings),
            "mobilehome_net": len(mhn_listings),
            "mhbay": len(mhbay_listings),
            "vmf_homes": vmf_count,
            "21st_mortgage": mortgage21_count,
        }
        
        # Import zone checker
        from api.utils.qualification import is_within_zone, MIN_PRICE, MAX_PRICE, BUY_PERCENT
        
        # First, count qualified before saving (new rules Feb 2026)
        qualified_count = 0
        for listing in all_listings:
            passes_60 = listing.listing_price <= max_offer_60
            passes_range = MIN_PRICE <= listing.listing_price <= MAX_PRICE
            passes_zone, _ = is_within_zone(listing.city, listing.state)
            if passes_60 and passes_range and passes_zone:
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
                    logger.info(f"[Scrape] ✓ Saved: {listing.address} (${listing.listing_price:,.0f})")
            except Exception as e:
                logger.warning(f"[Scrape] Error saving listing: {e}")
                continue
        
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
    4. Parse the results and return the ownership record
    
    Returns the title information as structured data.
    """
    import asyncio
    from playwright.async_api import async_playwright
    
    logger.info(f"[TDHCA] Looking up {request.search_type}: {request.search_value}")
    
    try:
        async with async_playwright() as pw:
            browser = await pw.chromium.launch(headless=True)
            page = await browser.new_page()
            
            # Navigate to TDHCA search page
            await page.goto(
                "https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp",
                wait_until='domcontentloaded',
                timeout=30000
            )
            
            # Fill in the search field
            if request.search_type == 'serial':
                await page.fill('input[name="serial"]', request.search_value)
            else:
                await page.fill('input[name="label"]', request.search_value)
            
            # Submit the form
            await page.click('input[type="submit"], button[type="submit"]')
            await page.wait_for_load_state('domcontentloaded', timeout=15000)
            await asyncio.sleep(2)
            
            # Check if we got results
            content = await page.content()
            
            # Try to find and click on the first result link (label/seal link)
            result_links = page.locator('a[href*="title_detail"]')
            has_result = await result_links.count() > 0
            
            if not has_result:
                # Check for "no records found" or empty results
                if 'No records' in content or 'no records' in content.lower() or 'total_rec" value="0"' in content:
                    await browser.close()
                    return {
                        "success": False,
                        "message": f"No se encontraron registros para {request.search_type}: {request.search_value}",
                        "data": None
                    }
            
            if has_result:
                await result_links.first.click()
                await page.wait_for_load_state('domcontentloaded', timeout=15000)
                await asyncio.sleep(2)
                content = await page.content()
            
            # Parse the detail page
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(content, 'html.parser')
            
            # Extract all table data
            title_data = {}
            
            # Get all text from tables
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows:
                    cells = row.find_all(['td', 'th'])
                    for i in range(len(cells) - 1):
                        key = cells[i].get_text(strip=True).rstrip(':')
                        val = cells[i + 1].get_text(strip=True)
                        if key and val and len(key) < 50:
                            title_data[key] = val
            
            # Also try to get the full page text for the printable version
            page_text = soup.get_text('\n', strip=True)
            
            # Get the current URL (detail page) for reference
            detail_url = page.url
            
            # Try to get the printable version URL
            print_link = page.locator('a:has-text("Print"), a[href*="print"]')
            print_url = None
            if await print_link.count() > 0:
                print_url = await print_link.first.get_attribute('href')
                if print_url and not print_url.startswith('http'):
                    print_url = f"https://mhweb.tdhca.state.tx.us/mhweb/{print_url}"
            
            await browser.close()
            
            # Structure the response
            return {
                "success": True,
                "message": f"Título encontrado para {request.search_type}: {request.search_value}",
                "data": {
                    "raw_fields": title_data,
                    "detail_url": detail_url,
                    "print_url": print_url,
                    "certificate_number": title_data.get("Certificate #") or title_data.get("Certificate"),
                    "manufacturer": title_data.get("Manufacturer"),
                    "model": title_data.get("Model"),
                    "year": title_data.get("Date Manf") or title_data.get("Year"),
                    "serial_number": title_data.get("Serial #") or title_data.get("Serial"),
                    "label_seal": title_data.get("Label/Seal#") or title_data.get("Label/Seal"),
                    "square_feet": title_data.get("Square Ftg"),
                    "seller": title_data.get("Seller/Transferor"),
                    "buyer": title_data.get("Buyer/Transferee"),
                    "county": title_data.get("County"),
                    "issue_date": title_data.get("Issue Date"),
                    "transfer_date": title_data.get("Transfer/Sale Date"),
                    "lien_info": title_data.get("First Lien") or title_data.get("Lien"),
                    "election": title_data.get("Election"),
                },
                "page_text": page_text[:3000],  # First 3000 chars of the page
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
