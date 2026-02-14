"""
BuscadorAgent - Intelligent Mobile Home Finder.

Uses Playwright for real web scraping from:
- MHVillage.com (primary)
- MobileHome.net (secondary)  
- Zillow.com (for ARV)

Applies 3 rules:
1. 70% Rule
2. Age >= 1995
3. Location = Texas
"""

from .agent import BuscadorAgent
from .scraper import (
    MHVillageScraper,
    MobileHomeNetScraper,
    ZillowScraper,
    MobileHomeScraper,
    BrowserManager,
)

__all__ = [
    "BuscadorAgent",
    "MHVillageScraper",
    "MobileHomeNetScraper",
    "ZillowScraper",
    "MobileHomeScraper",
    "BrowserManager",
]
