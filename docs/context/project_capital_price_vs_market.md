---
name: project_capital_price_vs_market
description: Capital "Evaluar compra" — mínimo 30% ANUAL simple sobre lo que pone Capital (precio − enganche) + compra no por encima del mercado; calculadora; el 70% inicial se descartó
metadata:
  type: project
---

Built 2026-10-12 from Maninos' Capital process map (Responsable de Adquisiciones). The first version used "price ≤ 70% of market value". **Jorge replaced it the same day** (WhatsApp audios): Capital must earn **at least 30% per year, simple (3 years = 90%)**, on what it pays for the house. That 30% sets the monthly rent. The purchase must not be above market value. Capital buys from Homes, from third parties, or buys back from a client who finished their 36/48/60-month term.

- Formula: inversión neta = precio − enganche; cobros = mensualidad × plazo; anual = (cobros/inversión − 1)/años. renta_minima / precio_maximo_compra are its inverses. **Jorge confirmed (2026-10-12): the 30% base is net investment (price − down).** He also asked for a second KPI, the **margin on the total cost of the house including the down payment**: (down + monthly × term) / full price − 1, as `sobre_costo_total`. It has no minimum. "Fuera de mercado" applies to both things: the **purchase must be strictly BELOW market value** (equal fails), and the **client's rent must not exceed the market rent**. Market rent is typed by hand with its source (migration 116: `market_rent` / `rent_source`; `market_value` / `source` became nullable). The app has no rent data.
- Contract terms take precedence over the sale's `rto_*` fields (`_terminos`).
- Market value: manual (`capital_market_valuations`, migration 115, `source` mandatory, prevails) > Maninos histórico > `market_listings` with sqft. Cost is never market value. Homes houses: price vs Homes cost, informational (Homes' rule is pending).
- References shown for a purchase decision: histórico of Homes sales and purchases (`data/historico_2025.json`; the DB has only 1 paid cash sale) and what Capital paid (`sales.sale_price` of RTO sales).
- Code: `evaluar_compra` / `kpi_compra` in `api/services/market_valuation.py`. Endpoints: `/financed-houses/{id}/price-evaluation` (GET/PUT/DELETE), `/financed-houses/kpi/price-vs-market`, `POST /financed-houses/purchase-calculator`. UI: `PriceVsMarketCard`, shared `components/capital/evaluacionCompra.tsx`, page `/capital/evaluar-compra` (nav "Compra").
- Reality at launch: median annual return 24%, only 11 of 142 contracts reach 30%. 137 of 142 houses have no sqft, so no automatic market value.

Tests: `tests/test_price_vs_market.py`, `web/e2e/capital-price-vs-market.spec.ts`. Related: [[project_capital_financed_houses]].

**Rent & margin / Propuesta de compra (2026-10-14).**
- **Funding cost** is computed live by `_fondeo()`: the amount-weighted average `annual_rate` of active `promissory_notes` (20.67% at launch). Available funding is the sum of `available_capital` of active investors.
- **Margin traffic light:**
  - red: below the funding cost;
  - amber: covers the funding cost but is below 30%;
  - green: 30% or more (Jorge's target).
- **Rents** are suggested at 24, 36 and 48 months (`rentas_por_plazo`).
- **The "Evaluar compra" page became "Propuesta de compra"** (route `/capital/evaluar-compra`). Proposals are saved server-recalculated in `capital_purchase_proposals` (migration 120) and go through borrador → aprobada / rechazada.
- **Clientes RTO → Cálculo RTO uses the SAME engine.** It previously had a hardcoded 24% simple rate and terms 24–60.
- **Still pending definition:** pricing policy, the exact buffer, what to do when funding is short (today it only warns), and "real vs projected margin".
- E2E: `web/e2e/capital-propuesta-compra.spec.ts`.
