/**
 * E2E contra producción (casa + venta RTO desechables, teardown completo):
 * "Evaluar compra" de Capital (criterio de Jorge: mínimo 30% anual sobre lo
 * que pone Capital = precio − enganche, y la compra no por encima del mercado).
 *  - Ficha: 30.000 − 3.000 de enganche, 1.000 × 36 → 11,1% anual (no llega),
 *    renta mínima 1.425,00. Sin superficie → sin valor de mercado; con valor
 *    manual 50.000 → compra dentro del mercado; 25.000 → por encima.
 *  - Listado: KPI de rentabilidad y la etiqueta "% anual" de la casa.
 *  - Calculadora: 10.000 sin enganche a 36 meses → renta mínima 527,78; con
 *    600/mes el precio máximo es 11.368,42.
 * Necesita la migración 115, SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y
 * E2E_CAPITAL_EMAIL + E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EPVM${Date.now() % 100000}`

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
let saleId = ''
let clientId = ''

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_capital', 'true')
      localStorage.setItem('maninos_tour_page_capital__capital', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: 'E2E Price vs Market St', city: 'Houston', state: 'Texas', property_code: PCODE,
    status: 'sold', source: 'manual_capital', sale_price: 30000,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: `E2E Cliente ${PCODE}`, state: 'TX' }).select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
  const s = await sb.from('sales').insert({
    property_id: propId, client_id: clientId, sale_type: 'rto', sale_price: 30000, status: 'rto_active', source: 'manual_capital',
    rto_down_payment: 3000, rto_monthly_payment: 1000, rto_term_months: 36,
  }).select('id').single()
  expect(s.error).toBeFalsy()
  saleId = s.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
    if (saleId) {
      await sb.from('capital_market_valuations').delete().eq('sale_id', saleId)
      await sb.from('sales').delete().eq('id', saleId)
    }
    if (propId) await sb.from('properties').delete().eq('id', propId)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Evaluar compra: rentabilidad 30% anual + mercado, KPI y calculadora', async ({ page }) => {
  test.setTimeout(240000)
  await login(page)
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })

  const card = page.getByTestId('price-vs-market')
  await expect(card).toBeVisible({ timeout: 45000 })
  // (36.000 / 27.000 − 1) / 3 = 11,1% anual
  await expect(page.getByTestId('eval-rentabilidad')).toContainText('11.1% anual: no llega al 30%')
  await expect(card).toContainText('$1,425.00')          // renta mínima
  await expect(card).toContainText('$27,000.00')         // pone Capital
  await expect(page.getByTestId('eval-mercado')).toContainText('Sin valor de mercado')
  await expect(card).toContainText('no tiene superficie')
  await expect(card).toContainText('Históricos de referencia')

  // Valor manual 50.000 → compra (30.000) dentro del mercado
  await card.getByRole('button', { name: /Escribir valor de mercado a mano/ }).click()
  await card.locator('label:text-is("Valor de mercado *")').locator('xpath=..').locator('input').fill('50000')
  await card.locator('label:text-is("Fuente *")').locator('xpath=..').locator('input').fill('E2E: 3 comparables')
  await card.getByRole('button', { name: /Guardar valor/ }).click()
  await expect(page.getByTestId('eval-mercado')).toContainText('Compra dentro del valor de mercado', { timeout: 20000 })
  await expect(card).toContainText(process.env.E2E_CAPITAL_EMAIL!)
  const row = (await sb.from('capital_market_valuations').select('market_value, source').eq('sale_id', saleId).single()).data
  expect(row).toMatchObject({ market_value: 50000, source: 'E2E: 3 comparables' })

  // 25.000 → compra por encima del mercado (120%)
  await card.getByTitle('Editar').click()
  await card.locator('label:text-is("Valor de mercado *")').locator('xpath=..').locator('input').fill('25000')
  await card.getByRole('button', { name: /Guardar valor/ }).click()
  await expect(page.getByTestId('eval-mercado')).toContainText('Compra por encima del valor de mercado', { timeout: 20000 })
  await expect(card).toContainText('120%')

  // Listado: KPI de rentabilidad y etiqueta de la casa
  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('kpi-price-vs-market')).toContainText('mínimo 30%', { timeout: 45000 })
  await expect(page.locator(`a[href="/capital/financed-houses/${saleId}"]`)).toContainText('11.1% anual', { timeout: 30000 })

  // Quitar el valor manual → vuelve a "Sin valor"
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('price-vs-market').getByTitle('Quitar valor manual').click()
  await expect(page.getByTestId('eval-mercado')).toContainText('Sin valor de mercado', { timeout: 20000 })

  // Calculadora de compra (desde el menú)
  await page.getByRole('link', { name: 'Evaluar compra' }).first().click()
  await expect(page.getByRole('heading', { name: /Evaluar compra/ })).toBeVisible({ timeout: 30000 })
  await page.getByRole('button', { name: 'Tercero (mercado)' }).click()
  await page.locator('label:text-is("Precio de compra *")').locator('xpath=..').locator('input').fill('10000')
  await page.locator('label:text-is("Mensualidad (opcional)")').locator('xpath=..').locator('input').fill('600')
  await page.getByRole('button', { name: /Calcular/ }).click()
  await expect(page.getByTestId('renta-minima')).toHaveText('$527.78', { timeout: 30000 })   // 10.000 × 1,9 / 36
  await expect(page.getByTestId('precio-maximo')).toHaveText('$11,368.42')                  // 600 × 36 / 1,9
  await expect(page.getByTestId('calc-rentabilidad')).toContainText('llega al 30%')
})
