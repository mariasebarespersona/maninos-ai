#!/usr/bin/env python3
"""Empirical diagnosis of Abby items 17 & 18.

17. "El pago de la comisión de venta no se liga a la casa, la muestra en
     Commissions & fees" — the sale-commission expense must land on the
     per-house 'Comisión <CODE>' account (linked to the house), NOT the generic
     'Commissions & fees'.
18. "pago de facturas por servicios no los liga al Profit & Loss" — paying a
     service invoice must leave its expense in the P&L (booked once, at issue).

Creates throwaway data, prints exactly which P&L accounts each flow hits, and
cleans up. Read-only conclusion (no fix here); just tells us the truth.
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
PCODE = "D1718"


def acc_name(account_id):
    a = sb.table("accounting_accounts").select("code,name,account_type").eq("id", account_id).single().execute().data
    return f"{a['code']} ({a['account_type']})" if a else "?"


def pl_legs(entity_id):
    """P&L legs (income/COGS/expense) posted for an entity, as (account, amount, is_income)."""
    PL = {"Income", "Other Income", "Cost of Goods Sold", "Expenses", "Expense",
          "Other Expense", "Other Expenses"}
    rows = sb.table("accounting_transactions").select("*").eq("entity_id", entity_id).execute().data or []
    out = []
    for r in rows:
        a = sb.table("accounting_accounts").select("code,account_type").eq("id", r["account_id"]).single().execute().data
        if a and a.get("account_type") in PL:
            out.append((a["code"], a["account_type"], float(r.get("amount") or 0), r.get("is_income")))
    return out


def wipe():
    for p in (sb.table("properties").select("id").eq("property_code", PCODE).execute().data or []):
        for s in (sb.table("sales").select("id").eq("property_id", p["id"]).execute().data or []):
            # commission_payments FK-references its payment transaction — drop it first
            sb.table("commission_payments").delete().eq("sale_id", s["id"]).execute()
            for inv in (sb.table("accounting_invoices").select("id").eq("sale_id", s["id"]).execute().data or []):
                sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
                sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()
            sb.table("accounting_transactions").delete().eq("property_id", p["id"]).execute()
            sb.table("sales").delete().eq("id", s["id"]).execute()
        sb.table("properties").delete().eq("id", p["id"]).execute()
    sb.table("accounting_accounts").delete().ilike("code", f"%{PCODE}").execute()
    sb.table("clients").delete().eq("name", "DIAG 1718 Cliente").execute()
    for inv in (sb.table("accounting_invoices").select("id").ilike("description", "DIAG1718-SVC%").execute().data or []):
        sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
        sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()


async def main():
    verdicts = []
    wipe()
    bank = next(b for b in (sb.table("bank_accounts").select("id,accounting_account_id").execute().data or [])
                if b.get("accounting_account_id"))
    bank_id = bank["id"]

    # ============ ISSUE 17 ============
    print("=" * 70)
    print("ISSUE 17 — comisión de venta ligada a la casa (no 'Commissions & fees')")
    print("=" * 70)
    prop = sb.table("properties").insert({"address": "DIAG 1718 St", "city": "Houston",
        "state": "Texas", "property_code": PCODE, "status": "published", "sale_price": 40000}).execute().data[0]
    cli = sb.table("clients").insert({"name": "DIAG 1718 Cliente", "status": "active"}).execute().data[0]

    from api.models.schemas import SaleCreate, SaleType
    from api.routes.sales import create_sale, mark_commission_paid

    # a purchasing employee to receive the commission
    emp = (sb.table("users").select("id,name").in_("role", ["operations", "comprador", "vendedor", "admin"]).limit(1).execute().data or [])
    emp_id = emp[0]["id"] if emp else None
    data = SaleCreate(property_id=prop["id"], client_id=cli["id"], sale_price=40000,
                      sale_type=SaleType.CONTADO, found_by_employee_id=emp_id, commission_found_by=1500,
                      commission_sold_by=0)
    sale = await create_sale(data)

    comm_inv = sb.table("accounting_invoices").select("*").eq("sale_id", sale.id).eq("direction", "payable").execute().data or []
    print(f"\ncommission invoices: {len(comm_inv)}")
    for inv in comm_inv:
        legs = pl_legs(inv["id"])
        print(f"  invoice {inv['invoice_number']} -> P&L legs: {legs}")
    cp = sb.table("commission_payments").select("*").eq("sale_id", sale.id).execute().data or []
    print(f"commission_payments: {[(c.get('payee_name') or c.get('employee_id'), c['status']) for c in cp]}")

    # pay the commission
    if cp:
        await mark_commission_paid(cp[0]["id"], paid_by=emp_id or "system", bank_account_id=bank_id)
        after = pl_legs(comm_inv[0]["id"]) if comm_inv else []
        # any NEW commissions&fees posting anywhere for this property?
        genfees = [r for r in (sb.table("accounting_transactions").select("account_id").eq("property_id", prop["id"]).execute().data or [])
                   if "Commissions & fees" in acc_name(r["account_id"])]
        print(f"\nAFTER PAYMENT: commission P&L legs unchanged = {after}")
        print(f"'Commissions & fees' postings for this house: {len(genfees)}  (want 0)")
        verdict17 = bool(comm_inv) and all(l[0] == f"Comisión {PCODE}" for l in pl_legs(comm_inv[0]['id'])) and len(genfees) == 0
        print(f"VERDICT 17: {'FIXED ✅ (expense on Comisión ' + PCODE + ', none on Commissions & fees)' if verdict17 else 'BROKEN ❌'}")
        verdicts.append(("17", verdict17))

    # ============ ISSUE 18 ============
    print("\n" + "=" * 70)
    print("ISSUE 18 — pago de factura de servicio se refleja en P&L")
    print("=" * 70)
    from api.routes.accounting import issue_invoice, record_invoice_payment
    svc = issue_invoice(direction="payable", counterparty_name="DIAG Proveedor Servicios",
                        counterparty_type="vendor", total_amount=800.0,
                        account_code="Legal & accounting services", description="DIAG1718-SVC honorarios")
    at_issue = pl_legs(svc["id"])
    print(f"\nservice invoice {svc['invoice_number']} at ISSUE -> P&L legs: {at_issue}")
    pay = record_invoice_payment(svc["id"], 800.0, bank_account_id=bank_id, payment_method="transferencia",
                                 notes="DIAG pago servicio")
    after_pay = pl_legs(svc["id"])
    inv_after = sb.table("accounting_invoices").select("status,amount_paid").eq("id", svc["id"]).single().execute().data
    print(f"service invoice after PAYMENT -> P&L legs: {after_pay}  | status={inv_after['status']} paid={inv_after['amount_paid']}")
    verdict18 = len(at_issue) == 1 and at_issue[0][0] == "Legal & accounting services" and after_pay == at_issue
    print(f"VERDICT 18: {'FIXED ✅ (expense in P&L once at issue; payment settles A/P→bank, P&L unchanged)' if verdict18 else 'BROKEN ❌'}")
    verdicts.append(("18", verdict18))

    wipe()
    print("\ncleaned")

    ok = all(v for _, v in verdicts)
    print(f"\n{'='*70}\n  {sum(v for _,v in verdicts)}/{len(verdicts)} OK — "
          f"{'AMBOS LIGADOS AL P&L ✅' if ok else 'REVISAR ❌'}\n{'='*70}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
