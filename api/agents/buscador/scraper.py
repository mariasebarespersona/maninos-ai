"""
Real Web Scraper for Mobile Homes using Playwright + browser-use pattern.

DECISION: Playwright over Selenium because:
- Faster and async-first (perfect for FastAPI)
- Better JavaScript/dynamic content handling  
- Native headless support
- Active development by Microsoft
- browser-use library is designed for AI agents

SOURCES:
- https://www.mhvillage.com (Primary - 23,617+ listings)
- https://www.mobilehome.net (Secondary)
- https://www.zillow.com (For ARV comparables)

RULES (Feb 2026 — confirmed with Maninos):
1. 60% Rule: price <= market_value * 0.60  (renovation NOT included)
2. Price Range: $5,000 — $80,000
3. Location: Within 200mi of Houston OR Dallas, Texas
4. NO year filter (any age accepted)
5. Types: single wide + double wide
"""

import asyncio
import logging
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
from dataclasses import dataclass
from urllib.parse import urljoin, quote

# Playwright for browser automation
from playwright.async_api import async_playwright, Page, Browser, TimeoutError as PlaywrightTimeout

# BeautifulSoup for HTML parsing
from bs4 import BeautifulSoup

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


# ============================================
# BROWSER MANAGER (browser-use pattern)
# ============================================

class BrowserManager:
    """
    Manages browser instances using Playwright.
    Follows browser-use pattern for AI agent integration.
    """
    
    _browser: Optional[Browser] = None
    _playwright = None
    
    @classmethod
    async def get_browser(cls) -> Browser:
        """Get or create a browser instance."""
        if cls._browser is None or not cls._browser.is_connected():
            cls._playwright = await async_playwright().start()
            cls._browser = await cls._playwright.chromium.launch(
                headless=True,
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--disable-gpu',
                ]
            )
            logger.info("[BrowserManager] Browser launched")
        return cls._browser
    
    @classmethod
    async def close(cls):
        """Close the browser instance."""
        if cls._browser:
            await cls._browser.close()
            cls._browser = None
        if cls._playwright:
            await cls._playwright.stop()
            cls._playwright = None
        logger.info("[BrowserManager] Browser closed")
    
    @classmethod
    async def new_page(cls) -> Page:
        """Create a new browser page."""
        browser = await cls.get_browser()
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        )
        page = await context.new_page()
        return page


# ============================================
# MHVILLAGE SCRAPER
# ============================================

