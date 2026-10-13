/**
 * E2E contra producción (casa + cliente + venta desechables, teardown completo):
 * punto 6 de la lista de Abby — la fecha REAL de los cobros.
 *
 *  1. En Ventas se registra un pago con fecha pasada (18 de agosto): su orden
 *     de cobro guarda esa fecha.
 *  2. En Notificaciones → Por Aprobar, la ventana de aprobación trae esa fecha
 *     ya puesta; se aprueba con una cuenta.
 *  3. El asiento (ingreso + banco) queda con esa fecha, no con la de hoy.
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EFC${Date.now() % 100000}`
const PRICE = 30000
const FECHA = '2026-08-18'

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

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: `E2E Fecha Cobro ${PCODE}`, city: 'Houston', state: 'Texas', property_code: PCODE, sale_price: PRICE, status: 'published',
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Cliente ${PCODE}`, status: 'active' }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb || !propId) return
  try {
    const sales = ((await sb.from('sales').select('id').eq('property_id', propId)).data || []).map(s => s.id)
    const ordIds = ((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id)
    const tx = new Set<string>()
    for (const r of (await sb.from('accounting_transactions').select('id').eq('property_id', propId)).data || []) tx.add(r.id)
    const ents = [...ordIds, ...sales]
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
    await sb.from('accounting_invoices').delete().eq('property_id', propId)
    if (ordIds.length) await sb.from('payment_orders').delete().in('id', ordIds)
    for (const sid of sales) {
      await sb.from('title_transfers').delete().eq('sale_id', sid)
      await sb.from('notifications').delete().eq('related_entity_id', sid)
      await sb.from('sales').delete().eq('id', sid)
    }
    await sb.from('notifications').delete().eq('property_id', propId)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('El cobro se contabiliza en la fecha real en que entró el dinero', async ({ page, request }) => {
  test.setTimeout(180000)
  const s = await request.post(`${APP_URL}/api/sales`, {
    data: { property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'contado', commission_amount: 0 },
  })
  expect(s.status(), await s.text()).toBeLessThan(300)
  const saleId = (await s.json()).id

  // 1. Pago registrado en Ventas con fecha pasada → su orden guarda la fecha
  const r = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
    data: { payment_type: 'partial', amount: 2500, payment_method: 'bank_transfer', payment_date: FECHA, reported_by: 'staff' },
  })
  expect(r.status(), await r.text()).toBe(200)
  const orderId = (await r.json()).payment.payment_order_id
  const ord = (await sb.from('payment_orders').select('payment_date').eq('id', orderId).single()).data!
  expect(ord.payment_date).toBe(FECHA)

  // 2. La ventana de aprobación trae esa fecha
  await page.addInitScript(() => {
    try {
      for (const k of ['maninos_tour_completed_homes', 'maninos_tour_page_homes__homes_notificaciones']) localStorage.setItem(k, 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
  await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const edit = page.getByTestId(`edit-order-${orderId}`)
  await expect(edit).toBeVisible({ timeout: 45000 })
  await edit.locator('xpath=..').getByRole('button', { name: 'Aprobar' }).click()
  const modal = page.locator('div.fixed').filter({ hasText: 'Confirmar pago recibido' })
  await expect(modal.getByTestId('fecha-cobro')).toHaveValue(FECHA, { timeout: 15000 })

  const bank = ((await sb.from('bank_accounts').select('id').not('accounting_account_id', 'is', null).eq('is_active', true).limit(1)).data || [])[0]
  await modal.locator('select').first().selectOption(bank.id)
  const resp = page.waitForResponse(x => x.url().includes(`/api/payment-orders/${orderId}/approve`), { timeout: 30000 })
  await modal.getByRole('button', { name: 'Aprobar y registrar' }).click()
  expect((await resp).status()).toBe(200)

  // 3. El asiento queda en esa fecha
  const legs = (await sb.from('accounting_transactions').select('transaction_date, amount')
    .eq('entity_type', 'payment_order').eq('entity_id', orderId)).data || []
  expect(legs.length).toBe(2)
  for (const l of legs) {
    expect(l.transaction_date).toBe(FECHA)
    expect(Number(l.amount)).toBe(2500)
  }

  // Una fecha futura se rechaza
  const r2 = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
    data: { payment_type: 'partial', amount: 100, payment_method: 'cash', reported_by: 'staff' },
  })
  const o2 = (await r2.json()).payment.payment_order_id
  const fut = await request.patch(`${APP_URL}/api/payment-orders/${o2}/approve?approved_by=e2e&bank_account_id=${bank.id}&payment_date=2099-01-01`)
  expect(fut.status()).toBe(400)
})
