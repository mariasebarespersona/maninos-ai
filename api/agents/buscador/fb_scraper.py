"""
Facebook Marketplace Scraper for Mobile Homes.

Automatically searches Facebook Marketplace for mobile homes within
200 miles of Houston and Dallas, applies Maninos filters, and saves
qualified listings to the dashboard.

IMPORTANT:
- Facebook Marketplace REQUIRES authentication (login) to view listings.
- Before scraping, the user must connect their Facebook account via the
  "Conectar Facebook" button in the app, OR import cookies manually.
- The scraper loads saved cookies before navigating to Marketplace.

SEARCH STRATEGY:
- Search "mobile home" AND "manufactured home" in Houston + Dallas
- Price filter: $5K-$80K
- Category: Property For Sale
- Sort by newest first

ANTI-DETECTION:
- Realistic browser fingerprint
- Random delays between actions
- Scroll behavior simulation
- Cookie-based auth (not automated login)
"""

import asyncio
import logging
import re
import random
from datetime import datetime
from typing import List, Dict, Any, Optional
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)


@dataclass
class FBListing:
    """A Facebook Marketplace listing."""
    title: str = ""
    price: float = 0
    location: str = ""
    url: str = ""
    image_url: str = ""
    description: str = ""
    posted_date: str = ""
    seller_name: str = ""
    
    # Extracted fields
    address: str = ""
    city: str = ""
    state: str = "TX"
    year_built: Optional[int] = None
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    sqft: Optional[int] = None
    property_type: str = ""  # single_wide, double_wide


# Search configurations for Houston and Dallas areas
SEARCH_CONFIGS = [
    {
        "center": "Houston, TX",
        "lat": 29.7604,
        "lon": -95.3698,
        "radius_miles": 200,
    },
    {
        "center": "Dallas, TX",
        "lat": 32.7767,
        "lon": -96.7970,
        "radius_miles": 200,
    },
]

# Search terms that find mobile homes
SEARCH_TERMS = [
    "mobile home for sale",
    "manufactured home for sale",
]

# User-Agent rotation
USER_AGENTS = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15",
]


