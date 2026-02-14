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
    Diagnostic endpoint: attempt a SINGLE Facebook Marketplace scrape
    and return detailed results showing what the server sees.
    """
    import asyncio
    import random
    from api.agents.buscador.fb_auth import FacebookAuth
    
    diagnostics = {
        "step": "init",
        "cookies_loaded": 0,
        "authenticated": False,
        "url_navigated": "",
        "url_landed": "",
        "page_title": "",
        "redirected_to_login": False,
        "content_sample": "",
        "marketplace_links_found": 0,
        "html_links_found": 0,
        "listings_extracted": 0,
        "error": None,
    }
    
    try:
        # Step 1: Check cookies
        cookies = FacebookAuth.load_cookies()
        diagnostics["cookies_loaded"] = len(cookies)
        diagnostics["authenticated"] = FacebookAuth.is_authenticated()
        
        if not cookies:
            diagnostics["error"] = "No cookies available. Import cookies first."
            return diagnostics
        
        diagnostics["step"] = "launching_browser"
        
        # Step 2: Launch browser
        from playwright.async_api import async_playwright
        
        playwright = await async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
                  '--disable-gpu', '--disable-blink-features=AutomationControlled']
        )
        context = await browser.new_context(
            viewport={'width': 1920, 'height': 1080},
            user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale='en-US',
            timezone_id='America/Chicago',
        )
        await context.add_cookies(cookies)
        page = await context.new_page()
        
        # Anti-detection
        await page.add_init_script("""
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        """)
        
        diagnostics["step"] = "navigating"
        
        # Step 3: Navigate to a simple marketplace search
        test_url = "https://www.facebook.com/marketplace/houston/search?query=mobile%20home&minPrice=5000&maxPrice=80000&exact=false"
        diagnostics["url_navigated"] = test_url
        
        await page.goto(test_url, wait_until="domcontentloaded", timeout=30000)
        
        current_url = page.url
        page_title = await page.title()
        diagnostics["url_landed"] = current_url
        diagnostics["page_title"] = page_title
        diagnostics["step"] = "page_loaded"
        
        # Step 4: Check for redirect
        if "/login" in current_url or "checkpoint" in current_url:
            diagnostics["redirected_to_login"] = True
            diagnostics["error"] = f"Redirected to: {current_url}. Cookies may be expired."
        else:
            # Wait for content
            await asyncio.sleep(4)
            
            # Scroll
            for _ in range(2):
                await page.evaluate("window.scrollBy(0, window.innerHeight)")
                await asyncio.sleep(1.5)
            
            # Step 5: Get content sample
            content = await page.evaluate("document.body ? document.body.innerText.substring(0, 1000) : 'NO BODY'")
            diagnostics["content_sample"] = content[:500]
            
            # Step 6: Count links
            cards = await page.query_selector_all('a[href*="/marketplace/item/"]')
            diagnostics["marketplace_links_found"] = len(cards)
            
            # Also try HTML parsing
            html = await page.content()
            import re
            html_links = re.findall(r'/marketplace/item/\d+', html)
            diagnostics["html_links_found"] = len(set(html_links))
            
            diagnostics["step"] = "extraction_done"
            
            # Step 7: Parse a few listings
            if cards:
                sample_listings = []
                for card in cards[:3]:
                    try:
                        text = await card.inner_text()
                        href = await card.get_attribute("href")
                        sample_listings.append({"text": text[:200], "href": href})
                    except Exception:
                        pass
                diagnostics["sample_listings"] = sample_listings
                diagnostics["listings_extracted"] = len(cards)
        
        await browser.close()
        await playwright.stop()
        diagnostics["step"] = "complete"
        
    except Exception as e:
        diagnostics["error"] = f"{type(e).__name__}: {str(e)}"
        logger.error(f"[FB Test] Error: {e}", exc_info=True)
    
    return diagnostics

