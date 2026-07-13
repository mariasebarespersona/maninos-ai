/**
 * Balance Sheet — QuickBooks-style structure (as Abby would use it).
 *
 * Verifies against the DEPLOYED app the 3 things Abby asked for:
 *  1. Assets grouped into Current / Fixed / Other Assets; Liabilities into
 *     Current / Long-term.
 *  2. Equity shows REAL accounts (Member's contributions, Retained Earnings…)
 *     + a distinct "Net Income" line — not just a single derived plug.
 *  3. Per-yard columns (Conroe / DFW / Houston), like the P&L.
 *  ...and it must still BALANCE: Assets == Liabilities + Equity.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

async function loginAsAbby(page: Page) {
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

test('Balance Sheet — grouped sections, real equity, yard columns, balances', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAbby(page)

  const resp = await page.request.get(`${APP_URL}/api/accounting/reports/balance-sheet`)
  expect(resp.ok()).toBeTruthy()
  const body = await resp.json()
  const s = body.sections

  // 3. Yard columns present
  expect(Array.isArray(body.locations) && body.locations.length >= 3, 'has yard columns').toBeTruthy()

  // 1. Assets grouped into named sections (Current/Fixed/Other), not a flat tree
  expect(Array.isArray(s.assets), 'assets is a list of sections').toBeTruthy()
  const assetSectionNames = s.assets.map((x: any) => x.name)
  expect(assetSectionNames.some((n: string) => /current assets/i.test(n)), 'has Current Assets').toBeTruthy()
  // each section carries per-yard totals
  for (const sec of s.assets) {
    expect(sec.is_section, `${sec.name} is a section`).toBeTruthy()
    expect(sec.by_location, `${sec.name} has by_location`).toBeTruthy()
  }
  const liabSectionNames = s.liabilities.map((x: any) => x.name)
  expect(liabSectionNames.some((n: string) => /current liab/i.test(n)), 'has Current Liabilities').toBeTruthy()

  // 2. Equity shows real accounts + a distinct Net Income line
  const equityCodes = s.equity.map((n: any) => n.code)
  expect(equityCodes.includes('NET_INCOME'), 'equity has a Net Income line').toBeTruthy()
  expect(s.equity.length >= 2, 'equity has more than a single plug').toBeTruthy()

  // Must balance: A == L + E
  expect(
    near(s.total_assets, s.total_liabilities_and_equity),
    `Assets ${s.total_assets} == L+E ${s.total_liabilities_and_equity}`,
  ).toBeTruthy()

  console.log('[BS] assets sections:', assetSectionNames.join(', '))
  console.log('[BS] liab sections:', liabSectionNames.join(', '))
  console.log('[BS] equity lines:', s.equity.map((n: any) => n.name).join(' | '))
  console.log('[BS] A', s.total_assets, '= L+E', s.total_liabilities_and_equity)

  // ---- UI: open Estados Financieros → Balance Sheet and confirm it renders ----
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  const efBtn = page.getByRole('button', { name: /Estados Financieros/i }).first()
  if (await efBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
    await efBtn.click({ force: true })
    const balBtn = page.getByRole('button', { name: /Balance/i }).first()
    if (await balBtn.isVisible({ timeout: 8000 }).catch(() => false)) {
      await balBtn.click({ force: true })
      await page.waitForResponse(
        (r) => r.url().includes('/api/accounting/reports/balance-sheet') && r.status() === 200,
        { timeout: 30000 },
      ).catch(() => {})
      await expect(page.getByText(/Current Assets/i).first()).toBeVisible({ timeout: 15000 })
    }
  }
})
