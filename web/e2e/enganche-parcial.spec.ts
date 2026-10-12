/**
 * E2E contra producción (casa + cliente desechables, teardown completo):
 * enganche parcial de una venta RTO (pedido de Sebastian, 2026-10-12).
 *
 *  1. Homes → Nueva Venta RTO con enganche de $10,000.00.
 *  2. Notificaciones → "Por Aprobar": se aprueba el enganche marcando que el
 *     cliente dio solo $6,000.00. Se registra lo recibido en el banco.
 *  3. Los $4,000.00 que faltan quedan SOLOS como deuda del cliente:
 *     - factura por cobrar al cliente (aparece en Contabilidad → Facturación →
 *       Por Cobrar), y
 *     - una orden nueva pendiente en "Por Aprobar".
 *  4. El cliente trae $1,500.00 → se aprueba como parcial: la factura queda en
 *     $2,500.00 y sale otra orden por ese resto.
 *  5. Trae los $2,500.00 → factura pagada, sin órdenes pendientes. El ingreso
 *     del enganche se reconoce una sola vez (lo recibido + la factura).
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (usuario admin de Homes, en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EENG${Date.now() % 100000}`
const ADDRESS = `E2E Enganche Parcial ${PCODE}`
const CLIENT = `E2E Cliente Enganche ${PCODE}`
const PRICE = 40000
const DOWN = 10000

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
      for (const k of ['maninos_tour_completed_homes', 'maninos_tour_page_homes__homes_sales',
        'maninos_tour_page_homes__homes', 'maninos_tour_page_homes__homes_notificaciones',
        'maninos_tour_page_homes__homes_accounting']) {
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

const pendingOrders = async () =>
  (await sb.from('payment_orders').select('id, amount, status, notes')
    .eq('property_id', propId).eq('concept', 'enganche').eq('status', 'pending')).data || []

const engpendInvoice = async () =>
  ((await sb.from('accounting_invoices').select('id, total_amount, amount_paid, balance_due, status, counterparty_name')
    .eq('property_id', propId).eq('direction', 'receivable').ilike('notes', '%[ENGPEND:%')).data || [])[0]

/** Abre "Por Aprobar", aprueba la orden y, si `recibido`, la marca como parcial. */
async function aprobarEnganche(page: Page, orderId: string, recibido?: number) {
  await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
  const edit = page.getByTestId(`edit-order-${orderId}`)
  await expect(edit).toBeVisible({ timeout: 45000 })
  await edit.locator('xpath=..').getByRole('button', { name: 'Aprobar' }).click()

  const modal = page.locator('div.fixed').filter({ hasText: 'Confirmar pago recibido' })
  await expect(modal).toBeVisible({ timeout: 15000 })
  if (recibido != null) {
    await modal.getByText('El cliente dio solo una parte del enganche').click()
    await modal.getByTestId('enganche-recibido').fill(String(recibido))
    await expect(modal.getByTestId('enganche-resto')).toBeVisible()
  }
  await modal.locator('select').first().selectOption({ index: 1 })
  const resp = page.waitForResponse(r => r.url().includes(`/api/payment-orders/${orderId}/approve`), { timeout: 30000 })
  await modal.getByRole('button', { name: 'Aprobar y registrar' }).click()
  const r = await resp
  const body = await r.json()
  expect(r.status(), JSON.stringify(body)).toBe(200)
  expect(body.aviso ?? null).toBeNull()
  return body
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
  if (!sb || !propId) return
  try {
    const sales = (await sb.from('sales').select('id').eq('property_id', propId)).data || []
    const saleIds = sales.map(s => s.id)
    const invs = (await sb.from('accounting_invoices').select('id').eq('property_id', propId)).data || []
    const invIds = invs.map(i => i.id)
    const ords = (await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []
    const ordIds = ords.map(o => o.id)

    const txIds = new Set<string>()
    for (const r of (await sb.from('accounting_transactions').select('id').eq('property_id', propId)).data || []) txIds.add(r.id)
    const entities = [...invIds, ...ordIds, ...saleIds]
    if (entities.length) {
      for (const r of (await sb.from('accounting_transactions').select('id').in('entity_id', entities)).data || []) txIds.add(r.id)
    }
    if (invIds.length) {
      const pays = (await sb.from('accounting_invoice_payments').select('id, transaction_id').in('invoice_id', invIds)).data || []
      for (const p of pays) if (p.transaction_id) txIds.add(p.transaction_id)
      await sb.from('accounting_invoice_payments').delete().in('invoice_id', invIds)
    }
    const ids = Array.from(txIds)
    if (ids.length) {
      await sb.from('accounting_transactions').update({ linked_transaction_id: null }).in('id', ids)
      await sb.from('accounting_transactions').delete().in('id', ids)
    }
    if (invIds.length) await sb.from('accounting_invoices').delete().in('id', invIds)
    if (ordIds.length) await sb.from('payment_orders').delete().in('id', ordIds)
    for (const sid of saleIds) {
      await sb.from('commission_payments').delete().eq('sale_id', sid)
      await sb.from('rto_applications').delete().eq('sale_id', sid)
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

test('Enganche parcial: se aprueba lo recibido y el resto queda por cobrar', async ({ page }) => {
  test.setTimeout(300000)
  await login(page)

  // ── 1. Venta RTO desde Homes ────────────────────────────────────────────
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
  await page.getByRole('button', { name: /Siguiente/i }).click()
  await page.getByRole('button', { name: /Financiada \(RTO\)/i }).click()
  const rtoBox = page.locator('div.bg-purple-50').filter({ hasText: 'Términos Financiados' })
  await expect(rtoBox).toBeVisible({ timeout: 10000 })
  await rtoBox.locator('input[type="number"]').first().fill(String(DOWN))
  await rtoBox.locator('input[type="number"]').nth(1).fill('900')
  await rtoBox.locator('select').selectOption('36').catch(() => {})
  const salePost = page.waitForResponse(r => r.url().includes('/api/sales') && r.request().method() === 'POST', { timeout: 30000 })
  await page.getByRole('button', { name: /Crear Venta/i }).click()
  expect((await salePost).status()).toBeLessThan(300)
  await page.waitForURL(url => url.pathname.endsWith('/homes/sales'), { timeout: 30000 })

  let orders: any[] = []
  for (let i = 0; i < 10 && !orders.length; i++) { orders = await pendingOrders(); if (!orders.length) await page.waitForTimeout(1500) }
  expect(orders.length, 'orden de enganche creada').toBe(1)
  expect(Number(orders[0].amount)).toBe(DOWN)

  // ── 2. Aprobar solo $6,000.00 ───────────────────────────────────────────
  const r1 = await aprobarEnganche(page, orders[0].id, 6000)
  expect(r1.resto.amount).toBe(4000)
  const aprobada = (await sb.from('payment_orders').select('amount, status').eq('id', orders[0].id).single()).data!
  expect(aprobada).toMatchObject({ status: 'approved' })
  expect(Number(aprobada.amount)).toBe(6000)

  // ── 3. El resto: factura por cobrar al cliente + orden pendiente ────────
  let inv = await engpendInvoice()
  expect(inv, 'factura del resto').toBeTruthy()
  expect(inv.counterparty_name).toBe(CLIENT)
  expect(Number(inv.balance_due)).toBe(4000)
  orders = await pendingOrders()
  expect(orders.length).toBe(1)
  expect(Number(orders[0].amount)).toBe(4000)

  // Sale en Contabilidad → Facturación → Por Cobrar
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('button', { name: /Facturación/ }).first().click()
  await page.getByRole('button', { name: /Por Cobrar/ }).first().click()
  const fila = page.locator('tr').filter({ hasText: CLIENT })
  await expect(fila).toBeVisible({ timeout: 45000 })
  await expect(fila).toContainText('$4,000.00')

  // ── 4. Trae $1,500.00 → parcial sobre el resto ──────────────────────────
  const r2 = await aprobarEnganche(page, orders[0].id, 1500)
  expect(r2.resto.amount).toBe(2500)
  expect(r2.resto.invoice_id).toBe(inv.id)                 // misma factura, no una nueva
  inv = await engpendInvoice()
  expect(Number(inv.balance_due)).toBe(2500)
  expect(inv.status).toBe('partial')
  orders = await pendingOrders()
  expect(orders.length).toBe(1)
  expect(Number(orders[0].amount)).toBe(2500)

  // ── 5. Trae los $2,500.00 → factura pagada, nada pendiente ──────────────
  await aprobarEnganche(page, orders[0].id)
  inv = await engpendInvoice()
  expect(Number(inv.balance_due)).toBe(0)
  expect(inv.status).toBe('paid')
  expect((await pendingOrders()).length).toBe(0)
  const facturas = (await sb.from('accounting_invoices').select('id').eq('property_id', propId).ilike('notes', '%[ENGPEND:%')).data || []
  expect(facturas.length, 'una sola factura del resto').toBe(1)

  // Ingreso del enganche reconocido UNA vez: 6.000 cobrados + 4.000 facturados
  // (la cuenta puede ser la general o su subcuenta por casa)
  const accts = ((await sb.from('accounting_accounts').select('id').ilike('code', 'House Sales - RTO%')).data || []).map(a => a.id)
  const legs = (await sb.from('accounting_transactions').select('amount, entity_type, entity_id')
    .eq('property_id', propId).in('account_id', accts)).data || []
  const ordenIds = new Set(((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id))
  const engancheIncome = legs
    .filter(l => (l.entity_type === 'payment_order' && ordenIds.has(l.entity_id)) || (l.entity_type === 'invoice' && l.entity_id === inv.id))
    .reduce((a, l) => a + Number(l.amount), 0)
  expect(engancheIncome).toBeCloseTo(DOWN, 2)
})
