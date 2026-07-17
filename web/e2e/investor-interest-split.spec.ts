/**
 * Capital — Investor lifecycle via UI, verifying accounting (runs against prod).
 *
 * Test 1: create a NEW INVESTOR through the UI, fund it with a promissory note
 *   through the UI, approve the deposit, and confirm CONTABILIDAD reflects it:
 *   the $10,000 lands in 23900 (Investor Notes Payable) and the reconciliation
 *   endpoint ties out.
 *
 * Test 2: RETURN the money to the investor through the payment UI (Registrar
 *   Pago on the note), approve it, and confirm CONTABILIDAD: principal reduces
 *   23900 back to $0 and the interest lands in 71400 (Interest paid / P&L) —
 *   never mixed. This is the root principal/interest split.
 *
 * Setup (primary bank) + approval-confirm + teardown use the backend/Supabase
 * service role directly; the money actions (create investor, create note, pay)
 * are driven through the browser. Everything is marked E2E-PW-SPLIT-<ts> and
 * removed in afterAll (0 residue).
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app'
const SB_URL = process.env.SUPABASE_URL as string
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY as string

const MARKER = `E2E-PW-SPLIT-${Date.now()}`
const INVESTOR_NAME = `${MARKER} Investor`
const LOAN = 10000

let bankId = ''
let investorId = ''
let noteId = ''
let totalDue = 0
let totalInterest = 0

test.describe.configure({ mode: 'serial' })

// ─── Supabase service-role helpers (bypass RLS for setup/verify/teardown) ──
async function sbGet(pathq: string): Promise<any[]> {
  const r = await fetch(`${SB_URL}/rest/v1/${pathq}`, {
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` },
  })
  return r.ok ? r.json() : []
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
/** Confirm every still-pending capital_transaction for the investor (approval). */
async function confirmPending() {
  const pend = await sbGet(
    `capital_transactions?investor_id=eq.${investorId}&status=eq.pending_confirmation&select=id`
  )
  for (const t of pend) {
    await apiPost(`/api/capital/payments/confirm-transaction/${t.id}`)
  }
}
async function reconciliation() {
  const r = await fetch(`${API_URL}/api/capital/investors/investments/reconciliation`)
  return r.json()
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
    await page.evaluate(() => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"], #react-joyride-step-0'
      ).forEach((el) => el.remove())
    }).catch(() => {})
  }
  // Persistent stripper — joyride re-mounts the overlay, so keep removing it.
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
  // Primary Capital bank so ledger postings have a bank leg (the pay modal
  // sends no bank → the hook uses the primary Capital bank).
  await apiPost('/api/capital/accounting/bank-accounts', {
    name: `${MARKER} Bank`, account_type: 'checking', current_balance: 0, is_primary: true,
  })
  const banks = await sbGet(`capital_bank_accounts?name=eq.${encodeURIComponent(`${MARKER} Bank`)}&select=id`)
  bankId = banks[0]?.id || ''
})

test.afterAll(async () => {
  if (investorId) {
    await sbDel(`capital_transactions?investor_id=eq.${investorId}`)
    await sbDel(`capital_flows?investor_id=eq.${investorId}`)
    await sbDel(`investments?investor_id=eq.${investorId}`)
  }
  if (noteId) {
    await sbDel(`promissory_note_payments?promissory_note_id=eq.${noteId}`)
    await sbDel(`promissory_notes?id=eq.${noteId}`)
  }
  if (investorId) await sbDel(`investors?id=eq.${investorId}`)
  if (bankId) await sbDel(`capital_bank_accounts?id=eq.${bankId}`)
  await sbDel(`capital_accounts?name=ilike.*${encodeURIComponent(MARKER)}*`)
})

