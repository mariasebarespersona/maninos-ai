---
name: project_investor_ledger_estado_validado
description: "Xalli validated the investor ledger as-is (2026-07-31) — pending_confirmation deposits and the 3 odd 23900 rows are ACCEPTED state, not bugs. Only open item = first-payment day-15 convention."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d733b40-7d67-4f5d-9584-546762af48be
  modified: 2026-07-31T09:05:09.504Z
---

Xalli (accounting) reviewed everything on investors (2026-07-31) and signed off on the current state. Do NOT re-flag these as problems:

- The bulk of investor pagaré deposits in `capital_transactions` (23900) with status `pending_confirmation` are the ACCEPTED state — punto B (choosing a debit counterpart account to confirm them) was closed without action. The investor "Estado de cuenta" tab showing $0 contable (with its warning banner) is expected.
- The 3 odd 23900 rows (one deposit with no investor link, one note with an extra installment, one confirmed wire) were reviewed and are fine as-is (punto F cerrado).
- A 10× amount typo on one note (fixed) and a pagaré captured later by the team are resolved.

**The ONLY open investor item:** the first-payment convention for pagarés starting BEFORE the 15th — currently implemented as "first payment on the 15th of the SAME month" in `_note_paid_to_date` (investors.py). If they ever decide "15th of the FOLLOWING month", it's a one-line change (the day>=15 anchor adjustment); affects "Pagado a hoy" of ~20 of 29 notes.

**How to apply:** treat pending_confirmation investor deposits as by-design when auditing/reconciling; the reconciliation endpoint reporting ok:false on 23900 vs notes outstanding is a known, accepted gap. Link: [[project_investor_interest_split]], [[project_manual_capital_intake]].
