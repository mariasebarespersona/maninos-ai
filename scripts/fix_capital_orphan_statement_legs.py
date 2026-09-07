"""
Repara asientos de UNA SOLA PATA dejados por extractos bancarios de Capital.

Un asiento de extracto siempre se publica por parejas: la pata de resultado
(gasto/ingreso) y la pata bancaria. Si sobrevive una sin la otra, el Balance no
cuadra por el importe de la pata huérfana — y el descuadre no se ve en ninguna
pantalla salvo en la fila "Descuadre" del balance por mes.

Este script SOLO toca filas que cumplan las tres condiciones a la vez:
  - `source = 'bank_statement'`  (las creó el posteo de un extracto)
  - `linked_transaction_id` vacío (perdió su pareja)
  - no existe ya el extracto que las creó (`capital_bank_statements`)

Con `--apply` las borra, dejando antes un respaldo JSON. Sin `--apply` solo
informa. Nunca borra una pata que aún tenga pareja: eso sería crear el descuadre
en vez de arreglarlo.
"""
import argparse
import json
import os
import sys
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.config import settings  # noqa: E402
from supabase import create_client  # noqa: E402

sb = create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_ROLE_KEY)


def encontrar_huerfanas() -> list[dict]:
    filas = (sb.table("capital_transactions")
             .select("*")
             .eq("source", "bank_statement")
             .is_("linked_transaction_id", "null")
             .execute().data or [])
    # Una pata puede haber perdido el enlace pero seguir viva si su extracto
    # todavía existe: en ese caso no es basura, es un dato del usuario.
    etiquetas = set()
    for s in (sb.table("capital_bank_statements")
              .select("account_label, original_filename").execute().data or []):
        etiquetas.add(f"{s.get('account_label') or ''} - {s.get('original_filename') or ''}")

    huerfanas = []
    for f in filas:
        notas = f.get("notes") or ""
        if any(e and e in notas for e in etiquetas):
            continue
        huerfanas.append(f)
    return huerfanas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true", help="borrar de verdad (por defecto solo informa)")
    args = ap.parse_args()

    huerfanas = encontrar_huerfanas()
    if not huerfanas:
        print("Sin patas huérfanas de extracto. Nada que hacer.")
        return

    total = sum(float(f.get("amount") or 0) for f in huerfanas)
    print(f"{len(huerfanas)} patas huérfanas, {total:,.2f} USD de descuadre:")
    for f in huerfanas:
        print(f"  {f['id'][:8]}  {f['transaction_date']}  {float(f['amount']):>10,.2f}  "
              f"{(f.get('description') or '')[:60]}")

    if not args.apply:
        print("\n(simulación) Añade --apply para borrarlas.")
        return

    marca = datetime.now().strftime("%Y%m%d_%H%M%S")
    ruta = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                        f"backup_capital_orphan_legs_{marca}.json")
    with open(ruta, "w", encoding="utf-8") as fh:
        json.dump(huerfanas, fh, indent=2, ensure_ascii=False, default=str)
    print(f"\nRespaldo: {ruta}")

    ids = [f["id"] for f in huerfanas]
    sb.table("capital_transactions").delete().in_("id", ids).execute()
    print(f"Borradas {len(ids)} filas.")


if __name__ == "__main__":
    main()
