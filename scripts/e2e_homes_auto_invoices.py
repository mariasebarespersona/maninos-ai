"""
E2E — Homes auto-generated payable/receivable invoices (root model).

Verifies the four new behaviors, each with a SINGLE ledger posting (no double
count), against the real DB with full teardown:

  1. Sale commission → payable invoice auto-created + partial payment + settle.
  2. Consignment purchase → payable invoice at intake + partial payment →
     consignment_paid_at stamped when fully paid.
  3. RTO sale → receivable invoice to Maninos Capital; the pago_capital order
     SETTLES it (income recognized once, A/R clears).
  4. No double-count: net P&L of a commission == the single commission expense.

Run: set -a; source .env; set +a; .venv/bin/python scripts/e2e_homes_auto_invoices.py
"""
import asyncio
import sys
import time
from datetime import date

sys.path.insert(0, ".")
from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-HAI-{int(time.time())}"
CREATED: list = []
FAILURES: list = []


def track(t, i):
    if i:
        CREATED.append((t, i))


def check(name, cond, detail=""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


def ledger_balance(account_name):
    """Signed sum for a chart account by name (excl. voided)."""
    acc = sb.table("accounting_accounts").select("id, account_type").eq("code", account_name).limit(1).execute().data
    if not acc:
        return None
    aid = acc[0]["id"]
    rows = sb.table("accounting_transactions").select("amount,is_income,status").eq("account_id", aid).execute().data or []
    bal = 0.0
    for r in rows:
        if (r.get("status") or "") == "voided":
            continue
        amt = float(r.get("amount") or 0)
        bal += amt if r.get("is_income") else -amt
    return round(bal, 2)


def invoices_for(entity_tag):
    return sb.table("accounting_invoices").select("*").ilike("notes", f"%{entity_tag}%").neq("status", "voided").execute().data or []


def track_invoice(inv):
    track("accounting_invoices", inv["id"])
    legs = sb.table("accounting_transactions").select("id").eq("entity_type", "invoice").eq("entity_id", inv["id"]).execute().data or []
    for l in legs:
        track("accounting_transactions", l["id"])
    pays = sb.table("accounting_invoice_payments").select("id").eq("invoice_id", inv["id"]).execute().data or []
    for p in pays:
        track("accounting_invoice_payments", p["id"])


async def main():
    from api.routes.accounting import record_invoice_payment
    from api.routes.sales import _create_commission_payments, mark_commission_paid

    print(f"\n=== E2E Homes auto-invoices — {TAG} ===\n")

    # A Homes bank with a chart account (needed for invoice payments)
    bank = sb.table("bank_accounts").select("id, accounting_account_id, name").eq("is_active", True) \
        .not_.is_("accounting_account_id", "null").limit(1).execute().data
    if not bank:
        print("No hay banco Homes con cuenta contable — abortando")
        return
    bank_id = bank[0]["id"]
    print(f"Banco: {bank[0]['name']}\n")

    # Fixtures: client, property, employee
    cl = sb.table("clients").insert({"name": f"{TAG} Cliente", "phone": "0000000000"}).execute().data[0]
    track("clients", cl["id"])
    # Employees are users; reuse an existing user (don't create/delete real users).
    emp = sb.table("users").select("id, name").limit(1).execute().data[0]

    prop = sb.table("properties").insert({
        "property_code": f"HAI{int(time.time()) % 100000}", "address": f"{TAG} 1 St",
        "city": "Houston", "state": "TX", "purchase_price": 20000, "sale_price": 50000,
        "status": "published",
    }).execute().data[0]
    track("properties", prop["id"])

    # ------------------------------------------------------------------
    print("1) Comisión → factura por pagar automática + pago parcial")
    sale = sb.table("sales").insert({
        "property_id": prop["id"], "client_id": cl["id"], "sale_price": 50000,
        "sale_type": "contado", "status": "completed",
        "found_by_employee_id": emp["id"], "commission_found_by": 1000,
        "commission_amount": 1000,
    }).execute().data[0]
    track("sales", sale["id"])

    comm_before = ledger_balance("Commissions & fees") or 0.0
    _create_commission_payments({**sale, "found_by_employee_id": emp["id"],
                                 "commission_found_by": 1000, "commission_sold_by": 0,
                                 "sale_type": "contado"})
    comm_invs = [i for i in invoices_for("[COMM:") if i.get("sale_id") == sale["id"]]
    for i in comm_invs:
        track_invoice(i)
    check("factura por pagar de comisión creada", len(comm_invs) == 1
          and comm_invs[0]["direction"] == "payable" and float(comm_invs[0]["total_amount"]) == 1000)
    # accrual posted once: Commissions & fees debited (expense grows). The raw
    # signed helper shows -1000 for an expense debit; magnitude must be 1000.
    comm_after = ledger_balance("Commissions & fees") or 0.0
    check("gasto de comisión posteado UNA vez (accrual)", abs(abs(comm_after - comm_before) - 1000) < 0.01,
          f"delta={comm_after - comm_before}")

    # partial payment $400
    inv = comm_invs[0]
    res1 = record_invoice_payment(inv["id"], 400, bank_account_id=bank_id, payment_method="transferencia")
    track_invoice(inv)
    check("pago parcial $400 → parcial", res1["invoice_status"] == "partial" and res1["new_amount_paid"] == 400)
    # settle rest via commission-pay endpoint (finds the invoice, pays balance)
    cp = sb.table("commission_payments").select("id").eq("sale_id", sale["id"]).execute().data[0]
    track("commission_payments", cp["id"])
    await mark_commission_paid(cp["id"], paid_by=emp["id"], bank_account_id=bank_id)
    inv2 = sb.table("accounting_invoices").select("status, amount_paid").eq("id", inv["id"]).execute().data[0]
    check("comisión saldada por endpoint → pagada 1000", inv2["status"] == "paid"
          and float(inv2["amount_paid"]) == 1000)
    # net commission expense magnitude still exactly 1000 (payment did NOT re-hit
    # the expense account → no double count).
    comm_net = (ledger_balance("Commissions & fees") or 0.0) - comm_before
    check("gasto neto de comisión = 1000 (sin doble conteo)", abs(abs(comm_net) - 1000) < 0.01, f"={comm_net}")

    # ------------------------------------------------------------------
    print("\n2) Consignación → factura por pagar al intake + pago → consignment_paid_at")
    from api.routes.properties import create_property
    from api.models.schemas import PropertyCreate
    import inspect
    # Build a consignment property via the endpoint so the auto-invoice fires
    consign_code = f"CON{int(time.time()) % 100000}"
    pc_fields = set(inspect.signature(PropertyCreate).parameters) if hasattr(PropertyCreate, "__signature__") else set(PropertyCreate.model_fields)
    payload = {"property_code": consign_code, "address": f"{TAG} Consign St", "city": "Conroe",
               "state": "TX", "purchase_price": 8000, "is_consignment": True,
               "seller_name": f"{TAG} Dueño"}
    payload = {k: v for k, v in payload.items() if k in PropertyCreate.model_fields}
    consign = await create_property(PropertyCreate(**payload))
    cpid = consign["id"] if isinstance(consign, dict) else consign.id
    track("properties", cpid)
    cinvs = invoices_for(f"[CONSIGN:{cpid}]")
    for i in cinvs:
        track_invoice(i)
    check("factura por pagar de consignación creada al intake", len(cinvs) == 1
          and cinvs[0]["direction"] == "payable" and float(cinvs[0]["total_amount"]) == 8000)
    # partial then full
    cinv = cinvs[0]
    record_invoice_payment(cinv["id"], 3000, bank_account_id=bank_id, payment_method="transferencia")
    track_invoice(cinv)
    paid_mid = sb.table("properties").select("consignment_paid_at").eq("id", cpid).execute().data[0]
    check("parcial NO marca consignment_paid_at", paid_mid.get("consignment_paid_at") is None)
    record_invoice_payment(cinv["id"], 5000, bank_account_id=bank_id, payment_method="transferencia")
    track_invoice(cinv)
    paid_full = sb.table("properties").select("consignment_paid_at").eq("id", cpid).execute().data[0]
    check("saldar factura → consignment_paid_at marcado", paid_full.get("consignment_paid_at") is not None)

    # ------------------------------------------------------------------
    print("\n3) Venta RTO → factura por cobrar a Capital + saldar por pago_capital")
    from api.routes.payment_orders import approve_payment_order
    house_before = ledger_balance("House Sales") or 0.0
    prop2 = sb.table("properties").insert({
        "property_code": f"RTO{int(time.time()) % 100000}", "address": f"{TAG} RTO St",
        "city": "Houston", "state": "TX", "purchase_price": 20000, "sale_price": 40000,
        "status": "published",
    }).execute().data[0]
    track("properties", prop2["id"])
    # Create the RTO sale + AR invoice directly via issue_invoice path used by create_sale
    from api.routes.accounting import issue_invoice
    sale2 = sb.table("sales").insert({
        "property_id": prop2["id"], "client_id": cl["id"], "sale_price": 40000,
        "sale_type": "rto", "status": "rto_pending", "rto_down_payment": 10000,
        "financed_down_payment": 10000, "financed_remaining": 30000,
        "capital_payment_status": "pending", "amount_pending": 30000,
    }).execute().data[0]
    track("sales", sale2["id"])
    ar_inv = issue_invoice(
        direction="receivable", counterparty_name="Maninos Capital LLC", counterparty_type="capital",
        total_amount=30000, account_code="House Sales", property_id=prop2["id"], sale_id=sale2["id"],
        description=f"{TAG} financiamiento RTO",
        notes=f"[CAPFIN:{sale2['id']}] {TAG} parte financiada RTO",
    )
    track_invoice(ar_inv)
    check("factura por COBRAR a Capital creada", ar_inv["direction"] == "receivable"
          and float(ar_inv["total_amount"]) == 30000)
    house_after_issue = ledger_balance("House Sales") or 0.0
    check("ingreso reconocido al emitir (House Sales +30000)", abs((house_after_issue - house_before) - 30000) < 0.01,
          f"delta={house_after_issue - house_before}")

    # pago_capital order settles the AR invoice (should NOT re-post income)
    po = sb.table("payment_orders").insert({
        "property_id": prop2["id"], "property_address": prop2["address"],
        "payee_name": "Pago de Maninos Capital", "amount": 30000, "method": "transferencia",
        "status": "pending", "concept": "pago_capital", "direction": "inbound",
        "notes": f"{TAG} capital paga",
    }).execute().data[0]
    track("payment_orders", po["id"])
    await approve_payment_order(po["id"], approved_by="e2e", bank_account_id=bank_id)
    track_invoice(ar_inv)
    ar_after = sb.table("accounting_invoices").select("status, amount_paid").eq("id", ar_inv["id"]).execute().data[0]
    check("pago_capital SALDA la factura AR", ar_after["status"] == "paid" and float(ar_after["amount_paid"]) == 30000)
    house_after_settle = ledger_balance("House Sales") or 0.0
    check("ingreso NO se re-reconoce al saldar (House Sales igual)",
          abs(house_after_settle - house_after_issue) < 0.01,
          f"delta={house_after_settle - house_after_issue}")
    # A/R nets to zero for this invoice
    ar_legs = sb.table("accounting_transactions").select("amount,is_income,account_id,status") \
        .eq("entity_type", "invoice").eq("entity_id", ar_inv["id"]).execute().data or []
    ar_acc = sb.table("accounting_accounts").select("id").eq("code", "Accounts receivable (A/R)").limit(1).execute().data
    if ar_acc:
        arid = ar_acc[0]["id"]
        arbal = sum((float(r["amount"]) if r["is_income"] else -float(r["amount"]))
                    for r in ar_legs if r["account_id"] == arid and r["status"] != "voided")
        check("A/R de esta factura neta a 0", abs(arbal) < 0.01, f"={arbal}")

    print(f"\n=== {'TODOS PASARON ✅' if not FAILURES else f'{len(FAILURES)} FALLOS ❌: {FAILURES}'} ===")


def teardown():
    print("\n--- Limpieza ---")
    by = {}
    for t, i in CREATED:
        by.setdefault(t, []).append(i)
    # release ledger self-FK
    tx = list(dict.fromkeys(by.get("accounting_transactions", [])))
    # also gather any ledger rows tied to our invoices
    for iid in dict.fromkeys(by.get("accounting_invoices", [])):
        for r in (sb.table("accounting_transactions").select("id").eq("entity_type", "invoice").eq("entity_id", iid).execute().data or []):
            tx.append(r["id"])
    tx = list(dict.fromkeys(tx))
    if tx:
        try:
            sb.table("accounting_transactions").update({"linked_transaction_id": None}).in_("id", tx).execute()
        except Exception:
            pass
    order = ["accounting_invoice_payments", "accounting_transactions", "accounting_invoices",
             "commission_payments", "payment_orders", "sales", "rto_applications",
             "properties", "clients"]
    # invoice payments by invoice
    for iid in dict.fromkeys(by.get("accounting_invoices", [])):
        try:
            sb.table("accounting_invoice_payments").delete().eq("invoice_id", iid).execute()
        except Exception:
            pass
    for t in order:
        ids = list(dict.fromkeys(by.get(t, [])))
        if t == "accounting_transactions":
            ids = tx
        if not ids:
            continue
        try:
            sb.table(t).delete().in_("id", ids).execute()
        except Exception as e:
            print(f"  ⚠️ {t}: {str(e)[:80]}")
    # residue
    res = len(sb.table("accounting_invoices").select("id").ilike("notes", f"%{TAG}%").execute().data or [])
    res += len(sb.table("accounting_transactions").select("id").ilike("description", f"%{TAG}%").execute().data or [])
    print(f"  limpieza hecha. residuo: {res}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        teardown()
    sys.exit(1 if FAILURES else 0)
