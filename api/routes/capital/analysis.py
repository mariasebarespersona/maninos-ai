"""
Capital Analysis - Financial analysis when acquiring property from Homes
Evaluates whether a property is a good RTO investment.
"""

import logging
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/analysis", tags=["Capital - Analysis"])


# =============================================================================
# SCHEMAS
# =============================================================================

class AnalysisRequest(BaseModel):
    property_id: str
    # Override if known, otherwise auto-detected from property data
    purchase_price: Optional[float] = None
    renovation_cost: Optional[float] = None
    estimated_market_value: Optional[float] = None
    # RTO terms to simulate
    suggested_term_months: int = 36
    target_roi: float = 20.0  # target ROI percentage
    down_payment_pct: float = 5.0  # down payment as % of purchase price


class AnalysisApprove(BaseModel):
    approved_by: str = "admin"
    notes: Optional[str] = None


# =============================================================================
# HELPERS
# =============================================================================

def _calculate_analysis(
    purchase_price: float,
    renovation_cost: float,
    market_value: float,
    term_months: int,
    target_roi: float,
    down_payment_pct: float,
) -> dict:
    """
    Run financial analysis for RTO acquisition.
    Returns projections, risk score, and recommendation.
    """
    total_cost = purchase_price + renovation_cost
    ltv_ratio = (total_cost / market_value * 100) if market_value > 0 else 0

    # Calculate suggested RTO price (cost + target ROI)
    roi_multiplier = 1 + (target_roi / 100)
    suggested_purchase_price = total_cost * roi_multiplier

    # Down payment
    suggested_down = suggested_purchase_price * (down_payment_pct / 100)

    # Monthly rent = (purchase_price - down_payment) / term_months
    financed_amount = suggested_purchase_price - suggested_down
    suggested_monthly = financed_amount / term_months if term_months > 0 else 0

    # Total income
    total_rto_income = (suggested_monthly * term_months) + suggested_down
    gross_profit = total_rto_income - total_cost
    roi_pct = (gross_profit / total_cost * 100) if total_cost > 0 else 0

    # Monthly cashflow (simplified - just rent income)
    monthly_cashflow = suggested_monthly

    # Breakeven: when cumulative rent + down_payment >= total_cost
    if suggested_monthly > 0:
        breakeven_amount = total_cost - suggested_down
        breakeven_months = int(breakeven_amount / suggested_monthly) + 1
    else:
        breakeven_months = 0

    # Risk assessment
    risk_factors = []

    # LTV risk
    if ltv_ratio > 90:
        risk_factors.append("LTV > 90%: Inversión muy ajustada al valor de mercado")
    elif ltv_ratio > 80:
        risk_factors.append("LTV > 80%: Margen limitado sobre valor de mercado")

    # Renovation risk
    if renovation_cost > purchase_price * 0.5:
        risk_factors.append("Costo renovación > 50% del precio de compra")
    elif renovation_cost > purchase_price * 0.3:
        risk_factors.append("Costo renovación > 30% del precio de compra")

    # Term risk
    if term_months > 48:
        risk_factors.append("Plazo > 48 meses: Mayor riesgo de incumplimiento")

    # ROI risk
    if roi_pct < 10:
        risk_factors.append("ROI < 10%: Retorno muy bajo")
    elif roi_pct < 15:
        risk_factors.append("ROI < 15%: Retorno moderado")

    # Monthly payment affordability (should be < $1000 for mobile homes)
    if suggested_monthly > 1000:
        risk_factors.append(f"Renta mensual ${suggested_monthly:,.0f} puede ser alta para el mercado")

    # Breakeven risk
    if breakeven_months > term_months * 0.8:
        risk_factors.append("Punto de equilibrio muy cercano al fin del contrato")

    # Score
    if len(risk_factors) == 0:
        risk_score = "low"
    elif len(risk_factors) <= 2:
        risk_score = "medium"
    elif len(risk_factors) <= 4:
        risk_score = "high"
    else:
        risk_score = "very_high"

    # Recommendation
    if risk_score == "low" and roi_pct >= 15:
        recommendation = "proceed"
        rec_notes = "Inversión sólida con buen margen y bajo riesgo."
    elif risk_score in ("low", "medium") and roi_pct >= 10:
        recommendation = "caution"
        rec_notes = "Inversión aceptable pero con precauciones. Revisar factores de riesgo."
    else:
        recommendation = "reject"
        rec_notes = "No recomendada. Alto riesgo o bajo retorno."

    return {
        "total_cost": total_cost,
        "ltv_ratio": round(ltv_ratio, 1),
        "suggested_monthly_rent": round(suggested_monthly, 2),
        "suggested_purchase_price": round(suggested_purchase_price, 2),
        "suggested_down_payment": round(suggested_down, 2),
        "total_rto_income": round(total_rto_income, 2),
        "gross_profit": round(gross_profit, 2),
        "roi_percentage": round(roi_pct, 1),
        "monthly_cashflow": round(monthly_cashflow, 2),
        "breakeven_months": breakeven_months,
        "risk_score": risk_score,
        "risk_factors": risk_factors,
        "recommendation": recommendation,
        "recommendation_notes": rec_notes,
    }


