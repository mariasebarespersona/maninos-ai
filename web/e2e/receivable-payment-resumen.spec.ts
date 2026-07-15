/**
 * Item 5 — sale receivable cobro reflected in the accounting resumen (Playwright).
 *
 * Reads the ACTUAL on-screen resumen in both zones and checks the full cobro
 * cycle (Maninos Capital pays Homes for the financed RTO part):
 *   - Abby (Desglose):     "Ventas Capital (RTO)" recognizes the income at sale
 *                          and keeps it after the cobro (no double count).
 *   - Gabriel (tarjetas):  "Por cobrar" rises at sale and drops on the cobro;
 *                          "Efectivo en bancos" rises by the cobro.
 * Triggers the sale + cobro through the app's own API; throwaway data; cleans up.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2ERC${Date.now() % 100000}`
const PRICE = 40000
const DOWN = 12000
const FINANCED = PRICE - DOWN // 28,000

function loadRootEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

let sb: SupabaseClient
let clientId: string
let bankId: string
let propId: string

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_accounting', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

async function apiPost(page: Page, url: string, body: any) {
  return page.evaluate(async ({ url, body }) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let data: any = null
    try { data = await r.json() } catch (e) { /* ignore */ }
    return { status: r.status, data }
  }, { url, body })
}

const toNum = (t: string | null) => parseFloat((t || '0').replace(/[^0-9.-]/g, '')) || 0

/** Read all three resumen figures in one page load. */
async function readResumen(page: Page): Promise<{ efectivo: number; porCobrar: number; ventasRto: number }> {
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})

  const efLbl = page.getByText('💵 Efectivo en bancos', { exact: true }).first()
  await expect(efLbl).toBeVisible({ timeout: 25000 })
  const efectivo = toNum(await efLbl.locator('xpath=../following-sibling::p[1]').textContent())
  const porCobrar = toNum(await page.getByText('📥 Por cobrar', { exact: true }).first()
    .locator('xpath=../following-sibling::p[1]').textContent())
  const ventasRto = toNum(await page.getByText('Ventas Capital (RTO)', { exact: true }).first()
    .locator('xpath=following-sibling::span[1]').textContent())
  return { efectivo, porCobrar, ventasRto }
}

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL).toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const bank = ((await sb.from('bank_accounts').select('id, accounting_account_id')).data || [])
    .find((b: any) => b.accounting_account_id)
  expect(bank, 'a bank with a chart account').toBeTruthy()
  bankId = bank!.id
  const p = await sb.from('properties').insert({
    address: 'E2E RC St', city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'published', sale_price: PRICE,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const c = await sb.from('clients').insert({ name: 'E2E RC Cliente', status: 'active', monthly_income: 4000 })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  if (process.env.KEEP_E2E_DATA) return
  try {
    for (const s of (await sb.from('sales').select('id').eq('property_id', propId)).data || []) {
      await sb.from('commission_payments').delete().eq('sale_id', s.id)
      await sb.from('rto_applications').delete().eq('sale_id', s.id)
      await sb.from('sale_payments').delete().eq('sale_id', s.id)
      for (const inv of (await sb.from('accounting_invoices').select('id').eq('sale_id', s.id)).data || []) {
        await sb.from('accounting_invoice_payments').delete().eq('invoice_id', inv.id)
        await sb.from('accounting_transactions').delete().eq('entity_id', inv.id)
        await sb.from('accounting_invoices').delete().eq('id', inv.id)
      }
      await sb.from('accounting_transactions').delete().eq('property_id', propId)
      await sb.from('payment_orders').delete().eq('property_id', propId)
      await sb.from('sales').delete().eq('id', s.id)
    }
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('item 5 · el cobro por cobrar se refleja en el resumen (Gabriel + Abby)', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })

  const base = await readResumen(page)

  // 1) RTO sale → income recognized (Abby) + A/R to Capital (Gabriel Por cobrar)
  const sale = await apiPost(page, '/api/sales', {
    property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'rto',
    rto_down_payment: DOWN, rto_term_months: 36, rto_monthly_payment: 800,
  })
  console.log(`DIAG POST /api/sales -> ${sale.status}`)
  expect(sale.status).toBeLessThan(300)

  const afterSale = await readResumen(page)
  console.log(`DIAG tras venta: ventasRto ${base.ventasRto}->${afterSale.ventasRto}  porCobrar ${base.porCobrar}->${afterSale.porCobrar}`)
  expect(afterSale.ventasRto - base.ventasRto, 'Abby: Ventas Capital (RTO) sube').toBeCloseTo(FINANCED, 0)
  expect(afterSale.porCobrar - base.porCobrar, 'Gabriel: Por cobrar sube').toBeCloseTo(FINANCED, 0)

  // 2) Capital pays Homes → settle the [CAPFIN:] receivable (a cobro)
  const ar = ((await sb.from('accounting_invoices').select('id, notes').eq('sale_id', sale.data.id)
    .eq('direction', 'receivable')).data || []).find((i: any) => (i.notes || '').includes('[CAPFIN:'))
  expect(ar, 'Capital A/R invoice exists').toBeTruthy()
  const pay = await apiPost(page, `/api/accounting/invoices/${ar!.id}/payments`, {
    invoice_id: ar!.id, amount: FINANCED, bank_account_id: bankId, payment_method: 'bank_transfer',
    notes: 'E2E Capital paga a Homes',
  })
  console.log(`DIAG POST cobro -> ${pay.status}`)
  expect(pay.status).toBeLessThan(300)

  // 3) resumen after the cobro
  const afterPay = await readResumen(page)
  console.log(`DIAG tras cobro: efectivo ${afterSale.efectivo}->${afterPay.efectivo}  porCobrar ${afterSale.porCobrar}->${afterPay.porCobrar}  ventasRto ${afterPay.ventasRto}`)
  // Gabriel: efectivo up by the cobro; Por cobrar back down by the cobro
  expect(afterPay.efectivo - afterSale.efectivo, 'Gabriel: Efectivo sube por el cobro').toBeCloseTo(FINANCED, 0)
  expect(afterSale.porCobrar - afterPay.porCobrar, 'Gabriel: Por cobrar baja por el cobro').toBeCloseTo(FINANCED, 0)
  // Abby: income stays recognized (not lost, not doubled)
  expect(afterPay.ventasRto - afterSale.ventasRto, 'Abby: ingreso RTO intacto').toBeCloseTo(0, 0)
})
