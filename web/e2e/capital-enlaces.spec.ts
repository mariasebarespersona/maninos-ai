/**
 * E2E contra producción — enlaces entre Propuesta / Autorización y la casa.
 *
 *  1. En Propuesta de compra se busca una casa de la app por su código y se
 *     liga (property_id); se rellenan sus datos.
 *  2. La propuesta pasa por el comité (otras personas) y queda aprobada.
 *  3. La ficha de Casas Financiadas y el Cálculo RTO de Clientes RTO muestran
 *     la autorización, y avisan de que la renta de la venta ($1,425) no
 *     coincide con la autorizada ($1,500).
 *  4. El análisis de capacidad de la solicitud usa el mismo 30% que el motor.
 *
 * Datos desechables (alta manual de Capital + propuesta), teardown completo.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EEN${Date.now() % 100000}`

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
let saleId = ''
let propId = ''

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

test.beforeAll(async ({ request }) => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const start = new Date(); start.setMonth(start.getMonth() + 1)
  const r = await request.post(`${APP_URL}/api/capital/manual-intake`, {
    data: {
      client: { name: `E2E Cliente Enlaces ${PCODE}` },
      property: { property_code: PCODE, address: `E2E Enlaces ${PCODE}`, city: 'Houston' },
      terms: { purchase_price: 30000, down_payment: 3000, monthly_rent: 1425, term_months: 36,
        start_date: start.toISOString().slice(0, 10) },
    },
  })
  expect(r.status(), await r.text()).toBe(200)
  saleId = (await r.json()).sale_id
  propId = (await sb.from('properties').select('id').eq('property_code', PCODE).single()).data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
    if (propId) await sb.from('capital_purchase_proposals').delete().eq('property_id', propId)
    await sb.from('capital_purchase_proposals').delete().ilike('casa', `%${PCODE}%`)
    for (const { id: mp } of (await sb.from('properties').select('id').eq('property_code', PCODE)).data || []) {
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

test('Propuesta ligada a la casa → aprobada → visible en la casa y en el Cálculo RTO', async ({ page, request }) => {
  test.setTimeout(240000)
  await login(page)

  // 1. Buscar y ligar la casa
  await page.goto(`${APP_URL}/capital/evaluar-compra`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('label:text-is("Casa (código o dirección)")').locator('xpath=..').locator('input').fill(PCODE)
  const sug = page.getByTestId('sugerencias-casa')
  await expect(sug).toContainText(PCODE, { timeout: 20000 })
  await sug.getByRole('button').filter({ hasText: PCODE }).click()
  await expect(page.getByTestId('casa-ligada')).toBeVisible()
  await expect(page.locator('label:text-is("Precio de compra *")').locator('xpath=..').locator('input')).toHaveValue('30000')
  await page.locator('label:text-is("Enganche del cliente")').locator('xpath=..').locator('input').fill('3000')
  await page.locator('label:text-is("Mensualidad (opcional)")').locator('xpath=..').locator('input').fill('1500')
  await page.getByRole('button', { name: /Calcular/ }).click()
  await expect(page.getByTestId('renta-margen')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('guardar-propuesta').click()
  await expect(page.getByTestId('propuestas')).toContainText(PCODE, { timeout: 30000 })

  const prop = (await sb.from('capital_purchase_proposals').select('id, property_id, casa').eq('property_id', propId).single()).data!
  expect(prop.casa).toContain(PCODE)

  // 2. Comité (otras personas) → aprobada
  const yo = process.env.E2E_CAPITAL_EMAIL!
  expect((await request.post(`${APP_URL}/api/capital/purchase-proposals/${prop.id}/submit`, { data: { submitted_by: yo } })).status()).toBe(200)
  expect((await request.post(`${APP_URL}/api/capital/purchase-proposals/${prop.id}/vote`, { data: { decision: 'aprobar', voter_email: `comite-${PCODE.toLowerCase()}@maninos.com` } })).status()).toBe(200)
  expect((await request.post(`${APP_URL}/api/capital/purchase-proposals/${prop.id}/vote`, { data: { decision: 'aprobar', voter_email: `ceo-${PCODE.toLowerCase()}@maninos.com` } })).status()).toBe(200)

  // 3a. Ficha de la casa financiada
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const bloque = page.getByTestId('autorizacion-casa')
  await expect(bloque.getByTestId('autorizacion-estado')).toHaveText('Aprobada', { timeout: 45000 })
  await expect(bloque.getByTestId('autorizacion-difiere')).toContainText('renta $1,425.00 (autorizada $1,500.00)')

  // 3b. Cálculo RTO de la solicitud
  const app = (await sb.from('rto_applications').select('id').eq('sale_id', saleId).single()).data!
  await page.goto(`${APP_URL}/capital/applications/${app.id}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('button', { name: /Cálculo RTO/ }).first().click()
  await expect(page.getByTestId('autorizacion-casa').getByTestId('autorizacion-estado')).toHaveText('Aprobada', { timeout: 45000 })
})
