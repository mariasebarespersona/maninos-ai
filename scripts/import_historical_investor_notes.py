"""
Carga los pagarés LIQUIDADOS del Excel «CAPITAL GENERAL» como histórico.

Solo consulta: van a `investor_historical_notes`, no a `promissory_notes`, así
que no entran en contabilidad, ni en devengos, ni en las métricas de
Seguimiento de inversionistas. Ver migración 113 para el porqué.

De la hoja solo se toman los cuatro campos fiables —nombre, número, monto
original y saldo— más las notas. En ese bloque la columna de tasa contiene
importes en dólares (150000 %, 272000 %…) y la de fechas es una fórmula
arrastrada (valores consecutivos fila a fila), así que se descartan: antes
vacías que inventadas.

Uso:
    python3 scripts/import_historical_investor_notes.py            # simula
    python3 scripts/import_historical_investor_notes.py --apply    # carga
"""
import argparse
import html
import json
import os
import re
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402

sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)

EXCEL = os.path.expanduser("~/Desktop/CAPITAL GENERAL fvx - Lvx3.xlsx")
HOJA = "TABLA INVERSIONISTAS"
FUENTE = "excel_capital_general"


def _indice_columna(ref: str) -> int:
    letras = re.match(r"([A-Z]+)", ref).group(1)
    n = 0
    for c in letras:
        n = n * 26 + (ord(c) - 64)
    return n


def leer_hoja(ruta: str) -> dict:
    """{nº de fila: {nº de columna: valor}} de la hoja de inversionistas."""
    z = zipfile.ZipFile(ruta)
    wb = z.read("xl/workbook.xml").decode("utf-8", "replace")
    rels = z.read("xl/_rels/workbook.xml.rels").decode("utf-8", "replace")
    relmap = dict(re.findall(r'Id="([^"]+)"[^>]*Target="([^"]+)"', rels))
    destino = None
    for m in re.finditer(r'<sheet name="([^"]+)"[^>]*r:id="([^"]+)"', wb):
        if m.group(1).strip().upper() == HOJA:
            destino = relmap[m.group(2)]
    if not destino:
        raise SystemExit(f"No se encontró la hoja «{HOJA}» en {ruta}")

    cadenas = []
    try:
        sx = z.read("xl/sharedStrings.xml").decode("utf-8", "replace")
        for si in re.findall(r"<si>(.*?)</si>", sx, re.S):
            cadenas.append("".join(re.findall(r"<t[^>]*>(.*?)</t>", si, re.S)))
    except KeyError:
        pass

    xml = z.read("xl/" + destino.replace("xl/", "").lstrip("/")).decode("utf-8", "replace")
    filas = {}
    for fm in re.finditer(r'<row r="(\d+)".*?>(.*?)</row>', xml, re.S):
        celdas = {}
        for cm in re.finditer(r'<c r="([A-Z]+\d+)"([^>]*)>(.*?)</c>', fm.group(2), re.S):
            v = re.search(r"<v>(.*?)</v>", cm.group(3), re.S)
            if not v:
                continue
            val = v.group(1)
            if 't="s"' in cm.group(2):
                val = cadenas[int(val)] if int(val) < len(cadenas) else val
            celdas[_indice_columna(cm.group(1))] = html.unescape(val)
        if celdas:
            filas[int(fm.group(1))] = celdas
    return filas


def _num(v):
    try:
        return round(float(v), 2)
    except (TypeError, ValueError):
        return None


def extraer_liquidados(filas: dict) -> list:
    """Las filas entre «LIQUIDADOS» y el final del bloque."""
    en_bloque = False
    out = []
    for n in sorted(filas):
        c = filas[n]
        etiqueta = (c.get(1) or "").strip()
        arriba = etiqueta.upper()
        if arriba.startswith("LIQUIDADOS"):
            en_bloque = True
            continue
        if en_bloque and (arriba.startswith("BLOQUE 2") or arriba == "TOTAL"):
            break
        if not en_bloque or not etiqueta:
            continue
        out.append({
            "investor_name": etiqueta,
            "investor_number": int(float(c[2])) if c.get(2) else None,
            "original_amount": _num(c.get(3)),
            "balance": _num(c.get(6)) or 0,
            "notes": (c.get(15) or "").strip() or None,
            "source": FUENTE,
        })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="cargar de verdad")
    args = ap.parse_args()

    if not os.path.exists(EXCEL):
        raise SystemExit(f"No encuentro el Excel en {EXCEL}")

    filas = extraer_liquidados(leer_hoja(EXCEL))
    total = sum(f["original_amount"] or 0 for f in filas)
    con_saldo = [f for f in filas if (f["balance"] or 0) != 0]

    print(f"{len(filas)} pagarés liquidados · monto original {total:,.2f}")
    for f in filas:
        print(f"   {str(f['investor_number'] or '—'):>3}  {f['investor_name'][:30]:30} "
              f"{(f['original_amount'] or 0):>12,.2f}  saldo {(f['balance'] or 0):>8,.2f}")
    if con_saldo:
        # El bloque se llama "LIQUIDADOS (saldo en $0)": un saldo distinto de
        # cero significa que esa fila no está donde dice estar.
        print(f"\n⚠ {len(con_saldo)} fila(s) con saldo distinto de cero: "
              f"{[f['investor_name'] for f in con_saldo]}")

    if not args.apply:
        print("\n(simulación) Añade --apply para cargarlos.")
        return

    ya = sb.table("investor_historical_notes").select("id").eq("source", FUENTE).execute().data or []
    if ya:
        print(f"\nYa había {len(ya)} filas de esta fuente: se reemplazan.")
        sb.table("investor_historical_notes").delete().eq("source", FUENTE).execute()

    for i in range(0, len(filas), 50):
        sb.table("investor_historical_notes").insert(filas[i:i + 50]).execute()
    n = len(sb.table("investor_historical_notes").select("id").execute().data or [])
    print(f"\nCargados. Filas en la tabla: {n}")


if __name__ == "__main__":
    main()
