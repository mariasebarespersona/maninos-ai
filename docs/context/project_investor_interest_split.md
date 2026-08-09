---
name: project_investor_interest_split
description: Capital investor payments split principal (23900) vs interest (71400); interest separated by ACCOUNT not transaction_type
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

Root fix (2026-07) for the investor↔accounting links in Maninos **Capital**:

- Investor return payments are split into **PRINCIPAL → 23900** (Investor Notes Payable, balance sheet) and **INTEREST → 71400** (Interest paid, P&L). Principal caps at outstanding principal so 23900 never goes negative; the excess is interest.
- **Real production path** = promissory-note payments (`record_note_payment` in `api/routes/capital/promissory_notes.py`), which splits each installment via the amortization schedule (`_note_schedule` / `_split_note_payment`): interest-only tranches book 100% interest, balloon/overpay → principal. Safe fallback to all-principal on any schedule error.
- Canonical endpoint `pay_investor_return` (`capital_flows.py`, POST `/api/capital/flows/pay-return`) has the same split (auto principal-first, or explicit `interest_amount`) — but the UI does NOT currently call it; returns flow through note payments.
- **Interest is separated by ACCOUNT (71400), NOT by transaction_type.** The `capital_transactions_transaction_type_check` constraint has no `investor_interest` value, so the `investor_interest_paid` ledger event keeps `transaction_type="investor_return"` and everything (P&L, reconciliation, reports) distinguishes interest by account 71400. Do NOT switch to a new txn type without a migration adding it to the constraint (else legs silently drop).
- Reconciliation endpoint: `GET /api/capital/investors/investments/reconciliation` — asserts Σ outstanding principal (active notes via schedule + note-less investments) == 23900 balance; reports 71400 interest magnitude. Helper `_capital_account_balance(code)` in `investors.py`.
- Debt transfer (`transfer_investment_debt`) surfaces discount/premium (face vs price) as the investors' realized P&L; Capital's own GL stays net-zero (23900 is a single account → the reclass is a wash).
- Interest recognition is now **accrual-basis**: account **23950 Accrued Interest Payable** (migration 104, Capital-only); ledger events `interest_accrued` (71400/23950, no bank) + `interest_settled` (23950/bank); service `api/services/capital_interest_accrual.py` (idempotent per note+period); scheduler job `accrue_investor_interest` (1st of month). `record_note_payment` interest now SETTLES 23950 (accrues elapsed periods first; full payoff accrues all remaining so 71400 == total scheduled interest and 23950→0). **Defensive fallback**: while 23950 isn't seeded, it reverts to cash-basis (interest→71400), so deploying before migration 104 never drops interest. Manual trigger: `POST /investors/investments/accrue-interest`.
- ⚠️ `pay_investor_return` still does the cash-basis split (interest→71400), NOT the 23950 settlement — it's unused by the UI (returns go through note payments), but align it if the UI ever calls it.
- Reconciliation key renamed `interest_paid_to_date`→`interest_recognized_to_date`; also reports `accrued_interest_payable.ledger_23950_balance`.
- **Early-payoff policy (pro-rata default, per-note configurable)**: `make_whole` boolean on promissory_notes (migration 105, default FALSE=pro-rata). Pro-rata charges only interest accrued to date on early settle and condones the rest; make_whole charges full scheduled interest. Endpoint `POST /promissory-notes/{id}/settle-early` (principal→23900, interest→23950/71400, adjusts total_due/total_interest, marks paid). UI: make-whole checkbox in create-note modal + "Liquidar anticipadamente" button on note detail. `record_note_payment` payoff accrues elapsed (pro-rata) or all (make_whole). Note create only sets make_whole column when True (defensive vs pre-105).
- **Investor account-statement**: `GET /investors/{id}/account-statement` (principal 23900 deposited/repaid/outstanding, interest 71400 recognized/paid, 23950 accrued-unpaid) → "Estado de Cuenta" tab on investor detail page.
- **Estado de Cuenta (bank import/reconcile)** promoted from a Bancos sub-tab to its own top-level tab in `/capital/accounting` (matches Homes).
- **Void reversal**: deleting/cancelling a note voids its accrual legs (`_void_note_accruals`, by `accrual|<note_id>|` tag).
- `pay_investor_return` is cash-basis for bare investment tickets (no schedule) and unused by the UI; note-backed returns use the note-payment flow.
- **⚠️ Migrations to run in prod: 104 (23950 account) + 105 (make_whole column).** Until 104, interest stays cash-basis (fallback). Until 105, make-whole notes can't be created (pro-rata works).
- E2E: `e2e_investor_interest_split.py` (cash-basis), `e2e_investor_interest_accrual.py` (accrual + statement + void), `e2e_note_early_settle.py` (pro-rata; make-whole gated on 105) — pass against real DB, 0 residue. Playwright: `web/e2e/investor-interest-split.spec.ts` — 2 tests pass against prod. See [[feedback_wipe_homes_vs_capital]] (migrations 103/104/105).
