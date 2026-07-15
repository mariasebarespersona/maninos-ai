#!/usr/bin/env python3
"""Empirical diagnosis of Abby items 19 & 20 (Homes accounting resumen).

19. "ventas RTO => en 'Ventas Capital' dentro del resumen de contabilidad de
     Homes" — an RTO/financed sale must land in the resumen's 'Ventas Capital
     (RTO)' line (sales_by_type.rto, fed by the 'House Sales - RTO' account),
     not in Ventas Contado.
20. "desglose de gastos que se actualice bien cada vez que debe" — every time an
     expense posts, the expense breakdown must reflect it immediately and stay
     reconciled with the P&L (income statement) total.

Creates throwaway data, reads the real /dashboard resumen before/after, and
cleans up. Read-only conclusion.
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
PCODE = "D1920"
verdicts = []


def wipe():
    for p in (sb.table("properties").select("id").eq("property_code", PCODE).execute().data or []):
        for s in (sb.table("sales").select("id").eq("property_id", p["id"]).execute().data or []):
            sb.table("commission_payments").delete().eq("sale_id", s["id"]).execute()
            sb.table("rto_applications").delete().eq("sale_id", s["id"]).execute()
            for inv in (sb.table("accounting_invoices").select("id").eq("sale_id", s["id"]).execute().data or []):
                sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
                sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
            sb.table("accounting_transactions").delete().eq("property_id", p["id"]).execute()
            sb.table("payment_orders").delete().eq("property_id", p["id"]).execute()
            sb.table("sales").delete().eq("id", s["id"]).execute()
        sb.table("properties").delete().eq("id", p["id"]).execute()
    sb.table("accounting_accounts").delete().ilike("code", f"%{PCODE}").execute()
    sb.table("clients").delete().eq("name", "DIAG 1920 Cliente").execute()
    for inv in (sb.table("accounting_invoices").select("id").ilike("description", "DIAG1920%").execute().data or []):
        sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
        sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()


async def dash():
    from api.routes.accounting import get_accounting_dashboard
    return (await get_accounting_dashboard(period="all"))["summary"]


# expense bucket -> the summary key that carries it
BUCKET_KEY = {"servicios": "total_servicios", "otros_gastos": "manual_expense",
              "comisiones": "total_commissions", "compra_casas": "total_purchases",
              "renovaciones": "total_renovations", "movida": "total_movida"}


async def pnl_totals():
    from api.routes.accounting import get_income_statement
    r = await get_income_statement(start_date="2000-01-01", end_date="2100-01-01")
    s = r["sections"]
    exp = float(s.get("total_cogs", 0)) + float(s.get("total_expenses", 0)) + float(s.get("total_other_expenses", 0))
    return round(exp, 2)


async def main():
    wipe()

    # ================= ISSUE 19 =================
    print("=" * 70)
    print("ISSUE 19 — venta RTO cae en 'Ventas Capital (RTO)' del resumen Homes")
    print("=" * 70)
    before = await dash()
    rto_before = before["sales_by_type"]["rto"]
    contado_before = before["sales_by_type"]["contado"]

    prop = sb.table("properties").insert({"address": "DIAG 1920 St", "city": "Houston",
        "state": "Texas", "property_code": PCODE, "status": "published", "sale_price": 40000}).execute().data[0]
    cli = sb.table("clients").insert({"name": "DIAG 1920 Cliente", "status": "active",
        "monthly_income": 4000}).execute().data[0]

    from api.models.schemas import SaleCreate, SaleType
    from api.routes.sales import create_sale
    PRICE, DOWN = 40000.0, 12000.0
    FINANCED = PRICE - DOWN
    data = SaleCreate(property_id=prop["id"], client_id=cli["id"], sale_price=PRICE,
                      sale_type=SaleType.RTO, rto_down_payment=DOWN, rto_term_months=36,
                      rto_monthly_payment=800)
    sale = await create_sale(data)

    after = await dash()
    rto_after = after["sales_by_type"]["rto"]
    contado_after = after["sales_by_type"]["contado"]
    d_rto = round(rto_after - rto_before, 2)
    d_contado = round(contado_after - contado_before, 2)
    print(f"\nVentas Capital (RTO): {rto_before} -> {rto_after}   (Δ {d_rto:+,.2f}, esperado +{FINANCED:,.2f} financiado)")
    print(f"Ventas Contado:       {contado_before} -> {contado_after}   (Δ {d_contado:+,.2f}, esperado 0)")
    # the financed remainder (28,000) is recognized to 'House Sales - RTO' at sale
    v19 = abs(d_rto - FINANCED) < 0.01 and abs(d_contado) < 0.01
    print(f"VERDICT 19: {'FIXED ✅ (el financiado RTO entra en Ventas Capital, no en Contado)' if v19 else 'BROKEN ❌'}")
    verdicts.append(("19", v19))

    # ================= ISSUE 20 =================
    print("\n" + "=" * 70)
    print("ISSUE 20 — el desglose de gastos se actualiza en cada posteo y cuadra con P&L")
    print("=" * 70)
    from api.routes.accounting import issue_invoice
    steps = [
        ("Legal & accounting services", 800.0, "servicios", "DIAG1920 honorarios"),
        ("Office supplies", 150.0, "servicios", "DIAG1920 papeleria"),
        ("Bank fees & service charges", 45.0, "otros_gastos", "DIAG1920 comision banco"),
    ]
    ok20 = True
    for code, amt, bucket, desc in steps:
        d0 = await dash()
        b0 = d0.get(BUCKET_KEY[bucket])
        te0 = d0["total_expenses"]
        issue_invoice(direction="payable", counterparty_name="DIAG Proveedor",
                      counterparty_type="vendor", total_amount=amt, account_code=code, description=desc)
        d1 = await dash()
        b1 = d1.get(BUCKET_KEY[bucket])
        te1 = d1["total_expenses"]
        pnl = await pnl_totals()
        d_bucket = round((b1 - b0), 2) if (b0 is not None and b1 is not None) else None
        d_total = round(te1 - te0, 2)
        reconc = abs(te1 - pnl) < 0.01
        okstep = abs(d_total - amt) < 0.01 and reconc and (d_bucket is None or abs(d_bucket - amt) < 0.01)
        ok20 = ok20 and okstep
        print(f"\n+${amt:,.0f} a '{code}' (bucket {bucket}):")
        print(f"  bucket Δ={d_bucket}  total_expenses Δ={d_total:+,.2f} (esperado +{amt:,.0f})")
        print(f"  total_expenses={te1:,.2f}  ==  P&L expenses={pnl:,.2f}  -> reconcilia={reconc}  {'✅' if okstep else '❌'}")
    print(f"\nVERDICT 20: {'FIXED ✅ (el desglose se actualiza en cada gasto y cuadra con el P&L)' if ok20 else 'BROKEN ❌'}")
    verdicts.append(("20", ok20))

    wipe()
    print("\ncleaned")
    ok = all(v for _, v in verdicts)
    print(f"\n{'='*70}\n  {sum(v for _,v in verdicts)}/{len(verdicts)} OK — "
          f"{'RESUMEN HOMES CORRECTO ✅' if ok else 'REVISAR ❌'}\n{'='*70}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
