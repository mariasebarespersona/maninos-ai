/**
 * Capital source-of-truth chart follow-ups — UI E2E (prod, non-destructive).
 *
 * Verifies the two new accountant-requested features render/behave:
 *  - Journal Entries: the "Asiento" modal opens and its live balanced-check
 *    flips to "Balanceado" when debits equal credits. (Not submitted — no data
 *    is written.)
 *  - Customizable financials: the "Personalizado" tab renders the multi-column
 *    P&L matrix with date-range pickers and column-mode selector; switching
 *    modes re-renders without a runtime error.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      const orig = window.localStorage.getItem.bind(window.localStorage)
      window.localStorage.getItem = (k: string) =>
        (k && k.startsWith('maninos_tour_completed')) ? 'true' : orig(k)
    } catch { /* ignore */ }
  })
})

async function loginAsAdmin(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}
async function killOverlays(page: Page) {
  for (let i = 0; i < 5; i++) {
    await page.waitForTimeout(400)
    const omitir = page.locator('button:has-text("Omitir tour")')
    if (await omitir.isVisible({ timeout: 400 }).catch(() => false)) await omitir.click({ force: true }).catch(() => {})
    await page.keyboard.press('Escape').catch(() => {})
  }
  await page.evaluate(() => {
    const strip = () => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll('.react-joyride__overlay, [data-test-id="overlay"]').forEach(el => el.remove())
    }
    new MutationObserver(strip).observe(document.body, { childList: true, subtree: true })
    strip()
  }).catch(() => {})
}
async function gotoAccounting(page: Page) {
  await page.goto(`${APP_URL}/capital/accounting`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await expect(page.getByText(/Contabilidad Capital/i).first()).toBeVisible({ timeout: 60000 })
}
async function clickTab(page: Page, label: string, marker?: () => Promise<boolean>) {
  for (let i = 0; i < 5; i++) {
    await page.getByRole('button', { name: label, exact: true }).first().click({ force: true }).catch(() => {})
    await page.waitForTimeout(700)
    if (marker && await marker()) return
    await page.evaluate((lbl) => {
      const b = Array.from(document.querySelectorAll('button')).find(x => x.textContent?.trim() === lbl)
      ;(b as HTMLButtonElement | undefined)?.click()
    }, label).catch(() => {})
    await page.waitForTimeout(700)
    if (!marker || await marker()) return
  }
}

test('Journal Entry: el modal Asiento abre y el check de balance funciona', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Transacciones', () => page.getByRole('button', { name: 'Asiento', exact: true }).isVisible().catch(() => false))
  await page.getByRole('button', { name: 'Asiento', exact: true }).click({ force: true })
  await expect(page.getByText('Nuevo Asiento Contable')).toBeVisible({ timeout: 15000 })
  // Company selector + at least 2 lines present
  await expect(page.getByRole('button', { name: 'Capital', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Homes', exact: true })).toBeVisible()
  // Unbalanced initially
  await expect(page.getByText(/Diferencia:/)).toBeVisible({ timeout: 5000 })
  // Enter equal debit & credit → balanced
  const nums = page.locator('input[type="number"]')
  await nums.nth(0).fill('100')   // row 1 debit
  await nums.nth(3).fill('100')   // row 2 credit
  await expect(page.getByText(/✓ Balanceado/)).toBeVisible({ timeout: 8000 })
  // Close without saving (non-destructive)
  await page.getByRole('button', { name: 'Cancelar' }).click({ force: true })
})

test('Financieros Personalizado: matriz multi-columna con selector de modo', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Estados Financieros', () => page.getByRole('button', { name: 'Personalizado', exact: true }).isVisible().catch(() => false))
  await clickTab(page, 'Personalizado', () => page.getByRole('button', { name: 'Por Mes', exact: true }).isVisible().catch(() => false))
  // Date pickers + mode buttons present
  await expect(page.locator('input[type="date"]').first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Comparativo', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Por Casa', exact: true })).toBeVisible()
  // Switch to "Por Mes" — should render without a runtime error
  await page.getByRole('button', { name: 'Por Mes', exact: true }).click({ force: true })
  await page.waitForTimeout(1500)
  await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error')
  await expect(page.getByText(/Utilidad Neta|Sin datos para el rango/)).toBeVisible({ timeout: 15000 })
})
