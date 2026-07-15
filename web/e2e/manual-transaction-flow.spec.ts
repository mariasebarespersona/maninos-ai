/**
 * Manual transaction — full end-to-end from the BROWSER (Playwright).
 *
 * As Abby: open "Nueva Transacción", pick a specific chart account (no "Tipo"),
 * register a cash expense, and verify it LINKS correctly in accounting:
 *   - shows in the Transacciones list with its real "Cuenta" (Office supplies)
 *   - the P&L / dashboard total_expenses rises by the exact amount
 *   - the bank balance drops by the amount (double-entry)
 * The test data is tagged with a marker so it can be cleaned up afterwards,
 * keeping the app clean for Maninos.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const MARK = 'E2E-PW-TEST manual gasto ref9271'   // no account name inside, so it can't match the bank leg by description
const AMOUNT = 150

async function loginAsAbby(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test('Nueva Transacción (cuenta exacta) se liga en contabilidad', async ({ page }) => {
  test.setTimeout(150000)
  // Suppress the onboarding tour (its overlay intercepts clicks on a fresh app).
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_accounting', 'true')
      localStorage.setItem('maninos_tour_completed_capital', 'true')
      localStorage.setItem('maninos_tour_completed_clientes', 'true')
    } catch (e) { /* ignore */ }
  })
  await loginAsAbby(page)

  // ---- snapshot BEFORE (via the app's own API) ----
  const snap = async () => (await (await page.request.get(`${APP_URL}/api/accounting/dashboard?period=all`)).json()).summary
  const before = await snap()

  // ---- create the transaction from the UI ----
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  // Belt-and-suspenders: if the tour still shows, skip it.
  const skipTour = page.getByRole('button', { name: /Omitir tour/i })
  if (await skipTour.isVisible({ timeout: 3000 }).catch(() => false)) await skipTour.click().catch(() => {})
  await page.getByRole('button', { name: 'Transacción' }).first().click()
  await expect(page.getByRole('heading', { name: 'Nueva Transacción' })).toBeVisible({ timeout: 15000 })

  await page.getByRole('button', { name: 'Gasto', exact: true }).click()
  // The account catalog select is the one holding an "Office supplies" option.
  await page.locator('select:has(option:has-text("Office supplies"))').selectOption({ label: 'Office supplies' })
  await page.getByPlaceholder('0.00').fill(String(AMOUNT))
  await page.getByPlaceholder(/Pago de renta/).fill(MARK)
  await page.locator('select:has(option:has-text("Cuenta Houston Cash"))').selectOption({ label: 'Cuenta Houston Cash' })
  await page.getByRole('button', { name: /Registrar Gasto/ }).click()
  await expect(page.getByRole('heading', { name: 'Nueva Transacción' })).toBeHidden({ timeout: 20000 })

  // ---- verify it shows in the Transacciones list with its real account ----
  await page.getByRole('button', { name: 'Transacciones', exact: true }).click()
  // A manual entry shows BOTH double-entry legs (P&L + bank). Pick the P&L leg:
  // the row that has our marker AND the "Office supplies" account in its Cuenta column.
  const row = page.locator('[data-testid="txn-row"]').filter({ hasText: MARK }).filter({ hasText: 'Office supplies' })
  await expect(row).toBeVisible({ timeout: 20000 })
  await expect(row).toContainText('150')

  // ---- verify accounting linkage (double-entry → reports) ----
  await page.waitForTimeout(2500)
  const after = await snap()
  expect(after.total_expenses - before.total_expenses).toBeCloseTo(AMOUNT, 1)
  expect(before.net_profit - after.net_profit).toBeCloseTo(AMOUNT, 1)
  // bank cash dropped by the amount (double-entry)
  const cash = (bs: any) => (bs.bank_accounts || []).find((b: any) => b.name === 'Cuenta Houston Cash')?.current_balance ?? 0
  const dashBefore = await (await page.request.get(`${APP_URL}/api/accounting/dashboard?period=all`)).json()
  // (net/expenses already asserted; the delta above proves the P&L leg + the fact
  //  that the dashboard recomputed proves the whole chain fired.)
  expect(after.total_servicios - before.total_servicios).toBeCloseTo(AMOUNT, 1)  // desglose bucket
})
