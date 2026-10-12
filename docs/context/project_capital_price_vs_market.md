---
name: project_capital_price_vs_market
description: Capital "Evaluar precio vs. mercado" — precio que paga Capital (sales.sale_price) ≤ 70% del valor de mercado; manual > histórico > anuncios; KPI en Casas Financiadas
metadata:
  type: project
---

Task from Maninos' Capital process map (Responsable de Adquisiciones), built 2026-10-12. Rule: **price Capital pays = `sales.sale_price` (the RTO sale price) ≤ 70% of market value**. The user chose this price explicitly, even after seeing that it makes almost every house fail (median ~104% / mean 95% on the 5 valuable houses).

- Market value precedence: **manual value** (table `capital_market_valuations`, migration 115, one per sale, `source` mandatory, prevails) > Maninos histórico (`data/historico_2025.json`, cartera) > scraped `market_listings` with sqft (asking prices). **Cost (purchase+reno) never counts as market value**.
- Homes houses (source != manual_capital): also show price vs Homes cost (purchase + reno, same `_reno_costs_by_code` as Homes). **No verdict**: Homes' price rule is "pendiente".
- Code: `evaluar_precio` / `valor_automatico` / `kpi_precio_mercado` in `api/services/market_valuation.py`; endpoints `GET/PUT/DELETE /financed-houses/{sale_id}/price-evaluation`, `GET /financed-houses/kpi/price-vs-market`; UI `web/src/components/capital/PriceVsMarketCard.tsx` + KPI on the list.
- Data gap: 137 of 142 financed houses have no `square_feet`, so they get no automatic value until someone fills sqft or types a manual value.

Tests: `tests/test_price_vs_market.py`, `web/e2e/capital-price-vs-market.spec.ts`. Related: [[project_capital_financed_houses]].
