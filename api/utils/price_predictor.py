"""
Price Prediction Engine for Maninos Homes
==========================================
Uses Maninos' own historical 2025 purchase/sale data to predict:
  - Expected sale price for a new listing
  - Expected renovation cost (ONLY remodelación, NOT movida/comisión)
  - Recommended maximum purchase price
  - Expected margin

ALL numbers come from the actual data — 93 casas with compra + venta.

Costs breakdown (from Excel):
  - Col AB: Remodelación ← USED (renovation cost, the main variable cost)
  - Col AC: Movida ← NOT included (separate logistics cost)
  - Col AJ: Comisión venta ← NOT included (separate commission)
  - Col Q: GASTOS total = sum of all the above

We use ONLY remodelación because:
  1. It's the main cost the employee needs to evaluate before buying
  2. Movida and comisión are more fixed/predictable and handled separately
  3. It gives a clearer picture of "how much will I spend fixing this house"

Data source: data/historico_2025.json (93 casas from MANINOS HOMES 2025.xlsx)
"""

import json
import math
import logging
from typing import Optional, Dict, Any, List
from pathlib import Path

logger = logging.getLogger(__name__)

# ============================================
# LOAD HISTORICAL DATA
# ============================================

_historical_data: List[Dict[str, Any]] = []
_summary_stats: Dict[str, Any] = {}


def _load_data():
    """Load historical data from JSON file (lazy, cached)."""
    global _historical_data, _summary_stats
    if _historical_data:
        return _historical_data
    
    data_path = Path(__file__).parent.parent.parent / "data" / "historico_2025.json"
    if not data_path.exists():
        logger.error(f"[PricePredictor] Historical data not found at {data_path}")
        return []
    
    with open(data_path, 'r', encoding='utf-8') as f:
        all_records = json.load(f)
    
    # All records already have both prices (filtered during extraction)
    _historical_data = [
        r for r in all_records
        if r.get('precio_compra') and r['precio_compra'] > 0
        and r.get('precio_venta') and r['precio_venta'] > 0
    ]
    
    _compute_summary_stats(_historical_data)
    
    logger.info(f"[PricePredictor] Loaded {len(_historical_data)} historical houses")
    return _historical_data


def _compute_summary_stats(records: List[Dict[str, Any]]):
    """Compute summary statistics."""
    global _summary_stats
    
    single = [r for r in records if r['tipo'] == 'SINGLE']
    double = [r for r in records if r['tipo'] == 'DOUBLE']
    
    def type_stats(houses):
        if not houses:
            return None
        compras = [h['precio_compra'] for h in houses]
        ventas = [h['precio_venta'] for h in houses]
        remos = [h['remodelacion'] for h in houses]
        ganancias = [h['ganancia_con_remo'] for h in houses]
        margenes = [h['margen_con_remo_pct'] for h in houses if h.get('margen_con_remo_pct') is not None]
        
        avg_c = sum(compras) / len(compras)
        avg_r = sum(remos) / len(remos)
        avg_v = sum(ventas) / len(ventas)
        avg_g = sum(ganancias) / len(ganancias)
        
        return {
            'count': len(houses),
            'compra_min': min(compras),
            'compra_max': max(compras),
            'compra_avg': round(avg_c),
            'venta_min': min(ventas),
            'venta_max': max(ventas),
            'venta_avg': round(avg_v),
            'remodelacion_avg': round(avg_r),
            'ganancia_avg': round(avg_g),
            'margen_avg': round(sum(margenes) / len(margenes), 1) if margenes else 0,
            # Breakdown: de cada $1 de venta
            'compra_pct_venta': round(avg_c / avg_v * 100) if avg_v > 0 else 0,
            'remodelacion_pct_venta': round(avg_r / avg_v * 100) if avg_v > 0 else 0,
            'ganancia_pct_venta': round(avg_g / avg_v * 100) if avg_v > 0 else 0,
        }
    
    _summary_stats = {
        'total_casas': len(records),
        'single_wide': type_stats(single),
        'double_wide': type_stats(double),
        'all': type_stats(records),
    }


def get_summary_stats() -> Dict[str, Any]:
    """Get pre-computed summary statistics."""
    _load_data()
    return _summary_stats


def reload_data():
    """Force reload of historical data."""
    global _historical_data, _summary_stats
    _historical_data = []
    _summary_stats = {}
    return _load_data()


# ============================================
# CLASSIFICATION HELPERS
# ============================================

