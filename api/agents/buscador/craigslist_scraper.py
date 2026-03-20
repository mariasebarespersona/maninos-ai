"""
Craigslist Scraper for Mobile Homes in Texas.

ADVANTAGE: Craigslist does NOT require login — fully public.
This serves as a reliable backup/complement to Facebook Marketplace.

SEARCH AREAS:
- Houston: https://houston.craigslist.org
- Dallas: https://dallas.craigslist.org
- San Antonio: https://sanantonio.craigslist.org
- Austin: https://austin.craigslist.org

Category: "rvs+camp" or search in housing for "mobile home"

RULES (Feb 2026 — confirmed with Maninos):
1. Price Range: $0 — $80,000
2. Location: Houston + Dallas areas
3. Types: single wide + double wide
"""

import asyncio
import logging
import re
from typing import List, Optional
from datetime import datetime
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)


# Craigslist regions to search (within 200mi of Houston + Dallas)
CRAIGSLIST_REGIONS = [
    {"region": "houston", "city": "Houston"},
    {"region": "dallas", "city": "Dallas"},
    {"region": "sanantonio", "city": "San Antonio"},
    {"region": "austin", "city": "Austin"},
]

# Multiple search paths to find mobile homes
SEARCH_PATHS = [
    # Search housing category for mobile homes
    "/search/hhh?query=mobile+home&min_price={min_price}&max_price={max_price}&srchType=T",
    # Search RVs/camp category (mobile homes often listed here)
    "/search/rva?query=mobile+home&min_price={min_price}&max_price={max_price}&srchType=T",
    # Manufactured homes
    "/search/hhh?query=manufactured+home&min_price={min_price}&max_price={max_price}&srchType=T",
]


