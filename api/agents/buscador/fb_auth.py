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

# Supabase DB table for persistent config
_SYSTEM_CONFIG_TABLE = "system_config"


def _get_sb():
    """Lazy import to avoid circular imports."""
    from tools.supabase_client import sb
    return sb


class FacebookAuth:
    """Manages Facebook authentication state for scraping."""
    
    # ── Cookie Storage (Supabase + local fallback) ──────────────────────
    
    @staticmethod
    def save_cookies(cookies: List[Dict[str, Any]]) -> bool:
        """Save Facebook cookies to Supabase DB (system_config table) + local fallback."""
        data = {
            "cookies": cookies,
            "saved_at": datetime.now().isoformat(),
            "count": len(cookies),
        }
        
        # Save to Supabase DB (system_config table) — persists across deploys
        try:
            sb = _get_sb()
            sb.table("system_config").upsert({
                "key": "fb_cookies",
                "value": json.dumps(data),
                "updated_at": datetime.now().isoformat(),
            }, on_conflict="key").execute()
            logger.info(f"[FB Auth] ✅ Saved {len(cookies)} cookies to Supabase DB")
        except Exception as e:
            logger.warning(f"[FB Auth] Supabase DB save failed: {e}")
        
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
        """Load saved Facebook cookies from Supabase DB (+ local fallback)."""
        # Try Supabase DB first (persists across deploys)
        try:
            sb = _get_sb()
            res = sb.table("system_config").select("value").eq("key", "fb_cookies").single().execute()
            if res.data and res.data.get("value"):
                data = json.loads(res.data["value"])
                if isinstance(data, dict):
                    cookies = data.get("cookies", [])
                else:
                    cookies = data
                if cookies:
                    logger.info(f"[FB Auth] Loaded {len(cookies)} cookies from Supabase DB")
                    return FacebookAuth._normalize_same_site(cookies)
        except Exception as e:
            logger.debug(f"[FB Auth] Supabase DB load failed: {e}")
        
        # Fallback to local file
        if COOKIE_FILE.exists():
            try:
                with open(COOKIE_FILE, "r") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    cookies = data.get("cookies", [])
                else:
                    cookies = data
                if cookies:
                    logger.info(f"[FB Auth] Loaded {len(cookies)} cookies from local file")
                    return FacebookAuth._normalize_same_site(cookies)
            except Exception as e:
                logger.error(f"[FB Auth] Error loading local cookies: {e}")
        
        return []
    
    @staticmethod
    def _load_raw_data() -> Optional[Dict[str, Any]]:
        """Load raw cookie data (with metadata) for status checks."""
        # Try Supabase DB first
        try:
            sb = _get_sb()
            res = sb.table("system_config").select("value").eq("key", "fb_cookies").single().execute()
            if res.data and res.data.get("value"):
                data = json.loads(res.data["value"])
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
        # Clear from Supabase DB
        try:
            sb = _get_sb()
            sb.table("system_config").delete().eq("key", "fb_cookies").execute()
            logger.info("[FB Auth] Cookies cleared from Supabase DB")
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
    
    # ── Auto-Login with Playwright ──────────────────────────────────────

    @staticmethod
    async def auto_login() -> bool:
        """
        Automatically log into Facebook using Playwright and save cookies.

        Uses FB_EMAIL and FB_PASSWORD env vars. Gabriel sets these ONCE
        and the system auto-renews cookies when they expire.

        Returns True if login succeeded and cookies were saved.
        """
        fb_email = os.environ.get("FB_EMAIL", "")
        fb_password = os.environ.get("FB_PASSWORD", "")

        if not fb_email or not fb_password:
            logger.warning("[FB Auth] No FB_EMAIL/FB_PASSWORD env vars — cannot auto-login")
            return False

        logger.info(f"[FB Auth] Auto-login starting for {fb_email}...")

        try:
            from playwright.async_api import async_playwright

            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                    viewport={"width": 1280, "height": 720},
                )
                page = await context.new_page()

                # Navigate to Facebook login
                await page.goto("https://www.facebook.com/login", wait_until="domcontentloaded", timeout=30000)
                await page.wait_for_timeout(2000)

                # Fill login form
                await page.fill('input[name="email"]', fb_email)
                await page.fill('input[name="pass"]', fb_password)
                await page.click('button[name="login"]')

                # Wait for login to complete
                await page.wait_for_timeout(5000)

                # Check if login succeeded (redirected away from /login)
                current_url = page.url
                if "/login" in current_url or "/checkpoint" in current_url:
                    logger.error(f"[FB Auth] Auto-login failed — still on {current_url}")
                    await browser.close()
                    return False

                # Extract cookies from browser
                cookies = await context.cookies()
                fb_cookies = [
                    {
                        "name": c["name"],
                        "value": c["value"],
                        "domain": c["domain"],
                        "path": c["path"],
                        "httpOnly": c.get("httpOnly", False),
                        "secure": c.get("secure", False),
                        "sameSite": c.get("sameSite", "Lax"),
                    }
                    for c in cookies
                    if "facebook.com" in c.get("domain", "")
                ]

                if len(fb_cookies) < 3:
                    logger.error(f"[FB Auth] Auto-login: only {len(fb_cookies)} cookies — likely failed")
                    await browser.close()
                    return False

                # Save cookies
                FacebookAuth.save_cookies(fb_cookies)
                logger.info(f"[FB Auth] ✅ Auto-login successful — saved {len(fb_cookies)} cookies")

                await browser.close()
                return True

        except Exception as e:
            logger.error(f"[FB Auth] Auto-login error: {e}")
            return False

    @staticmethod
    async def ensure_authenticated() -> bool:
        """
        Ensure Facebook is authenticated. If cookies expired, try auto-login.
        Returns True if authenticated (either existing cookies or auto-login worked).
        """
        if FacebookAuth.is_authenticated():
            # Verify cookies still work by making a test request
            try:
                import requests
                cookies = FacebookAuth.load_cookies()
                session = requests.Session()
                for c in cookies:
                    session.cookies.set(c["name"], c["value"], domain=c.get("domain", ".facebook.com"))

                resp = session.get("https://www.facebook.com/marketplace/",
                    headers={"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"},
                    allow_redirects=False, timeout=10)

                if resp.status_code == 200 or (resp.status_code == 302 and "/login" not in resp.headers.get("Location", "")):
                    return True  # Cookies still valid

                logger.info("[FB Auth] Cookies expired (redirected to login) — trying auto-login")
            except Exception as e:
                logger.warning(f"[FB Auth] Cookie validation failed: {e}")

        # Try auto-login
        return await FacebookAuth.auto_login()

    # ── Cookie Import ───────────────────────────────────────────────────
    
    @staticmethod
    async def import_cookies_from_json(cookies_json: str) -> dict:
        """
        Import cookies from a JSON string exported from browser extension.
        
        Returns dict with 'success' bool and 'message' string for detailed feedback.
        """
        try:
            logger.info(f"[FB Auth] Importing cookies, input length: {len(cookies_json)} chars")
            logger.info(f"[FB Auth] Input preview: {cookies_json[:200]}...")
            
            cookies = json.loads(cookies_json)
            
            if not isinstance(cookies, list):
                msg = f"Expected a JSON array [...], got {type(cookies).__name__}"
                logger.error(f"[FB Auth] {msg}")
                return {"success": False, "message": msg}
            
            logger.info(f"[FB Auth] Parsed {len(cookies)} total cookies")
            
            # Log all domains found
            domains = set(c.get("domain", "???") for c in cookies)
            logger.info(f"[FB Auth] Domains in export: {domains}")
            
            # Filter for Facebook cookies only
            fb_cookies = [c for c in cookies if "facebook" in c.get("domain", "").lower()]
            
            if not fb_cookies:
                msg = f"No Facebook cookies found. Domains: {domains}. Make sure you export cookies from facebook.com"
                logger.error(f"[FB Auth] {msg}")
                return {"success": False, "message": msg}
            
            logger.info(f"[FB Auth] Found {len(fb_cookies)} Facebook cookies")
            
            # Normalize cookie format for Playwright
            SAME_SITE_MAP = {
                "strict": "Strict", "lax": "Lax", "none": "None",
                "no_restriction": "None", "unspecified": "Lax",
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
                
                raw_same_site = c.get("sameSite", "Lax")
                if isinstance(raw_same_site, str):
                    cookie["sameSite"] = SAME_SITE_MAP.get(raw_same_site.lower(), "Lax")
                else:
                    cookie["sameSite"] = "Lax"
                
                normalized.append(cookie)
            
            # Check essential session cookies
            cookie_names = {c["name"] for c in normalized}
            essential = cookie_names & {"c_user", "xs", "datr", "sb"}
            logger.info(f"[FB Auth] Cookie names: {cookie_names}")
            logger.info(f"[FB Auth] Essential session cookies found: {essential}")
            
            if len(essential) < 2:
                logger.warning(f"[FB Auth] Only {len(essential)} essential cookies — may not authenticate")
            
            saved = FacebookAuth.save_cookies(normalized)
            logger.info(f"[FB Auth] ✅ Saved {len(normalized)} cookies successfully")
            return {"success": True, "message": f"Imported {len(normalized)} Facebook cookies ({len(essential)} session cookies)"}
            
        except json.JSONDecodeError as e:
            msg = f"Invalid JSON format: {e}"
            logger.error(f"[FB Auth] {msg}")
            return {"success": False, "message": msg}
        except Exception as e:
            msg = f"Unexpected error: {type(e).__name__}: {e}"
            logger.error(f"[FB Auth] {msg}", exc_info=True)
            return {"success": False, "message": msg}
    
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
