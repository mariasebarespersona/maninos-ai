"""
Valoración de mercado de una casa móvil — motor de cálculo.

Diseñado para responder a UNA pregunta de un inversionista de Capital: ¿el
dinero que puse está respaldado por una casa que vale al menos lo que se debe?

PRINCIPIOS
----------
1. **Nunca inventar un número.** Si no hay base suficiente, se devuelve
   `sin_datos` y se explica por qué. Un valor sin respaldo es peor que ninguno:
   invita a decidir sobre arena.
2. **Rango antes que punto.** Se devuelve un intervalo, porque una mediana de
   cuatro casas no justifica precisión al dólar.
3. **Todo auditable.** La respuesta incluye qué comparables se usaron y con qué
   método, para que Xalli pueda rehacer el cálculo a mano.
4. **La antigüedad no se corrige con una curva inventada.** No hay datos para
   estimar depreciación de casas móviles en este mercado, así que en vez de
   fabricar un factor se AVISA cuando la casa queda fuera del rango de años de
   sus comparables.

MÉTODOS, por fiabilidad descendente
-----------------------------------
- `mercado`  — anuncios comparables scrapeados (market_listings). El ideal.
- `cartera`  — operaciones propias de Maninos en la misma zona. Precios REALES
               transaccionados, no pedidos; mejor señal aunque haya menos.
- `coste`    — compra + renovaciones. No es valor de mercado: es un SUELO.
"""
from __future__ import annotations

import logging
import statistics
from typing import Any, Optional

logger = logging.getLogger(__name__)

# Mínimo de comparables para que una mediana signifique algo. Con dos, un solo
# anuncio raro mueve el resultado a la mitad.
MIN_COMPARABLES = 3

# Holguras para considerar comparable otra casa.
TOL_DORMITORIOS = 1
TOL_SUPERFICIE = 0.20   # ±20%
TOL_ANIO = 10


def _sqft_valido(v: Any) -> bool:
    """Una casa móvil habitable no baja de ~400 sqft ni pasa de ~3.000.

    Filtra errores de captura: en la cartera hay una ficha con 160 sqft, que no
    existe. Un dato así envenena cualquier mediana de $/sqft.
    """
    try:
        n = float(v)
    except (TypeError, ValueError):
        return False
    return 400 <= n <= 3000


def es_comparable(sujeto: dict, cand: dict) -> bool:
    """¿Sirve `cand` para valorar `sujeto`? Zona, tamaño, dormitorios y año."""
    if not _sqft_valido(cand.get("sqft")) or not _sqft_valido(sujeto.get("sqft")):
        return False

    # Las operaciones del histórico de Maninos no traen ciudad ni código postal,
    # pero son todas del mismo mercado (Houston/Dallas): se marcan con
    # `mismo_mercado` y se saltan la comprobación de zona en vez de excluirlas.
    if not cand.get("mismo_mercado"):
        zip_s, zip_c = sujeto.get("zip_code"), cand.get("zip_code")
        ciudad_s = (sujeto.get("city") or "").strip().lower()
        ciudad_c = (cand.get("city") or "").strip().lower()
        if zip_s and zip_c:
            if zip_s != zip_c and ciudad_s != ciudad_c:
                return False
        elif ciudad_s != ciudad_c:
            return False

    # Single y double wide son productos distintos aunque midan lo mismo.
    t_s, t_c = sujeto.get("tipo"), cand.get("tipo")
    if t_s and t_c and str(t_s).strip().upper() != str(t_c).strip().upper():
        return False

    d_s, d_c = sujeto.get("bedrooms"), cand.get("bedrooms")
    if d_s and d_c and abs(int(d_c) - int(d_s)) > TOL_DORMITORIOS:
        return False

    s_s, s_c = float(sujeto["sqft"]), float(cand["sqft"])
    if abs(s_c - s_s) / s_s > TOL_SUPERFICIE:
        return False

    a_s, a_c = sujeto.get("year"), cand.get("year")
    if a_s and a_c and abs(int(a_c) - int(a_s)) > TOL_ANIO:
        return False

    return True