# =============================================================================
# ENDPOINTS
# =============================================================================

@router.post("/evaluate")
async def evaluate_property(data: AnalysisRequest):
    """
    Run financial analysis on a property for RTO acquisition.
    Can be run multiple times with different parameters.
    """
    try:
        # Get property data
        prop_result = sb.table("properties") \
            .select("*") \
            .eq("id", data.property_id) \
            .execute()

        if not prop_result.data:
            raise HTTPException(status_code=404, detail="Propiedad no encontrada")

        prop = prop_result.data[0]

        # Determine values
        purchase_price = data.purchase_price or float(prop.get("purchase_price", 0) or prop.get("sale_price", 0))
        if not purchase_price:
            raise HTTPException(status_code=400, detail="No se encontró precio de compra")

        renovation_cost = data.renovation_cost or float(prop.get("renovation_cost", 0) or 0)
        market_value = data.estimated_market_value or float(prop.get("sale_price", 0) or purchase_price * 1.3)

        # Run analysis
        analysis = _calculate_analysis(
            purchase_price=purchase_price,
            renovation_cost=renovation_cost,
            market_value=market_value,
            term_months=data.suggested_term_months,
            target_roi=data.target_roi,
            down_payment_pct=data.down_payment_pct,
        )

        # Save analysis
        existing = sb.table("acquisition_analyses") \
            .select("id") \
            .eq("property_id", data.property_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        analysis_record = {
            "property_id": data.property_id,
            "purchase_price": purchase_price,
            "renovation_cost": renovation_cost,
            "total_cost": analysis["total_cost"],
            "estimated_market_value": market_value,
            "ltv_ratio": analysis["ltv_ratio"],
            "suggested_monthly_rent": analysis["suggested_monthly_rent"],
            "suggested_purchase_price": analysis["suggested_purchase_price"],
            "suggested_term_months": data.suggested_term_months,
            "suggested_down_payment": analysis["suggested_down_payment"],
            "total_rto_income": analysis["total_rto_income"],
            "gross_profit": analysis["gross_profit"],
            "roi_percentage": analysis["roi_percentage"],
            "monthly_cashflow": analysis["monthly_cashflow"],
            "breakeven_months": analysis["breakeven_months"],
            "risk_score": analysis["risk_score"],
            "risk_factors": analysis["risk_factors"],
            "recommendation": analysis["recommendation"],
            "recommendation_notes": analysis["recommendation_notes"],
            "analyzed_by": "system",
        }

        if existing.data:
            sb.table("acquisition_analyses") \
                .update(analysis_record) \
                .eq("id", existing.data[0]["id"]) \
                .execute()
            analysis_id = existing.data[0]["id"]
        else:
            result = sb.table("acquisition_analyses") \
                .insert(analysis_record) \
                .execute()
            analysis_id = result.data[0]["id"]

        return {
            "ok": True,
            "analysis_id": analysis_id,
            "property": {
                "id": prop["id"],
                "address": prop.get("address"),
                "city": prop.get("city"),
            },
            "inputs": {
                "purchase_price": purchase_price,
                "renovation_cost": renovation_cost,
                "market_value": market_value,
                "term_months": data.suggested_term_months,
                "target_roi": data.target_roi,
                "down_payment_pct": data.down_payment_pct,
            },
            "analysis": analysis,
            "message": f"Análisis completado. Recomendación: {analysis['recommendation'].upper()}",
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error evaluating property {data.property_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/property/{property_id}")
async def get_property_analysis(property_id: str):
    """Get the latest analysis for a property."""
    try:
        result = sb.table("acquisition_analyses") \
            .select("*, properties(address, city, status, sale_price, purchase_price)") \
            .eq("property_id", property_id) \
            .order("created_at", desc=True) \
            .limit(1) \
            .execute()

        if not result.data:
            return {"ok": True, "analysis": None, "message": "No hay análisis para esta propiedad"}

        return {"ok": True, "analysis": result.data[0]}
    except Exception as e:
        logger.error(f"Error getting analysis for {property_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("")
async def list_analyses(recommendation: Optional[str] = None):
    """List all acquisition analyses."""
    try:
        query = sb.table("acquisition_analyses") \
            .select("*, properties(address, city, status)")

        if recommendation:
            query = query.eq("recommendation", recommendation)

        result = query.order("created_at", desc=True).execute()

        return {"ok": True, "analyses": result.data or []}
    except Exception as e:
        logger.error(f"Error listing analyses: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{analysis_id}/approve")
async def approve_analysis(analysis_id: str, data: AnalysisApprove):
    """Mark an analysis as approved - green light for acquisition."""
    try:
        result = sb.table("acquisition_analyses") \
            .select("id, recommendation") \
            .eq("id", analysis_id) \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Análisis no encontrado")

        sb.table("acquisition_analyses").update({
            "approved_by": data.approved_by,
            "approved_at": datetime.utcnow().isoformat(),
            "recommendation_notes": data.notes or result.data[0].get("recommendation_notes"),
        }).eq("id", analysis_id).execute()

        return {
            "ok": True,
            "message": f"Análisis aprobado por {data.approved_by}",
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving analysis {analysis_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


