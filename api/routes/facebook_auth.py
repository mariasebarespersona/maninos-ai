"""
Facebook Authentication Routes.

Endpoints for managing Facebook connection for Marketplace scraping.
"""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


class CookieImportRequest(BaseModel):
    """Request to import Facebook cookies from JSON."""
    cookies_json: str


class FacebookStatusResponse(BaseModel):
    """Facebook authentication status response."""
    authenticated: bool
    message: str
    last_login: Optional[str] = None


# ============================================
# GET /api/facebook/status
# ============================================

@router.get("/status")
async def get_facebook_status():
    """Check if Facebook is connected (cookies saved)."""
    from api.agents.buscador.fb_auth import FacebookAuth
    
    status = FacebookAuth.get_auth_status()
    return status


# ============================================
# POST /api/facebook/connect
# ============================================

@router.post("/connect")
async def connect_facebook():
    """
    Start interactive Facebook login (local only).
    On production servers, returns instructions to use cookie import instead.
    """
    import os
    from api.agents.buscador.fb_auth import FacebookAuth
    
    # On headless servers, guide user to cookie import
    if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("PORT"):
        return {
            "success": False,
            "message": "⚠️ El login interactivo no está disponible en el servidor. "
                       "Usa 'Importar Cookies' para conectar Facebook:\n\n"
                       "1. Instala la extensión 'Cookie-Editor' en Chrome\n"
                       "2. Abre Facebook e inicia sesión\n"
                       "3. Haz click en el icono de Cookie-Editor → Export → JSON\n"
                       "4. Pega el JSON en el campo 'Importar Cookies' de la app",
            "use_cookie_import": True,
        }
    
    try:
        logger.info("[FB Connect] Starting interactive Facebook login...")
        success = await FacebookAuth.interactive_login(timeout_seconds=180)
        
        if success:
            return {
                "success": True,
                "message": "✅ Facebook connected successfully! Marketplace scraping is now enabled.",
            }
        else:
            return {
                "success": False,
                "message": "⚠️ Login timeout. Please try again and complete the login within 3 minutes.",
            }
    except Exception as e:
        logger.error(f"[FB Connect] Error: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Error connecting to Facebook: {str(e)}"
        )


# ============================================
# POST /api/facebook/import-cookies
# ============================================

@router.post("/import-cookies")
async def import_facebook_cookies(request: CookieImportRequest):
    """
    Import Facebook cookies from a JSON string.
    
    The user can export cookies from their browser using extensions like:
    - Cookie-Editor (Chrome/Firefox)
    - EditThisCookie (Chrome)
    """
    from api.agents.buscador.fb_auth import FacebookAuth
    
    try:
        result = await FacebookAuth.import_cookies_from_json(request.cookies_json)
        
        if result.get("success"):
            return {
                "success": True,
                "message": f"✅ {result['message']}. Marketplace scraping is now enabled.",
            }
        else:
            raise HTTPException(
                status_code=400,
                detail=result.get("message", "Invalid cookies")
            )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[FB Import] Unexpected error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error importing cookies: {str(e)}"
        )


# ============================================
# POST /api/facebook/disconnect
# ============================================

@router.post("/disconnect")
async def disconnect_facebook():
    """Clear saved Facebook cookies."""
    from api.agents.buscador.fb_auth import FacebookAuth
    
    FacebookAuth.clear_cookies()
    return {
        "success": True,
        "message": "Facebook disconnected. Cookies cleared.",
    }


# ============================================
# POST /api/facebook/test-scrape
# ============================================

