"""
Replace the opening-balance ledger rows for Dallas / Houston / Conroe
with new amounts the user provided (real Maninos production saldos).

Does NOT touch:
  - The 3 Cash accounts (Dallas Cash / Houston Cash / Conroe Cash)
  - Any non-OB ledger row
  - bank_accounts.current_balance gets mirrored to match derived
"""
import os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from tools.supabase_client import sb
from datetime import date

# New opening balances
NEW_BALANCES = {
    'Cuenta Dallas':  3804.42,
    'Cuenta Houston':  893.85,
    'Cuenta Conroe':  5268.09,
}

# 1. Get the Opening Balance Equity chart account
ob_eq = sb.table("accounting_accounts").select("id").eq("code", "Opening balance equity").single().execute().data
if not ob_eq:
    raise SystemExit("ERROR: 'Opening balance equity' account not found in chart")
OB_EQ_ID = ob_eq['id']

# 2. Get banks + their accounting_account_id
banks = sb.table("bank_accounts").select("id, name, accounting_account_id").in_("name", list(NEW_BALANCES.keys())).execute().data or []
print(f"Found {len(banks)} target banks")

today = date.today().isoformat()

for bank in banks:
    name = bank['name']
    new_amount = NEW_BALANCES[name]
    bank_chart_id = bank['accounting_account_id']
    if not bank_chart_id:
        print(f"  ✗ {name}: skipping, no accounting_account_id")
        continue

    print(f"\n=== {name} → ${new_amount:,.2f} ===")

    # 3. Delete any existing opening_balance rows for this bank
    # Find existing OB rows where bank_account_id = bank.id (debit leg) OR
    # linked_transaction_id chains to a debit leg with this bank
    debit_rows = sb.table("accounting_transactions").select("id, linked_transaction_id, amount") \
        .eq("entity_type", "opening_balance") \
        .eq("bank_account_id", bank['id']) \
        .execute().data or []

    # Collect all OB row ids to delete (debit + their credit partners)
    to_delete = set()
    for r in debit_rows:
        to_delete.add(r['id'])
        if r.get('linked_transaction_id'):
            to_delete.add(r['linked_transaction_id'])

    # Also pick up any OB credit rows linked to those debits (defensive)
    if to_delete:
        credit_rows = sb.table("accounting_transactions").select("id, linked_transaction_id") \
            .eq("entity_type", "opening_balance") \
            .in_("linked_transaction_id", list(to_delete)) \
            .execute().data or []
        for r in credit_rows:
            to_delete.add(r['id'])

    if to_delete:
        # Clear statement_movements FKs (defensive, in case anything ever pointed here)
        sb.table("statement_movements").update({"transaction_id": None}).in_("transaction_id", list(to_delete)).execute()
        sb.table("statement_movements").update({"matched_transaction_id": None}).in_("matched_transaction_id", list(to_delete)).execute()
        del_res = sb.table("accounting_transactions").delete().in_("id", list(to_delete)).execute()
        print(f"  Deleted {len(del_res.data or [])} old OB rows")
    else:
        print(f"  No existing OB rows to delete")

    # 4. Insert new OB pair (debit bank chart / credit Opening Balance Equity)
    # Use a stable serial format
    serial_base = f"TXN-OB-{today.replace('-','')[:8]}-{name[:3].upper()}"
    # Generate unique serials via timestamp suffix
    import time
    suffix = str(int(time.time() * 1000))[-6:]
    debit_serial = f"{serial_base}-{suffix}-D"
    credit_serial = f"{serial_base}-{suffix}-C"

    debit_row = sb.table("accounting_transactions").insert({
        "transaction_number": debit_serial,
        "transaction_date": today,
        "transaction_type": "adjustment",
        "amount": new_amount,
        "is_income": True,  # asset gains
        "account_id": bank_chart_id,
        "bank_account_id": bank['id'],
        "counterparty_name": "Opening balance",
        "counterparty_type": "system",
        "entity_type": "opening_balance",
        "description": f"Saldo inicial: {name}",
        "status": "reconciled",
        "notes": "Saldo de apertura actualizado",
    }).execute()
    if not debit_row.data:
        print(f"  ✗ Failed to insert debit row")
        continue
    debit_id = debit_row.data[0]['id']

    credit_row = sb.table("accounting_transactions").insert({
        "transaction_number": credit_serial,
        "transaction_date": today,
        "transaction_type": "adjustment",
        "amount": new_amount,
        "is_income": False,  # equity grows, but our is_income convention says credit-of-equity = is_income=True per type lookup
        "account_id": OB_EQ_ID,
        "counterparty_name": "Opening balance",
        "counterparty_type": "system",
        "entity_type": "opening_balance",
        "description": f"Saldo inicial: contrapartida ({name})",
        "status": "reconciled",
        "notes": "Saldo de apertura actualizado",
        "linked_transaction_id": debit_id,
    }).execute()
    if not credit_row.data:
        print(f"  ✗ Failed to insert credit row, rolling back debit")
        sb.table("accounting_transactions").delete().eq("id", debit_id).execute()
        continue
    credit_id = credit_row.data[0]['id']

    # Link debit back to credit
    sb.table("accounting_transactions").update({
        "linked_transaction_id": credit_id,
    }).eq("id", debit_id).execute()

    # 5. Mirror to bank_accounts.current_balance
    sb.table("bank_accounts").update({"current_balance": new_amount}).eq("id", bank['id']).execute()

    print(f"  ✓ New OB pair inserted: debit={debit_id[:8]} credit={credit_id[:8]}")

print("\nDone. Refresh the UI and verify saldos.")
