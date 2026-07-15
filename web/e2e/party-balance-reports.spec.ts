/**
 * Customer / Vendor Balance Summary — browser smoke (Playwright).
 * Verifies the two new reports render in the Estados Financieros tab.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

async function loginAsAbby(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_accounting', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test('Estados Financieros muestra Saldos Clientes y Proveedores', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAbby(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  await page.getByRole('button', { name: 'Estados Financieros', exact: true }).click()

  // Customer Balance Summary
  await page.getByRole('button', { name: 'Saldos Clientes', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Saldos de Clientes/ })).toBeVisible({ timeout: 20000 })

  // Vendor Balance Summary
  await page.getByRole('button', { name: 'Saldos Proveedores', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Saldos de Proveedores/ })).toBeVisible({ timeout: 20000 })
})
