"""
Partner scrapers for VMF Homes (Vanderbilt) and 21st Mortgage.

Both use direct JSON APIs — no browser/Playwright needed.
Extracted from the former api/agents/buscador/scraper.py so that
scheduler_service, market_listings, and public/properties can
continue refreshing partner inventory after BuscadorAgent was removed.
"""

import asyncio
import logging
import re
from typing import List, Dict, Optional
from datetime import datetime
from dataclasses import dataclass
from urllib.parse import quote

logger = logging.getLogger(__name__)


# ============================================
# DATA CLASSES
# ============================================

@dataclass
class ScrapedListing:
    """A scraped property listing."""
    source: str
    source_url: str
    source_id: Optional[str]
    address: str
    city: str
    state: str
    zip_code: Optional[str]
    listing_price: float
    year_built: Optional[int]
    sqft: Optional[int]
    bedrooms: Optional[int]
    bathrooms: Optional[float]
    photos: List[str]
    thumbnail_url: Optional[str]
    scraped_at: str
    # Price type: "full" = full asking price, "down_payment" = down payment only
    price_type: str = "full"
    estimated_full_price: Optional[float] = None


# ============================================
# VMF HOMES (VANDERBILT) SCRAPER
# ============================================

class VMFHomesScraper:
    """
    Scraper for VMF Homes (Vanderbilt Mortgage & Finance) - Mobile homes for SALE only.

    URL: https://www.vmfhomes.com/homesearch

    VMF Homes is a Next.js app that exposes a JSON API:
        POST /api/searchByState?state=TX  -> all Texas listings
        POST /api/searchByDistance         -> listings near a GPS coordinate

    NO browser/Playwright needed — pure HTTP + JSON. Fast and reliable.
    """

    BASE_URL = "https://www.vmfhomes.com"
    SEARCH_API = "https://www.vmfhomes.com/api/searchByState"
    DISTANCE_API = "https://www.vmfhomes.com/api/searchByDistance"
    PHOTO_CDN = "https://media.vmfhomes.com"

    HEADERS = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Referer": "https://www.vmfhomes.com/homesearch",
    }

    @staticmethod
    def build_search_url(lat: float, lng: float, radius: int = 100, min_price: int = 5000, max_price: int = 80000) -> str:
        """Build VMF Homes search URL (kept for compatibility, but we use the API directly now)."""
        import json
        location = json.dumps({"lat": lat, "lng": lng})
        return (
            f"{VMFHomesScraper.BASE_URL}/homesearch"
            f"?location={quote(location)}"
            f"&radius={radius}"
            f"&zoom=8"
            f"&minPrice={min_price}"
            f"&maxPrice={max_price}"
            f"&propertyType=Home+Only"
        )

    @staticmethod
    async def scrape(
        min_price: float = 5000,
        max_price: float = 80000,
        max_listings: int = 50,
    ) -> List[ScrapedListing]:
        """
        Fetch mobile homes for sale in Texas from VMF Homes via their JSON API.

        NO Playwright needed — direct HTTP POST to their internal Next.js API route.
        """
        import requests as sync_requests

        logger.info(f"[VMF] Fetching VMF Homes inventory via API, ${min_price}-${max_price}")

        listings = []

        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: sync_requests.post(
                    f"{VMFHomesScraper.SEARCH_API}?state=TX",
                    headers=VMFHomesScraper.HEADERS,
                    timeout=30,
                )
            )
            resp.raise_for_status()
            data = resp.json()

            if not isinstance(data, list):
                logger.warning(f"[VMF] Unexpected response type: {type(data)}")
                return []

            logger.info(f"[VMF] Total TX inventory: {len(data)} homes")

            # Filter: price range, for sale (not pending), valid data
            qualified = []
            for item in data:
                price = item.get("price")
                if not price or not isinstance(price, (int, float)):
                    continue
                if not (min_price <= price <= max_price):
                    continue
                if item.get("isSalePending"):
                    continue
                if item.get("isAcceptingOffers") is False:
                    continue
                qualified.append((item, float(price)))

            logger.info(f"[VMF] In range & for sale: {len(qualified)} homes")

            qualified.sort(key=lambda x: x[1])

            for item, price in qualified[:max_listings]:
                try:
                    listing = VMFHomesScraper._parse_item(item, price)
                    if listing:
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[VMF] Error parsing item listingId={item.get('listingId')}: {e}")
                    continue

            logger.info(f"[VMF] Successfully scraped {len(listings)} listings")

        except Exception as e:
            logger.error(f"[VMF] Error fetching inventory: {e}")

        return listings

    @staticmethod
    def _parse_item(item: Dict, price: float) -> Optional[ScrapedListing]:
        """Parse a single JSON item from the VMF API into a ScrapedListing."""

        listing_id = str(item.get("listingId", ""))
        city = (item.get("city") or "").strip()
        state = (item.get("state") or "TX").strip()
        address = (item.get("address") or "").strip()
        zip_code = str(item.get("zip") or "")

        if not address and not city:
            return None

        full_address = address if address else f"VMF Home in {city}, TX"

        source_url = f"{VMFHomesScraper.BASE_URL}/home/{listing_id}" if listing_id else f"vmf-{hash(f'{address}{city}{price}')}"

        bedrooms = item.get("bedrooms")
        bathrooms = item.get("bathrooms")
        year_built = item.get("year")

        sqft = item.get("sqFootage")
        if not sqft:
            length = item.get("length")
            width = item.get("width")
            if length and width:
                try:
                    sqft = int(float(length) * float(width))
                except Exception:
                    pass

        photos: List[str] = []
        thumbnail = None

        return ScrapedListing(
            source='vmf_homes',
            source_url=source_url,
            source_id=listing_id,
            address=full_address,
            city=city.title() if city else "",
            state=state,
            zip_code=zip_code if zip_code else None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=photos,
            thumbnail_url=thumbnail,
            scraped_at=datetime.now().isoformat()
        )


