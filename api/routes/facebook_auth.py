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
    Start interactive Facebook login.
    
    This opens a VISIBLE browser window on the server where the user
    must log into their Facebook account. Cookies are saved for future use.
    
    NOTE: This only works when running locally (not on a headless server).
    For production, use the /import-cookies endpoint instead.
    """
    from api.agents.buscador.fb_auth import FacebookAuth
    
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
    
    Steps:
    1. Log into Facebook in your browser
    2. Use a cookie export extension to export cookies as JSON
    3. Paste the JSON here
    """
    from api.agents.buscador.fb_auth import FacebookAuth
    
    try:
        success = await FacebookAuth.import_cookies_from_json(request.cookies_json)
        
        if success:
            return {
                "success": True,
                "message": "✅ Facebook cookies imported! Marketplace scraping is now enabled.",
            }
        else:
            raise HTTPException(
                status_code=400,
                detail="Invalid cookies. Make sure you exported Facebook cookies as JSON."
            )
    except HTTPException:
        raise
    except Exception as e:
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

