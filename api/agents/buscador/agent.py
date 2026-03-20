"""
BuscadorAgent - Intelligent Mobile Home Finder for Texas Market.

PURPOSE:
- Web scraping from MHVillage, MobileHome.net, MHBay, Facebook MP
- Filter properties using Maninos rules (updated Feb 2026)
- Maintain qualified properties in dashboard
- Auto-replenish when a property is purchased

SOURCES:
- https://www.mhvillage.com (Primary - largest mobile home marketplace)
- https://www.mobilehome.net (Secondary)
- https://www.zillow.com (For market value comparables)
- Facebook Marketplace (Primary purchase source - owner-to-owner)

RULES (Feb 2026 — confirmed with Maninos):
1. 60% Rule: price <= market_value * 0.60  (renovation NOT included)
2. Price Range: $5,000 — $80,000
3. Location: Within 200mi of Houston OR Dallas
4. NO year filter (any age accepted)
5. Types: single wide + double wide

TECH STACK:
- Playwright (over Selenium) for browser automation
- browser-use pattern for AI agent integration
- BeautifulSoup for HTML parsing

Following Agent Bible v1 and Developer Bible v2.
"""

import asyncio
import json
import logging
import os
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field
import httpx

from ..base import BaseAgent, AgentRequest, AgentResponse
from langchain_core.tools import tool

# Import real scrapers
from .scraper import (
    MHVillageScraper,
    MobileHomeNetScraper,
    ZillowScraper,
    MobileHomeScraper,
    BrowserManager,
)

logger = logging.getLogger(__name__)


# ============================================
# SCHEMAS
# ============================================

class MarketListing(BaseModel):
    """A property listing from the market."""
    source: str = Field(description="Source website: mhvillage, mobilehome, zillow")
    source_url: str = Field(description="URL of the listing")
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


class QualificationResult(BaseModel):
    """Result of property qualification check."""
    passes_60_rule: bool = False       # Was 70%, now 60% (Feb 2026)
    passes_price_range: bool = False   # $5K-$80K
    passes_zone_rule: bool = False     # 200mi Houston/Dallas
    is_qualified: bool = False
    score: int = 0
    reasons: List[str] = Field(default_factory=list)
    max_offer: Optional[float] = None
    estimated_roi: Optional[float] = None


class BuscadorResult(BaseModel):
    """Result from BuscadorAgent."""
    listings_found: int = 0
    listings_qualified: int = 0
    listings: List[Dict[str, Any]] = Field(default_factory=list)
    summary: str


# ============================================
# TOOLS - REAL WEB SCRAPING WITH PLAYWRIGHT
# ============================================

@tool
async def scrape_mhvillage(city: str, max_price: float = 80000, min_price: float = 0) -> List[Dict[str, Any]]:
    """
    PURPOSE: Scrape mobile home listings from MHVillage.com using Playwright
    
    WHEN TO USE:
    ✓ When searching for mobile homes in Texas
    ✓ When dashboard needs more qualified properties
    ✓ For initial property discovery
    
    WHEN NOT TO USE:
    ✗ When looking at properties already in Maninos inventory
    ✗ For ARV comparables (use Zillow instead)
    
    PARAMETERS:
        city: City in Texas to search (e.g., "Houston", "Dallas")
        max_price: Maximum listing price (default $80,000)
        min_price: Minimum listing price (default $0)
    
    RETURNS:
        List of property dictionaries with details from MHVillage
    
    EXAMPLE:
        scrape_mhvillage("Houston", max_price=80000)
    
    TECH: Uses Playwright browser automation (faster than Selenium)
    """
    logger.info(f"[TOOL] scrape_mhvillage: {city}, ${min_price}-${max_price}")
    
    try:
        # Use real Playwright scraper
        listings = await MHVillageScraper.scrape(
            city=city,
            min_price=min_price,
            max_price=max_price,
            max_listings=20
        )
        
        # Convert to dict format
        result = [l.__dict__ for l in listings]
        logger.info(f"[TOOL] scrape_mhvillage: Found {len(result)} real listings")
        return result
        
    except Exception as e:
        logger.error(f"[TOOL] scrape_mhvillage error: {e}")
        # Return empty list on error
        return []


