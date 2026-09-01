"""El devengo de interés debe fechar cada periodo en SU cierre, no en el día
que corre el job.

Antes todos los periodos de una misma ejecución compartían la fecha de ejecución.
El 2026-09-01, tras un vaciado que borró los devengos previos, la puesta al día
amontonó 616 asientos ($350.642,54) en un solo día, cuando pertenecían repartidos
por los meses anteriores.
"""
import sys
import os
from datetime import date

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("SUPABASE_URL", "https://dummy.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "dummy")

from unittest.mock import MagicMock
_mock = MagicMock()
sys.modules["tools.supabase_client"] = type(sys)("tools.supabase_client")
sys.modules["tools.supabase_client"].sb = _mock

from api.services.capital_interest_accrual import _period_end_date

HOY = date(2026, 9, 1)


def test_cada_periodo_cae_en_su_propio_mes():
    nota = {"start_date": "2025-08-15"}
    assert _period_end_date(nota, 0, HOY) == "2025-09-15"
    assert _period_end_date(nota, 1, HOY) == "2025-10-15"
    assert _period_end_date(nota, 11, HOY) == "2026-08-15"


def test_periodos_distintos_no_comparten_fecha():
    """El fallo original: todos los periodos con la misma fecha."""
    nota = {"start_date": "2025-08-15"}
    fechas = {_period_end_date(nota, i, HOY) for i in range(12)}
    assert len(fechas) == 12, f"los periodos se amontonan: {sorted(fechas)}"


def test_ajuste_de_fin_de_mes():
    """Un pagaré que arranca el 31 no puede vencer el 31 en febrero."""
    nota = {"start_date": "2026-01-31"}
    assert _period_end_date(nota, 0, date(2026, 12, 31)) == "2026-02-28"
    assert _period_end_date(nota, 2, date(2026, 12, 31)) == "2026-04-30"


def test_nunca_devuelve_fecha_futura():
    nota = {"start_date": "2026-08-01"}
    assert _period_end_date(nota, 50, HOY) == HOY.isoformat()


def test_sin_start_date_usa_el_tope():
    assert _period_end_date({}, 3, HOY) == HOY.isoformat()
