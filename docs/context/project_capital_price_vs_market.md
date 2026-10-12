---
name: project_capital_price_vs_market
description: Capital "Evaluar compra" — mínimo 30% ANUAL simple sobre lo que pone Capital (precio − enganche) + compra no por encima del mercado; calculadora; el 70% inicial se descartó
metadata:
  type: project
---

Built 2026-10-12 from Maninos' Capital process map (Responsable de Adquisiciones). The first version used "price ≤ 70% of market value". **Jorge replaced it the same day** (WhatsApp audios): Capital must earn **at least 30% per year, simple (3 years = 90%)**, on what it pays for the house. That 30% sets the monthly rent. The purchase must not be above market value. Capital buys from Homes, from third parties, or buys back from a client who finished their 36/48/60-month term.

- Formula: inversión neta = precio − enganche; cobros = mensualidad × plazo; anual = (cobros/inversión − 1)/años. renta_minima / precio_maximo_compra are its inverses. **ASSUMPTION still pending Jorge's confirmation: the 30% base is net investment (price − down)**, not the full price. Two open questions sent: that base, and what "fuera de mercado" covers (purchase price, total paid by the client, or both). Today the RTO-price-vs-market figure is informational only.
- Contract terms take precedence over the sale's `rto_*` fields (`_terminos`).
- Market value: manual (`capital_market_valuations`, migration 115, `source` mandatory, prevails) > Maninos histórico > `market_listings` with sqft. Cost is never market value. Homes houses: price vs Homes cost, informational (Homes' rule is pending).
- References shown for a purchase decision: histórico of Homes sales and purchases (`data/historico_2025.json`; the DB has only 1 paid cash sale) and what Capital paid (`sales.sale_price` of RTO sales).
- Code: `evaluar_compra` / `kpi_compra` in `api/services/market_valuation.py`. Endpoints: `/financed-houses/{id}/price-evaluation` (GET/PUT/DELETE), `/financed-houses/kpi/price-vs-market`, `POST /financed-houses/purchase-calculator`. UI: `PriceVsMarketCard`, shared `components/capital/evaluacionCompra.tsx`, page `/capital/evaluar-compra` (nav "Compra").
- Reality at launch: median annual return 24%, only 11 of 142 contracts reach 30%. 137 of 142 houses have no sqft, so no automatic market value.

Tests: `tests/test_price_vs_market.py`, `web/e2e/capital-price-vs-market.spec.ts`. Related: [[project_capital_financed_houses]].
