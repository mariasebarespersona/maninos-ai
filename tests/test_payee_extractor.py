"""El payee se deduce de la descripción SOLO si coincide con un nombre conocido.
Nunca se adivina: la columna existe para filtrar, y un nombre inventado con otra
grafía rompe el filtro."""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from api.services.payee_extractor import extraer_payee

CATALOGO = [
    "Bibiana Solorzano", "COFINE SOFOM", "Alejandro Eyssautier",
    "Gladys ulloa", "Juan Perez", "Jose Guzman", "Jorge de la Torre",
]


def test_encuentra_el_nombre_en_la_descripcion():
    assert extraer_payee("DEPOSITO WIRE - Aporte inversionista - Bibiana Solorzano", CATALOGO) == "Bibiana Solorzano"
    assert extraer_payee("DEBIT - Pago intereses inversionista - Alejandro Eyssautier", CATALOGO) == "Alejandro Eyssautier"
    assert extraer_payee("DEPOSITO - Pago mensual RTO - Gladys ulloa - Casa H56", CATALOGO) == "Gladys ulloa"


def test_devuelve_la_grafia_del_catalogo_no_la_del_texto():
    """Es lo que hace que el filtro funcione: siempre el mismo nombre."""
    assert extraer_payee("deposito de GLADYS ULLOA", CATALOGO) == "Gladys ulloa"
    assert extraer_payee("pago a  gladys   ulloa ", CATALOGO) == "Gladys ulloa"


def test_ignora_acentos():
    assert extraer_payee("PAGO A JOSÉ GUZMÁN", CATALOGO) == "Jose Guzman"


def test_sin_nombre_conocido_devuelve_vacio():
    """Un concepto no es una persona. Preferible vacío que inventado."""
    assert extraer_payee("BANK FEE - Comision mensual mantenimiento cuenta", CATALOGO) is None
    assert extraer_payee("DEBIT - Gasto operativo - Suscripcion software contable", CATALOGO) is None
    assert extraer_payee("TRANSFER OUT - Traspaso a BOA 0623 C2", CATALOGO) is None


def test_no_inventa_nombres_que_no_estan_en_el_catalogo():
    """Aunque el texto tenga pinta de nombre propio."""
    assert extraer_payee("PRESTAMO A LUIS MARIO CRUZ", CATALOGO) is None


def test_gana_la_coincidencia_mas_larga():
    cat = ["Gladys", "Gladys ulloa"]
    assert extraer_payee("pago de Gladys ulloa", cat) == "Gladys ulloa"


def test_respeta_limites_de_palabra():
    """'Ana' no debe casar dentro de 'financiamiento'."""
    assert extraer_payee("FINANCIAMIENTO MENSUAL", ["Ana", "Anabel Ruiz"]) is None


def test_ignora_nombres_demasiado_cortos():
    """Un catálogo con 'Ana' generaría falsos positivos por todas partes."""
    assert extraer_payee("pago a Ana", ["Ana"]) is None


def test_descripcion_vacia_no_rompe():
    assert extraer_payee("", CATALOGO) is None
    assert extraer_payee(None, CATALOGO) is None
