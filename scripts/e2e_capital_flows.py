"""
E2E — Capital WHOLE-FLOW suite (source-of-truth chart, migration 107).

Each scenario runs a complete money flow end-to-end against the REAL database
by importing the actual endpoint functions, and asserts that the FINANCIAL
STATEMENTS reflect the expected DELTA (snapshot before/after) — so it never
depends on absolute values and never disturbs the reading of real data.
Everything created is tracked and deleted in teardown (0 residuo).

Covers: investor deposit→confirm→return/interest (per-investor 23xxx + pending
gating), client RTO income + late fee + A/R, bank-statement post→reverse,
journal entry / opening balance, acquisition + commission, and invariants.

Run:  set -a; source .env; set +a; .venv/bin/python scripts/e2e_capital_flows.py
"""
import asyncio
import sys
import time
from datetime import date, timedelta

sys.path.insert(0, ".")

from tools.supabase_client import sb  # noqa: E402

TODAY = date.today().isoformat()
YEAR_START = "2020-01-01"
YEAR_END = "2035-12-31"
TAG = f"E2E-FLOW-{int(time.time())}"

CREATED: list[tuple[str, str]] = []
FAILURES: list[str] = []


def track(table: str, row_id):
    if row_id:
        CREATED.append((table, row_id))


def track_row(row: dict):
    """Track a ledger row + its linked leg."""
    if not row:
        return
    track("capital_transactions", row.get("id"))
    if row.get("linked_transaction_id"):
        track("capital_transactions", row["linked_transaction_id"])


