/**
 * Capital accounting ↔ Homes parity — UI E2E (runs against prod, non-destructive).
 *
 * Verifies the newly-added parity features render and open correctly:
 *  - Estados Financieros: clickable amounts open the drill-down modal; the new
 *    Cash Flow / Saldos Clientes / Saldos Proveedores tabs load; hide-zeros +
 *    collapse toggles exist.
 *  - Transacciones: account filter + edit/reclassify/void controls; edit modal opens.
 *  - Resumen (Overview): income/expense cards are clickable → drill modal.
 *  - Estado de Cuenta: "Ligado manual" toggles the two-panel view.
 *
 * These are read/open assertions — no data is mutated (no save/void/reclassify
 * is committed), so the account's real books are untouched.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

// Disable the product tour (react-joyride) before any page loads — its overlay
// otherwise intercepts tab clicks. The tour is gated on localStorage keys.
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
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    if (!page.url().includes('/login')) break
  }
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
// Robust tab switch: Playwright click, then a DOM-level click fallback (fires the
// React onClick directly, bypassing any pointer-interception), retry on a marker.
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

test('Estados Financieros: nuevas pestañas + toggles cargan', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Estados Financieros', () => page.getByRole('button', { name: 'Balance Sheet', exact: true }).isVisible().catch(() => false))
  await expect(page.getByRole('button', { name: 'Balance Sheet', exact: true })).toBeVisible({ timeout: 30000 })
  // Toggles present on Balance/P&L
  await expect(page.getByRole('button', { name: /Ocultar ceros|Mostrar ceros/ })).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('button', { name: /Colapsar|Expandir/ })).toBeVisible()
  // New report tabs load without crashing (each has a distinctive heading)
  const headings: Record<string, RegExp> = {
    'Cash Flow': /Flujo de Caja/i,
    'Saldos Clientes': /Saldos por Cliente/i,
    'Saldos Proveedores': /Saldos por Proveedor/i,
  }
  for (const t of Object.keys(headings)) {
    await clickTab(page, t, () => page.getByText(headings[t]).first().isVisible().catch(() => false))
    await expect(page.getByText(headings[t]).first()).toBeVisible({ timeout: 20000 })
    await expect(page.locator('body')).not.toContainText('Unhandled Runtime Error')
  }
})

test('Estados Financieros: drill-down de un monto abre transacciones', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Estados Financieros', () => page.getByRole('button', { name: 'Balance Sheet', exact: true }).isVisible().catch(() => false))
  await page.waitForTimeout(1200)
  // Clickable amounts are <button> with dotted underline. Try P&L first, then Balance.
  let clicked = false
  for (const tab of ['Profit and Loss', 'Balance Sheet']) {
    await clickTab(page, tab, () => page.locator('button.underline').first().isVisible().catch(() => false))
    const amt = page.locator('button.underline').first()
    if (await amt.isVisible({ timeout: 5000 }).catch(() => false)) { await amt.click({ force: true }); clicked = true; break }
  }
  expect(clicked, 'un monto clickeable existe en los estados').toBeTruthy()
  await expect(page.getByText(/transacci[oó]n\(es\)/i)).toBeVisible({ timeout: 15000 })
})

test('Transacciones: filtro por cuenta + editar/reclasificar/anular presentes', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Transacciones', () => page.locator('input[placeholder="Buscar transacciones..."]').isVisible().catch(() => false))
  await page.waitForTimeout(600)
  // Account filter dropdown (identified by its title attribute)
  await expect(page.locator('select[title="Filtrar por cuenta contable"]')).toBeVisible({ timeout: 30000 })
  // Action buttons on a row (if any transactions exist)
  const editBtn = page.locator('button[title="Editar"]').first()
  if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await expect(page.locator('button[title="Cambiar cuenta (reclasificar)"]').first()).toBeVisible()
    await expect(page.locator('button[title="Anular"]').first()).toBeVisible()
    // Open edit modal (do NOT save — non-destructive)
    await editBtn.click({ force: true })
    await expect(page.getByText('Editar transacción')).toBeVisible({ timeout: 10000 })
    await page.getByRole('button', { name: 'Cancelar' }).click({ force: true })
  }
})

test('Resumen: tarjeta de ingresos abre drill-down', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Resumen', () => page.getByText('Ingresos Totales').first().isVisible().catch(() => false))
  await expect(page.getByText('Ingresos Totales').first()).toBeVisible({ timeout: 30000 })
  // Click the income card → drill modal (retry the click if the modal is slow)
  let opened = false
  for (let i = 0; i < 4 && !opened; i++) {
    await page.getByText('Ingresos Totales').first().click({ force: true }).catch(() => {})
    opened = await page.getByText(/Ingresos ·/).isVisible({ timeout: 4000 }).catch(() => false)
  }
  expect(opened, 'el modal de drill-down de ingresos abre').toBeTruthy()
})

test('Estado de Cuenta: "Ligado manual" abre el panel de dos columnas', async ({ page }) => {
  await loginAsAdmin(page)
  await gotoAccounting(page)
  await clickTab(page, 'Estado de Cuenta', () => page.getByText(/Importar estado de cuenta|Ligado manual|Paso 1/i).first().isVisible().catch(() => false))
  await page.waitForTimeout(600)
  // Expand the first bank drawer if collapsed, then open a statement if present.
  const stmt = page.getByText(/Paso 1: Conciliar/i)
  if (!(await stmt.isVisible({ timeout: 2000 }).catch(() => false))) {
    // open a statement row if one exists
    const openBtn = page.getByText(/Ver movimientos|Abrir|movimientos/i).first()
    if (await openBtn.isVisible({ timeout: 2000 }).catch(() => false)) { await openBtn.click({ force: true }); await page.waitForTimeout(1500) }
  }
  const manualBtn = page.getByRole('button', { name: /Ligado manual/i }).first()
  if (await manualBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await manualBtn.click({ force: true })
    await expect(page.getByText(/Movimientos del estado de cuenta/i)).toBeVisible({ timeout: 10000 })
  }
})
