---
name: project_capital_source_of_truth_chart
description: Capital chart of accounts is now the QuickBooks source-of-truth (migration 107); per-investor Debt Securities accounts; key code remaps supersede old codes
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

As of 2026-08-08 the **Capital chart of accounts is the definitive QuickBooks export** (`Maninos_Capital_Model_Account_List_updated.xlsx`, 200 numbered accounts). Seeded by **`migrations/107_capital_chart_source_of_truth.sql`**; normalized copy in `data/qbo_capital_chart.json` (gitignored — regenerate from the xlsx). **Rule from the user: the app/AI must NEVER invent or delete accounts outside this list.** `capital_accounts` gained columns `subtype`, `detail_type`, `normal_balance` (debit/credit), `statement_group`; `capital_transactions` gained `journal_entry_id` + `'journal_entry'` type.

**Code remaps (old → new) — old codes are DEACTIVATED, do not use them:**
- Investor notes: single `23900` → **per-investor child of `23000` Debt Securities** (23001–236xx). Each investor/pagaré has its OWN account; deposits/returns resolve it via `resolve_investor_note_account_id` (reads `investors.chart_account_code` / `promissory_notes.chart_account_code`); new ones via `ensure_investor_note_account` (only sanctioned creation). See [[project_investor_interest_split]] — principal now hits the per-investor account, not 23900.
- RTO property `14300` → **`13010`** (Properties:Mobile Homes). Late fee `43000` → **`72200`**. Bank fee `60600` → **`65010`**. A/P `21000` → **`20000`**. Accrued interest payable `23950` → **`20100`**. Rent `41000`, enganche `42000`, commission `60100`, interest paid `71400` unchanged.
- Banks: single `10170` → 6 source banks (10110–10160); **primary = BOA CAPITAL 9197 (10120)**.

Data migrated live by `scripts/fix_capital_source_of_truth.py` (dry-run default, `--apply`): 36 investor deposits ($3,144,600.92) split per-investor, legacy deactivated. Files touched: `api/services/capital_ledger.py` (registry), `api/routes/capital/accounting.py` (INCOME/EXPENSE/BALANCE maps + classifier prompt), `_accounting_hooks.py`, `payment_orders.py`. Only `capital_*` — Homes untouched.
