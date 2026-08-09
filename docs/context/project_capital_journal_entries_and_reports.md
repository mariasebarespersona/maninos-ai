---
name: project_capital_journal_entries_and_reports
description: Capital has a QuickBooks-style journal-entry feature and a customizable multi-column P&L matrix; balance sheet gap needs opening balances
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

Added 2026-08-08 to Capital accounting (`api/routes/capital/journal_entries.py`, `web/src/app/capital/accounting/page.tsx`):

- **Journal Entries**: `POST/GET/DELETE /capital/accounting/journal-entries`. Balanced multi-line entries (Σdebit=Σcredit), tied to company (`entity: 'capital'|'homes'`) and property-or-general. `is_income` per line derived from the account's `normal_balance` + side (contra-accounts correct). Capital rows share `journal_entry_id`; Homes rows use `'adjustment'` + `payment_reference='JE-…'` (additive, no change to Homes write paths). Frontend: **"Asiento"** button in the Transacciones toolbar → `NewJournalEntryModal`. **Opening balances are done via a JE**: debit the asset account / credit `34000 Opening Balance Equity`.
- **Customizable P&L matrix**: `GET /capital/accounting/reports/pnl-matrix?group_by=month|property|compare&compare=prev_period|prev_year`. Frontend: **"Personalizado"** sub-tab in Estados Financieros with date-range pickers + column-mode selector + click-account drill-down. Regular Balance/P&L drill-down (click amount → its txns) already existed.

**Whole-flow E2E suite:** `scripts/e2e_capital_flows.py` runs complete money flows vs the real DB and asserts the financial statements reflect the expected DELTA (snapshot before/after), marker+teardown, 0 residue. Run: `set -a; source .env; set +a; .venv/bin/python scripts/e2e_capital_flows.py`. It caught 3 real bugs (now fixed): missing `logger` in capital_ledger.py; balance-sheet/P&L/pnl-matrix were counting `pending_confirmation`/`draft` rows (now all reports exclude `voided`/`pending_confirmation`/`draft`, matching the derived-bank-balance rule); `post_capital_statement` double-stamped `bank_account_id` on the counter leg (now only on the bank leg). The older `scripts/e2e_capital_accounting.py` still references dead codes (23900/14300) in its precondition — update before reuse.

**Known gap (user is aware):** the Capital Balance Sheet does NOT balance because historical investor deposits (~$3.14M) were recorded single-legged (liability only, no cash counter-leg). User chose to fix via **opening balances** (JE to 34000) — not yet entered. Also ~$305K accrued interest sits in 20100/71400. Every proxy endpoint under `/api/capital/...` needs its own Next.js `route.ts` (per-endpoint proxy, not a wildcard) — new backend routes 404 from Next until the proxy file exists. Related: [[project_capital_source_of_truth_chart]].
