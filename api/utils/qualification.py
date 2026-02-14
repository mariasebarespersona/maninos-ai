"""
Maninos Property Qualification Rules — Single Source of Truth.

Updated Feb 2026 based on D1 Texas trip with Sebastian/Gabriel.

RULES:
1. 60% Rule: price <= market_value * 0.60  (renovation NOT included)
2. NO year filter  (removed — they buy any age)
3. Location: Within 200mi of Houston OR 200mi of Dallas
4. Price range: $5,000 — $80,000
5. Type: Single wide + Double wide accepted
6. State: Texas only

SELL RULE:
- Max 80% of market value

MARKET VALUE CALCULATION:
- Average of: Maninos historical sales + current web scraping average
- If historical data not available, use scraping average only
"""

import logging
import math
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)


# ============================================
# CONSTANTS (confirmed with Maninos D1 Feb 2026)
# ============================================

# Purchase filters
MIN_PRICE = 5_000
MAX_PRICE = 80_000
BUY_PERCENT = 0.60        # Max 60% of market value (NOT 70%)
SELL_PERCENT = 0.80        # Max 80% of market value for selling
RENOVATION_BUDGET_MIN = 5_000
RENOVATION_BUDGET_MAX = 15_000

# Zone centers — 200 mile radius from each
HOUSTON_CENTER = (29.7604, -95.3698)   # Houston, TX
DALLAS_CENTER = (32.7767, -96.7970)    # Dallas, TX
ZONE_RADIUS_MILES = 200

# Volume: ~20 houses/month buy, 16-20 sell, 200 active RTO clients
# Types: single wide = "casa de una sección" (80%), double wide = "casa doble" (20%)
# Vocabulary: mobile home = "casa móvil", manufactured = "casa manufacturada"

