---
name: project_manual_capital_intake
description: "Legacy RTO clients entered manually from Capital — source='manual_capital' chain hidden from Homes, is_historical payments post nothing; parallel to the automatic Homes→Capital flow."
metadata: 
  node_type: memory
  type: project
  originSessionId: 1d733b40-7d67-4f5d-9584-546762af48be
  modified: 2026-07-31T08:33:02.606Z
---

Capital has a manual-intake path (`api/routes/capital/manual_intake.py`, wizard at `/capital/applications/alta-manual`) for OLD RTO clients who were already paying before the app. It creates the SAME chain as the automatic flow (client → property → sale → rto_application approved → rto_contract active → rto_payments schedule → down-payment installment) so every Capital section links up, but with two markers (migration 106):

- `properties.source` / `sales.source` = **'manual_capital'** → the Homes portal FILTERS these rows with the NULL-safe filter `.or_("source.is.null,source.neq.manual_capital")` in: properties list / financial-summary / stats, sales list / stats / **capital-payments**, transfers list / pending / stats, and **accounting.py's Gabriel dashboard (get_accounting_dashboard: 5 reads + houses_sold drilldown)**. Any NEW Homes endpoint reading sales/properties must add the same filter — leaks were found twice post-launch (capital-payments; Gabriel dashboard). Zero Homes side effects: no [CAPFIN] invoice, no commissions, no payment orders, no emails (it DOES create a title_transfers doc container, hidden from Homes).
- `rto_payments.is_historical` / `capital_down_payment_installments.is_historical` = TRUE → payments collected pre-app: count as paid in schedules/progress but post NOTHING to the Capital ledger (same criterion as pre-app promissory notes / punto B). NEW payments on these contracts follow the normal flow (daily auto-invoice + ledger on record).

**Why:** rto_applications/rto_contracts have NOT NULL FKs to sales and properties, so a Capital-only client still needs (hidden) property+sale rows; and posting years of old payments at once would distort books.

**How to apply:** never "fix" the Homes filters by switching to a plain `.neq()` (drops NULL rows = hides everything). Historical bulk-marking (`mark-paid-until`) must delete any open [RTO:] auto-invoice + its ledger legs (uses `delete_capital_invoice`) or A/R goes phantom. Sales notes column is `rto_notes`, not `notes`. Related: [[project_capital_accounting_parity]], [[project_investor_interest_split]].
