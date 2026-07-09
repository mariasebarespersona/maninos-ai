/**
 * Desglose de Ingresos/Gastos — bucket reconciliation.
 *
 * The "Desglose" is now read from the LEDGER by chart account (accrual), so it
 * must ALWAYS reconcile: the sum of the displayed income buckets equals
 * total_income, and the sum of the displayed expense buckets equals
 * total_expenses. This is the invariant that guarantees the dashboard agrees
 * with the P&L and can never silently "lose" money into an untracked category.
 *
 * It also asserts the new buckets exist: Ventas RTO (was always $0 before the
 * rework), Movida and Servicios (previously folded into "Otros").
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

async function loginAsAdmin(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    if (!page.url().includes('/login')) break
  }
}

test('Desglose — income & expense buckets reconcile to totals', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)

  const dashboardResp = page.waitForResponse(
    (r) => r.url().includes('/api/accounting/dashboard') && r.status() === 200,
    { timeout: 30000 },
  )
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
  const summary = (await (await dashboardResp).json()).summary
  expect(summary, 'dashboard must return a summary').toBeTruthy()

  const n = (v: unknown) => Number(v || 0)
  const round2 = (v: number) => Math.round(v * 100) / 100

  // ---- Income buckets exist (Ventas RTO must be present, even if 0) ----
  expect(summary.sales_by_type, 'sales_by_type present').toBeTruthy()
  expect(summary.sales_by_type).toHaveProperty('contado')
  expect(summary.sales_by_type).toHaveProperty('rto')

  // ---- New expense buckets exist ----
  expect(summary, 'total_movida present').toHaveProperty('total_movida')
  expect(summary, 'total_servicios present').toHaveProperty('total_servicios')

  // ---- Income reconciliation: contado + rto + otros == total_income ----
  const incomeSum = round2(
    n(summary.sales_by_type.contado) + n(summary.sales_by_type.rto) + n(summary.manual_income),
  )
  expect(
    Math.abs(incomeSum - round2(n(summary.total_income))),
    `income buckets (${incomeSum}) must reconcile to total_income (${n(summary.total_income)})`,
  ).toBeLessThan(0.5)

  // ---- Expense reconciliation: all six buckets == total_expenses ----
  const expenseSum = round2(
    n(summary.total_purchases) +
      n(summary.total_renovations) +
      n(summary.total_movida) +
      n(summary.total_commissions) +
      n(summary.total_servicios) +
      n(summary.manual_expense),
  )
  expect(
    Math.abs(expenseSum - round2(n(summary.total_expenses))),
    `expense buckets (${expenseSum}) must reconcile to total_expenses (${n(summary.total_expenses)})`,
  ).toBeLessThan(0.5)

  // ---- net_profit consistency ----
  expect(
    Math.abs(round2(n(summary.total_income) - n(summary.total_expenses)) - round2(n(summary.net_profit))),
    'net_profit == total_income - total_expenses',
  ).toBeLessThan(0.5)

  console.log('[desglose] income buckets:', JSON.stringify(summary.sales_by_type), 'otros:', summary.manual_income, '=> total', summary.total_income)
  console.log('[desglose] expense buckets: compra', summary.total_purchases, 'reno', summary.total_renovations, 'movida', summary.total_movida, 'comision', summary.total_commissions, 'servicios', summary.total_servicios, 'otros', summary.manual_expense, '=> total', summary.total_expenses)
})
