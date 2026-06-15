"""
One-shot data fix: clean up the misclassified $5,000 pair from Test 3
that should have been an invoice auto-collect, and replace it with the
correct invoice payment.

Before:
  - TXN-260522-027 / 028 — wrong pair: debit Dallas / credit House Sales
    (income recognized double — once at issuance, once here)
  - Invoice FAC-260522-001 — still status='draft', balance_due=$5,000

After:
  - That pair deleted (cancels the duplicate House Sales income)
  - New pair: debit Dallas / credit Accounts receivable (A/R) — clears AR
  - Invoice → status='paid', amount_paid=$5,000, balance_due=$0
  - accounting_invoice_payments row linking the new bank leg to the invoice
"""
import os
import sys

# Load env from the parent .env
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from tools.supabase_client import sb
from api.services.ledger import post_to_ledger
from datetime import date

INVOICE_ID = 'f47a7be0-64c2-455c-b72a-be84d4f7e4ab'
DALLAS_BANK_ID = '1e9a45e6-d6dd-4037-83c8-4a174b5ef4e3'
BAD_PAIR_IDS = [
    '160ee4bb-56a6-4c07-8156-276d252e6dfa',  # P&L leg (House Sales)
    '5f616b0f-9b1c-44d7-af0f-516182a47027',  # Bank leg
]

# 1. Clear FK from statement_movements pointing at the wrong pair, then delete
print("Step 1a: Clearing statement_movements FKs to wrong pair…")
sb.table("statement_movements").update({
    "transaction_id": None,
    "matched_transaction_id": None,
}).in_("transaction_id", BAD_PAIR_IDS).execute()
sb.table("statement_movements").update({
    "matched_transaction_id": None,
}).in_("matched_transaction_id", BAD_PAIR_IDS).execute()

print("Step 1b: Deleting misclassified pair…")
del_res = sb.table("accounting_transactions").delete().in_("id", BAD_PAIR_IDS).execute()
print(f"  Deleted {len(del_res.data or [])} rows")

# 2. Fetch the invoice
inv_res = sb.table("accounting_invoices").select("*").eq("id", INVOICE_ID).single().execute()
invoice = inv_res.data
print(f"Step 2: Invoice loaded — {invoice['invoice_number']}, status={invoice['status']}, total={invoice['total_amount']}, due={invoice['balance_due']}")

# 3. Post the correct invoice_paid_in pair via the writer (debit Dallas, credit AR)
amount = float(invoice['total_amount'])
print("Step 3: Posting invoice_paid_in pair via ledger writer…")
debit_id, credit_id = post_to_ledger(
    event_type="invoice_paid_in",
    amount=amount,
    bank_account_id=DALLAS_BANK_ID,
    date=date.today().isoformat(),
    counterparty_name=invoice.get('counterparty_name'),
    counterparty_type=invoice.get('counterparty_type'),
    entity_type='invoice',
    entity_id=INVOICE_ID,
    property_id=invoice.get('property_id'),
    yard_id=invoice.get('yard_id'),
    description_data={'invoice_number': invoice['invoice_number']},
    notes='Cobro restaurado manualmente — el wizard había clasificado mal el movimiento',
    status='reconciled',  # already reconciled with the deleted statement movement
)
print(f"  Pair posted — debit={debit_id} credit={credit_id}")

# 4. Insert the invoice_payment row linking the bank leg to the invoice
print("Step 4: Creating accounting_invoice_payments row…")
pay_data = {
    'invoice_id': INVOICE_ID,
    'payment_date': date.today().isoformat(),
    'amount': amount,
    'payment_method': 'ach',
    'payment_reference': 'Restaurado manualmente Test 2/3',
    'notes': 'Restaurado por script tras bug del auto-collect',
    'transaction_id': debit_id,  # bank leg
}
pay_res = sb.table("accounting_invoice_payments").insert(pay_data).execute()
print(f"  Payment row inserted: {pay_res.data[0]['id'] if pay_res.data else 'FAILED'}")

# 5. Update the invoice
print("Step 5: Marking invoice as paid…")
inv_update = sb.table("accounting_invoices").update({
    'amount_paid': amount,
    'status': 'paid',
}).eq('id', INVOICE_ID).execute()
print(f"  Updated {len(inv_update.data or [])} invoice row(s)")

print("\nDone. Verify in the UI:")
print(f"  - Facturación tab should show FAC-260522-001 as PAID")
print(f"  - Dallas saldo should be unchanged ($63,737.21 → still $63,737.21 because we deleted +$5k and added +$5k)")
print(f"  - P&L House Sales should DROP $5,000 (was double, now correct)")
print(f"  - AR should drop to $0")
