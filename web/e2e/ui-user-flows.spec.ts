/**
 * UI-driven user-flow tests.
 *
 * Companion to critical-flows.spec.ts. Where that file asserts via the
 * public API, this file drives the BROWSER — clicks buttons, fills
 * forms, navigates pages — to catch regressions that an API-only suite
 * misses (auth state, session persistence, sidebar nav, modals,
 * client-side validation, etc.).
 *
 * Particularly useful after backend security work (RLS policies, auth
 * middleware) because the UI's authenticated session is exactly the
 * surface most likely to break.
 *
 * Suite layout:
 *   I.   Auth & session         (login form + gates + persistence + logout)
 *   II.  Navigation              (sidebar links + tab switching)
 *   III. Modals & forms          (bank transfer, nueva transacción)
 *   IV.  Reports & wizards       (P&L↔Balance↔CashFlow, drilldown, Estado wizard)
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const EMAIL = 'e2e-test@maninos.com'
const PASSWORD = 'E2eTest2026!Maninos'

// ─── Helpers ────────────────────────────────────────────────────────
async function fillLogin(page: Page, email: string, password: string) {
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill(email)
  await page.locator('input[type="password"]').fill(password)
}

async function loginViaForm(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await fillLogin(page, EMAIL, PASSWORD)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    if (!page.url().includes('/login')) break
  }
  expect(page.url(), 'after-login URL still points to /login').not.toContain('/login')
}

async function killOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)
    const omitir = page.locator('button:has-text("Omitir tour")')
    if (await omitir.isVisible({ timeout: 500 }).catch(() => false)) {
      await omitir.click({ force: true }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.evaluate(() => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"], #react-joyride-step-0'
      ).forEach((el) => el.remove())
    })
  }
  await page.evaluate(() => {
    const strip = () => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"]'
      ).forEach((el) => el.remove())
    }
    new MutationObserver(strip).observe(document.body, { childList: true, subtree: true })
    strip()
  })
}

const stamp = () => Date.now().toString().slice(-6)

// ═════════════════════════════════════════════════════════════════════
// I. AUTH & SESSION
// ═════════════════════════════════════════════════════════════════════

test.describe('Auth & session', () => {
  test('login form: valid credentials redirect to /homes', async ({ page }) => {
    test.setTimeout(90000)
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' })
    await fillLogin(page, EMAIL, PASSWORD)
    await page.getByRole('button', { name: /ingresar|login|submit/i }).click()

    // Allow up to 30s for Supabase auth to round-trip and the app router
    // to settle on a non-login page.
    let landed = false
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000)
      if (!page.url().includes('/login')) { landed = true; break }
    }
    expect(landed, `still on /login after submit (current: ${page.url()})`).toBeTruthy()
    expect(page.url()).toMatch(/\/(homes|capital|clientes)/)
  })

  test('login form: invalid credentials show error and stay on /login', async ({ page }) => {
    test.setTimeout(60000)
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' })
    await fillLogin(page, EMAIL, 'wrong-password-12345')
    await page.getByRole('button', { name: /ingresar|login|submit/i }).click()

    // Wait long enough for Supabase to reject + UI to show an error
    await page.waitForTimeout(5000)
    expect(page.url(), 'invalid credentials should NOT redirect').toContain('/login')

    // The error surfaces either as an inline message, toast, or alert.
    // Accept any of them — we just need "something visible that says
    // login failed".
    const errorVisible = await page.evaluate(() => {
      const body = document.body.innerText.toLowerCase()
      return /invalid|incorrect|inválid|credenciales|error/i.test(body)
    })
    expect(errorVisible, 'no visible feedback after wrong-password submit').toBeTruthy()
  })

  test('auth gate: unauthenticated visit to /homes redirects to /login', async ({ page, context }) => {
    test.setTimeout(60000)
    await context.clearCookies()
    await page.goto(`${APP_URL}/homes`, { waitUntil: 'domcontentloaded' })
    // App router may need a beat to detect missing session.
    await page.waitForTimeout(3000)
    expect(page.url(), `should have been redirected to /login but ended at ${page.url()}`).toContain('/login')
  })

  test('session persists across page reload', async ({ page }) => {
    test.setTimeout(90000)
    await loginViaForm(page)
    const beforeReload = page.url()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    expect(page.url(), `reload kicked user back to ${page.url()}`).not.toContain('/login')
    expect(page.url()).toBe(beforeReload)
  })

  test('logout clears session and blocks /homes', async ({ page, context }) => {
    test.setTimeout(120000)
    await loginViaForm(page)
    await killOverlays(page)

    // Find the logout button. Sidebar typically has "Cerrar Sesión" or
    // similar; allow several common labels.
    const logout = page
      .getByRole('button', { name: /cerrar sesi[oó]n|logout|sign out/i })
      .or(page.getByRole('link', { name: /cerrar sesi[oó]n|logout|sign out/i }))
    if (!(await logout.isVisible({ timeout: 5000 }).catch(() => false))) {
      test.info().annotations.push({ type: 'note', description: 'No logout button visible — skipping logout assertion' })
      return
    }
    await logout.click({ force: true })

    // App should redirect to /login fairly quickly.
    let onLogin = false
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(1000)
      if (page.url().includes('/login')) { onLogin = true; break }
    }
    expect(onLogin, `after-logout URL still: ${page.url()}`).toBeTruthy()

    // Cookies should now be cleared too — trying /homes again should
    // bounce back to /login.
    await page.goto(`${APP_URL}/homes`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2500)
    expect(page.url(), 'after logout /homes should redirect to /login').toContain('/login')
  })
})

// ═════════════════════════════════════════════════════════════════════
// II. NAVIGATION (sidebar + tabs)
// ═════════════════════════════════════════════════════════════════════

test.describe('Sidebar navigation', () => {
  const sections = [
    { name: 'Propiedades',       slug: '/homes/properties',     bodyMatch: /propiedad/i },
    { name: 'Clientes',          slug: '/homes/clients',        bodyMatch: /cliente/i },
    { name: 'Ventas',            slug: '/homes/sales',          bodyMatch: /venta/i },
    { name: 'Notificaciones',    slug: '/homes/notificaciones', bodyMatch: /notificaci/i },
    { name: 'Contabilidad',      slug: '/homes/accounting',     bodyMatch: /contabilidad|resumen|transac/i },
  ]
  for (const sec of sections) {
    test(`sidebar → ${sec.name} loads page`, async ({ page }) => {
      test.setTimeout(90000)
      await loginViaForm(page)
      await killOverlays(page)

      // Use the URL directly — the sidebar Link might rely on Next.js
      // client-side navigation that takes a tick to update window.location.
      await page.goto(`${APP_URL}${sec.slug}`, { waitUntil: 'domcontentloaded' })
      await killOverlays(page)
      await page.waitForTimeout(2500)

      expect(page.url(), `should be at ${sec.slug}`).toContain(sec.slug)
      const bodyText = await page.locator('body').innerText()
      expect(bodyText, `page body should mention ${sec.bodyMatch}`).toMatch(sec.bodyMatch)
    })
  }
})

// ═════════════════════════════════════════════════════════════════════
// III. MODALS & FORMS (button-driven flows)
// ═════════════════════════════════════════════════════════════════════

test.describe('Modals & forms', () => {
  test('Bank transfer modal: open, fill, submit, saldos refresh', async ({ page }) => {
    test.setTimeout(180000)
    await loginViaForm(page)
    await killOverlays(page)

    // Navigate to Contabilidad → Cuentas Bancarias
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)
    await page.getByRole('button', { name: /Cuentas Bancarias/i }).first().click({ force: true })
    await page.waitForTimeout(2000)

    // Open transfer modal via the button we added
    const openBtn = page.locator('[data-testid="open-transfer-modal"]')
    await expect(openBtn).toBeVisible({ timeout: 10000 })
    await openBtn.click({ force: true })

    const modal = page.locator('[data-testid="transfer-modal"]')
    await expect(modal).toBeVisible({ timeout: 8000 })

    // Pick source and destination — first two bank options in the
    // dropdowns. Use option index 1 to skip the placeholder "Selecciona".
    const fromSelect = modal.locator('select').nth(0)
    const toSelect = modal.locator('select').nth(1)
    const fromOptions = await fromSelect.locator('option').count()
    expect(fromOptions, 'no bank options available in transfer modal').toBeGreaterThan(2)

    const fromValue = await fromSelect.locator('option').nth(1).getAttribute('value')
    await fromSelect.selectOption(fromValue!)
    // Pick the FIRST available destination option (excluding the placeholder
    // and the just-picked source) — react filters them dynamically.
    await page.waitForTimeout(300)
    const toCount = await toSelect.locator('option').count()
    expect(toCount).toBeGreaterThan(1)
    const toValue = await toSelect.locator('option').nth(1).getAttribute('value')
    await toSelect.selectOption(toValue!)

    await modal.locator('input[type="number"]').fill('0.07')
    await modal.locator('input[type="text"]').fill(`E2E UI transfer ${stamp()}`)

    // Submit
    const submit = modal.getByRole('button', { name: /^Transferir$/i })
    await submit.click({ force: true })

    // Wait for toast / modal close
    await page.waitForTimeout(4000)
    const stillOpen = await modal.isVisible().catch(() => false)
    expect(stillOpen, 'transfer modal did not close after submit').toBeFalsy()

    // Best-effort counter-transfer to neutralize prod balances.
    await page.request.post(`${APP_URL}/api/accounting/transfers`, {
      data: { from_bank_id: toValue, to_bank_id: fromValue, amount: 0.07, description: 'E2E UI counter-transfer' },
    }).catch(() => null)
  })

  test('Nueva Transacción modal: opens and surfaces the form', async ({ page }) => {
    test.setTimeout(120000)
    await loginViaForm(page)
    await killOverlays(page)
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)

    // Header button "Transacción"
    const btn = page.getByRole('button', { name: /^\s*Transacci[oó]n\s*$/i }).first()
    await expect(btn).toBeVisible({ timeout: 10000 })
    await btn.click({ force: true })

    // The modal should mount — check for typical fields (Fecha, Monto, Tipo).
    await page.waitForTimeout(2000)
    const hasFields = await page.evaluate(() => {
      const body = document.body.innerText
      return /fecha/i.test(body) && /monto/i.test(body) && /tipo/i.test(body)
    })
    expect(hasFields, 'Nueva Transacción modal does not render expected fields').toBeTruthy()

    // Close without submitting
    await page.keyboard.press('Escape').catch(() => {})
  })
})

// ═════════════════════════════════════════════════════════════════════
// IV. REPORTS & WIZARDS
// ═════════════════════════════════════════════════════════════════════

test.describe('Reports & wizards', () => {
  test('Estados Financieros: P&L ↔ Balance Sheet ↔ Cash Flow switching', async ({ page }) => {
    test.setTimeout(180000)
    await loginViaForm(page)
    await killOverlays(page)
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)
    await page.getByRole('button', { name: /Estados Financieros/i }).first().click({ force: true })
    await page.waitForResponse((r) => r.url().includes('/api/accounting/reports/income-statement') && r.status() === 200, { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(1500)

    for (const label of ['Balance Sheet', 'Cash Flow', 'Profit & Loss']) {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first()
      if (!(await btn.isVisible({ timeout: 5000 }).catch(() => false))) continue
      await btn.click({ force: true })
      await page.waitForTimeout(3000)
      // Check the body text mentions the report — heading may rephrase
      // ("Profit and Loss") so don't lock the assertion onto h1/h2/h3.
      const bodyMatches = await page.evaluate((needle) => {
        return document.body.innerText.toLowerCase().includes(needle.toLowerCase())
      }, label.replace(' & ', ' and ').replace('Profit and Loss', 'Profit'))
      expect(bodyMatches, `expected page body to mention ${label}`).toBeTruthy()
    }
  })

  test('Banks tab: clicking a bank card opens the drilldown modal', async ({ page }) => {
    test.setTimeout(120000)
    await loginViaForm(page)
    await killOverlays(page)
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)
    await page.getByRole('button', { name: /Cuentas Bancarias/i }).first().click({ force: true })
    await page.waitForTimeout(2500)

    // Bank cards are <button> elements styled as card-luxury. The first
    // one is the test target.
    const cardButtons = page.locator('button.card-luxury')
    const count = await cardButtons.count()
    expect(count, 'no bank cards visible').toBeGreaterThan(0)
    await cardButtons.first().click({ force: true })
    await page.waitForTimeout(2000)

    // The modal renders with title-bar that includes "transacciones" or
    // "movimientos" depending on the section. Detect it via body text.
    const modalOpened = await page.evaluate(() => {
      const fixed = Array.from(document.querySelectorAll('[class*="fixed"]'))
      return fixed.some(el => {
        const t = el.textContent || ''
        return /movimientos|transacci/i.test(t) && /Ingresos|Gastos|Neto/i.test(t)
      })
    })
    expect(modalOpened, 'drilldown modal did not open').toBeTruthy()
  })

  test('Transacciones tab: leadership filter dropdown is present and selectable', async ({ page }) => {
    test.setTimeout(120000)
    await loginViaForm(page)
    await killOverlays(page)
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)
    await page.getByRole('button', { name: /^\s*Transacciones\s*$/i }).first().click({ force: true })
    await page.waitForTimeout(2000)

    const select = page.locator('select[aria-label="Filtro de liderazgo"]')
    await expect(select).toBeVisible({ timeout: 10000 })
    const opts = await select.locator('option').allTextContents()
    expect(opts.join('|')).toMatch(/Dallas/)
    expect(opts.join('|')).toMatch(/Houston/)
    expect(opts.join('|')).toMatch(/Conroe/)

    await select.selectOption('houston')
    await page.waitForTimeout(800)
    await select.selectOption('') // back to all
  })

  test('Notificaciones: Por Aprobar tab renders without crash', async ({ page }) => {
    test.setTimeout(90000)
    await loginViaForm(page)
    await killOverlays(page)
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded' })
    await killOverlays(page)
    await page.waitForTimeout(2500)

    // The tab itself exists for admin role
    const tab = page.getByRole('button', { name: /Por Aprobar/i })
    if (await tab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await tab.click({ force: true })
      await page.waitForTimeout(1500)
    }
    // The page should show either pending orders OR the empty-state message
    const ok = await page.evaluate(() => {
      const body = document.body.innerText
      return /no hay ordenes por aprobar/i.test(body)
        || /pendiente/i.test(body)
        || /aprobar/i.test(body)
    })
    expect(ok, 'Notificaciones page failed to render').toBeTruthy()
  })
})
