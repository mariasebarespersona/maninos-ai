"""
Capital — Propuestas de compra (paso "Calcular renta y margen" del proceso).

La calculadora de Evaluar compra produce una PROPUESTA DE COMPRA: precio,
enganche, plazo y renta, con el margen anual frente al coste del fondeo, el
fondeo disponible y la comparación con el mercado. Aquí se guarda una foto de
esos números (recalculados en el servidor, no los que mande el navegador) y
se aprueba o rechaza. Solo Capital: no escribe en Homes ni en la contabilidad.

Requiere la migración 120 (capital_purchase_proposals).
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from tools.supabase_client import sb

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/purchase-proposals", tags=["Capital - Propuestas de compra"])

_FALTA_120 = ("Falta la migración 120 (propuestas de compra). "
              "Ejecuta migrations/120_capital_purchase_proposals.sql en Supabase.")


class ProposalCreate(BaseModel):
    origen: Optional[str] = None              # homes | mercado | recompra
    property_id: Optional[str] = None
    casa: Optional[str] = None                # código o dirección
    precio: float
    enganche: float = 0
    plazo_meses: int = 36
    mensualidad: float
    sqft: Optional[float] = None
    bedrooms: Optional[int] = None
    year: Optional[int] = None
    city: Optional[str] = None
    valor_mercado_manual: Optional[float] = None
    fuente_valor_manual: Optional[str] = None
    renta_mercado_manual: Optional[float] = None
    fuente_renta_manual: Optional[str] = None
    notas: Optional[str] = None
    created_by: Optional[str] = None


class ProposalDecision(BaseModel):
    status: str                               # aprobada | rechazada | borrador
    decided_by: Optional[str] = None
    notas: Optional[str] = None


def _missing_table(e: Exception) -> bool:
    return "capital_purchase_proposals" in str(e)


@router.get("")
async def list_proposals(status: Optional[str] = None, limit: int = 50):
    try:
        q = sb.table("capital_purchase_proposals").select("*").order("created_at", desc=True).limit(limit)
        if status:
            q = q.eq("status", status)
        return {"ok": True, "proposals": q.execute().data or [], "falta_migracion": False}
    except Exception as e:
        if _missing_table(e):
            return {"ok": True, "proposals": [], "falta_migracion": True}
        raise HTTPException(status_code=500, detail=str(e))


@router.post("")
async def create_proposal(body: ProposalCreate):
    """Guarda la propuesta con los números recalculados en el servidor."""
    if not body.casa and not body.property_id:
        raise HTTPException(status_code=400, detail="Indica qué casa es (código o dirección)")
    if body.mensualidad <= 0:
        raise HTTPException(status_code=400, detail="La propuesta necesita una mensualidad")
    from api.routes.capital.financed_houses import purchase_calculator, PurchaseCalc
    calc = await purchase_calculator(PurchaseCalc(
        origen=body.origen, precio=body.precio, enganche=body.enganche, plazo_meses=body.plazo_meses,
        mensualidad=body.mensualidad, sqft=body.sqft, bedrooms=body.bedrooms, year=body.year, city=body.city,
        valor_mercado_manual=body.valor_mercado_manual, fuente_valor_manual=body.fuente_valor_manual,
        renta_mercado_manual=body.renta_mercado_manual, fuente_renta_manual=body.fuente_renta_manual,
    ))
    ev, rm = calc["evaluacion"], calc["renta_margen"]
    row = {
        "origen": body.origen if body.origen in ("homes", "mercado", "recompra") else None,
        "property_id": body.property_id,
        "casa": (body.casa or "").strip() or None,
        "precio": round(body.precio, 2),
        "enganche": round(body.enganche or 0, 2),
        "plazo_meses": body.plazo_meses,
        "mensualidad": round(body.mensualidad, 2),
        "margen_anual": ev["rentabilidad"]["anual"],
        "costo_fondeo": rm["costo_fondeo"],
        "semaforo": rm["semaforo"],
        "valor_mercado": ev["mercado"]["valor"],
        "renta_mercado": ev["renta"]["mercado"],
        "fondeo_disponible": rm["fondeo"].get("disponible"),
        "detalle": {"evaluacion": ev, "renta_margen": rm, "referencias": calc.get("referencias")},
        "notas": (body.notas or "").strip() or None,
        "created_by": body.created_by,
    }
    try:
        saved = sb.table("capital_purchase_proposals").insert(row).execute().data[0]
    except Exception as e:
        if _missing_table(e):
            raise HTTPException(status_code=400, detail=_FALTA_120)
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "proposal": saved}


@router.patch("/{proposal_id}")
async def decide_proposal(proposal_id: str, body: ProposalDecision):
    if body.status not in ("aprobada", "rechazada", "borrador"):
        raise HTTPException(status_code=400, detail="Estado inválido (aprobada, rechazada o borrador)")
    upd = {"status": body.status, "decided_by": body.decided_by,
           "decided_at": datetime.now(timezone.utc).isoformat() if body.status != "borrador" else None}
    if body.notas is not None:
        upd["notas"] = body.notas.strip() or None
    try:
        res = sb.table("capital_purchase_proposals").update(upd).eq("id", proposal_id).execute().data
    except Exception as e:
        if _missing_table(e):
            raise HTTPException(status_code=400, detail=_FALTA_120)
        raise HTTPException(status_code=500, detail=str(e))
    if not res:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return {"ok": True, "proposal": res[0]}


@router.delete("/{proposal_id}")
async def delete_proposal(proposal_id: str):
    try:
        sb.table("capital_purchase_proposals").delete().eq("id", proposal_id).execute()
    except Exception as e:
        if _missing_table(e):
            raise HTTPException(status_code=400, detail=_FALTA_120)
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}
