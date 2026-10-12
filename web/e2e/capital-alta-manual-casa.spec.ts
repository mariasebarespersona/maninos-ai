/**
 * E2E contra producción (datos desechables, teardown completo):
 * "＋ Alta manual de casa" desde Casas Financiadas.
 *  1. El asistente arranca por la casa, crea la cadena entera y la casa aparece
 *     en Casas Financiadas, enlazada con su ficha de Clientes RTO y su contrato
 *     (y de vuelta).
 *  2. Una casa con operación RTO viva no se puede dar de alta otra vez (409),
 *     para no duplicarla en Casas Financiadas ni abrir un segundo contrato.
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (usuario de la allow-list de Capital, en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EAMC${Date.now() % 100000}`
const CLIENT = `E2E Cliente Alta Casa ${PCODE}`
const TERM = 24

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

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_capital', 'true')
      for (const p of ['', '_financed-houses', '_applications', '_applications_alta-manual', '_contracts']) {
        localStorage.setItem(`maninos_tour_page_capital__capital${p}`, 'true')
      }
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

const field = (page: Page, label: string) =>
  page.locator(`label.label:text-is("${label}")`).locator('xpath=..').locator('input').first()

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
    const props = (await sb.from('properties').select('id').eq('property_code', PCODE)).data || []
    for (const { id: pid } of props) {
      const sales = (await sb.from('sales').select('id, client_id').eq('property_id', pid)).data || []
      for (const s of sales) {
        const contracts = (await sb.from('rto_contracts').select('id').eq('sale_id', s.id)).data || []
        const cids = contracts.map(c => c.id)
        if (cids.length) {
          await sb.from('capital_transactions').delete().in('rto_contract_id', cids)
          await sb.from('capital_invoices').delete().in('rto_contract_id', cids)
          await sb.from('capital_down_payment_installments').delete().in('contract_id', cids)
          await sb.from('rto_payments').delete().in('rto_contract_id', cids)
        }
        await sb.from('title_transfers').delete().eq('sale_id', s.id)
        await sb.from('sales').update({ rto_contract_id: null }).eq('id', s.id)
        if (cids.length) await sb.from('rto_contracts').delete().in('id', cids)
        await sb.from('rto_applications').delete().eq('sale_id', s.id)
        await sb.from('notifications').delete().eq('related_entity_id', s.id)
        await sb.from('sales').delete().eq('id', s.id)
        if (s.client_id) await sb.from('clients').delete().eq('id', s.client_id).eq('name', CLIENT)
      }
      await sb.from('properties').delete().eq('id', pid)
    }
    await sb.from('clients').delete().eq('name', CLIENT)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Alta manual de casa desde Casas Financiadas: cadena completa y enlazada', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('link', { name: /Alta manual de casa/ }).click()
  await expect(page.getByRole('heading', { name: 'Alta Manual — Casa Financiada' })).toBeVisible({ timeout: 30000 })

  // Paso 1 = Casa
  await field(page, 'Código de casa').fill(PCODE)
  await field(page, 'Dirección *').fill('E2E Alta Manual Casa St')
  await field(page, 'Ciudad').fill('Houston')
  await page.getByRole('button', { name: /Siguiente/ }).click()

  // Paso 2 = Cliente
  await field(page, 'Nombre completo *').fill(CLIENT)
  await page.getByRole('button', { name: /Siguiente/ }).click()

  // Paso 3 = Modelo de pago (todo a futuro: sin históricos ni facturas)
  const start = new Date(); start.setMonth(start.getMonth() + 1)
  await field(page, 'Precio de venta RTO *').fill('30000')
  await field(page, 'Enganche').fill('3000')
  await field(page, 'Mensualidad *').fill('1125')
  await field(page, 'Plazo (meses) *').fill(String(TERM))
  await field(page, 'Fecha de inicio del contrato *').fill(start.toISOString().slice(0, 10))
  await page.getByRole('button', { name: /Siguiente/ }).click()
  await page.getByRole('button', { name: /Siguiente/ }).click()
  await page.getByRole('button', { name: /Crear Alta Manual/ }).click()

  await expect(page.getByRole('heading', { name: 'Alta completada' })).toBeVisible({ timeout: 45000 })

  // La cadena en la base: casa solo-Capital, venta, solicitud, contrato, cronograma
  const prop = (await sb.from('properties').select('id, source').eq('property_code', PCODE).single()).data!
  expect(prop.source).toBe('manual_capital')
  const sale = (await sb.from('sales').select('id, source, status, sale_type, rto_contract_id').eq('property_id', prop.id).single()).data!
  saleId = sale.id
  expect(sale).toMatchObject({ source: 'manual_capital', status: 'rto_active', sale_type: 'rto' })
  const app = (await sb.from('rto_applications').select('id, status').eq('sale_id', sale.id).single()).data!
  expect(app.status).toBe('approved')
  const pays = (await sb.from('rto_payments').select('id').eq('rto_contract_id', sale.rto_contract_id)).data || []
  expect(pays.length).toBe(TERM)

  // Casa Financiada → ficha del cliente RTO (enlace directo, no a la lista)
  await page.getByRole('link', { name: 'Ver Casa Financiada' }).click()
  await expect(page).toHaveURL(new RegExp(`/capital/financed-houses/${sale.id}`), { timeout: 30000 })
  await expect(page.getByText(PCODE).first()).toBeVisible({ timeout: 30000 })
  const toApp = page.getByRole('link', { name: 'Ver en Clientes RTO' })
  await expect(toApp).toHaveAttribute('href', `/capital/applications/${app.id}`, { timeout: 30000 })
  await expect(page.getByRole('link', { name: 'Ver contrato' })).toHaveAttribute('href', `/capital/contracts/${sale.rto_contract_id}`)

  // Cliente RTO → de vuelta a la casa
  await toApp.click()
  await expect(page.getByRole('link', { name: 'Ver casa financiada' })).toHaveAttribute('href', `/capital/financed-houses/${sale.id}`, { timeout: 30000 })

  // Contrato → de vuelta a la casa
  await page.goto(`${APP_URL}/capital/contracts/${sale.rto_contract_id}`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByRole('link', { name: 'Ver casa financiada' })).toHaveAttribute('href', `/capital/financed-houses/${sale.id}`, { timeout: 30000 })

  // Y en el listado de Casas Financiadas
  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded' })
  await expect(page.locator(`a[href="/capital/financed-houses/${sale.id}"]`)).toBeVisible({ timeout: 30000 })
})

test('Una casa con operación RTO viva no se da de alta dos veces', async ({ page }) => {
  test.setTimeout(90000)
  expect(saleId, 'el test anterior no creó la casa').toBeTruthy()
  await login(page)
  const prop = (await sb.from('properties').select('id').eq('property_code', PCODE).single()).data!
  const res = await page.request.post(`${APP_URL}/api/capital/manual-intake`, {
    data: {
      property_id: prop.id,
      client: { name: CLIENT },
      terms: { purchase_price: 30000, down_payment: 0, monthly_rent: 1000, term_months: 12, start_date: new Date().toISOString().slice(0, 10) },
    },
  })
  expect(res.status()).toBe(409)
  expect(JSON.stringify(await res.json())).toContain('Casas Financiadas')
  const sales = (await sb.from('sales').select('id').eq('property_id', prop.id)).data || []
  expect(sales.length).toBe(1)
  // El rollback borró el cliente que se creó antes de comprobar la casa
  const clients = (await sb.from('clients').select('id').eq('name', CLIENT)).data || []
  expect(clients.length).toBe(1)
})
