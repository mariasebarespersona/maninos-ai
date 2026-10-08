"""
Carga los contratos RTO históricos de la hoja «MC CONTRATOS CLIENTES».

Usa el alta manual de Capital (source='manual_capital'), así que las casas y
ventas quedan OCULTAS en Homes y los pagos anteriores se marcan como históricos:
cuentan para el progreso del contrato pero NO postean ingreso al ledger. Es el
mismo criterio que se usó con los pagarés pre-app.

Decisiones tomadas con Maria (2026-09-24):

  • PRECIO = enganche + FINANCIAMIENTO, no la columna PRECIO del Excel.
    Esa columna ya lleva los intereses dentro (precio = enganche + total a
    pagar), así que cargarla tal cual los contaría dos veces y las casas
    saldrían ~35 % más caras de lo que fueron.

  • Los contratos dudosos se cargan MARCADOS, no se excluyen. El motivo va en
    sales.rto_notes tras [REVISAR] y la pantalla lo pinta en rojo.
    Ver api/routes/capital/_intake_review.py.

  • La fila de la casa H42 se SALTA: ese contrato ya
    existe en la app por la vía normal.

Uso:
    python3 scripts/import_rto_contracts_excel.py          # simula
    python3 scripts/import_rto_contracts_excel.py --apply  # carga
"""
import argparse
import asyncio
import html
import json
import os
import re
import sys
import zipfile
from collections import Counter
from datetime import date, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings  # noqa: E402
os.environ.setdefault("SUPABASE_URL", settings.SUPABASE_URL)
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", settings.SUPABASE_SERVICE_ROLE_KEY)

from dateutil.relativedelta import relativedelta  # noqa: E402
from supabase import create_client  # noqa: E402

from api.routes.capital._intake_review import motivos_de_revision, nota_de_revision  # noqa: E402
from api.routes.capital.manual_intake import (  # noqa: E402
    create_manual_intake, ManualIntake, ManualClient, ManualProperty, ManualTerms,
)

sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

EXCEL = os.path.expanduser("~/Desktop/CAPITAL GENERAL fvx - Lvx3.xlsx")
HOJA = "MC CONTRATOS CLIENTES"
SALTAR_CASAS = {"H42"}   # ya existe en la app por la vía normal

# Columnas de la hoja (1-indexadas)
C_NUM, C_CASA, C_PRECIO, C_ENGANCHE, C_FECHA_VENTA = 2, 3, 4, 5, 6
C_FINANCIAMIENTO, C_COMPRADOR, C_MESES = 7, 8, 9
C_TOTAL_PAGAR, C_MENSUALIDAD, C_FECHA_1ER_PAGO = 11, 12, 13
C_SALDO, C_TOTAL_PAGADO = 14, 15


def _col(ref: str) -> int:
    n = 0
    for c in re.match(r"([A-Z]+)", ref).group(1):
        n = n * 26 + (ord(c) - 64)
    return n


