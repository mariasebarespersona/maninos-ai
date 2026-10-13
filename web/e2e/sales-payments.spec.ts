/**
 * E2E contra producción — seguimiento de pagos de una venta (sale_payments).
 *
 * Reescrita 2026-10-13. La versión anterior:
 *  - llamaba a Railway directamente (401 desde el candado del API), y
 *  - cogía la PRIMERA VENTA DE CONTADO REAL y le registraba pagos de prueba
 *    que nunca borraba (ensuciaba datos de clientes de verdad).
 * Ahora todo va por los proxies de la app y sobre una venta desechable con
 * teardown completo.
 *
 * Cubre: listar / registrar / editar pagos (con su orden de cobro enlazada),
 * totales de la venta, notificación, forma de los datos, 404, y la UI de la
 * tarjeta (sección Pagos) y del asistente (pasos actuales).
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2ESP${Date.now() % 100000}`
const ADDRESS = `E2E Sales Payments ${PCODE}`
const PRICE = 30000

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
let saleId = ''

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_sales', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas', property_code: PCODE, sale_price: PRICE, status: 'published',
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Cliente ${PCODE}`, status: 'active' }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
  const r = await request.post(`${APP_URL}/api/sales`, {
    data: { property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'contado', commission_amount: 0 },
  })
  expect(r.status(), await r.text()).toBeLessThan(300)
  saleId = (await r.json()).id
})

test.afterAll(async () => {
  if (!sb || !propId) return
  try {
    const sales = ((await sb.from('sales').select('id').eq('property_id', propId)).data || []).map(s => s.id)
    const invIds = ((await sb.from('accounting_invoices').select('id').eq('property_id', propId)).data || []).map(i => i.id)
    const ordIds = ((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id)
    const tx = new Set<string>()
    for (const r of (await sb.from('accounting_transactions').select('id').eq('property_id', propId)).data || []) tx.add(r.id)
    const ents = [...invIds, ...ordIds, ...sales]
    if (ents.length) for (const r of (await sb.from('accounting_transactions').select('id').in('entity_id', ents)).data || []) tx.add(r.id)
    const ids = Array.from(tx)
    if (ids.length) {
      await sb.from('accounting_transactions').update({ linked_transaction_id: null }).in('id', ids)
      await sb.from('accounting_transactions').delete().in('id', ids)
    }
    for (const sid of sales) {
      await sb.from('sale_payments').delete().eq('sale_id', sid)
      await sb.from('commission_payments').delete().eq('sale_id', sid)
    }
    if (invIds.length) await sb.from('accounting_invoices').delete().in('id', invIds)
    if (ordIds.length) await sb.from('payment_orders').delete().in('id', ordIds)
    for (const sid of sales) {
      await sb.from('title_transfers').delete().eq('sale_id', sid)
      await sb.from('scheduled_emails').delete().eq('sale_id', sid)
      await sb.from('notifications').delete().eq('related_entity_id', sid)
      await sb.from('sales').delete().eq('id', sid)
    }
    await sb.from('notifications').delete().eq('property_id', propId)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test.describe('API: pagos de una venta', () => {
  test('GET pagos de la venta (vacío al principio)', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/sales/${saleId}/payments`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.payments)).toBe(true)
  })

  test('GET pagos de una venta inexistente → 404', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/sales/00000000-0000-0000-0000-000000000000/payments`)
    expect(res.status()).toBe(404)
  })

  test('POST registra un pago de staff, confirmado y con su orden de cobro', async ({ request }) => {
    const res = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
      data: { payment_type: 'partial', amount: 100, payment_method: 'zelle', payment_reference: 'E2E-TEST-REF', notes: 'E2E', reported_by: 'staff' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.payment.payment_type).toBe('partial')
    expect(Number(data.payment.amount)).toBe(100)
    expect(data.payment.status).toBe('confirmed')
    expect(data.payment.reported_by).toBe('staff')
    expect(data.payment.payment_order_id).toBeTruthy()
  })

  test('PATCH edita el importe y ajusta su orden pendiente', async ({ request }) => {
    const c = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
      data: { payment_type: 'adjustment', amount: 50, payment_method: 'cash', notes: 'E2E editar', reported_by: 'staff' },
    })
    const created = (await c.json()).payment
    const e = await request.patch(`${APP_URL}/api/sales/${saleId}/payments/${created.id}`, { data: { amount: 75, notes: 'E2E editado' } })
    expect(e.status(), await e.text()).toBe(200)
    expect((await e.json()).ok).toBe(true)
    const ord = (await sb.from('payment_orders').select('amount').eq('id', created.payment_order_id).single()).data!
    expect(Number(ord.amount)).toBe(75)
  })

  test('la venta refleja lo pagado y lo pendiente', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/sales/${saleId}`)
    expect(res.status()).toBe(200)
    const sale = await res.json()
    expect(Number(sale.amount_paid)).toBeCloseTo(175, 2)
    expect(Number(sale.amount_pending)).toBeCloseTo(PRICE - 175, 2)
  })

  test('cada pago tiene sus campos y los confirmados su confirmación', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/sales/${saleId}/payments`)
    const payments = (await res.json()).payments || []
    expect(payments.length).toBe(2)
    for (const p of payments) {
      expect(p.sale_id).toBe(saleId)
      expect(p.payment_type).toBeTruthy()
      expect(Number(p.amount)).toBeGreaterThan(0)
      expect(['pending', 'confirmed', 'cancelled']).toContain(p.status)
      expect(['client', 'staff', 'system']).toContain(p.reported_by)
      if (p.status === 'confirmed') {
        expect(p.confirmed_at).toBeTruthy()
        expect(p.confirmed_by).toBeTruthy()
      }
    }
  })

  test('registrar un pago crea la notificación de su orden', async () => {
    const ords = ((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id)
    expect(ords.length).toBe(2)
    const notifs = (await sb.from('notifications').select('id, amount, related_entity_id')
      .in('related_entity_id', ords)).data || []
    expect(notifs.length).toBeGreaterThan(0)
  })

  test('el listado de ventas trae lo pagado y lo pendiente', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/sales`)
    expect(res.status()).toBe(200)
    const sale = ((await res.json()) as any[]).find(s => s.id === saleId)
    expect(sale).toBeTruthy()
    expect('amount_paid' in sale && 'amount_pending' in sale).toBe(true)
  })
})

test.describe('UI: Ventas', () => {
  test('la tarjeta de la venta abre su sección de Pagos', async ({ page }) => {
    test.setTimeout(120000)
    await login(page)
    await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    const card = page.locator('div.card-luxury').filter({ hasText: ADDRESS })
    await expect(card).toBeVisible({ timeout: 45000 })
    await card.getByRole('button', { name: /^Pagos/ }).click()
    await expect(card.getByText(/Pagos —/)).toBeVisible({ timeout: 15000 })
    await expect(card.getByText('Registrar Pago')).toBeVisible()
  })

  test('el asistente de Nueva Venta muestra sus pasos', async ({ page }) => {
    test.setTimeout(90000)
    await login(page)
    await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    for (const paso of ['Propiedad', 'Cliente', 'Equipo', 'Confirmar']) {
      await expect(page.getByText(paso, { exact: true }).first()).toBeVisible({ timeout: 20000 })
    }
  })
})
