/**
 * E2E contra producción — pago de una venta de contado → orden en
 * Notificaciones → contabilidad. Casa, cliente y venta desechables.
 *
 * Reescrita 2026-10-13: antes llamaba a Railway directamente (401 desde el
 * candado del API), daba por hecho que no existía la venta RTO (sí existe) y
 * que aprobar un cobro lo dejaba "completed" (hoy queda "approved" con su
 * asiento en el banco elegido).
 *
 *  1. Registrar un pago en Ventas crea su orden pendiente, ENLAZADA al pago
 *     (migración 117), con el progreso en las notas.
 *  2. Aprobarla con una cuenta registra el ingreso de contado en ese banco.
 *  3. El asistente de Nueva Venta ofrece Contado y Financiada (RTO).
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EMS${Date.now() % 100000}`
const SALE_PRICE = 50000
const DOWN_PAYMENT = 5000

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
let propId2 = ''

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: `E2E SaleFlow ${PCODE}`, city: 'Houston', state: 'Texas', property_code: PCODE,
    purchase_price: 25000, sale_price: SALE_PRICE, status: 'published', bedrooms: 3, bathrooms: 2,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Buyer ${PCODE}`, status: 'active' }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
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
    if (invIds.length) await sb.from('accounting_invoice_payments').delete().in('invoice_id', invIds)
    const ids = Array.from(tx)
    if (ids.length) {
      await sb.from('statement_movements').update({ transaction_id: null }).in('transaction_id', ids)
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
    if (propId2) await sb.from('properties').delete().eq('id', propId2)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Pago de una venta de contado → orden en Por Aprobar → ingreso en el banco', async ({ request }) => {
  test.setTimeout(120000)
  let saleId = ''
  let orderId = ''

  await test.step('Crear la venta de contado', async () => {
    const r = await request.post(`${APP_URL}/api/sales`, {
      data: { property_id: propId, client_id: clientId, sale_price: SALE_PRICE, sale_type: 'contado', commission_amount: 0 },
    })
    expect(r.status(), await r.text()).toBeLessThan(300)
    const sale = await r.json()
    expect(sale.sale_type).toBe('contado')
    saleId = sale.id
  })

  await test.step('Registrar el enganche → orden pendiente enlazada', async () => {
    const res = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
      data: { payment_type: 'down_payment', amount: DOWN_PAYMENT, payment_method: 'cash', notes: 'Enganche efectivo', reported_by: 'staff' },
    })
    expect(res.status(), await res.text()).toBe(200)
    const pay = (await res.json()).payment
    expect(pay.payment_order_id).toBeTruthy()
    orderId = pay.payment_order_id

    const ord = (await sb.from('payment_orders').select('*').eq('id', orderId).single()).data!
    expect(ord.status).toBe('pending')
    expect(ord.concept).toBe('pago_venta')
    expect(ord.direction).toBe('inbound')
    expect(Number(ord.amount)).toBe(DOWN_PAYMENT)
    expect(ord.notes).toMatch(/Enganche/)
    expect(ord.notes).toMatch(/Progreso/)

    const list = await request.get(`${APP_URL}/api/payment-orders?status=pending`)
    expect(((await list.json()).data || []).some((o: any) => o.id === orderId)).toBe(true)
  })

  await test.step('Aprobar con cuenta → ingreso de contado en ese banco', async () => {
    const bank = ((await sb.from('bank_accounts').select('id').not('accounting_account_id', 'is', null).limit(1)).data || [])[0]
    const app = await request.patch(`${APP_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e&bank_account_id=${bank.id}`)
    expect(app.status(), await app.text()).toBe(200)
    expect((await app.json()).message).toMatch(/recibido|aprobad/i)
    const ord = (await sb.from('payment_orders').select('status, accounting_transaction_id').eq('id', orderId).single()).data!
    expect(ord.status).toBe('approved')
    expect(ord.accounting_transaction_id).toBeTruthy()
    const legs = (await sb.from('accounting_transactions').select('amount, bank_account_id, is_income')
      .eq('entity_type', 'payment_order').eq('entity_id', orderId)).data || []
    expect(legs.length).toBe(2)
    expect(legs.find(l => l.bank_account_id === bank.id)?.is_income).toBe(true)
    for (const l of legs) expect(Number(l.amount)).toBe(DOWN_PAYMENT)
  })
})

test('UI: el asistente de Nueva Venta ofrece Contado y Financiada (RTO)', async ({ page }) => {
  test.setTimeout(120000)
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_sales', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login/i }).click()
  for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }

  // Casa propia para recorrer el asistente (la del test anterior ya está vendida)
  const p2 = await sb.from('properties').insert({
    address: `E2E Wizard ${PCODE}`, city: 'Houston', state: 'Texas', property_code: `${PCODE}W`,
    sale_price: 30000, status: 'published',
  }).select('id').single()
  expect(p2.error).toBeFalsy()
  propId2 = p2.data!.id

  await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  for (const paso of ['Propiedad', 'Cliente', 'Equipo', 'Confirmar']) {
    await expect(page.getByText(paso, { exact: true }).first()).toBeVisible({ timeout: 20000 })
  }
  // Recorrer hasta Confirmar con la casa y el cliente desechables
  await page.getByPlaceholder(/Buscar por dirección/i).fill(`E2E Wizard ${PCODE}`)
  const propBtn = page.getByRole('button').filter({ hasText: `E2E Wizard ${PCODE}` })
  await expect(propBtn).toBeVisible({ timeout: 20000 })
  await propBtn.click()
  await page.getByRole('button', { name: /Siguiente/i }).click()
  await page.getByRole('button', { name: 'Cliente Existente' }).click().catch(() => {})
  await page.getByPlaceholder(/Buscar cliente/i).fill(`E2E Buyer ${PCODE}`)
  await page.getByRole('button').filter({ hasText: `E2E Buyer ${PCODE}` }).click()
  await page.getByRole('button', { name: /Siguiente/i }).click()
  await page.getByRole('button', { name: /Siguiente/i }).click()
  await expect(page.getByRole('button', { name: /Contado/i }).first()).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: /Financiada \(RTO\)/i })).toBeVisible()
})
