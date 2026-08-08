#!/usr/bin/env python
"""
WS7 data-fix: migrate the live Capital ledger onto the source-of-truth chart
(migration 107). Dry-run by default; pass --apply to write.

Steps:
  A. Banks — repoint the existing operating bank to BOA CAPITAL 9197 (10120),
     seed the other 5 source banks, remap 10170 bank legs → 10120.
  B. Investor notes — create controlled subaccounts for investors missing from
     the source (Bibiana, DELATORO), link every investor→its Debt Securities
     child, remap 23900 deposit rows → each investor's own account.
  C. Accrued interest — 23950 → 20100 (Accrued Expenses).
  D. Test-statement counter legs — 43000→72200, 60600→65010, 14300→13010.
  E. Deactivate legacy chart codes not in the source (23900, 23950, 10170,
     60600, old header tree) once nothing references them.

Only touches capital_* tables. Never touches Homes.
"""
import argparse, os, re, unicodedata, json, sys
from collections import defaultdict
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
from supabase import create_client

sb = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])

SRC = json.load(open(os.path.join(os.path.dirname(__file__), "..", "data", "qbo_capital_chart.json")))
SRC_CODES = {r["code"] for r in SRC}

# ---- Confident investor → Debt Securities account code map ------------------
INVESTOR_CODE = {
    "Alejandro Diaz Ceballos": "23061",
    "Alejandro Eyssautier": "23001",
    "COFINE SOFOM": "23002",
    "Emanuel Gonzalez 2": "23005",
    "JINX Financial": "23016",
    "Jack Leal 2": "23012",
    "Jeronimo Creel Moreno": "23014",
    "Jesus Solorzano Palomares": "23015",
    "Jorge de la Torre": "23017",
    "Jose Alonso 1": "23018",
    "Jose Alonso 2": "23019",
    "Manuel Pérez Salazar Betanzo": "23029",
    "Marcelo 1": "23031",
    "Marcelo 11": "23034",
    "Marcelo 12": "23035",
    "Marcelo 13": "23036",
    "Marcelo 14": "23037",
    "Marcelo 15": "23038",
    "Marcelo 16": "23039",
    "Marcelo 17": "23040",
    "Marcelo 18": "23059",
    "Mercedes Rosas Torres": "23048",
    "Sebastian Gonzalez": "25100",
    "VALTO 2": "23054",
    "VALTO 3": "23055",
    "VALTO 5": "23056",   # corrected: "VALTO 5 (8/9)"
    "VALTO 10": "23057",
    "VALTO 11": "23053",
}
# Investors missing from the source chart → create controlled subaccounts.
INVESTOR_CREATE = ["Bibiana Solorzano", "DELATORO ENERGIA SAPI DE CV"]

BANKS = [  # (chart_code, name)
    ("10110", "BANK OF AMERICA"),
    ("10130", "Cash"),
    ("10140", "MONEX BANK"),
    ("10150", "PNC"),
    ("10160", "BOA 0623 C2"),
]
PRIMARY_BANK_CODE = "10120"  # BOA CAPITAL 9197

# Ledger code remaps for the test-statement counter legs.
CODE_REMAP = {"43000": "72200", "60600": "65010", "14300": "13010", "23950": "20100"}


def _acc_maps():
    acc = sb.table("capital_accounts").select("id,code,name,is_active,parent_account_id").limit(3000).execute().data
    return {a["code"]: a for a in acc}, {a["id"]: a for a in acc}