# ============================================
# 21ST MORTGAGE SCRAPER
# ============================================

class TwentyFirstMortgageScraper:
    """
    Scraper for 21stMortgage.com — Repo/used mobile homes for SALE only.

    URL: https://www.21stmortgage.com/web/21stsite.nsf/locating

    Publishes entire repo inventory as a public JSON at:
        https://www.21stmortgage.com/repolist3.json

    NO browser needed — pure HTTP + JSON. Fast and reliable.
    """

    JSON_URL = "https://www.21stmortgage.com/repolist3.json"
    BASE_URL = "https://www.21stmortgage.com"
    LISTING_URL_TEMPLATE = "https://www.21stmortgage.com/web/21stsite.nsf/details?OpenForm&idn={idn}-0-N"
    PHOTO_BASE = "https://www.21stmortgage.com"

    @staticmethod
    async def scrape(
        min_price: float = 5000,
        max_price: float = 80000,
        max_listings: int = 50,
    ) -> List[ScrapedListing]:
        """
        Fetch and filter mobile homes for sale in Texas from 21st Mortgage.
        """
        import requests as sync_requests

        logger.info(f"[21stMortgage] Fetching inventory JSON, ${min_price}-${max_price}")

        listings = []

        try:
            loop = asyncio.get_event_loop()
            resp = await loop.run_in_executor(
                None,
                lambda: sync_requests.get(
                    TwentyFirstMortgageScraper.JSON_URL,
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)"},
                    timeout=30,
                )
            )
            resp.raise_for_status()
            data = resp.json()

            logger.info(f"[21stMortgage] Total inventory: {len(data)} homes")

            tx_listings = []
            for item in data:
                state = (item.get("STA") or "").upper()
                if state != "TX":
                    continue
                price = TwentyFirstMortgageScraper._parse_price(item.get("PR"))
                if not price or not (min_price <= price <= max_price):
                    continue
                tx_listings.append((item, price))

            logger.info(f"[21stMortgage] Texas in range: {len(tx_listings)} homes")

            tx_listings.sort(key=lambda x: x[1])

            for item, price in tx_listings[:max_listings]:
                try:
                    listing = TwentyFirstMortgageScraper._parse_item(item, price)
                    if listing:
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[21stMortgage] Error parsing item IDN={item.get('IDN')}: {e}")
                    continue

            logger.info(f"[21stMortgage] Successfully scraped {len(listings)} listings")

        except Exception as e:
            logger.error(f"[21stMortgage] Error fetching inventory: {e}")

        return listings

    @staticmethod
    def _parse_price(value) -> Optional[float]:
        """Parse price from the JSON (can be int, float, or string)."""
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        if isinstance(value, str):
            cleaned = re.sub(r'[^\d.]', '', value)
            try:
                return float(cleaned) if cleaned else None
            except ValueError:
                return None
        return None

    @staticmethod
    def _parse_item(item: Dict, price: float) -> Optional[ScrapedListing]:
        """Parse a single JSON item into a ScrapedListing."""

        idn = str(item.get("IDN", ""))
        city = (item.get("CTY") or "").strip()
        state = (item.get("STA") or "TX").strip()
        zip_code = str(item.get("ZC") or "").strip() or None
        address_line = (item.get("AD1") or "").strip()

        if address_line and city:
            address = f"{address_line}, {city}, {state}"
            if zip_code:
                address += f" {zip_code}"
        elif city:
            address = f"{city}, {state}"
        else:
            address = f"21st Mortgage #{idn}, TX"

        length = int(item.get("LEN") or 0)
        width = int(item.get("WID") or 0)
        sqft = (length * width) if (length > 0 and width > 0) else None

        bdr = int(item.get("BDR") or 0)
        bedrooms = bdr if bdr > 0 else None
        bth = float(item.get("BTH") or 0)
        bathrooms = bth if bth > 0 else None

        year_built = int(item.get("MYR") or 0) or None

        home_type = item.get("HT", "")
        model = item.get("MDL", "")

        pic = item.get("PIC", "")
        if pic and not pic.startswith("http"):
            pic = f"{TwentyFirstMortgageScraper.PHOTO_BASE}/{pic.lstrip('/')}"
        thumbnail_url = pic if pic and "comingSoon" not in pic else None
        photos = [thumbnail_url] if thumbnail_url else []

        source_url = TwentyFirstMortgageScraper.LISTING_URL_TEMPLATE.format(idn=idn)

        latitude = item.get("Lat")
        longitude = item.get("Lon")

        listing = ScrapedListing(
            source="21st_mortgage",
            source_url=source_url,
            source_id=idn,
            address=address,
            city=city,
            state=state,
            zip_code=zip_code,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=photos,
            thumbnail_url=thumbnail_url,
            scraped_at=datetime.now().isoformat(),
        )

        # Attach extra data as ad-hoc attributes for the route to use
        listing._latitude = float(latitude) if latitude else None
        listing._longitude = float(longitude) if longitude else None
        listing._home_type = home_type
        listing._model = model

        return listing
