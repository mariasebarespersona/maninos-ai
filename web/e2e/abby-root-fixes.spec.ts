/**
 * E2E contra producción (casa + cliente desechables, teardown completo):
 * causas de raíz de la lista de Abby (2026-10-13).
 *
 *  A. Venta RTO: un pago que entra después del enganche LIQUIDA la factura
 *     por cobrar de lo financiado; ya no se cuenta otra vez como venta de
 *     contado. Un cobro que supera lo pendiente se rechaza. Borrar la orden
 *     deja la factura otra vez por cobrar y queda en la auditoría.
 *     Con el enganche pendiente, registrar un pago suelto se rechaza.
 *  B. Cada pago de Ventas queda enlazado con su orden: editar el importe con
 *     la orden pendiente la ajusta; con la orden ya contabilizada se bloquea.
 *  C. Comisiones: la factura automática no se borra desde Facturación, no se
 *     puede registrar su pago como gasto nuevo, y se paga con "Pagar" en
 *     Notificaciones → Aprobadas en la cuenta y la fecha elegidas.
 *
 * Necesita la migración 117, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y
 * E2E_CAPITAL_EMAIL + E2E_CAPITAL_PASSWORD (admin de Homes, en ../.env).
 */
import { test, expect, Page, APIRequestContext } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EAB${Date.now() % 100000}`
const ADDRESS = `E2E Abby Raiz ${PCODE}`
const CLIENT = `E2E Cliente Abby ${PCODE}`
const COMISIONISTA = `E2E Comisionista ${PCODE}`
const PRICE = 40000
const DOWN = 10000
const FINANCED = PRICE - DOWN

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
      for (const k of ['maninos_tour_completed_homes', 'maninos_tour_page_homes__homes',
        'maninos_tour_page_homes__homes_notificaciones']) localStorage.setItem(k, 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

const capfin = async () =>
  ((await sb.from('accounting_invoices').select('id, balance_due, status')
    .eq('sale_id', saleId).ilike('notes', '%[CAPFIN:%')).data || [])[0]

async function approve(req: APIRequestContext, orderId: string) {
  return req.patch(`${APP_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e&bank_account_id=${bankId}`)
}

async function registerPayment(req: APIRequestContext, amount: number) {
  return req.post(`${APP_URL}/api/sales/${saleId}/payments`, {
    data: { payment_type: 'partial', amount, payment_method: 'zelle', reported_by: 'staff' },
  })
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async ({ request }) => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  bankId = ((await sb.from('bank_accounts').select('id').eq('is_active', true).limit(1)).data || [])[0]?.id
    || ((await sb.from('bank_accounts').select('id').limit(1)).data || [])[0]?.id
  expect(bankId, 'cuenta bancaria').toBeTruthy()
  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas', property_code: PCODE, status: 'published', sale_price: PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: CLIENT, status: 'active', monthly_income: 4000 }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id

  // Venta RTO como la crea el asistente de Homes, con una comisión ad-hoc
  const r = await request.post(`${APP_URL}/api/sales`, {
    data: {
      property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'rto',
      found_by_name: COMISIONISTA, commission_found_by: 1000, commission_sold_by: 0, commission_amount: 1000,
      rto_down_payment: DOWN, rto_monthly_payment: 900, rto_term_months: 36,
      initial_payment_amount: DOWN, initial_payment_type: 'down_payment',
    },
  })
  expect(r.status(), await r.text()).toBeLessThan(300)
  saleId = (await r.json()).id
  expect(saleId).toBeTruthy()
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
    if (invIds.length) {
      for (const p of (await sb.from('accounting_invoice_payments').select('transaction_id').in('invoice_id', invIds)).data || []) {
        if (p.transaction_id) tx.add(p.transaction_id)
      }
      await sb.from('accounting_invoice_payments').delete().in('invoice_id', invIds)
    }
    const ids = Array.from(tx)
    if (ids.length) {
      await sb.from('commission_payments').update({ accounting_transaction_id: null }).in('accounting_transaction_id', ids)
      await sb.from('statement_movements').update({ transaction_id: null }).in('transaction_id', ids)
      await sb.from('statement_movements').update({ matched_transaction_id: null }).in('matched_transaction_id', ids)
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
      await sb.from('rto_applications').delete().eq('sale_id', sid)
      await sb.from('title_transfers').delete().eq('sale_id', sid)
      await sb.from('scheduled_emails').delete().eq('sale_id', sid)
      await sb.from('notifications').delete().eq('related_entity_id', sid)
      await sb.from('sales').delete().eq('id', sid)
    }
    await sb.from('notifications').delete().eq('property_id', propId)
    await sb.from('bank_statements').delete().eq('original_filename', `E2E-${PCODE}.csv`)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('A + B: el dinero de una venta RTO liquida su factura, y los pagos quedan enlazados con su orden', async ({ request }) => {
  test.setTimeout(240000)

  // Enganche aún pendiente → registrar un pago suelto se rechaza con la guía
  const r0 = await registerPayment(request, 5000)
  expect(r0.status()).toBe(409)
  expect(JSON.stringify(await r0.json())).toContain('el cliente dio solo una parte')

  // El pago inicial de la venta quedó enlazado con la orden del enganche
  const eng = ((await sb.from('payment_orders').select('id, amount').eq('property_id', propId)
    .eq('concept', 'enganche').eq('status', 'pending')).data || [])[0]
  expect(eng, 'orden de enganche').toBeTruthy()
  const inicial = ((await sb.from('sale_payments').select('payment_order_id').eq('sale_id', saleId)).data || [])[0]
  expect(inicial.payment_order_id).toBe(eng.id)

  // Aprobar el enganche completo
  expect((await approve(request, eng.id)).status()).toBe(200)
  expect(Number((await capfin()).balance_due)).toBe(FINANCED)

  // B: pago nuevo → orden enlazada; editar con la orden pendiente la ajusta
  const r1 = await registerPayment(request, 5000)
  expect(r1.status(), await r1.text()).toBe(200)
  const pay = (await r1.json()).payment
  expect(pay.payment_order_id).toBeTruthy()
  const e1 = await request.patch(`${APP_URL}/api/sales/${saleId}/payments/${pay.id}`, { data: { amount: 6000 } })
  expect(e1.status(), await e1.text()).toBe(200)
  const ord = (await sb.from('payment_orders').select('amount, notes, status').eq('id', pay.payment_order_id).single()).data!
  expect(Number(ord.amount)).toBe(6000)
  expect(ord.notes).toContain(`[SALE:${saleId}]`)

  // A: al aprobarlo liquida la factura de lo financiado; no hay ingreso de contado
  expect((await approve(request, pay.payment_order_id)).status()).toBe(200)
  let inv = await capfin()
  expect(Number(inv.balance_due)).toBe(FINANCED - 6000)
  const contado = ((await sb.from('accounting_accounts').select('id').eq('code', 'House Sales')).data || []).map(a => a.id)
  const legsContado = (await sb.from('accounting_transactions').select('id').eq('property_id', propId).in('account_id', contado)).data || []
  expect(legsContado.length, 'nada como venta de contado').toBe(0)
  const rtoAccts = ((await sb.from('accounting_accounts').select('id').ilike('code', 'House Sales - RTO%')).data || []).map(a => a.id)
  const ingreso = ((await sb.from('accounting_transactions').select('amount').eq('property_id', propId)
    .in('account_id', rtoAccts).neq('status', 'voided')).data || []).reduce((a, l) => a + Number(l.amount), 0)
  expect(ingreso, 'ingreso = precio, una sola vez').toBeCloseTo(PRICE, 2)

  // B: con la orden ya contabilizada, editar el importe se bloquea
  const e2 = await request.patch(`${APP_URL}/api/sales/${saleId}/payments/${pay.id}`, { data: { amount: 7000 } })
  expect(e2.status()).toBe(400)
  expect(JSON.stringify(await e2.json())).toContain('ya está registrado en contabilidad')

  // A: un cobro mayor que lo pendiente se rechaza (contaría dos veces)
  const r2 = await registerPayment(request, FINANCED - 6000 + 1)
  expect(r2.status()).toBe(200)
  const big = (await r2.json()).payment.payment_order_id
  const a2 = await approve(request, big)
  expect(a2.status()).toBe(400)
  expect(JSON.stringify(await a2.json())).toContain('su precio ya está reconocido')
  expect((await request.delete(`${APP_URL}/api/payment-orders/${big}`)).status()).toBe(200)

  // Borrar la orden aprobada: la factura vuelve a quedar por cobrar y queda en la auditoría
  expect((await request.delete(`${APP_URL}/api/payment-orders/${pay.payment_order_id}?deleted_by=e2e`)).status()).toBe(200)
  inv = await capfin()
  expect(Number(inv.balance_due)).toBe(FINANCED)
  const audit = (await sb.from('accounting_audit_log').select('id, description').eq('table_name', 'payment_orders')
    .eq('record_id', pay.payment_order_id).eq('action', 'delete')).data || []
  expect(audit.length).toBe(1)
  await sb.from('accounting_audit_log').delete().in('record_id', [pay.payment_order_id, big])
})

test('C: comisiones — sin borrar su factura, sin gasto duplicado, y pagar con cuenta y fecha', async ({ page, request }) => {
  test.setTimeout(180000)
  const cp = ((await sb.from('commission_payments').select('id, amount, status').eq('sale_id', saleId)).data || [])[0]
  expect(cp, 'comisión creada con la venta').toBeTruthy()
  const bill = ((await sb.from('accounting_invoices').select('id, balance_due')
    .eq('direction', 'payable').ilike('notes', `%[COMM:${cp.id}]%`)).data || [])[0]
  expect(bill, 'factura de la comisión').toBeTruthy()

  // La factura automática no se borra desde Facturación
  const d = await request.delete(`${APP_URL}/api/accounting/invoices/${bill.id}`)
  expect(d.status()).toBe(400)
  expect(JSON.stringify(await d.json())).toContain('comisión de venta')

  // Registrar su pago como gasto nuevo se bloquea (saldría duplicada)
  const acct = ((await sb.from('accounting_transactions').select('account_id, is_income')
    .eq('entity_type', 'invoice').eq('entity_id', bill.id)).data || []).find(l => !l.is_income) as any
    || ((await sb.from('accounting_transactions').select('account_id').eq('entity_type', 'invoice').eq('entity_id', bill.id)).data || [])[0]
  const t = await request.post(`${APP_URL}/api/accounting/transactions`, {
    data: {
      transaction_date: new Date().toISOString().slice(0, 10), transaction_type: 'commission',
      amount: 1000, is_income: false, account_id: acct.account_id, bank_account_id: bankId,
      property_id: propId, description: `E2E gasto comisión ${PCODE}`,
    },
  })
  expect(t.status(), await t.text()).toBe(409)
  expect(JSON.stringify(await t.json())).toContain('saldrá duplicada')

  // Por estado de cuenta (lo que hizo Abby): un retiro de $400 a la cuenta de
  // la comisión LIQUIDA parte de su factura; no crea un gasto nuevo.
  const st = await sb.from('bank_statements').insert({
    account_key: 'cuenta_houston', account_label: 'E2E', bank_account_id: bankId,
    original_filename: `E2E-${PCODE}.csv`, file_type: 'csv', status: 'review',
  }).select('id').single()
  expect(st.error, JSON.stringify(st.error)).toBeFalsy()
  const hoy = new Date().toISOString().slice(0, 10)
  const mv = await sb.from('statement_movements').insert({
    statement_id: st.data!.id, movement_date: hoy, description: `E2E COMISION ${PCODE}`,
    amount: -400, is_credit: false, status: 'confirmed', final_account_id: acct.account_id,
    final_transaction_type: 'commission',
  }).select('id').single()
  expect(mv.error, JSON.stringify(mv.error)).toBeFalsy()
  const post = await request.post(`${APP_URL}/api/accounting/bank-statements/${st.data!.id}/post`)
  expect(post.status(), await post.text()).toBe(200)
  const billP = (await sb.from('accounting_invoices').select('balance_due, status').eq('id', bill.id).single()).data!
  expect(Number(billP.balance_due)).toBe(600)
  expect(billP.status).toBe('partial')
  const mv2 = (await sb.from('statement_movements').select('status, transaction_id').eq('id', mv.data!.id).single()).data!
  expect(mv2.status).toBe('posted')
  // Ningún gasto nuevo: lo único en la cuenta de la comisión es el devengo de la factura
  const gastos = (await sb.from('accounting_transactions').select('id, entity_type')
    .eq('account_id', acct.account_id).neq('status', 'voided')).data || []
  expect(gastos.every(g => g.entity_type === 'invoice'), JSON.stringify(gastos)).toBe(true)

  // Pagar desde Notificaciones → Aprobadas, con fecha de ayer
  const ayer = new Date(Date.now() - 86400000)
  const fecha = `${ayer.getFullYear()}-${String(ayer.getMonth() + 1).padStart(2, '0')}-${String(ayer.getDate()).padStart(2, '0')}`
  await login(page)
  await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
  const row = page.getByTestId(`commission-row-${cp.id}`)
  const tab = page.getByRole('button', { name: 'Aprobadas', exact: true })
  for (let i = 0; i < 5 && !(await row.isVisible().catch(() => false)); i++) {
    await tab.click()
    await page.waitForTimeout(3000)
  }
  await expect(row).toBeVisible({ timeout: 45000 })
  await expect(row).toContainText(COMISIONISTA)
  await expect(row).toContainText(PCODE)
  await row.getByRole('button', { name: 'Pagar' }).click()
  const modal = page.getByTestId('commission-pay-modal')
  await modal.locator('select').selectOption(bankId)
  await modal.locator('input[type="date"]').fill(fecha)
  const resp = page.waitForResponse(r => r.url().includes(`/commission-payments/${cp.id}/pay`), { timeout: 30000 })
  await modal.getByRole('button', { name: 'Registrar pago' }).click()
  const rr = await resp
  expect(rr.status(), await rr.text()).toBe(200)
  await expect(row).toBeHidden({ timeout: 20000 })

  const cp2 = (await sb.from('commission_payments').select('status').eq('id', cp.id).single()).data!
  expect(cp2.status).toBe('paid')
  const bill2 = (await sb.from('accounting_invoices').select('balance_due, status').eq('id', bill.id).single()).data!
  expect(Number(bill2.balance_due)).toBe(0)
  expect(bill2.status).toBe('paid')
  const pays = (await sb.from('accounting_invoice_payments').select('payment_date, transaction_id, amount').eq('invoice_id', bill.id)).data || []
  const p = pays.find(x => x.payment_date === fecha)!
  expect(p, JSON.stringify(pays)).toBeTruthy()
  expect(Number(p.amount)).toBe(600)
  const leg = (await sb.from('accounting_transactions').select('transaction_date, bank_account_id').eq('id', p.transaction_id).single()).data!
  expect(leg.transaction_date).toBe(fecha)
})