// ─── Test 1: create investor + fund → accounting shows the deposit ─────────
test('crea inversionista y fondea vía UI → contabilidad refleja el depósito (23900)', async ({ page }) => {
  expect(bankId, 'primary bank created').toBeTruthy()
  await loginAsAdmin(page)

  // Create the investor through the UI
  await page.goto(`${APP_URL}/capital/investors`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await page.getByRole('button', { name: /Nuevo Inversionista/i }).click({ force: true })
  await page.locator('input[placeholder="Nombre completo"]').fill(INVESTOR_NAME)
  await page.getByRole('button', { name: /^Registrar$/ }).click({ force: true })
  await page.waitForTimeout(2500)

  const invs = await sbGet(`investors?name=eq.${encodeURIComponent(INVESTOR_NAME)}&select=id`)
  investorId = invs[0]?.id || ''
  expect(investorId, 'investor created via UI').toBeTruthy()

  // Fund with a promissory note through the UI
  await page.goto(`${APP_URL}/capital/promissory-notes`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await page.getByRole('button', { name: /Nueva Nota/i }).click({ force: true })
  await page.waitForTimeout(600)
  await page.locator('select').first().selectOption({ label: new RegExp(INVESTOR_NAME) }).catch(async () => {
    await page.locator('select').first().selectOption({ value: investorId })
  })
  await page.locator('input[type="number"]').first().fill(String(LOAN))
  await page.getByRole('button', { name: /Crear Nota Promisoria/i }).click({ force: true })
  await page.waitForTimeout(3000)

  const notes = await sbGet(`promissory_notes?investor_id=eq.${investorId}&select=id,total_due,total_interest,loan_amount`)
  noteId = notes[0]?.id || ''
  totalDue = Number(notes[0]?.total_due || 0)
  totalInterest = Number(notes[0]?.total_interest || 0)
  expect(noteId, 'note created via UI').toBeTruthy()
  expect(Number(notes[0]?.loan_amount)).toBe(LOAN)

  // Approve the pending deposit, then verify CONTABILIDAD
  await confirmPending()
  const rec = await reconciliation()
  const pc = rec.checks.principal_vs_notes_payable
  expect(pc.ledger_23900_balance, '23900 holds the $10,000 deposit').toBeCloseTo(LOAN, 1)
  expect(pc.notes_outstanding_principal).toBeCloseTo(LOAN, 1)
  expect(pc.ok, 'principal == 23900 reconciles').toBeTruthy()
  expect(rec.checks.interest_paid_ledger.interest_paid_to_date, 'no interest yet').toBeCloseTo(0, 1)

  // Accounting page loads and renders the Capital books
  await page.goto(`${APP_URL}/capital/accounting`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await expect(page.getByText(/Contabilidad Capital/i).first()).toBeVisible({ timeout: 60000 })
})

// ─── Test 2: return money in payments → accounting shows split ─────────────
test('devuelve el dinero al inversionista vía UI → contabilidad: principal 23900 + interés 71400', async ({ page }) => {
  expect(noteId, 'note from test 1').toBeTruthy()
  await loginAsAdmin(page)

  // Pay the note in full through the payment UI → splits principal + interest
  await page.goto(`${APP_URL}/capital/promissory-notes/${noteId}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await killOverlays(page)
  await page.getByRole('button', { name: /Registrar Pago/i }).first().click()
  await page.waitForTimeout(600)
  const modal = page.locator('input[type="number"]').last()
  await modal.fill(String(totalDue))
  await page.getByRole('button', { name: /Confirmar Pago/i }).click({ force: true })
  await page.waitForTimeout(3000)

  // Approve the pending payment legs, then verify CONTABILIDAD
  await confirmPending()
  const rec = await reconciliation()
  const pc = rec.checks.principal_vs_notes_payable
  const ic = rec.checks.interest_paid_ledger
  expect(pc.ledger_23900_balance, 'principal repaid → 23900 back to 0').toBeCloseTo(0, 1)
  expect(pc.ok, 'reconciles at zero').toBeTruthy()
  expect(ic.interest_paid_to_date, 'interest landed in 71400').toBeCloseTo(totalInterest, 1)
  expect(ic.interest_paid_to_date).toBeGreaterThan(0)

  const note = await sbGet(`promissory_notes?id=eq.${noteId}&select=status`)
  expect(note[0]?.status, 'note fully paid').toBe('paid')
})
