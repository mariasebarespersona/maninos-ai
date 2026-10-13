/**
 * E2E contra producción — contabilidad y conciliación.
 *
 * Reescrita 2026-10-13: antes llamaba al backend de Railway directamente y,
 * desde el candado del API (X-Internal-Key), recibía 401 en todo. Ahora va por
 * los proxies de la app (como la pantalla) y el flujo completo usa una casa
 * desechable con teardown total.
 *
 *  - Endpoints de lectura: dashboard, estados de cuenta, cuentas bancarias.
 *  - Flujo completo: orden de compra → aprobar → completar con cuenta y fecha
 *    → asiento doble (gasto/inventario + banco) en esa fecha; borrar la orden
 *    revierte el asiento.
 *  - UI: pestaña Estado de Cuenta.
 *
 * Necesita SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL +
 * E2E_CAPITAL_PASSWORD (en ../.env).
 */
import { test, expect } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EAR${Date.now() % 100000}`

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

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
})

test.afterAll(async () => {
  if (!sb || !propId) return
  try {
    const ordIds = ((await sb.from('payment_orders').select('id').eq('property_id', propId)).data || []).map(o => o.id)
    const tx = new Set<string>()
    for (const r of (await sb.from('accounting_transactions').select('id').eq('property_id', propId)).data || []) tx.add(r.id)
    if (ordIds.length) for (const r of (await sb.from('accounting_transactions').select('id').in('entity_id', ordIds)).data || []) tx.add(r.id)
    const ids = Array.from(tx)
    if (ids.length) {
      await sb.from('statement_movements').update({ transaction_id: null }).in('transaction_id', ids)
      await sb.from('accounting_transactions').update({ linked_transaction_id: null }).in('id', ids)
      await sb.from('accounting_transactions').delete().in('id', ids)
    }
    await sb.from('accounting_invoices').delete().eq('property_id', propId)
    if (ordIds.length) await sb.from('payment_orders').delete().in('id', ordIds)
    await sb.from('notifications').delete().eq('property_id', propId)
    await sb.from('accounting_accounts').delete().ilike('code', `%${PCODE}`)
    await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test.describe('Endpoints de contabilidad (por la app)', () => {
  test('dashboard devuelve transacciones recientes con la forma correcta', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/accounting/dashboard`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    const txns = data.recent_transactions || []
    expect(Array.isArray(txns)).toBe(true)
    expect(txns.length).toBeGreaterThan(0)
    for (const t of txns.slice(0, 10)) {
      expect(t.id).toBeTruthy()
      expect(t.transaction_type).toBeTruthy()
      expect(Number.isFinite(Number(t.amount))).toBe(true)
      expect(typeof t.is_income).toBe('boolean')
    }
    expect(txns.some((t: any) => t.status === 'confirmed')).toBe(true)
  })

  test('estados de cuenta responde', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/accounting/bank-statements`)
    expect(res.status()).toBe(200)
  })

  test('cuentas bancarias devuelve la lista', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/accounting/bank-accounts`)
    expect(res.status()).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data.bank_accounts)).toBe(true)
    expect(data.bank_accounts.length).toBeGreaterThan(0)
  })
})

test.describe('Completar una orden de pago crea su asiento', () => {
  test('orden de compra → aprobar → completar con cuenta y fecha → asiento; borrar la revierte', async ({ request }) => {
    const p = await sb.from('properties').insert({
      address: `E2E Acct ${PCODE}`, city: 'Houston', state: 'Texas', property_code: PCODE,
      purchase_price: 20000, status: 'purchased',
    }).select('id').single()
    expect(p.error).toBeFalsy()
    propId = p.data!.id
    const bank = ((await sb.from('bank_accounts').select('id').not('accounting_account_id', 'is', null).limit(1)).data || [])[0]
    expect(bank).toBeTruthy()

    const c = await request.post(`${APP_URL}/api/payment-orders`, {
      data: { property_id: propId, property_address: `E2E Acct ${PCODE}`, payee_name: 'E2E Seller',
        amount: 20000, method: 'transferencia', concept: 'compra', notes: 'E2E test' },
    })
    expect(c.status(), await c.text()).toBeLessThan(300)
    const orderId = (await c.json()).data?.id
    expect(orderId).toBeTruthy()

    expect((await request.patch(`${APP_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e`)).status()).toBe(200)
    const fecha = '2026-04-01'
    const done = await request.patch(`${APP_URL}/api/payment-orders/${orderId}/complete`, {
      data: { reference: `E2E-${PCODE}`, payment_date: fecha, bank_account_id: bank.id },
    })
    expect(done.status(), await done.text()).toBe(200)
    expect((await done.json()).ok).toBe(true)

    const o = (await sb.from('payment_orders').select('status, accounting_transaction_id').eq('id', orderId).single()).data!
    expect(o.status).toBe('completed')
    expect(o.accounting_transaction_id).toBeTruthy()
    const legs = (await sb.from('accounting_transactions').select('id, amount, transaction_date, bank_account_id')
      .eq('entity_type', 'payment_order').eq('entity_id', orderId)).data || []
    expect(legs.length, 'asiento doble').toBe(2)
    for (const l of legs) {
      expect(Number(l.amount)).toBe(20000)
      expect(l.transaction_date).toBe(fecha)
    }
    expect(legs.filter(l => l.bank_account_id === bank.id).length, 'una pierna en el banco').toBe(1)

    // Borrar la orden revierte el asiento
    expect((await request.delete(`${APP_URL}/api/payment-orders/${orderId}?deleted_by=e2e`)).status()).toBe(200)
    const after = (await sb.from('accounting_transactions').select('id').eq('entity_type', 'payment_order').eq('entity_id', orderId)).data || []
    expect(after.length).toBe(0)
    await sb.from('accounting_audit_log').delete().eq('record_id', orderId)
  })
})

test.describe('UI: Contabilidad', () => {
  test('pestaña Estado de Cuenta', async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem('maninos_tour_completed_homes', 'true')
        localStorage.setItem('maninos_tour_page_homes__homes_accounting', 'true')
      } catch (e) { /* ignore */ }
    })
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
    await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
    await page.getByRole('button', { name: /ingresar|login/i }).click()
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }

    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await expect(page.getByRole('button', { name: /Transacciones/ }).first()).toBeVisible({ timeout: 30000 })
    await page.getByRole('button', { name: /Estado de Cuenta/ }).first().click()
    await expect(page.locator('text=Estado de Cuent').or(page.locator('text=Nueva Cuenta')).first()).toBeVisible({ timeout: 15000 })
  })
})
