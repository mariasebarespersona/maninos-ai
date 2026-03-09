"""
Scrapers module — partner listing scrapers extracted from the former BuscadorAgent.

Only VMFHomesScraper and TwentyFirstMortgageScraper are kept here;
the other scrapers (MHVillage, MobileHome.net, MHBay, Facebook) were
removed along with BuscadorAgent.
"""

from api.services.scrapers.partner_scrapers import (
    ScrapedListing,
    VMFHomesScraper,
    TwentyFirstMortgageScraper,
)

__all__ = [
    "ScrapedListing",
    "VMFHomesScraper",
    "TwentyFirstMortgageScraper",
]
