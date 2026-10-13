/**
 * E2E contra producción (casa + cliente + venta desechables, teardown completo):
 * puntos 2, 5, 7 y 8 de la lista de Abby (2026-10-13).
 *
 *  2. Fecha de la venta: se crea una venta de contado con fecha pasada
 *     (10/08); al cobrarla entera, el costo de la casa pasa a COGS EN ESA
 *     FECHA (antes las ventas de contado nunca lo reconocían). Cambiar la
 *     fecha desde la tarjeta re-fecha el COGS, no los cobros.
 *  5. Estados Financieros piden el informe del periodo elegido (agosto).
 *  7. El código de la casa aparece junto al comprador en Ventas y en
 *     Contabilidad → Por Propiedad.
 *  8. La clase elegida en un movimiento de estado de cuenta llega a las dos
 *     piernas del asiento al publicarlo.
 *
 * Necesita las migraciones 118 y 119, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * y E2E_CAPITAL_EMAIL + E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EPT${Date.now() % 100000}`
const ADDRESS = `E2E Puntos Abby ${PCODE}`
const PRICE = 30000
const COMPRA = 18000
const FECHA_VENTA = '2026-08-10'

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
let bankId = ''

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['maninos_tour_completed_homes', 'maninos_tour_page_homes__homes_sales',
        'maninos_tour_page_homes__homes_accounting', 'maninos_tour_page_homes__homes']) localStorage.setItem(k, 'true')
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
  bankId = ((await sb.from('bank_accounts').select('id').not('accounting_account_id', 'is', null).eq('is_active', true).limit(1)).data || [])[0]?.id
  expect(bankId).toBeTruthy()
  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas', property_code: PCODE,
    purchase_price: COMPRA, sale_price: PRICE, status: 'published',
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Cliente ${PCODE}`, status: 'active' }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
  // Cuentas de la casa (Compra/Renovación/Movida/Comisión <CODE>), como al darla de alta
  const acc = await request.post(`${APP_URL}/api/accounting/accounts/house`, { data: { code: PCODE } })
  expect(acc.status(), await acc.text()).toBeLessThan(300)

  // Compra de la casa pagada → su costo queda capitalizado en inventario (Compra <CODE>)
  const o = await request.post(`${APP_URL}/api/payment-orders`, {
    data: { property_id: propId, property_address: ADDRESS, payee_name: 'E2E Vendedor', amount: COMPRA,
      method: 'transferencia', concept: 'compra', notes: 'E2E compra' },
  })
  const orderId = (await o.json()).data?.id
  expect(orderId).toBeTruthy()
  expect((await request.patch(`${APP_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e`)).status()).toBe(200)
  const done = await request.patch(`${APP_URL}/api/payment-orders/${orderId}/complete`, {
    data: { reference: `E2E-${PCODE}`, payment_date: '2026-07-20', bank_account_id: bankId },
  })
  expect(done.status(), await done.text()).toBe(200)
})

test.afterAll(async () => {
  if (!sb || !propId) return
  try {
    const sales = ((await sb.from('sales').select('id').eq('property_id', propId)).data || []).map(s => s.id)
    const invIds = ((await sb.from('accounting_invoices').select('id').eq('property_id', propId)).data || []).map(i => i.id)
    const ordIds = ((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id)
    const tx = new Set<string>()
    for (const r of (await sb.from('accounting_transactions').select('id').eq('property_id', propId)).data || []) tx.add(r.id)
    for (const r of (await sb.from('accounting_transactions').select('id').ilike('description', `%${PCODE}%`)).data || []) tx.add(r.id)
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
      await sb.from('notifications').delete().eq('related_entity_id', sid)
      await sb.from('sales').delete().eq('id', sid)
    }
    await sb.from('bank_statements').delete().eq('original_filename', `E2E-${PCODE}.csv`)
    await sb.from('notifications').delete().eq('property_id', propId)
    await sb.from('accounting_audit_log').delete().in('record_id', [...ordIds, ...sales])
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('2: venta de contado con fecha pasada → COGS en esa fecha; cambiar la fecha re-fecha el COGS', async ({ request }) => {
  test.setTimeout(180000)
  const s = await request.post(`${APP_URL}/api/sales`, {
    data: { property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'contado', commission_amount: 0, sale_date: FECHA_VENTA },
  })
  expect(s.status(), await s.text()).toBeLessThan(300)
  const sale = await s.json()
  saleId = sale.id
  expect(sale.sale_date).toBe(FECHA_VENTA)
  expect(sale.property_code).toBe(PCODE)                       // punto 7 en la API

  // Fecha futura: rechazada
  const fut = await request.post(`${APP_URL}/api/sales`, {
    data: { property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'contado', sale_date: '2099-01-01' },
  })
  expect(fut.status()).toBe(400)

  // Cobro del precio completo en la fecha de la venta → COGS
  const r = await request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
    data: { payment_type: 'full', amount: PRICE, payment_method: 'bank_transfer', payment_date: FECHA_VENTA, reported_by: 'staff' },
  })
  expect(r.status(), await r.text()).toBe(200)
  const orderId = (await r.json()).payment.payment_order_id
  expect((await request.patch(`${APP_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e&bank_account_id=${bankId}`)).status()).toBe(200)

  let cogs = (await sb.from('accounting_transactions').select('amount, transaction_date')
    .eq('entity_type', 'sale').eq('entity_id', saleId).eq('transaction_type', 'cogs')).data || []
  expect(cogs.length, 'el costo de la casa pasó a COGS').toBeGreaterThan(0)
  for (const c of cogs) expect(c.transaction_date).toBe(FECHA_VENTA)
  const pares = cogs.reduce((a, c) => a + Number(c.amount), 0) / 2
  expect(pares).toBeCloseTo(COMPRA, 2)

  // Cambiar la fecha de la venta → re-fecha el COGS; el cobro sigue en su fecha
  const ch = await request.patch(`${APP_URL}/api/sales/${saleId}/sale-date`, { data: { sale_date: '2026-08-12', changed_by: 'e2e' } })
  expect(ch.status(), await ch.text()).toBe(200)
  const cogs2 = (await sb.from('accounting_transactions').select('transaction_date')
    .eq('entity_type', 'sale').eq('entity_id', saleId).eq('transaction_type', 'cogs')).data || []
  expect(cogs2.length).toBe(cogs.length)
  for (const c of cogs2) expect(c.transaction_date).toBe('2026-08-12')
  const cobro = (await sb.from('accounting_transactions').select('transaction_date')
    .eq('entity_type', 'payment_order').eq('entity_id', orderId)).data || []
  for (const c of cobro) expect(c.transaction_date).toBe(FECHA_VENTA)
  expect((await sb.from('sales').select('sale_date').eq('id', saleId).single()).data!.sale_date).toBe('2026-08-12')
})

test('7 + 2: código de la casa y fecha en Ventas; código en Por Propiedad', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByTestId(`sale-code-${saleId}`)).toHaveText(PCODE, { timeout: 45000 })
  await expect(page.getByTestId(`sale-date-${saleId}`)).toContainText('12/8/2026')

  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('button', { name: /Por Propiedad/ }).first().click()
  await expect(page.getByTestId('pnl-code').filter({ hasText: PCODE })).toBeVisible({ timeout: 45000 })
})

test('5: Estados Financieros piden el periodo elegido', async ({ page }) => {
  test.setTimeout(120000)
  await login(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  // Periodo: Mes = agosto (el selector de mes es el segundo select del encabezado)
  const monthSel = page.locator('select').filter({ has: page.locator('option', { hasText: 'Agosto' }) }).first()
  await monthSel.selectOption('8')
  const req = page.waitForRequest(r => r.url().includes('/api/accounting/reports/income-statement'), { timeout: 30000 })
  await page.getByRole('button', { name: /Estados Financieros/ }).first().click()
  const url = new URL((await req).url())
  expect(url.searchParams.get('start_date')).toMatch(/^\d{4}-08-01$/)
  expect(url.searchParams.get('end_date')).toMatch(/^\d{4}-08-31$/)
})

test('8: la clase de un movimiento de estado de cuenta llega a las dos piernas', async ({ request }) => {
  test.setTimeout(90000)
  const yard = ((await sb.from('yards').select('id, name').limit(1)).data || [])[0]
  expect(yard).toBeTruthy()
  const gasto = ((await sb.from('accounting_accounts').select('id').eq('account_type', 'expense').eq('is_header', false).limit(1)).data || [])[0]
  const st = await sb.from('bank_statements').insert({
    account_key: 'cuenta_houston', account_label: 'E2E', bank_account_id: bankId,
    original_filename: `E2E-${PCODE}.csv`, file_type: 'csv', status: 'review',
  }).select('id').single()
  expect(st.error, JSON.stringify(st.error)).toBeFalsy()
  const mv = await sb.from('statement_movements').insert({
    statement_id: st.data!.id, movement_date: '2026-08-15', description: `E2E GASTO ${PCODE}`,
    amount: -45, is_credit: false, status: 'pending', final_account_id: gasto.id, final_transaction_type: 'operating_expense',
  }).select('id').single()
  expect(mv.error).toBeFalsy()

  // Elegir la clase (como el select de la columna "Clase") y confirmar
  const up = await request.patch(`${APP_URL}/api/accounting/bank-statements/movements/${mv.data!.id}`, { data: { yard_id: yard.id, status: 'confirmed' } })
  expect(up.status(), await up.text()).toBe(200)
  expect((await up.json()).yard_id).toBe(yard.id)

  const post = await request.post(`${APP_URL}/api/accounting/bank-statements/${st.data!.id}/post`)
  expect(post.status(), await post.text()).toBe(200)
  const m2 = (await sb.from('statement_movements').select('status, transaction_id').eq('id', mv.data!.id).single()).data!
  expect(m2.status).toBe('posted')
  const leg = (await sb.from('accounting_transactions').select('id, yard_id, linked_transaction_id').eq('id', m2.transaction_id).single()).data!
  const partner = (await sb.from('accounting_transactions').select('yard_id').eq('id', leg.linked_transaction_id).single()).data!
  expect(leg.yard_id).toBe(yard.id)
  expect(partner.yard_id).toBe(yard.id)

  // Quitar la clase de otro movimiento con null también funciona
  const mv3 = await sb.from('statement_movements').insert({
    statement_id: st.data!.id, movement_date: '2026-08-15', description: `E2E OTRO ${PCODE}`, amount: -1, is_credit: false,
    yard_id: yard.id,
  }).select('id').single()
  const clr = await request.patch(`${APP_URL}/api/accounting/bank-statements/movements/${mv3.data!.id}`, { data: { yard_id: null } })
  expect(clr.status()).toBe(200)
  expect((await clr.json()).yard_id).toBeNull()

  // Limpiar las piernas creadas aquí (no llevan property_id)
  const ids = [leg.id, leg.linked_transaction_id]
  await sb.from('statement_movements').update({ transaction_id: null }).in('transaction_id', ids)
  await sb.from('accounting_transactions').update({ linked_transaction_id: null }).in('id', ids)
  await sb.from('accounting_transactions').delete().in('id', ids)
})
