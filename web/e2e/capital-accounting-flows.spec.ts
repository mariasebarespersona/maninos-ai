/**
 * Capital Accounting — browser E2E suite (runs against deployed prod).
 *
 * Covers the NEW /capital/accounting features end-to-end through the UI:
 *   1. Tab bar renders (Facturación, Órdenes de Pago, Gastos Recurrentes,
 *      Auditoría + existing tabs) and the Resumen dashboard loads
 *   2. Bancos: create a bank account → appears with $0.00
 *   3. Transacciones: manual income $500 on the new bank → listed, and the
 *      bank's derived balance becomes $500.00
 *   4. Facturación: receivable invoice $200 → listed → aging renders →
 *      register full payment against the new bank → status Pagada
 *   5. Órdenes de Pago: outbound $150 → Pendiente → Aprobar → Completar
 *      (ref + bank) → Completada → auto [PO:] BILL shows as Pagada
 *   6. Gastos Recurrentes: create monthly $100 → listed → deactivate → gone
 *   7. Auditoría: entries table renders with at least one row
 *   8. Resumen: P&L / KPI summary renders
 *
 * PRODUCTION DATA: every entity carries the E2E-BROWSER-<ts> marker and is
 * removed afterwards by the companion cleanup script (Supabase, FK-safe).
 */
import { test, expect, Page, Locator } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const MARKER = `E2E-BROWSER-${Date.now()}`

test.describe.configure({ mode: 'serial' })

// ─── Login + overlay dismissal (copied from critical-flows.spec.ts) ────
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

// ─── Page helpers ──────────────────────────────────────────────────────
async function gotoAccounting(page: Page) {
  await page.goto(`${APP_URL}/capital/accounting`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  // The h1 only renders once the dashboard fetch resolves
  await expect(page.getByText('Contabilidad Capital').first()).toBeVisible({ timeout: 60000 })
}

async function clickTab(page: Page, label: string) {
  await page.getByRole('button', { name: label, exact: true }).first().click()
  await page.waitForTimeout(800)
}

/** Topmost overlay modal (fixed inset-0). */
function topModal(page: Page): Locator {
  return page.locator('div.fixed.inset-0').last()
}

/** Close the topmost modal by clicking its backdrop corner (onClick=onClose). */
async function closeTopModal(page: Page) {
  await topModal(page).click({ position: { x: 8, y: 8 } }).catch(() => {})
  await page.waitForTimeout(500)
}

/**
 * Inside `scope`, find the <select> that has an option whose text contains
 * `anchor`, then select the first option whose text contains `optionText`
 * (skipping "(grupo)" header rows).
 */
async function selectOptionContaining(scope: Locator, anchor: string, optionText: string) {
  // Options may be populated by an async fetch — poll for up to 30s.
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    const selects = scope.locator('select')
    const n = await selects.count()
    for (let i = 0; i < n; i++) {
      const sel = selects.nth(i)
      const value = await sel.evaluate(
        (el: HTMLSelectElement, args: { anchor: string; optionText: string }) => {
          const opts = Array.from(el.options)
          if (!opts.some((o) => (o.textContent || '').includes(args.anchor))) return null
          const match = opts.find(
            (o) => (o.textContent || '').includes(args.optionText) && !(o.textContent || '').includes('(grupo)') && o.value
          )
          return match ? match.value : null
        },
        { anchor, optionText }
      )
      if (value) {
        await sel.selectOption(value)
        return
      }
    }
    await scope.page().waitForTimeout(1000)
  }
  throw new Error(`No <select> with anchor "${anchor}" + option containing "${optionText}"`)
}