@tool
async def scrape_mobilehome_net(city: str, max_price: float = 80000) -> List[Dict[str, Any]]:
    """
    PURPOSE: Scrape mobile home listings from MobileHome.net using Playwright
    
    WHEN TO USE:
    ✓ As secondary source after MHVillage
    ✓ When MHVillage doesn't have enough listings
    ✓ For cross-referencing prices
    
    PARAMETERS:
        city: City in Texas to search
        max_price: Maximum listing price (default $80K)
    
    RETURNS:
        List of property dictionaries from MobileHome.net
    
    TECH: Uses Playwright browser automation
    """
    logger.info(f"[TOOL] scrape_mobilehome_net: {city}, max ${max_price}")
    
    try:
        listings = await MobileHomeNetScraper.scrape(
            city=city,
            max_price=max_price,
            max_listings=15
        )
        
        result = [l.__dict__ for l in listings]
        logger.info(f"[TOOL] scrape_mobilehome_net: Found {len(result)} listings")
        return result
        
    except Exception as e:
        logger.error(f"[TOOL] scrape_mobilehome_net error: {e}")
        return []


@tool
async def scrape_facebook_marketplace(max_listings: int = 30) -> List[Dict[str, Any]]:
    """
    PURPOSE: Scrape Facebook Marketplace for mobile homes — PRIMARY SOURCE
    
    WHEN TO USE:
    ✓ ALWAYS as the FIRST source for finding properties
    ✓ Facebook Marketplace is the #1 source for owner-to-owner mobile home sales
    ✓ For dashboard replenishment
    
    WHEN NOT TO USE:
    ✗ When you only need market value comparison (use MHVillage/Zillow instead)
    
    PARAMETERS:
        max_listings: Maximum number of listings to return (default 30)
    
    RETURNS:
        List of mobile home listings from Facebook Marketplace
        Automatically searches both Houston and Dallas areas (200mi radius each)
    
    TECH: Uses Playwright browser automation to navigate Facebook Marketplace
    """
    logger.info(f"[TOOL] scrape_facebook_marketplace: max {max_listings}")
    
    try:
        from api.agents.buscador.fb_scraper import FacebookMarketplaceScraper
        
        listings = await FacebookMarketplaceScraper.scrape(
            max_listings=max_listings,
            min_price=0,
            max_price=80000,
        )
        
        result = [{
            "source": "facebook_marketplace",
            "title": l.title,
            "price": l.price,
            "location": l.location,
            "url": l.url,
            "image_url": l.image_url,
            "city": l.city,
            "state": l.state,
            "year_built": l.year_built,
            "bedrooms": l.bedrooms,
            "bathrooms": l.bathrooms,
            "sqft": l.sqft,
            "property_type": l.property_type,
            "price_type": l.price_type,  # "full" or "down_payment"
            "estimated_full_price": l.estimated_full_price,
        } for l in listings]
        
        logger.info(f"[TOOL] scrape_facebook_marketplace: Found {len(result)} listings")
        return result
        
    except Exception as e:
        logger.error(f"[TOOL] scrape_facebook_marketplace error: {e}")
        return []


