/**
 * Capital — "Casas Financiadas" section via UI (runs against prod).
 *
 * Test 1: a financed (RTO) house seeded the way Homes leaves it shows up in the
 *   new section with the right code/status/terms, and its detail renders the
 *   "Posición contable (Capital)" block.
 *
 * Test 2: deploy an existing investor's capital to the house through the
 *   "Asignar inversionista" modal (pick investor + amount), approve the pending
 *   deposit, and confirm via the API that the house lists the investor and the
 *   deposit landed in 23900 (reconciliation stays balanced — both the note-less
 *   investment total and 23900 move by the same amount).
 *
 * Seeding/teardown use the Supabase service role directly; the deploy action is
 * driven through the browser. Everything is tagged E2E-PW-FH-<ts> (0 residue).
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app'
const SB_URL = process.env.SUPABASE_URL as string
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const MARKER = `E2E-PW-FH-${Date.now()}`
const CODE = `H${Date.now() % 100000}`

const DEPLOY = 5000
let propId = ''
let clientId = ''
let saleId = ''
let contractId = ''
let investorId = ''
let bankId = ''

test.describe.configure({ mode: 'serial' })

// ─── Supabase service-role helpers ─────────────────────────────────────
async function sbGet(pathq: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${pathq}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  return r.ok ? r.json() : []
}
async function sbPost(table: string, row: any): Promise<any> {
  const r = await fetch(`${SB_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`,
      'Content-Type': 'application/json', Prefer: 'return=representation',
    },
    body: JSON.stringify(row),
  })
  const data = await r.json().catch(() => [])
  return Array.isArray(data) ? data[0] : data
}
async function sbPatch(pathq: string, body: any) {
  await fetch(`${SB_URL}/rest/v1/${pathq}`, {
    method: 'PATCH',
    headers: {
      apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }).catch(() => {})
}
async function sbDel(pathq: string) {
  await fetch(`${SB_URL}/rest/v1/${pathq}`, {
    method: 'DELETE',
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  }).catch(() => {})
}
async function apiPost(path: string, body?: any) {
  const r = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { ok: r.ok, status: r.status, data: await r.json().catch(() => ({})) }
}
async function confirmPending() {
  const pend = await sbGet(
    `capital_transactions?investor_id=eq.${investorId}&status=eq.pending_confirmation&select=id`
  )
  for (const t of pend) await apiPost(`/api/capital/payments/confirm-transaction/${t.id}`)
}
async function reconDiff(): Promise<number> {
  const r = await fetch(`${API_URL}/api/capital/investors/investments/reconciliation`)
  const j = await r.json()
  return Math.round(Number(j.checks.principal_vs_notes_payable.diff) * 100) / 100
}
async function bal23900(): Promise<number> {
  const r = await fetch(`${API_URL}/api/capital/investors/investments/reconciliation`)
  const j = await r.json()
  return Math.round(Number(j.checks.principal_vs_notes_payable.ledger_23900_balance) * 100) / 100
}
async function houseInvestors(): Promise<any[]> {
  const r = await fetch(`${API_URL}/api/capital/financed-houses/${saleId}`)
  const j = await r.json()
  return j.house?.investors || []
}

// ─── Browser helpers ───────────────────────────────────────────────────
async function loginAsAdmin(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    if (!page.url().includes('/login')) break
  }
}
async function killOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)
    const omitir = page.locator('button:has-text("Omitir tour")')
    if (await omitir.isVisible({ timeout: 500 }).catch(() => false)) {
      await omitir.click({ force: true }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
  }
  await page.evaluate(() => {
    const strip = () => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"]'
      ).forEach((el) => el.remove())
    }
    new MutationObserver(strip).observe(document.body, { childList: true, subtree: true })
    strip()
  }).catch(() => {})
}

// ─── Setup / teardown ──────────────────────────────────────────────────
test.beforeAll(async () => {
  const prop = await sbPost('properties', {
    address: `${MARKER} 200 Test Ave`, city: 'Houston', state: 'Texas',
    property_code: CODE, sale_price: 40000, status: 'sold',
  })
  propId = prop?.id || ''
  const client = await sbPost('clients', { name: `${MARKER} Buyer`, status: 'rto_active' })
  clientId = client?.id || ''
  const sale = await sbPost('sales', {
    property_id: propId, client_id: clientId, sale_type: 'rto', sale_price: 40000,
    status: 'rto_active', rto_down_payment: 12000, rto_monthly_payment: 700,
    rto_term_months: 40, financed_remaining: 28000, financed_down_payment: 12000,
    capital_payment_status: 'received',
  })
  saleId = sale?.id || ''
  const contract = await sbPost('rto_contracts', {
    sale_id: saleId, property_id: propId, client_id: clientId, monthly_rent: 700,
    purchase_price: 40000, down_payment: 12000, term_months: 40,
    start_date: '2025-01-15', end_date: '2028-05-15', status: 'active',
  })
  contractId = contract?.id || ''
  await sbPatch(`sales?id=eq.${saleId}`, { rto_contract_id: contractId })
  await sbPost('rto_payments', {
    rto_contract_id: contractId, client_id: clientId, payment_number: 1,
    amount: 700, due_date: '2025-02-15', status: 'paid', paid_amount: 700, paid_date: '2025-02-15',
  })

  // Primary Capital bank so the deposit posts as a balanced pair.
  await apiPost('/api/capital/accounting/bank-accounts', {
    name: `${MARKER} Bank`, account_type: 'checking', current_balance: 0, is_primary: true,
  })
  const banks = await sbGet(`capital_bank_accounts?name=eq.${encodeURIComponent(`${MARKER} Bank`)}&select=id`)
  bankId = banks[0]?.id || ''

  // Investor WITH available capital but NO ticket yet — the real-world case the
  // deploy flow must handle (assign a house even if it was forgotten at creation).
  const investor = await sbPost('investors', { name: `${MARKER} Investor`, available_capital: 50000 })
  investorId = investor?.id || ''
})

test.afterAll(async () => {
  if (saleId) await sbPatch(`sales?id=eq.${saleId}`, { rto_contract_id: null })
  if (investorId) {
    // Break the investments ↔ capital_flows FK cycle before deleting.
    await sbPatch(`investments?investor_id=eq.${investorId}`, { capital_flow_id: null })
    await sbDel(`capital_transactions?investor_id=eq.${investorId}`)
    await sbDel(`capital_flows?investor_id=eq.${investorId}`)
    await sbDel(`investments?investor_id=eq.${investorId}`)
  }
  if (contractId) await sbDel(`rto_payments?rto_contract_id=eq.${contractId}`)
  if (contractId) await sbDel(`rto_contracts?id=eq.${contractId}`)
  if (saleId) await sbDel(`sales?id=eq.${saleId}`)
  if (propId) await sbDel(`properties?id=eq.${propId}`)
  if (clientId) await sbDel(`clients?id=eq.${clientId}`)
  if (investorId) await sbDel(`investors?id=eq.${investorId}`)
  if (bankId) await sbDel(`capital_bank_accounts?id=eq.${bankId}`)
})

// ─── Test 1: house shows in the section + accounting block renders ─────────
test('la casa financiada aparece en la sección y su detalle muestra la posición contable', async ({ page }) => {
  expect(saleId, 'house seeded').toBeTruthy()
  await loginAsAdmin(page)

  await page.goto(`${APP_URL}/capital/financed-houses`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await expect(page.getByRole('heading', { name: 'Casas Financiadas' })).toBeVisible({ timeout: 60000 })
  await expect(page.getByText(CODE).first()).toBeVisible({ timeout: 60000 })

  // Open the detail
  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await expect(page.getByText(CODE).first()).toBeVisible({ timeout: 60000 })
  await expect(page.getByText(/Posición contable/i)).toBeVisible({ timeout: 30000 })
  await expect(page.getByText('$28,000').first()).toBeVisible({ timeout: 30000 })
})

// ─── Test 2: deploy investor capital via the modal → lands in 23900 ────────
test('asignar (desplegar capital) vía UI crea el ticket y el depósito llega a 23900', async ({ page }) => {
  expect(investorId, 'investor seeded').toBeTruthy()
  await loginAsAdmin(page)

  const diffBefore = await reconDiff()
  const bal0 = await bal23900()

  await page.goto(`${APP_URL}/capital/financed-houses/${saleId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await page.getByRole('button', { name: /Asignar inversionista/i }).click({ force: true })
  await page.waitForTimeout(800)
  // Pick the investor and enter the amount, then deploy.
  await page.locator('select').selectOption(investorId)
  await page.locator('input[type="number"]').first().fill(String(DEPLOY))
  await page.getByRole('button', { name: /Asignar capital a esta casa/i }).click({ force: true })
  await page.waitForTimeout(2500)

  // A ticket now exists, earmarked to this house, listing the investor.
  const linked = await houseInvestors()
  const mine = linked.find((i) => i.investor_id === investorId)
  expect(mine, 'investor deployed to house').toBeTruthy()
  expect(Number(mine.amount), 'ticket amount = deploy').toBeCloseTo(DEPLOY, 1)

  // Approve the pending deposit → it lands in 23900, reconciliation stays balanced.
  await confirmPending()
  const bal1 = await bal23900()
  expect(bal1 - bal0, 'deposit landed in 23900').toBeCloseTo(DEPLOY, 1)
  const diffAfter = await reconDiff()
  expect(Math.abs(diffAfter - diffBefore), 'deploy neutral to reconciliation').toBeLessThan(0.5)
})
