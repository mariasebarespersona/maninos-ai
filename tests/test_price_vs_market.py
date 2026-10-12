"""Evaluar compra de Capital (Responsable de Adquisiciones).

Criterio (Jorge, 2026-10-12): mínimo 30% ANUAL sobre lo que pone Capital
(precio − enganche), sumado sin capitalizar; ese 30% fija la renta. La compra
no puede superar el valor de mercado (manual > histórico > anuncios; el coste
nunca es valor de mercado). En casas de Homes, precio vs. coste informativo."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.services.market_valuation import (
    comparables_de_anuncios, valor_automatico, evaluar_compra, kpi_compra,
    rentabilidad_anual, renta_minima, precio_maximo_compra,
)

CASA = {"sqft": 1200, "year": 2010, "bedrooms": 3, "city": "Houston", "zip_code": "77039", "tipo": None}
SIN_VALOR = {"ok": False}


def _hist(precios):
    return [{"ref": f"H{i}", "price": p, "sqft": 1200, "bedrooms": 3, "year": None, "mismo_mercado": True}
            for i, p in enumerate(precios)]


def _anuncio(precio, sqft=1200, city="Houston"):
    return {"source": "mhvillage", "city": city, "zip_code": "77039", "listing_price": precio,
            "sqft": sqft, "year_built": 2008, "bedrooms": 3}


# ── Rentabilidad ────────────────────────────────────────────────────────────

def test_ejemplo_de_jorge_10_a_3_anos_es_90():
    """Compro en 10.000, sin enganche, 36 meses: hay que cobrar 19.000."""
    assert round(renta_minima(10000, 0, 36) * 36, 2) == 19000
    assert abs(rentabilidad_anual(10000, 0, 19000 / 36, 36) - 0.30) < 1e-9


def test_el_enganche_reduce_la_inversion_de_capital():
    # 40.000 − 12.000 = 28.000 invertidos; 30% × 3 años → 53.200 en mensualidades
    assert round(renta_minima(40000, 12000, 36), 2) == round(53200 / 36, 2)


def test_precio_maximo_es_el_inverso_de_la_renta_minima():
    renta = renta_minima(30000, 3000, 48)
    assert round(precio_maximo_compra(renta, 3000, 48), 2) == 30000


def test_rentabilidad_veredicto():
    ok = evaluar_compra(10000, 0, 19000 / 36, 36, SIN_VALOR)
    assert ok["rentabilidad"]["estado"] == "cumple" and ok["rentabilidad"]["total_plazo"] == 0.9
    ko = evaluar_compra(40000, 12000, 950, 36, SIN_VALOR)   # 34.200/28.000 → 7,4%/año
    assert ko["rentabilidad"]["estado"] == "no_cumple"
    assert ko["rentabilidad"]["anual"] == round((34200 / 28000 - 1) / 3, 4)
    assert evaluar_compra(40000, 0, None, 36, SIN_VALOR)["rentabilidad"]["estado"] == "sin_datos"


# ── Mercado ─────────────────────────────────────────────────────────────────

def test_historico_va_antes_que_los_anuncios():
    v = valor_automatico(CASA, _hist([40000, 42000, 44000]), comparables_de_anuncios([_anuncio(90000)] * 3))
    assert v["metodo"] == "cartera" and v["valor"] == 42000


def test_sin_historico_usa_anuncios():
    v = valor_automatico(CASA, [], comparables_de_anuncios([_anuncio(50000), _anuncio(60000), _anuncio(70000)]))
    assert v["metodo"] == "mercado" and v["valor"] == 60000


def test_anuncios_sin_superficie_se_descartan():
    assert comparables_de_anuncios([_anuncio(50000, sqft=None), {"listing_price": None, "sqft": 1000}]) == []


def test_compra_por_encima_de_mercado_no_cumple():
    ev = evaluar_compra(45000, 0, 2000, 36, {"ok": True, "metodo": "mercado", "valor": 40000})
    assert ev["mercado"]["estado"] == "no_cumple" and ev["mercado"]["compra_vs_valor"] == 1.125
    assert evaluar_compra(40000, 0, 2000, 36, {"ok": True, "metodo": "cartera", "valor": 40000})["mercado"]["estado"] == "cumple"


def test_el_coste_no_es_valor_de_mercado():
    ev = evaluar_compra(30000, 0, 1500, 36, {"ok": True, "metodo": "coste", "valor": 20000})
    assert ev["mercado"]["estado"] == "sin_valor" and ev["mercado"]["valor"] is None


def test_valor_manual_prevalece_sobre_el_automatico():
    ev = evaluar_compra(45000, 0, 2000, 36, {"ok": True, "metodo": "cartera", "valor": 40000},
                        manual={"market_value": 50000, "source": "Tasación"})
    assert ev["mercado"]["fuente"] == "manual" and ev["mercado"]["estado"] == "cumple"


def test_coste_homes_informativo_sin_veredicto():
    ev = evaluar_compra(30000, 0, 1500, 36, SIN_VALOR, coste_homes=24000)
    assert ev["coste_homes"] == {"coste": 24000, "margen": 6000, "margen_pct": 25.0, "regla": None}
    assert "coste_homes" not in evaluar_compra(30000, 0, 1500, 36, SIN_VALOR)


def test_kpi_cuenta_las_que_llegan_al_30():
    evs = [evaluar_compra(10000, 0, 19000 / 36, 36, SIN_VALOR),                       # 30%
           evaluar_compra(10000, 0, 15400 / 36, 36, SIN_VALOR),                       # 18%
           evaluar_compra(10000, 0, None, 36, {"ok": True, "metodo": "cartera", "valor": 9000})]
    k = kpi_compra(evs)
    assert (k["con_datos"], k["total"], k["cumplen"], k["no_cumplen"]) == (2, 3, 1, 1)
    assert k["rentabilidad_media"] == 0.24
    assert (k["mercado_evaluadas"], k["por_encima_de_mercado"]) == (1, 1)