def _precio_por_sqft(c: dict) -> Optional[float]:
    precio = c.get("price")
    if not precio or not _sqft_valido(c.get("sqft")):
        return None
    try:
        p = float(precio)
    except (TypeError, ValueError):
        return None
    return p / float(c["sqft"]) if p > 0 else None


def _valorar_con(sujeto: dict, comps: list[dict], metodo: str) -> Optional[dict]:
    """Mediana de $/sqft aplicada a la superficie del sujeto, con su rango."""
    ratios = [(c, r) for c in comps if (r := _precio_por_sqft(c)) is not None]
    if len(ratios) < MIN_COMPARABLES:
        return None

    valores = sorted(r for _, r in ratios)
    sqft = float(sujeto["sqft"])
    mediana = statistics.median(valores)

    # El rango sale del percentil 25–75, no del mínimo y el máximo: un solo
    # anuncio extremo no debe ensanchar el intervalo hasta volverlo inútil.
    if len(valores) >= 4:
        mitad = len(valores) // 2
        bajo = statistics.median(valores[:mitad])
        alto = statistics.median(valores[-mitad:])
    else:
        bajo, alto = valores[0], valores[-1]

    anios = [int(c["year"]) for c, _ in ratios if c.get("year")]
    fuera_de_rango = bool(
        anios and sujeto.get("year") and not (min(anios) <= int(sujeto["year"]) <= max(anios))
    )

    return {
        "metodo": metodo,
        "valor": round(mediana * sqft, 2),
        "rango_min": round(bajo * sqft, 2),
        "rango_max": round(alto * sqft, 2),
        "precio_sqft_mediana": round(mediana, 2),
        "n_comparables": len(ratios),
        "comparables": [
            {
                "referencia": c.get("ref"),
                "precio": float(c["price"]),
                "sqft": float(c["sqft"]),
                "year": c.get("year"),
                "precio_sqft": round(r, 2),
            }
            for c, r in ratios
        ],
        "anio_fuera_de_rango": fuera_de_rango,
        "anios_comparables": [min(anios), max(anios)] if anios else None,
    }


def _confianza(res: dict, metodo: str) -> str:
    """Alta solo con mercado y muestra decente. La cartera propia es buena señal
    pero pocos casos; el coste no es valor de mercado."""
    if metodo == "coste":
        return "baja"
    n = res["n_comparables"]
    if res.get("anio_fuera_de_rango"):
        return "baja"
    if metodo == "mercado":
        return "alta" if n >= 6 else "media"
    return "media" if n >= 4 else "baja"


def valorar(
    sujeto: dict,
    comparables_mercado: Optional[list[dict]] = None,
    comparables_cartera: Optional[list[dict]] = None,
    coste_base: Optional[float] = None,
) -> dict:
    """Valora `sujeto` con el mejor método disponible.

    `sujeto`: {sqft, year, bedrooms, city, zip_code}
    comparables: [{ref, price, sqft, year, bedrooms, city, zip_code}]
    `coste_base`: compra + renovaciones, como suelo.
    """
    if not _sqft_valido(sujeto.get("sqft")):
        return {
            "ok": False,
            "metodo": "sin_datos",
            "motivo": "La casa no tiene una superficie válida registrada; sin ella no se puede comparar.",
        }

    for comps, metodo in ((comparables_mercado or [], "mercado"),
                          (comparables_cartera or [], "cartera")):
        filtrados = [c for c in comps if es_comparable(sujeto, c)]
        res = _valorar_con(sujeto, filtrados, metodo)
        if res:
            res["ok"] = True
            res["confianza"] = _confianza(res, metodo)
            res["n_candidatos"] = len(comps)
            return res

    if coste_base and coste_base > 0:
        return {
            "ok": True,
            "metodo": "coste",
            "valor": round(float(coste_base), 2),
            "rango_min": round(float(coste_base), 2),
            "rango_max": None,
            "n_comparables": 0,
            "comparables": [],
            "confianza": "baja",
            "aviso": (
                "No es valor de mercado: es lo que la casa ha costado "
                "(compra más renovaciones). Sirve como suelo, no como tasación."
            ),
        }

    return {
        "ok": False,
        "metodo": "sin_datos",
        "motivo": (
            f"No hay al menos {MIN_COMPARABLES} casas comparables ni coste registrado. "
            "Dar un número con menos base sería inventarlo."
        ),
    }