/** In the NewTransaction modal, pick the first real (non-header) income account. */
async function selectFirstIncomeAccount(modal: Locator) {
  const sel = modal.locator('select').first() // Cuenta Contable is the first select
  // The chart of accounts loads via fetch after the modal opens — wait for options.
  await expect
    .poll(async () => sel.evaluate((el: HTMLSelectElement) => el.options.length), {
      timeout: 30000,
      message: 'Cuenta Contable selector never populated (accounts/tree fetch)',
    })
    .toBeGreaterThan(1)
  const value = await sel.evaluate((el: HTMLSelectElement) => {
    const groups = Array.from(el.querySelectorAll('optgroup'))
    const incomeGroup = groups.find((g) => g.label.includes('Ingresos'))
    const pool = incomeGroup ? Array.from(incomeGroup.querySelectorAll('option')) : Array.from(el.options)
    const opt = pool.find((o) => o.value && !(o.textContent || '').includes('(grupo)'))
    return opt ? opt.value : null
  })
  if (!value) throw new Error('No selectable income account found in Cuenta Contable selector')
  await sel.selectOption(value)
}

// ─── Shared page (login once) ──────────────────────────────────────────
let page: Page

test.beforeAll(async ({ browser }) => {
  test.setTimeout(180000)
  page = await browser.newPage()
  // Accept every window.confirm (delete invoice / deactivate recurring / cancel order)
  page.on('dialog', (d) => d.accept().catch(() => {}))
  await loginAsAdmin(page)
  expect(page.url(), 'login must leave /login').not.toContain('/login')
  console.log(`[capital-accounting E2E] marker: ${MARKER}`)
})

test.afterAll(async () => {
  await page?.close().catch(() => {})
})

test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && page) {
    await page
      .screenshot({ path: testInfo.outputPath('failure.png'), fullPage: true })
      .catch(() => {})
  }
})

// ═════════════════════════════════════════════════════════════════════
// 1. Tab bar + dashboard render
// ═════════════════════════════════════════════════════════════════════
test('1. /capital/accounting shows all tabs incl. new ones and Resumen renders', async () => {
  test.setTimeout(180000)
  await gotoAccounting(page)

  for (const tab of [
    'Resumen', 'Transacciones', 'Facturación', 'Órdenes de Pago',
    'Estados Financieros', 'Plan de Cuentas', 'Bancos', 'Gastos Recurrentes',
    'Auditoría', 'Presupuesto',
  ]) {
    await expect(
      page.getByRole('button', { name: tab, exact: true }).first(),
      `tab "${tab}" must be present`
    ).toBeVisible({ timeout: 20000 })
  }

  // Resumen (default tab) KPI cards
  await expect(page.getByText('Ingresos Totales').first()).toBeVisible({ timeout: 20000 })
  await expect(page.getByText('Gastos Totales').first()).toBeVisible()
  await expect(page.getByText('Utilidad Neta').first()).toBeVisible()
  await expect(page.getByText('Valor Portafolio').first()).toBeVisible()
})

// ═════════════════════════════════════════════════════════════════════
// 2. Bancos: create bank, shows with $0.00
// ═════════════════════════════════════════════════════════════════════
test('2. Bancos: create bank account → listed with $0.00', async () => {
  test.setTimeout(240000)
  await gotoAccounting(page)
  await clickTab(page, 'Bancos')

  await page.getByRole('button', { name: 'Nueva Cuenta', exact: true }).click()
  const modal = topModal(page)
  await expect(modal.getByText('Nueva Cuenta Bancaria / Cash')).toBeVisible({ timeout: 15000 })

  await modal.locator('input[placeholder="Ej: Cuenta Operativa Principal"]').fill(`${MARKER} Banco`)
  await modal.locator('input[placeholder="Ej: Chase"]').fill('E2E Bank')
  // leave Saldo Inicial empty → $0
  await modal.getByRole('button', { name: 'Crear Cuenta', exact: true }).click()
  await expect(modal.getByText('Nueva Cuenta Bancaria / Cash')).toBeHidden({ timeout: 30000 })

  // Known quirk: BanksTab keeps its own list state and NewBankAccountModal's
  // onCreated only refreshes the dashboard, so toggle tabs to remount BanksTab.
  await clickTab(page, 'Resumen')
  await clickTab(page, 'Bancos')

  const card = page.locator(`div.card-luxury:has-text("${MARKER} Banco")`).first()
  await expect(card, 'new bank card must appear in Bancos').toBeVisible({ timeout: 30000 })
  await expect(card).toContainText('$0.00', { timeout: 15000 })
})

