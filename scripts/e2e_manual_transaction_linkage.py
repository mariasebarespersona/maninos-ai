#!/usr/bin/env python3
"""
End-to-end check for the new "Nueva Transacción" (account-only, no Tipo):
create a manual expense + a manual income exactly like the modal now does
(account_id + Ingreso/Gasto side, generic transaction_type), then verify the
money links correctly across EVERYTHING — double-entry ledger, desglose buckets,
P&L, Balance Sheet, net profit and the bank balance — and finally DELETE the
test rows so the app stays clean for Maninos.

Run:  .venv/bin/python scripts/e2e_manual_transaction_linkage.py
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from supabase import create_client
from api.routes.accounting import create_transaction, get_accounting_dashboard, get_balance_sheet, TransactionCreate

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
results = []
def check(name, ok, detail=""):
    results.append((name, ok, detail));
    print(f"  {'✅' if ok else '❌'} {name}" + (f"  [{detail}]" if detail else ""))


def txn_ids():
    ids, off = set(), 0
    while True:
        b = sb.table("accounting_transactions").select("id").range(off, off + 999).execute().data or []
        ids |= {r["id"] for r in b}
        if len(b) < 1000:
            return ids
        off += 1000


def acct_id(code_or_name, by="name"):
    r = sb.table("accounting_accounts").select("id").eq(by, code_or_name).eq("is_active", True).limit(1).execute().data
    return r[0]["id"] if r else None


async def snap():
    d = await get_accounting_dashboard(period="all")
    bs = await get_balance_sheet()
    s = d["summary"]
    hcash = next((b["current_balance"] for b in d["bank_accounts"] if b.get("name") == "Cuenta Houston Cash"), 0.0)
    return {
        "income": s["total_income"], "expenses": s["total_expenses"], "net": s["net_profit"],
        "servicios": s["total_servicios"], "manual_income": s["manual_income"],
        "houston_cash": round(hcash, 2),
        "A": bs["sections"]["total_assets"],
        "balances": abs(bs["sections"]["total_assets"] - bs["sections"]["total_liabilities_and_equity"]) < 1.0,
    }


async def main():
    bank = sb.table("bank_accounts").select("id").eq("name", "Cuenta Houston Cash").limit(1).execute().data[0]["id"]
    office = acct_id("Office supplies")
    services = acct_id("Services")
    print(f"cuentas: banco=HoustonCash  gasto=Office supplies({office[:8]})  ingreso=Services({services[:8]})\n")

    before_ids = txn_ids()
    base = await snap()
    print(f"ANTES:  ingresos=${base['income']:,.2f}  gastos=${base['expenses']:,.2f}  neta=${base['net']:,.2f}  "
          f"HoustonCash=${base['houston_cash']:,.2f}  BS_cuadra={base['balances']}\n")

    # 1) Manual EXPENSE $150 → Office supplies, from Houston Cash (exactly what the
    #    modal posts now: account_id + is_income=False + generic type)
    await create_transaction(TransactionCreate(
        transaction_date="2026-07-15", transaction_type="other_expense", amount=150.0,
        is_income=False, account_id=office, bank_account_id=bank,
        description="E2E-TEST manual gasto (Office supplies)"))
    # 2) Manual INCOME $200 → Services, into Houston Cash
    await create_transaction(TransactionCreate(
        transaction_date="2026-07-15", transaction_type="other_income", amount=200.0,
        is_income=True, account_id=services, bank_account_id=bank,
        description="E2E-TEST manual ingreso (Services)"))

    new_ids = txn_ids() - before_ids
    after = await snap()
    print(f"DESPUÉS: ingresos=${after['income']:,.2f}  gastos=${after['expenses']:,.2f}  neta=${after['net']:,.2f}  "
          f"HoustonCash=${after['houston_cash']:,.2f}  BS_cuadra={after['balances']}\n")

    print("PRUEBAS DE LIGADO:")
    # Double-entry: 2 transactions × 2 legs = 4 new rows
    check("Doble entrada: se crearon 4 asientos (2 P&L + 2 banco)", len(new_ids) == 4, f"{len(new_ids)} filas")
    # Each new txn has a linked counterpart leg
    new_rows = sb.table("accounting_transactions").select("id,account_id,amount,is_income,linked_transaction_id").in_("id", list(new_ids)).execute().data
    check("Cada asiento tiene su contrapartida (linked)", all(r.get("linked_transaction_id") for r in new_rows))
    # Reports moved correctly
    check("Gastos subieron +$150", abs((after["expenses"] - base["expenses"]) - 150) < 0.01, f"Δ ${after['expenses']-base['expenses']:,.2f}")
    check("Ingresos subieron +$200", abs((after["income"] - base["income"]) - 200) < 0.01, f"Δ ${after['income']-base['income']:,.2f}")
    check("Ganancia neta cambió +$50 (200−150)", abs((after["net"] - base["net"]) - 50) < 0.01, f"Δ ${after['net']-base['net']:,.2f}")
    check("Desglose 'servicios' recibió el gasto (+$150)", abs((after["servicios"] - base["servicios"]) - 150) < 0.01, f"Δ ${after['servicios']-base['servicios']:,.2f}")
    check("Saldo HoustonCash cambió +$50 (200 in − 150 out)", abs((after["houston_cash"] - base["houston_cash"]) - 50) < 0.01, f"Δ ${after['houston_cash']-base['houston_cash']:,.2f}")
    check("Balance Sheet sigue cuadrando (A=L+E)", after["balances"] is True)

    # ---- CLEANUP: delete the 4 test rows, restore clean state ----
    if new_ids:
        sb.table("accounting_transactions").delete().in_("id", list(new_ids)).execute()
    restored = await snap()
    print()
    check("LIMPIEZA: app vuelve al estado inicial (todo borrado)",
          abs(restored["net"] - base["net"]) < 0.01 and abs(restored["houston_cash"] - base["houston_cash"]) < 0.01
          and (txn_ids() - before_ids) == set())

    npass = sum(1 for _, ok, _ in results if ok)
    print(f"\n{'='*60}\n  {npass}/{len(results)} pruebas OK — {'TODO LIGADO ✅' if npass==len(results) else 'REVISAR ❌'}\n{'='*60}")
    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