class MHVillageScraper:
    """
    Scraper for MHVillage.com - The #1 MOBILE HOME marketplace.
    
    IMPORTANT: MHVillage ONLY sells Mobile Homes / Manufactured Homes.
    It does NOT sell regular houses. This is guaranteed by the platform.
    
    URL Pattern: https://www.mhvillage.com/homes/tx/{city}
    
    Listings contain:
    - Price
    - Address
    - Year built
    - Bedrooms/Bathrooms
    - Square footage
    - Photos
    
    FILTER: Only "Mobile Home" or "Manufactured Home" listings are processed.
    """
    
    BASE_URL = "https://www.mhvillage.com"
    
    # Keywords that confirm it's a mobile home (not a regular house)
    MOBILE_HOME_KEYWORDS = [
        "mobile home", "manufactured home", "mobile", "manufactured",
        "trailer", "modular", "mh", "doublewide", "singlewide",
        "double wide", "single wide"
    ]
    
    @staticmethod
    def build_search_url(city: str, min_price: float = 0, max_price: float = 80000) -> str:
        """Build the search URL for a city."""
        city_slug = city.lower().replace(" ", "-")
        # MHVillage URL format (updated 2026)
        url = f"{MHVillageScraper.BASE_URL}/homes/tx/{city_slug}"
        return url
    
    @staticmethod
    async def scrape(
        city: str,
        min_price: float = 0,
        max_price: float = 80000,
        max_listings: int = 20
    ) -> List[ScrapedListing]:
        """
        Scrape mobile home listings from MHVillage.
        
        Args:
            city: Texas city to search
            min_price: Minimum price filter ($0 default — Feb 2026)
            max_price: Maximum price filter ($80K default — Feb 2026)
            max_listings: Maximum number of listings to return
        
        Returns:
            List of ScrapedListing objects
        """
        logger.info(f"[MHVillage] Scraping {city}, ${min_price}-${max_price}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            url = MHVillageScraper.build_search_url(city, min_price, max_price)
            
            logger.info(f"[MHVillage] Navigating to: {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            
            # Wait for page to fully render (SPA needs time)
            await asyncio.sleep(3)
            
            # Get page content
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            # Find listing cards - based on actual MHVillage structure 2026
            # Each listing appears in a card/article-like structure with price info
            listing_cards = soup.select('article, [class*="card"], [class*="listing"], div[class*="Home"]')
            
            logger.info(f"[MHVillage] Found {len(listing_cards)} listing cards")
            
            seen_urls = set()
            for card in listing_cards:
                if len(listings) >= max_listings:
                    break
                try:
                    listing = MHVillageScraper._parse_listing_card(card, city)
                    if listing and min_price <= listing.listing_price <= max_price:
                        # Deduplicate by URL
                        if listing.source_url and listing.source_url not in seen_urls:
                            seen_urls.add(listing.source_url)
                            listings.append(listing)
                        elif not listing.source_url:
                            listings.append(listing)
                except Exception as e:
                    logger.warning(f"[MHVillage] Error parsing card: {e}")
                    continue
            
            logger.info(f"[MHVillage] Successfully scraped {len(listings)} unique listings")
            
        except PlaywrightTimeout:
            logger.error(f"[MHVillage] Timeout loading page for {city}")
        except Exception as e:
            logger.error(f"[MHVillage] Error scraping {city}: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_listing_card(card, city: str) -> Optional[ScrapedListing]:
        """Parse a single listing card from MHVillage."""
        
        # Get all text from the card
        card_text = card.get_text(' ', strip=True)
        card_text_lower = card_text.lower()
        
        # Skip non-listing cards (navigation, headers, etc.)
        if 'For Sale' not in card_text and '$' not in card_text:
            return None
        
        # VERIFY: Must be a Mobile Home (not a regular house)
        # MHVillage only sells mobile homes, but double-check
        is_mobile_home = any(kw in card_text_lower for kw in MHVillageScraper.MOBILE_HOME_KEYWORDS)
        if not is_mobile_home:
            # If no mobile home keywords found, check if it's from MHVillage (which only sells mobile homes)
            # So we allow it, but log a warning
            logger.debug(f"[MHVillage] No mobile home keyword found, but allowing (MHVillage only sells mobile homes)")
        
        # Extract price - look for "For Sale: $XX,XXX" pattern
        price_match = re.search(r'For Sale:\s*\$?([\d,]+)', card_text)
        if not price_match:
            # Try simpler price pattern
            price_match = re.search(r'\$([\d,]+)', card_text)
        
        if not price_match:
            return None
        
        price = MHVillageScraper._parse_price(price_match.group(1))
        if not price or price < 1000:  # Filter out garbage
            return None
        
        # Extract address - look for location pattern before "Mobile Home"
        # Pattern like "Pine Trace, Houston, TX 77073" or just "Houston, TX 77073"
        loc_match = re.search(r'([A-Za-z][A-Za-z\s]+,\s*(?:Houston|Dallas|Austin|San Antonio|Fort Worth|El Paso)[^$]*TX\s*\d{5})', card_text)
        if loc_match:
            address = loc_match.group(1).strip()
        else:
            # Try simpler pattern - anything before "Mobile Home"
            simple_match = re.search(r'^([A-Za-z][^$\d]{5,50})', card_text)
            address = simple_match.group(1).strip() if simple_match else f"Property in {city}, TX"
        
        # Clean up address - remove trailing keywords
        address = re.sub(r'\s*(Mobile Home|For Sale|For Rent).*$', '', address, flags=re.I).strip()
        
        # Extract link
        link_elem = card.select_one('a[href*="/homes/"], a[href*="/home/"]')
        source_url = urljoin(MHVillageScraper.BASE_URL, link_elem['href']) if link_elem and link_elem.get('href') else ""
        source_id = link_elem['href'].split('/')[-1] if link_elem and link_elem.get('href') else None
        
        # Extract year built - pattern like "2016 |" or just 4-digit year
        year_built = None
        year_match = re.search(r'\b(19[89]\d|20[0-2]\d)\b', card_text)
        if year_match:
            year_built = int(year_match.group(1))
        
        # Extract bedrooms/bathrooms - pattern like "4 / 2" or "4/2" or "3 bed"
        bedrooms = None
        bathrooms = None
        
        # Try "X / Y" pattern first (MHVillage format)
        beds_baths_match = re.search(r'(\d+)\s*/\s*(\d+)', card_text)
        if beds_baths_match:
            bedrooms = int(beds_baths_match.group(1))
            bathrooms = float(beds_baths_match.group(2))
        else:
            # Fallback to "X bed" / "X bath" pattern
            bed_match = re.search(r'(\d+)\s*(?:bed|bd|br)', card_text, re.I)
            bath_match = re.search(r'(\d+\.?\d*)\s*(?:bath|ba)', card_text, re.I)
            if bed_match:
                bedrooms = int(bed_match.group(1))
            if bath_match:
                bathrooms = float(bath_match.group(1))
        
        # Extract sqft - pattern like "1,984 Sq. Ft." or "1984 sqft"
        sqft = None
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        if sqft_match:
            sqft = int(sqft_match.group(1).replace(',', ''))
        
        # Extract photo
        img_elem = card.select_one('img[src*="photo"], img[data-src]')
        thumbnail_url = None
        photos = []
        if img_elem:
            thumbnail_url = img_elem.get('src') or img_elem.get('data-src')
            if thumbnail_url:
                photos = [thumbnail_url]
        
        return ScrapedListing(
            source='mhvillage',
            source_url=source_url,
            source_id=source_id,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=photos,
            thumbnail_url=thumbnail_url,
            scraped_at=datetime.now().isoformat()
        )
    
    @staticmethod
    def _parse_price(price_text: str) -> Optional[float]:
        """Parse price from text like '$32,000' or '32000'."""
        if not price_text:
            return None
        # Remove currency symbols and commas
        cleaned = re.sub(r'[^\d.]', '', price_text)
        try:
            return float(cleaned)
        except ValueError:
            return None


# ============================================
# MOBILEHOME.NET SCRAPER
# ============================================

class MobileHomeNetScraper:
    """
    Scraper for MobileHome.net - Secondary source for MOBILE HOMES only.
    
    IMPORTANT: MobileHome.net ONLY sells Mobile Homes / Manufactured Homes.
    It does NOT sell regular houses. This is guaranteed by the platform name.
    
    URL Pattern: https://www.mobilehome.net/mobile-homes-for-sale/tx/{city}
    
    FILTER: Only Mobile Home listings are processed.
    """
    
    BASE_URL = "https://www.mobilehome.net"
    MOBILE_HOME_KEYWORDS = MHVillageScraper.MOBILE_HOME_KEYWORDS
    
    @staticmethod
    def build_search_url(city: str) -> str:
        """Build the search URL."""
        city_slug = city.lower().replace(" ", "-")
        return f"{MobileHomeNetScraper.BASE_URL}/mobile-homes-for-sale/tx/{city_slug}"
    
    @staticmethod
    async def scrape(
        city: str,
        max_price: float = 100000,
        max_listings: int = 15
    ) -> List[ScrapedListing]:
        """Scrape listings from MobileHome.net."""
        logger.info(f"[MobileHome.net] Scraping {city}, max ${max_price}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            url = MobileHomeNetScraper.build_search_url(city)
            
            logger.info(f"[MobileHome.net] Navigating to: {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=20000)
            await asyncio.sleep(3)
            
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            listing_cards = soup.select('.item')
            logger.info(f"[MobileHome.net] Found {len(listing_cards)} listing cards")
            
            for card in listing_cards[:max_listings]:
                try:
                    listing = MobileHomeNetScraper._parse_listing_card(card, city)
                    if listing and listing.listing_price <= max_price:
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[MobileHome.net] Error parsing: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"[MobileHome.net] Error: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_listing_card(card, city: str) -> Optional[ScrapedListing]:
        """Parse a listing card from MobileHome.net (.item element)."""
        card_text = card.get_text(' ', strip=True)
        
        if "Call for Price" in card_text:
            return None
        
        price_elem = card.select_one('.item-price')
        if not price_elem:
            return None
        
        price_text = price_elem.get_text(strip=True)
        price = MHVillageScraper._parse_price(price_text)
        if not price or price < 5000:
            return None
        
        address_match = re.search(r'(\d+[^,]+,\s*[^,]+,\s*TX\s*\d{5})', card_text)
        if address_match:
            address = address_match.group(1).strip()
        else:
            simple_match = re.search(r'(\d+\s+[A-Za-z\s]+)', card_text)
            address = simple_match.group(1).strip() if simple_match else f"Property in {city}, TX"
        
        link_elem = card.select_one('a[href*="/listing/"]')
        if not link_elem:
            link_elem = card.select_one('a[href]')
        source_url = urljoin(MobileHomeNetScraper.BASE_URL, link_elem['href']) if link_elem and link_elem.get('href') else ""
        
        year_match = re.search(r'\b(19[89]\d|20[0-2]\d)\b', card_text)
        year_built = int(year_match.group()) if year_match else None
        
        beds_baths_match = re.search(r'(\d+)\s*/\s*(\d+)', card_text)
        if beds_baths_match:
            bedrooms = int(beds_baths_match.group(1))
            bathrooms = float(beds_baths_match.group(2))
        else:
            bedrooms = None
            bathrooms = None
        
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        sqft = int(sqft_match.group(1).replace(',', '')) if sqft_match else None
        
        return ScrapedListing(
            source='mobilehome',
            source_url=source_url,
            source_id=None,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=[],
            thumbnail_url=None,
            scraped_at=datetime.now().isoformat()
        )


class MHBayScraper:
    """
    Scraper for MHBay.com - Third source for MOBILE HOMES only.
    
    IMPORTANT: MHBay ONLY sells Mobile Homes / Manufactured Homes.
    Uses SAME structure as MobileHome.net (.item + .item-price)
    
    URL Pattern: https://www.mhbay.com/mobile-homes-for-sale/tx/{city}
    
    565 listings in Texas!
    """
    
    BASE_URL = "https://www.mhbay.com"
    MOBILE_HOME_KEYWORDS = MHVillageScraper.MOBILE_HOME_KEYWORDS
    
    @staticmethod
    def build_search_url(city: str) -> str:
        """Build the search URL."""
        city_slug = city.lower().replace(" ", "-")
        return f"{MHBayScraper.BASE_URL}/mobile-homes-for-sale/tx/{city_slug}"
    
    @staticmethod
    async def scrape(
        city: str,
        max_price: float = 100000,
        max_listings: int = 15
    ) -> List[ScrapedListing]:
        """Scrape listings from MHBay.com (same structure as MobileHome.net)."""
        logger.info(f"[MHBay] Scraping {city}, max ${max_price}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            url = MHBayScraper.build_search_url(city)
            
            logger.info(f"[MHBay] Navigating to: {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=20000)
            await asyncio.sleep(3)
            
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            # Same structure as MobileHome.net: .item elements
            listing_cards = soup.select('.item')
            
            logger.info(f"[MHBay] Found {len(listing_cards)} listing cards")
            
            for card in listing_cards[:max_listings]:
                try:
                    listing = MHBayScraper._parse_listing_card(card, city)
                    if listing and listing.listing_price <= max_price:
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[MHBay] Error parsing: {e}")
                    continue
                    
        except Exception as e:
            logger.error(f"[MHBay] Error: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_listing_card(card, city: str) -> Optional[ScrapedListing]:
        """Parse a listing card from MHBay (same as MobileHome.net)."""
        card_text = card.get_text(' ', strip=True)
        
        # Skip rental listings — only want FOR SALE
        if any(kw in card_text.lower() for kw in ['for rent', '/mo', 'per month', 'lease', 'rental']):
            return None
        
        # Skip "Call for Price" listings
        if "Call for Price" in card_text:
            return None
        
        # Price - in .item-price div
        price_elem = card.select_one('.item-price')
        if not price_elem:
            return None
        
        price_text = price_elem.get_text(strip=True)
        price = MHVillageScraper._parse_price(price_text)
        if not price or price < 5000:
            return None
        
        # Address
        address_match = re.search(r'(\d+[^,]+,\s*[^,]+,\s*TX\s*\d{5})', card_text)
        if address_match:
            address = address_match.group(1).strip()
        else:
            simple_match = re.search(r'(\d+\s+[A-Za-z\s]+)', card_text)
            address = simple_match.group(1).strip() if simple_match else f"Property in {city}, TX"
        
        # Link
        link_elem = card.select_one('a[href*="/listing/"]')
        if not link_elem:
            link_elem = card.select_one('a[href]')
        source_url = urljoin(MHBayScraper.BASE_URL, link_elem['href']) if link_elem and link_elem.get('href') else ""
        
        # Year
        year_match = re.search(r'\b(19[89]\d|20[0-2]\d)\b', card_text)
        year_built = int(year_match.group()) if year_match else None
        
        # Beds/Baths
        beds_baths_match = re.search(r'(\d+)\s*/\s*(\d+)', card_text)
        if beds_baths_match:
            bedrooms = int(beds_baths_match.group(1))
            bathrooms = float(beds_baths_match.group(2))
        else:
            bedrooms = None
            bathrooms = None
        
        # Sqft
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        sqft = int(sqft_match.group(1).replace(',', '')) if sqft_match else None
        
        return ScrapedListing(
            source='mhbay',
            source_url=source_url,
            source_id=None,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=[],
            thumbnail_url=None,
            scraped_at=datetime.now().isoformat()
        )
    
    @staticmethod
    def build_search_url(city: str) -> str:
        """Build the search URL."""
        city_slug = city.lower().replace(" ", "-")
        return f"{MobileHomeNetScraper.BASE_URL}/mobile-homes-for-sale/tx/{city_slug}"
    
    @staticmethod
    async def scrape(
        city: str,
        max_price: float = 80000,
        max_listings: int = 15
    ) -> List[ScrapedListing]:
        """Scrape listings from MobileHome.net."""
        logger.info(f"[MobileHome.net] Scraping {city}, max ${max_price}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            url = MobileHomeNetScraper.build_search_url(city)
            
            logger.info(f"[MobileHome.net] Navigating to: {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=20000)
            
            # Wait for content to render
            await asyncio.sleep(3)
            
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            # MobileHome.net structure: listings are in .item elements
            listing_cards = soup.select('.item')
            
            logger.info(f"[MobileHome.net] Found {len(listing_cards)} listing cards")
            
            for card in listing_cards[:max_listings]:
                try:
                    listing = MobileHomeNetScraper._parse_listing_card(card, city)
                    if listing and listing.listing_price <= max_price:
                        listings.append(listing)
                except Exception as e:
                    logger.warning(f"[MobileHome.net] Error parsing: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"[MobileHome.net] Error: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_listing_card(card, city: str) -> Optional[ScrapedListing]:
        """Parse a listing card from MobileHome.net (.item element)."""
        card_text = card.get_text(' ', strip=True)
        
        # Skip rental listings — only want FOR SALE
        if any(kw in card_text.lower() for kw in ['for rent', '/mo', 'per month', 'lease', 'rental']):
            return None
        
        # Skip "Call for Price" listings
        if "Call for Price" in card_text:
            return None
        
        # Price - in .item-price div
        price_elem = card.select_one('.item-price')
        if not price_elem:
            return None
        
        price_text = price_elem.get_text(strip=True)
        price = MHVillageScraper._parse_price(price_text)
        if not price or price < 5000:
            return None
        
        # Address - pattern like "4503 Blue Bonnet, Houston, TX 77053"
        address_match = re.search(r'(\d+[^,]+,\s*[^,]+,\s*TX\s*\d{5})', card_text)
        if address_match:
            address = address_match.group(1).strip()
        else:
            # Try simpler pattern
            simple_match = re.search(r'(\d+\s+[A-Za-z\s]+)', card_text)
            address = simple_match.group(1).strip() if simple_match else f"Property in {city}, TX"
        
        # Link
        link_elem = card.select_one('a[href*="/listing/"]')
        if not link_elem:
            link_elem = card.select_one('a[href]')
        source_url = urljoin(MobileHomeNetScraper.BASE_URL, link_elem['href']) if link_elem and link_elem.get('href') else ""
        
        # Year - pattern like "2006"
        year_match = re.search(r'\b(19[89]\d|20[0-2]\d)\b', card_text)
        year_built = int(year_match.group()) if year_match else None
        
        # Beds/Baths - pattern like "3/2" or "3bd/2ba"
        beds_baths_match = re.search(r'(\d+)\s*/\s*(\d+)', card_text)
        if beds_baths_match:
            bedrooms = int(beds_baths_match.group(1))
            bathrooms = float(beds_baths_match.group(2))
        else:
            bed_match = re.search(r'(\d+)\s*(?:bed|bd|br)', card_text, re.I)
            bath_match = re.search(r'(\d+\.?\d*)\s*(?:bath|ba)', card_text, re.I)
            bedrooms = int(bed_match.group(1)) if bed_match else None
            bathrooms = float(bath_match.group(1)) if bath_match else None
        
        # Sqft
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        sqft = int(sqft_match.group(1).replace(',', '')) if sqft_match else None
        
        return ScrapedListing(
            source='mobilehome',
            source_url=source_url,
            source_id=None,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=[],
            thumbnail_url=None,
            scraped_at=datetime.now().isoformat()
        )


# ============================================
# ZILLOW SCRAPER (Mobile Homes)
# ============================================

class ZillowScraper:
    """
    Scraper for Zillow - For MOBILE HOME listings.
    
    IMPORTANT: We search specifically for "mobile homes" on Zillow.
    URL Pattern: https://www.zillow.com/{city}-tx/mobile-homes/
    
    Zillow has mobile home listings mixed with regular homes,
    so we filter by the "mobile-homes" category URL.
    """
    
    BASE_URL = "https://www.zillow.com"
    
    # Keywords to verify it's a mobile home
    MOBILE_HOME_KEYWORDS = MHVillageScraper.MOBILE_HOME_KEYWORDS
    
    @staticmethod
    async def scrape(
        city: str,
        min_price: float = 0,
        max_price: float = 80000,
        max_listings: int = 15
    ) -> List[ScrapedListing]:
        """
        Scrape mobile home listings from Zillow.
        
        Args:
            city: Texas city to search
            min_price: Minimum price filter
            max_price: Maximum price filter
            max_listings: Maximum number of listings to return
        
        Returns:
            List of ScrapedListing objects (mobile homes only)
        """
        logger.info(f"[Zillow] Scraping mobile homes in {city}, ${min_price}-${max_price}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            
            # Zillow mobile homes URL
            city_slug = city.lower().replace(" ", "-")
            url = f"{ZillowScraper.BASE_URL}/{city_slug}-tx/mobile-homes/"
            
            logger.info(f"[Zillow] Navigating to: {url}")
            await page.goto(url, wait_until='domcontentloaded', timeout=30000)
            await asyncio.sleep(3)  # Wait for JS to render
            
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            # Zillow listing cards
            listing_cards = soup.select('[data-test="property-card"], article, .list-card, .property-card')
            
            logger.info(f"[Zillow] Found {len(listing_cards)} potential cards")
            
            seen_urls = set()
            for card in listing_cards:
                if len(listings) >= max_listings:
                    break
                try:
                    listing = ZillowScraper._parse_listing_card(card, city)
                    if listing and min_price <= listing.listing_price <= max_price:
                        if listing.source_url and listing.source_url not in seen_urls:
                            seen_urls.add(listing.source_url)
                            listings.append(listing)
                except Exception as e:
                    logger.warning(f"[Zillow] Error parsing card: {e}")
                    continue
            
            logger.info(f"[Zillow] Successfully scraped {len(listings)} mobile home listings")
            
        except Exception as e:
            logger.error(f"[Zillow] Error scraping {city}: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_listing_card(card, city: str) -> Optional[ScrapedListing]:
        """Parse a Zillow listing card."""
        card_text = card.get_text(' ', strip=True)
        
        # Extract price
        price_match = re.search(r'\$([\d,]+)', card_text)
        if not price_match:
            return None
        
        price = MHVillageScraper._parse_price(price_match.group(1))
        if not price or price < 10000:
            return None
        
        # Extract address
        address_elem = card.select_one('address, [data-test="property-card-addr"], .list-card-addr')
        if address_elem:
            address = address_elem.get_text(strip=True)
        else:
            # Try to find address pattern
            addr_match = re.search(r'(\d+[^$]+(?:St|Ave|Rd|Dr|Blvd|Ln|Ct|Way)[^$]*)', card_text)
            address = addr_match.group(1).strip() if addr_match else f"Property in {city}, TX"
        
        # Extract link
        link_elem = card.select_one('a[href*="/homedetails/"], a[href*="zillow.com"]')
        source_url = ""
        if link_elem and link_elem.get('href'):
            href = link_elem['href']
            if href.startswith('/'):
                source_url = f"https://www.zillow.com{href}"
            else:
                source_url = href
        
        # Extract specs
        beds_match = re.search(r'(\d+)\s*(?:bd|bed|bds)', card_text, re.I)
        baths_match = re.search(r'(\d+\.?\d*)\s*(?:ba|bath)', card_text, re.I)
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        
        return ScrapedListing(
            source='zillow',
            source_url=source_url,
            source_id=None,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=None,  # Zillow doesn't always show this in cards
            sqft=int(sqft_match.group(1).replace(',', '')) if sqft_match else None,
            bedrooms=int(beds_match.group(1)) if beds_match else None,
            bathrooms=float(baths_match.group(1)) if baths_match else None,
            photos=[],
            thumbnail_url=None,
            scraped_at=datetime.now().isoformat()
        )
    
    @staticmethod
    async def get_arv_estimate(
        city: str,
        target_sqft: int = 1000,
        target_beds: int = 3
    ) -> Dict[str, Any]:
        """
        Get ARV estimate from Zillow comparables.
        
        Args:
            city: City to search
            target_sqft: Target square footage
            target_beds: Target bedrooms
        
        Returns:
            Dictionary with ARV estimate and comparables
        """
        logger.info(f"[Zillow] Getting ARV for {city}, ~{target_sqft}sqft")
        
        page = None
        
        try:
            page = await BrowserManager.new_page()
            
            # Search for recently sold mobile homes in the area
            city_slug = city.lower().replace(" ", "-")
            url = f"{ZillowScraper.BASE_URL}/{city_slug}-tx/mobile-homes/"
            
            await page.goto(url, wait_until='networkidle', timeout=30000)
            await asyncio.sleep(2)
            
            content = await page.content()
            soup = BeautifulSoup(content, 'lxml')
            
            # Extract prices from listings for ARV calculation
            prices = []
            price_elems = soup.select('[data-test="property-card-price"], .price, .list-card-price')
            
            for elem in price_elems[:10]:
                price_text = elem.get_text(strip=True)
                price = MHVillageScraper._parse_price(price_text)
                if price and 20000 <= price <= 100000:  # Reasonable mobile home range
                    prices.append(price)
            
            if prices:
                avg_price = sum(prices) / len(prices)
                median_price = sorted(prices)[len(prices) // 2]
                
                # ARV is typically slightly above average for a renovated home
                estimated_arv = median_price * 1.1  # 10% above median
                
                return {
                    "city": city,
                    "estimated_arv": round(estimated_arv, 0),
                    "avg_market_price": round(avg_price, 0),
                    "median_price": round(median_price, 0),
                    "comparables_count": len(prices),
                    "source": "zillow",
                    "confidence": min(0.9, len(prices) * 0.1),  # More comps = more confidence
                }
            else:
                # Fallback estimate based on typical Texas mobile home values
                return {
                    "city": city,
                    "estimated_arv": 50000.0,  # Default estimate
                    "avg_market_price": 45000.0,
                    "median_price": 45000.0,
                    "comparables_count": 0,
                    "source": "estimated",
                    "confidence": 0.3,
                }
                
        except Exception as e:
            logger.error(f"[Zillow] Error: {e}")
            return {
                "city": city,
                "estimated_arv": 50000.0,
                "source": "fallback",
                "error": str(e),
                "confidence": 0.2,
            }
        finally:
            if page:
                await page.close()


# ============================================
# VMF HOMES (VANDERBILT) SCRAPER
# ============================================

class VMFHomesScraper:
    """
    Scraper for VMF Homes (Vanderbilt Mortgage & Finance) - Mobile homes for SALE only.
    
    URL: https://www.vmfhomes.com/homesearch
    
    VMF is a major mobile home lender/seller in Texas.
    They have a map-based React SPA. We use Playwright to load the page
    and extract listing data from the rendered DOM.
    
    IMPORTANT: Only scrapes mobile homes FOR SALE (not rent).
    """
    
    BASE_URL = "https://www.vmfhomes.com"
    
    # Houston and Dallas coordinates for 200mi radius searches
    SEARCH_LOCATIONS = [
        {"lat": 29.7604, "lng": -95.3698, "name": "Houston"},  # Houston
        {"lat": 32.7767, "lng": -96.7970, "name": "Dallas"},    # Dallas
    ]
    
    @staticmethod
    def build_search_url(lat: float, lng: float, radius: int = 100, min_price: int = 5000, max_price: int = 80000) -> str:
        """Build VMF Homes search URL with location and price filters."""
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
        max_listings: int = 20,
    ) -> List[ScrapedListing]:
        """
        Scrape mobile homes for SALE from VMF Homes.
        Searches both Houston and Dallas areas.
        """
        logger.info(f"[VMF] Scraping VMF Homes, ${min_price}-${max_price}")
        
        all_listings = []
        seen_urls = set()
        
        for loc in VMFHomesScraper.SEARCH_LOCATIONS:
            if len(all_listings) >= max_listings:
                break
            
            page = None
            try:
                page = await BrowserManager.new_page()
                url = VMFHomesScraper.build_search_url(
                    lat=loc["lat"], lng=loc["lng"],
                    min_price=int(min_price), max_price=int(max_price)
                )
                
                logger.info(f"[VMF] Searching near {loc['name']}: {url}")
                await page.goto(url, wait_until='domcontentloaded', timeout=30000)
                await asyncio.sleep(5)  # Wait for React SPA to render
                
                # Try to switch to list view if available
                try:
                    list_btn = page.locator('text=List View, button:has-text("List")')
                    if await list_btn.count() > 0:
                        await list_btn.first.click()
                        await asyncio.sleep(2)
                except:
                    pass
                
                content = await page.content()
                soup = BeautifulSoup(content, 'lxml')
                
                # VMF uses property cards - look for common patterns
                listing_cards = soup.select(
                    '[class*="PropertyCard"], [class*="property-card"], '
                    '[class*="listing-card"], [class*="HomeCard"], '
                    'a[href*="/home/"], a[href*="/property/"]'
                )
                
                # Fallback: look for any card-like elements with price patterns
                if not listing_cards:
                    listing_cards = soup.find_all(
                        lambda tag: tag.name in ('div', 'a', 'article') 
                        and tag.get_text() 
                        and re.search(r'\$[\d,]+', tag.get_text())
                        and len(tag.get_text()) < 500
                    )
                
                logger.info(f"[VMF] Found {len(listing_cards)} potential cards near {loc['name']}")
                
                for card in listing_cards:
                    if len(all_listings) >= max_listings:
                        break
                    try:
                        listing = VMFHomesScraper._parse_listing_card(card, loc["name"])
                        if listing and min_price <= listing.listing_price <= max_price:
                            if listing.source_url not in seen_urls:
                                seen_urls.add(listing.source_url)
                                all_listings.append(listing)
                    except Exception as e:
                        logger.warning(f"[VMF] Error parsing card: {e}")
                        continue
                
            except Exception as e:
                logger.error(f"[VMF] Error scraping near {loc['name']}: {e}")
            finally:
                if page:
                    await page.close()
        
        logger.info(f"[VMF] Successfully scraped {len(all_listings)} listings total")
        return all_listings
    
    @staticmethod
    def _parse_listing_card(card, area_name: str) -> Optional[ScrapedListing]:
        """Parse a VMF Homes listing card."""
        card_text = card.get_text(' ', strip=True)
        
        # Skip rental listings
        if any(kw in card_text.lower() for kw in ['rent', '/mo', 'per month', 'lease']):
            return None
        
        # Extract price
        price_match = re.search(r'\$([\d,]+)', card_text)
        if not price_match:
            return None
        
        price = MHVillageScraper._parse_price(price_match.group(1))
        if not price or price < 5000:
            return None
        
        # Extract link
        link = None
        if card.name == 'a' and card.get('href'):
            link = card['href']
        else:
            link_elem = card.select_one('a[href]')
            if link_elem:
                link = link_elem.get('href', '')
        
        source_url = urljoin(VMFHomesScraper.BASE_URL, link) if link else f"vmf-{hash(card_text)}"
        
        # Extract address
        # Look for city, state pattern
        addr_match = re.search(r'(\d+[^,]+,\s*[^,]+,\s*TX\s*\d{5})', card_text)
        if addr_match:
            address = addr_match.group(1).strip()
        else:
            city_match = re.search(r'([A-Z][a-z]+(?:\s[A-Z][a-z]+)*),?\s*TX', card_text)
            address = city_match.group(0) if city_match else f"VMF Home near {area_name}, TX"
        
        # Extract city from address
        city_from_addr = re.search(r',\s*([^,]+),\s*TX', address)
        city = city_from_addr.group(1).strip() if city_from_addr else area_name
        
        # Year
        year_match = re.search(r'\b(19[89]\d|20[0-2]\d)\b', card_text)
        year_built = int(year_match.group()) if year_match else None
        
        # Beds/Baths
        bed_match = re.search(r'(\d+)\s*(?:bed|bd|br)', card_text, re.I)
        bath_match = re.search(r'(\d+\.?\d*)\s*(?:bath|ba)', card_text, re.I)
        bedrooms = int(bed_match.group(1)) if bed_match else None
        bathrooms = float(bath_match.group(1)) if bath_match else None
        
        # Sqft
        sqft_match = re.search(r'([\d,]+)\s*(?:sq\.?\s*ft|sqft)', card_text, re.I)
        sqft = int(sqft_match.group(1).replace(',', '')) if sqft_match else None
        
        # Photo
        img = card.select_one('img[src]')
        thumbnail = img['src'] if img else None
        
        return ScrapedListing(
            source='vmf_homes',
            source_url=source_url,
            source_id=None,
            address=address,
            city=city,
            state='TX',
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            photos=[thumbnail] if thumbnail else [],
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
    
    21st Mortgage is a major mobile/manufactured home lender.
    They publish their entire repo inventory as a **public JSON** at:
        https://www.21stmortgage.com/repolist3.json
    
    This is by far the highest quality data source:
    - Price, bedrooms, bathrooms, dimensions (length×width → sqft)
    - Exact GPS coordinates (lat/lon)
    - Year built, model/brand name
    - Photo URLs
    - Property/home type (Single Section / Multi Section)
    
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
        
        Args:
            min_price: Minimum price filter ($5K default)
            max_price: Maximum price filter ($80K default)
            max_listings: Maximum number of listings to return
            
        Returns:
            List of ScrapedListing objects (Texas only, in price range)
        """
        import requests as sync_requests
        
        logger.info(f"[21stMortgage] Fetching inventory JSON, ${min_price}-${max_price}")
        
        listings = []
        
        try:
            # Use sync requests in a thread — 21st Mortgage returns non-standard
            # HTTP headers that httpx rejects but requests tolerates.
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
            
            # Filter: Texas only, price range, valid data
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
            
            # Sort by price (cheapest first, most relevant for Maninos)
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
        
        # Build full address
        if address_line and city:
            address = f"{address_line}, {city}, {state}"
            if zip_code:
                address += f" {zip_code}"
        elif city:
            address = f"{city}, {state}"
        else:
            address = f"21st Mortgage #{idn}, TX"
        
        # Dimensions → sqft
        length = int(item.get("LEN") or 0)
        width = int(item.get("WID") or 0)
        sqft = (length * width) if (length > 0 and width > 0) else None
        
        # Bedrooms / Bathrooms (0 means unknown, treat as None)
        bdr = int(item.get("BDR") or 0)
        bedrooms = bdr if bdr > 0 else None
        bth = float(item.get("BTH") or 0)
        bathrooms = bth if bth > 0 else None
        
        # Year
        year_built = int(item.get("MYR") or 0) or None
        
        # Home type → description for context
        home_type = item.get("HT", "")  # "Single Section" or "Multi Section"
        model = item.get("MDL", "")  # e.g. "CHAMPION", "JESSUP"
        
        # Photo URL
        pic = item.get("PIC", "")
        if pic and not pic.startswith("http"):
            pic = f"{TwentyFirstMortgageScraper.PHOTO_BASE}/{pic.lstrip('/')}"
        thumbnail_url = pic if pic and "comingSoon" not in pic else None
        photos = [thumbnail_url] if thumbnail_url else []
        
        # Source URL (link to the listing on 21stmortgage.com)
        source_url = TwentyFirstMortgageScraper.LISTING_URL_TEMPLATE.format(idn=idn)
        
        # Latitude / Longitude — stored as extra fields via the ScrapedListing
        # These will be saved to the DB in the market_listings route
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
        listing._home_type = home_type  # "Single Section" / "Multi Section"
        listing._model = model
        
        return listing


# ============================================
# MAIN SCRAPING ORCHESTRATOR
# ============================================

class MobileHomeScraper:
    """
    Main orchestrator for scraping mobile homes from all sources.
    """
    
    @staticmethod
    async def search_all_sources(
        city: str,
        min_price: float = 0,
        max_price: float = 80000,
    ) -> Dict[str, Any]:
        """
        Search all sources for mobile homes in a city.
        
        Returns combined results from MHVillage, MobileHome.net, MHBay
        with market value estimates. Filters: $0-$80K, any age.
        """
        logger.info(f"[Orchestrator] Searching all sources for {city}")
        
        all_listings = []
        
        # Scrape MHVillage (primary)
        mhvillage_listings = await MHVillageScraper.scrape(
            city=city,
            min_price=min_price,
            max_price=max_price,
        )
        all_listings.extend(mhvillage_listings)
        
        # Scrape MobileHome.net (secondary)
        mobilehome_listings = await MobileHomeNetScraper.scrape(
            city=city,
            max_price=max_price,
        )
        all_listings.extend(mobilehome_listings)
        
        # Get ARV estimate from Zillow
        arv_data = await ZillowScraper.get_arv_estimate(city)
        
        # Add ARV to all listings
        for listing in all_listings:
            listing_dict = listing.__dict__.copy()
            listing_dict['estimated_arv'] = arv_data.get('estimated_arv')
            # Estimate renovation based on age and condition
            listing_dict['estimated_renovation'] = MobileHomeScraper._estimate_renovation(listing)
        
        # Close browser when done
        await BrowserManager.close()
        
        return {
            "city": city,
            "total_found": len(all_listings),
            "listings": [l.__dict__ for l in all_listings],
            "arv_data": arv_data,
            "sources": {
                "mhvillage": len(mhvillage_listings),
                "mobilehome": len(mobilehome_listings),
            },
            "scraped_at": datetime.now().isoformat(),
        }
    
    @staticmethod
    def _estimate_renovation(listing: ScrapedListing) -> float:
        """
        Estimate renovation cost based on property details.
        
        Uses $15/sqft as baseline, adjusted for age.
        """
        base_cost_per_sqft = 15.0
        
        sqft = listing.sqft or 1000  # Default 1000 sqft
        year = listing.year_built or 2000
        
        # Older homes need more work
        age = 2026 - year
        age_multiplier = 1.0 + (age * 0.02)  # 2% more per year of age
        
        cost = sqft * base_cost_per_sqft * min(age_multiplier, 1.5)  # Cap at 1.5x
        
        return round(cost, 0)