// ═════════════════════════════════════════════════════════════════════
// 3. Transacciones: manual income $500 → listed → bank derived balance $500
// ═════════════════════════════════════════════════════════════════════
test('3. Transacciones: manual $500 income on new bank → derived balance $500.00', async () => {
  test.setTimeout(300000)
  await gotoAccounting(page) // fresh dashboard so the bank selector includes the new bank

  await page.getByRole('button', { name: 'Transacción', exact: true }).click()
  const modal = topModal(page)
  await expect(modal.getByText('Nueva Transacción')).toBeVisible({ timeout: 15000 })

  await modal.getByRole('button', { name: /Ingreso/ }).first().click()
  await selectFirstIncomeAccount(modal)
  await modal.locator('input[type="number"]').fill('500')
  await modal.locator('input[placeholder="Descripción del movimiento"]').fill(`${MARKER} ingreso`)
  await selectOptionContaining(modal, 'Sin asignar', `${MARKER} Banco`) // Cuenta Bancaria
  await modal.getByRole('button', { name: 'Guardar Transacción', exact: true }).click()
  await expect(modal.getByText('Nueva Transacción')).toBeHidden({ timeout: 30000 })

  // Appears in the Transacciones list
  await clickTab(page, 'Transacciones')
  await page.locator('input[placeholder="Buscar transacciones..."]').fill(MARKER)
  const row = page.locator(`tr:has-text("${MARKER} ingreso")`).first()
  await expect(row, 'manual income txn must be listed').toBeVisible({ timeout: 30000 })
  await expect(row).toContainText('$500.00')

  // Derived bank balance updates to $500.00 — poll with reloads (prod can lag)
  await expect(async () => {
    await gotoAccounting(page)
    await clickTab(page, 'Bancos')
    const card = page.locator(`div.card-luxury:has-text("${MARKER} Banco")`).first()
    await expect(card).toBeVisible({ timeout: 20000 })
    await expect(card).toContainText('$500.00', { timeout: 10000 })
  }).toPass({ timeout: 150000, intervals: [3000, 5000, 10000] })
})

// ═════════════════════════════════════════════════════════════════════
// 4. Facturación: receivable $200 → aging → pay in full → Pagada
// ═════════════════════════════════════════════════════════════════════
test('4. Facturación: create receivable $200, register payment, status Pagada', async () => {
  test.setTimeout(300000)
  await gotoAccounting(page)
  await clickTab(page, 'Facturación')

  await page.getByRole('button', { name: 'Nueva Factura', exact: true }).click()
  const modal = topModal(page)
  await expect(modal.getByText('Nueva Factura').first()).toBeVisible({ timeout: 15000 })
  // Default direction = Por Cobrar (receivable)
  await modal.locator('input[type="text"]').first().fill(`${MARKER} Cliente`) // Cliente
  await modal.locator('input[type="number"]').fill('200')
  await modal.locator('input[placeholder="Concepto de la factura"]').fill(`${MARKER} factura E2E`)
  await modal.getByRole('button', { name: /Crear Factura/ }).click()
  await expect(modal.getByText('Nueva Factura').first()).toBeHidden({ timeout: 30000 })

  // Listed with a status chip
  const row = page.locator(`tr:has-text("${MARKER} Cliente")`).first()
  await expect(row, 'invoice must be listed').toBeVisible({ timeout: 30000 })
  await expect(row).toContainText('$200.00')
  await expect(row).toContainText(/Borrador|Enviada|Parcial|Vencida|Pagada/)

  // Aging section renders (our $200 is outstanding)
  await expect(
    page.getByText(/Antigüedad de Cuentas/).first(),
    'aging report must render'
  ).toBeVisible({ timeout: 30000 })

  // Open detail → register full payment with the E2E bank
  await row.locator('button[title="Ver detalle"]').click()
  const detail = topModal(page)
  await expect(detail.getByText('Detalle de Factura')).toBeVisible({ timeout: 20000 })
  await detail.getByRole('button', { name: /Registrar pago/i }).click()

  const payModal = topModal(page)
  await expect(payModal.getByRole('heading', { name: 'Registrar Pago' }).or(payModal.getByText('Registrar Pago').first())).toBeVisible({ timeout: 15000 })
  // Amount is prefilled with balance_due (200); pick the bank
  await selectOptionContaining(payModal, 'Seleccionar cuenta...', `${MARKER} Banco`)
  await payModal.getByRole('button', { name: 'Registrar Pago', exact: true }).click()

  // Detail modal refreshes → Pagada + payment in history
  const detailAgain = topModal(page)
  await expect(detailAgain.getByText('Pagada').first(), 'invoice must become Pagada').toBeVisible({ timeout: 45000 })
  await expect(detailAgain.getByText('+$200.00').first()).toBeVisible({ timeout: 15000 })
  await closeTopModal(page)

  // List reflects paid status
  await expect(page.locator(`tr:has-text("${MARKER} Cliente")`).first()).toContainText('Pagada', { timeout: 30000 })
})