class FacebookMarketplaceScraper:
    """
    Authenticated Facebook Marketplace scraper for mobile homes.
    
    REQUIRES saved Facebook cookies to work. The user must connect their
    Facebook account first via the app or import cookies.
    
    NOTE: This scraper may need periodic updates as Facebook changes their HTML structure.
    """
    
    # FB Marketplace URL patterns
    BASE_URL = "https://www.facebook.com/marketplace"
    
    @staticmethod
    def build_search_url(
        query: str = "mobile home",
        city: str = "houston",
        min_price: int = 0,
        max_price: int = 80000,
    ) -> str:
        """Build a Facebook Marketplace search URL with filters."""
        query_encoded = query.replace(" ", "%20")
        # Facebook Marketplace category for property:
        # propertyForSale = property for sale category
        url = (
            f"{FacebookMarketplaceScraper.BASE_URL}/{city.lower()}/search?"
            f"query={query_encoded}"
            f"&minPrice={min_price}"
            f"&maxPrice={max_price}"
            f"&exact=false"
        )
        return url
    
    @staticmethod
    async def scrape(
        max_listings: int = 30,
        min_price: float = 0,
        max_price: float = 80000,
    ) -> List[FBListing]:
        """
        Scrape Facebook Marketplace for mobile homes in Houston + Dallas.
        
        REQUIRES: Facebook cookies to be saved first.
        Returns list of FBListing objects.
        """
        from api.agents.buscador.fb_auth import FacebookAuth
        
        # Check authentication first
        if not FacebookAuth.is_authenticated():
            logger.warning(
                "[FB Marketplace] ⚠️ Not authenticated! "
                "User must connect Facebook first via 'Conectar Facebook' button. "
                "Skipping Facebook scraping."
            )
            return []
        
        logger.info(f"[FB Marketplace] Starting authenticated scrape: $0-${max_price:,.0f}")
        
        all_listings: List[FBListing] = []
        
        for config in SEARCH_CONFIGS:
            city = config["center"].split(",")[0]
            
            for term in SEARCH_TERMS:
                try:
                    listings = await FacebookMarketplaceScraper._scrape_search(
                        query=term,
                        city=city,
                        min_price=int(min_price),
                        max_price=int(max_price),
                        max_listings=max(max_listings // 2, 10),  # At least 10 per search
                    )
                    all_listings.extend(listings)
                    
                    # Random delay between searches to avoid detection
                    await asyncio.sleep(random.uniform(3, 7))
                    
                except Exception as e:
                    logger.warning(f"[FB Marketplace] Error searching '{term}' in {city}: {e}")
                    continue
        
        # Deduplicate by URL
        seen_urls = set()
        unique = []
        for listing in all_listings:
            key = listing.url or f"{listing.title}-{listing.price}"
            if key not in seen_urls:
                seen_urls.add(key)
                unique.append(listing)
        
        logger.info(f"[FB Marketplace] Found {len(unique)} unique listings (from {len(all_listings)} total)")
        return unique
    
    @staticmethod
    async def _create_authenticated_page():
        """Create a Playwright page with Facebook cookies loaded and session warm-up."""
        from playwright.async_api import async_playwright
        from api.agents.buscador.fb_auth import FacebookAuth
        
        cookies = FacebookAuth.load_cookies()
        if not cookies:
            raise ValueError("No Facebook cookies available")
        
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--disable-gpu',
                '--disable-blink-features=AutomationControlled',
                '--disable-infobars',
                '--window-size=1920,1080',
            ]
        )
        
        ua = random.choice(USER_AGENTS)
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent=ua,
            locale='en-US',
            timezone_id='America/Chicago',
            # Simulate a real desktop screen
            screen={'width': 1920, 'height': 1080},
            has_touch=False,
            is_mobile=False,
        )
        
        # Load saved cookies into the context
        await context.add_cookies(cookies)
        
        page = await context.new_page()
        
        # Comprehensive anti-detection
        await page.add_init_script("""
            // Hide webdriver flag
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
            
            // Override permissions query
            const origQuery = window.navigator.permissions.query;
            window.navigator.permissions.query = (parameters) =>
                parameters.name === 'notifications'
                    ? Promise.resolve({ state: Notification.permission })
                    : origQuery(parameters);
            
            // Hide automation-related properties
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            Object.defineProperty(navigator, 'languages', {
                get: () => ['en-US', 'en', 'es'],
            });
            
            // Override chrome runtime
            window.chrome = { runtime: {} };
        """)
        
        # Warm up session: visit Facebook homepage first to establish cookies/session
        try:
            logger.info("[FB Marketplace] Warming up session on facebook.com...")
            await page.goto("https://www.facebook.com/", wait_until="domcontentloaded", timeout=15000)
            await asyncio.sleep(random.uniform(2, 4))
            
            # Check if we're logged in (look for the c_user evidence)
            warmup_url = page.url
            if "/login" not in warmup_url and "checkpoint" not in warmup_url:
                logger.info("[FB Marketplace] ✅ Session warm-up successful — logged in")
            else:
                logger.warning(f"[FB Marketplace] ⚠️ Session warm-up: redirected to {warmup_url}")
        except Exception as e:
            logger.warning(f"[FB Marketplace] Session warm-up failed: {e}")
        
        return playwright, browser, context, page
    
    @staticmethod
    async def _scrape_search(
        query: str,
        city: str,
        min_price: int = 0,
        max_price: int = 80000,
        max_listings: int = 15,
    ) -> List[FBListing]:
        """Scrape a single FB Marketplace search page with authentication."""
        
        url = FacebookMarketplaceScraper.build_search_url(
            query=query,
            city=city.lower(),
            min_price=min_price,
            max_price=max_price,
        )
        
        logger.info(f"[FB Marketplace] Scraping: {city} - '{query}'")
        logger.info(f"[FB Marketplace] URL: {url}")
        
        playwright = None
        browser = None
        context = None
        page = None
        listings: List[FBListing] = []
        
        try:
            playwright, browser, context, page = await FacebookMarketplaceScraper._create_authenticated_page()
            
            # Navigate to marketplace search
            logger.info(f"[FB Marketplace] Navigating to: {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            
            # Check if we got redirected to login (cookies expired or headless detected)
            current_url = page.url
            page_title = await page.title()
            logger.info(f"[FB Marketplace] Landed on: {current_url}")
            logger.info(f"[FB Marketplace] Page title: {page_title}")
            
            if "/login" in current_url or "checkpoint" in current_url:
                logger.warning("[FB Marketplace] Redirected to login — Facebook may have detected headless browser. Cookies NOT cleared (may still be valid).")
                # NOTE: Do NOT clear cookies here. Facebook often blocks headless browsers
                # even with valid cookies. User shouldn't need to re-import.
                return []
            
            # Wait for page to load
            await asyncio.sleep(random.uniform(3, 5))
            
            # Scroll down to load more listings (lazy loading)
            for i in range(4):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await asyncio.sleep(random.uniform(1.5, 3))
            
            # Log page content sample for debugging
            content_sample = await page.evaluate("document.body ? document.body.innerText.substring(0, 500) : 'NO BODY'")
            logger.info(f"[FB Marketplace] Page content sample: {content_sample[:300]}")
            
            # Extract listing data from the page
            listings = await FacebookMarketplaceScraper._extract_listings(page, city, max_listings)
            
            logger.info(f"[FB Marketplace] Extracted {len(listings)} listings from {city}")
            
        except Exception as e:
            logger.error(f"[FB Marketplace] Scrape error for {city}: {e}", exc_info=True)
        finally:
            if page:
                await page.close()
            if context:
                await context.close()
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
        
        return listings
    
    @staticmethod
    async def _extract_listings(page, city: str, max_listings: int) -> List[FBListing]:
        """Extract listing data from a FB Marketplace page."""
        listings = []
        
        try:
            # Strategy 1: Find marketplace item links
            # Facebook uses data-testid and aria-label attributes
            cards = await page.query_selector_all(
                'a[href*="/marketplace/item/"]'
            )
            
            logger.info(f"[FB Marketplace] Found {len(cards)} marketplace item links")
            
            if not cards:
                # Strategy 2: Try extracting from page content / JSON-LD
                content = await page.content()
                listings = FacebookMarketplaceScraper._parse_from_html(content, city)
                if listings:
                    logger.info(f"[FB Marketplace] Extracted {len(listings)} from HTML parsing")
                    return listings[:max_listings]
                
                # Strategy 3: Try getting data from page's script tags (FB embeds JSON data)
                listings = await FacebookMarketplaceScraper._extract_from_scripts(page, city)
                if listings:
                    logger.info(f"[FB Marketplace] Extracted {len(listings)} from script data")
                    return listings[:max_listings]
                
                logger.warning("[FB Marketplace] No listing cards found on page")
                return []
            
            # Parse each card
            for card in cards[:max_listings * 2]:  # Get extra to filter
                try:
                    listing = await FacebookMarketplaceScraper._parse_card(card, city)
                    if listing and listing.price > 0:
                        listings.append(listing)
                        if len(listings) >= max_listings:
                            break
                except Exception as e:
                    logger.debug(f"[FB Marketplace] Error parsing card: {e}")
                    continue
                    
        except Exception as e:
            logger.warning(f"[FB Marketplace] Error extracting listings: {e}")
        
        return listings
    
    @staticmethod
    async def _parse_card(card, city: str) -> Optional[FBListing]:
        """Parse a single listing card element."""
        listing = FBListing()
        
        # Get URL
        href = await card.get_attribute("href")
        if href:
            listing.url = f"https://www.facebook.com{href}" if href.startswith("/") else href
        
        # Get all text content from the card
        text = await card.inner_text()
        lines = [l.strip() for l in text.split("\n") if l.strip()]
        
        if not lines:
            return None
        
        # Parse price (look for $ sign)
        for line in lines:
            price = FacebookMarketplaceScraper._parse_price(line)
            if price:
                listing.price = price
                break
        
        # Parse title (usually the longest non-price, non-location line)
        for line in lines:
            if "$" not in line and len(line) > 8:
                listing.title = line
                break
        
        # Parse location
        for line in lines:
            lower = line.lower()
            if any(loc in lower for loc in ["tx", "texas", city.lower(), "houston", "dallas"]):
                listing.location = line
                listing.city = city
                break
        
        if not listing.city:
            listing.city = city
        
        # Get image
        try:
            img = await card.query_selector("img")
            if img:
                listing.image_url = await img.get_attribute("src") or ""
        except Exception:
            pass
        
        # Extract property details from title/description
        FacebookMarketplaceScraper._extract_details(listing)
        
        return listing
    
    @staticmethod
    async def _extract_from_scripts(page, city: str) -> List[FBListing]:
        """Try to extract listing data from Facebook's embedded JSON in script tags."""
        listings = []
        
        try:
            # Facebook often embeds data in script tags or __RELAY_DATA__
            scripts = await page.evaluate("""
                () => {
                    const results = [];
                    // Look for relay store data
                    const scripts = document.querySelectorAll('script[type="application/json"]');
                    scripts.forEach(s => {
                        try {
                            const data = JSON.parse(s.textContent);
                            results.push(JSON.stringify(data).substring(0, 5000));
                        } catch(e) {}
                    });
                    return results;
                }
            """)
            
            for script_text in scripts:
                try:
                    import json
                    data = json.loads(script_text)
                    # Look for marketplace listings in the data
                    found = FacebookMarketplaceScraper._find_listings_in_json(data, city)
                    listings.extend(found)
                except Exception:
                    continue
                    
        except Exception as e:
            logger.debug(f"[FB Marketplace] Script extraction failed: {e}")
        
        return listings
    
    @staticmethod
    def _find_listings_in_json(data: Any, city: str, depth: int = 0) -> List[FBListing]:
        """Recursively search JSON data for marketplace listing information."""
        listings = []
        
        if depth > 10:  # Prevent infinite recursion
            return listings
        
        if isinstance(data, dict):
            # Check if this looks like a listing
            if "listing_price" in data or "formatted_price" in data:
                listing = FBListing()
                listing.price = float(data.get("listing_price", {}).get("amount", 0)) / 100 if isinstance(data.get("listing_price"), dict) else 0
                listing.title = data.get("marketplace_listing_title", data.get("name", ""))
                listing.city = city
                listing.state = "TX"
                
                location = data.get("location", {})
                if isinstance(location, dict):
                    listing.location = location.get("reverse_geocode", {}).get("city", city)
                
                listing.url = f"https://www.facebook.com/marketplace/item/{data.get('id', '')}" if data.get('id') else ""
                
                if listing.price > 0 or listing.title:
                    FacebookMarketplaceScraper._extract_details(listing)
                    listings.append(listing)
            
            # Recurse into dict values
            for key, value in data.items():
                if isinstance(value, (dict, list)):
                    listings.extend(FacebookMarketplaceScraper._find_listings_in_json(value, city, depth + 1))
        
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, (dict, list)):
                    listings.extend(FacebookMarketplaceScraper._find_listings_in_json(item, city, depth + 1))
        
        return listings
    
    @staticmethod
    def _parse_from_html(html: str, city: str) -> List[FBListing]:
        """Parse listings from raw HTML when selectors fail."""
        try:
            from bs4 import BeautifulSoup
        except ImportError:
            logger.warning("[FB Marketplace] BeautifulSoup not available for HTML parsing")
            return []
        
        listings = []
        soup = BeautifulSoup(html, "html.parser")
        
        # Find all marketplace item links
        links = soup.find_all("a", href=re.compile(r"/marketplace/item/\d+"))
        
        logger.info(f"[FB Marketplace] HTML parser found {len(links)} marketplace links")
        
        for link in links[:30]:
            try:
                listing = FBListing()
                listing.url = f"https://www.facebook.com{link['href']}"
                listing.city = city
                listing.state = "TX"
                
                # Get text from the link and its parent
                text = link.get_text(separator="\n", strip=True)
                lines = [l.strip() for l in text.split("\n") if l.strip()]
                
                for line in lines:
                    price = FacebookMarketplaceScraper._parse_price(line)
                    if price:
                        listing.price = price
                        break
                
                for line in lines:
                    if "$" not in line and len(line) > 5:
                        listing.title = line
                        break
                
                # Get image
                img = link.find("img")
                if img and img.get("src"):
                    listing.image_url = img["src"]
                
                FacebookMarketplaceScraper._extract_details(listing)
                
                if listing.price > 0:
                    listings.append(listing)
                    
            except Exception:
                continue
        
        return listings
    
    @staticmethod
    def _parse_price(text: str) -> float:
        """Parse a price from text like '$45,000', '18\xa0500\xa0$', '45000'.
        
        Facebook uses non-breaking spaces (\xa0) as thousand separators
        and places $ AFTER the number: '35\xa0000\xa0$'
        """
        # Normalize: replace non-breaking spaces with regular spaces
        clean = text.replace("\xa0", " ").strip()
        
        # Format 1: "$18,500" or "$ 18,500"
        match = re.search(r'\$\s*([\d,\s]+)', clean)
        if match:
            try:
                num_str = re.sub(r'[,\s]', '', match.group(1))
                if num_str.isdigit():
                    return float(num_str)
            except ValueError:
                pass
        
        # Format 2: "18 500 $" or "35 000 $" (Facebook format — number then $)
        match = re.search(r'([\d][\d\s,]*)\s*\$', clean)
        if match:
            try:
                num_str = re.sub(r'[,\s]', '', match.group(1))
                if num_str.isdigit():
                    return float(num_str)
            except ValueError:
                pass
        
        # Format 3: plain number (e.g. "18500")
        stripped = re.sub(r'[,\s]', '', clean)
        if stripped.isdigit() and len(stripped) >= 3:
            return float(stripped)
        
        return 0
    
    @staticmethod
    def _extract_details(listing: FBListing):
        """Extract property details from listing title/description."""
        text = f"{listing.title} {listing.description}".lower()
        
        # Property type
        if any(kw in text for kw in ["double wide", "doublewide", "doble", "double section"]):
            listing.property_type = "double_wide"
        elif any(kw in text for kw in ["single wide", "singlewide", "single section", "una sección"]):
            listing.property_type = "single_wide"
        elif any(kw in text for kw in ["mobile home", "manufactured", "trailer", "casa movil", "casa móvil"]):
            listing.property_type = "single_wide"  # Default to single
        
        # Year
        year_match = re.search(r'(19[6-9]\d|20[0-2]\d)', text)
        if year_match:
            listing.year_built = int(year_match.group(1))
        
        # Bedrooms
        bed_match = re.search(r'(\d+)\s*(?:bed|br|bedroom|bd|cuarto|recámara|habitación)', text)
        if bed_match:
            listing.bedrooms = int(bed_match.group(1))
        
        # Bathrooms
        bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|ba|bathroom|baño)', text)
        if bath_match:
            listing.bathrooms = float(bath_match.group(1))
        
        # Sqft
        sqft_match = re.search(r'(\d{3,4})\s*(?:sq\s*ft|sqft|sf|square feet|ft²|pies)', text)
        if sqft_match:
            listing.sqft = int(sqft_match.group(1))
        
        # Address extraction
        if not listing.address and listing.location:
            listing.address = listing.location
        elif not listing.address and listing.title:
            addr_match = re.search(
                r'(\d+\s+\w+(?:\s+\w+)*(?:\s+(?:St|Ave|Blvd|Dr|Rd|Ln|Ct|Way|Hwy|Pl)))',
                listing.title, re.IGNORECASE
            )
            if addr_match:
                listing.address = addr_match.group(1)


