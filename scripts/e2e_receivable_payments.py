#!/usr/bin/env python3
"""Empirical check of Abby item 5: sale RECEIVABLE payments show in accounting.

When Maninos Capital pays Homes for the financed (RTO) part of a sale, that cobro
must be visible: bank up (Gabriel's efectivo), Por Cobrar down (both zones), the
sale income already recognized (Abby's Ventas Capital RTO), and the payment shows
as a ledger transaction. Verifies the full cycle + Balance Sheet; cleans up.
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
PCODE = "D05REC"
PRICE, DOWN = 40000.0, 12000.0
FINANCED = PRICE - DOWN


def wipe():
    for p in (sb.table("properties").select("id").eq("property_code", PCODE).execute().data or []):
        for s in (sb.table("sales").select("id").eq("property_id", p["id"]).execute().data or []):
            sb.table("commission_payments").delete().eq("sale_id", s["id"]).execute()
            sb.table("rto_applications").delete().eq("sale_id", s["id"]).execute()
            sb.table("sale_payments").delete().eq("sale_id", s["id"]).execute()
            for inv in (sb.table("accounting_invoices").select("id").eq("sale_id", s["id"]).execute().data or []):
                sb.table("accounting_invoice_payments").delete().eq("invoice_id", inv["id"]).execute()
                sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
                sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
            sb.table("accounting_transactions").delete().eq("property_id", p["id"]).execute()
            sb.table("payment_orders").delete().eq("property_id", p["id"]).execute()
            sb.table("sales").delete().eq("id", s["id"]).execute()
        sb.table("accounting_accounts").delete().ilike("code", f"%{PCODE}").execute()
        sb.table("properties").delete().eq("id", p["id"]).execute()
    sb.table("clients").delete().eq("name", "D05 Cliente").execute()


async def dash():
    from api.routes.accounting import get_accounting_dashboard
    return (await get_accounting_dashboard(period="all"))["summary"]


async def bs_ok():
    from api.routes.accounting import get_balance_sheet
    s = (await get_balance_sheet())["sections"]
    return abs(float(s["total_assets"]) - float(s["total_liabilities_and_equity"])) < 0.01


async def main():
    wipe()
    from api.models.schemas import SaleCreate, SaleType
    from api.routes.sales import create_sale
    from api.routes.accounting import record_invoice_payment

    bank = next(b for b in (sb.table("bank_accounts").select("id,accounting_account_id").execute().data or [])
                if b.get("accounting_account_id"))["id"]
    prop = sb.table("properties").insert({"address": "D05 St", "city": "Houston", "state": "Texas",
        "property_code": PCODE, "status": "published", "sale_price": PRICE}).execute().data[0]
    cli = sb.table("clients").insert({"name": "D05 Cliente", "status": "active", "monthly_income": 4000}).execute().data[0]

    d0 = await dash()
    print("BASELINE:", f"efectivo=${d0['total_bank_balance']:,.0f}  por_cobrar=${d0['accounts_receivable']:,.0f}  "
          f"ventas_rto=${d0['sales_by_type']['rto']:,.0f}")

    # RTO sale → income recognized + A/R to Capital
    sale = await create_sale(SaleCreate(property_id=prop["id"], client_id=cli["id"], sale_price=PRICE,
                             sale_type=SaleType.RTO, rto_down_payment=DOWN, rto_term_months=36, rto_monthly_payment=800))
    d1 = await dash()
    print("TRAS VENTA:", f"efectivo=${d1['total_bank_balance']:,.0f}  por_cobrar=${d1['accounts_receivable']:,.0f}  "
          f"ventas_rto=${d1['sales_by_type']['rto']:,.0f}  BS={await bs_ok()}")

    # find the Capital A/R invoice ([CAPFIN:]) and settle it (Capital pays Homes)
    ar = next((i for i in (sb.table("accounting_invoices").select("*").eq("sale_id", sale.id)
               .eq("direction", "receivable").execute().data or []) if "[CAPFIN:" in (i.get("notes") or "")), None)
    print(f"\nFactura por cobrar a Capital: {ar['invoice_number'] if ar else None}  total=${float(ar['total_amount']):,.0f}" if ar else "NO A/R INVOICE")

    record_invoice_payment(ar["id"], FINANCED, bank_account_id=bank, payment_method="transferencia",
                           notes="Capital paga a Homes (financiado RTO)")
    d2 = await dash()

    # recent transactions should include the cobro (bank leg)
    from api.routes.accounting import get_accounting_dashboard
    full = await get_accounting_dashboard(period="all")
    recent = full.get("recent_transactions", [])
    cobro_visible = any("D05" in (t.get("description") or "") or t.get("entity_type") == "invoice" for t in recent)

    print("TRAS COBRO:", f"efectivo=${d2['total_bank_balance']:,.0f}  por_cobrar=${d2['accounts_receivable']:,.0f}  "
          f"ventas_rto=${d2['sales_by_type']['rto']:,.0f}  BS={await bs_ok()}")

    checks = []
    def c(name, ok, detail=""):
        checks.append(ok); print(f"  {'✅' if ok else '❌'} {name}" + (f"  [{detail}]" if detail else ""))

    print("\nPRUEBAS item 5:")
    c("Gabriel · efectivo sube por el cobro", abs((d2['total_bank_balance'] - d1['total_bank_balance']) - FINANCED) < 0.01,
      f"+${d2['total_bank_balance']-d1['total_bank_balance']:,.0f}")
    c("Ambos · Por Cobrar baja por el cobro", abs((d1['accounts_receivable'] - d2['accounts_receivable']) - FINANCED) < 0.01,
      f"-${d1['accounts_receivable']-d2['accounts_receivable']:,.0f}")
    c("Abby · ingreso RTO sigue reconocido (no se pierde ni duplica)", abs(d2['sales_by_type']['rto'] - d1['sales_by_type']['rto']) < 0.01,
      f"${d2['sales_by_type']['rto']:,.0f}")
    c("El cobro aparece como transacción (ledger/recientes)", cobro_visible)
    c("Balance Sheet cuadra", await bs_ok())

    wipe()
    ok = all(checks)
    print(f"\n{'='*64}\n  {sum(checks)}/{len(checks)} — {'COBROS REFLEJADOS ✅' if ok else 'REVISAR ❌'}\n{'='*64}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
