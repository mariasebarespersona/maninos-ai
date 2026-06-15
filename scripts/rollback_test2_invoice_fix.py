"""
Rollback the manual invoice fix from fix_test2_invoice_payment.py.
After running this, the factura goes back to 'draft' with balance_due=$5000
and Cuenta Dallas drops back $5,000 (because we delete the bank-leg pair
my fix script created).
"""
import os, sys
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from tools.supabase_client import sb

INVOICE_ID = 'f47a7be0-64c2-455c-b72a-be84d4f7e4ab'

# 1. Find the invoice_payment created by the manual fix script
print("Step 1: Find manual invoice_payment(s)…")
pays = sb.table("accounting_invoice_payments").select("*").eq("invoice_id", INVOICE_ID).execute().data or []
print(f"  Found {len(pays)} payment(s) for invoice {INVOICE_ID[:8]}")
for p in pays:
    print(f"    payment id={p['id'][:8]} amount={p['amount']} txn={p.get('transaction_id','-')[:8] if p.get('transaction_id') else '-'} notes={(p.get('notes') or '')[:50]}")

# 2. For each payment, find the linked bank-leg pair and delete it
print("\nStep 2: Delete linked payment pairs from accounting_transactions…")
txn_ids_to_delete = set()
for p in pays:
    txn_id = p.get('transaction_id')
    if not txn_id:
        continue
    # Get the linked transaction too
    row = sb.table("accounting_transactions").select("id, linked_transaction_id").eq("id", txn_id).execute().data or []
    if row:
        txn_ids_to_delete.add(row[0]['id'])
        if row[0].get('linked_transaction_id'):
            txn_ids_to_delete.add(row[0]['linked_transaction_id'])

# Clear FKs from statement_movements first (defensive)
if txn_ids_to_delete:
    sb.table("statement_movements").update({"transaction_id": None}).in_("transaction_id", list(txn_ids_to_delete)).execute()
    sb.table("statement_movements").update({"matched_transaction_id": None}).in_("matched_transaction_id", list(txn_ids_to_delete)).execute()

# 3. Delete the payment rows
print("Step 3: Delete invoice_payment rows…")
for p in pays:
    sb.table("accounting_invoice_payments").delete().eq("id", p['id']).execute()
print(f"  Deleted {len(pays)} payment row(s)")

# 4. Delete the transaction pair(s)
if txn_ids_to_delete:
    print(f"Step 4: Delete {len(txn_ids_to_delete)} transaction row(s)…")
    del_res = sb.table("accounting_transactions").delete().in_("id", list(txn_ids_to_delete)).execute()
    print(f"  Deleted {len(del_res.data or [])} txn rows")

# 5. Revert the invoice to draft / sent
print("Step 5: Revert invoice to draft…")
inv = sb.table("accounting_invoices").select("*").eq("id", INVOICE_ID).single().execute().data
new_paid = max(0.0, float(inv.get('amount_paid') or 0) - sum(float(p.get('amount') or 0) for p in pays))
total = float(inv.get('total_amount') or 0)
new_status = 'paid' if new_paid + 0.01 >= total else ('partial' if new_paid > 0 else 'draft')
sb.table("accounting_invoices").update({
    "amount_paid": new_paid,
    "status": new_status,
}).eq("id", INVOICE_ID).execute()
print(f"  Invoice now: status={new_status}, amount_paid={new_paid}, balance_due={total - new_paid}")

print("\nDone. Verify:")
print(f"  - Facturación: FAC-260522-001 should show as 'Por cobrar' again with balance $5,000")
print(f"  - Cuenta Dallas: should drop back to $63,737.21 (or whatever it was pre-fix)")
