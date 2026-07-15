/**
 * Homes accounting resumen — RTO sale + expense desglose (Playwright, items 19/20).
 *
 * 19. An RTO/financed sale created through the real wizard must show up in the
 *     resumen's "Ventas Capital (RTO)" line (fed by 'House Sales - RTO'), by the
 *     financed remainder — not in "Ventas Contado".
 * 20. Posting an expense through the Nueva Transacción modal must immediately
 *     update the matching "Desglose de Gastos" line ("Servicios").
 *
 * Reads the actual on-screen resumen numbers before/after. Setup/teardown use a
 * throwaway property+client (unique code) so the kept houses are untouched.
 *
 * PRECONDITION: SUPABASE_URL + SERVICE_ROLE_KEY (read from repo-root .env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2ERT${Date.now() % 100000}`
const PRICE = 40000
const DOWN = 12000
const FINANCED = PRICE - DOWN // 28,000 → Ventas Capital (RTO)
const EXPENSE_AMT = 300
const EXPENSE_MARKER = `E2E PW DESGLOSE ${PCODE}`

function loadRootEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

let sb: SupabaseClient
let propId: string
let clientId: string

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_accounting', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_sales', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

/** Read a "Desglose" row amount (label → sibling amount span) from the resumen. */
async function readResumen(page: Page, label: string): Promise<number> {
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
  const labelSpan = page.getByText(label, { exact: true }).first()
  await expect(labelSpan).toBeVisible({ timeout: 25000 })
  const amount = labelSpan.locator('xpath=following-sibling::span[1]')
  const txt = (await amount.textContent({ timeout: 10000 })) || '0'
  return parseFloat(txt.replace(/[^0-9.]/g, '')) || 0
}

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL).toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const probe = await sb.from('accounting_invoices').select('id').limit(1)
  expect(probe.error).toBeFalsy()
  const p = await sb.from('properties').insert({
    address: 'E2E RT Comm St', city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'published', sale_price: PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: 'E2E RT Cliente', status: 'active', monthly_income: 4000 })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  if (process.env.KEEP_E2E_DATA) { console.warn('KEEP_E2E_DATA — skip teardown'); return }
  try {
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    for (const s of sales) {
      await sb.from('commission_payments').delete().eq('sale_id', s.id)
      await sb.from('rto_applications').delete().eq('sale_id', s.id)
      const invs = (await sb.from('accounting_invoices').select('id').eq('sale_id', s.id)).data || []
      for (const inv of invs) {
        await sb.from('accounting_transactions').delete().eq('entity_id', inv.id)
        await sb.from('accounting_invoices').delete().eq('id', inv.id)
      }
      await sb.from('accounting_transactions').delete().eq('property_id', propId)
      await sb.from('payment_orders').delete().eq('property_id', propId)
      await sb.from('sales').delete().eq('id', s.id)
    }
    // the manual expense transaction pair (both legs share the marker description)
    await sb.from('accounting_transactions').delete().ilike('description', `%${EXPENSE_MARKER}%`)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('19 · venta RTO aparece en "Ventas Capital (RTO)" del resumen', async ({ page }) => {
  test.setTimeout(150000)
  await login(page)

  const rtoBefore = await readResumen(page, 'Ventas Capital (RTO)')
  const contadoBefore = await readResumen(page, 'Ventas Contado')

  // Wizard: property → client → (skip commission) → confirm RTO → create
  await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  await page.getByPlaceholder(/Buscar por dirección/i).fill('E2E RT Comm St')
  const propBtn = page.getByRole('button').filter({ hasText: 'E2E RT Comm St' })
  await expect(propBtn).toBeVisible({ timeout: 20000 })
  await propBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  await page.getByRole('button', { name: 'Cliente Existente' }).click().catch(() => {})
  await page.getByPlaceholder(/Buscar cliente/i).fill('E2E RT Cliente')
  const cliBtn = page.getByRole('button').filter({ hasText: 'E2E RT Cliente' })
  await expect(cliBtn).toBeVisible({ timeout: 20000 })
  await cliBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // employees/commission step — skip (no assignment needed)
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // confirm step — choose Financiada (RTO) and fill terms (scoped to the RTO box)
  await page.getByRole('button', { name: /Financiada \(RTO\)/i }).click()
  const rtoBox = page.locator('div.bg-purple-50').filter({ hasText: 'Términos Financiados' })
  await expect(rtoBox).toBeVisible({ timeout: 10000 })
  await rtoBox.locator('input[type="number"]').first().fill(String(DOWN))  // Enganche
  await rtoBox.locator('input[type="number"]').nth(1).fill('800')          // Mensualidad
  await rtoBox.locator('select').selectOption('36').catch(() => {})        // Plazo

  const salePost = page.waitForResponse(
    (r) => r.url().includes('/api/sales') && r.request().method() === 'POST', { timeout: 30000 },
  ).catch(() => null)
  await page.getByRole('button', { name: /Crear Venta/i }).click()
  const resp = await salePost
  if (resp) console.log(`DIAG POST /api/sales -> ${resp.status()}`)
  await page.waitForURL((url) => url.pathname.endsWith('/homes/sales'), { timeout: 30000 })

  // DB: the financed remainder posted to 'House Sales - RTO'
  let rtoLeg = 0
  for (let i = 0; i < 12; i++) {
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    if (sales.length) {
      const invs = (await sb.from('accounting_invoices').select('id')
        .eq('sale_id', sales[0].id).eq('direction', 'receivable')).data || []
      for (const inv of invs) {
        const legs = (await sb.from('accounting_transactions').select('account_id, amount').eq('entity_id', inv.id)).data || []
        for (const l of legs) {
          const a = (await sb.from('accounting_accounts').select('code').eq('id', l.account_id).single()).data
          if (a?.code === 'House Sales - RTO') rtoLeg += Number(l.amount)
        }
      }
    }
    if (rtoLeg > 0) break
    await page.waitForTimeout(2000)
  }
  expect(rtoLeg, "financed remainder posted to 'House Sales - RTO'").toBeCloseTo(FINANCED, 1)

  // Resumen reflects it: Ventas Capital (RTO) += financed, Ventas Contado unchanged
  const rtoAfter = await readResumen(page, 'Ventas Capital (RTO)')
  const contadoAfter = await readResumen(page, 'Ventas Contado')
  console.log(`DIAG Ventas Capital (RTO): ${rtoBefore} -> ${rtoAfter} | Contado: ${contadoBefore} -> ${contadoAfter}`)
  expect(rtoAfter - rtoBefore).toBeCloseTo(FINANCED, 1)
  expect(contadoAfter - contadoBefore).toBeCloseTo(0, 1)
})

test('20 · un gasto manual actualiza "Servicios" en el desglose', async ({ page }) => {
  test.setTimeout(120000)
  await login(page)

  const before = await readResumen(page, 'Servicios')

  // We are on /homes/accounting (overview). Open Nueva Transacción.
  await page.getByRole('button', { name: /Transacción/i }).first().click()
  const modal = page.locator('div.fixed.inset-0.z-50').filter({ hasText: 'Nueva Transacción' })
  await expect(modal).toBeVisible({ timeout: 10000 })

  // Gasto is the default; pick a service account (→ 'servicios' bucket).
  await modal.getByRole('button', { name: /^Gasto$/ }).click().catch(() => {})
  await modal.locator('select').nth(0).selectOption({ label: 'Office supplies' })  // Cuenta contable
  await modal.getByPlaceholder('0.00').fill(String(EXPENSE_AMT))
  await modal.getByPlaceholder(/Pago de renta yard/i).fill(EXPENSE_MARKER)
  await modal.locator('select').nth(2).selectOption({ index: 1 })                  // Cuenta Bancaria (0='—')
  await modal.getByRole('button', { name: /Registrar Gasto/i }).click()

  // modal closes on success
  await expect(modal).toBeHidden({ timeout: 20000 })

  const after = await readResumen(page, 'Servicios')
  console.log(`DIAG Servicios: ${before} -> ${after}`)
  expect(after - before).toBeCloseTo(EXPENSE_AMT, 1)
})