# Major Texas cities with approximate coordinates for distance calculation
TEXAS_CITY_COORDS = {
    "houston": (29.7604, -95.3698),
    "dallas": (32.7767, -96.7970),
    "san antonio": (29.4241, -98.4936),
    "austin": (30.2672, -97.7431),
    "fort worth": (32.7555, -97.3308),
    "el paso": (31.7619, -106.4850),
    "arlington": (32.7357, -97.1081),
    "corpus christi": (27.8006, -97.3964),
    "plano": (33.0198, -96.6989),
    "lubbock": (33.5779, -101.8552),
    "laredo": (27.5036, -99.5076),
    "irving": (32.8140, -96.9489),
    "garland": (32.9126, -96.6389),
    "amarillo": (35.2220, -101.8313),
    "grand prairie": (32.7460, -96.9978),
    "brownsville": (25.9017, -97.4975),
    "mckinney": (33.1972, -96.6397),
    "frisco": (33.1507, -96.8236),
    "pasadena": (29.6911, -95.2091),
    "killeen": (31.1171, -97.7278),
    "mesquite": (32.7668, -96.5992),
    "mcallen": (26.2034, -98.2300),
    "midland": (31.9973, -102.0779),
    "denton": (33.2148, -97.1331),
    "waco": (31.5493, -97.1467),
    "beaumont": (30.0802, -94.1266),
    "round rock": (30.5083, -97.6789),
    "tyler": (32.3513, -95.3011),
    "college station": (30.6280, -96.3344),
    "abilene": (32.4487, -99.7331),
    "temple": (31.0982, -97.3428),
    "pearland": (29.5636, -95.2860),
    "league city": (29.5075, -95.0950),
    "sugar land": (29.6197, -95.6349),
    "odessa": (31.8457, -102.3676),
    "conroe": (30.3119, -95.4560),
    "new braunfels": (29.7030, -98.1245),
    "spring": (30.0799, -95.4172),
    "katy": (29.7858, -95.8244),
    "baytown": (29.7355, -94.9774),
    "cedar park": (30.5052, -97.8203),
    "pflugerville": (30.4394, -97.6200),
    "galveston": (29.3013, -94.7977),
    "victoria": (28.8053, -96.9853),
    "lufkin": (31.3382, -94.7291),
    "nacogdoches": (31.6035, -94.6555),
    "wichita falls": (33.9137, -98.4934),
    "san marcos": (29.8833, -97.9414),
    "georgetown": (30.6333, -97.6781),
    "texas city": (29.3838, -94.9027),
    "mansfield": (32.5632, -97.1417),
    "bryan": (30.6744, -96.3700),
    "missouri city": (29.6186, -95.5377),
    "huntsville": (30.7235, -95.5508),
    "rosenberg": (29.5572, -95.8088),
    "la porte": (29.6658, -95.0194),
    "webster": (29.5377, -95.1183),
    "alvin": (29.4239, -95.2441),
    "cleburne": (32.3476, -97.3867),
    "seguin": (29.5688, -97.9647),
    "weatherford": (32.7593, -97.7972),
    "burleson": (32.5421, -97.3208),
    "lacy lakeview": (31.6310, -97.1039),
    "corsicana": (32.0954, -96.4689),
    "terrell": (32.7360, -96.2753),
    "copperas cove": (31.1240, -97.9031),
    "harlingen": (26.1906, -97.6961),
    "longview": (32.5007, -94.7405),
    "sherman": (33.6357, -96.6089),
    "palestine": (31.7621, -95.6308),
    "paris": (33.6609, -95.5555),
    "texarkana": (33.4418, -94.0477),
    "del rio": (29.3627, -100.8968),
    "eagle pass": (28.7091, -100.4995),
    "san angelo": (31.4638, -100.4370),
    "port arthur": (29.8850, -93.9399),
    "nederland": (29.9744, -93.9924),
    "orange": (30.0930, -93.7366),
    "silsbee": (30.3491, -94.1777),
    "jasper": (30.9202, -94.0016),
    "livingston": (30.7110, -94.9328),
    "brookshire": (29.7861, -95.9513),
    "hempstead": (30.0972, -96.0783),
    "brenham": (30.1669, -96.3978),
    "navasota": (30.3880, -96.0878),
    "madisonville": (30.9497, -95.9117),
    "crockett": (31.3185, -95.4566),
    "angleton": (29.1694, -95.4319),
    "bay city": (28.9828, -95.9694),
    "el campo": (29.1966, -96.2697),
    "wharton": (29.3116, -96.1027),
    "richmond": (29.5822, -95.7608),
    "cypress": (29.9691, -95.6970),
    "tomball": (30.0972, -95.6161),
    "magnolia": (30.2094, -95.7508),
    "willis": (30.4249, -95.4783),
    "montgomery": (30.3877, -95.6936),
    "the woodlands": (30.1658, -95.4613),
    "humble": (29.9988, -95.2622),
    "kingwood": (30.0391, -95.2522),
    "atascocita": (29.9938, -95.1769),
    "crosby": (29.9119, -95.0625),
    "dayton": (30.0466, -94.8853),
    "liberty": (30.0580, -94.7953),
    "cleveland": (30.3414, -95.0856),
    "san benito": (26.1326, -97.6311),
    "mercedes": (26.1498, -97.9139),
    "weslaco": (26.1596, -97.9908),
    "edinburg": (26.3017, -98.1634),
    "pharr": (26.1948, -98.1836),
    "mission": (26.2159, -98.3253),
    "roma": (26.4036, -99.0156),
}


# ============================================
# DISTANCE CALCULATION
# ============================================

