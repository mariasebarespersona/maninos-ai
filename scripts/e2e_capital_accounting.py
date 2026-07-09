"""
E2E — Capital accounting parity suite.

Runs every new Capital accounting flow end-to-end against the REAL database
by importing the actual endpoint functions (same pattern as previous E2E
sessions). Everything created is tracked and deleted in the finally block —
0 residue.

Requires migrations 042 + 097 to be applied.

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_capital_accounting.py
"""
import asyncio
import sys
import time
from datetime import date

sys.path.insert(0, ".")

from tools.supabase_client import sb  # noqa: E402

TODAY = date.today().isoformat()
TAG = f"E2E-CAP-{int(time.time())}"

# Registry of created rows for teardown: list of (table, id)
CREATED: list[tuple[str, str]] = []


def track(table: str, row_id: str):
    if row_id:
        CREATED.append((table, row_id))


def check(name: str, cond: bool, detail: str = ""):
    status = "✅" if cond else "❌"
    print(f"  {status} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


FAILURES: list[str] = []


def track_pair(debit_id: str, credit_id: str):
    track("capital_transactions", debit_id)
    track("capital_transactions", credit_id)


def track_entity_txns(entity_id: str):
    rows = sb.table("capital_transactions").select("id").eq("entity_id", entity_id).execute().data or []
    for r in rows:
        track("capital_transactions", r["id"])


async def main():
    from api.routes.capital.accounting import (
        BankAccountCreate,
        TransactionCreate,
        bank_transfer,
        create_bank_account,
        create_transaction,
        list_bank_accounts,
        reconcile_capital_statement_movements,
        confirm_capital_reconciliation,
        split_capital_transaction,
        void_transaction,
    )
    from api.routes.capital.accounting_invoices import (
        CapitalInvoiceCreate,
        CapitalInvoicePaymentCreate,
        CapitalRecurringCreate,
        add_capital_invoice_payment,
        create_capital_invoice,
        create_capital_recurring_expense,
        deactivate_capital_recurring_expense,
        delete_capital_invoice,
        get_capital_aging_summary,
        get_capital_invoice_detail,
    )
    from api.routes.capital.payment_orders import (
        CapitalPaymentOrderComplete,
        CapitalPaymentOrderCreate,
        approve_capital_payment_order,
        cancel_capital_payment_order,
        complete_capital_payment_order,
        create_capital_payment_order,
    )
    from api.services.capital_ledger import get_capital_bank_balance

    print(f"\n=== E2E Capital Accounting — {TAG} ===\n")

    # ------------------------------------------------------------------
    print("0) Precondición: plan de cuentas sembrado")
    core = sb.table("capital_accounts").select("code").in_(
        "code", ["12000", "21000", "41000", "34000", "10100", "60900", "23900", "14300"]
    ).execute().data or []
    check("cuentas núcleo existen (042+097 aplicadas)", len(core) == 8,
          f"{len(core)}/8 — ejecuta migraciones 042 y 097 si falla")
    if len(core) != 8:
        return

    # ------------------------------------------------------------------
    print("\n1) Banco de prueba con cuenta contable auto-enlazada")
    b1 = await create_bank_account(BankAccountCreate(name=f"{TAG} Banco A", account_type="checking"))
    bank_a = b1["bank_account"]
    track("capital_bank_accounts", bank_a["id"])
    if bank_a.get("accounting_account_id"):
        track("capital_accounts", bank_a["accounting_account_id"])
    check("banco A creado + chart account enlazada", bool(bank_a.get("accounting_account_id")))

    b2 = await create_bank_account(BankAccountCreate(name=f"{TAG} Banco B", account_type="checking"))
    bank_b = b2["bank_account"]
    track("capital_bank_accounts", bank_b["id"])
    if bank_b.get("accounting_account_id"):
        track("capital_accounts", bank_b["accounting_account_id"])

    # ------------------------------------------------------------------
    print("\n2) Transacción manual → par balanceado + saldo derivado")
    t = await create_transaction(TransactionCreate(
        transaction_date=TODAY, transaction_type="other_income", amount=1000,
        is_income=True, bank_account_id=bank_a["id"],
        description=f"{TAG} ingreso manual", counterparty_name=f"{TAG} Cliente X",
    ))
    txn = t["transaction"]
    track("capital_transactions", txn["id"])
    if txn.get("linked_transaction_id"):
        track("capital_transactions", txn["linked_transaction_id"])
    linked = sb.table("capital_transactions").select("*").eq("id", txn["linked_transaction_id"]).execute().data
    check("par enlazado creado", bool(linked) and linked[0].get("linked_transaction_id") == txn["id"])
    check("pierna P&L sin banco / pierna banco con banco",
          txn.get("bank_account_id") is None and linked[0].get("bank_account_id") == bank_a["id"])
    bal_a = get_capital_bank_balance(bank_a["id"])
    check("saldo derivado banco A = 1000", abs(bal_a - 1000) < 0.01, f"={bal_a}")

    # ------------------------------------------------------------------
    print("\n3) Transferencia entre bancos vía ledger")
    tr = await bank_transfer(bank_a["id"], {"target_bank_id": bank_b["id"], "amount": 300,
                                            "description": f"{TAG} transfer"})
    # track the transfer pair
    pair_rows = sb.table("capital_transactions").select("id").eq("transaction_type", "bank_transfer") \
        .ilike("description", f"%{TAG}%").execute().data or []
    for r in pair_rows:
        track("capital_transactions", r["id"])
    check("transferencia ok", tr["ok"] and abs(tr["source_balance"] - 700) < 0.01
          and abs(tr["target_balance"] - 300) < 0.01,
          f"A={tr['source_balance']} B={tr['target_balance']}")

    # ------------------------------------------------------------------
    print("\n4) Factura por cobrar (AR): emisión + pago parcial + saldo")
    inv = await create_capital_invoice(CapitalInvoiceCreate(
        direction="receivable", counterparty_name=f"{TAG} Cliente FAC", total_amount=1000,
        subtotal=1000, due_date=TODAY, description=f"{TAG} factura AR", notes=f"{TAG}",
    ))
    track("capital_invoices", inv["id"])
    track_entity_txns(inv["id"])
    check("factura AR creada", inv["invoice_number"].startswith("FAC-"))
    ar_legs = sb.table("capital_transactions").select("*").eq("entity_type", "invoice") \
        .eq("entity_id", inv["id"]).execute().data or []
    check("par AR emitido (2 piernas)", len(ar_legs) == 2, f"{len(ar_legs)} piernas")

    pay1 = await add_capital_invoice_payment(inv["id"], CapitalInvoicePaymentCreate(
        invoice_id=inv["id"], amount=400, bank_account_id=bank_a["id"], payment_method="zelle"))
    track_entity_txns(inv["id"])
    check("pago parcial → status partial", pay1["invoice_status"] == "partial" and pay1["new_amount_paid"] == 400)

    aging = await get_capital_aging_summary(direction="receivable")
    tag_in_aging = any(i.get("invoice_number") == inv["invoice_number"]
                       for b in aging["items"].values() for i in b)
    check("aparece en aging con saldo 600", tag_in_aging)

    pay2 = await add_capital_invoice_payment(inv["id"], CapitalInvoicePaymentCreate(
        invoice_id=inv["id"], amount=600, bank_account_id=bank_a["id"], payment_method="zelle"))
    track_entity_txns(inv["id"])
    check("pago final → status paid", pay2["invoice_status"] == "paid")

    detail = await get_capital_invoice_detail(inv["id"])
    check("2 pagos registrados", len(detail["payments"]) == 2)
    bal_a2 = get_capital_bank_balance(bank_a["id"])
    check("saldo A = 700 + 1000 cobrados = 1700", abs(bal_a2 - 1700) < 0.01, f"={bal_a2}")

    # ------------------------------------------------------------------
    print("\n5) Factura por pagar (AP)")
    ap = await create_capital_invoice(CapitalInvoiceCreate(
        direction="payable", counterparty_name=f"{TAG} Proveedor", total_amount=250,
        subtotal=250, description=f"{TAG} bill", notes=f"{TAG}",
    ))
    track("capital_invoices", ap["id"])
    track_entity_txns(ap["id"])
    check("BILL- numerada", ap["invoice_number"].startswith("BILL-"))
    payap = await add_capital_invoice_payment(ap["id"], CapitalInvoicePaymentCreate(
        invoice_id=ap["id"], amount=250, bank_account_id=bank_a["id"]))
    track_entity_txns(ap["id"])
    check("bill pagada", payap["invoice_status"] == "paid")
    bal_a3 = get_capital_bank_balance(bank_a["id"])
    check("saldo A = 1700 - 250 = 1450", abs(bal_a3 - 1450) < 0.01, f"={bal_a3}")

    # ------------------------------------------------------------------
    print("\n6) Orden de pago (tesorería): ciclo completo + factura auto")
    o = await create_capital_payment_order(CapitalPaymentOrderCreate(
        payee_name=f"{TAG} Inversionista Z", amount=500, concept="retorno_inversionista",
        notes=f"{TAG} retorno"))
    order = o["data"]
    track("capital_payment_orders", order["id"])
    autobill = sb.table("capital_invoices").select("*").ilike("notes", f"%[PO:{order['id']}]%").execute().data
    check("factura auto [PO:] creada status sent", bool(autobill) and autobill[0]["status"] == "sent")
    if autobill:
        track("capital_invoices", autobill[0]["id"])

    await approve_capital_payment_order(order["id"], approved_by="e2e")
    comp = await complete_capital_payment_order(order["id"], CapitalPaymentOrderComplete(
        reference=f"{TAG}-REF", payment_date=TODAY, bank_account_id=bank_a["id"], completed_by="e2e"))
    track_entity_txns(order["id"])
    check("orden completada", comp["data"]["status"] == "completed")
    autobill2 = sb.table("capital_invoices").select("status, amount_paid").eq("id", autobill[0]["id"]).execute().data
    check("factura auto → paid", autobill2 and autobill2[0]["status"] == "paid")
    legs = sb.table("capital_transactions").select("*").eq("entity_type", "payment_order") \
        .eq("entity_id", order["id"]).execute().data or []
    check("par contable posteado (retorno)", len(legs) == 2)
    bal_a4 = get_capital_bank_balance(bank_a["id"])
    check("saldo A = 1450 - 500 = 950", abs(bal_a4 - 950) < 0.01, f"={bal_a4}")

    # cancel path
    o2 = await create_capital_payment_order(CapitalPaymentOrderCreate(
        payee_name=f"{TAG} Cancelado", amount=99, concept="gasto_operativo", notes=f"{TAG} cancel"))
    track("capital_payment_orders", o2["data"]["id"])
    bill2 = sb.table("capital_invoices").select("id").ilike("notes", f"%[PO:{o2['data']['id']}]%").execute().data
    if bill2:
        track("capital_invoices", bill2[0]["id"])
    await cancel_capital_payment_order(o2["data"]["id"], cancelled_by="e2e")
    bill2b = sb.table("capital_invoices").select("status").eq("id", bill2[0]["id"]).execute().data
    check("cancelar orden → factura voided", bill2b and bill2b[0]["status"] == "voided")

    # ------------------------------------------------------------------
    print("\n7) RTO: factura mensual automática + registro de pago la salda")
    cl = sb.table("clients").insert({"name": f"{TAG} Cliente RTO", "phone": "0000000000"}).execute().data[0]
    track("clients", cl["id"])
    prop = sb.table("properties").insert({
        "property_code": f"E2E{int(time.time()) % 100000}",
        "address": f"{TAG} 123 Test St", "city": "Houston", "state": "TX",
        "purchase_price": 20000, "status": "sold",
    }).execute().data[0]
    track("properties", prop["id"])
    sale = sb.table("sales").insert({
        "property_id": prop["id"], "client_id": cl["id"],
        "sale_price": 30000, "sale_type": "rto", "status": "completed",
    }).execute().data[0]
    track("sales", sale["id"])
    ct = sb.table("rto_contracts").insert({
        "sale_id": sale["id"],
        "client_id": cl["id"], "property_id": prop["id"],
        "monthly_rent": 850, "term_months": 12,
        "purchase_price": 30000, "status": "active", "start_date": TODAY,
        "end_date": f"{date.today().year + 1}-{date.today().month:02d}-01",
    }).execute().data[0]
    track("rto_contracts", ct["id"])
    rp = sb.table("rto_payments").insert({
        "rto_contract_id": ct["id"], "client_id": cl["id"],
        "amount": 850, "due_date": TODAY,
        "status": "pending", "payment_number": 1,
    }).execute().data[0]
    track("rto_payments", rp["id"])

    from api.routes.capital._rto_invoicing import generate_rto_receivable_invoices, settle_rto_invoice
    gen = generate_rto_receivable_invoices()
    check("generador ok", gen["ok"], str(gen))
    rto_inv = sb.table("capital_invoices").select("*").eq("rto_payment_id", rp["id"]).execute().data
    check("factura RTO creada por el job", bool(rto_inv))
    if rto_inv:
        track("capital_invoices", rto_inv[0]["id"])
        track_entity_txns(rto_inv[0]["id"])

    settled = settle_rto_invoice(rp["id"], 850, bank_account_id=bank_a["id"],
                                 payment_method="zelle", paid_date=TODAY, created_by="e2e",
                                 status="confirmed")
    if rto_inv:
        track_entity_txns(rto_inv[0]["id"])
    check("pago RTO salda la factura", settled)
    rto_inv2 = sb.table("capital_invoices").select("status, amount_paid").eq("id", rto_inv[0]["id"]).execute().data
    check("factura RTO → paid 850", rto_inv2 and rto_inv2[0]["status"] == "paid"
          and float(rto_inv2[0]["amount_paid"]) == 850)
    # income must be recognized exactly ONCE (at issuance): check 41000 rows for this invoice
    renta_acct = sb.table("capital_accounts").select("id").eq("code", "41000").execute().data[0]["id"]
    renta_rows = sb.table("capital_transactions").select("amount").eq("account_id", renta_acct) \
        .eq("entity_id", rto_inv[0]["id"]).neq("status", "voided").execute().data or []
    check("ingreso RTO reconocido UNA vez", len(renta_rows) == 1 and float(renta_rows[0]["amount"]) == 850,
          f"{len(renta_rows)} filas en 41000")

    # ------------------------------------------------------------------
    print("\n8) Conciliación: pagos partidos 500+500 contra factura de 1000")
    inv2 = await create_capital_invoice(CapitalInvoiceCreate(
        direction="receivable", counterparty_name=f"{TAG} Gomez Family", total_amount=1000,
        subtotal=1000, due_date=TODAY, description=f"{TAG} split pay", notes=f"{TAG}",
    ))
    track("capital_invoices", inv2["id"])
    track_entity_txns(inv2["id"])
    sb.table("capital_invoices").update({"status": "sent"}).eq("id", inv2["id"]).execute()

    stmt = sb.table("capital_bank_statements").insert({
        "bank_account_id": bank_a["id"], "account_label": f"{TAG}",
        "original_filename": "e2e.pdf", "file_type": "pdf", "status": "parsed",
        "total_movements": 2,
    }).execute().data[0]
    track("capital_bank_statements", stmt["id"])
    mv_ids = []
    for i in range(2):
        mv = sb.table("capital_statement_movements").insert({
            "statement_id": stmt["id"], "movement_date": TODAY,
            "description": f"ZELLE FROM {TAG} GOMEZ FAMILY", "amount": 500,
            "is_credit": True, "counterparty": f"{TAG} Gomez Family",
            "sort_order": i, "status": "pending",
        }).execute().data[0]
        mv_ids.append(mv["id"])
        track("capital_statement_movements", mv["id"])

    rec = await reconcile_capital_statement_movements(stmt["id"])
    inv_matches = [m for m in rec["matches"] if m.get("target_type") == "invoice"
                   and m.get("invoice_id") == inv2["id"]]
    check("2 movimientos matchean la factura", len(inv_matches) == 2,
          f"{len(inv_matches)} matches: {[(m.get('score'), m.get('partial')) for m in rec['matches']]}")
    check("el primero es parcial", any(m.get("partial") for m in inv_matches))

    conf = await confirm_capital_reconciliation(stmt["id"], {
        "pairs": [{"movement_id": m["movement_id"], "invoice_id": m["invoice_id"],
                   "target_type": "invoice"} for m in inv_matches]})
    track_entity_txns(inv2["id"])
    check("confirmación ok (2)", conf["reconciled"] == 2, str(conf.get("errors")))
    inv2b = sb.table("capital_invoices").select("status, amount_paid").eq("id", inv2["id"]).execute().data[0]
    check("factura saldada por conciliación", inv2b["status"] == "paid" and float(inv2b["amount_paid"]) == 1000)
    mvs = sb.table("capital_statement_movements").select("status").in_("id", mv_ids).execute().data
    check("movimientos reconciliados", all(m["status"] == "reconciled" for m in mvs))

    # ------------------------------------------------------------------
    print("\n9) Split de transacción")
    t2 = await create_transaction(TransactionCreate(
        transaction_date=TODAY, transaction_type="operating_expense", amount=900,
        is_income=False, bank_account_id=bank_b["id"],
        description=f"{TAG} gasto para split", counterparty_name=f"{TAG} Vendor"))
    txn2 = t2["transaction"]
    track("capital_transactions", txn2["id"])
    if txn2.get("linked_transaction_id"):
        track("capital_transactions", txn2["linked_transaction_id"])
    sp = await split_capital_transaction(txn2["id"], {"parts": [
        {"amount": 600, "description": f"{TAG} parte 1"},
        {"amount": 300, "description": f"{TAG} parte 2"},
    ]})
    for ch in sp["children"]:
        track("capital_transactions", ch["id"])
        row = sb.table("capital_transactions").select("linked_transaction_id").eq("id", ch["id"]).execute().data
        if row and row[0].get("linked_transaction_id"):
            track("capital_transactions", row[0]["linked_transaction_id"])
    check("split en 2 partes", len(sp["children"]) == 2)
    orig = sb.table("capital_transactions").select("status").eq("id", txn2["id"]).execute().data[0]
    check("original anulada", orig["status"] == "voided")
    bal_b = get_capital_bank_balance(bank_b["id"])
    check("saldo B = 300 - 900 = -600 (una sola vez)", abs(bal_b - (-600)) < 0.01, f"={bal_b}")

    # ------------------------------------------------------------------
    print("\n10) Gasto recurrente")
    rec_exp = await create_capital_recurring_expense(CapitalRecurringCreate(
        name=f"{TAG} Renta oficina", amount=1200, frequency="monthly"))
    track("capital_recurring_expenses", rec_exp["id"])
    check("recurrente creado", rec_exp["name"].startswith(TAG))
    await deactivate_capital_recurring_expense(rec_exp["id"])
    row = sb.table("capital_recurring_expenses").select("is_active").eq("id", rec_exp["id"]).execute().data[0]
    check("recurrente desactivado", row["is_active"] is False)

    # ------------------------------------------------------------------
    print("\n11) Inversionista: depósito ligado a contabilidad (par pendiente → aprobar)")
    from api.routes.capital.investors import InvestmentCreate, create_investment
    from api.routes.capital.payments import confirm_transaction

    investor = sb.table("investors").insert({"name": f"{TAG} Inversionista", "status": "active",
                                             "total_invested": 0, "available_capital": 10000}).execute().data[0]
    track("investors", investor["id"])
    bal_before = get_capital_bank_balance(bank_a["id"])
    inv_res = await create_investment(InvestmentCreate(
        investor_id=investor["id"], amount=2000, bank_account_id=bank_a["id"],
        notes=f"{TAG} deposito"))
    track("investments", inv_res["investment"]["id"])
    dep_legs = sb.table("capital_transactions").select("*") \
        .eq("investor_id", investor["id"]).eq("transaction_type", "investor_deposit").execute().data or []
    for leg in dep_legs:
        track("capital_transactions", leg["id"])
    check("depósito crea PAR pendiente", len(dep_legs) == 2
          and all(l["status"] == "pending_confirmation" for l in dep_legs),
          f"{len(dep_legs)} piernas")
    check("pendiente NO afecta saldo", abs(get_capital_bank_balance(bank_a["id"]) - bal_before) < 0.01)

    bank_leg = next((l for l in dep_legs if l.get("bank_account_id")), None)
    check("pierna banco correcta", bool(bank_leg) and bank_leg["bank_account_id"] == bank_a["id"])
    await confirm_transaction(bank_leg["id"])
    dep_after = sb.table("capital_transactions").select("status").in_("id", [l["id"] for l in dep_legs]).execute().data
    check("aprobar confirma AMBAS piernas", all(l["status"] == "confirmed" for l in dep_after))
    check("saldo sube 2000 al aprobar", abs(get_capital_bank_balance(bank_a["id"]) - (bal_before + 2000)) < 0.01)

    # ------------------------------------------------------------------
    print("\n12) Borrado en cascada de factura")
    del_res = await delete_capital_invoice(inv["id"])
    CREATED[:] = [(t_, i_) for (t_, i_) in CREATED if not (t_ == "capital_invoices" and i_ == inv["id"])]
    check("cascada elimina ledger", del_res["deleted_ledger_rows"] >= 2, str(del_res))
    leftover = sb.table("capital_transactions").select("id").eq("entity_id", inv["id"]).execute().data
    check("0 piernas huérfanas", len(leftover or []) == 0)

    print(f"\n=== {'TODOS LOS CHECKS PASARON ✅' if not FAILURES else f'{len(FAILURES)} FALLOS ❌: {FAILURES}'} ===")


def teardown():
    print("\n--- Limpieza ---")
    order = ["capital_invoice_payments", "capital_statement_movements", "capital_bank_statements",
             "capital_transactions", "capital_invoices", "capital_payment_orders",
             "capital_recurring_expenses", "rto_payments", "rto_contracts", "sales",
             "properties", "clients", "investments", "investors",
             "capital_bank_accounts", "capital_accounts"]
    # payments/audit referencing our invoices
    inv_ids = [i for (t, i) in CREATED if t == "capital_invoices"]
    if inv_ids:
        try:
            sb.table("capital_invoice_payments").delete().in_("invoice_id", inv_ids).execute()
        except Exception:
            pass
    by_table: dict = {}
    for t, i in CREATED:
        by_table.setdefault(t, []).append(i)
    # Release the self-referential FK before deleting transaction rows
    txn_ids = list(dict.fromkeys(by_table.get("capital_transactions", [])))
    if txn_ids:
        try:
            sb.table("capital_transactions").update({"linked_transaction_id": None}) \
                .in_("id", txn_ids).execute()
            sb.table("capital_transactions").update({"linked_transaction_id": None}) \
                .in_("linked_transaction_id", txn_ids).execute()
        except Exception:
            pass
    deleted = 0
    for t in order:
        ids = list(dict.fromkeys(by_table.get(t, [])))
        if not ids:
            continue
        try:
            res = sb.table(t).delete().in_("id", ids).execute()
            deleted += len(res.data or [])
        except Exception as e:
            print(f"  ⚠️ {t}: {e}")
    # audit-log entries for our records
    try:
        all_ids = [i for (_, i) in CREATED]
        if all_ids:
            sb.table("capital_audit_log").delete().in_("record_id", all_ids).execute()
    except Exception:
        pass
    # residue check
    residue = 0
    for t in ["capital_transactions", "capital_invoices", "capital_payment_orders"]:
        try:
            r = sb.table(t).select("id").ilike("description" if t != "capital_payment_orders" else "notes", f"%{TAG}%").execute().data or []
            residue += len(r)
            for row in r:
                sb.table(t).delete().eq("id", row["id"]).execute()
        except Exception:
            pass
    print(f"  Eliminadas ~{deleted} filas. Residuo por descripción: {residue} (limpiado).")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        teardown()
    sys.exit(1 if FAILURES else 0)