// ═════════════════════════════════════════════════════════════════════
// 5. Órdenes de Pago: create → approve → complete → auto BILL paid
// ═════════════════════════════════════════════════════════════════════
test('5. Órdenes de Pago: outbound $150 lifecycle + auto [PO:] bill paid', async () => {
  test.setTimeout(300000)
  await gotoAccounting(page)
  await clickTab(page, 'Órdenes de Pago')

  // Create (defaults: Salida/outbound + concepto Gasto Operativo)
  await page.getByRole('button', { name: 'Nueva Orden', exact: true }).click()
  const modal = topModal(page)
  await expect(modal.getByText('Nueva Orden de Pago')).toBeVisible({ timeout: 15000 })
  await modal.locator('input[type="text"]').first().fill(`${MARKER} Proveedor`) // Beneficiario
  await modal.locator('input[type="number"]').fill('150')
  await modal.getByRole('button', { name: 'Crear Orden', exact: true }).click()
  await expect(modal.getByText('Nueva Orden de Pago')).toBeHidden({ timeout: 30000 })

  // Pending list (default filter) shows it
  const pendingRow = page.locator(`tr:has-text("${MARKER} Proveedor")`).first()
  await expect(pendingRow, 'order must list as pending').toBeVisible({ timeout: 30000 })
  await expect(pendingRow).toContainText('Pendiente')
  await expect(pendingRow).toContainText('$150.00')

  // Approve (outbound → no bank modal)
  await pendingRow.getByRole('button', { name: 'Aprobar', exact: true }).click()
  await page.waitForTimeout(2000)

  // Switch to Aprobadas and complete it
  await page.getByRole('button', { name: 'Aprobadas', exact: true }).click()
  const approvedRow = page.locator(`tr:has-text("${MARKER} Proveedor")`).first()
  await expect(approvedRow, 'order must move to approved').toBeVisible({ timeout: 30000 })
  await approvedRow.getByRole('button', { name: 'Completar', exact: true }).click()

  const completeModal = topModal(page)
  await expect(completeModal.getByText('Completar Orden')).toBeVisible({ timeout: 15000 })
  await completeModal.locator('input[type="text"]').first().fill(`${MARKER}-REF`)
  // payment date defaults to today
  await selectOptionContaining(completeModal, 'Seleccionar cuenta...', `${MARKER} Banco`)
  await completeModal.getByRole('button', { name: 'Completar Pago', exact: true }).click()
  await expect(completeModal.getByText('Completar Orden')).toBeHidden({ timeout: 30000 })

  // Completed list shows it with the reference
  await page.getByRole('button', { name: 'Completadas', exact: true }).click()
  const completedRow = page.locator(`tr:has-text("${MARKER} Proveedor")`).first()
  await expect(completedRow, 'order must be completed').toBeVisible({ timeout: 30000 })
  await expect(completedRow).toContainText('Completada')
  await expect(completedRow).toContainText(`${MARKER}-REF`)

  // Auto document-only [PO:] BILL exists in Facturación as paid — poll
  await expect(async () => {
    await gotoAccounting(page)
    await clickTab(page, 'Facturación')
    const billRow = page.locator(`tr:has-text("${MARKER} Proveedor")`).first()
    await expect(billRow, 'auto BILL for the payment order must exist').toBeVisible({ timeout: 20000 })
    await expect(billRow).toContainText('Por Pagar')
    await expect(billRow).toContainText('Pagada')
  }).toPass({ timeout: 120000, intervals: [3000, 5000, 10000] })
})

