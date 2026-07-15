#!/usr/bin/env python3
"""E2E for AD-HOC (non-employee) commission recipients.

Proves that a commission half can go to a FREE-TEXT person (external, no Maninos
account/email) and still flow to accounting exactly like an employee commission:
one real payable INVOICE (Comisión→A/P accrual), pending tracking, and the right
name everywhere.

Creates a throwaway property + client + a minimal PENDING sale, runs the real
`_create_commission_payments` with an ad-hoc found_by name, then verifies:
  1. a commission_payments row with payee_name + employee_id NULL,
  2. a payable invoice for that person (counterparty_type 'person'),
  3. list_commission_payments shows the ad-hoc name (not "Desconocido").
Everything is deleted at the end so the app stays clean.

PRECONDITION: migration 101 must be applied (payee_name / found_by_name cols).
Run:  python scripts/e2e_adhoc_commission.py
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

PERSON = "E2E EXTERNO COMISION"
results = []
def check(name, ok, detail=""):
    results.append(bool(ok)); print(f"  {'✅' if ok else '❌'} {name}" + (f"  [{detail}]" if detail else ""))


def migration_101_applied() -> bool:
    try:
        sb.table("commission_payments").select("payee_name").limit(1).execute()
        sb.table("sales").select("found_by_name").limit(1).execute()
        return True
    except Exception:
        return False


async def main():
    if not migration_101_applied():
        print("\n⚠️  Migración 101 NO aplicada (faltan columnas payee_name / found_by_name).")
        print("    Ejecuta migrations/101_adhoc_commission_recipients.sql en el SQL editor de")
        print("    Supabase y vuelve a correr este script.\n")
        return 2

    from api.routes.sales import _create_commission_payments, list_commission_payments

    prop_id = client_id = sale_id = None
    try:
        # --- minimal throwaway property + client + PENDING sale (direct inserts,
        #     bypassing create_sale so we exercise ONLY the commission path) ---
        prop = sb.table("properties").insert({
            "address": "E2E Adhoc Comm St", "city": "Houston", "state": "Texas",
            "property_code": "E2ECOMM", "status": "published", "sale_price": 40000,
        }).execute()
        prop_id = prop.data[0]["id"]
        cli = sb.table("clients").insert({"name": "E2E Adhoc Comm Cliente", "status": "active"}).execute()
        client_id = cli.data[0]["id"]
        sale = sb.table("sales").insert({
            "property_id": prop_id, "client_id": client_id, "sale_type": "contado",
            "sale_price": 40000, "status": "pending",
            "commission_amount": 1500, "commission_found_by": 1500, "commission_sold_by": 0,
            "found_by_name": PERSON,
        }).execute()
        sale_id = sale.data[0]["id"]

        # --- the code under test ---
        _create_commission_payments({
            "id": sale_id, "property_id": prop_id, "sale_type": "contado",
            "found_by_employee_id": None, "sold_by_employee_id": None,
            "found_by_name": PERSON, "sold_by_name": None,
            "commission_found_by": 1500, "commission_sold_by": 0,
        })

        # 1) commission_payments row: ad-hoc → payee_name set, employee_id NULL
        cps = sb.table("commission_payments").select("*").eq("sale_id", sale_id).execute().data or []
        row = next((r for r in cps if (r.get("payee_name") or "") == PERSON), None)
        print("PRUEBAS:")
        check("commission_payments tiene fila ad-hoc con payee_name", row is not None)
        check("empleado_id es NULL en la fila ad-hoc", row is not None and row.get("employee_id") is None)
        check("monto = $1,500", row is not None and abs(float(row.get("amount") or 0) - 1500) < 0.01,
              row and f"${float(row.get('amount') or 0):,.0f}")
        check("estado inicial = pending", row is not None and row.get("status") == "pending")

        # 2) payable invoice for that person exists (the Comisión→A/P accrual)
        invs = sb.table("accounting_invoices").select("*").eq("sale_id", sale_id).eq("direction", "payable").execute().data or []
        inv = next((i for i in invs if (i.get("counterparty_name") or "") == PERSON), None)
        check("existe factura por pagar (payable) para la persona", inv is not None)
        check("counterparty_type = 'person'", inv is not None and inv.get("counterparty_type") == "person",
              inv and inv.get("counterparty_type"))
        check("factura por $1,500", inv is not None and abs(float(inv.get("total_amount") or 0) - 1500) < 0.01,
              inv and f"${float(inv.get('total_amount') or 0):,.0f}")

        # 3) list handler surfaces the ad-hoc name (not "Desconocido")
        listing = await list_commission_payments(month=None, year=None, employee_id=None, status=None)
        lrows = (listing or {}).get("payments", [])
        lrow = next((p for p in lrows if (p.get("payee_name") or "") == PERSON), None)
        check("list_commission_payments muestra el nombre ad-hoc", lrow is not None and lrow.get("employee_name") == PERSON,
              lrow and lrow.get("employee_name"))

    finally:
        # --- cleanup (reverse order); delete invoice ledger legs too ---
        if sale_id:
            for inv in (sb.table("accounting_invoices").select("id").eq("sale_id", sale_id).execute().data or []):
                sb.table("accounting_transactions").delete().eq("entity_type", "invoice").eq("entity_id", inv["id"]).execute()
                sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
            sb.table("commission_payments").delete().eq("sale_id", sale_id).execute()
            sb.table("sales").delete().eq("id", sale_id).execute()
        # per-house accounts created for E2ECOMM (Comisión E2ECOMM, etc.)
        sb.table("accounting_accounts").delete().ilike("code", "%E2ECOMM").execute()
        if client_id:
            sb.table("clients").delete().eq("id", client_id).execute()
        if prop_id:
            sb.table("properties").delete().eq("id", prop_id).execute()
        left = sb.table("sales").select("id", count="exact").eq("id", sale_id).execute().count if sale_id else 0
        check("LIMPIEZA: venta y datos de prueba borrados", left == 0)

    npass = sum(1 for r in results if r)
    print(f"\n{'='*56}\n  {npass}/{len(results)} OK — "
          f"{'COMISIÓN AD-HOC BIEN LIGADA ✅' if npass == len(results) else 'REVISAR ❌'}\n{'='*56}")
    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
