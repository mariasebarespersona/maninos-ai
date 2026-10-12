/**
 * E2E contra producción (casa + cliente desechables, teardown completo):
 * una venta RTO dada de alta desde Homes (asistente real de Nueva Venta)
 * aparece en Capital.
 *
 *  1. Homes → Ventas → Nueva Venta → Financiada (RTO) → Crear Venta.
 *  2. En la base: venta RTO 'rto_pending' + solicitud RTO 'submitted' ligada.
 *  3. En Capital: el cliente sale en Clientes RTO, la casa en Casas
 *     Financiadas como "Por revisar", y su ficha abre con los términos.
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (usuario con acceso a Homes y a Capital, en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EHC${Date.now() % 100000}`
const ADDRESS = `E2E Homes a Capital ${PCODE}`
const CLIENT = `E2E Cliente RTO ${PCODE}`
const PRICE = 40000
const DOWN = 12000
const MONTHLY = 950

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

let sb: SupabaseClient
let propId = ''
let clientId = ''

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['maninos_tour_completed_homes', 'maninos_tour_completed_capital',
        'maninos_tour_page_homes__homes_sales', 'maninos_tour_page_homes__homes',
        'maninos_tour_page_capital__capital', 'maninos_tour_page_capital__capital_applications']) {
        localStorage.setItem(k, 'true')
      }
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'published', sale_price: PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: CLIENT, status: 'active', monthly_income: 4000 })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    for (const s of sales) {
      await sb.from('commission_payments').delete().eq('sale_id', s.id)
      await sb.from('rto_applications').delete().eq('sale_id', s.id)
      await sb.from('title_transfers').delete().eq('sale_id', s.id)
      await sb.from('scheduled_emails').delete().eq('sale_id', s.id)
      await sb.from('notifications').delete().eq('related_entity_id', s.id)
      const invs = (await sb.from('accounting_invoices').select('id').eq('sale_id', s.id)).data || []
      for (const inv of invs) {
        await sb.from('accounting_transactions').delete().eq('entity_id', inv.id)
        await sb.from('accounting_invoices').delete().eq('id', inv.id)
      }
      await sb.from('accounting_transactions').delete().eq('property_id', propId)
      await sb.from('payment_orders').delete().eq('property_id', propId)
      await sb.from('sales').delete().eq('id', s.id)
    }
    await sb.from('notifications').delete().eq('property_id', propId)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Venta RTO creada en Homes aparece en Capital', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)

  // ── 1. Homes: asistente de Nueva Venta ──────────────────────────────────
  await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  await page.getByPlaceholder(/Buscar por dirección/i).fill(ADDRESS)
  const propBtn = page.getByRole('button').filter({ hasText: ADDRESS })
  await expect(propBtn).toBeVisible({ timeout: 20000 })
  await propBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  await page.getByRole('button', { name: 'Cliente Existente' }).click().catch(() => {})
  await page.getByPlaceholder(/Buscar cliente/i).fill(CLIENT)
  const cliBtn = page.getByRole('button').filter({ hasText: CLIENT })
  await expect(cliBtn).toBeVisible({ timeout: 20000 })
  await cliBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  // empleados / comisión: sin asignar
  await page.getByRole('button', { name: /Siguiente/i }).click()

  await page.getByRole('button', { name: /Financiada \(RTO\)/i }).click()
  const rtoBox = page.locator('div.bg-purple-50').filter({ hasText: 'Términos Financiados' })
  await expect(rtoBox).toBeVisible({ timeout: 10000 })
  await rtoBox.locator('input[type="number"]').first().fill(String(DOWN))
  await rtoBox.locator('input[type="number"]').nth(1).fill(String(MONTHLY))
  await rtoBox.locator('select').selectOption('36').catch(() => {})

  const salePost = page.waitForResponse(
    (r) => r.url().includes('/api/sales') && r.request().method() === 'POST', { timeout: 30000 },
  )
  await page.getByRole('button', { name: /Crear Venta/i }).click()
  expect((await salePost).status(), 'POST /api/sales').toBeLessThan(300)
  await page.waitForURL((url) => url.pathname.endsWith('/homes/sales'), { timeout: 30000 })

  // ── 2. Base: venta RTO pendiente + solicitud RTO ligada ─────────────────
  const sale = (await sb.from('sales').select('id, sale_type, status, sale_price, rto_down_payment, rto_monthly_payment, rto_term_months')
    .eq('property_id', propId).single()).data!
  expect(sale).toMatchObject({ sale_type: 'rto', status: 'rto_pending' })
  expect(Number(sale.sale_price)).toBe(PRICE)
  const app = (await sb.from('rto_applications').select('id, status, client_id').eq('sale_id', sale.id).single()).data!
  expect(app.client_id).toBe(clientId)
  console.log(`venta ${sale.id} · solicitud ${app.id} (${app.status})`)

  // ── 3. Capital ──────────────────────────────────────────────────────────
  // Clientes RTO
  await page.goto(`${APP_URL}/capital/applications`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(CLIENT).first()).toBeVisible({ timeout: 45000 })

  // Casas Financiadas: la tarjeta de la casa, "Por revisar"
  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const card = page.locator(`a[href="/capital/financed-houses/${sale.id}"]`)
  await expect(card).toBeVisible({ timeout: 45000 })
  await expect(card).toContainText(PCODE)
  await expect(card).toContainText('Por revisar')
  await expect(card).toContainText(CLIENT)

  // Ficha de la casa, enlazada con su solicitud
  await card.click()
  await expect(page).toHaveURL(new RegExp(`/capital/financed-houses/${sale.id}`), { timeout: 30000 })
  await expect(page.getByText(PCODE).first()).toBeVisible({ timeout: 30000 })
  await expect(page.getByRole('link', { name: 'Ver en Clientes RTO' }))
    .toHaveAttribute('href', `/capital/applications/${app.id}`, { timeout: 30000 })

  // Ficha de la solicitud en Capital
  await page.goto(`${APP_URL}/capital/applications/${app.id}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(CLIENT).first()).toBeVisible({ timeout: 45000 })
})