@tool
async def get_zillow_arv(city: str, target_sqft: int = 1000) -> Dict[str, Any]:
    """
    PURPOSE: Get market value estimate from Zillow comparables
    
    WHEN TO USE:
    ✓ After finding a listing to calculate 60% rule
    ✓ To estimate sale price after renovation
    ✓ For market value calculations
    
    WHEN NOT TO USE:
    ✗ For finding properties to buy (use Facebook MP or MHVillage instead)
    
    PARAMETERS:
        city: City in Texas
        target_sqft: Target square footage for comparables
    
    RETURNS:
        Dictionary with market value estimate and comparable sales data
    
    TECH: Uses Playwright to scrape Zillow comparable sales
    """
    logger.info(f"[TOOL] get_zillow_arv: {city}, ~{target_sqft} sqft")
    
    try:
        arv_data = await ZillowScraper.get_arv_estimate(
            city=city,
            target_sqft=target_sqft,
        )
        
        logger.info(f"[TOOL] get_zillow_arv: ARV ${arv_data.get('estimated_arv', 'N/A')}")
        return arv_data
        
    except Exception as e:
        logger.error(f"[TOOL] get_zillow_arv error: {e}")
        return {
            "city": city,
            "estimated_arv": 50000.0,  # Fallback
            "source": "fallback",
            "error": str(e),
        }


@tool
def qualify_property(
    listing_price: float,
    estimated_market_value: float,
    city: str = "",
    state: str = "TX"
) -> Dict[str, Any]:
    """
    PURPOSE: Check if a property passes Maninos' qualification rules
    
    RULES (Updated Feb 2026 — confirmed with Maninos):
    1. 60% Rule: price <= market_value * 0.60  (renovation NOT included)
    2. Price Range: $5,000 — $80,000
    3. Location: Within 200mi of Houston OR Dallas
    4. NO year filter (removed — they buy any age)
    5. Types: single wide + double wide accepted
    
    PARAMETERS:
        listing_price: Current asking price
        estimated_market_value: Market value (avg of historical + web scraping)
        city: City name for zone check
        state: State (must be TX)
    
    RETURNS:
        Qualification result with pass/fail for each rule and score
    """
    from api.utils.qualification import qualify_listing
    
    logger.info(f"[TOOL] qualify_property: ${listing_price}, MV ${estimated_market_value}, {city} {state}")
    
    result = qualify_listing(
        listing_price=listing_price,
        market_value=estimated_market_value,
        city=city,
        state=state,
    )
    
    # Add ROI estimate (renovation $5K-$15K avg = $10K)
    avg_renovation = 10_000
    total_investment = listing_price + avg_renovation
    sell_price = estimated_market_value * 0.80 if estimated_market_value else 0
    profit = sell_price - total_investment
    roi = (profit / total_investment) * 100 if total_investment > 0 else 0
    result["estimated_roi"] = round(roi, 1)
    result["max_offer"] = result.get("max_offer_60_rule", 0)
    
    return result