def classify_home_type(
    sqft: Optional[int] = None,
    bedrooms: Optional[int] = None,
    description: str = "",
) -> str:
    """Classify a listing as SINGLE or DOUBLE wide."""
    desc_upper = description.upper()
    
    if any(kw in desc_upper for kw in ['DOUBLE WIDE', 'DOUBLEWIDE', 'DOUBLE-WIDE', 'DOBLE']):
        return 'DOUBLE'
    if any(kw in desc_upper for kw in ['SINGLE WIDE', 'SINGLEWIDE', 'SINGLE-WIDE', 'SENCILLA']):
        return 'SINGLE'
    
    if sqft and sqft > 1400:
        return 'DOUBLE'
    if bedrooms and bedrooms >= 4:
        return 'DOUBLE'
    
    return 'SINGLE'


def estimate_sqft_from_listing(
    sqft: Optional[int] = None,
    bedrooms: Optional[int] = None,
    home_type: str = 'SINGLE',
) -> int:
    """Estimate sqft if not available, using typical sizes."""
    if sqft and sqft > 0:
        return sqft
    
    if home_type == 'DOUBLE':
        if bedrooms and bedrooms >= 4:
            return 2128  # 28*76
        return 1792  # 28*64
    else:
        if bedrooms and bedrooms >= 3:
            return 1216  # 16*76
        if bedrooms and bedrooms == 2:
            return 960   # 16*60
        return 1216


# ============================================
# SIMILARITY FUNCTION
# ============================================

def compute_similarity(listing_features: Dict, historical: Dict) -> float:
    """
    Compute similarity score (0 to 1) between a market listing and a historical record.
    
    KEY INSIGHT: The listing price is a strong signal of condition/location/quality.
    A $8K house is NOT the same as a $14K house even with identical beds/baths.
    The listing price correlates with what Maninos historically paid (precio_compra).
    
    Weights:
      - Type match (SINGLE/DOUBLE): 20%
      - Sqft closeness: 20%
      - Price closeness (listing_price vs precio_compra): 35%  ← MOST IMPORTANT
      - Bedrooms match: 15%
      - Bathrooms match: 10%
    """
    score = 0.0
    
    # Type match (20 points)
    if listing_features.get('tipo') == historical.get('tipo'):
        score += 20
    else:
        score += 3
    
    # Price closeness (35 points) — listing price vs historical PURCHASE price
    # This is the most important feature because:
    # - A $8K listing is likely a fixer-upper → match with $5K-$12K historic purchases
    # - A $30K listing is better condition → match with $25K-$40K historic purchases
    listing_price = listing_features.get('precio_lista', 0)
    hist_purchase = historical.get('precio_compra', 0)
    if listing_price > 0 and hist_purchase > 0:
        # Use ratio-based similarity (not absolute difference)
        # A $8K listing matching a $10K purchase = 80% similar
        # A $8K listing matching a $30K purchase = 27% similar
        price_ratio = min(listing_price, hist_purchase) / max(listing_price, hist_purchase)
        score += 35 * price_ratio
    else:
        score += 10
    
    # Sqft closeness (20 points)
    listing_sqft = listing_features.get('sqft', 1200)
    hist_sqft = historical.get('sqft')
    if hist_sqft and hist_sqft > 0:
        sqft_diff = abs(listing_sqft - hist_sqft)
        sqft_score = math.exp(-(sqft_diff ** 2) / (2 * 400 ** 2))
        score += 20 * sqft_score
    else:
        score += 8 if listing_features.get('tipo') == historical.get('tipo') else 3
    
    # Bedrooms match (15 points)
    listing_beds = listing_features.get('cuartos')
    hist_beds = historical.get('cuartos')
    if listing_beds and hist_beds:
        bed_diff = abs(listing_beds - hist_beds)
        if bed_diff == 0:
            score += 15
        elif bed_diff == 1:
            score += 10
        else:
            score += 3
    else:
        score += 7
    
    # Bathrooms match (10 points)
    listing_baths = listing_features.get('banos')
    hist_baths = historical.get('banos')
    if listing_baths and hist_baths:
        bath_diff = abs(listing_baths - hist_baths)
        if bath_diff == 0:
            score += 10
        elif bath_diff <= 0.5:
            score += 7
        else:
            score += 2
    else:
        score += 5
    
    return score / 100.0


# ============================================
# PREDICTION ENGINE
# ============================================

