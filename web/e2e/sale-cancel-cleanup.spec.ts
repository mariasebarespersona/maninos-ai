/**
 * E2E: (1) cancelar una venta limpia la comisión y su factura/asientos
 * (bug H42 de Abby), y (2) el enganche RTO ya no exige el mínimo del 30%.
 *
 * Flujo real en el navegador contra producción con propiedad+cliente
 * desechables (teardown completo). Necesita SUPABASE_URL + SERVICE_ROLE_KEY.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PERSON = 'E2E CANCEL COMISION'
const PCODE = `E2ECXL${Date.now() % 100000}`
const ADDRESS = 'E2E Cancel Cleanup St'
const SALE_PRICE = 45000

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

async function skipTour(page: Page) {
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
}

/** Wizard pasos 1 y 2 (propiedad desechable + cliente desechable). */
async function wizardToStep3(page: Page) {
  await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await skipTour(page)
  await page.getByPlaceholder(/Buscar por dirección/i).fill(ADDRESS)
  const propBtn = page.getByRole('button').filter({ hasText: ADDRESS })
  await expect(propBtn).toBeVisible({ timeout: 20000 })
  await propBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()

  await page.getByRole('button', { name: 'Cliente Existente' }).click().catch(() => {})
  await page.getByPlaceholder(/Buscar cliente/i).fill('E2E Cancel Cliente')
  const cliBtn = page.getByRole('button').filter({ hasText: 'E2E Cancel Cliente' })
  await expect(cliBtn).toBeVisible({ timeout: 20000 })
  await cliBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL missing').toBeTruthy()
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY missing').toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'published', sale_price: SALE_PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: 'E2E Cancel Cliente', status: 'active' })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
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
    await sb.from('notifications').delete().eq('property_id', propId)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Cancelar venta elimina comisión + factura + asientos (fix H42)', async ({ page }) => {
  test.setTimeout(180000)
  await loginAsStaff(page)

  // ── Crear venta CONTADO con comisionista ad-hoc (como hizo Abby) ──
  await wizardToStep3(page)
  const foundBox = page.locator('div.bg-blue-50').filter({ hasText: 'Encontró al cliente' })
  await expect(foundBox).toBeVisible({ timeout: 15000 })
  await foundBox.locator('select').selectOption('__adhoc__')
  await foundBox.getByPlaceholder(/externo/i).fill(PERSON)
  await page.getByRole('button', { name: /Siguiente/i }).click()

  await expect(page.getByRole('button', { name: /Crear Venta/i })).toBeVisible({ timeout: 15000 })
  await page.getByRole('button', { name: /Crear Venta/i }).click()
  await page.waitForURL((url) => url.pathname.endsWith('/homes/sales'), { timeout: 30000 })

  // La venta dejó comisión + factura + asientos (estado del bug de Abby)
  let saleId = ''
  let invId = ''
  for (let i = 0; i < 12 && !invId; i++) {
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    if (sales.length) {
      saleId = sales[0].id
      const invs = (await sb.from('accounting_invoices').select('id').eq('sale_id', saleId)).data || []
      if (invs.length) invId = invs[0].id
    }
    if (!invId) await page.waitForTimeout(2000)
  }
  expect(saleId, 'venta creada').toBeTruthy()
  expect(invId, 'factura de comisión creada').toBeTruthy()
  const cpsBefore = (await sb.from('commission_payments').select('id').eq('sale_id', saleId)).data || []
  expect(cpsBefore.length, 'comisión pendiente creada').toBeGreaterThan(0)
  const legsBefore = (await sb.from('accounting_transactions').select('id')
    .eq('entity_type', 'invoice').eq('entity_id', invId)).data || []
  expect(legsBefore.length, 'par de asientos del devengo').toBe(2)

  // ── Cancelar desde la UI (lista de ventas) ──
  await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await skipTour(page)
  // La tarjeta = el div más interno que contiene la dirección Y el botón
  await expect(page.getByText(ADDRESS).first()).toBeVisible({ timeout: 20000 })
  const card = page
    .locator('div')
    .filter({ has: page.getByText(ADDRESS) })
    .filter({ has: page.getByRole('button', { name: /^Cancelar$/ }) })
    .last()
  await card.getByRole('button', { name: /^Cancelar$/ }).click()
  await page.getByRole('button', { name: /Cancelar Venta/i }).click()

  // ── Verificación de raíz: TODO el rastro contable desapareció ──
  let clean = false
  for (let i = 0; i < 15 && !clean; i++) {
    await page.waitForTimeout(2000)
    const cps = (await sb.from('commission_payments').select('id').eq('sale_id', saleId)).data || []
    const invs = (await sb.from('accounting_invoices').select('id').eq('sale_id', saleId)).data || []
    const legs = (await sb.from('accounting_transactions').select('id')
      .eq('entity_type', 'invoice').eq('entity_id', invId)).data || []
    clean = cps.length === 0 && invs.length === 0 && legs.length === 0
  }
  expect(clean, 'comisión + factura + asientos eliminados al cancelar').toBe(true)

  const sale = (await sb.from('sales').select('status').eq('id', saleId).single()).data
  expect(sale?.status).toBe('cancelled')
  const prop = (await sb.from('properties').select('status').eq('id', propId).single()).data
  expect(prop?.status, 'la casa vuelve a publicada').toBe('published')
})

test('Enganche RTO sin mínimo del 30%: el wizard ya no bloquea', async ({ page }) => {
  test.setTimeout(150000)
  await loginAsStaff(page)
  await wizardToStep3(page)

  // Paso equipo: sin comisiones esta vez
  await page.getByRole('button', { name: /Siguiente/i }).click()
  await expect(page.getByText('Confirmar Venta')).toBeVisible({ timeout: 15000 })

  // RTO con enganche del 10% (muy por debajo del viejo mínimo del 30%)
  await page.getByRole('button', { name: /Financiada \(RTO\)/i }).click()
  const rtoBox = page.locator('div.bg-purple-50').filter({ hasText: 'Términos Financiados' })
  await expect(rtoBox).toBeVisible({ timeout: 10000 })
  await rtoBox.locator('input[type="number"]').first().fill(String(SALE_PRICE * 0.10))
  await page.getByPlaceholder('850').fill('850')

  // Ya no existe ni el texto "mín. 30%" ni el error de mínimo
  await expect(page.getByText(/mín\.?\s*30\s*%/i)).toHaveCount(0)
  await expect(page.getByText(/enganche mínimo/i)).toHaveCount(0)

  // La antigua validación cortaba ANTES de llamar al API. Ahora, al pulsar
  // Crear Venta con 10% de enganche, el POST /api/sales SÍ se dispara — lo
  // interceptamos y abortamos para probar el desbloqueo sin crear la venta.
  let postAttempted = false
  await page.route('**/api/sales', async (route) => {
    if (route.request().method() === 'POST') {
      postAttempted = true
      await route.fulfill({ status: 400, contentType: 'application/json', body: '{"detail":"E2E intercept"}' })
    } else {
      await route.continue()
    }
  })
  const createBtn = page.getByRole('button', { name: /Crear Venta/i })
  await expect(createBtn).toBeEnabled()
  await createBtn.click()
  await page.waitForTimeout(3000)
  expect(postAttempted, 'el wizard intentó crear la venta con enganche del 10% (regla del 30% eliminada)').toBe(true)

  // Nada quedó creado (el POST fue interceptado)
  const sales = (await sb.from('sales').select('id, status').eq('property_id', propId)
    .neq('status', 'cancelled')).data || []
  expect(sales.length, 'no se creó ninguna venta nueva').toBe(0)
})