def check(name: str, cond: bool, detail: str = ""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


# ── snapshot / delta helpers ────────────────────────────────────────────────
def _flatten(nodes, out):
    for n in nodes or []:
        code = n.get("code")
        if code:
            out[code] = round(out.get(code, 0.0) + float(n.get("balance") or 0), 2)
        _flatten(n.get("children"), out)
    return out


async def snapshot():
    from api.routes.capital.accounting import get_balance_sheet_tree, get_profit_loss_tree
    from api.services.capital_ledger import get_all_capital_bank_balances
    bs = await get_balance_sheet_tree()
    pl = await get_profit_loss_tree(start_date=YEAR_START, end_date=YEAR_END)
    acct: dict[str, float] = {}
    for sec in ("assets", "liabilities", "equity"):
        _flatten(bs.get(sec), acct)
    for sec in ("income", "expenses", "other_income", "other_expenses"):
        _flatten(pl.get(sec), acct)
    return {
        "acct": acct,
        "banks": get_all_capital_bank_balances(db=sb),
        "bs_totals": (bs.get("total_assets", 0), bs.get("total_liabilities", 0), bs.get("total_equity", 0)),
    }


def d_acct(before, after, code):
    return round(after["acct"].get(code, 0.0) - before["acct"].get(code, 0.0), 2)


def d_bank(before, after, bank_id):
    return round(after["banks"].get(bank_id, 0.0) - before["banks"].get(bank_id, 0.0), 2)


def code_of(account_id):
    r = sb.table("capital_accounts").select("code").eq("id", account_id).limit(1).execute().data
    return r[0]["code"] if r else None


async def main():
    from api.routes.capital._accounting_hooks import record_txn
    from api.routes.capital.accounting import (
        BankAccountCreate, create_bank_account,
    )
    from api.routes.capital.payments import confirm_transaction
    from api.routes.capital.journal_entries import create_journal_entry, delete_journal_entry, JournalEntryCreate, JELine
    from api.services.capital_ledger import get_capital_bank_balance, ensure_investor_note_account

    print(f"\n=== E2E Capital WHOLE-FLOWS — {TAG} ===\n")

    # Precondition: source-of-truth chart present
    core = sb.table("capital_accounts").select("code").in_(
        "code", ["12000", "13010", "20000", "23000", "34000", "41000", "60100", "71400", "72200"]
    ).execute().data or []
    check("chart source-of-truth presente (migración 107)", len(core) == 9, f"{len(core)}/9")
    if len(core) != 9:
        return

    # Test bank (auto-linked chart account)
    bankres = await create_bank_account(BankAccountCreate(name=f"{TAG} Banco", account_type="checking"))
    bank = bankres["bank_account"]
    track("capital_bank_accounts", bank["id"])
    bank_id = bank["id"]

    def confirm_pair(bank_leg):
        """Confirm both legs of a pending pair (returns after confirm)."""
        return confirm_transaction(bank_leg["id"])

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 1: INVERSIONISTA (depósito→pending→confirm→retorno/interés) ───")
    inv = sb.table("investors").insert({"name": f"{TAG} Inversionista"}).execute().data[0]
    track("investors", inv["id"])
    note_code = ensure_investor_note_account(f"{TAG} Inversionista", investor_id=inv["id"], db=sb)
    check("subcuenta Debt Securities creada bajo 23000", bool(note_code) and note_code.startswith("23"), f"code={note_code}")
    na = sb.table("capital_accounts").select("id").eq("code", note_code).execute().data
    if na:
        track("capital_accounts", na[0]["id"])

    s0 = await snapshot()
    dep = record_txn(txn_type="investor_deposit", amount=50000, is_income=True, investor_id=inv["id"],
                     bank_account_id=bank_id, description=f"{TAG} depósito inversionista")
    track_row(dep)
    s_pending = await snapshot()
    check("depósito PENDING no mueve el Balance (gating)", d_acct(s0, s_pending, note_code) == 0 and d_bank(s0, s_pending, bank_id) == 0,
          f"Δ{note_code}={d_acct(s0, s_pending, note_code)} Δbank={d_bank(s0, s_pending, bank_id)}")
    await confirm_pair(dep)
    s1 = await snapshot()
    check("confirmado → 23xxx del inversionista +50000", d_acct(s0, s1, note_code) == 50000, f"Δ={d_acct(s0, s1, note_code)}")
    check("confirmado → banco +50000", d_bank(s0, s1, bank_id) == 50000, f"Δ={d_bank(s0, s1, bank_id)}")

    ret = record_txn(txn_type="investor_return", amount=20000, is_income=False, investor_id=inv["id"],
                     bank_account_id=bank_id, description=f"{TAG} retorno principal")
    track_row(ret); await confirm_pair(ret)
    intx = record_txn(txn_type="investor_interest", amount=1000, is_income=False, investor_id=inv["id"],
                      bank_account_id=bank_id, description=f"{TAG} interés")
    track_row(intx); await confirm_pair(intx)
    s2 = await snapshot()
    check("retorno principal → 23xxx -20000 (neto +30000)", d_acct(s0, s2, note_code) == 30000, f"Δ={d_acct(s0, s2, note_code)}")
    check("interés → 71400 +1000 (gasto P&L)", d_acct(s0, s2, "71400") == 1000, f"Δ={d_acct(s0, s2, '71400')}")
    check("banco neto = +50000-20000-1000 = 29000", d_bank(s0, s2, bank_id) == 29000, f"Δ={d_bank(s0, s2, bank_id)}")

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 2: CLIENTE RTO (renta 41000 + mora 72200) ───")
    s0 = await snapshot()
    rto = record_txn(txn_type="rto_payment", amount=1200, is_income=True, bank_account_id=bank_id,
                     description=f"{TAG} pago RTO mensual")
    track_row(rto); await confirm_pair(rto)
    late = record_txn(txn_type="late_fee", amount=45, is_income=True, bank_account_id=bank_id,
                      description=f"{TAG} mora")
    track_row(late); await confirm_pair(late)
    s1 = await snapshot()
    check("renta RTO → 41000 +1200", d_acct(s0, s1, "41000") == 1200, f"Δ={d_acct(s0, s1, '41000')}")
    check("mora → 72200 +45", d_acct(s0, s1, "72200") == 45, f"Δ={d_acct(s0, s1, '72200')}")
    check("banco → +1245", d_bank(s0, s1, bank_id) == 1245, f"Δ={d_bank(s0, s1, bank_id)}")

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 4: JOURNAL ENTRY (saldo de apertura + reclasificación) ───")
    s0 = await snapshot()
    je = await create_journal_entry(JournalEntryCreate(
        date=TODAY, memo=f"{TAG} saldo apertura", entity="capital",
        lines=[JELine(account_id=bank["accounting_account_id"], debit=10000, credit=0),
               JELine(account_code="34000", debit=0, credit=10000)]))
    for r in (je.get("rows") or []):
        track("capital_transactions", r["id"])
    s1 = await snapshot()
    bank_code = code_of(bank["accounting_account_id"])
    check("apertura → banco (activo) +10000", d_acct(s0, s1, bank_code) == 10000, f"Δ{bank_code}={d_acct(s0, s1, bank_code)}")
    check("apertura → 34000 Opening Balance Equity +10000", d_acct(s0, s1, "34000") == 10000, f"Δ={d_acct(s0, s1, '34000')}")
    # A == L+E preserved by the balanced JE
    da = round(s1["bs_totals"][0] - s0["bs_totals"][0], 2)
    dle = round((s1["bs_totals"][1] + s1["bs_totals"][2]) - (s0["bs_totals"][1] + s0["bs_totals"][2]), 2)
    check("JE mantiene A == L+E (ΔA == ΔL+E)", da == dle, f"ΔA={da} ΔL+E={dle}")
    await delete_journal_entry(je["journal_entry_id"])
    s2 = await snapshot()
    check("borrar JE revierte 34000 a 0", d_acct(s0, s2, "34000") == 0, f"Δ={d_acct(s0, s2, '34000')}")

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 5: ADQUISICIÓN (13010) + COMISIÓN (60100) ───")
    s0 = await snapshot()
    acq = record_txn(txn_type="acquisition", amount=30000, is_income=False, bank_account_id=bank_id,
                     description=f"{TAG} adquisición casa")
    track_row(acq); await confirm_pair(acq)
    com = record_txn(txn_type="commission", amount=1500, is_income=False, bank_account_id=bank_id,
                     description=f"{TAG} comisión")
    track_row(com); await confirm_pair(com)
    s1 = await snapshot()
    check("adquisición → 13010 Mobile Homes +30000 (activo)", d_acct(s0, s1, "13010") == 30000, f"Δ={d_acct(s0, s1, '13010')}")
    check("comisión → 60100 +1500 (gasto)", d_acct(s0, s1, "60100") == 1500, f"Δ={d_acct(s0, s1, '60100')}")
    check("banco → -31500", d_bank(s0, s1, bank_id) == -31500, f"Δ={d_bank(s0, s1, bank_id)}")

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 3: ESTADO DE CUENTA (postear → verificar → borrar revierte) ───")
    from api.routes.capital.accounting import post_capital_statement, delete_capital_bank_statement
    acc_id = {c: (sb.table("capital_accounts").select("id").eq("code", c).execute().data or [{}])[0].get("id")
              for c in ("41000", "13010", "65010")}
    s0 = await snapshot()
    stmt = sb.table("capital_bank_statements").insert({
        "bank_account_id": bank_id, "original_filename": f"{TAG}.csv", "account_label": f"{TAG} stmt",
        "file_type": "csv", "status": "review", "total_movements": 3,
    }).execute().data[0]
    track("capital_bank_statements", stmt["id"])
    movs = [
        {"amount": 1200, "is_credit": True, "code": "41000", "type": "rto_payment", "desc": f"{TAG} renta RTO"},
        {"amount": 28000, "is_credit": False, "code": "13010", "type": "acquisition", "desc": f"{TAG} pago a Homes casa"},
        {"amount": 25, "is_credit": False, "code": "65010", "type": "operating_expense", "desc": f"{TAG} cargo banco"},
    ]
    for i, m in enumerate(movs):
        row = sb.table("capital_statement_movements").insert({
            "statement_id": stmt["id"], "movement_date": TODAY, "description": m["desc"],
            "amount": m["amount"], "is_credit": m["is_credit"], "status": "confirmed",
            "final_account_id": acc_id[m["code"]], "final_transaction_type": m["type"], "sort_order": i,
        }).execute().data[0]
        track("capital_statement_movements", row["id"])
    res = await post_capital_statement(stmt["id"])
    check("posteo del estado → 3 movimientos", res.get("posted") == 3, f"posted={res.get('posted')} err={res.get('errors')}")
    s1 = await snapshot()
    check("estado → banco == neto (1200-28000-25 = -26825)", d_bank(s0, s1, bank_id) == -26825, f"Δ={d_bank(s0, s1, bank_id)}")
    check("estado → 41000 +1200 (renta)", d_acct(s0, s1, "41000") == 1200, f"Δ={d_acct(s0, s1, '41000')}")
    check("estado → 13010 +28000 (activo casa)", d_acct(s0, s1, "13010") == 28000, f"Δ={d_acct(s0, s1, '13010')}")
    check("estado → 65010 +25 (gasto banco)", d_acct(s0, s1, "65010") == 25, f"Δ={d_acct(s0, s1, '65010')}")
    delres = await delete_capital_bank_statement(stmt["id"])
    s2 = await snapshot()
    check("borrar estado REVIERTE banco al inicial", d_bank(s0, s2, bank_id) == 0, f"Δ={d_bank(s0, s2, bank_id)}")
    check("borrar estado REVIERTE 41000/13010/65010 a 0",
          d_acct(s0, s2, "41000") == 0 and d_acct(s0, s2, "13010") == 0 and d_acct(s0, s2, "65010") == 0,
          f"Δ41000={d_acct(s0, s2, '41000')} Δ13010={d_acct(s0, s2, '13010')} Δ65010={d_acct(s0, s2, '65010')}")

    # ══════════════════════════════════════════════════════════════════════
    print("\n─── Escenario 6: INVARIANTES ───")
    # (a) derived bank balance == Σ its ledger legs
    legs = sb.table("capital_transactions").select("amount,is_income,status").eq("bank_account_id", bank_id).execute().data or []
    manual = sum((float(l["amount"]) if l["is_income"] else -float(l["amount"]))
                 for l in legs if (l.get("status") or "") not in ("voided", "pending_confirmation", "draft"))
    check("saldo derivado banco == Σ patas del ledger", abs(get_capital_bank_balance(bank_id) - round(manual, 2)) < 0.01,
          f"derived={get_capital_bank_balance(bank_id)} manual={round(manual, 2)}")
    # (b) legacy codes never posted
    legacy_ids = [a["id"] for a in sb.table("capital_accounts").select("id,code").in_("code", ["23900", "23950", "10170", "60600"]).execute().data or []]
    legacy_used = 0
    for aid in legacy_ids:
        legacy_used += sb.table("capital_transactions").select("id", count="exact").eq("account_id", aid).limit(1).execute().count or 0
    check("ninguna cuenta legacy (23900/23950/10170/60600) recibe posteos", legacy_used == 0, f"{legacy_used} filas")

    print(f"\n=== RESUMEN: {'TODO ✅' if not FAILURES else f'{len(FAILURES)} FALLOS ❌: ' + ', '.join(FAILURES)} ===")


def teardown():
    print(f"\n=== Teardown {TAG} ===")
    # Break linked_transaction_id cross-links first (avoid FK), then delete by table.
    txn_ids = [rid for (t, rid) in CREATED if t == "capital_transactions"]
    for tid in txn_ids:
        try:
            sb.table("capital_transactions").update({"linked_transaction_id": None}).eq("id", tid).execute()
        except Exception:
            pass
    order = ["capital_statement_movements", "capital_bank_statements", "capital_transactions",
             "capital_bank_accounts", "capital_accounts", "investors"]
    seen = set()
    deleted = 0
    for table in order:
        for (t, rid) in CREATED:
            if t == table and (t, rid) not in seen:
                seen.add((t, rid))
                try:
                    sb.table(table).delete().eq("id", rid).execute(); deleted += 1
                except Exception as e:
                    print(f"  ⚠ no se pudo borrar {table}/{rid}: {str(e)[:60]}")
    # residue: any capital_transactions with the TAG in description
    residue = sb.table("capital_transactions").select("id").ilike("description", f"%{TAG}%").execute().data or []
    for r in residue:
        try:
            sb.table("capital_transactions").update({"linked_transaction_id": None}).eq("id", r["id"]).execute()
            sb.table("capital_transactions").delete().eq("id", r["id"]).execute(); deleted += 1
        except Exception:
            pass
    print(f"  Eliminadas ~{deleted} filas. Residuo final: {len(sb.table('capital_transactions').select('id').ilike('description', f'%{TAG}%').execute().data or [])}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        teardown()
    sys.exit(1 if FAILURES else 0)
