"""
Contenido del pagaré — FUENTE ÚNICA.

Por qué existe este módulo
--------------------------
El texto legal del pagaré llegó a estar escrito DOS veces: una en Python para
generar el PDF y otra a mano en React para la vista previa de la pantalla. El 15
de julio de 2026 se metió el template revisado por el abogado (commit 2d88b29)
tocando **solo** el PDF, y desde entonces la pantalla enseñaba el borrador
anterior a la revisión: sin el párrafo del co-obligado, sin el periodo de cura
de 10 días, sin el tope legal de usura, sin la cláusula de moneda, y con la
firma etiquetada "Joint and Several Obligor" — una frase que el abogado había
TACHADO y sustituido por "Co-Obligor with Secondary Liability".

Nadie hizo nada mal: es lo que pasa siempre que el mismo texto vive en dos
sitios. Por eso ahora vive en uno solo. `build_document()` devuelve el documento
ya redactado, y de ahí comen el PDF y la pantalla. Si mañana el abogado cambia
una coma, se cambia aquí y las dos vistas cambian a la vez, por construcción.

Qué NO hace este módulo
-----------------------
No maqueta. Devuelve el texto y su estructura; cómo se pinte (reportlab, HTML)
es cosa de quien lo consuma. Y no inventa cláusulas: el contenido es el del docx
oficial "Promissory Note MANUEL PEREZ 2026.Renovacion", con los cambios del
abogado ya aceptados.

Sobre las firmas
----------------
El documento oficial tiene DOS firmas, las dos del lado de Maninos: el Maker
(quien debe) y el Co-Obligado (DELATORO LLC, con responsabilidad subsidiaria).
El inversionista figura como "the Lender" en el cuerpo pero **no firma**: un
pagaré es una promesa unilateral de pago y la firma el deudor. Si algún día se
le añade un bloque de aceptación al Lender, va aquí y aparece solo en los dos
sitios a la vez.
"""
from __future__ import annotations

from datetime import datetime
from typing import Optional

# =============================================================================
# PARTES FIJAS DEL TEMPLATE
# =============================================================================
MAKER_NAME = "MANINOS CAPITAL LLC"
MAKER_REP_DEFAULT = "BENJAMIN SEBASTIAN GONZALEZ ZAMBRANO"
CO_OBLIGOR_NAME = "DELATORO LLC"
CO_OBLIGOR_REP = "JORGE DE LA TORRE ROSAS"
NOTE_ADDRESS = "15891 Old Houston Rd, Conroe, Tx. Zip Code 77302"


