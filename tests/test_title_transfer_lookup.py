"""La entrega de un RTO debe REUTILIZAR el traspaso de título existente, no
crear uno nuevo.

Antes se exigía `from_name == "Maninos Homes LLC"` exacto y ningún traspaso se
llama así (todos dicen "Maninos Homes"): la búsqueda no encontraba nada y cada
entrega dejaba un duplicado, con el anterior pendiente para siempre.

Estos tests cubren la regla de elección sin tocar la base.
"""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


def _norm(x):
    return " ".join((x or "").split()).lower()


def elegir(candidatos, sale_id, client_name):
    """Misma preferencia que deliver_contract: misma venta > mismo cliente >
    el más reciente. `candidatos` viene ordenado por created_at desc."""
    return (
        next((t for t in candidatos if t.get("sale_id") == sale_id), None)
        or next((t for t in candidatos if _norm(t.get("to_name")) == _norm(client_name)), None)
        or (candidatos[0] if candidatos else None)
    )


def test_prefiere_el_de_la_misma_venta():
    c = [{"id": "nuevo", "sale_id": "venta-2", "to_name": "Gladys ulloa"},
         {"id": "viejo", "sale_id": "venta-1", "to_name": "Gladys ulloa"}]
    assert elegir(c, "venta-1", "Gladys ulloa")["id"] == "viejo"


def test_cae_al_del_mismo_cliente_si_la_venta_no_coincide():
    """Caso real de H42: el traspaso cuelga de una venta al contado cancelada
    y la entrega llega desde la venta RTO nueva."""
    c = [{"id": "t1", "sale_id": "venta-cancelada", "to_name": "Gladys ulloa"}]
    assert elegir(c, "venta-rto-nueva", "Gladys ulloa")["id"] == "t1"


def test_el_nombre_se_compara_normalizado():
    """Los registros traen espacios y mayúsculas inconsistentes."""
    c = [{"id": "t1", "sale_id": "otra", "to_name": "  gladys   ULLOA "}]
    assert elegir(c, "venta-x", "Gladys ulloa")["id"] == "t1"


def test_sin_candidatos_no_elige_nada():
    """Entonces el endpoint crea uno nuevo, que es lo correcto."""
    assert elegir([], "venta-x", "Quien Sea") is None


def test_el_nombre_de_la_empresa_ya_no_decide():
    """La regla vieja exigía from_name == 'Maninos Homes LLC'. Un traspaso con
    'Maninos Homes' debe encontrarse igual."""
    c = [{"id": "t1", "sale_id": "v1", "to_name": "Gladys ulloa", "from_name": "Maninos Homes"}]
    assert elegir(c, "v1", "Gladys ulloa")["id"] == "t1"
