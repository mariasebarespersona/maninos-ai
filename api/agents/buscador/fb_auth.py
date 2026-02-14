"""
Facebook Authentication Manager for Marketplace Scraping.

Facebook Marketplace REQUIRES authentication to view listings.
This module manages persistent browser sessions and cookie storage.

FLOW:
1. User clicks "Conectar Facebook" in the app
2. Backend starts a Playwright browser in headed mode
3. User logs into Facebook manually
4. Cookies are saved to data/fb_cookies.json
5. Future scraping requests load these cookies automatically

PRODUCTION NOTE:
For production/server deployment, consider using:
- Apify Facebook Marketplace Scraper ($49/mo)
- BrightData Marketplace Dataset API
- Cookie import from browser extension (e.g., EditThisCookie)
"""

import json
import os
import logging
import asyncio
from pathlib import Path
from datetime import datetime
from typing import Optional, List, Dict, Any

logger = logging.getLogger(__name__)

# Cookie storage path
COOKIE_FILE = Path(__file__).parent.parent.parent.parent / "data" / "fb_cookies.json"
BROWSER_STATE_DIR = Path(__file__).parent.parent.parent.parent / "data" / "fb_browser_state"


class FacebookAuth:
    """Manages Facebook authentication state for scraping."""
    
    @staticmethod
    def is_authenticated() -> bool:
        """Check if we have saved Facebook cookies."""
        if not COOKIE_FILE.exists():
            return False
        try:
            with open(COOKIE_FILE, "r") as f:
                data = json.load(f)
            # Handle both formats: raw list or wrapped dict
            if isinstance(data, dict):
                cookies = data.get("cookies", [])
            else:
                cookies = data
            # Check for essential FB session cookies
            fb_session_cookies = [
                c for c in cookies
                if "facebook.com" in c.get("domain", "")
                and c.get("name") in ["c_user", "xs", "datr", "sb"]
            ]
            return len(fb_session_cookies) >= 2
        except Exception:
            return False
    
    @staticmethod
    def get_auth_status() -> Dict[str, Any]:
        """Get detailed authentication status."""
        if not COOKIE_FILE.exists():
            return {
                "authenticated": False,
                "message": "No Facebook session found. Click 'Conectar Facebook' to log in.",
                "last_login": None,
            }
        
        try:
            with open(COOKIE_FILE, "r") as f:
                data = json.load(f)
            
            # Handle both formats: raw cookies array or wrapped with metadata
            if isinstance(data, dict):
                cookies = data.get("cookies", [])
                last_login = data.get("saved_at")
            else:
                cookies = data
                last_login = None
            
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
                    "message": "Facebook cookies expired. Please reconnect.",
                    "last_login": last_login,
                }
        except Exception as e:
            return {
                "authenticated": False,
                "message": f"Error reading cookies: {e}",
                "last_login": None,
            }
    
    @staticmethod
    def save_cookies(cookies: List[Dict[str, Any]]) -> bool:
        """Save Facebook cookies to file."""
        try:
            COOKIE_FILE.parent.mkdir(parents=True, exist_ok=True)
            data = {
                "cookies": cookies,
                "saved_at": datetime.now().isoformat(),
                "count": len(cookies),
            }
            with open(COOKIE_FILE, "w") as f:
                json.dump(data, f, indent=2)
            logger.info(f"[FB Auth] Saved {len(cookies)} cookies to {COOKIE_FILE}")
            return True
        except Exception as e:
            logger.error(f"[FB Auth] Error saving cookies: {e}")
            return False
    
    @staticmethod
    def load_cookies() -> List[Dict[str, Any]]:
        """Load saved Facebook cookies."""
        if not COOKIE_FILE.exists():
            return []
        try:
            with open(COOKIE_FILE, "r") as f:
                data = json.load(f)
            if isinstance(data, dict):
                return data.get("cookies", [])
            return data
        except Exception as e:
            logger.error(f"[FB Auth] Error loading cookies: {e}")
            return []
    
    @staticmethod
    def clear_cookies():
        """Clear saved Facebook cookies."""
        if COOKIE_FILE.exists():
            COOKIE_FILE.unlink()
            logger.info("[FB Auth] Cookies cleared")
    
    @staticmethod
    async def interactive_login(timeout_seconds: int = 120) -> bool:
        """
        Open a headed browser for the user to log into Facebook.
        
        This opens a VISIBLE browser window where the user manually
        logs into their Facebook account. Once logged in, cookies are saved.
        
        Args:
            timeout_seconds: Max time to wait for login (default 2 minutes)
            
        Returns:
            True if login was successful, False otherwise
        """
        from playwright.async_api import async_playwright
        
        logger.info("[FB Auth] Starting interactive Facebook login...")
        
        playwright = None
        browser = None
        
        try:
            playwright = await async_playwright().start()
            
            # Launch a VISIBLE (headed) browser
            browser = await playwright.chromium.launch(
                headless=False,  # VISIBLE - user needs to interact
                args=[
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1200,800',
                ]
            )
            
            context = await browser.new_context(
                viewport={'width': 1200, 'height': 800},
                user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            )
            
            page = await context.new_page()
            
            # Navigate to Facebook login
            await page.goto("https://www.facebook.com/login", wait_until="domcontentloaded")
            
            logger.info("[FB Auth] Waiting for user to log in...")
            logger.info(f"[FB Auth] You have {timeout_seconds} seconds to complete login")
            
            # Wait for the user to be redirected to Facebook home (indicates successful login)
            # Check periodically for the c_user cookie which indicates login
            start_time = asyncio.get_event_loop().time()
            logged_in = False
            
            while (asyncio.get_event_loop().time() - start_time) < timeout_seconds:
                await asyncio.sleep(3)
                
                cookies = await context.cookies()
                fb_cookies = [c for c in cookies if "facebook.com" in c.get("domain", "")]
                c_user = [c for c in fb_cookies if c.get("name") == "c_user"]
                
                if c_user:
                    logged_in = True
                    logger.info("[FB Auth] ✅ Login detected! Saving cookies...")
                    break
                
                # Also check URL - if we're on the main FB page
                current_url = page.url
                if "facebook.com" in current_url and "/login" not in current_url and "checkpoint" not in current_url:
                    cookies = await context.cookies()
                    c_user = [c for c in cookies if c.get("name") == "c_user"]
                    if c_user:
                        logged_in = True
                        break
            
            if logged_in:
                # Save all cookies
                all_cookies = await context.cookies()
                FacebookAuth.save_cookies(all_cookies)
                
                # Quick test: navigate to marketplace
                await page.goto("https://www.facebook.com/marketplace", wait_until="domcontentloaded")
                await asyncio.sleep(2)
                
                logger.info("[FB Auth] ✅ Successfully logged in and cookies saved!")
                return True
            else:
                logger.warning("[FB Auth] ⚠️ Login timeout - user did not complete login")
                return False
                
        except Exception as e:
            logger.error(f"[FB Auth] Error during interactive login: {e}")
            return False
        finally:
            if browser:
                await browser.close()
            if playwright:
                await playwright.stop()
    
    @staticmethod
    async def import_cookies_from_json(cookies_json: str) -> bool:
        """
        Import cookies from a JSON string.
        
        This is useful when the user exports cookies from their browser
        using an extension like EditThisCookie or Cookie-Editor.
        
        Args:
            cookies_json: JSON string of cookies array
            
        Returns:
            True if import was successful
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
            normalized = []
            for c in fb_cookies:
                cookie = {
                    "name": c.get("name", ""),
                    "value": c.get("value", ""),
                    "domain": c.get("domain", ".facebook.com"),
                    "path": c.get("path", "/"),
                }
                # Optional fields
                if c.get("expires"):
                    cookie["expires"] = c["expires"]
                if c.get("httpOnly") is not None:
                    cookie["httpOnly"] = c["httpOnly"]
                if c.get("secure") is not None:
                    cookie["secure"] = c["secure"]
                if c.get("sameSite"):
                    cookie["sameSite"] = c["sameSite"]
                normalized.append(cookie)
            
            return FacebookAuth.save_cookies(normalized)
            
        except json.JSONDecodeError as e:
            logger.error(f"[FB Auth] Invalid JSON: {e}")
            return False

