---
name: project_capital_financed_houses
description: "Capital \"Casas Financiadas\" section — property-centric RTO portfolio + investor earmark (read-only aggregation)"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

Capital portal section **"Casas Financiadas"** (added 2026-07): a PROPERTY-centric
view of every Homes financed (RTO) sale, one card per house, from `rto_pending`
through payoff. It does NOT replace the existing Clientes RTO → Contratos → Pagos
workflow — it reunites that data into a portfolio view.

- Backend: `api/routes/capital/financed_houses.py` (prefix `/financed-houses`,
  registered in `api/routes/capital/__init__.py`). Endpoints: `GET /financed-houses`
  (list, bucketed por_revisar/aprobada/activa/liquidada/cancelada from sales.status),
  `GET /{sale_id}` (detail + rto_payments schedule), `GET /{sale_id}/assignable-investments`,
  `POST /{sale_id}/assign-investor`, `POST /{sale_id}/unassign-investor`.
- **Read-only aggregation**: joins `sales`(sale_type=rto) + properties + clients +
  rto_contracts + rto_payments + investments + Capital ledger. Reads Homes tables
  (sales/properties/clients) but NEVER writes Homes or its chart of accounts.
- Per-house **"Posición contable (Capital)"** block reads `capital_transactions`
  filtered by property_id, summed by account: 14300 (paid to Homes for the house),
  42000 (enganche income), 41000 (rental income), 43000 (late fees), 12000 (client A/R).
  The "House Sales - RTO" invoice itself lives on the HOMES ledger (accounting_transactions,
  account code "House Sales - RTO", migration 098) — only read, never touched.
- **"Asignar inversionista" = DEPLOY capital** (revised 2026-07 — the earlier "earmark
  an existing ticket" model was wrong: investors hold capital as `investors.available_capital`
  with NO ticket yet, so the earmark modal was always empty). `POST /{sale_id}/assign-investor`
  takes {investor_id, amount, expected_return_rate} and calls the canonical
  `create_investment` (investors.py) → creates an `investments` ticket ON the house,
  available_capital ↓, total_invested ↑, deposit posts to 23900 (pending→approval).
  Rejects amount > available_capital (so create's `max(0,avail-amt)` clamp can't break
  the round-trip). `assignable-investments` now returns ACTIVE INVESTORS + their
  available_capital (not tickets).
- **"Quitar" = deshacer completo** (`POST /{sale_id}/unassign-investor` {investment_id}):
  reverse the 23900 deposit legs + capital_flow, delete the ticket, THEN restore investor
  totals — ordered so a partial failure never double-counts; errors surface (no swallow).
  Only for note-less active/partial_return tickets (`_UNDOABLE_STATUSES`).
- ⚠️ **`investments` ↔ `capital_flows` FK CYCLE**: `capital_flows.investment_id → investments`
  AND `investments.capital_flow_id → capital_flows`. To delete either you must first NULL
  `investments.capital_flow_id`, then delete txns (by capital_flow_id; `capital_transactions.capital_flow_id`
  is ON DELETE SET NULL so delete txns BEFORE the flow), then the flow, then the ticket.
  Same trick needed in E2E teardown. `create_investment` now persists `capital_flow_id`
  on the ticket for deterministic reversal.
- Cross-links on the detail page: Clientes RTO / Contrato / Pagos / Seguimiento.
- Frontend: nav item "Casas Financiadas" in the Clientes group (`web/src/app/capital/layout.tsx`);
  list `web/src/app/capital/financed-houses/page.tsx`; detail `[id]/page.tsx` with an
  "Asignar inversionista" modal.
- ⚠️ Supabase embed gotcha: `investments` has TWO FKs to `investors` (investor_id +
  transferred_from_investor_id) → must disambiguate: `investors!investments_investor_id_fkey(name)`.
- Tests: `scripts/e2e_financed_houses.py` (real DB, self-cleaning) + `web/e2e/financed-houses.spec.ts`
  (Playwright vs prod) — both pass, 0 residue.
- **Aside**: the global investor reconciliation `principal_vs_notes_payable.diff` was
  ~525k at build time (pre-existing Capital data imbalance, unrelated to this feature).
  Worth investigating separately if asked.