// ═════════════════════════════════════════════════════════════════════
// 6. Gastos Recurrentes: create monthly $100 → deactivate
// ═════════════════════════════════════════════════════════════════════
test('6. Gastos Recurrentes: create monthly $100, then deactivate', async () => {
  test.setTimeout(240000)
  await gotoAccounting(page)
  await clickTab(page, 'Gastos Recurrentes')

  await page.getByRole('button', { name: 'Nuevo Gasto Recurrente', exact: true }).click()
  const modal = topModal(page)
  await expect(modal.getByText('Nuevo Gasto Recurrente').first()).toBeVisible({ timeout: 15000 })
  await modal.locator('input[placeholder="Ej: Seguro flota"]').fill(`${MARKER} Renta`)
  await modal.locator('input[type="number"]').fill('100')
  // frequency defaults to Mensual (monthly)
  await modal.getByRole('button', { name: 'Crear', exact: true }).click()
  await expect(modal.getByText('Nuevo Gasto Recurrente').first()).toBeHidden({ timeout: 30000 })

  const card = page.locator(`div.card-luxury:has-text("${MARKER} Renta")`).first()
  await expect(card, 'recurring expense must be listed').toBeVisible({ timeout: 30000 })
  await expect(card).toContainText('$100.00')
  await expect(card).toContainText('Mensual')

  // Deactivate (X button; window.confirm auto-accepted by the dialog handler)
  await card.locator('button[title="Desactivar"]').click()
  await expect(
    page.locator(`div.card-luxury:has-text("${MARKER} Renta")`),
    'deactivated recurring expense must disappear'
  ).toHaveCount(0, { timeout: 30000 })
})

// ═════════════════════════════════════════════════════════════════════
// 7. Auditoría: entries table renders with rows
// ═════════════════════════════════════════════════════════════════════
test('7. Auditoría: audit log renders and has at least one entry', async () => {
  test.setTimeout(180000)
  await gotoAccounting(page)
  await clickTab(page, 'Auditoría')

  await expect(page.getByText('Registro de Auditoría').first()).toBeVisible({ timeout: 30000 })
  // Our own actions above generate entries — at least one action chip must show
  await expect(
    page.getByText(/^(Creó|Modificó|Eliminó|Anuló|Concilió)$/).first(),
    'audit log must contain at least one entry'
  ).toBeVisible({ timeout: 45000 })
  await expect(page.getByText(/\(\d+ registros?\)/).first()).toBeVisible({ timeout: 15000 })
})

// ═════════════════════════════════════════════════════════════════════
// 8. Resumen: P&L / KPI summary renders without errors
// ═════════════════════════════════════════════════════════════════════
test('8. Resumen: P&L / KPI summary renders', async () => {
  test.setTimeout(180000)
  await gotoAccounting(page)
  await clickTab(page, 'Resumen')

  await expect(page.getByText('Ingresos Totales').first()).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('Utilidad Neta').first()).toBeVisible()
  await expect(page.getByText(/margen/).first()).toBeVisible()
  // Income / expense breakdown sections
  await expect(page.getByText('Pagos RTO').first()).toBeVisible()
  await expect(page.getByText('Gastos Operativos').first()).toBeVisible()
  await expect(page.getByText('Saldo Bancario').first()).toBeVisible()
  // Dollar figures actually rendered (no NaN / crash)
  await expect(page.getByText(/\$[\d,]+/).first()).toBeVisible()
})
