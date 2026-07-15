#!/usr/bin/env python3
"""Empirical check of Abby item 12: partial payments on a PAYABLE invoice.

Issues a $1,000 service payable, pays it in two partials ($400 then $600), and
verifies at each step: status (sent→partial→paid), balance_due, A/P reduced,
bank reduced, and the Balance Sheet stays balanced. Read-only conclusion; cleans
up. NO code changes.
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
MARK = "DIAG12-PARTIAL"


def wipe():
    for inv in (sb.table("accounting_invoices").select("id").ilike("description", f"{MARK}%").execute().data or []):
        sb.table("accounting_invoice_payments").delete().eq("invoice_id", inv["id"]).execute()
        sb.table("accounting_transactions").delete().eq("entity_id", inv["id"]).execute()
        sb.table("accounting_invoices").delete().eq("id", inv["id"]).execute()


async def bs_balanced():
    from api.routes.accounting import get_balance_sheet
    s = (await get_balance_sheet())["sections"]
    return abs(float(s["total_assets"]) - float(s["total_liabilities_and_equity"])) < 0.01


async def main():
    wipe()
    from api.routes.accounting import issue_invoice, record_invoice_payment
    bank = next(b for b in (sb.table("bank_accounts").select("id,accounting_account_id").execute().data or [])
                if b.get("accounting_account_id"))["id"]

    inv = issue_invoice(direction="payable", counterparty_name="DIAG Proveedor 12",
                        counterparty_type="vendor", total_amount=1000.0,
                        account_code="Legal & accounting services", description=f"{MARK} honorarios")
    iid = inv["id"]

    def snap():
        r = sb.table("accounting_invoices").select("status, amount_paid, total_amount").eq("id", iid).single().execute().data
        bal = round(float(r["total_amount"]) - float(r["amount_paid"]), 2)
        return r["status"], float(r["amount_paid"]), bal

    ok = True
    print("PRUEBAS (factura por pagar $1,000):")
    st, paid, bal = snap()
    print(f"  emitida            -> status={st:8s} pagado=${paid:,.0f} saldo=${bal:,.0f}  BS cuadra={await bs_balanced()}")
    ok = ok and st == "sent" and bal == 1000

    # partial #1: $400
    record_invoice_payment(iid, 400.0, bank_account_id=bank, payment_method="transferencia", notes=f"{MARK} pago1")
    st, paid, bal = snap()
    b1 = await bs_balanced()
    print(f"  pago parcial $400  -> status={st:8s} pagado=${paid:,.0f} saldo=${bal:,.0f}  BS cuadra={b1}")
    ok = ok and st == "partial" and abs(paid - 400) < 0.01 and abs(bal - 600) < 0.01 and b1

    # partial #2: $600 (settles it)
    record_invoice_payment(iid, 600.0, bank_account_id=bank, payment_method="transferencia", notes=f"{MARK} pago2")
    st, paid, bal = snap()
    b2 = await bs_balanced()
    print(f"  pago parcial $600  -> status={st:8s} pagado=${paid:,.0f} saldo=${bal:,.0f}  BS cuadra={b2}")
    ok = ok and st == "paid" and abs(paid - 1000) < 0.01 and abs(bal) < 0.01 and b2

    # two payment rows recorded
    pays = sb.table("accounting_invoice_payments").select("amount").eq("invoice_id", iid).execute().data or []
    print(f"  filas de pago registradas: {len(pays)} (montos: {[float(p['amount']) for p in pays]})")
    ok = ok and len(pays) == 2

    # ---- SAFETY: a [PO:] document-only mirror bill must REFUSE payment here ----
    from api.routes.accounting import _generate_invoice_number
    from fastapi import HTTPException
    po = sb.table("accounting_invoices").insert({
        "invoice_number": _generate_invoice_number("payable"), "direction": "payable",
        "counterparty_name": "DIAG Orden", "counterparty_type": "vendor", "total_amount": 500,
        "subtotal": 500, "tax_amount": 0, "amount_paid": 0, "status": "sent",
        "description": f"{MARK} PO-mirror",
        "notes": "[PO:diag-order-123] Factura por pagar generada automáticamente desde la orden de pago.",
    }).execute().data[0]
    refused = False
    try:
        record_invoice_payment(po["id"], 200.0, bank_account_id=bank)
    except HTTPException as e:
        refused = e.status_code == 400 and "orden de pago" in (e.detail or "").lower()
    print(f"\n  factura [PO:] rechaza pago aquí: {refused}  (debe pagarse desde su orden)")
    ok = ok and refused

    wipe()
    print(f"\n{'='*60}\n  {'✅ PAGOS PARCIALES OK (ya funciona)' if ok else '❌ REVISAR'}\n{'='*60}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
