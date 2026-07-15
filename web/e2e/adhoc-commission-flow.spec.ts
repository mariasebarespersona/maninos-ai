/**
 * AD-HOC commission recipient — full UI end-to-end (Playwright).
 *
 * Drives the real "Nueva venta" wizard in the browser and assigns the finder
 * commission to a FREE-TEXT person (external, no Maninos account) via the new
 * "➕ Otra persona (nombre)" option, then confirms the sale. Verifies against
 * the DB that the sale + commission flowed to accounting exactly like an
 * employee commission: a commission_payments row (payee_name, null employee)
 * and a real payable INVOICE (counterparty_type 'person').
 *
 * Setup/teardown create and delete a THROWAWAY property + client so the two
 * kept test properties (H29/B43) are never touched and the app stays clean.
 *
 * PRECONDITION: migration 101 applied. Needs SUPABASE_URL + SERVICE_ROLE_KEY
 * (read from the repo-root .env automatically).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PERSON = 'E2E PW EXTERNO COMISION'
// property_code is UNIQUE — use a fresh one per run so a prior run's leftover
// (e.g. if teardown was skipped) never blocks setup.
const PCODE = `E2EPW${Date.now() % 100000}`
const SALE_PRICE = 45000

// --- load SUPABASE_* from the repo-root .env if not already in the env ---
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

async function loginAsStaff(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
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

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL missing').toBeTruthy()
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SUPABASE_SERVICE_ROLE_KEY missing').toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  // migration 101 guard
  const probe = await sb.from('commission_payments').select('payee_name').limit(1)
  expect(probe.error, 'migration 101 (payee_name) must be applied').toBeFalsy()

  // throwaway sellable property + active client
  const p = await sb.from('properties').insert({
    address: 'E2E PW Comm St', city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'published', sale_price: SALE_PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: 'E2E PW Comm Cliente', status: 'active' })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  if (process.env.KEEP_E2E_DATA) { console.warn('KEEP_E2E_DATA set — skipping teardown'); return }
  try {
    // sale(s) on our throwaway property → drop invoices+legs, commissions, ledger, sale
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    for (const s of sales) {
      const invs = (await sb.from('accounting_invoices').select('id').eq('sale_id', s.id)).data || []
      for (const inv of invs) {
        await sb.from('accounting_transactions').delete().eq('entity_type', 'invoice').eq('entity_id', inv.id)
        await sb.from('accounting_invoices').delete().eq('id', inv.id)
      }
      await sb.from('commission_payments').delete().eq('sale_id', s.id)
      await sb.from('sales').delete().eq('id', s.id)
    }
    await sb.from('accounting_transactions').delete().eq('property_id', propId)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Venta con comisionista ad-hoc (externo) fluye a contabilidad', async ({ page }) => {
  test.setTimeout(150000)
  await loginAsStaff(page)

  await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  // Step 1 · Propiedad — search + select our throwaway property (explicit click
  // guarantees selectedProperty is set, avoiding any preselect race).
  await page.getByPlaceholder(/Buscar por dirección/i).fill('E2E PW Comm St')
  const propBtn = page.getByRole('button').filter({ hasText: 'E2E PW Comm St' })
  await expect(propBtn).toBeVisible({ timeout: 20000 })
  await propBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // Step 2 · Cliente — existing client, search + select.
  await page.getByRole('button', { name: 'Cliente Existente' }).click().catch(() => {})
  await page.getByPlaceholder(/Buscar cliente/i).fill('E2E PW Comm Cliente')
  const cliBtn = page.getByRole('button').filter({ hasText: 'E2E PW Comm Cliente' })
  await expect(cliBtn).toBeVisible({ timeout: 20000 })
  await cliBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // Comisiones step: assign the finder to an AD-HOC person
  const foundBox = page.locator('div.bg-blue-50').filter({ hasText: 'Encontró al cliente' })
  await expect(foundBox).toBeVisible({ timeout: 15000 })
  await foundBox.locator('select').selectOption('__adhoc__')
  const nameInput = foundBox.getByPlaceholder(/externo/i)
  await expect(nameInput).toBeVisible({ timeout: 5000 })
  await nameInput.fill(PERSON)

  // The commission amount should auto-prefill to $1,500 (contado). Continue.
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // Confirm step → create the sale (capture the POST /api/sales response)
  await expect(page.getByRole('button', { name: /Crear Venta/i })).toBeVisible({ timeout: 15000 })
  const salePost = page.waitForResponse(
    (r) => r.url().includes('/api/sales') && r.request().method() === 'POST',
    { timeout: 30000 },
  ).catch(() => null)
  await page.getByRole('button', { name: /Crear Venta/i }).click()
  const resp = await salePost
  if (resp) {
    const body = await resp.text().catch(() => '')
    console.log(`DIAG POST /api/sales -> ${resp.status()} ${body.slice(0, 400)}`)
  } else {
    console.log('DIAG POST /api/sales -> no response captured')
  }

  // Success → redirect to the sales LIST (/homes/sales, not /new)
  await page.waitForURL((url) => url.pathname.endsWith('/homes/sales'), { timeout: 30000 })

  // --- verify the linkage in the DB (backend wrote it) ---
  let sale: any = null
  let cpRow: any = null
  let inv: any = null
  for (let i = 0; i < 12; i++) {
    const sales = (await sb.from('sales').select('*').eq('property_id', propId)).data || []
    if (sales.length) {
      sale = sales[0]
      const cps = (await sb.from('commission_payments').select('*').eq('sale_id', sale.id)).data || []
      cpRow = cps.find((r: any) => (r.payee_name || '') === PERSON) || null
      const invs = (await sb.from('accounting_invoices').select('*')
        .eq('sale_id', sale.id).eq('direction', 'payable')).data || []
      inv = invs.find((x: any) => (x.counterparty_name || '') === PERSON) || null
    }
    if (cpRow && inv) break
    await page.waitForTimeout(2000)
  }

  if (!cpRow || !inv) {
    const allCps = sale ? (await sb.from('commission_payments').select('*').eq('sale_id', sale.id)).data : []
    const allInv = sale ? (await sb.from('accounting_invoices').select('id,sale_id,direction,counterparty_name,counterparty_type,total_amount,account_code').eq('sale_id', sale.id)).data : []
    console.log('DIAG sale:', JSON.stringify(sale))
    console.log('DIAG commission_payments:', JSON.stringify(allCps))
    console.log('DIAG invoices:', JSON.stringify(allInv))
  }

  expect(sale, 'a sale was created on the throwaway property').toBeTruthy()
  expect(cpRow, 'commission_payments row for the ad-hoc person').toBeTruthy()
  expect(cpRow.employee_id, 'ad-hoc row has no employee_id').toBeFalsy()
  expect(Number(cpRow.amount)).toBeCloseTo(1500, 1)
  expect(cpRow.status).toBe('pending')

  expect(inv, 'payable invoice for the ad-hoc person').toBeTruthy()
  expect(inv.counterparty_type).toBe('person')
  expect(Number(inv.total_amount)).toBeCloseTo(1500, 1)

  // --- and that the Comisiones page surfaces the person's name ---
  await page.goto(`${APP_URL}/homes/commissions`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(PERSON, { exact: false }).first()).toBeVisible({ timeout: 20000 })
})
