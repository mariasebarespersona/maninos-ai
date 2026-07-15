/**
 * Consignment flow — Playwright E2E (Abby items 6 & 11).
 *
 * 11. Buying/intaking a house ON CONSIGNMENT must auto-generate an accounts-
 *     PAYABLE invoice (the debt to the previous owner), visible in Facturación →
 *     Por Pagar from day 1.
 *  6. A consignment house can be SOLD and its income seen in the resumen BEFORE
 *     the previous owner is paid — the payable stays outstanding.
 *
 * The consignment intake + sale are triggered through the app's own API (same
 * origin / session, exactly like the app does it) so the real backend posting
 * runs; then we assert the UI (Facturación, resumen) and the ledger reflect it.
 * Throwaway property+client (unique code); self-cleans.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2ECN${Date.now() % 100000}`
const PURCHASE = 20000
const PRICE = 35000
const DOWN = 12000
const FINANCED = PRICE - DOWN // 23,000 → Ventas Capital (RTO)

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

/** POST through the app's own origin/session (same as the app's fetches). */
async function apiPost(page: Page, url: string, body: any) {
  return page.evaluate(async ({ url, body }) => {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    let data: any = null
    try { data = await r.json() } catch (e) { /* ignore */ }
    return { status: r.status, data }
  }, { url, body })
}

/** Read a "Desglose" row amount (label → sibling amount span) from the resumen. */
async function readResumen(page: Page, label: string): Promise<number> {
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
  const labelSpan = page.getByText(label, { exact: true }).first()
  await expect(labelSpan).toBeVisible({ timeout: 25000 })
  const amount = labelSpan.locator('xpath=following-sibling::span[1]')
  const txt = (await amount.textContent({ timeout: 10000 })) || '0'
  return parseFloat(txt.replace(/[^0-9.]/g, '')) || 0
}

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL).toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const c = await sb.from('clients').insert({ name: 'E2E CN Cliente', status: 'active', monthly_income: 4000 })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  if (process.env.KEEP_E2E_DATA) { console.warn('KEEP_E2E_DATA — skip teardown'); return }
  try {
    for (const p of (await sb.from('properties').select('id').eq('property_code', PCODE)).data || []) {
      for (const s of (await sb.from('sales').select('id').eq('property_id', p.id)).data || []) {
        await sb.from('commission_payments').delete().eq('sale_id', s.id)
        await sb.from('rto_applications').delete().eq('sale_id', s.id)
        await sb.from('sale_payments').delete().eq('sale_id', s.id)
        for (const inv of (await sb.from('accounting_invoices').select('id').eq('sale_id', s.id)).data || []) {
          await sb.from('accounting_transactions').delete().eq('entity_id', inv.id)
          await sb.from('accounting_invoices').delete().eq('id', inv.id)
        }
        await sb.from('sales').delete().eq('id', s.id)
      }
      for (const inv of (await sb.from('accounting_invoices').select('id').eq('property_id', p.id)).data || []) {
        await sb.from('accounting_transactions').delete().eq('entity_id', inv.id)
        await sb.from('accounting_invoices').delete().eq('id', inv.id)
      }
      await sb.from('accounting_transactions').delete().eq('property_id', p.id)
      await sb.from('payment_orders').delete().eq('property_id', p.id)
      await sb.from('properties').delete().eq('id', p.id)
    }
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('consignación: intake genera Por Pagar + venta reflejada antes de pagar al dueño', async ({ page }) => {
  test.setTimeout(180000)
  await login(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })

  // ---- ITEM 11: intake a consignment house (app's own API) → payable ----
  const created = await apiPost(page, '/api/properties', {
    address: 'E2E CN St', city: 'Houston', state: 'Texas', property_code: PCODE,
    purchase_price: PURCHASE, sale_price: PRICE, is_consignment: true, status: 'published',
  })
  console.log(`DIAG POST /api/properties -> ${created.status}`)
  expect(created.status).toBeLessThan(300)
  propId = created.data.id

  // ledger: the consignment payable was auto-created (debit Inventory / credit A/P)
  let payable: any = null
  for (let i = 0; i < 10; i++) {
    const invs = (await sb.from('accounting_invoices').select('*').eq('property_id', propId).eq('direction', 'payable')).data || []
    payable = invs.find((x: any) => (x.notes || '').includes('[CONSIGN:')) || null
    if (payable) break
    await page.waitForTimeout(1500)
  }
  expect(payable, 'consignment payable auto-created at intake').toBeTruthy()
  expect(Number(payable.total_amount)).toBeCloseTo(PURCHASE, 1)

  // UI: Facturación → Por Pagar shows the debt to the previous owner
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
  await page.getByRole('button', { name: 'Facturación', exact: true }).click()
  await page.getByRole('button', { name: /Por Pagar/i }).first().click()
  await expect(page.getByText(PCODE, { exact: false }).first()).toBeVisible({ timeout: 20000 })

  // ---- ITEM 6: sell it (RTO) BEFORE paying the owner ----
  const rtoBefore = await readResumen(page, 'Ventas Capital (RTO)')
  const sale = await apiPost(page, '/api/sales', {
    property_id: propId, client_id: clientId, sale_price: PRICE, sale_type: 'rto',
    rto_down_payment: DOWN, rto_term_months: 36, rto_monthly_payment: 800,
  })
  console.log(`DIAG POST /api/sales -> ${sale.status}`)
  expect(sale.status).toBeLessThan(300)

  // resumen: the sale income shows up (Ventas Capital RTO += financed)
  const rtoAfter = await readResumen(page, 'Ventas Capital (RTO)')
  console.log(`DIAG Ventas Capital (RTO): ${rtoBefore} -> ${rtoAfter}`)
  expect(rtoAfter - rtoBefore).toBeCloseTo(FINANCED, 1)

  // the owner debt is STILL outstanding (not paid) — sale reflected before paying
  const payNow = (await sb.from('accounting_invoices').select('amount_paid, status').eq('id', payable.id).single()).data
  expect(Number(payNow!.amount_paid)).toBeCloseTo(0, 1)
  expect(['sent', 'partial', 'overdue']).toContain(payNow!.status)

  // and it's still visible in Por Pagar
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.getByRole('button', { name: 'Facturación', exact: true }).click()
  await page.getByRole('button', { name: /Por Pagar/i }).first().click()
  await expect(page.getByText(PCODE, { exact: false }).first()).toBeVisible({ timeout: 20000 })
})
