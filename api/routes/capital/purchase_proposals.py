"""
Capital — Propuestas de compra (paso "Calcular renta y margen" del proceso).

La calculadora de Evaluar compra produce una PROPUESTA DE COMPRA: precio,
enganche, plazo y renta, con el margen anual frente al coste del fondeo, el
fondeo disponible y la comparación con el mercado. Aquí se guarda una foto de
esos números (recalculados en el servidor, no los que mande el navegador) y
se aprueba o rechaza. Solo Capital: no escribe en Homes ni en la contabilidad.

Requiere la migración 120 (capital_purchase_proposals).

AUTORIZAR COMPRA (migración 121) — Comité de Inversión + VoBo del CEO:
    borrador → en_comite → en_vobo → aprobada
                  ↘ ajustes ↙   (vuelve a quien propone; corrige y reenvía)
                  ↘ rechazada
En cada etapa se puede aprobar, rechazar o pedir ajustes de precio, renta o
plazo. Regla: quien propone NO vota ni da el VoBo de su propia propuesta.
Pendiente de definir: quién forma el comité, quién es el CEO y el quórum; por
ahora vota cualquier usuario de Capital distinto de quien propone, un voto por
etapa. Salida: acta de comité (PDF). KPI: tiempo de solicitud a decisión.
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
    status: str                               # solo 'borrador' (las decisiones van por /vote)
    decided_by: Optional[str] = None
    notas: Optional[str] = None


class ProposalTerms(BaseModel):
    """Corregir una propuesta en borrador o con ajustes pedidos."""
    precio: Optional[float] = None
    enganche: Optional[float] = None
    plazo_meses: Optional[int] = None
    mensualidad: Optional[float] = None
    notas: Optional[str] = None
    edited_by: Optional[str] = None


class ProposalSubmit(BaseModel):
    submitted_by: Optional[str] = None


class ProposalVote(BaseModel):
    decision: str                             # aprobar | rechazar | ajustes
    voter_email: str
    comentario: Optional[str] = None
    # Ajustes sugeridos (si decision == 'ajustes'): cualquiera de los tres
    precio: Optional[float] = None
    mensualidad: Optional[float] = None
    plazo_meses: Optional[int] = None


_ETAPA = {"en_comite": "comite", "en_vobo": "vobo"}
_FALTA_121 = ("Falta la migración 121 (autorizar compra). "
              "Ejecuta migrations/121_capital_purchase_authorization.sql en Supabase.")


def _get(proposal_id: str) -> dict:
    rows = sb.table("capital_purchase_proposals").select("*").eq("id", proposal_id).limit(1).execute().data
    if not rows:
        raise HTTPException(status_code=404, detail="Propuesta no encontrada")
    return rows[0]


def _same_person(a: Optional[str], b: Optional[str]) -> bool:
    return bool(a and b and a.strip().lower() == b.strip().lower())


def _dias(desde: Optional[str], hasta: Optional[str]) -> Optional[float]:
    if not desde or not hasta:
        return None
    try:
        d0 = datetime.fromisoformat(desde.replace("Z", "+00:00"))
        d1 = datetime.fromisoformat(hasta.replace("Z", "+00:00"))
        return round((d1 - d0).total_seconds() / 86400, 1)
    except Exception:
        return None


def _missing_table(e: Exception) -> bool:
    return "capital_purchase_proposals" in str(e)


@router.get("")
async def list_proposals(status: Optional[str] = None, limit: int = 50):
    try:
        q = sb.table("capital_purchase_proposals").select("*").order("created_at", desc=True).limit(limit)
        if status:
            q = q.eq("status", status)
        props = q.execute().data or []
        votos: dict = {}
        try:
            ids = [p["id"] for p in props]
            if ids:
                for v in (sb.table("capital_proposal_votes").select("*").in_("proposal_id", ids)
                          .order("created_at").execute().data or []):
                    votos.setdefault(v["proposal_id"], []).append(v)
        except Exception as e:
            logger.warning(f"[proposals] votos no disponibles (¿migración 121?): {e}")
        ahora = datetime.now(timezone.utc).isoformat()
        for p in props:
            p["votos"] = votos.get(p["id"], [])
            p["dias_hasta_decision"] = (_dias(p.get("requested_at"), p.get("decided_at"))
                                        if p.get("status") in ("aprobada", "rechazada") else None)
            p["dias_en_espera"] = (_dias(p.get("requested_at"), ahora)
                                   if p.get("status") in ("en_comite", "en_vobo", "ajustes") else None)
        decididas = [p["dias_hasta_decision"] for p in props if p.get("dias_hasta_decision") is not None]
        kpi = {
            "pendientes": sum(1 for p in props if p.get("status") in ("en_comite", "en_vobo")),
            "con_ajustes": sum(1 for p in props if p.get("status") == "ajustes"),
            "decididas": len(decididas),
            "dias_medio_decision": round(sum(decididas) / len(decididas), 1) if decididas else None,
        }
        return {"ok": True, "proposals": props, "kpi": kpi, "falta_migracion": False}
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
    # Aprobar o rechazar solo se hace votando (comité y VoBo): así nadie aprueba
    # solo, ni la propia propuesta.
    if body.status != "borrador":
        raise HTTPException(status_code=400, detail="Para aprobar o rechazar una propuesta hay que votarla (comité y VoBo).")
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
    # Solo borradores: lo que pasó por el comité es registro (acta, votos).
    if _get(proposal_id)["status"] != "borrador":
        raise HTTPException(status_code=400, detail="Solo se puede borrar una propuesta en borrador; lo que pasó por el comité queda como registro")
    try:
        sb.table("capital_purchase_proposals").delete().eq("id", proposal_id).execute()
    except Exception as e:
        if _missing_table(e):
            raise HTTPException(status_code=400, detail=_FALTA_120)
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True}



async def _recalcular(prop: dict, cambios: dict) -> dict:
    """Recalcula margen/semáforo/fondeo con los términos nuevos (servidor)."""
    from api.routes.capital.financed_houses import purchase_calculator, PurchaseCalc
    det = (prop.get("detalle") or {}).get("evaluacion") or {}
    precio = cambios.get("precio", prop["precio"])
    enganche = cambios.get("enganche", prop["enganche"])
    plazo = cambios.get("plazo_meses", prop["plazo_meses"])
    mensualidad = cambios.get("mensualidad", prop["mensualidad"])
    calc = await purchase_calculator(PurchaseCalc(
        origen=prop.get("origen"), precio=float(precio), enganche=float(enganche or 0),
        plazo_meses=int(plazo), mensualidad=float(mensualidad),
        valor_mercado_manual=(det.get("mercado") or {}).get("valor"),
        renta_mercado_manual=(det.get("renta") or {}).get("mercado"),
    ))
    ev, rm = calc["evaluacion"], calc["renta_margen"]
    return {
        "precio": round(float(precio), 2), "enganche": round(float(enganche or 0), 2),
        "plazo_meses": int(plazo), "mensualidad": round(float(mensualidad), 2),
        "margen_anual": ev["rentabilidad"]["anual"], "costo_fondeo": rm["costo_fondeo"],
        "semaforo": rm["semaforo"], "fondeo_disponible": rm["fondeo"].get("disponible"),
        "detalle": {"evaluacion": ev, "renta_margen": rm, "referencias": calc.get("referencias")},
    }


@router.put("/{proposal_id}")
async def update_terms(proposal_id: str, body: ProposalTerms):
    """Corregir precio/enganche/plazo/renta de una propuesta en borrador o con
    ajustes pedidos. Solo quien la propuso."""
    prop = _get(proposal_id)
    if prop["status"] not in ("borrador", "ajustes"):
        raise HTTPException(status_code=400, detail="Solo se puede corregir una propuesta en borrador o con ajustes pedidos")
    if prop.get("created_by") and body.edited_by and not _same_person(prop["created_by"], body.edited_by):
        raise HTTPException(status_code=403, detail="Solo quien hizo la propuesta puede corregirla")
    cambios = {k: v for k, v in body.model_dump().items() if k in ("precio", "enganche", "plazo_meses", "mensualidad") and v is not None}
    upd = await _recalcular(prop, cambios)
    if body.notas is not None:
        upd["notas"] = body.notas.strip() or None
    res = sb.table("capital_purchase_proposals").update(upd).eq("id", proposal_id).execute().data
    return {"ok": True, "proposal": res[0] if res else prop}


@router.post("/{proposal_id}/submit")
async def submit_to_committee(proposal_id: str, body: ProposalSubmit):
    """Enviar al Comité de Inversión (desde borrador o tras corregir ajustes)."""
    prop = _get(proposal_id)
    if prop["status"] not in ("borrador", "ajustes"):
        raise HTTPException(status_code=400, detail=f"La propuesta ya está '{prop['status']}'")
    if prop.get("created_by") and body.submitted_by and not _same_person(prop["created_by"], body.submitted_by):
        raise HTTPException(status_code=403, detail="Solo quien hizo la propuesta puede enviarla al comité")
    ahora = datetime.now(timezone.utc).isoformat()
    upd = {"status": "en_comite", "submitted_at": ahora}
    if not prop.get("requested_at"):
        upd["requested_at"] = ahora                 # inicio del KPI "solicitud → decisión"
    if prop["status"] == "ajustes":
        upd["version"] = int(prop.get("version") or 1) + 1
    try:
        res = sb.table("capital_purchase_proposals").update(upd).eq("id", proposal_id).execute().data
    except Exception as e:
        if "requested_at" in str(e) or "status_check" in str(e) or "version" in str(e):
            raise HTTPException(status_code=400, detail=_FALTA_121)
        raise HTTPException(status_code=500, detail=str(e))
    return {"ok": True, "proposal": res[0]}


@router.post("/{proposal_id}/vote")
async def vote(proposal_id: str, body: ProposalVote):
    """Voto del comité (en_comite) o VoBo final (en_vobo): aprobar, rechazar o
    pedir ajustes de precio, renta o plazo. Quien propone no puede votar."""
    if body.decision not in ("aprobar", "rechazar", "ajustes"):
        raise HTTPException(status_code=400, detail="Decisión inválida (aprobar, rechazar o ajustes)")
    if not (body.voter_email or "").strip():
        raise HTTPException(status_code=400, detail="Falta quién vota")
    prop = _get(proposal_id)
    etapa = _ETAPA.get(prop["status"])
    if not etapa:
        raise HTTPException(status_code=400, detail=f"La propuesta no está pendiente de votación (estado '{prop['status']}')")
    if _same_person(prop.get("created_by"), body.voter_email):
        raise HTTPException(status_code=403, detail="Quien propone no puede aprobar ni votar su propia propuesta")
    ajustes = None
    if body.decision == "ajustes":
        ajustes = {k: v for k, v in {"precio": body.precio, "mensualidad": body.mensualidad,
                                     "plazo_meses": body.plazo_meses}.items() if v is not None}
        if not ajustes and not (body.comentario or "").strip():
            raise HTTPException(status_code=400, detail="Indica qué ajustar (precio, renta o plazo) o explica el ajuste en el comentario")
    try:
        sb.table("capital_proposal_votes").insert({
            "proposal_id": proposal_id, "etapa": etapa, "decision": body.decision,
            "comentario": (body.comentario or "").strip() or None, "ajustes": ajustes,
            "voter_email": body.voter_email.strip(), "proposal_version": int(prop.get("version") or 1),
        }).execute()
    except Exception as e:
        if "capital_proposal_votes" in str(e):
            raise HTTPException(status_code=400, detail=_FALTA_121)
        raise HTTPException(status_code=500, detail=str(e))
    ahora = datetime.now(timezone.utc).isoformat()
    if body.decision == "ajustes":
        upd = {"status": "ajustes"}
    elif body.decision == "rechazar":
        upd = {"status": "rechazada", "decided_by": body.voter_email.strip(), "decided_at": ahora}
    elif etapa == "comite":
        upd = {"status": "en_vobo"}
    else:
        upd = {"status": "aprobada", "decided_by": body.voter_email.strip(), "decided_at": ahora}
    res = sb.table("capital_purchase_proposals").update(upd).eq("id", proposal_id).execute().data
    return {"ok": True, "proposal": res[0] if res else None}


@router.get("/{proposal_id}/acta")
async def acta_pdf(proposal_id: str):
    """Acta de comité (PDF): la propuesta, sus números y cada voto."""
    from fastapi.responses import Response
    prop = _get(proposal_id)
    try:
        votos = (sb.table("capital_proposal_votes").select("*").eq("proposal_id", proposal_id)
                 .order("created_at").execute().data or [])
    except Exception:
        votos = []
    pdf = _acta_bytes(prop, votos)
    nombre = f"Acta_comite_{(prop.get('casa') or proposal_id[:8]).replace(' ', '_')}.pdf"
    return Response(content=pdf, media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


def _acta_bytes(prop: dict, votos: list) -> bytes:
    import io
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import getSampleStyleSheet
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

    def money(v):
        return f"${float(v):,.2f}" if v is not None else "—"

    def pct(v):
        return f"{float(v) * 100:.1f}%" if v is not None else "—"

    def fecha(v):
        return (v or "")[:16].replace("T", " ") or "—"

    st = getSampleStyleSheet()
    buf = io.BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, leftMargin=0.8 * inch, rightMargin=0.8 * inch,
                            topMargin=0.7 * inch, bottomMargin=0.7 * inch)
    el = [Paragraph("Maninos Capital LLC — Acta de Comité de Inversión", st["Title"]),
          Paragraph("Autorización de compra", st["Heading3"]), Spacer(1, 8)]
    estado = {"aprobada": "APROBADA", "rechazada": "RECHAZADA", "en_comite": "En comité",
              "en_vobo": "Pendiente de VoBo", "ajustes": "Ajustes solicitados", "borrador": "Borrador"}
    det = (prop.get("detalle") or {}).get("evaluacion") or {}
    filas = [
        ["Casa", prop.get("casa") or "—"],
        ["Origen", {"homes": "Maninos Homes", "mercado": "Tercero (mercado)", "recompra": "Recompra a cliente"}.get(prop.get("origen") or "", "—")],
        ["Precio de compra", money(prop.get("precio"))],
        ["Enganche", money(prop.get("enganche"))],
        ["Financiado por Capital", money(float(prop.get("precio") or 0) - float(prop.get("enganche") or 0))],
        ["Renta mensual × plazo", f"{money(prop.get('mensualidad'))} × {prop.get('plazo_meses')} meses"],
        ["Margen anual", pct(prop.get("margen_anual"))],
        ["Costo del fondeo", pct(prop.get("costo_fondeo"))],
        ["Semáforo", {"verde": "Verde (llega al objetivo)", "amarillo": "Amarillo (cubre el fondeo)", "rojo": "Rojo (no cubre el fondeo)"}.get(prop.get("semaforo") or "", "—")],
        ["Valor de mercado", money(prop.get("valor_mercado"))],
        ["Compra / valor", pct((det.get("mercado") or {}).get("compra_vs_valor"))],
        ["Renta de mercado", money(prop.get("renta_mercado"))],
        ["Propuesta por", f"{prop.get('created_by') or '—'} · {fecha(prop.get('created_at'))}"],
        ["Enviada al comité", fecha(prop.get("requested_at"))],
        ["Versión", str(prop.get("version") or 1)],
        ["Resultado", estado.get(prop.get("status"), prop.get("status") or "—")],
        ["Decisión final", f"{prop.get('decided_by') or '—'} · {fecha(prop.get('decided_at'))}"],
    ]
    t = Table(filas, colWidths=[2.0 * inch, 4.6 * inch])
    t.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9), ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#555555")),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
    ]))
    el += [t, Spacer(1, 14), Paragraph("Votos", st["Heading3"])]
    if votos:
        vt = [["Fecha", "Etapa", "Quién", "Decisión", "Comentario / ajustes"]]
        for v in votos:
            aj = v.get("ajustes") or {}
            aj_txt = ", ".join(
                f"{ {'precio': 'precio', 'mensualidad': 'renta', 'plazo_meses': 'plazo'}[k] } {money(x) if k != 'plazo_meses' else str(x) + ' meses'}"
                for k, x in aj.items())
            txt = " · ".join(t for t in [(v.get("comentario") or ""), aj_txt] if t)
            vt.append([fecha(v.get("created_at")), "Comité" if v["etapa"] == "comite" else "VoBo CEO",
                       v.get("voter_email") or "—", {"aprobar": "Aprueba", "rechazar": "Rechaza", "ajustes": "Pide ajustes"}[v["decision"]],
                       Paragraph(txt or "—", st["BodyText"])])
        tv = Table(vt, colWidths=[1.05 * inch, 0.8 * inch, 1.7 * inch, 0.9 * inch, 2.15 * inch])
        tv.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 8), ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f2efe8")),
            ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#dddddd")), ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ]))
        el.append(tv)
    else:
        el.append(Paragraph("Sin votos todavía.", st["BodyText"]))
    if prop.get("notas"):
        el += [Spacer(1, 10), Paragraph(f"Notas: {prop['notas']}", st["BodyText"])]
    el += [Spacer(1, 18), Paragraph(
        "Regla aplicada: quien propone no vota ni da el VoBo de su propia propuesta.", st["Italic"])]
    doc.build(el)
    return buf.getvalue()
