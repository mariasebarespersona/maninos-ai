---
name: reference-derived-bank-balances
description: How the app computes/shows bank balances and opening balances (accounting)
metadata: 
  node_type: memory
  type: reference
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

The app shows **DERIVED** bank balances, computed from `accounting_transactions` on every read via `get_all_bank_balances()` / `get_bank_balance()` in `api/services/ledger.py` (balance = Σ amount where is_income=true − Σ where is_income=false, skipping status='voided'). The dashboard and `/accounting/bank-accounts` endpoints **overwrite** `bank_accounts.current_balance` with the derived value in their response — so **the stored `current_balance` mirror is irrelevant to the UI; setting it directly has NO visible effect.** Fix balances by changing the ledger, not the mirror.

**Opening balances** are double-entry pairs with `entity_type='opening_balance'`: debit = bank's chart account (`bank_accounts.accounting_account_id`), `is_income=true`, `bank_account_id` set; credit = "Opening balance equity" account (id `6710c5c4-1a81-4e12-81e1-ed05d39cb2db`), `is_income=false`, linked via `linked_transaction_id`. The seeded debit legs have `linked_transaction_id=NULL` (only the credit links back) — when deleting a pair, null the links first or the FK blocks the delete.

**Critical:** an opening balance MUST be dated (`transaction_date`) **before** the account's first real transaction, or any as-of-date / period report shows the account negative. Set it to a real figure — never a back-calculated plug to hit a target "current" balance, which creates fake Opening Balance Equity and breaks on any later edit.

Houston Cash incident (Jun 2026): 6 "1829 Gault Rd" houses paid in cash (−$156,760.83) drove the account negative; was fixed by setting opening balance = real $180,927.52 dated 2026-06-26 → current $24,166.69. See [[project_bank_account_qb_mapping]].