def convert_to_scraped_listings(fb_listings: List[FBListing]) -> list:
    """Convert FBListings to the format expected by the market_listings table.
    Filters out:
      1. Rental listings — only keeps FOR SALE
      2. Non-mobile-home listings — Facebook returns regular houses too
    """
    from api.agents.buscador.scraper import ScrapedListing
    
    RENTAL_KEYWORDS = ['for rent', '/mo', 'per month', 'lease', 'rental', 'renting']
    
    # Keywords that confirm it's a mobile/manufactured home (not a regular house)
    MOBILE_HOME_KEYWORDS = [
        'mobile home', 'manufactured home', 'manufactured house',
        'mobile house', 'trailer home', 'trailer house', 'trailer park',
        'single wide', 'singlewide', 'double wide', 'doublewide',
        'single section', 'double section', 'triple wide',
        'casa movil', 'casa móvil', 'casa manufactur',
        'modular home', 'hud', 'mhvillage',
        '16x', '14x', '28x', '32x', '16 x', '14 x', '28 x', '32 x',  # Common mobile home dimensions
    ]
    
    # Keywords that indicate it's NOT a mobile home (regular house, condo, etc.)
    NOT_MOBILE_KEYWORDS = [
        'brick home', 'brick house', 'townhome', 'townhouse', 'condo',
        'apartment', 'duplex', 'triplex', 'lot for sale', 'land for sale',
        'acres for sale', 'commercial', 'office space',
        'story home', 'story house', 'stories',
    ]
    
    converted = []
    skipped_rental = 0
    skipped_not_mobile = 0
    
    for fb in fb_listings:
        combined_text = f"{fb.title} {fb.description}".lower()
        
        # Skip rental listings
        if any(kw in combined_text for kw in RENTAL_KEYWORDS):
            skipped_rental += 1
            continue
        
        # Skip non-mobile-home listings
        is_mobile = any(kw in combined_text for kw in MOBILE_HOME_KEYWORDS)
        is_definitely_not_mobile = any(kw in combined_text for kw in NOT_MOBILE_KEYWORDS)
        
        if is_definitely_not_mobile and not is_mobile:
            skipped_not_mobile += 1
            logger.info(f"[FB Filter] Skipping non-mobile-home: {fb.title[:60]}")
            continue
        
        if not is_mobile:
            # No mobile home keywords found — skip to be safe
            skipped_not_mobile += 1
            logger.info(f"[FB Filter] Skipping (no mobile home keywords): {fb.title[:60]}")
            continue
        sl = ScrapedListing(
            source="facebook",
            source_url=fb.url or f"fb-{hash(fb.title)}-{datetime.now().timestamp()}",
            source_id=None,
            address=fb.address or fb.title or "Facebook Marketplace",
            city=fb.city or "Houston",
            state=fb.state or "TX",
            zip_code=None,
            listing_price=fb.price,
            year_built=fb.year_built,
            sqft=fb.sqft,
            bedrooms=fb.bedrooms,
            bathrooms=fb.bathrooms,
            thumbnail_url=fb.image_url,
            scraped_at=datetime.now().isoformat(),
            photos=[fb.image_url] if fb.image_url else [],
        )
        converted.append(sl)
    
    if skipped_rental or skipped_not_mobile:
        logger.info(f"[FB Filter] Results: {len(converted)} mobile homes kept, "
                     f"{skipped_rental} rentals skipped, {skipped_not_mobile} non-mobile-homes skipped")
    
    return converted