@tool
async def save_to_dashboard(listings: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    PURPOSE: Save qualified listings to the market_listings table in database
    
    WHEN TO USE:
    ✓ After scraping and qualifying properties
    ✓ To update the dashboard with new options
    
    PARAMETERS:
        listings: List of qualified property listings
    
    RETURNS:
        Result with count of saved listings
    """
    logger.info(f"[TOOL] save_to_dashboard: {len(listings)} listings")
    
    api_url = os.getenv("API_URL", "http://localhost:8000")
    
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{api_url}/api/market-listings/bulk",
                json=listings,
                timeout=30.0
            )
            
            if response.status_code == 200:
                result = response.json()
                logger.info(f"[TOOL] save_to_dashboard: Saved {result.get('created', 0)} listings")
                return result
            else:
                logger.error(f"[TOOL] save_to_dashboard failed: {response.status_code}")
                return {"error": response.text, "saved_count": 0}
                
    except Exception as e:
        logger.error(f"[TOOL] save_to_dashboard error: {e}")
        return {"error": str(e), "saved_count": 0}


@tool
async def search_all_sources(city: str, min_price: float = 0, max_price: float = 80000) -> Dict[str, Any]:
    """
    PURPOSE: Search ALL sources (MHVillage, MobileHome.net, MHBay) and get market value
    
    This is the main tool for comprehensive property search.
    
    WHEN TO USE:
    ✓ When you need to find properties and qualify them in one go
    ✓ For dashboard replenishment
    
    PARAMETERS:
        city: Texas city to search (should be within 200mi of Houston or Dallas)
        min_price: Minimum price (default $0)
        max_price: Maximum price (default $80,000)
    
    RETURNS:
        Combined results from all sources with market value estimates
    """
    logger.info(f"[TOOL] search_all_sources: {city}, ${min_price}-${max_price}")
    
    try:
        result = await MobileHomeScraper.search_all_sources(
            city=city,
            min_price=min_price,
            max_price=max_price,
        )
        
        logger.info(f"[TOOL] search_all_sources: Found {result.get('total_found', 0)} total listings")
        return result
        
    except Exception as e:
        logger.error(f"[TOOL] search_all_sources error: {e}")
        return {"error": str(e), "total_found": 0, "listings": []}


# ============================================
# BUSCADOR AGENT
# ============================================

class BuscadorAgent(BaseAgent):
    """
    Intelligent Mobile Home Finder for Maninos Homes.
    
    Responsibilities:
    1. Scrape properties from MHVillage, MobileHome.net, MHBay, Facebook MP
    2. Qualify properties using Maninos rules (60%, $5K-$80K, 200mi zone)
    3. Maintain qualified properties in dashboard
    4. Auto-replenish when a property is purchased
    
    Rules (Feb 2026):
    - 60% of market value (NOT 70%, renovation NOT included)
    - No year filter (any age accepted)
    - Within 200mi of Houston OR Dallas
    - Price range: $5,000 — $80,000
    - Types: single wide + double wide
    
    Tools (using Playwright for browser automation):
    - scrape_mhvillage: Primary source for listings
    - scrape_mobilehome_net: Secondary source
    - get_zillow_arv: For market value estimates and comparables
    - qualify_property: Check qualification rules
    - save_to_dashboard: Save to database
    - search_all_sources: Combined search across all sources
    """
    
    def __init__(self):
        super().__init__(
            name="buscador",
            description="Intelligent mobile home finder with REAL web scraping using Playwright",
            model="gpt-4o",
            temperature=0.2,
        )
        self.tools = [
            scrape_facebook_marketplace,  # PRIMARY source — always search first
            scrape_mhvillage,
            scrape_mobilehome_net,
            get_zillow_arv,
            qualify_property,
            save_to_dashboard,
            search_all_sources,
        ]
        self.api_url = os.getenv("API_URL", "http://localhost:8000")
    
    @property
    def system_prompt(self) -> str:
        return """# IDENTITY
You are BuscadorAgent, an intelligent mobile home finder for Maninos Homes in Texas.
Your job: Find good mobile home deals that meet Maninos' investment criteria.

# YOUR TOOLS (Using Playwright for REAL web scraping)

1. **search_all_sources** - RECOMMENDED: Search MHVillage + MobileHome.net + get Zillow ARV
   - Use this for comprehensive searches
   - Returns combined results with ARV estimates

2. **scrape_facebook_marketplace** - PRIMARY source (owner-to-owner)
   - Facebook Marketplace is #1 for finding mobile homes
   - ALWAYS search this first
   - Automatically searches Houston + Dallas areas

3. **scrape_mhvillage** - Market value comparison source
   - https://www.mhvillage.com
   - Use for targeted searches and price comparison

4. **scrape_mobilehome_net** - Additional listings source
   - https://www.mobilehome.net
   - Use for cross-referencing

4. **get_zillow_arv** - Get market value estimates from Zillow
   - https://www.zillow.com
   - Use to calculate the 60% rule

5. **qualify_property** - Check qualification rules (Feb 2026)
   - 60% Rule: price <= market_value * 0.60  (renovation NOT included)
   - Price Range: $5,000 — $80,000
   - Zone: within 200mi of Houston OR Dallas
   - NO year filter (any age accepted)
   - Types: single wide + double wide accepted

6. **save_to_dashboard** - Save qualified properties to database
   - Only save properties that pass ALL rules
   - Dashboard should have active properties available

# WORKFLOW
1. Receive search request (city, price range)
2. Use search_all_sources OR individual scrapers
3. For each listing, calculate qualification using qualify_property
4. Save qualified properties with save_to_dashboard
5. Report results

# ZONE — WHERE TO SEARCH
Within 200 miles of Houston OR 200 miles of Dallas:
- Houston area (largest inventory): Houston, Pasadena, Baytown, League City, Pearland, Sugar Land, Katy, etc.
- Dallas area: Dallas, Fort Worth, Arlington, Plano, Garland, McKinney, Denton, etc.
- In-between: Waco, Temple, Killeen, Bryan/College Station, etc.
- Also OK: San Antonio, Austin, Beaumont, Tyler, etc. (within 200mi)
- NOT OK: El Paso (600+ mi), Amarillo (400+ mi), Lubbock (350+ mi)

# PRICE RANGE
$5,000 — $80,000 (purchase price range)
Buy at max 60% of market value (NOT 70%)
Renovation budget: $5K-$15K separately (NOT included in 60% calc)

# ⚠️ DOWN PAYMENT vs FULL PRICE (IMPORTANT for Facebook Marketplace)
Many Facebook Marketplace listings show the DOWN PAYMENT, not the full price.
Sellers often advertise "move in for $3,000" or "$500 down!" to attract buyers.
The scraper automatically detects this and marks listings with:
  - price_type: "full" = the price IS the asking price for the house
  - price_type: "down_payment" = the price is only the down payment / deposit
  - estimated_full_price: estimated total price if it's a down payment listing

RULES for down payment listings:
1. Do NOT use the down payment as listing_price for the 60% rule
2. If estimated_full_price is available, use THAT for qualification
3. If no estimated_full_price, skip the 60% qualification (mark as "needs price verification")
4. Always report whether a listing's price is full or down payment

# OUTPUT FORMAT
Always provide:
1. Number of listings found
2. Number of qualified listings
3. Summary of why properties passed/failed
4. List of qualified properties with scores
5. Flag any listings where price = down payment (not full price)
"""
    
    async def process(self, request: AgentRequest) -> AgentResponse:
        """
        Process a search request using real web scraping.
        """
        logger.info(f"[BuscadorAgent] Processing: {request.query}")
        
        if not self.llm:
            return self._error_response(
                "BuscadorAgent requires LLM (OPENAI_API_KEY not configured)."
            )
        
        try:
            # Build context
            context = request.context or {}
            
            # Get current dashboard count
            dashboard_count = await self._get_dashboard_count()
            context["current_dashboard_count"] = dashboard_count
            context["target_count"] = 10
            context["need_more"] = dashboard_count < 10
            
            # Call LLM with tools
            llm_with_tools = self.llm.bind_tools(self.tools)
            
            from langchain_core.messages import SystemMessage, HumanMessage
            
            messages = [
                SystemMessage(content=self.system_prompt),
                SystemMessage(content=f"Current context: {json.dumps(context)}"),
                HumanMessage(content=request.query),
            ]
            
            # Let LLM decide which tools to use
            response = await llm_with_tools.ainvoke(messages)
            
            # Process tool calls if any
            result = await self._process_tool_calls(response, messages, llm_with_tools)
            
            return self._success_response(
                result=result,
                confidence=0.85,
                suggestions=[
                    "Revisa las propiedades calificadas en el dashboard",
                    "Puedes filtrar por ciudad o rango de precio",
                    "Haz clic en 'Comprar' para iniciar el proceso de compra",
                ],
            )
            
        except Exception as e:
            logger.error(f"[BuscadorAgent] Error: {e}")
            return self._error_response(str(e))
        finally:
            # Clean up browser
            await BrowserManager.close()
    
    async def _process_tool_calls(self, response, messages, llm_with_tools, max_iterations=5):
        """Process tool calls from LLM response."""
        from langchain_core.messages import AIMessage, ToolMessage
        
        iteration = 0
        current_response = response
        
        while hasattr(current_response, 'tool_calls') and current_response.tool_calls and iteration < max_iterations:
            iteration += 1
            
            # Add AI message with tool calls
            messages.append(current_response)
            
            # Execute each tool call
            for tool_call in current_response.tool_calls:
                tool_name = tool_call["name"]
                tool_args = tool_call["args"]
                
                logger.info(f"[BuscadorAgent] Executing tool: {tool_name}")
                
                # Find and execute the tool
                tool_result = await self._execute_tool(tool_name, tool_args)
                
                # Add tool result message
                messages.append(ToolMessage(
                    content=json.dumps(tool_result) if not isinstance(tool_result, str) else tool_result,
                    tool_call_id=tool_call["id"],
                ))
            
            # Get next response
            current_response = await llm_with_tools.ainvoke(messages)
        
        # Return final content
        if hasattr(current_response, 'content'):
            return {"response": current_response.content, "iterations": iteration}
        return {"response": str(current_response), "iterations": iteration}
    
    async def _execute_tool(self, tool_name: str, args: dict) -> Any:
        """Execute a tool by name."""
        tool_map = {
            "scrape_mhvillage": scrape_mhvillage,
            "scrape_mobilehome_net": scrape_mobilehome_net,
            "get_zillow_arv": get_zillow_arv,
            "qualify_property": qualify_property,
            "save_to_dashboard": save_to_dashboard,
            "search_all_sources": search_all_sources,
        }
        
        tool = tool_map.get(tool_name)
        if not tool:
            return {"error": f"Tool {tool_name} not found"}
        
        try:
            # Check if tool is async
            if asyncio.iscoroutinefunction(tool.func):
                return await tool.ainvoke(args)
            else:
                return tool.invoke(args)
        except Exception as e:
            logger.error(f"Tool {tool_name} failed: {e}")
            return {"error": str(e)}
    
    async def _get_dashboard_count(self) -> int:
        """Get current count of qualified listings in dashboard."""
        try:
            async with httpx.AsyncClient() as client:
                response = await client.get(
                    f"{self.api_url}/api/market-listings/count",
                    timeout=5.0
                )
                if response.status_code == 200:
                    return response.json().get("count", 0)
        except Exception as e:
            logger.warning(f"Could not get dashboard count: {e}")
        return 0
    
    # ============================================
    # DIRECT METHODS (for programmatic access)
    # ============================================
    
    async def search_and_qualify(
        self,
        city: str = "Houston",
        min_price: float = 0,
        max_price: float = 80000,
    ) -> AgentResponse:
        """
        Direct method to search and qualify properties using real scraping.
        """
        query = f"""
Busca mobile homes en {city}, Texas:
- Rango de precio: ${min_price:,.0f} - ${max_price:,.0f}
- Usa search_all_sources para buscar en todos los sitios
- Aplica la regla del 60% y la zona (200mi Houston/Dallas)
- Guarda las calificadas en el dashboard
"""
        return await self.process(AgentRequest(
            query=query,
            context={
                "city": city,
                "min_price": min_price,
                "max_price": max_price,
            }
        ))
    
    async def replenish_dashboard(self) -> AgentResponse:
        """
        Auto-replenish dashboard when count < 10.
        Called automatically when a property is purchased.
        """
        query = """
El dashboard necesita más propiedades.
Busca en Houston, Dallas y Austin para encontrar propiedades calificadas
hasta tener 10 opciones en el dashboard.
Usa search_all_sources para cada ciudad.
"""
        return await self.process(AgentRequest(
            query=query,
            context={"trigger": "auto_replenish"}
        ))