def predict_price(
    listing_price: float,
    sqft: Optional[int] = None,
    bedrooms: Optional[int] = None,
    bathrooms: Optional[float] = None,
    description: str = "",
    k: int = 8,
) -> Dict[str, Any]:
    """
    Predict purchase price using REAL Maninos historical data.
    
    Uses ONLY remodelación as the cost variable (not movida/comisión).
    All predictions come from actual historical patterns.
    
    Returns:
        recommended_max_price: What to pay max (based on similar houses)
        expected_sale_price: What you'd sell it for
        expected_remodelacion: How much renovation will cost
        expected_ganancia: Profit (venta - compra - remodelación)
        margin_pct: Margin as percentage
    """
    data = _load_data()
    if not data:
        return {
            "recommended_max_price": None,
            "expected_sale_price": None,
            "expected_remodelacion": None,
            "expected_ganancia": None,
            "margin_at_listing_price_pct": None,
            "confidence": "sin_datos",
            "similar_houses": [],
            "home_type": None,
            "analysis": "No hay datos históricos disponibles para hacer predicciones.",
        }
    
    # Classify listing
    home_type = classify_home_type(sqft, bedrooms, description)
    est_sqft = estimate_sqft_from_listing(sqft, bedrooms, home_type)
    
    listing_features = {
        'tipo': home_type,
        'sqft': est_sqft,
        'cuartos': bedrooms,
        'banos': bathrooms,
        'precio_lista': listing_price,  # KEY: used to find historically similar-priced purchases
    }
    
    # Find most similar historical houses
    scored = []
    for hist in data:
        sim = compute_similarity(listing_features, hist)
        scored.append((sim, hist))
    
    scored.sort(key=lambda x: -x[0])
    top_k = scored[:k]
    
    relevant = [(sim, h) for sim, h in top_k if sim >= 0.3]
    if not relevant:
        relevant = top_k[:3]
    
    total_weight = sum(sim for sim, _ in relevant)
    if total_weight == 0:
        total_weight = 1
    
    # =============================================
    # WEIGHTED AVERAGES — directly from historical data, NO scaling
    # =============================================
    # 
    # Why no scaling? Because the sale price depends on the HOUSE 
    # characteristics (sqft, beds, condition), NOT on what the seller
    # is asking. A similar house will sell for a similar price regardless
    # of whether you got a great deal or overpaid.
    #
    # This way the employee sees honest numbers:
    # "Houses like this sold for $54K. This one is listed at $35K.
    #  If you buy and remodel ($5K), you'll make $14K profit."
    # =============================================
    
    # What similar houses actually sold for (weighted by similarity)
    expected_sale_price = sum(sim * h['precio_venta'] for sim, h in relevant) / total_weight
    
    # What similar houses cost to remodel (weighted)
    expected_remodelacion = sum(sim * h['remodelacion'] for sim, h in relevant) / total_weight
    expected_remodelacion = max(0, expected_remodelacion)
    
    # What similar houses were bought for (reference price)
    avg_historical_purchase = sum(sim * h['precio_compra'] for sim, h in relevant) / total_weight
    
    # Historical margin for similar houses (weighted)
    avg_historical_margin = sum(sim * (h.get('margen_con_remo_pct') or 0) for sim, h in relevant) / total_weight
    
    # =============================================
    # PREDICTIONS using direct historical data
    # =============================================
    
    # Recommended max purchase = what similar houses were ACTUALLY bought for
    recommended_max = avg_historical_purchase
    
    # RECOMMENDED BUY PRICE = the sweet spot for negotiation
    # Logic: to match the SAME margin Maninos achieved historically,
    # we need: buy_price = sale_price - remodelacion - (sale_price * target_margin)
    # where target_margin = avg_historical_margin / 100
    target_margin_decimal = max(0.10, avg_historical_margin / 100)  # At least 10%
    recommended_buy = expected_sale_price * (1 - target_margin_decimal) - expected_remodelacion
    recommended_buy = max(0, recommended_buy)  # Can't be negative
    recommended_buy = min(recommended_buy, listing_price)  # Can't exceed listing
    
    # Ganancia if purchased at recommended price
    ganancia_at_recommended = expected_sale_price - recommended_buy - expected_remodelacion
    margin_at_recommended_pct = (ganancia_at_recommended / (recommended_buy + expected_remodelacion) * 100) if (recommended_buy + expected_remodelacion) > 0 else 0
    
    # Ganancia if purchased at LISTING price
    ganancia_at_listing = expected_sale_price - listing_price - expected_remodelacion
    margin_at_listing_pct = (ganancia_at_listing / (listing_price + expected_remodelacion) * 100) if (listing_price + expected_remodelacion) > 0 else 0
    
    # Price range for negotiation
    # Ideal: recommended_buy (gets historical margin)
    # Max: recommended_max (what similar houses cost, usually breakeven territory)
    negotiation_range_min = min(recommended_buy, recommended_max) * 0.90  # Start 10% below
    negotiation_range_max = recommended_max
    
    # =============================================
    # CONFIDENCE
    # =============================================
    avg_sim = sum(sim for sim, _ in relevant) / len(relevant)
    n_high_sim = sum(1 for sim, _ in relevant if sim >= 0.65)
    
    if n_high_sim >= 3 and avg_sim >= 0.6:
        confidence = "alta"
    elif n_high_sim >= 1 and avg_sim >= 0.45:
        confidence = "media"
    else:
        confidence = "baja"
    
    # =============================================
    # SIMILAR HOUSES
    # =============================================
    similar_houses = []
    for sim, h in relevant:
        similar_houses.append({
            "id": h['id'],
            "tipo": h['tipo'],
            "cuartos": h.get('cuartos'),
            "banos": h.get('banos'),
            "sqft": h.get('sqft'),
            "precio_compra": h['precio_compra'],
            "remodelacion": h['remodelacion'],
            "precio_venta": h['precio_venta'],
            "ganancia": h.get('ganancia_con_remo'),
            "margen_pct": h.get('margen_con_remo_pct'),
            "similitud": round(sim * 100, 0),
        })
    
    # =============================================
    # ANALYSIS TEXT (employee-friendly)
    # =============================================
    tipo_label = "Single Wide" if home_type == 'SINGLE' else "Double Wide"
    
    # Compute purchase prices range from similar houses
    compras_similares = [h['precio_compra'] for _, h in relevant]
    ventas_similares = [h['precio_venta'] for _, h in relevant]
    remos_similares = [h['remodelacion'] for _, h in relevant]
    ganancias_similares = [h.get('ganancia_con_remo', 0) for _, h in relevant]
    
    # Build detailed per-number reasoning
    analysis = {
        "casa_info": f"Casa tipo {tipo_label}, ~{est_sqft} sqft",
        "n_similares": len(relevant),
        
        # RESUMEN GENERAL
        "resumen": (
            f"Encontramos {len(relevant)} casas parecidas que Maninos compró y vendió en 2025. "
            f"Cada número que ves viene directamente de lo que pasó con esas casas reales."
        ),
        
        # POR QUÉ ESTE PRECIO DE COMPRA
        "por_que_compra": {
            "titulo": "¿Por qué comprar por este precio?",
            "valor": f"${recommended_buy:,.0f}",
            "explicacion": (
                f"Casas similares se compraron entre ${min(compras_similares):,.0f} y ${max(compras_similares):,.0f} "
                f"(promedio ${avg_historical_purchase:,.0f}). "
                f"Para conseguir el mismo margen que Maninos logró históricamente ({avg_historical_margin:.0f}%), "
                f"el precio ideal de compra es ${recommended_buy:,.0f}."
            ),
            "calculo": (
                f"Venta esperada (${expected_sale_price:,.0f}) "
                f"- Remodelación (${expected_remodelacion:,.0f}) "
                f"- Margen {avg_historical_margin:.0f}% (${expected_sale_price * target_margin_decimal:,.0f}) "
                f"= ${recommended_buy:,.0f}"
            ),
            "vs_lista": (
                f"El precio de lista es ${listing_price:,.0f}. "
                + (f"Está POR DEBAJO del recomendado — buen precio." if listing_price <= recommended_buy
                   else f"Está ${listing_price - recommended_buy:,.0f} POR ENCIMA. Hay que negociar.")
            ),
        },
        
        # POR QUÉ ESTA VENTA ESPERADA
        "por_que_venta": {
            "titulo": "¿Por qué se vendería por este precio?",
            "valor": f"${expected_sale_price:,.0f}",
            "explicacion": (
                f"Casas similares se vendieron entre ${min(ventas_similares):,.0f} y ${max(ventas_similares):,.0f}. "
                f"El promedio ponderado por similitud es ${expected_sale_price:,.0f}. "
                f"Las casas más parecidas tienen más peso en este cálculo."
            ),
            "detalle_casas": [
                f"Casa {h['id']}: se vendió por ${h['precio_venta']:,.0f} (similitud {round(sim*100)}%)"
                for sim, h in relevant[:5]
            ],
        },
        
        # POR QUÉ ESTA REMODELACIÓN
        "por_que_remodelacion": {
            "titulo": "¿Por qué costaría esto remodelar?",
            "valor": f"${expected_remodelacion:,.0f}",
            "explicacion": (
                f"Casas similares costaron entre ${min(remos_similares):,.0f} y ${max(remos_similares):,.0f} "
                f"de remodelación (promedio ${sum(remos_similares)/len(remos_similares):,.0f}). "
                f"Este número es SOLO remodelación — NO incluye movida ni comisión."
            ),
            "detalle_casas": [
                f"Casa {h['id']}: remodelación ${h['remodelacion']:,.0f}"
                for sim, h in relevant[:5]
            ],
        },
        
        # POR QUÉ ESTA GANANCIA
        "por_que_ganancia": {
            "titulo": "¿Cómo se calcula la ganancia?",
            "valor_al_lista": f"${ganancia_at_listing:,.0f}",
            "valor_al_recomendado": f"${ganancia_at_recommended:,.0f}",
            "explicacion": (
                f"Ganancia = Venta - Compra - Remodelación. "
                f"Si compras al precio de lista (${listing_price:,.0f}): ganarías ${ganancia_at_listing:,.0f} ({margin_at_listing_pct:.0f}% margen). "
                f"Si compras al precio recomendado (${recommended_buy:,.0f}): ganarías ${ganancia_at_recommended:,.0f} ({margin_at_recommended_pct:.0f}% margen)."
            ),
            "calculo_lista": f"${expected_sale_price:,.0f} - ${listing_price:,.0f} - ${expected_remodelacion:,.0f} = ${ganancia_at_listing:,.0f}",
            "calculo_recomendado": f"${expected_sale_price:,.0f} - ${recommended_buy:,.0f} - ${expected_remodelacion:,.0f} = ${ganancia_at_recommended:,.0f}",
            "casas_similares_ganancia": (
                f"Casas similares ganaron entre ${min(ganancias_similares):,.0f} y ${max(ganancias_similares):,.0f} "
                f"(promedio ${sum(ganancias_similares)/len(ganancias_similares):,.0f})."
            ),
        },
        
        "nota": "⚠️ Sin contar costos de movida ni comisión de venta.",
    }
    
    # Signal text for the card
    if listing_price <= recommended_buy * 0.85:
        signal = "excelente"
        signal_text = f"🟢 EXCELENTE PRECIO — por debajo del recomendado"
    elif listing_price <= recommended_buy:
        signal = "bueno"
        signal_text = f"🟢 BUEN PRECIO — dentro del rango recomendado"
    elif listing_price <= recommended_max:
        signal = "negociar"
        signal_text = f"🟡 HAY QUE NEGOCIAR — el precio está algo alto"
    else:
        signal = "caro"
        signal_text = f"🔴 PRECIO ALTO — negocia agresivamente o descarta"
    
    return {
        "recommended_buy_price": round(recommended_buy, 0),
        "recommended_max_price": round(recommended_max, 0),
        "expected_sale_price": round(expected_sale_price, 0),
        "expected_remodelacion": round(expected_remodelacion, 0),
        "expected_ganancia_at_recommended": round(ganancia_at_recommended, 0),
        "expected_ganancia_at_listing": round(ganancia_at_listing, 0),
        "historical_margin_pct": round(avg_historical_margin, 1),
        "margin_at_recommended_pct": round(margin_at_recommended_pct, 1),
        "margin_at_listing_price_pct": round(margin_at_listing_pct, 1),
        "negotiation_range": {
            "min": round(negotiation_range_min, 0),
            "max": round(negotiation_range_max, 0),
        },
        "signal": signal,
        "signal_text": signal_text,
        "confidence": confidence,
        "similar_houses": similar_houses,
        "home_type": home_type,
        "estimated_sqft": est_sqft,
        "listing_price": listing_price,
        "analysis": analysis,
    }


def predict_batch(listings: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Run predictions for multiple listings at once."""
    results = []
    for listing in listings:
        pred = predict_price(
            listing_price=listing.get('listing_price', 0),
            sqft=listing.get('sqft'),
            bedrooms=listing.get('bedrooms'),
            bathrooms=listing.get('bathrooms'),
            description=listing.get('address', '') + ' ' + (listing.get('description') or ''),
        )
        pred['listing_id'] = listing.get('id')
        results.append(pred)
    return results
