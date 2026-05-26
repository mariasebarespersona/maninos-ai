/**
 * Verifies the per-property Inventory sub-account feature against prod.
 *
 * Honest scope: the actual Nueva Propiedad form is a 4-step wizard
 * (documents, signatures, photos) — too long to script reliably in a
 * single E2E. We instead POST to the same `/api/properties` endpoint
 * the form calls on its last step, then read the chart of accounts to
 * confirm the sub-accounts were provisioned. This is identical to what
 * the UI does at the network layer.
 *
 * Cleanup: we DELETE the test property at the end so prod doesn't
 * accumulate test data. The chart-of-accounts rows are intentionally
 * left in place because the chart is idempotent / reused.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

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

test('POST /api/properties auto-creates House + Compra/Renovación/Movida sub-accounts', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)

  const stamp = Date.now().toString().slice(-6)
  const testAddress = `E2E JOBCOST TEST ${stamp}`

  // Replicate the payload the UI sends at the final submit step.
  const createRes = await page.request.post(`${APP_URL}/api/properties`, {
    data: {
      leadership: 'dallas',
      address: testAddress,
      city: 'Dallas',
      state: 'Texas',
      purchase_price: 12345,
      bedrooms: 3,
      bathrooms: 2,
      year: 2020,
      length_ft: 76,
      width_ft: 16,
      status: 'pending_payment',
      is_consignment: true, // skip the payment_order to keep this self-contained
    },
  })

  expect(createRes.status(), `create response body: ${await createRes.text()}`).toBeLessThan(400)
  const created = await createRes.json()
  const newCode = created.property_code || created.code
  const newId = created.id
  console.log(`Created property id=${newId} code=${newCode} address="${testAddress}"`)
  expect(newCode, 'property_code should be auto-generated').toBeTruthy()
  expect(newCode).toMatch(/^DFW\d+$/)

  try {
    // Give the post-create hook a moment to write the inventory accounts.
    await page.waitForTimeout(2000)

    // Read every account and confirm the 4 expected rows exist.
    const acctRes = await page.request.get(`${APP_URL}/api/accounting/accounts`)
    expect(acctRes.ok()).toBeTruthy()
    const acctBody = await acctRes.json()
    const accounts: any[] = acctBody.accounts || acctBody.flat || acctBody || []
    const expected = [`House ${newCode}`, `Compra ${newCode}`, `Renovación ${newCode}`, `Movida ${newCode}`]
    const presence = expected.map((n) => ({
      name: n,
      found: accounts.some((a) => a.code === n || a.name === n),
    }))
    console.log('\nExpected sub-accounts in chart of accounts:')
    for (const p of presence) {
      console.log(`  ${p.found ? '✓' : '✗'} ${p.name}`)
    }
    const missing = presence.filter((p) => !p.found).map((p) => p.name)
    expect(missing, `missing sub-accounts: ${JSON.stringify(missing)}`).toEqual([])

    // ── Second assertion: a manual transaction with this property_id
    // routes to "Compra <CODE>", not the generic compras_casas bucket.
    const compraAccount = accounts.find((a) => a.code === `Compra ${newCode}` || a.name === `Compra ${newCode}`)
    expect(compraAccount, `Compra ${newCode} should be in chart of accounts`).toBeTruthy()
    const compraId = compraAccount.id

    const txnRes = await page.request.post(`${APP_URL}/api/accounting/transactions`, {
      data: {
        transaction_date: new Date().toISOString().split('T')[0],
        transaction_type: 'purchase_house',
        amount: 5000,
        is_income: false,
        description: `E2E routing test ${stamp}`,
        property_id: newId,
        counterparty_name: 'E2E Test Vendor',
      },
    })
    expect(txnRes.status(), `txn create body: ${await txnRes.text()}`).toBeLessThan(400)
    const txn = await txnRes.json()
    console.log(`\nCreated manual transaction id=${txn.id} account_id=${txn.account_id}`)
    console.log(`Expected to match Compra ${newCode} id=${compraId}`)
    expect(txn.account_id, `transaction should be routed to Compra ${newCode}`).toBe(compraId)

    // Cleanup the transaction we just created.
    const delTxn = await page.request.delete(`${APP_URL}/api/accounting/transactions/${txn.id}`).catch(() => null)
    if (delTxn) console.log(`Cleanup DELETE /api/accounting/transactions/${txn.id} → ${delTxn.status()}`)
  } finally {
    // Tidy up: delete the test property so prod doesn't accumulate junk.
    const del = await page.request.delete(`${APP_URL}/api/properties/${newId}`).catch(() => null)
    if (del) console.log(`Cleanup DELETE /api/properties/${newId} → status ${del.status()}`)
  }
})
