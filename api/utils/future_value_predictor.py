"""
Future Value Predictor for Mobile Homes
Predicts what a mobile home will be worth at the end of an RTO term.
Uses the same historical data and KNN approach as price_predictor.py.
"""

import math
import logging
from typing import Optional, Dict, Any
from api.utils.price_predictor import _load_data, compute_similarity, classify_home_type, estimate_sqft_from_listing

logger = logging.getLogger(__name__)

# Mobile homes depreciate ~3-5% annually after renovation
DEFAULT_ANNUAL_DEPRECIATION = 0.035  # 3.5%


def predict_future_value(
    sale_price: float,
    term_months: int,
    sqft: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    home_type: Optional[str] = None,
    annual_depreciation: float = DEFAULT_ANNUAL_DEPRECIATION,
    k: int = 8,
) -> Dict[str, Any]:
    """
    Predict the market value of a mobile home at the end of an RTO term.

    Uses KNN to find comparable homes and their sale prices as "current market value",
    then applies depreciation over the term.
    """
    data = _load_data()

    if not home_type:
        home_type = classify_home_type(sqft, bedrooms, "")
    est_sqft = estimate_sqft_from_listing(sqft, bedrooms, home_type)

    # Use sale_price as the reference for similarity (since house is already priced for sale)
    listing_features = {
        'tipo': home_type,
        'sqft': est_sqft,
        'cuartos': bedrooms,
        'banos': bathrooms,
        'precio_lista': sale_price,
    }

    # Find K nearest neighbors
    if data:
        scored = [(compute_similarity(listing_features, h), h) for h in data]
        scored.sort(key=lambda x: -x[0])
        relevant = [(s, h) for s, h in scored[:k] if s >= 0.3]
        if not relevant:
            relevant = scored[:3]

        total_weight = sum(s for s, _ in relevant)
        if total_weight == 0:
            total_weight = 1

        current_market_value = sum(s * h['precio_venta'] for s, h in relevant) / total_weight

        # Confidence
        avg_sim = sum(s for s, _ in relevant) / len(relevant)
        n_high = sum(1 for s, _ in relevant if s >= 0.65)
        if n_high >= 3 and avg_sim >= 0.6:
            confidence = "alta"
        elif n_high >= 1 and avg_sim >= 0.45:
            confidence = "media"
        else:
            confidence = "baja"

        similar_houses = [
            {
                "id": h['id'], "tipo": h['tipo'], "sqft": h.get('sqft'),
                "cuartos": h.get('cuartos'), "precio_venta": h['precio_venta'],
                "similitud": round(s * 100),
            }
            for s, h in relevant[:5]
        ]
    else:
        current_market_value = sale_price
        confidence = "sin_datos"
        similar_houses = []

    # Apply depreciation
    years = term_months / 12
    total_depreciation_pct = 1 - (1 - annual_depreciation) ** years
    future_value = current_market_value * (1 - annual_depreciation) ** years

    return {
        "current_market_value": round(current_market_value, 0),
        "future_value": round(future_value, 0),
        "annual_depreciation_rate": annual_depreciation,
        "term_months": term_months,
        "total_depreciation_pct": round(total_depreciation_pct * 100, 1),
        "confidence": confidence,
        "similar_houses": similar_houses,
    }
