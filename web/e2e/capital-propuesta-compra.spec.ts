/**
 * E2E contra producción — "Calcular renta y margen" (proceso de Capital).
 *
 *  1. Propuesta de compra: con precio $30,000 y enganche $3,000, la tabla da
 *     la renta sugerida por plazo (24/36/48) para el 30% y la mínima que cubre
 *     el fondeo; el margen se compara con el costo real del fondeo (pagarés)
 *     en semáforo; comprueba el fondeo disponible. "Usar" una fila recalcula.
 *     La propuesta se guarda (números recalculados en el servidor) y se aprueba.
 *  2. Clientes RTO → Cálculo RTO usa el MISMO motor: margen anual por plazo con
 *     su semáforo y el fondeo disponible (antes: 24% fijo en el código).
 *
 * Datos desechables con teardown completo. Necesita la migración 120,
 * SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL + E2E_CAPITAL_PASSWORD.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EPC${Date.now() % 100000}`

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
      for (const k of ['maninos_tour_completed_capital', 'maninos_tour_page_capital__capital',
        'maninos_tour_page_capital__capital_applications']) localStorage.setItem(k, 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
})

test.afterAll(async () => {
  if (!sb) return
  try {
    await sb.from('capital_purchase_proposals').delete().ilike('casa', `%${PCODE}%`)
    if (propId) {
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
        await sb.from('rto_applications').delete().eq('sale_id', sid)
        await sb.from('title_transfers').delete().eq('sale_id', sid)
        await sb.from('notifications').delete().eq('related_entity_id', sid)
        await sb.from('sales').delete().eq('id', sid)
      }
      await sb.from('notifications').delete().eq('property_id', propId)
      await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`).not('parent_account_id', 'is', null)
      await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
      await sb.from('properties').delete().eq('id', propId)
    }
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    // Cadena del alta manual del test de margen real
    const mprops = (await sb.from('properties').select('id').eq('property_code', `${PCODE}M`)).data || []
    for (const { id: mp } of mprops) {
      for (const ms of (await sb.from('sales').select('id, client_id').eq('property_id', mp)).data || []) {
        const cids = ((await sb.from('rto_contracts').select('id').eq('sale_id', ms.id)).data || []).map(c => c.id)
        if (cids.length) {
          await sb.from('capital_transactions').delete().in('rto_contract_id', cids)
          await sb.from('capital_invoices').delete().in('rto_contract_id', cids)
          await sb.from('capital_down_payment_installments').delete().in('contract_id', cids)
          await sb.from('rto_payments').delete().in('rto_contract_id', cids)
        }
        await sb.from('title_transfers').delete().eq('sale_id', ms.id)
        await sb.from('sales').update({ rto_contract_id: null }).eq('id', ms.id)
        if (cids.length) await sb.from('rto_contracts').delete().in('id', cids)
        await sb.from('rto_applications').delete().eq('sale_id', ms.id)
        await sb.from('notifications').delete().eq('related_entity_id', ms.id)
        await sb.from('sales').delete().eq('id', ms.id)
        if (ms.client_id) await sb.from('clients').delete().eq('id', ms.client_id)
      }
      await sb.from('properties').delete().eq('id', mp)
    }
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Propuesta de compra: renta por plazo, margen vs fondeo, fondeo disponible; guardar y aprobar', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/capital/evaluar-compra`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByRole('heading', { name: /Propuesta de compra/ })).toBeVisible({ timeout: 30000 })

  await page.getByRole('button', { name: 'Tercero (mercado)' }).click()
  await page.locator('label:text-is("Casa (código o dirección)")').locator('xpath=..').locator('input').fill(`${PCODE} Casa de prueba`)
  await page.locator('label:text-is("Precio de compra *")').locator('xpath=..').locator('input').fill('30000')
  await page.locator('label:text-is("Enganche del cliente")').locator('xpath=..').locator('input').fill('3000')
  await page.locator('label:text-is("Mensualidad (opcional)")').locator('xpath=..').locator('input').fill('1100')
  await page.getByRole('button', { name: /Calcular/ }).click()

  const rm = page.getByTestId('renta-margen')
  await expect(rm).toBeVisible({ timeout: 30000 })
  // 1.100 × 36 = 39.600 sobre 27.000 → 15,6% anual: no cubre el fondeo (~20,7%)
  await expect(page.getByTestId('margen-anual')).toHaveText('15.6%')
  await expect(page.getByTestId('semaforo')).toHaveText('NO cubre el costo del fondeo')
  await expect(page.getByTestId('plazo-24')).toContainText('$1,800.00')
  await expect(page.getByTestId('plazo-36')).toContainText('$1,425.00')
  await expect(page.getByTestId('plazo-48')).toContainText('$1,237.50')
  await expect(page.getByTestId('fondeo-check')).toContainText('esta casa necesita $27,000.00')

  // "Usar" la fila de 36 meses → recalcula con $1,425: llega al 30%
  await page.getByTestId('plazo-36').getByRole('button', { name: 'Usar' }).click()
  await expect(page.getByTestId('margen-anual')).toHaveText('30%', { timeout: 30000 })
  await expect(page.getByTestId('semaforo')).toHaveText('llega al objetivo')

  // Guardar la propuesta (el servidor recalcula y guarda la foto)
  await page.getByTestId('guardar-propuesta').click()
  const lista = page.getByTestId('propuestas')
  await expect(lista).toContainText(PCODE, { timeout: 30000 })
  const row = (await sb.from('capital_purchase_proposals').select('*').ilike('casa', `%${PCODE}%`).single()).data!
  expect(row).toMatchObject({ origen: 'mercado', plazo_meses: 36, status: 'borrador', semaforo: 'verde' })
  expect(Number(row.mensualidad)).toBe(1425)
  expect(Number(row.margen_anual)).toBe(0.3)
  expect(Number(row.costo_fondeo)).toBeGreaterThan(0.1)
  expect(row.created_by).toBe(process.env.E2E_CAPITAL_EMAIL)

  // Aprobar
  await page.getByTestId(`propuesta-${row.id}`).getByTitle('Aprobar').click()
  await expect(page.getByTestId(`propuesta-${row.id}`)).toContainText('aprobada', { timeout: 20000 })
  const row2 = (await sb.from('capital_purchase_proposals').select('status, decided_by').eq('id', row.id).single()).data!
  expect(row2).toMatchObject({ status: 'aprobada', decided_by: process.env.E2E_CAPITAL_EMAIL })
})

test('Cálculo RTO de Clientes RTO usa el mismo motor (margen vs fondeo)', async ({ page, request }) => {
  test.setTimeout(180000)
  const p = await sb.from('properties').insert({
    address: `E2E Calculo RTO ${PCODE}`, city: 'Houston', state: 'Texas', property_code: PCODE, sale_price: 30000, status: 'published',
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Cliente ${PCODE}`, status: 'active', monthly_income: 6000 }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
  const s = await request.post(`${APP_URL}/api/sales`, {
    data: { property_id: propId, client_id: clientId, sale_price: 30000, sale_type: 'rto', commission_amount: 0,
      rto_down_payment: 3000, rto_monthly_payment: 1000, rto_term_months: 36 },
  })
  expect(s.status(), await s.text()).toBeLessThan(300)
  const saleId = (await s.json()).id
  const app = (await sb.from('rto_applications').select('id').eq('sale_id', saleId).single()).data!

  const calc = await request.get(`${APP_URL}/api/capital/applications/${app.id}/rto-calculation`)
  expect(calc.status()).toBe(200)
  const cj = (await calc.json()).calculation
  expect(cj.scenarios.map((x: any) => x.term_months)).toEqual([24, 36, 48])
  for (const sc of cj.scenarios) {
    expect(sc.margen_anual).toBeGreaterThanOrEqual(0.3)        // objetivo 30% (antes 24%)
    expect(sc.semaforo).toBe('verde')
  }
  expect(cj.renta_margen.fondeo.estado).toBe('ok')

  await login(page)
  await page.goto(`${APP_URL}/capital/applications/${app.id}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('button', { name: /Cálculo RTO/ }).first().click()
  await expect(page.getByTestId('rto-margen-36')).toBeVisible({ timeout: 45000 })
  await expect(page.getByTestId('rto-fondeo')).toContainText('Fondeo disponible')
})

test('Margen proyectado vs real: la cobranza a la fecha escala el margen', async ({ page, request }) => {
  test.setTimeout(180000)
  // Contrato de 24 meses que empezó hace 6; solo los 3 primeros pagos cobrados
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 6, 1)
  const pagadoHasta = new Date(hoy.getFullYear(), hoy.getMonth() - 4, 28)
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  const r = await request.post(`${APP_URL}/api/capital/manual-intake`, {
    data: {
      client: { name: `E2E Cliente Margen ${PCODE}` },
      property: { property_code: `${PCODE}M`, address: `E2E Margen Real ${PCODE}`, city: 'Houston' },
      terms: { purchase_price: 30000, down_payment: 3000, monthly_rent: 1425, term_months: 24,
        start_date: iso(inicio), payment_due_day: 15 },
      paid_through: iso(pagadoHasta), down_payment_paid: true,
    },
  })
  expect(r.status(), await r.text()).toBe(200)
  const saleId = (await r.json()).sale_id

  const ev = await (await request.get(`${APP_URL}/api/capital/financed-houses/${saleId}/price-evaluation`)).json()
  const mr = ev.margen_real
  expect(mr.vencidos).toBeGreaterThanOrEqual(5)
  expect(mr.cobrado).toBeLessThan(mr.esperado)
  // real = proyectado × cobrado/esperado
  expect(mr.real).toBeCloseTo(mr.proyectado * (mr.cobrado / mr.esperado), 3)
  expect(mr.real).toBeLessThan(mr.proyectado)

  await login(page)
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByTestId('eval-margen-real')).toContainText('Margen real a la fecha', { timeout: 45000 })
  await expect(page.getByTestId('eval-margen-real')).toContainText('mensualidades atrasadas')

  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByTestId('kpi-margen-real')).toContainText('real a la fecha', { timeout: 45000 })
})
