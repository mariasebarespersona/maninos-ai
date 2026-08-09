---
name: project_desglose_accrual_buckets
description: "Desglose de ingresos/gastos is accrual, read from the ledger by chart account into buckets; must reconcile to totals and the P&L"
metadata: 
  node_type: memory
  type: project
  originSessionId: e5223da9-e4bf-474d-bda1-f506713af80e
---

The HOMES dashboard "Desglose de Ingresos" and "Desglose de Gastos" (`get_accounting_dashboard`, api/routes/accounting.py) are computed ACCRUAL, read from the LEDGER by chart account — NOT cash-basis, NOT from the `sales`/`renovations` tables. Each transaction leg that hits an Income or Expense/COGS account (via `_signed_balance`) is added to a bucket chosen by the account's `code`.

Income buckets: `House Sales`→Contado, `House Sales - RTO`→RTO, else→Otros.
Expense buckets: `Compra <CODE>`→compra_casas, `Renovación <CODE>`+Supplies→renovaciones, `Movida <CODE>`+Other Contractors→movida, `Comisión <CODE>`+`Commissions & fees`→comisiones, operating Expenses→servicios, Other Expense/bank fees→otros.

**Invariant (there is an E2E for it, web/e2e/desglose-buckets.spec.ts):** the sum of the displayed buckets == `total_income`/`total_expenses`, and it agrees with the P&L. Any new income/expense chart account must be assigned a bucket in `_income_bucket`/`_expense_bucket` or it silently lands in Otros/Servicios.

RTO income = enganche (`sale_down_payment_received` event, ledger.py) + financed portion (`[CAPFIN:]` receivable invoice to Maninos Capital, sales.py) — both credit `House Sales - RTO` (migration 098). Commissions always link to the per-house `Comisión <CODE>` sub-account (created on the fly if missing). Related: [[project_cogs_per_house_policy]], [[project_bank_account_qb_mapping]], [[reference_derived_bank_balances]].
