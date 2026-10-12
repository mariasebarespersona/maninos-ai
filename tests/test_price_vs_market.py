"""Evaluar precio vs. mercado (Capital, Responsable de Adquisiciones).

Regla: el precio que paga Capital ≤ 70% del valor de mercado. El valor manual
del responsable prevalece; el coste nunca cuenta como valor de mercado; en
casas de Homes el precio se contrasta con su coste sin veredicto (regla
pendiente)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.services.market_valuation import (
    comparables_de_anuncios, valor_automatico, evaluar_precio, kpi_precio_mercado,
)

CASA = {"sqft": 1200, "year": 2010, "bedrooms": 3, "city": "Houston", "zip_code": "77039", "tipo": None}


def _hist(precios):
    return [{"ref": f"H{i}", "price": p, "sqft": 1200, "bedrooms": 3, "year": None, "mismo_mercado": True}
            for i, p in enumerate(precios)]


def _anuncio(precio, sqft=1200, city="Houston"):
    return {"source": "mhvillage", "city": city, "zip_code": "77039", "listing_price": precio,
            "sqft": sqft, "year_built": 2008, "bedrooms": 3}


def test_historico_va_antes_que_los_anuncios():
    v = valor_automatico(CASA, _hist([40000, 42000, 44000]),
                         comparables_de_anuncios([_anuncio(90000)] * 3))
    assert v["metodo"] == "cartera" and v["valor"] == 42000


def test_sin_historico_usa_anuncios():
    v = valor_automatico(CASA, [], comparables_de_anuncios([_anuncio(50000), _anuncio(60000), _anuncio(70000)]))
    assert v["metodo"] == "mercado" and v["valor"] == 60000


def test_anuncios_sin_superficie_se_descartan():
    assert comparables_de_anuncios([_anuncio(50000, sqft=None), {"listing_price": None, "sqft": 1000}]) == []


def test_cumple_justo_en_el_70():
    ev = evaluar_precio(28000, {"ok": True, "metodo": "cartera", "valor": 40000})
    assert ev["estado"] == "cumple" and ev["ratio"] == 0.7 and ev["precio_maximo"] == 28000


def test_no_cumple_por_encima():
    ev = evaluar_precio(30000, {"ok": True, "metodo": "mercado", "valor": 40000})
    assert ev["estado"] == "no_cumple" and ev["fuente_valor"] == "mercado"


def test_el_coste_no_es_valor_de_mercado():
    ev = evaluar_precio(30000, {"ok": True, "metodo": "coste", "valor": 20000})
    assert ev["estado"] == "sin_valor" and ev["valor_mercado"] is None


def test_valor_manual_prevalece_sobre_el_automatico():
    ev = evaluar_precio(30000, {"ok": True, "metodo": "cartera", "valor": 40000},
                        manual={"market_value": 50000, "source": "Tasación"})
    assert ev["fuente_valor"] == "manual" and ev["estado"] == "cumple" and ev["ratio"] == 0.6


def test_coste_homes_informativo_sin_veredicto():
    ev = evaluar_precio(30000, {"ok": False}, coste_homes=24000)
    assert ev["coste_homes"] == {"coste": 24000, "margen": 6000, "margen_pct": 25.0, "regla": None}
    assert "coste_homes" not in evaluar_precio(30000, {"ok": False})


def test_kpi_promedia_solo_las_que_tienen_valor():
    evs = [evaluar_precio(28000, {"ok": True, "metodo": "cartera", "valor": 40000}),   # 0.70
           evaluar_precio(32000, {"ok": True, "metodo": "cartera", "valor": 40000}),   # 0.80
           evaluar_precio(30000, {"ok": False})]
    k = kpi_precio_mercado(evs)
    assert k["ratio_promedio"] == 0.75 and k["cumple"] is False
    assert (k["evaluadas"], k["total"], k["sin_valor"], k["casas_cumplen"]) == (2, 3, 1, 1)
