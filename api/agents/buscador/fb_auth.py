"""
Facebook Authentication Manager for Marketplace Scraping.

Facebook Marketplace REQUIRES authentication to view listings.
This module manages persistent browser sessions and cookie storage.

STORAGE: Cookies are stored in Supabase Storage (bucket: property-docs,
path: system/fb_cookies.json) so they persist across Railway redeployments.
Fallback: local file data/fb_cookies.json for local development.

PRODUCTION FLOW:
1. User logs into Facebook in their own browser
2. Exports cookies using Cookie-Editor extension (Chrome/Firefox)
3. Pastes the JSON into the "Importar Cookies" form in the app
4. Cookies are saved to Supabase and used for all scraping
"""

import json
import os
import logging
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Local fallback path
COOKIE_FILE = Path(__file__).parent.parent.parent.parent / "data" / "fb_cookies.json"

# Supabase storage config
_SUPABASE_BUCKET = os.getenv("SUPABASE_BUCKET", "property-docs")
_SUPABASE_COOKIE_PATH = "system/fb_cookies.json"


def _get_sb():
    """Lazy import to avoid circular imports."""
    from tools.supabase_client import sb
    return sb


class FacebookAuth:
    """Manages Facebook authentication state for scraping."""
    
    # ── Cookie Storage (Supabase + local fallback) ──────────────────────
    
    @staticmethod
    def save_cookies(cookies: List[Dict[str, Any]]) -> bool:
        """Save Facebook cookies to Supabase Storage (+ local fallback)."""
        data = {
            "cookies": cookies,
            "saved_at": datetime.now().isoformat(),
            "count": len(cookies),
        }
        json_bytes = json.dumps(data, indent=2).encode("utf-8")
        
        # Save to Supabase Storage
        try:
            sb = _get_sb()
            # Try to remove old file first (upsert)
            try:
                sb.storage.from_(_SUPABASE_BUCKET).remove([_SUPABASE_COOKIE_PATH])
            except Exception:
                pass
            sb.storage.from_(_SUPABASE_BUCKET).upload(
                _SUPABASE_COOKIE_PATH,
                json_bytes,
                {"content-type": "application/json"},
            )
            logger.info(f"[FB Auth] Saved {len(cookies)} cookies to Supabase Storage")
        except Exception as e:
            logger.warning(f"[FB Auth] Supabase Storage save failed: {e}")
        
        # Also save locally as fallback
        try:
            COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(COOKIE_FILE, "w") as f:
                json.dump(data, f, indent=2)
        except Exception:
            pass
        
        return True
    
    @staticmethod
    def _normalize_same_site(cookies: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Normalize sameSite values for Playwright compatibility."""
        SAME_SITE_MAP = {
            "strict": "Strict", "lax": "Lax", "none": "None",
            "no_restriction": "None", "unspecified": "Lax",
        }
        for c in cookies:
            raw = c.get("sameSite", "Lax")
            if isinstance(raw, str):
                c["sameSite"] = SAME_SITE_MAP.get(raw.lower(), "Lax")
            else:
                c["sameSite"] = "Lax"
        return cookies
    
    @staticmethod
    def load_cookies() -> List[Dict[str, Any]]:
        """Load saved Facebook cookies from Supabase Storage (+ local fallback)."""
        # Try Supabase Storage first
        try:
            sb = _get_sb()
            res = sb.storage.from_(_SUPABASE_BUCKET).download(_SUPABASE_COOKIE_PATH)
            if res:
                data = json.loads(res)
                if isinstance(data, dict):
                    cookies = data.get("cookies", [])
                else:
                    cookies = data
                if cookies:
                    logger.info(f"[FB Auth] Loaded {len(cookies)} cookies from Supabase Storage")
                    return FacebookAuth._normalize_same_site(cookies)
        except Exception as e:
            logger.debug(f"[FB Auth] Supabase Storage load failed: {e}")
        
        # Fallback to local file
        if COOKIE_FILE.exists():
            try:
                with open(COOKIE_FILE, "r") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    cookies = data.get("cookies", [])
                else:
                    cookies = data
                return FacebookAuth._normalize_same_site(cookies)
            except Exception as e:
                logger.error(f"[FB Auth] Error loading local cookies: {e}")
        
        return []
    
    @staticmethod
    def _load_raw_data() -> Optional[Dict[str, Any]]:
        """Load raw cookie data (with metadata) for status checks."""
        # Try Supabase first
        try:
            sb = _get_sb()
            res = sb.storage.from_(_SUPABASE_BUCKET).download(_SUPABASE_COOKIE_PATH)
            if res:
                data = json.loads(res)
                if isinstance(data, dict):
                    return data
                return {"cookies": data}
        except Exception:
            pass
        
        # Fallback to local
        if COOKIE_FILE.exists():
            try:
                with open(COOKIE_FILE, "r") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    return data
                return {"cookies": data}
            except Exception:
                pass
        
        return None
    
    @staticmethod
    def clear_cookies():
        """Clear saved Facebook cookies from both storages."""
        # Clear from Supabase
        try:
            sb = _get_sb()
            sb.storage.from_(_SUPABASE_BUCKET).remove([_SUPABASE_COOKIE_PATH])
            logger.info("[FB Auth] Cookies cleared from Supabase Storage")
        except Exception as e:
            logger.debug(f"[FB Auth] Supabase clear failed: {e}")
        
        # Clear local
        if COOKIE_FILE.exists():
            COOKIE_FILE.unlink()
            logger.info("[FB Auth] Local cookies cleared")
    
    # ── Authentication Status ───────────────────────────────────────────
    
    @staticmethod
    def is_authenticated() -> bool:
        """Check if we have valid Facebook cookies."""
        cookies = FacebookAuth.load_cookies()
        if not cookies:
            return False
        fb_session_cookies = [
            c for c in cookies
            if "facebook.com" in c.get("domain", "")
            and c.get("name") in ["c_user", "xs", "datr", "sb"]
        ]
        return len(fb_session_cookies) >= 2
    
    @staticmethod
    def get_auth_status() -> Dict[str, Any]:
        """Get detailed authentication status."""
        data = FacebookAuth._load_raw_data()
        
        if not data:
            return {
                "authenticated": False,
                "message": "No Facebook session found. Import cookies to connect.",
                "last_login": None,
            }
        
        cookies = data.get("cookies", [])
        last_login = data.get("saved_at")
        
        fb_cookies = [
            c for c in cookies
            if "facebook.com" in c.get("domain", "")
        ]
        session_cookies = [
            c.get("name") for c in fb_cookies
            if c.get("name") in ["c_user", "xs", "datr", "sb"]
        ]
        
        if len(session_cookies) >= 2:
            return {
                "authenticated": True,
                "message": "Facebook connected ✓",
                "last_login": last_login,
                "cookies_count": len(fb_cookies),
                "session_cookies": session_cookies,
            }
        else:
            return {
                "authenticated": False,
                "message": "Facebook cookies expired. Please re-import fresh cookies.",
                "last_login": last_login,
            }
    
    # ── Cookie Import ───────────────────────────────────────────────────
    
    @staticmethod
    async def import_cookies_from_json(cookies_json: str) -> bool:
        """
        Import cookies from a JSON string exported from browser extension.
        
        Steps for user:
        1. Install "Cookie-Editor" extension in Chrome/Firefox
        2. Log into Facebook in the browser
        3. Click Cookie-Editor icon → Export → Copy as JSON
        4. Paste the JSON into the import form in the app
        """
        try:
            cookies = json.loads(cookies_json)
            if not isinstance(cookies, list):
                logger.error("[FB Auth] Invalid cookies format - expected a JSON array")
                return False
            
            # Filter for Facebook cookies only
            fb_cookies = [c for c in cookies if "facebook" in c.get("domain", "").lower()]
            
            if not fb_cookies:
                logger.error("[FB Auth] No Facebook cookies found in import")
                return False
            
            # Normalize cookie format for Playwright
            # Playwright requires sameSite to be exactly "Strict", "Lax", or "None"
            SAME_SITE_MAP = {
                "strict": "Strict",
                "lax": "Lax",
                "none": "None",
                "no_restriction": "None",  # Cookie-Editor uses this
                "unspecified": "Lax",      # Default to Lax if unspecified
            }
            
            normalized = []
            for c in fb_cookies:
                cookie = {
                    "name": c.get("name", ""),
                    "value": c.get("value", ""),
                    "domain": c.get("domain", ".facebook.com"),
                    "path": c.get("path", "/"),
                }
                if c.get("expires"):
                    cookie["expires"] = c["expires"]
                if c.get("expirationDate"):
                    cookie["expires"] = c["expirationDate"]
                if c.get("httpOnly") is not None:
                    cookie["httpOnly"] = c["httpOnly"]
                if c.get("secure") is not None:
                    cookie["secure"] = c["secure"]
                
                # Normalize sameSite for Playwright compatibility
                raw_same_site = c.get("sameSite", "Lax")
                if isinstance(raw_same_site, str):
                    cookie["sameSite"] = SAME_SITE_MAP.get(raw_same_site.lower(), "Lax")
                else:
                    cookie["sameSite"] = "Lax"
                
                normalized.append(cookie)
            
            # Check we got the essential session cookies
            essential = {c["name"] for c in normalized} & {"c_user", "xs", "datr", "sb"}
            if len(essential) < 2:
                logger.warning(f"[FB Auth] Only found {essential} session cookies — may not be enough")
            
            return FacebookAuth.save_cookies(normalized)
            
        except json.JSONDecodeError as e:
            logger.error(f"[FB Auth] Invalid JSON: {e}")
            return False
    
    # ── Interactive Login (LOCAL ONLY) ──────────────────────────────────
    
    @staticmethod
    async def interactive_login(timeout_seconds: int = 120) -> bool:
        """
        Open a headed browser for the user to log into Facebook.
        ONLY works locally — will fail on headless servers (Railway, etc.)
        """
        try:
            from playwright.async_api import async_playwright
        except ImportError:
            logger.error("[FB Auth] Playwright not installed")
            return False
        
        # Detect headless environment
        if os.environ.get("RAILWAY_ENVIRONMENT") or os.environ.get("PORT"):
            logger.error("[FB Auth] Interactive login not available on server. Use cookie import instead.")
            return False
        
        logger.info("[FB Auth] Starting interactive Facebook login...")
        
        playwright = None
        browser = None
        
        try:
            playwright = await async_playwright().start()
            browser = await playwright.chromium.launch(
                headless=False,
                args=['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1200,800']
            )
            
            context = await browser.new_context(
                viewport={'width': 1200, 'height': 800},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            )
            
            page = await context.new_page()
            await page.goto("https://www.facebook.com/login", wait_until="domcontentloaded")
            
            logger.info(f"[FB Auth] Waiting for user to log in ({timeout_seconds}s timeout)...")
            
            start_time = asyncio.get_event_loop().time()
            logged_in = False
            
            while (asyncio.get_event_loop().time() - start_time) < timeout_seconds:
                await asyncio.sleep(3)
                cookies = await context.cookies()
                c_user = [c for c in cookies if c.get("name") == "c_user" and "facebook.com" in c.get("domain", "")]
                if c_user:
                    logged_in = True
                    break
            
            if logged_in:
                all_cookies = await context.cookies()
                FacebookAuth.save_cookies(all_cookies)
                logger.info("[FB Auth] ✅ Successfully logged in and cookies saved!")
                return True
            else:
                logger.warning("[FB Auth] ⚠️ Login timeout")
                return False
                
        except Exception as e:
            logger.error(f"[FB Auth] Error during interactive login: {e}")
            return False
        finally:
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