def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in miles between two lat/lon points."""
    R = 3958.8  # Earth radius in miles
    
    lat1_r, lat2_r = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(lat1_r) * math.cos(lat2_r) * math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c


def is_within_zone(city: str, state: str = "TX") -> Tuple[bool, Optional[float]]:
    """
    Check if a city is within 200 miles of Houston OR Dallas.
    
    Returns: (passes, min_distance_miles)
    """
    if state.upper() not in ("TX", "TEXAS"):
        return False, None
    
    city_lower = city.lower().strip()
    coords = TEXAS_CITY_COORDS.get(city_lower)
    
    if not coords:
        # Unknown city in Texas — give benefit of the doubt
        # All our scrapers target TX, and most of TX is within 200mi of Houston or Dallas
        return True, None
    
    dist_houston = haversine_miles(coords[0], coords[1], HOUSTON_CENTER[0], HOUSTON_CENTER[1])
    dist_dallas = haversine_miles(coords[0], coords[1], DALLAS_CENTER[0], DALLAS_CENTER[1])
    min_dist = min(dist_houston, dist_dallas)
    
    return min_dist <= ZONE_RADIUS_MILES, round(min_dist, 1)


# ============================================
# QUALIFICATION — SINGLE SOURCE OF TRUTH
# ============================================

def qualify_listing(
    listing_price: float,
    market_value: float,
    city: str = "",
    state: str = "TX",
) -> dict:
    """
    Qualify a property using Maninos' rules (Feb 2026).
    
    Rules:
    1. 60% Rule: price <= market_value * 0.60 (no renovation in calc)
    2. NO year filter (removed)
    3. Location: within 200mi of Houston OR Dallas
    4. Price range: $5,000 — $80,000
    5. State: Texas only
    
    Returns dict with all qualification fields for DB storage.
    """
    reasons = []
    score = 0
    
    # Rule 1: 60% of market value (50 points)
    max_offer = market_value * BUY_PERCENT if market_value and market_value > 0 else 0
    if market_value and market_value > 0 and listing_price > 0:
        pct_of_market = (listing_price / market_value) * 100
        passes_price_rule = listing_price <= max_offer
        if passes_price_rule:
            reasons.append(f"✓ 60%: ${listing_price:,.0f} = {pct_of_market:.0f}% del mercado (≤60%)")
            score += 50
        else:
            reasons.append(f"✗ 60%: ${listing_price:,.0f} = {pct_of_market:.0f}% del mercado (>60%)")
    else:
        passes_price_rule = False
        pct_of_market = 0
        reasons.append(f"✗ 60%: Sin valor de mercado para comparar")
    
    # Rule 2: Price range $5K-$80K (20 points)
    passes_range = MIN_PRICE <= listing_price <= MAX_PRICE
    if passes_range:
        reasons.append(f"✓ Rango: ${listing_price:,.0f} (dentro de $5K-$80K)")
        score += 20
    else:
        reasons.append(f"✗ Rango: ${listing_price:,.0f} (fuera de $5K-$80K)")
    
    # Rule 3: Location — 200mi of Houston OR Dallas (30 points)
    passes_zone, min_distance = is_within_zone(city, state)
    if passes_zone:
        dist_str = f" ({min_distance}mi)" if min_distance is not None else ""
        reasons.append(f"✓ Zona: {city}, {state}{dist_str} (≤200mi Houston/Dallas)")
        score += 30
    else:
        dist_str = f" ({min_distance}mi)" if min_distance is not None else ""
        reasons.append(f"✗ Zona: {city}, {state}{dist_str} (>200mi de Houston y Dallas)")
    
    # Overall: must pass ALL rules
    is_qualified = passes_price_rule and passes_range and passes_zone
    
    return {
        "passes_60_rule": passes_price_rule,
        "passes_price_range": passes_range,
        "passes_zone_rule": passes_zone,
        "is_qualified": is_qualified,
        "qualification_score": score,
        "qualification_reasons": reasons,
        "max_offer_60_rule": round(max_offer, 2) if max_offer else None,
        "pct_of_market": round(pct_of_market, 1) if pct_of_market else None,
        "min_distance_miles": min_distance,
    }


# DB field mapping (for backward compatibility with existing columns)
def qualification_to_db_fields(q: dict) -> dict:
    """
    Convert qualification result to database column names.
    Maps new field names to existing DB columns for backward compat.
    """
    return {
        "passes_70_rule": q["passes_60_rule"],      # Column name kept for compat, logic is 60%
        "passes_age_rule": q["passes_price_range"],  # Repurposed: was year, now price range
        "passes_location_rule": q["passes_zone_rule"],
        "is_qualified": q["is_qualified"],
        "qualification_score": q["qualification_score"],
        "qualification_reasons": q["qualification_reasons"],
        "max_offer_70_rule": q["max_offer_60_rule"],  # Column name kept, value is 60%
    }


# ============================================
# SELL-PRICE CALCULATION (80% rule)
# ============================================

def calculate_market_value(
    scraping_avg: Optional[float] = None,
    historical_avg: Optional[float] = None,
) -> Optional[float]:
    """
    Calculate combined market value from two sources:
      1. Web scraping average (Zillow / MHVillage / etc.)
      2. Maninos historical sales average (from DB)

    If both are available → average of the two.
    If only one → use that one.
    If neither → None (cannot calculate).
    """
    values = [v for v in [scraping_avg, historical_avg] if v and v > 0]
    if not values:
        return None
    return round(sum(values) / len(values), 2)


def calculate_max_sell_price(market_value: float) -> float:
    """
    Max sale price = market_value × SELL_PERCENT (80%).
    """
    return round(market_value * SELL_PERCENT, 2)


def get_sell_price_recommendation(
    purchase_price: float,
    renovation_cost: float = 0.0,
    scraping_avg: Optional[float] = None,
    historical_avg: Optional[float] = None,
) -> dict:
    """
    Full sell-price recommendation with 80% rule + profit analysis.

    Returns a dict suitable for API response:
      - market_value: blended market value
      - market_value_sources: which sources contributed
      - max_sell_price_80: ceiling (80% of market)
      - total_investment: purchase + reno
      - recommended_price: min(investment * 1.2, 80% market)
      - profit_at_recommended: recommended - investment
      - roi_at_recommended: profit / investment * 100
      - passes_80_rule: True if recommended <= 80% market
      - warning: optional warning message
    """
    total_investment = purchase_price + renovation_cost

    # Sources
    sources = []
    if scraping_avg and scraping_avg > 0:
        sources.append({"source": "web_scraping", "value": round(scraping_avg, 2)})
    if historical_avg and historical_avg > 0:
        sources.append({"source": "maninos_historical", "value": round(historical_avg, 2)})

    market_value = calculate_market_value(scraping_avg, historical_avg)

    if market_value is None or market_value <= 0:
        return {
            "market_value": None,
            "market_value_sources": sources,
            "max_sell_price_80": None,
            "total_investment": round(total_investment, 2),
            "recommended_price": None,
            "profit_at_recommended": None,
            "roi_at_recommended": None,
            "passes_80_rule": False,
            "warning": "No se puede calcular: sin datos de valor de mercado. "
                       "Se necesita el promedio de ventas históricas o datos de scraping.",
        }

    max_sell = calculate_max_sell_price(market_value)

    # Recommended = target 20% ROI, but capped at 80% of market
    target_20_roi = round(total_investment * 1.20, 2)
    recommended = min(target_20_roi, max_sell)

    # If investment is too high, we may recommend at a loss — warn
    warning = None
    if recommended < total_investment:
        warning = (
            f"⚠️ La inversión total (${total_investment:,.0f}) es mayor que el máximo "
            f"de venta al 80% (${max_sell:,.0f}). Considere renegociar el precio de compra."
        )

    profit = round(recommended - total_investment, 2)
    roi = round((profit / total_investment) * 100, 1) if total_investment > 0 else 0

    return {
        "market_value": round(market_value, 2),
        "market_value_sources": sources,
        "max_sell_price_80": max_sell,
        "total_investment": round(total_investment, 2),
        "recommended_price": round(recommended, 2),
        "profit_at_recommended": profit,
        "roi_at_recommended": roi,
        "passes_80_rule": recommended <= max_sell,
        "warning": warning,
    }

