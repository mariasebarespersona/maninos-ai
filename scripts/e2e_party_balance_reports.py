#!/usr/bin/env python3
"""E2E linkage for the new Customer / Vendor Balance Summary reports.
Issues a receivable (customer owes) + a payable (owe vendor), checks each shows
in the right report with the right balance, then deletes the test invoices so
the app stays clean."""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client
from api.routes.accounting import issue_invoice, customer_balance_summary, vendor_balance_summary

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
CUST = "E2E TEST CLIENTE"
VEND = "E2E TEST PROVEEDOR"
results = []
def check(name, ok, detail=""):
    results.append(ok); print(f"  {'✅' if ok else '❌'} {name}" + (f"  [{detail}]" if detail else ""))


async def main():
    # issue a receivable ($5,000 owed by a customer) + a payable ($3,000 owed to a vendor)
    issue_invoice(direction="receivable", counterparty_name=CUST, counterparty_type="client",
                  total_amount=5000.0, account_code="Services", description="E2E-PARTY-TEST cobro")
    issue_invoice(direction="payable", counterparty_name=VEND, counterparty_type="vendor",
                  total_amount=3000.0, account_code="Legal & accounting services", description="E2E-PARTY-TEST pago")

    cust = await customer_balance_summary()
    vend = await vendor_balance_summary()
    crow = next((r for r in cust["rows"] if r["name"] == CUST), None)
    vrow = next((r for r in vend["rows"] if r["name"] == VEND), None)

    print("PRUEBAS:")
    check("Cliente aparece en Customer Balance Summary", crow is not None)
    check("Saldo del cliente = $5,000", crow and abs(crow["balance"] - 5000) < 0.01, crow and f"${crow['balance']:,.2f}")
    check("Proveedor aparece en Vendor Balance Summary", vrow is not None)
    check("Saldo del proveedor = $3,000", vrow and abs(vrow["balance"] - 3000) < 0.01, vrow and f"${vrow['balance']:,.2f}")
    check("Total por cobrar incluye el cliente", cust["total"] >= 5000)
    check("Total por pagar incluye el proveedor", vend["total"] >= 3000)

    # ---- cleanup: delete both test invoices + their ledger legs ----
    inv_ids = [r["id"] for r in (sb.table("accounting_invoices").select("id")
               .ilike("description", "E2E-PARTY-TEST%").execute().data or [])]
    for iid in inv_ids:
        legs = [r["id"] for r in (sb.table("accounting_transactions").select("id")
                .eq("entity_type", "invoice").eq("entity_id", iid).execute().data or [])]
        if legs:
            sb.table("accounting_transactions").delete().in_("id", legs).execute()
        sb.table("accounting_invoices").delete().eq("id", iid).execute()
    # verify clean
    left = sb.table("accounting_invoices").select("id", count="exact").ilike("description", "E2E-PARTY-TEST%").execute().count
    check("LIMPIEZA: facturas de prueba borradas", left == 0, f"{len(inv_ids)} borradas")

    npass = sum(1 for r in results if r)
    print(f"\n{'='*56}\n  {npass}/{len(results)} OK — {'REPORTES BIEN LIGADOS ✅' if npass==len(results) else 'REVISAR ❌'}\n{'='*56}")
    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
