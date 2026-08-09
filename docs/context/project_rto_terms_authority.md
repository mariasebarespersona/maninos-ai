---
name: project_rto_terms_authority
description: "OPEN DECISION: who is the single authority for final RTO terms (down/monthly/term) across Homes, Clientes, Capital"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

**OPEN QUESTION (user will answer later, 2026-07):** Who owns the binding RTO terms (enganche/mensualidad/meses)?

Context — how it works today (verified 2026-07):
- THREE places set terms but only the **Capital reviewer's numbers at approval** win. `sales.rto_*` is last-writer-wins: Homes `create_sale` sets them → Capital `review_application` overwrites (applications.py:144-147) → `create_contract` overwrites again (contracts.py:272-277). No reconciliation.
- The **client's proposed** `rto_applications.desired_down_payment` / `desired_term_months` are captured but NEVER read at approval or contract creation — decorative. Client cannot propose a monthly at all (no field).
- The Capital "AI model" is NOT an LLM — it's `rto_calculation()` (applications.py:407), pure arithmetic (40%-of-disposable-income cap + simple interest). It was DISPLAY-ONLY (shown to reviewer, never enforced/persisted).
- Client sees final terms only on the signing page; can only sign or abandon (no accept/negotiate/reject).

Three candidate authority models presented to the user:
1. **Capital decides** (recommended) — financier sets final terms within affordability; Homes only price+RTO flag; client proposes.
2. **Homes decides, Capital validates** — Homes sets terms, Capital vetoes on affordability.
3. **Client proposes, Capital confirms** — client picks within limits, Capital confirms affordability (needs a client-side monthly field).

DECIDED so far (2026-07): the affordability formula (40% disposable / DTI) must be an ENFORCED CAP at approval, not just advisory — see the affordability-gate work in review_application. This is authority-model-agnostic (the gate lives at Capital approval regardless of who proposes).

Still needed once the user picks a model: stop the 3-way overwrite of `sales.rto_*` (make it a read-only mirror of the contract), surface the client's desired_* to the reviewer, and add a client accept/decline step before the contract becomes binding. Related: [[project_capital_accounting_parity]].