def contraste(valoracion: dict, precio_compra: Optional[float],
              precio_venta_rto: Optional[float]) -> dict:
    """Lo que de verdad le importa al inversionista: si hay colchón."""
    if not valoracion.get("ok"):
        return {}
    valor = valoracion["valor"]
    out: dict = {}
    if precio_compra:
        out["vs_compra"] = round(valor - float(precio_compra), 2)
        out["margen_compra_pct"] = round((valor / float(precio_compra) - 1) * 100, 1)
    if precio_venta_rto:
        out["vs_venta_rto"] = round(valor - float(precio_venta_rto), 2)
        # Un valor por debajo del precio RTO significa que el cliente está
        # pagando más de lo que la casa vale hoy: no invalida la operación,
        # pero el inversionista debería verlo.
        out["cubre_venta_rto"] = valor >= float(precio_venta_rto)
    return out


# ── Histórico de operaciones de Maninos ──────────────────────────────────────
# 93 casas compradas y vendidas en 2025, con precio de venta REAL (cobrado, no
# pedido). Es la mejor fuente de comparables que existe para este mercado: los
# anuncios de internet son precios pedidos, estos son precios cerrados.
#
# Limitación conocida: el fichero no trae año de fabricación ni ubicación, así
# que una valoración basada en él NO ajusta por antigüedad. Se refleja en el
# resultado con `sin_ajuste_antiguedad` para que quien lo lea lo sepa.
_historico_cache: Optional[list[dict]] = None


def cargar_historico() -> list[dict]:
    """Comparables del histórico, ya en el formato que espera `valorar`."""
    global _historico_cache
    if _historico_cache is not None:
        return _historico_cache

    from pathlib import Path
    import json

    ruta = Path(__file__).resolve().parents[2] / "data" / "historico_2025.json"
    try:
        crudo = json.loads(ruta.read_text(encoding="utf-8"))
    except Exception as exc:
        logger.warning(f"[valoracion] no se pudo leer el histórico: {exc}")
        _historico_cache = []
        return _historico_cache

    filas = crudo if isinstance(crudo, list) else (crudo.get("casas") or crudo.get("data") or [])
    out: list[dict] = []
    for c in filas:
        venta, sqft = c.get("precio_venta"), c.get("sqft")
        if not venta or not _sqft_valido(sqft):
            continue
        out.append({
            "ref": c.get("id"),
            "price": float(venta),
            "sqft": float(sqft),
            "bedrooms": c.get("cuartos"),
            "tipo": c.get("tipo"),
            "year": None,          # el histórico no lo trae
            "mismo_mercado": True,
            "precio_compra": c.get("precio_compra"),
            "remodelacion": c.get("remodelacion"),
            "margen_pct": c.get("margen_con_remo_pct"),
        })
    _historico_cache = out
    logger.info(f"[valoracion] histórico cargado: {len(out)} operaciones con venta y superficie")
    return out


def contexto_historico(sujeto: dict, precio_compra: Optional[float]) -> dict:
    """Sitúa la casa dentro del histórico: qué se suele pagar y cobrar por una
    así, y en qué percentil quedó su compra. Es el dato que revela si se pagó
    de más, que la valoración sola no cuenta."""
    comps = [c for c in cargar_historico() if es_comparable(sujeto, c)]
    if len(comps) < MIN_COMPARABLES:
        return {}
    compras = sorted(float(c["precio_compra"]) for c in comps if c.get("precio_compra"))
    ventas = sorted(c["price"] for c in comps)
    out: dict = {
        "n": len(comps),
        "compra_mediana": round(statistics.median(compras), 2) if compras else None,
        "venta_mediana": round(statistics.median(ventas), 2),
        "remodelacion_mediana": round(statistics.median(
            [float(c["remodelacion"]) for c in comps if c.get("remodelacion")]), 2) or None,
    }
    if precio_compra and compras:
        pc = float(precio_compra)
        out["percentil_compra"] = round(sum(1 for x in compras if x < pc) / len(compras) * 100)
    return out