def leer_hoja() -> list:
    z = zipfile.ZipFile(EXCEL)
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    relmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    destino = None
    for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if m.group(1).strip().upper() == HOJA:
            destino = relmap[m.group(2)]
    if not destino:
        raise SystemExit(f"No encuentro la hoja «{HOJA}»")

    cadenas = []
    try:
        sx = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        for si in re.findall(r"<si>(.*?)</si>", sx, re.S):
            cadenas.append("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
    except KeyError:
        pass

    xml = z.read("xl/" + destino.replace("xl/", "").lstrip("/")).decode("utf-8", "replace")
    filas = []
    for fm in re.finditer(r'<row r="(\d+)".*?>(.*?)</row>', xml, re.S):
        celdas = {}
        for cm in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', fm.group(2), re.S):
            v = re.search(r"<v>(.*?)</v>", cm.group(3), re.S)
            if not v:
                continue
            val = v.group(1)
            if 't="s"' in cm.group(2):
                val = cadenas[int(val)] if int(val) < len(cadenas) else val
            celdas[_col(cm.group(1))] = html.unescape(val)
        if celdas.get(C_COMPRADOR) and celdas.get(C_CASA) and int(fm.group(1)) >= 3:
            filas.append(celdas)
    return filas


def num(v):
    try:
        return float(str(v).replace("$", "").replace(",", "").strip())
    except (TypeError, ValueError):
        return None


def fecha(v):
    """La hoja mezcla texto (26/04/2024, 20/02/24) y serial de Excel (45571)."""
    s = str(v or "").strip()
    if not s:
        return None
    if s.isdigit():
        return (date(1899, 12, 30) + timedelta(days=int(s))).isoformat()
    for sep in ("/", "-"):
        if sep in s:
            p = s.split(sep)
            if len(p) == 3:
                d_, m_, a_ = p
                a_ = ("20" + a_) if len(a_) == 2 else a_
                try:
                    return date(int(a_), int(m_), int(d_)).isoformat()
                except ValueError:
                    return None
    return None


def preparar(filas: list) -> list:
    """Traduce cada fila del Excel a un alta, con su marca de revisión."""
    repetidos = {k for k, v in Counter(
        str(f.get(C_CASA)).strip().upper() for f in filas).items() if v > 1}

    out = []
    for f in filas:
        casa = str(f.get(C_CASA)).strip().upper()
        if casa in SALTAR_CASAS:
            continue

        numero = num(f.get(C_NUM))
        # Un código repetido (GABRIEL sale 7 veces) deja de identificar la casa:
        # se le añade el nº de contrato, que sí es único.
        codigo = f"{casa}-{int(numero)}" if casa in repetidos and numero else casa

        enganche = num(f.get(C_ENGANCHE)) or 0
        financiado = num(f.get(C_FINANCIAMIENTO)) or 0
        precio = enganche + financiado          # decisión de Maria
        mensualidad = num(f.get(C_MENSUALIDAD))
        meses = int(num(f.get(C_MESES)) or 0)
        pagado = num(f.get(C_TOTAL_PAGADO)) or 0
        inicio = fecha(f.get(C_FECHA_1ER_PAGO)) or fecha(f.get(C_FECHA_VENTA))

        if not (precio and mensualidad and meses and inicio):
            out.append({"casa": codigo, "cliente": str(f.get(C_COMPRADOR)).strip(),
                        "error": "faltan precio, mensualidad, plazo o fecha"})
            continue

        # Mensualidades completas cubiertas por lo cobrado. Se redondea HACIA
        # ABAJO: marcar de más daría por cobrado un mes que no lo está.
        cuotas = int(pagado // mensualidad) if mensualidad else 0
        cuotas = min(cuotas, meses)
        base = date.fromisoformat(inicio)
        paid_through = None
        if cuotas:
            hasta = base + relativedelta(months=max(0, cuotas - 1))
            # Hay clientes que pagaron POR ADELANTADO: lo cobrado cubre más
            # meses de los transcurridos, y la fecha calculada cae en el futuro.
            # El alta no acepta fechas futuras (con razón: marcaría como cobrado
            # un mes que aún no ha vencido), así que se topa en hoy. El dinero de
            # más no se pierde: queda reflejado en el motivo de revisión.
            paid_through = min(hasta, date.today()).isoformat()

        adelantado = cuotas and (base + relativedelta(months=max(0, cuotas - 1))) > date.today()
        motivos = motivos_de_revision(
            precio=num(f.get(C_PRECIO)), enganche=enganche,
            total_a_pagar=num(f.get(C_TOTAL_PAGAR)), mensualidad=mensualidad,
            meses=meses, total_pagado=pagado,
        )
        if adelantado:
            motivos.append(
                f"Pagó por adelantado: lo cobrado cubre {cuotas} mensualidades, más meses "
                f"de los transcurridos. Se marcan solo las ya vencidas"
            )
        out.append({
            "casa": codigo, "cliente": str(f.get(C_COMPRADOR)).strip(),
            "precio": precio, "enganche": enganche, "mensualidad": mensualidad,
            "meses": meses, "inicio": inicio, "cuotas": cuotas,
            "paid_through": paid_through, "pagado": pagado,
            "revisar": nota_de_revision(motivos), "numero": int(numero) if numero else None,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="cargar solo los N primeros")
    args = ap.parse_args()

    filas = preparar(leer_hoja())
    errores = [x for x in filas if x.get("error")]
    buenos = [x for x in filas if not x.get("error")]
    if args.limit:
        buenos = buenos[:args.limit]

    marcados = [x for x in buenos if x["revisar"]]
    print(f"{len(filas)} contratos leídos (la casa H42 se salta: ya está en la app)")
    print(f"   cargables      : {len(buenos)}")
    print(f"   marcados       : {len(marcados)}")
    print(f"   sin datos      : {len(errores)}")
    if errores:
        for e in errores[:6]:
            print(f"      ✗ {e['casa']:14} {e['cliente'][:30]:30} {e['error']}")
    print(f"\n   precio total   : {sum(x['precio'] for x in buenos):,.2f}")
    print(f"   cobrado        : {sum(x['pagado'] for x in buenos):,.2f}")

    if not args.apply:
        print("\n(simulación) Añade --apply para cargar.")
        return

    ya = {p["property_code"] for p in (sb.table("properties").select("property_code")
          .eq("source", "manual_capital").execute().data or [])}
    creados = saltados = 0
    for x in buenos:
        if x["casa"] in ya:
            saltados += 1
            continue
        payload = ManualIntake(
            client=ManualClient(name=x["cliente"]),
            property=ManualProperty(property_code=x["casa"],
                                    address=f"Casa {x['casa']} (contrato {x['numero']})",
                                    city="Conroe", sale_price=x["precio"]),
            terms=ManualTerms(purchase_price=x["precio"], down_payment=x["enganche"],
                              monthly_rent=x["mensualidad"], term_months=x["meses"],
                              start_date=x["inicio"], payment_due_day=15),
            paid_through=x["paid_through"],
            notes=x["revisar"] or f"Carga histórica del Excel (contrato {x['numero']}).",
        )
        try:
            r = asyncio.run(create_manual_intake(payload))
            # La marca de revisión va en la venta, que es de donde la leen las
            # pantallas de Casas Financiadas.
            if x["revisar"] and r.get("sale_id"):
                sb.table("sales").update({"rto_notes": x["revisar"]}).eq("id", r["sale_id"]).execute()
            creados += 1
        except Exception as e:
            print(f"   ✗ {x['casa']:14} {x['cliente'][:28]:28} {str(e)[:70]}")
    print(f"\ncreados {creados} · ya existían {saltados}")


if __name__ == "__main__":
    main()
