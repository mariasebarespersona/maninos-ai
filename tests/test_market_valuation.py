"""El motor de valoración debe ser honesto: número solo con base, y rango
siempre. Los casos usan la cartera real de Maninos (Houston 77039)."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.services.market_valuation import valorar, contraste, es_comparable

H42 = {"sqft": 1368, "year": 2010, "bedrooms": 3, "city": "Houston", "zip_code": "77039"}

CARTERA = [
    {"ref": "H50", "price": 34500, "sqft": 1368, "year": 2000, "bedrooms": 3, "city": "Houston", "zip_code": "77039"},
    {"ref": "H47", "price": 31500, "sqft": 1216, "year": 1997, "bedrooms": 3, "city": "Houston", "zip_code": "77039"},
    {"ref": "H52", "price": 34030, "sqft": 2016, "year": 2001, "bedrooms": 3, "city": "Houston", "zip_code": "77039"},
    {"ref": "H56", "price": 4000, "sqft": 160, "year": 2020, "bedrooms": 2, "city": "Houston", "zip_code": "77039"},
]


def test_descarta_superficies_imposibles():
    """H56 dice 160 sqft: error de captura. Una casa así envenena la mediana."""
    assert es_comparable(H42, CARTERA[3]) is False


def test_descarta_por_superficie_muy_distinta():
    """H52 tiene 2.016 sqft frente a 1.368: un 47% más, fuera de tolerancia."""
    assert es_comparable(H42, CARTERA[2]) is False


def test_acepta_la_de_tamano_y_antiguedad_parecidos():
    """H50: misma superficie (1.368) y del 2000, justo en el límite de ±10."""
    assert es_comparable(H42, CARTERA[0]) is True


def test_descarta_por_antiguedad_aunque_el_tamano_encaje():
    """H47 mide 1.216 (−11%, dentro), pero es de 1997: trece años más vieja que
    H42. Una casa móvil de esa diferencia de edad no es comparable."""
    assert es_comparable(H42, CARTERA[1]) is False


def test_sin_comparables_suficientes_no_inventa_numero():
    """Solo dos válidas de la cartera: por debajo del mínimo."""
    r = valorar(H42, comparables_cartera=CARTERA)
    assert r["ok"] is False
    assert r["metodo"] == "sin_datos"
    assert "comparables" in r["motivo"]


def test_cae_al_coste_cuando_no_hay_comparables():
    r = valorar(H42, comparables_cartera=CARTERA, coste_base=44464)
    assert r["ok"] is True
    assert r["metodo"] == "coste"
    assert r["valor"] == 44464
    assert r["confianza"] == "baja"
    assert "no es valor de mercado" in r["aviso"].lower()


def test_con_tres_comparables_valora_por_sqft():
    comps = [CARTERA[0]] + [
        {"ref": "X1", "price": 40000, "sqft": 1300, "year": 2008, "bedrooms": 3, "city": "Houston", "zip_code": "77039"},
        {"ref": "X2", "price": 44000, "sqft": 1400, "year": 2012, "bedrooms": 3, "city": "Houston", "zip_code": "77039"},
    ]
    r = valorar(H42, comparables_cartera=comps)
    assert r["ok"] is True and r["metodo"] == "cartera"
    assert r["n_comparables"] == 3
    # $/sqft: 25.22 (H50), 30.77 (X1), 31.43 (X2) → mediana 30.77
    assert 25 <= r["precio_sqft_mediana"] <= 32
    assert r["rango_min"] <= r["valor"] <= r["rango_max"]
    assert r["confianza"] == "baja"   # solo 3 comparables, y de cartera


def test_avisa_si_la_casa_es_mas_nueva_que_sus_comparables():
    """H42 es de 2010; si todas las comparables son de los 90, el $/sqft no
    refleja su antigüedad y hay que decirlo en vez de corregir a ojo."""
    comps = [
        {"ref": f"V{i}", "price": 30000, "sqft": 1350, "year": 1996 + i, "bedrooms": 3,
         "city": "Houston", "zip_code": "77039"} for i in range(3)
    ]
    r = valorar({**H42, "year": 2010}, comparables_cartera=comps)
    # 1996-1998 vs 2010: fuera de la tolerancia de 10 años, así que ni entran
    assert r["ok"] is False


def test_el_mercado_gana_a_la_cartera():
    mercado = [
        {"ref": f"M{i}", "price": 50000, "sqft": 1360, "year": 2009, "bedrooms": 3,
         "city": "Houston", "zip_code": "77039"} for i in range(4)
    ]
    r = valorar(H42, comparables_mercado=mercado, comparables_cartera=CARTERA)
    assert r["metodo"] == "mercado"


def test_contraste_dice_si_hay_colchon():
    r = valorar(H42, coste_base=44464)
    c = contraste(r, precio_compra=44464, precio_venta_rto=46000)
    assert c["vs_compra"] == 0
    assert c["cubre_venta_rto"] is False   # 44.464 < 46.000
    assert c["vs_venta_rto"] == -1536


def test_sin_superficie_no_hay_valoracion():
    r = valorar({"sqft": None, "city": "Houston"}, coste_base=50000)
    assert r["ok"] is False and "superficie" in r["motivo"]
