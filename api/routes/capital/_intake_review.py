"""
Motivos de revisión de los contratos RTO cargados desde el Excel.

La carga histórica trae datos que la app NO puede validar sola: descuadres
entre precio, enganche y total a pagar, y pagos que no encajan en mensualidades
exactas. Meterlos en silencio sería peor que no meterlos: nadie sabría cuáles
mirar.

Por eso cada contrato dudoso se carga MARCADO, con el motivo escrito en
`sales.rto_notes` detrás de la etiqueta `[REVISAR]`. La pantalla lo pinta en
rojo y Abby puede corregirlo desde "Editar Términos Pactados" de la ficha del
contrato, que ya arrastra el cambio a la venta, al cronograma y al PDF.

La marca se quita sola al editar los términos: en cuanto alguien los corrige, ya
no hay nada que revisar.
"""
from __future__ import annotations

MARCA = "[REVISAR]"

# Por debajo de esto, la diferencia es redondeo del Excel y no merece alarma:
# marcar 3 contratos por 8 o 40 dólares haría que nadie mirase los de 30.000.
TOLERANCIA_DESCUADRE = 100.0

# Un enganche por debajo de este porcentaje del precio casi siempre es un dato
# mal puesto (se han visto 486 sobre 390.000), no un enganche real.
ENGANCHE_MINIMO_PCT = 0.02


def motivos_de_revision(*, precio, enganche, total_a_pagar, mensualidad,
                        meses, total_pagado) -> list[str]:
    """Qué hay que revisar en este contrato. Lista vacía = entra limpio."""
    motivos: list[str] = []

    # 1. El precio del Excel debería ser enganche + total a pagar.
    if precio and total_a_pagar is not None:
        dif = (enganche or 0) + total_a_pagar - precio
        if abs(dif) >= TOLERANCIA_DESCUADRE:
            motivos.append(
                f"El precio no cuadra: enganche + total a pagar da "
                f"${(enganche or 0) + total_a_pagar:,.0f} y el Excel dice ${precio:,.0f} "
                f"(diferencia ${dif:,.0f})"
            )

    # 2. Enganche irrisorio frente al precio.
    if precio and enganche and enganche < precio * ENGANCHE_MINIMO_PCT:
        motivos.append(
            f"Enganche sospechoso: ${enganche:,.0f} sobre un precio de ${precio:,.0f}"
        )

    # 3. La mensualidad por el plazo debería dar el total a pagar.
    if mensualidad and meses and total_a_pagar:
        esperado = mensualidad * meses
        if abs(esperado - total_a_pagar) >= TOLERANCIA_DESCUADRE:
            motivos.append(
                f"La mensualidad no cuadra con el plazo: {meses} x ${mensualidad:,.0f} "
                f"= ${esperado:,.0f}, y el total a pagar es ${total_a_pagar:,.0f}"
            )

    # 4. Lo cobrado no encaja en mensualidades completas. No es un error del
    #    Excel: son pagos irregulares reales. Pero la app solo sabe marcar meses
    #    enteros como pagados, así que queda una diferencia que hay que colocar.
    if mensualidad and total_pagado:
        cuotas = total_pagado / mensualidad
        if abs(cuotas - round(cuotas)) > 0.02:
            enteras = int(total_pagado // mensualidad)
            resto = total_pagado - enteras * mensualidad
            motivos.append(
                f"Pagos irregulares: cobrado ${total_pagado:,.0f} = {cuotas:.2f} mensualidades. "
                f"Se marcan {enteras} completas y quedan ${resto:,.0f} sin asignar"
            )

    return motivos


def nota_de_revision(motivos: list[str]) -> str | None:
    """Texto que se guarda en sales.rto_notes, o None si no hay nada que revisar."""
    if not motivos:
        return None
    return f"{MARCA} " + " · ".join(motivos)
