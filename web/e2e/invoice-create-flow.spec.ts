/**
 * Nueva Factura — full end-to-end from the BROWSER (Playwright).
 * As Abby: create a receivable invoice via the modal, confirm it SAVES (no
 * error dialog), and that it links everywhere: it shows in the Customer Balance
 * Summary report AND in the reconciliation open-invoices list (so it can be
 * matched when conciliando). Tagged E2E-PW-FACTURA for cleanup afterwards.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const CLIENTE = 'E2E PW CLIENTE'
const DESC = 'E2E-PW-FACTURA cobro'
const AMOUNT = 1500

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

test('Crear factura por el modal → guarda y se liga (reportes + conciliación)', async ({ page }) => {
  test.setTimeout(150000)
  // Capture any error alert the modal raises so a failed save is caught, not swallowed.
  let dialogMsg = ''
  page.on('dialog', d => { dialogMsg = d.message(); d.accept().catch(() => {}) })

  await loginAsAbby(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  // --- open + fill the Nueva Factura modal (Por Cobrar; leave account default) ---
  await page.getByRole('button', { name: 'Factura', exact: true }).first().click()
  const modal = page.locator('div.bg-white').filter({ has: page.getByRole('heading', { name: 'Nueva Factura' }) })
  await expect(modal).toBeVisible({ timeout: 15000 })
  await modal.locator('input[type="text"]').first().fill(CLIENTE)   // Cliente
  await modal.locator('input[type="number"]').fill(String(AMOUNT))  // Monto
  await modal.getByPlaceholder('Concepto de la factura').fill(DESC)
  await modal.getByRole('button', { name: /Crear Factura/ }).click()

  // Success = modal closes with no error dialog.
  await expect(page.getByRole('heading', { name: 'Nueva Factura' })).toBeHidden({ timeout: 20000 })
  expect(dialogMsg, `Guardar factura mostró error: ${dialogMsg}`).not.toMatch(/error/i)

  // --- linkage via API (reliable), same data the UI renders ---
  const cust = await (await page.request.get(`${APP_URL}/api/accounting/reports/customer-balance-summary`)).json()
  expect((cust.rows || []).some((r: any) => r.name === CLIENTE),
    'La factura debe aparecer en Customer Balance Summary').toBeTruthy()
  const openInv = await (await page.request.get(`${APP_URL}/api/accounting/reconciliation/open-invoices?direction=receivable`)).json()
  expect((openInv.invoices || []).some((i: any) => i.counterparty_name === CLIENTE && Math.abs((i.balance_due || 0) - AMOUNT) < 0.01),
    'La factura debe aparecer en las candidatas de conciliación').toBeTruthy()

  // --- UI: the report renders the customer (fresh reload avoids the create→nav race) ---
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip2 = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip2.isVisible({ timeout: 3000 }).catch(() => false)) await skip2.click().catch(() => {})
  await page.getByRole('button', { name: 'Estados Financieros', exact: true }).click()
  await page.getByRole('button', { name: 'Saldos Clientes', exact: true }).click()
  await expect(page.getByRole('heading', { name: /Saldos de Clientes/ })).toBeVisible({ timeout: 20000 })
  await expect(page.getByText(CLIENTE, { exact: false })).toBeVisible({ timeout: 15000 })
})
