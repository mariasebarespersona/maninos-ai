#!/usr/bin/env python3
"""E2E for the consignment flow (Abby items 6 & 11).

11. Al comprar/ingresar una casa EN CONSIGNACIÓN se genera automáticamente una
    factura POR PAGAR (la deuda al dueño anterior) — visible desde el día 1.
 6. Una casa en consignación se puede VENDER y ver reflejado el ingreso/venta
    ANTES de pagar al dueño anterior (la deuda por pagar sigue pendiente).

Creates a throwaway consignment house + client, sells it (RTO — income posts at
issuance) without paying the owner, checks both facts against the ledger, and
cleans up.
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
PCODE = "E2ECONS"
PURCHASE = 20000.0   # owed to the previous owner
PRICE = 35000.0
DOWN = 12000.0
FINANCED = PRICE - DOWN
verdicts = []


def wipe():
    for p in (sb.table("properties").select("id").eq("property_code", PCODE).execute().data or []):
        for s in (sb.table("sales").select("id").eq("property_id", p["id"]).execute().data or []):
            sb.table("commission_payments").delete().eq("sale_id", s["id"]).execute()
            sb.table("rto_applications").delete().eq("sale_id", s["id"]).execute()
            sb.table("sale_payments").delete().eq("sale_id", s["id"]).execute()
            for inv in (sb.table("accounting_invoices").select("id").eq("sale_id", s["id"]).execute().data or []):
                sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
                sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
            sb.table("payment_orders").delete().eq("property_id", p["id"]).execute()
            sb.table("sales").delete().eq("id", s["id"]).execute()
        # property-level consignment invoice + its legs
        for inv in (sb.table("accounting_invoices").select("id").eq("property_id", p["id"]).execute().data or []):
            sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
            sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
        sb.table("accounting_transactions").delete().eq("property_id", p["id"]).execute()
        sb.table("payment_orders").delete().eq("property_id", p["id"]).execute()
        sb.table("properties").delete().eq("id", p["id"]).execute()
    sb.table("accounting_accounts").delete().ilike("code", f"%{PCODE}").execute()
    sb.table("clients").delete().eq("name", "E2E Consign Cliente").execute()


async def main():
    wipe()
    from api.models.schemas import PropertyCreate, SaleCreate, SaleType
    from api.routes.properties import create_property
    from api.routes.sales import create_sale
    from api.routes.accounting import get_accounting_dashboard

    # ---------- ITEM 11: intake genera factura por pagar ----------
    print("=" * 70)
    print("ITEM 11 — comprar en consignación genera una factura POR PAGAR")
    print("=" * 70)
    prop = await create_property(PropertyCreate(
        address="E2E Consign St", city="Houston", state="Texas", property_code=PCODE,
        purchase_price=PURCHASE, sale_price=PRICE, is_consignment=True, status="published"))

    invs = sb.table("accounting_invoices").select("*").eq("property_id", prop.id).eq("direction", "payable").execute().data or []
    consign = next((i for i in invs if "[CONSIGN:" in (i.get("notes") or "")), None)
    print(f"\nfacturas por pagar de la casa: {len(invs)}")
    if consign:
        print(f"  {consign['invoice_number']}  total=${float(consign['total_amount']):,.0f}  "
              f"tipo={consign.get('counterparty_type')}  status={consign.get('status')}  pagado=${float(consign.get('amount_paid') or 0):,.0f}")
    dash = (await get_accounting_dashboard(period="all"))["summary"]
    ap = dash["accounts_payable"]
    # A capitalized payable debits Inventory / credits A/P — the Balance Sheet
    # must stay balanced and NOTHING should hit the P&L (a purchase isn't an
    # expense until the house sells).
    from api.routes.accounting import get_balance_sheet
    bs = (await get_balance_sheet())["sections"]
    a, le = float(bs["total_assets"]), float(bs["total_liabilities_and_equity"])
    balanced = abs(a - le) < 0.01
    net = float(dash["net_profit"])
    print(f"Cuentas por pagar (Por Pagar) totales: ${ap:,.2f}  (incluye la consignación)")
    print(f"Balance Sheet: Activos ${a:,.2f} == Pasivo+Capital ${le:,.2f} -> cuadra={balanced}")
    print(f"Impacto en P&L (net_profit): ${net:,.2f}  (esperado $0 — la compra NO es gasto)")
    v11 = (bool(consign) and abs(float(consign["total_amount"]) - PURCHASE) < 0.01
           and ap >= PURCHASE - 0.01 and balanced and abs(net) < 0.01)
    print(f"VERDICT 11: {'FIXED ✅ (factura por pagar automática; BS cuadra; sin tocar P&L)' if v11 else 'BROKEN ❌'}")
    verdicts.append(("11", v11))

    # ---------- ITEM 6: vender antes de pagar al dueño ----------
    print("\n" + "=" * 70)
    print("ITEM 6 — vender la consignación y ver el ingreso ANTES de pagar al dueño")
    print("=" * 70)
    cli = sb.table("clients").insert({"name": "E2E Consign Cliente", "status": "active",
                                      "monthly_income": 4000}).execute().data[0]
    rto_before = (await get_accounting_dashboard(period="all"))["summary"]["sales_by_type"]["rto"]

    sale = await create_sale(SaleCreate(property_id=prop.id, client_id=cli["id"], sale_price=PRICE,
                             sale_type=SaleType.RTO, rto_down_payment=DOWN, rto_term_months=36,
                             rto_monthly_payment=800))

    dash2 = (await get_accounting_dashboard(period="all"))["summary"]
    rto_after = dash2["sales_by_type"]["rto"]
    d_rto = round(rto_after - rto_before, 2)

    # the consignment payable must STILL be outstanding (owner not paid yet)
    consign_now = sb.table("accounting_invoices").select("*").eq("id", consign["id"]).single().execute().data
    prop_now = sb.table("properties").select("status, consignment_paid_at").eq("id", prop.id).single().execute().data
    owner_unpaid = float(consign_now.get("amount_paid") or 0) < 0.01 and not prop_now.get("consignment_paid_at")

    print(f"\nIngreso de venta reflejado (Ventas Capital RTO): +${d_rto:,.2f} (esperado +{FINANCED:,.0f})")
    print(f"Deuda al dueño anterior: total=${float(consign_now['total_amount']):,.0f}  pagado=${float(consign_now.get('amount_paid') or 0):,.0f}  "
          f"status={consign_now.get('status')}  → {'PENDIENTE (aún no pagado)' if owner_unpaid else 'PAGADO'}")
    print(f"Estado de la casa: {prop_now.get('status')} (vendida/reservada, no revierte)")
    v6 = abs(d_rto - FINANCED) < 0.01 and owner_unpaid
    print(f"VERDICT 6: {'FIXED ✅ (la venta se refleja antes de pagar al dueño; la deuda sigue pendiente)' if v6 else 'BROKEN ❌'}")
    verdicts.append(("6", v6))

    wipe()
    print("\ncleaned")
    ok = all(v for _, v in verdicts)
    print(f"\n{'='*70}\n  {sum(v for _,v in verdicts)}/{len(verdicts)} OK — "
          f"{'CONSIGNACIÓN CORRECTA ✅' if ok else 'REVISAR ❌'}\n{'='*70}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
