/**
 * E2E contra producción (casa + venta RTO desechables, teardown completo):
 * "Evaluar precio vs. mercado" en Casas Financiadas.
 *  - Una casa sin superficie no tiene valor automático → "Sin valor".
 *  - El responsable escribe el valor a mano con su fuente → el checklist
 *    dice Cumple (≤ 70%) o No cumple, con el porcentaje.
 *  - El listado enseña la KPI de cartera.
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
  const s = await sb.from('sales').insert({
    property_id: propId, sale_type: 'rto', sale_price: 30000, status: 'rto_active', source: 'manual_capital',
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
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Precio vs. mercado: valor manual → Cumple / No cumple, y KPI en el listado', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })

  const card = page.getByTestId('price-vs-market')
  const estado = page.getByTestId('price-vs-market-estado')
  await expect(card).toBeVisible({ timeout: 45000 })
  await expect(estado).toContainText('Sin valor de mercado')
  await expect(card).toContainText('no tiene superficie')

  // 30.000 / 50.000 = 60% → cumple
  await card.getByRole('button', { name: /Escribir valor de mercado a mano/ }).click()
  await card.locator('label:text-is("Valor de mercado *")').locator('xpath=..').locator('input').fill('50000')
  await card.locator('label:text-is("Fuente *")').locator('xpath=..').locator('input').fill('E2E: 3 comparables')
  await card.getByRole('button', { name: /Guardar valor/ }).click()
  await expect(estado).toContainText('Cumple', { timeout: 20000 })
  await expect(card).toContainText('60%')
  await expect(card).toContainText('$50,000.00')
  await expect(card).toContainText(process.env.E2E_CAPITAL_EMAIL!)

  const row = (await sb.from('capital_market_valuations').select('market_value, source').eq('sale_id', saleId).single()).data
  expect(row).toMatchObject({ market_value: 50000, source: 'E2E: 3 comparables' })

  // 30.000 / 40.000 = 75% → no cumple
  await card.getByTitle('Editar').click()
  await card.locator('label:text-is("Valor de mercado *")').locator('xpath=..').locator('input').fill('40000')
  await card.getByRole('button', { name: /Guardar valor/ }).click()
  await expect(estado).toContainText('No cumple', { timeout: 20000 })
  await expect(card).toContainText('75%')

  // Listado: KPI de cartera y la etiqueta de la casa
  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('kpi-price-vs-market')).toContainText('meta ≤ 70%', { timeout: 45000 })
  await expect(page.locator(`a[href="/capital/financed-houses/${saleId}"]`)).toContainText('75% mdo.', { timeout: 30000 })

  // Quitar el valor manual → vuelve a "Sin valor"
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('price-vs-market').getByTitle('Quitar valor manual').click()
  await expect(page.getByTestId('price-vs-market-estado')).toContainText('Sin valor de mercado', { timeout: 20000 })
})
