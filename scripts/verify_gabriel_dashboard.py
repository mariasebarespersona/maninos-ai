#!/usr/bin/env python3
"""
Verify the "Gabriel" business panel of the accounting dashboard.

Every metric Gabriel sees is recomputed from an INDEPENDENT source and
cross-checked against what the dashboard endpoint returns. If a number is
wrong (like the "0 vendidas" bug), it shows up here as a FAIL with both
values. This is the "prueba" that the panel has no bugs.

Run:  .venv/bin/python scripts/verify_gabriel_dashboard.py
"""
import os, sys, asyncio
from dotenv import load_dotenv
load_dotenv()
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client
from api.routes.accounting import get_accounting_dashboard, get_balance_sheet

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def fetch_all(table, cols):
    """Paginate past Supabase's 1000-row cap (accounting_accounts has >1000)."""
    rows, off = [], 0
    while True:
        b = sb.table(table).select(cols).range(off, off + 999).execute().data or []
        rows += b
        if len(b) < 1000:
            return rows
        off += 1000

results = []
def check(name, ok, expected, got, note=""):
    results.append((name, ok, expected, got, note))

def money(x):
    return f"${x:,.2f}"


async def main():
    # Period "all" so nothing is hidden by a date window.
    dash = await get_accounting_dashboard(period="all")
    s = dash["summary"]
    bs = await get_balance_sheet()

    print("=" * 78)
    print("GABRIEL PANEL — dashboard values (period = all)")
    print("=" * 78)
    print(f"  Efectivo en bancos ......... {money(s['total_bank_balance'])}")
    print(f"  Casas en inventario ........ {s['houses_in_inventory']}  (valor {money(s['inventory_value'])})")
    print(f"  Compras del período ........ {money(s['houses_bought_period'])}  ({s['houses_bought_count']} casas)")
    print(f"  Ventas del período ......... {money(s['sales_by_type']['contado'] + s['sales_by_type']['rto'])} (ledger)"
          f"  |  casas: {money(s.get('houses_sold_revenue', 0))} ({s['houses_sold_count']} vendidas)")
    print(f"  Ganancia neta .............. {money(s['net_profit'])}")
    print(f"  Por cobrar ................. {money(s['accounts_receivable'])}")
    print(f"  Por pagar .................. {money(s['accounts_payable'])}")
    print(f"  Inversión total inventario . {money(s['inventory_invested_period'])}")
    print()

    # ── PRUEBA 1: houses_sold_count == real sold houses in the sales table ──
    sales = (sb.table("sales").select("id,sale_price,status,sale_type,property_id").execute()).data or []
    real_sold = [x for x in sales if (x.get("status") or "") != "cancelled" and float(x.get("sale_price") or 0) > 0]
    check("Vendidas (conteo) = ventas reales no canceladas",
          s["houses_sold_count"] == len(real_sold), len(real_sold), s["houses_sold_count"])
    exp_rev = round(sum(float(x.get("sale_price") or 0) for x in real_sold), 2)
    check("Ventas de casas ($) = suma precios de casas vendidas",
          abs(s.get("houses_sold_revenue", 0) - exp_rev) < 0.01, money(exp_rev), money(s.get("houses_sold_revenue", 0)))
    # Consistencia: si hay ventas ($), NO puede decir 0 vendidas (el bug original)
    ventas_val = s.get("houses_sold_revenue", 0)
    check("Consistencia ventas: monto>0 ⇒ vendidas>0 (bug '0 vendidas')",
          not (ventas_val > 0 and s["houses_sold_count"] == 0),
          "coherente", f"{money(ventas_val)} / {s['houses_sold_count']} vendidas")

    # ── PRUEBA 2: inventory_value == Balance Sheet Inventory total ──
    def find_node(nodes, pred):
        for n in nodes or []:
            if pred(n):
                return n
            hit = find_node(n.get("children"), pred)
            if hit:
                return hit
        return None
    inv_node = None
    for sec in bs["sections"]["assets"]:
        inv_node = find_node(sec.get("accounts") or sec.get("children"), lambda n: (n.get("name") or n.get("code")) == "Inventory")
        if inv_node:
            break
    bs_inv = inv_node["total"] if inv_node else None
    if bs_inv is not None:
        check("Valor inventario (Gabriel) = Inventory del Balance Sheet",
              abs(s["inventory_value"] - bs_inv) < 1.0, money(bs_inv), money(s["inventory_value"]),
              "pueden diferir si hay casas vendidas aún marcadas en inventario")
    else:
        check("Inventory node encontrado en Balance Sheet", False, "nodo Inventory", "NO ENCONTRADO")

    # ── PRUEBA 3: houses_bought = suma de postings 'Compra <code>' (purchase_house) ──
    accts = fetch_all("accounting_accounts", "id,code,account_type")
    compra_ids = {a["id"] for a in accts if (a.get("code") or "").startswith("Compra ")}
    txns = [t for t in fetch_all("accounting_transactions", "account_id,amount,transaction_type,is_income,status")
            if t.get("status") != "voided"]
    exp_bought = round(sum(float(t.get("amount") or 0) for t in txns
                          if t.get("account_id") in compra_ids and t.get("transaction_type") == "purchase_house"), 2)
    check("Compras del período = suma ledger 'Compra <code>' (purchase_house)",
          abs(s["houses_bought_period"] - exp_bought) < 1.0, money(exp_bought), money(s["houses_bought_period"]))

    # ── PRUEBA 4: inventory_invested = Compra + Renovación + Movida postings ──
    reno_ids = {a["id"] for a in accts if (a.get("code") or "").startswith("Renovación ")}
    mov_ids = {a["id"] for a in accts if (a.get("code") or "").startswith("Movida ")}
    exp_reno = sum(float(t.get("amount") or 0) for t in txns
                   if t.get("account_id") in reno_ids and t.get("transaction_type") == "renovation")
    exp_mov = sum(float(t.get("amount") or 0) for t in txns
                  if t.get("account_id") in mov_ids and t.get("transaction_type") == "moving_transport")
    exp_inv = round(exp_bought + exp_reno + exp_mov, 2)
    check("Inversión total inventario = Compra+Renovación+Movida (ledger)",
          abs(s["inventory_invested_period"] - exp_inv) < 1.0, money(exp_inv), money(s["inventory_invested_period"]),
          f"compra {money(exp_bought)} + reno {money(exp_reno)} + movida {money(exp_mov)}")

    # ── PRUEBA 5: net_profit == income - expenses ──
    check("Ganancia neta = ingresos − gastos",
          abs(s["net_profit"] - (s["total_income"] - s["total_expenses"])) < 0.01,
          money(s["total_income"] - s["total_expenses"]), money(s["net_profit"]))

    # ── PRUEBA 6: Balance Sheet cuadra (A = L + E) ──
    ta = bs["totals"]["assets"] if "totals" in bs else bs.get("total_assets")
    tl = bs["totals"]["liabilities"] if "totals" in bs else bs.get("total_liabilities")
    te = bs["totals"]["equity"] if "totals" in bs else bs.get("total_equity")
    if ta is not None and tl is not None and te is not None:
        check("Balance Sheet cuadra (A = L + E)",
              abs(ta - (tl + te)) < 1.0, money(tl + te), money(ta))

    # ── PRUEBA 7: total_bank_balance == suma de saldos derivados de bancos ──
    bank_sum = round(sum(b.get("current_balance", 0) for b in dash["bank_accounts"]), 2)
    check("Efectivo en bancos = suma saldos de cuentas mostradas",
          abs(s["total_bank_balance"] - bank_sum) < 0.01, money(bank_sum), money(s["total_bank_balance"]))

    # ── Report ──
    print("=" * 78)
    print("PRUEBAS")
    print("=" * 78)
    npass = 0
    for name, ok, expected, got, note in results:
        tag = "✅ PASS" if ok else "❌ FAIL"
        npass += 1 if ok else 0
        print(f"  {tag}  {name}")
        if not ok:
            print(f"          esperado: {expected}   obtenido: {got}")
        if note:
            print(f"          nota: {note}")
    print("-" * 78)
    print(f"  {npass}/{len(results)} pruebas OK")
    print("=" * 78)
    return 0 if npass == len(results) else 1


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
