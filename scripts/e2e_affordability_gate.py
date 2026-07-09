"""
E2E — RTO affordability gate at Capital approval.

Verifies that approving an RTO application with a monthly payment ABOVE the
client's payment capacity (40% of income) is BLOCKED unless the reviewer
overrides with a reason. Real DB, full teardown.

Run: set -a; source .env; set +a; .venv/bin/python scripts/e2e_affordability_gate.py
"""
import asyncio
import sys
import time
from datetime import date

sys.path.insert(0, ".")
from tools.supabase_client import sb  # noqa: E402

TAG = f"E2E-AFFORD-{int(time.time())}"
CREATED: list = []
FAILURES: list = []


def track(t, i):
    if i:
        CREATED.append((t, i))


def check(name, cond, detail=""):
    print(f"  {'✅' if cond else '❌'} {name}" + (f" — {detail}" if detail else ""))
    if not cond:
        FAILURES.append(name)


async def main():
    from fastapi import HTTPException
    from api.routes.capital.applications import ApplicationReview, review_application, _affordability_cap

    print(f"\n=== E2E Affordability Gate — {TAG} ===\n")

    # Fixture: property ($40k), client (income $2000 → cap 40% = $800), sale, rto_application
    prop = sb.table("properties").insert({
        "property_code": f"AF{int(time.time()) % 100000}", "address": f"{TAG} 1 St",
        "city": "Houston", "state": "TX", "purchase_price": 20000, "sale_price": 40000,
        "status": "published",
    }).execute().data[0]
    track("properties", prop["id"])
    cl = sb.table("clients").insert({"name": f"{TAG} Cliente", "phone": "0000000000",
                                     "email": f"{TAG.lower()}@e2e.test"}).execute().data[0]
    track("clients", cl["id"])
    sale = sb.table("sales").insert({
        "property_id": prop["id"], "client_id": cl["id"], "sale_price": 40000,
        "sale_type": "rto", "status": "rto_pending",
    }).execute().data[0]
    track("sales", sale["id"])
    app = sb.table("rto_applications").insert({
        "client_id": cl["id"], "property_id": prop["id"], "sale_id": sale["id"],
        "status": "submitted", "monthly_income": 2000,
        "desired_down_payment": 12000, "desired_term_months": 36,
    }).execute().data[0]
    track("rto_applications", app["id"])

    cap = _affordability_cap(app["id"])
    check("capacidad = 40% de $2000 = $800", abs(cap["cap"] - 800) < 0.01, str(cap))

    # 1) Approve with monthly ABOVE cap ($1200 > $800) → must be BLOCKED
    blocked = False
    try:
        await review_application(app["id"], ApplicationReview(
            status="approved", monthly_rent=1200, term_months=36, down_payment=12000,
            reviewed_by="e2e"))
    except HTTPException as e:
        blocked = e.status_code == 400 and "capacidad de pago" in str(e.detail)
    check("mensualidad sobre tope se BLOQUEA", blocked)
    # no contract should exist
    c = sb.table("rto_contracts").select("id").eq("sale_id", sale["id"]).execute().data or []
    check("no se creó contrato al bloquear", len(c) == 0)

    # 2) Approve UNDER cap ($700 < $800) → allowed
    try:
        await review_application(app["id"], ApplicationReview(
            status="approved", monthly_rent=700, term_months=36, down_payment=12000,
            reviewed_by="e2e"))
        ok_under = True
    except HTTPException as e:
        ok_under = False
        print("    (error inesperado:", e.detail, ")")
    c2 = sb.table("rto_contracts").select("id, monthly_rent").eq("sale_id", sale["id"]).execute().data or []
    for row in c2:
        track("rto_contracts", row["id"])
    check("mensualidad bajo tope se APRUEBA + crea contrato", ok_under and len(c2) == 1
          and float(c2[0]["monthly_rent"]) == 700)

    # reset for override test: new application (contract already made above)
    app2 = sb.table("rto_applications").insert({
        "client_id": cl["id"], "property_id": prop["id"], "sale_id": sale["id"],
        "status": "submitted", "monthly_income": 2000,
        "desired_down_payment": 12000, "desired_term_months": 36,
    }).execute().data[0]
    track("rto_applications", app2["id"])
    # remove the contract from step 2 so approval can create a fresh one
    # (null the sale FK BEFORE deleting the contract)
    sb.table("sales").update({"rto_contract_id": None}).eq("id", sale["id"]).execute()
    sb.table("rto_contracts").delete().eq("sale_id", sale["id"]).execute()

    # 3) Approve ABOVE cap WITH override → allowed, note recorded
    try:
        await review_application(app2["id"], ApplicationReview(
            status="approved", monthly_rent=1200, term_months=36, down_payment=12000,
            reviewed_by="e2e", override_affordability=True,
            override_reason="Cliente tiene ahorros no declarados"))
        ok_override = True
    except HTTPException as e:
        ok_override = False
        print("    (error inesperado:", e.detail, ")")
    c3 = sb.table("rto_contracts").select("id, monthly_rent").eq("sale_id", sale["id"]).execute().data or []
    for row in c3:
        track("rto_contracts", row["id"])
    check("override permite aprobar sobre tope", ok_override and len(c3) == 1
          and float(c3[0]["monthly_rent"]) == 1200)
    note = (sb.table("rto_applications").select("review_notes").eq("id", app2["id"]).execute().data or [{}])[0]
    check("override queda registrado en notas", "OVERRIDE" in (note.get("review_notes") or ""))

    # 4) No income data → allowed but flagged (cap not computable)
    app3 = sb.table("rto_applications").insert({
        "client_id": cl["id"], "property_id": prop["id"], "sale_id": sale["id"],
        "status": "submitted", "desired_down_payment": 12000, "desired_term_months": 36,
    }).execute().data[0]
    track("rto_applications", app3["id"])
    cap3 = _affordability_cap(app3["id"])
    check("sin ingreso → no hay tope computable", cap3["has_income_data"] is False, str(cap3))

    print(f"\n=== {'TODOS PASARON ✅' if not FAILURES else f'{len(FAILURES)} FALLOS ❌: {FAILURES}'} ===")


def teardown():
    print("\n--- Limpieza ---")
    by = {}
    for t, i in CREATED:
        by.setdefault(t, []).append(i)
    # Break the sales ↔ rto_contracts FK cycle first.
    for sid in dict.fromkeys(by.get("sales", [])):
        try:
            sb.table("sales").update({"rto_contract_id": None}).eq("id", sid).execute()
        except Exception:
            pass
    for t in ["rto_contracts", "rto_applications", "sales", "properties", "clients"]:
        ids = list(dict.fromkeys(by.get(t, [])))
        # also clear any contracts left on the sale
        if t == "rto_contracts":
            for sid in by.get("sales", []):
                try:
                    for r in sb.table("rto_contracts").select("id").eq("sale_id", sid).execute().data or []:
                        ids.append(r["id"])
                except Exception:
                    pass
            ids = list(dict.fromkeys(ids))
        if not ids:
            continue
        try:
            sb.table(t).delete().in_("id", ids).execute()
        except Exception as e:
            print(f"  ⚠️ {t}: {e}")
    # residue check
    res = len(sb.table("rto_applications").select("id").ilike("review_notes", f"%{TAG}%").execute().data or [])
    print(f"  limpieza hecha. residuo notas: {res}")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    finally:
        teardown()
    sys.exit(1 if FAILURES else 0)
