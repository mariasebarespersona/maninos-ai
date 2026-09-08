"""
El pagaré en pantalla y el pagaré en PDF deben decir LO MISMO.

Existió una brecha real: el 15 de julio de 2026 se metió el template revisado
por el abogado solo en el PDF, y la pantalla se quedó meses enseñando el
borrador anterior —sin el párrafo del co-obligado, sin el periodo de cura de 10
días, sin el tope de usura— y con la firma etiquetada "Joint and Several
Obligor", frase que el abogado había TACHADO.

Estas pruebas fijan las dos garantías que impiden que se repita:
  1. Hay una sola fuente (`build_document`) y el texto del PDF sale de ella.
  2. El contenido oficial está presente y el texto tachado NO.

No requieren base de datos: construyen el documento con un pagaré de ejemplo.
"""
import re

from api.routes.capital._promissory_document import build_document, CO_OBLIGOR_REP


def _fmt(n):
    return f"${n:,.2f}" if n else "$0.00"


def _documento():
    """Pagaré de ejemplo: $100.000 al 15%, 24 meses solo interés + 12 amortizando
    (el mismo perfil que el docx oficial de referencia)."""
    from api.routes.capital.promissory_notes import (
        _note_schedule, _amount_words, _int_to_words, _term_phrase, _date_spelled,
    )
    note = {
        "loan_amount": 100000.0, "annual_rate": 15.0,
        "interest_only_months": 24, "amortization_months": 12, "term_months": 36,
        "start_date": "2026-07-03", "signed_city": "Conroe", "signed_state": "Texas",
        "lender_name": "MANUEL PEREZ SALAZAR", "subscriber_name": "Maninos Capital LLC",
    }
    sched = _note_schedule(100000.0, 15.0, 24, 12)
    return build_document(
        note, {}, sched,
        fmt=_fmt, amount_words=_amount_words, int_to_words=_int_to_words,
        term_phrase=_term_phrase, date_spelled=_date_spelled,
    )


def _texto_plano(doc) -> str:
    partes = [doc["principal_line"]["text"], doc["place_date"], doc["binding"]]
    for c in doc["clauses"]:
        partes.append(f"{c['title'] or ''} {c['text']}")
    partes += [doc["address_block"], doc["closing"]]
    for s in doc["signatures"]:
        partes += [s["name"], s["entity_line"], s["note"]]
    return " ".join(partes)


def test_texto_tachado_por_el_abogado_no_aparece():
    """"Joint and Several Obligor" es la redacción VIEJA, sustituida por
    "Co-Obligor with Secondary Liability". Si reaparece, alguien ha vuelto al
    borrador anterior a la revisión legal."""
    assert "Joint and Several Obligor" not in _texto_plano(_documento())


def test_clausulas_oficiales_presentes():
    """Cada una de estas faltaba en la pantalla mientras duró la brecha."""
    t = _texto_plano(_documento())
    obligatorias = [
        "DELATORO LLC",                                    # párrafo del co-obligado
        "ten (10) business days",                          # periodo de cura
        "in lieu of, and not in addition to",              # mora sustitutiva
        "maximum rate permitted by applicable law",        # tope de usura
        "without regard to its conflict of laws",          # ley aplicable
        "Montgomery County, Texas",                        # jurisdicción
        "lawful currency of the United States of America", # cláusula de moneda
        "wire transfer, ACH, certified check",             # formas de pago
        "without premium or penalty",                      # prepago
        "may not assign or transfer",                      # cesión
        "renewal and replacement",                         # renovación
        "Co-Obligor with Secondary Liability",             # etiqueta correcta
    ]
    faltan = [c for c in obligatorias if c not in t]
    assert not faltan, f"cláusulas del documento oficial ausentes: {faltan}"


def test_el_pdf_se_construye_desde_la_fuente_unica():
    """El generador de PDF no puede volver a llevar su propio texto legal: tiene
    que llamar a build_document."""
    import inspect
    from api.routes.capital import promissory_notes
    src = inspect.getsource(promissory_notes.download_promissory_note_pdf)
    assert "build_document" in src, "el PDF ya no lee de la fuente única"
    # Ninguna cláusula suelta escrita a mano dentro del generador.
    for huella in ("Montgomery County", "ten (10) business days", "DELATORO LLC shall be sent"):
        assert huella not in src, f"texto legal duplicado en el PDF: {huella!r}"


def test_dos_firmas_y_ninguna_del_inversionista():
    """El pagaré oficial lo firman Maker y Co-Obligado. El inversionista (Lender)
    NO firma: es una promesa unilateral de pago. Si algún día se le añade un
    bloque, este test debe actualizarse a conciencia, no por inercia."""
    doc = _documento()
    assert len(doc["signatures"]) == 2
    assert doc["signatures"][1]["name"] == CO_OBLIGOR_REP
    firmantes = " ".join(s["name"] for s in doc["signatures"])
    assert "MANUEL PEREZ SALAZAR" not in firmantes, "el Lender no debe figurar como firmante"


def test_cabecera_lleva_principal_y_total_a_devolver():
    """La pantalla enseñaba solo el principal; el documento oficial enseña ambos."""
    linea = _documento()["principal_line"]["text"]
    assert "$100,000.00" in linea
    assert re.search(r"Total Repayment with Interest: \$[\d,]+\.\d{2}", linea)