def build_document(
    note: dict,
    investor: dict,
    schedule: dict,
    *,
    firmas: Optional[dict] = None,
    fmt,
    amount_words,
    int_to_words,
    term_phrase,
    date_spelled,
) -> dict:
    """Redacta el pagaré de `note` y lo devuelve como estructura.

    Los helpers de formato se reciben por parámetro en vez de importarse para no
    crear un ciclo con `promissory_notes.py`, que es quien los define.

    Devuelve:
      {
        brand_title, doc_title, principal_line, place_date,
        binding,                     # párrafo del Maker + Co-Obligado
        summary: {lender, rows[]},   # tabla de resumen del préstamo
        schedule_header[], schedule_rows[],
        clauses[]: [{title|None, text}],
        address_block, closing,
        signatures[]: [{name, entity_line, note}],
      }
    """
    loan = float(note.get("loan_amount", 0) or 0)
    annual_rate = float(note.get("annual_rate", 12) or 12)
    term_months = int(schedule.get("term_months") or len(schedule["schedule"]))

    maker_entity = (note.get("subscriber_name") or MAKER_NAME).upper()
    maker_rep = note.get("subscriber_representative") or MAKER_REP_DEFAULT
    lender = note.get("lender_name") or investor.get("name") or "_______________"
    city = note.get("signed_city") or "Conroe"
    state = note.get("signed_state") or "Texas"
    address = note.get("subscriber_address") or NOTE_ADDRESS

    signed_raw = note.get("signed_at") or note.get("start_date") or ""
    try:
        sd = datetime.fromisoformat(str(signed_raw).replace("Z", "+00:00"))
    except Exception:
        sd = datetime.now()
    date_full = date_spelled(sd)

    total_interest = schedule["total_interest"]
    total_repayment = loan + total_interest
    # "15%" lleva su palabra entre paréntesis; "21.9%" no, porque "veintiuno coma
    # nueve" en un documento legal se lee peor que la cifra sola.
    rate_words = f" ({int_to_words(int(annual_rate))})" if float(annual_rate).is_integer() else ""

    binding = (
        f'{maker_entity}, a Texas limited liability company (the "Maker"), acting by and through its '
        f'authorized representative, {maker_rep}, owes and by means of this Promissory Note unconditionally '
        f'binds itself to pay {lender} (the "Lender"), the amount of {fmt(loan)} U.S.D. '
        f'({amount_words(loan)} UNITED STATES DOLLARS), as a renewal and replacement of the Lender\'s existing '
        f'loan for a new term of {term_phrase(term_months)} (this Promissory Note supersedes and replaces in its '
        f'entirety any prior promissory note or loan agreement between the Maker and the Lender with respect to such '
        f'loan), which will be paid as follows: {CO_OBLIGOR_NAME}, a Texas limited liability company (the "Co-Obligor"), '
        f'joins this Promissory Note as a joint obligor, provided that the Co-Obligor\'s liability hereunder shall be '
        f'secondary to the Subscriber\'s and the Co-Obligor shall retain all rights of contribution and subrogation '
        f'against the Subscriber. Amounts will be paid as follows:'
    )

    clauses = [
        {
            "title": None,
            "text": "The Maker agrees to pay, if applicable, default interest, in accordance with the following:",
        },
        {
            "title": "1. Default interest.",
            "text": (
                f"The Maker expressly acknowledges and agrees that in the event of default in the timely and total "
                f"payment of the amounts established in this Promissory Note, which default remains uncured for ten "
                f"(10) business days after written notice thereof is delivered to the Maker and all joint obligors, "
                f"the unpaid amount will accrue interest at the annual rate of {annual_rate:g}%{rate_words} percent "
                f"(in lieu of, and not in addition to, the regular interest rate) from the expiration of such cure "
                f"period and until the day it is fully paid, payable on demand. No late fees, penalties, or other "
                f"charges beyond the interest specified herein shall be assessed against the Co-Obligor. "
                f"Notwithstanding anything herein to the contrary, in no event shall interest contracted for, charged, "
                f"or received hereunder exceed the maximum rate permitted by applicable law."
            ),
        },
        {
            "title": None,
            "text": (
                "Default interest will be calculated on unpaid balances and based on a year of three hundred and "
                "sixty-five (365) days and days elapsed. If the payment date corresponds to a day that is not a "
                "business day, the Maker may make payment free of charge on the immediately following business day. "
                "This promissory note shall be construed in accordance with the laws of the State of Texas, without "
                "regard to its conflict of laws principles. The Maker and the Co-Obligor irrevocably submit to the "
                "exclusive jurisdiction of the state and federal courts located in Montgomery County, Texas for any "
                "action arising under or related to this Promissory Note brought by the Lender, and waive any "
                "objection to venue or jurisdiction in such courts; provided, however, that the Co-Obligor may bring "
                "any contribution or subrogation action against the Maker in any court of competent jurisdiction. "
                "The Maker designates the following as its address to be required for payment:"
            ),
        },
        {
            "title": "Currency.",
            "text": (
                "All amounts referenced in this Promissory Note, including the principal, interest, default interest, "
                "and every payment reflected in the amortization schedule above, are denominated in, and shall be paid "
                'exclusively in, lawful currency of the United States of America (U.S. Dollars, "USD"). Any reference '
                'to "$" herein means U.S. Dollars.'
            ),
        },
    ]

    address_block = (
        f"{address}. Payments may be made by wire transfer, ACH, certified check, or such other method as the "
        f"parties may agree in writing. All notices to {CO_OBLIGOR_NAME} shall be sent to: [INSERT DELATORO LLC "
        f"ADDRESS]. The Maker or the Co-Obligor may prepay this Promissory Note in whole or in part at any time "
        f"without premium or penalty; any such prepayment by the Co-Obligor shall not waive or diminish its rights "
        f"of contribution and subrogation against the Maker."
    )

    closing = (
        f"This promissory note is signed and delivered in the city of {city}, {state} on {date_full}. The Lender "
        f"may not assign or transfer this Promissory Note without the prior written consent of the Subscriber and "
        f"{CO_OBLIGOR_NAME}."
    )

    signatures = [
        {
            "name": maker_rep,
            "entity_line": f"{maker_entity}, Authorized Representative",
            "note": ("(representing and warranting that the undersigned has full authority to execute this "
                     "Promissory Note on behalf of the Maker)"),
        },
        {
            "name": CO_OBLIGOR_REP,
            "entity_line": f"{CO_OBLIGOR_NAME} Authorized Representative",
            "note": ("Co-Obligor with Secondary Liability (limited to obligations expressly set forth in this "
                     "Promissory Note, with full rights of contribution and subrogation against the Maker; the "
                     "Lender shall first exhaust all remedies against the Maker before seeking payment from the "
                     "Co-Obligor)"),
        },
    ]

    # Firma electrónica, si la hay. Se estampa POR HUECO (note_signer_1 es el
    # bloque de la izquierda), no por persona: si algún día el Maker y el
    # Co-Obligado se intercambian, cada firma sigue cayendo donde firmó su dueño.
    for i, bloque in enumerate(signatures):
        f = (firmas or {}).get(f"note_signer_{i + 1}")
        bloque["signed"] = bool(f and f.get("signed_at"))
        bloque["signed_at"] = (f or {}).get("signed_at")
        bloque["signature_type"] = (f or {}).get("type")
        # Lo que la persona escribió o dibujó de verdad, no el nombre preimpreso:
        # es lo que da valor probatorio a la firma.
        bloque["signature_value"] = (f or {}).get("value")

    return {
        "brand_title": maker_entity,
        "doc_title": "PROMISSORY NOTE",
        "principal_line": {
            "label": "Principal Amount:",
            "principal": fmt(loan),
            "total_repayment": fmt(total_repayment),
            "text": (f"Principal Amount: {fmt(loan)} USD "
                     f"(Total Repayment with Interest: {fmt(total_repayment)} USD)"),
        },
        "place_date": f"In {city}, {state} on {date_full}.",
        "binding": binding,
        "summary": {
            "lender": lender,
            "rows": [
                ["Loan", fmt(loan), ""],
                ["Total Interest", fmt(total_interest), f"{annual_rate:g}%"],
            ],
        },
        "schedule_header": ["Period", "Principal", "Interest", "Payment", "Balance"],
        "schedule_rows": [
            [str(r["period"]), fmt(r["principal"]), fmt(r["interest"]), fmt(r["payment"]), fmt(r["balance"])]
            for r in schedule["schedule"]
        ],
        "clauses": clauses,
        "address_block": address_block,
        "closing": closing,
        "signatures": signatures,
    }
