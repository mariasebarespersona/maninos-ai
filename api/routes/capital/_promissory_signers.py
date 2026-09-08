"""
A quién le llega el enlace de firma de un pagaré.

REGLA: la firma sigue al NOMBRE. El pagaré tiene dos bloques de firma y este
módulo no da por hecho quién ocupa cada uno — lee el nombre que hay escrito en
cada bloque y busca su correo. Si algún día el Maker y el Co-Obligado se
intercambian, los enlaces se intercambian solos y nadie firma en el sitio de
otro.

Eso importa porque los dos bloques NO son equivalentes: el Maker es quien debe
el dinero y el Co-Obligado solo responde si el Maker no paga. Mandarle a alguien
el bloque que no le toca significaría que asume una obligación distinta de la
pactada.

NO SE ADIVINA. Si un nombre no está en este registro, el envío se rechaza
diciendo qué nombre falta. Deducir un correo a partir de un nombre parecido es
justo el error que no se puede permitir en un documento que crea una deuda.
"""
from __future__ import annotations

import unicodedata

# Nombre tal como aparece en el pagaré → correo al que llega el enlace.
# Para añadir a alguien basta con una línea nueva. La comparación ignora
# mayúsculas, acentos y espacios de sobra, así que no hay que copiar la grafía
# exacta del documento.
CORREOS_FIRMANTES = {
    "BENJAMIN SEBASTIAN GONZALEZ ZAMBRANO": "sgonzalez@maninoshomes.com",
    "JORGE DE LA TORRE ROSAS": "jorge@delatoro.com",
}


def _normalizar(texto: str) -> str:
    """Mayúsculas, sin acentos y con espacios colapsados, para comparar."""
    if not texto:
        return ""
    sin_acentos = "".join(
        c for c in unicodedata.normalize("NFD", texto)
        if unicodedata.category(c) != "Mn"
    )
    return " ".join(sin_acentos.upper().split())


_INDICE = {_normalizar(n): c for n, c in CORREOS_FIRMANTES.items()}


def correo_de(nombre: str) -> str | None:
    """Correo del firmante, o None si ese nombre no está registrado."""
    return _INDICE.get(_normalizar(nombre))


def resolver_firmantes(bloques: list) -> tuple[list, list]:
    """Convierte los bloques de firma del documento en destinatarios.

    `bloques` son los `signatures` que devuelve `build_document`: cada uno trae
    el nombre y la línea de entidad de ese hueco del pagaré.

    Devuelve (firmantes, nombres_sin_correo). El llamador debe abortar el envío
    si la segunda lista no está vacía: mejor no mandar nada que mandarle a medias
    un documento que obliga.
    """
    firmantes, sin_correo = [], []
    for i, b in enumerate(bloques):
        nombre = (b.get("name") or "").strip()
        correo = correo_de(nombre)
        if not correo:
            sin_correo.append(nombre or f"(bloque {i + 1} sin nombre)")
            continue
        firmantes.append({
            # El rol identifica el HUECO del documento, no a la persona: así el
            # bloque 1 sigue siendo el bloque 1 aunque cambie quién lo firma.
            "role": f"note_signer_{i + 1}",
            "name": nombre,
            "email": correo,
            "entity_line": b.get("entity_line") or "",
        })
    return firmantes, sin_correo
