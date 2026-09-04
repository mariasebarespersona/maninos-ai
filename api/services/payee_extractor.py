"""
Deducir el pagador (payee) de la descripción de un movimiento bancario.

REGLA DE ORO: no se adivina. Solo se rellena cuando el nombre aparece en la
descripción Y existe en los catálogos de Maninos (inversionistas, clientes,
beneficiarios de pago). Si no hay coincidencia, se deja vacío.

El motivo es que la columna sirva para FILTRAR. Adivinando del texto saldrían
"JOSE GUZMAN", "Jose Guzman" y "J. GUZMAN" como tres personas distintas, y el
filtro dejaría de valer. Casando contra el catálogo, el nombre se escribe
siempre igual: el del catálogo.

La descripción NUNCA se modifica. Es el texto literal del extracto y el respaldo
para cuadrar contra el papel del banco.
"""
from __future__ import annotations

import logging
import re
import unicodedata
from typing import Iterable, Optional

logger = logging.getLogger(__name__)

# Un nombre demasiado corto genera falsos positivos: "Ana" aparecería dentro de
# "financiamiento". A partir de 5 caracteres el riesgo es despreciable.
MIN_LONGITUD_NOMBRE = 5


def _normalizar(texto: str) -> str:
    """Minúsculas, sin acentos y con espacios colapsados, para comparar."""
    if not texto:
        return ""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(sin_acentos.lower().split())


def extraer_payee(descripcion: str, catalogo: Iterable[str]) -> Optional[str]:
    """Devuelve el nombre del catálogo que aparece en la descripción, o None.

    Ante varias coincidencias gana la más larga: si el catálogo tiene "Gladys"
    y "Gladys Ulloa", y la descripción dice "Gladys Ulloa", debe ganar la
    completa.
    """
    desc = _normalizar(descripcion)
    if not desc:
        return None

    mejor: Optional[str] = None
    mejor_len = 0
    for nombre in catalogo:
        if not nombre:
            continue
        n = _normalizar(nombre)
        if len(n) < MIN_LONGITUD_NOMBRE:
            continue
        # Límites de palabra: evita que "Ana Ruiz" case dentro de otra palabra.
        if re.search(rf"(?<!\w){re.escape(n)}(?!\w)", desc) and len(n) > mejor_len:
            mejor, mejor_len = nombre.strip(), len(n)

    return mejor


def cargar_catalogo(sb) -> list[str]:
    """Nombres contra los que casar: inversionistas, clientes y beneficiarios.

    Es best-effort: si una tabla falla, se sigue con las demás. Un catálogo
    incompleto solo hace que algún payee se quede vacío, que es el
    comportamiento seguro.
    """
    nombres: list[str] = []
    for tabla, campo in (("investors", "name"), ("clients", "name"), ("payees", "name")):
        try:
            filas = sb.table(tabla).select(campo).execute().data or []
            nombres += [f.get(campo) for f in filas if f.get(campo)]
        except Exception as exc:
            logger.warning(f"[payee] no se pudo leer {tabla}: {exc}")
    # Únicos, conservando la grafía del catálogo.
    vistos, out = set(), []
    for n in nombres:
        k = _normalizar(n)
        if k and k not in vistos:
            vistos.add(k)
            out.append(n.strip())
    return out