class CraigslistScraper:
    """
    Scraper for Craigslist mobile home listings.
    
    NO LOGIN REQUIRED — fully public.
    Searches Houston, Dallas, San Antonio, and Austin craigslist regions.
    """
    
    @staticmethod
    def build_url(region: str, path: str, min_price: int = 0, max_price: int = 80000) -> str:
        """Build a Craigslist search URL."""
        formatted_path = path.format(min_price=min_price, max_price=max_price)
        return f"https://{region}.craigslist.org{formatted_path}"
    
    @staticmethod
    async def scrape(
        max_listings: int = 30,
        min_price: float = 0,
        max_price: float = 80000,
    ) -> List:
        """
        Scrape Craigslist for mobile homes in Texas.
        
        Returns list of ScrapedListing objects.
        """
        from api.agents.buscador.scraper import BrowserManager, ScrapedListing
        
        logger.info(f"[Craigslist] Starting scrape: ${min_price}-${max_price}")
        
        all_listings = []
        seen_urls = set()
        
        for region_config in CRAIGSLIST_REGIONS[:2]:  # Focus on Houston + Dallas
            region = region_config["region"]
            city = region_config["city"]
            
            for path in SEARCH_PATHS[:2]:  # Use first 2 paths to be efficient
                try:
                    url = CraigslistScraper.build_url(
                        region, path, int(min_price), int(max_price)
                    )
                    
                    listings = await CraigslistScraper._scrape_page(
                        url, city,
                        max_listings=max_listings // 4,  # Split across regions
                    )
                    
                    # Deduplicate
                    for listing in listings:
                        if listing.source_url not in seen_urls:
                            seen_urls.add(listing.source_url)
                            all_listings.append(listing)
                    
                    # Small delay between requests
                    await asyncio.sleep(1.5)
                    
                except Exception as e:
                    logger.warning(f"[Craigslist] Error scraping {region}: {e}")
                    continue
        
        logger.info(f"[Craigslist] Found {len(all_listings)} unique listings")
        return all_listings
    
    @staticmethod
    async def _scrape_page(url: str, city: str, max_listings: int = 15) -> List:
        """Scrape a single Craigslist search results page."""
        from api.agents.buscador.scraper import BrowserManager, ScrapedListing
        
        logger.info(f"[Craigslist] Scraping: {url}")
        
        listings = []
        page = None
        
        try:
            page = await BrowserManager.new_page()
            
            await page.goto(url, wait_until="domcontentloaded", timeout=20000)
            await asyncio.sleep(2)
            
            content = await page.content()
            soup = BeautifulSoup(content, "html.parser")
            
            # Craigslist search results - new layout uses <li class="cl-search-result">
            results = soup.select("li.cl-search-result, .result-row, .cl-static-search-result")
            
            logger.info(f"[Craigslist] Found {len(results)} result elements")
            
            for result in results[:max_listings]:
                try:
                    listing = CraigslistScraper._parse_result(result, city)
                    if listing and listing.listing_price > 0:
                        listings.append(listing)
                except Exception as e:
                    logger.debug(f"[Craigslist] Parse error: {e}")
                    continue
            
        except Exception as e:
            logger.error(f"[Craigslist] Page scrape error: {e}")
        finally:
            if page:
                await page.close()
        
        return listings
    
    @staticmethod
    def _parse_result(element, city: str):
        """Parse a Craigslist search result element."""
        from api.agents.buscador.scraper import ScrapedListing
        
        # Get link
        link = element.find("a", href=True)
        if not link:
            return None
        
        url = link.get("href", "")
        if not url.startswith("http"):
            return None
        
        # Get title
        title_el = element.find("span", class_="label") or element.find("a", class_="posting-title") or link
        title = title_el.get_text(strip=True) if title_el else ""
        
        # Get price
        price_el = element.find("span", class_="priceinfo") or element.find("span", class_="result-price")
        price_text = price_el.get_text(strip=True) if price_el else ""
        price = 0
        if price_text:
            price_match = re.search(r'\$?([\d,]+)', price_text)
            if price_match:
                try:
                    price = float(price_match.group(1).replace(",", ""))
                except ValueError:
                    pass
        
        # Get location
        meta_el = element.find("span", class_="meta") or element.find("span", class_="result-hood")
        location = meta_el.get_text(strip=True) if meta_el else city
        
        # Get thumbnail
        img = element.find("img")
        thumbnail = img.get("src", "") if img else ""
        
        # Extract details from title
        text = title.lower()
        
        year_built = None
        year_match = re.search(r'(19[6-9]\d|20[0-2]\d)', text)
        if year_match:
            year_built = int(year_match.group(1))
        
        bedrooms = None
        bed_match = re.search(r'(\d+)\s*(?:bed|br|bd)', text)
        if bed_match:
            bedrooms = int(bed_match.group(1))
        
        bathrooms = None
        bath_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:bath|ba)', text)
        if bath_match:
            bathrooms = float(bath_match.group(1))
        
        sqft = None
        sqft_match = re.search(r'(\d{3,4})\s*(?:sq|sf)', text)
        if sqft_match:
            sqft = int(sqft_match.group(1))
        
        # Filter: only include if title suggests mobile/manufactured home
        is_mobile = any(kw in text for kw in [
            "mobile", "manufactured", "trailer", "single wide", "double wide",
            "singlewide", "doublewide", "modular", "casa movil", "mobile home",
        ])
        
        if not is_mobile and price > 0:
            # Still include if it matches other criteria (cheap house in TX)
            if price > 80000:
                return None
        
        return ScrapedListing(
            source="craigslist",
            source_url=url,
            source_id=None,
            address=title or f"Craigslist listing in {city}",
            city=city,
            state="TX",
            zip_code=None,
            listing_price=price,
            year_built=year_built,
            sqft=sqft,
            bedrooms=bedrooms,
            bathrooms=bathrooms,
            thumbnail_url=thumbnail,
            scraped_at=datetime.now().isoformat(),
            photos=[thumbnail] if thumbnail else [],
        )