@router.post("/test-scrape")
async def test_facebook_scrape():
    """
    Diagnostic endpoint: test BOTH scraping methods (requests + playwright)
    and return detailed results.
    """
    import requests as req
    import re
    import random
    from api.agents.buscador.fb_auth import FacebookAuth
    from api.agents.buscador.fb_scraper import FacebookMarketplaceScraper, USER_AGENTS
    
    from api.agents.buscador.fb_scraper import PROXY_URL
    
    diagnostics = {
        "cookies_loaded": 0,
        "authenticated": False,
        "proxy_configured": bool(PROXY_URL),
        "proxy_hint": "Set RESIDENTIAL_PROXY_URL in Railway env vars. Facebook blocks datacenter IPs." if not PROXY_URL else f"Using: {PROXY_URL[:30]}...",
        "requests_method": {
            "status_code": 0,
            "final_url": "",
            "redirected_to_login": False,
            "html_length": 0,
            "marketplace_item_ids": 0,
            "listings_extracted": 0,
            "error": None,
        },
        "playwright_method": {
            "final_url": "",
            "page_title": "",
            "redirected_to_login": False,
            "marketplace_links": 0,
            "error": None,
        },
    }
    
    cookies = FacebookAuth.load_cookies()
    diagnostics["cookies_loaded"] = len(cookies)
    diagnostics["authenticated"] = FacebookAuth.is_authenticated()
    
    if not cookies:
        diagnostics["requests_method"]["error"] = "No cookies. Import first."
        diagnostics["playwright_method"]["error"] = "No cookies. Import first."
        return diagnostics
    
    # ── Test 1: HTTP Requests method ──
    try:
        session = req.Session()
        for c in cookies:
            session.cookies.set(c["name"], c["value"],
                domain=c.get("domain", ".facebook.com"),
                path=c.get("path", "/"))
        
        # Use proxy if configured
        if PROXY_URL:
            session.proxies = {"http": PROXY_URL, "https": PROXY_URL}
        
        ua = random.choice(USER_AGENTS)
        session.headers.update({
            "User-Agent": ua,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
            "Sec-Ch-Ua": '"Chromium";v="121", "Google Chrome";v="121"',
            "Sec-Ch-Ua-Mobile": "?0",
            "Sec-Ch-Ua-Platform": '"macOS"',
            "Sec-Fetch-Dest": "document",
            "Sec-Fetch-Mode": "navigate",
            "Sec-Fetch-Site": "none",
            "Sec-Fetch-User": "?1",
            "Upgrade-Insecure-Requests": "1",
        })
        
        test_url = "https://www.facebook.com/marketplace/houston/search?query=mobile%20home&minPrice=5000&maxPrice=80000&exact=false"
        
        response = session.get(test_url, allow_redirects=True, timeout=20)
        rm = diagnostics["requests_method"]
        rm["status_code"] = response.status_code
        rm["final_url"] = response.url[:200]
        rm["html_length"] = len(response.text)
        rm["redirected_to_login"] = "/login" in response.url
        
        # Count marketplace item IDs in the HTML
        item_ids = set(re.findall(r'/marketplace/item/(\d+)', response.text))
        rm["marketplace_item_ids"] = len(item_ids)
        
        # Try parsing listings
        listings = FacebookMarketplaceScraper._parse_from_html(response.text, "Houston")
        if not listings:
            listings = FacebookMarketplaceScraper._extract_json_from_html(response.text, "Houston")
        rm["listings_extracted"] = len(listings)
        
        if listings:
            rm["sample"] = [{"title": l.title[:80], "price": l.price, "url": l.url} for l in listings[:3]]
        
    except Exception as e:
        diagnostics["requests_method"]["error"] = f"{type(e).__name__}: {e}"
    
    # ── Test 2: Playwright method ──
    try:
        playwright, browser, context, page = await FacebookMarketplaceScraper._create_authenticated_page()
        
        test_url = "https://www.facebook.com/marketplace/houston/search?query=mobile%20home&minPrice=5000&maxPrice=80000&exact=false"
        await page.goto(test_url, wait_until="domcontentloaded", timeout=30000)
        
        pm = diagnostics["playwright_method"]
        pm["final_url"] = page.url[:200]
        pm["page_title"] = await page.title()
        pm["redirected_to_login"] = "/login" in page.url
        
        if not pm["redirected_to_login"]:
            import asyncio
            await asyncio.sleep(3)
            cards = await page.query_selector_all('a[href*="/marketplace/item/"]')
            pm["marketplace_links"] = len(cards)
        
        await browser.close()
        await playwright.stop()
        
    except Exception as e:
        diagnostics["playwright_method"]["error"] = f"{type(e).__name__}: {e}"
    
    return diagnostics

