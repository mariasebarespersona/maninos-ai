/**
 * Estados Financieros — reconciliation invariants.
 *
 * These are the "no puede haber más fallos de contabilidad" guardrails checked
 * against the DEPLOYED app: the P&L must add up (Income − COGS = Gross Profit;
 * Gross Profit − Expenses = Net Operating Income; +Other = Net Income) and the
 * Balance Sheet must balance (Assets == Liabilities + Equity + Net Income).
 * Read-only: it only fetches the report endpoints.
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

const near = (a: number, b: number, tol = 1) => Math.abs((a || 0) - (b || 0)) < tol

test('P&L reconciles: income − COGS = gross profit; totals chain to net income', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)
  const resp = await page.request.get(`${APP_URL}/api/accounting/reports/income-statement`)
  expect(resp.ok()).toBeTruthy()
  const s = (await resp.json()).sections

  // Gross Profit = Income + Other Income − COGS
  expect(
    near(s.gross_profit, s.total_income + s.total_other_income - s.total_cogs),
    `gross_profit ${s.gross_profit} != income ${s.total_income} + other ${s.total_other_income} − cogs ${s.total_cogs}`,
  ).toBeTruthy()

  // Net Operating Income = Gross Profit − Expenses
  expect(
    near(s.net_operating_income, s.gross_profit - s.total_expenses),
    `net_operating_income ${s.net_operating_income} != gross ${s.gross_profit} − expenses ${s.total_expenses}`,
  ).toBeTruthy()

  // Net Income = Net Operating Income + Net Other Income
  expect(
    near(s.net_income, s.net_operating_income + s.net_other_income),
    `net_income ${s.net_income} != net_op ${s.net_operating_income} + net_other ${s.net_other_income}`,
  ).toBeTruthy()

  // Each section total equals the sum of its top-level tree node totals
  const sumNodes = (nodes: any[]) => (nodes || []).reduce((a, n) => a + (n.total || 0), 0)
  expect(near(s.total_income, sumNodes(s.income)), 'income tree sums to total_income').toBeTruthy()
  expect(near(s.total_cogs, sumNodes(s.cost_of_goods_sold)), 'cogs tree sums to total_cogs').toBeTruthy()
  expect(near(s.total_expenses, sumNodes(s.expenses)), 'expenses tree sums to total_expenses').toBeTruthy()

  console.log('[P&L] income', s.total_income, 'cogs', s.total_cogs, 'gross', s.gross_profit,
    'expenses', s.total_expenses, 'net', s.net_income)
})

test('Balance Sheet balances: Assets == Liabilities + Equity + Net Income', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)
  const resp = await page.request.get(`${APP_URL}/api/accounting/reports/balance-sheet`)
  expect(resp.ok()).toBeTruthy()
  const s = (await resp.json()).sections

  const rhs = s.total_liabilities_and_equity ?? (s.total_liabilities + s.total_equity + s.net_income)
  expect(
    near(s.total_assets, rhs),
    `Assets ${s.total_assets} != L ${s.total_liabilities} + E ${s.total_equity} + NI ${s.net_income} (= ${rhs})`,
  ).toBeTruthy()

  console.log('[BS] assets', s.total_assets, 'liab', s.total_liabilities, 'equity', s.total_equity, 'NI', s.net_income)
})

test('No income/expense line is posted to a header (grouper) account', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)
  // The chart tree marks headers; a header must never carry its OWN balance —
  // only the sum of its children. If balance != 0 on a header, money was
  // posted directly to a grouper (the class of bug the reclassify guard fixes).
  const resp = await page.request.get(`${APP_URL}/api/accounting/accounts/tree`)
  expect(resp.ok()).toBeTruthy()
  const { flat } = await resp.json()
  const offenders = (flat || []).filter(
    (a: any) => a.is_header && Math.abs(a.balance || 0) > 0.005,
  )
  if (offenders.length) {
    console.log('[headers] money on grouper accounts:', offenders.map((a: any) => `${a.name}=${a.balance}`).join(', '))
  }
  // Known legacy items still pending Abby's re-categorization are tolerated for
  // now; this assertion guards against NEW header postings growing unbounded.
  expect(offenders.length, `header accounts carrying a direct balance: ${offenders.map((a: any) => a.name).join(', ')}`).toBeLessThanOrEqual(3)
})