def main(apply: bool):
    tag = "APPLY" if apply else "DRY-RUN"
    print(f"===== WS7 Capital data-fix [{tag}] =====\n")
    bycode, byid = _acc_maps()

    def chart_id(code):
        a = bycode.get(code)
        return a["id"] if a else None

    # ---- A. Banks -----------------------------------------------------------
    print("--- A. Banks ---")
    banks = sb.table("capital_bank_accounts").select("*").execute().data
    primary_chart_id = chart_id(PRIMARY_BANK_CODE)
    if banks:
        b0 = banks[0]
        print(f"  repoint '{b0['name']}' → 10120 BOA CAPITAL 9197 (primary)")
        if apply:
            sb.table("capital_bank_accounts").update({
                "name": "BOA CAPITAL 9197", "bank_name": "Bank of America",
                "accounting_account_id": primary_chart_id, "is_primary": True, "is_active": True,
            }).eq("id", b0["id"]).execute()
        # remap 10170 bank legs → 10120
        old = chart_id("10170")
        if old:
            legs = sb.table("capital_transactions").select("id").eq("account_id", old).execute().data or []
            print(f"  remap {len(legs)} bank-leg txns 10170 → 10120")
            if apply and legs:
                for r in legs:
                    sb.table("capital_transactions").update({"account_id": primary_chart_id}).eq("id", r["id"]).execute()
    existing_bank_charts = {b.get("accounting_account_id") for b in banks}
    for code, name in BANKS:
        cid = chart_id(code)
        if cid in existing_bank_charts:
            print(f"  bank {code} {name}: already exists")
            continue
        print(f"  seed bank {code} {name}")
        if apply:
            sb.table("capital_bank_accounts").insert({
                "name": name, "bank_name": name, "accounting_account_id": cid,
                "is_primary": False, "is_active": True, "current_balance": 0,
            }).execute()

    # ---- B. Investor notes --------------------------------------------------
    print("\n--- B. Investor notes (23900 → per-investor) ---")
    investors = sb.table("investors").select("id,name").limit(1000).execute().data
    # Investor names in the DB sometimes carry trailing spaces — match on strip().
    name_to_id = {(i["name"] or "").strip(): i["id"] for i in investors}
    id_to_name = {i["id"]: (i["name"] or "").strip() for i in investors}
    code_map = {k.strip(): v for k, v in INVESTOR_CODE.items()}

    # create missing subaccounts
    used = {c for c in bycode if re.match(r"^23\d{3}$", c)}
    def next_code():
        for n in range(23001, 24000):
            if str(n) not in used:
                used.add(str(n)); return str(n)
        return None
    parent_23000 = chart_id("23000")
    for nm in INVESTOR_CREATE:
        nm = nm.strip()
        nc = next_code()
        print(f"  create subaccount {nc} '{nm}' under 23000")
        code_map[nm] = nc
        if apply:
            ins = sb.table("capital_accounts").insert({
                "code": nc, "name": nm, "account_type": "liability", "category": "investor_debt",
                "subtype": "Long Term Liabilities", "detail_type": "Notes Payable",
                "normal_balance": "credit", "report_section": "balance_sheet",
                "statement_group": "Balance General - Pasivo No Circulante",
                "is_header": False, "is_active": True, "parent_account_id": parent_23000,
                "description": f"Pagaré / nota de inversionista: {nm}.",
            }).execute()

    # refresh chart map after inserts
    if apply:
        bycode, byid = _acc_maps()
        def chart_id(code):
            a = bycode.get(code); return a["id"] if a else None

    # link investors + promissory_notes.chart_account_code
    print("  link investors.chart_account_code:")
    unmatched = [i["name"] for i in investors if (i["name"] or "").strip() not in code_map]
    for nm, code in code_map.items():
        iid = name_to_id.get(nm)
        if not iid:
            continue
        if apply:
            sb.table("investors").update({"chart_account_code": code}).eq("id", iid).execute()
            sb.table("promissory_notes").update({"chart_account_code": code}).eq("investor_id", iid).execute()
    print(f"    linked {sum(1 for n in code_map if n in name_to_id)} investors; unmatched investors: {unmatched}")

    # remap 23900 deposit rows
    id23900 = chart_id("23900")
    rows = sb.table("capital_transactions").select("id,investor_id,amount,is_income,description").eq("account_id", id23900).execute().data or []
    moved = defaultdict(float); unresolved = []
    for r in rows:
        iid = r.get("investor_id"); target_code = None
        if iid:
            nm = id_to_name.get(iid)
            target_code = code_map.get(nm)
        else:
            d = (r.get("description") or "")
            if "Alejandro Eyss" in d: target_code = "23001"
            elif "Jack Leal" in d: target_code = "23011"
        if not target_code:
            unresolved.append(r); continue
        tid = chart_id(target_code)
        signed = float(r["amount"]) * (1 if r["is_income"] else -1)
        moved[target_code] += signed
        if apply and tid:
            sb.table("capital_transactions").update({"account_id": tid}).eq("id", r["id"]).execute()
    print(f"  remapped {len(rows)-len(unresolved)}/{len(rows)} deposit rows; unresolved: {len(unresolved)}")
    print(f"  Σ moved to subaccounts = ${sum(moved.values()):,.2f} (expected 3,144,600.92)")
    for u in unresolved:
        print(f"    UNRESOLVED: inv={u.get('investor_id')} ${u.get('amount')} {str(u.get('description'))[:50]}")

    # ---- C/D. Code remaps ---------------------------------------------------
    print("\n--- C/D. Code remaps ---")
    for old_code, new_code in CODE_REMAP.items():
        oid = chart_id(old_code); nid = chart_id(new_code)
        if not oid or not nid:
            print(f"  {old_code}→{new_code}: skip (missing)"); continue
        rr = sb.table("capital_transactions").select("id").eq("account_id", oid).execute().data or []
        print(f"  {old_code} → {new_code}: {len(rr)} rows")
        if apply and rr:
            for r in rr:
                sb.table("capital_transactions").update({"account_id": nid}).eq("id", r["id"]).execute()

    # ---- E. Deactivate legacy chart codes ----------------------------------
    print("\n--- E. Deactivate legacy (not in source) ---")
    bycode, byid = _acc_maps()
    legacy = [c for c, a in bycode.items() if c not in SRC_CODES and a["is_active"]]
    # ensure nothing references them anymore
    still = []
    for c in legacy:
        cnt = sb.table("capital_transactions").select("id", count="exact").eq("account_id", bycode[c]["id"]).limit(1).execute().count
        if cnt: still.append((c, cnt))
    print(f"  legacy codes to deactivate: {sorted(legacy)}")
    if still:
        print(f"  ⚠️ STILL REFERENCED (won't deactivate): {still}")
    to_deact = [c for c in legacy if c not in {x[0] for x in still}]
    if apply:
        for c in to_deact:
            sb.table("capital_accounts").update({"is_active": False}).eq("code", c).execute()
    print(f"  deactivated: {sorted(to_deact)}")

    print(f"\n===== done [{tag}] =====")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    main(ap.parse_args().apply)
