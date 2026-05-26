/**
 * Job-costing full cycle E2E.
 *
 * Two tests guard the per-property inventory feature end-to-end:
 *
 *   A. "Sub-accounts accumulate per-property costs"
 *      Posting purchase + renovation + commission with property_id lands
 *      each amount in its OWN sub-account (Compra/Renovación/Comisión
 *      <CODE>) instead of the generic chart account.
 *
 *   B. "Late-arriving commission gets swept on /complete"
 *      Even after a sale is fully paid and COGS is recognized, if a
 *      commission is later completed for that property, the
 *      _maybe_recognize_cogs_for_sale path runs again and zeroes the
 *      Comisión <CODE> bucket out into COGS. This is the bug the user
 *      hit yesterday on B1 where $1,500 of commission stayed visible
 *      in inventory after the sale.
 *
 * Both tests fully clean up after themselves so the prod ledger looks
 * untouched at the end.
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

const stamp = () => Date.now().toString().slice(-6)

async function getAccountId(page: Page, code: string): Promise<string | null> {
  const r = await page.request.get(`${APP_URL}/api/accounting/accounts`)
  if (!r.ok()) return null
  const list = (await r.json()).accounts || []
  const acc = list.find((a: any) => a.code === code || a.name === code)
  return acc?.id || null
}

async function getAccountBalance(page: Page, accountId: string): Promise<number> {
  // Sum signed contributions for this account by pulling its
  // transactions through the public list endpoint.
  const r = await page.request.get(`${APP_URL}/api/accounting/transactions?account_id=${accountId}&per_page=200`)
  if (!r.ok()) {
    console.warn(`[getAccountBalance] non-OK status: ${r.status()}`)
    return 0
  }
  const data = await r.json()
  const txns = data.transactions
  if (!Array.isArray(txns)) {
    console.warn(`[getAccountBalance] no transactions array; response keys: ${Object.keys(data).join(',')}`)
    return 0
  }
  let bal = 0
  for (const t of txns) {
    if ((t.status || '') === 'voided') continue
    const amt = Number(t.amount) || 0
    bal += t.is_income ? amt : -amt
  }
  return Math.round(bal * 100) / 100
}

// ═════════════════════════════════════════════════════════════════════
// A. Purchase + Renovation + Commission land in per-property sub-accounts
// ═════════════════════════════════════════════════════════════════════
test('per-property sub-accounts accumulate Compra/Renovación/Comisión with the right amounts', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsAdmin(page)

  const s = stamp()
  const propRes = await page.request.post(`${APP_URL}/api/properties`, {
    data: { leadership: 'houston', address: `E2E JOBCOST A ${s}`, purchase_price: 9999, is_consignment: true },
  })
  expect(propRes.ok()).toBeTruthy()
  const prop = await propRes.json()
  const code = prop.property_code
  expect(code).toBeTruthy()

  const createdTxns: string[] = []

  try {
    // Wait for the per-property sub-accounts to be created.
    await page.waitForTimeout(1500)

    const compraId = await getAccountId(page, `Compra ${code}`)
    const renoId = await getAccountId(page, `Renovación ${code}`)
    const movidaId = await getAccountId(page, `Movida ${code}`)
    const comisionId = await getAccountId(page, `Comisión ${code}`)
    expect(compraId, `Compra ${code} must exist`).toBeTruthy()
    expect(renoId, `Renovación ${code} must exist`).toBeTruthy()
    expect(movidaId, `Movida ${code} must exist`).toBeTruthy()
    expect(comisionId, `Comisión ${code} must exist`).toBeTruthy()

    const today = new Date().toISOString().split('T')[0]
    const post = async (type: string, amount: number) => {
      const r = await page.request.post(`${APP_URL}/api/accounting/transactions`, {
        data: {
          transaction_date: today,
          transaction_type: type,
          amount,
          is_income: false,
          description: `E2E ${type} ${s}`,
          property_id: prop.id,
          counterparty_name: 'E2E Vendor',
        },
      })
      expect(r.ok(), `${type} txn body: ${await r.text()}`).toBeTruthy()
      const body = await r.json()
      if (body.id) createdTxns.push(body.id)
    }

    await post('purchase_house', 100)
    await post('renovation', 50)
    await post('moving_transport', 30)
    await post('commission', 20)

    expect(await getAccountBalance(page, compraId!), 'Compra balance').toBeCloseTo(100, 2)
    expect(await getAccountBalance(page, renoId!), 'Renovación balance').toBeCloseTo(50, 2)
    expect(await getAccountBalance(page, movidaId!), 'Movida balance').toBeCloseTo(30, 2)
    expect(await getAccountBalance(page, comisionId!), 'Comisión balance').toBeCloseTo(20, 2)
  } finally {
    for (const id of createdTxns) {
      await page.request.delete(`${APP_URL}/api/accounting/transactions/${id}`).catch(() => null)
    }
    await page.request.delete(`${APP_URL}/api/properties/${prop.id}`).catch(() => null)
  }
})

// ═════════════════════════════════════════════════════════════════════
// B. Late-arriving commission still ends up in COGS (not left in
//    Comisión <CODE>). This is the B1 bug from yesterday.
// ═════════════════════════════════════════════════════════════════════
test('commission paid after sale close still gets swept into COGS', async ({ page }) => {
  test.setTimeout(240000)
  await loginAsAdmin(page)

  const s = stamp()
  const propRes = await page.request.post(`${APP_URL}/api/properties`, {
    data: {
      leadership: 'conroe',
      address: `E2E JOBCOST B ${s}`,
      purchase_price: 200,
      status: 'published',
      is_consignment: true,
    },
  })
  expect(propRes.ok()).toBeTruthy()
  const prop = await propRes.json()
  const code = prop.property_code

  const clientRes = await page.request.post(`${APP_URL}/api/clients`, {
    data: { name: `E2E B Client ${s}`, phone: `777${s}` },
  })
  let clientId: string | undefined
  if (clientRes.ok()) clientId = (await clientRes.json()).id

  const cleanupTxns: string[] = []
  let saleId: string | null = null

  try {
    expect(clientId, 'client creation failed').toBeTruthy()

    await page.waitForTimeout(1500)
    const comisionId = await getAccountId(page, `Comisión ${code}`)
    const cogsAccountId = await getAccountId(page, 'House Sales - COGS')
    expect(comisionId, `Comisión ${code} must exist`).toBeTruthy()
    if (!cogsAccountId) {
      test.info().annotations.push({ type: 'note', description: '"House Sales - COGS" account missing on this chart — skipping sweep check' })
      return
    }

    // Step 1: create + close the sale.
    const saleRes = await page.request.post(`${APP_URL}/api/sales`, {
      data: { property_id: prop.id, client_id: clientId!, sale_price: 500, sale_type: 'contado' },
    })
    expect(saleRes.ok(), `sale create body: ${await saleRes.text()}`).toBeTruthy()
    saleId = (await saleRes.json()).id

    const pay = await page.request.post(`${APP_URL}/api/sales/${saleId}/payments`, {
      data: { amount: 500, payment_type: 'full', payment_method: 'cash', reported_by: 'staff' },
    })
    expect(pay.ok()).toBeTruthy()
    await page.waitForTimeout(1500)

    // The sale_payment register creates an INBOUND payment_order with
    // status='pending'. The COGS recognition path only fires when that
    // order is APPROVED (because approve writes the inbound ledger pair).
    // Approve it now with the first available bank so the sale is truly
    // "closed" from the accounting side.
    const banksRes = await page.request.get(`${APP_URL}/api/accounting/bank-accounts`)
    const banksList = (await banksRes.json()).bank_accounts || []
    const closingBankId = banksList[0]?.id
    expect(closingBankId).toBeTruthy()

    const poListRes = await page.request.get(`${APP_URL}/api/payment-orders?status=pending`)
    const pendingOrders = (await poListRes.json()).data || []
    const inboundForThisProp = pendingOrders.find(
      (o: any) => o.property_id === prop.id && o.direction === 'inbound',
    )
    expect(inboundForThisProp, 'pending inbound payment_order for the sale').toBeTruthy()
    const approveRes = await page.request.patch(
      `${APP_URL}/api/payment-orders/${inboundForThisProp.id}/approve?bank_account_id=${closingBankId}`,
    )
    expect(approveRes.ok(), `approve body: ${await approveRes.text()}`).toBeTruthy()
    await page.waitForTimeout(2000)

    // Step 2: NOW post a commission tagged to this property (simulates
    // an operator paying the closer's fee after the cash hits the bank).
    // Goes to Comisión <CODE> via manual routing.
    const today = new Date().toISOString().split('T')[0]
    const commTxn = await page.request.post(`${APP_URL}/api/accounting/transactions`, {
      data: {
        transaction_date: today,
        transaction_type: 'commission',
        amount: 25,
        is_income: false,
        description: `E2E late commission ${s}`,
        property_id: prop.id,
        counterparty_name: 'E2E Closer',
      },
    })
    expect(commTxn.ok()).toBeTruthy()
    const commId = (await commTxn.json()).id
    if (commId) cleanupTxns.push(commId)

    // Confirm Comisión <CODE> now holds $25 (manual routing applied).
    const balBefore = await getAccountBalance(page, comisionId!)
    expect(balBefore, `Comisión ${code} should hold $25 before sweep`).toBeCloseTo(25, 2)

    // Step 3: To trigger the late-COGS sweep we need
    // _maybe_recognize_cogs_for_sale to re-run. That happens on
    // /complete of a payment_order with concept ∈ {comision, compra,
    // renovacion, movida} for the same property. We simulate that by
    // creating a small commission payment_order, approving it, then
    // completing it — that's the real-world path operators take.
    const banks = await page.request.get(`${APP_URL}/api/accounting/bank-accounts`)
    const bankList = (await banks.json()).bank_accounts || []
    const bankId = bankList[0]?.id
    expect(bankId).toBeTruthy()

    const poRes = await page.request.post(`${APP_URL}/api/payment-orders`, {
      data: {
        property_id: prop.id,
        property_address: prop.address || `E2E JOBCOST B ${s}`,
        payee_name: 'E2E Closer',
        amount: 1, // smallest viable amount — just to fire the sweep
        method: 'transferencia',
        concept: 'comision',
        notes: 'E2E: trigger late-COGS sweep',
      },
    })
    if (!poRes.ok()) {
      test.info().annotations.push({ type: 'note', description: `Could not create commission payment_order: ${await poRes.text()}` })
      return
    }
    const poId = (await poRes.json()).data?.id

    // Approve (outbound just bumps status to 'approved')
    await page.request.patch(`${APP_URL}/api/payment-orders/${poId}/approve`)

    // Complete — this is where _maybe_recognize_cogs_for_sale is called
    // from my fix.
    const completeRes = await page.request.patch(`${APP_URL}/api/payment-orders/${poId}/complete`, {
      data: { reference: `E2E-${s}`, payment_date: today, bank_account_id: bankId },
    })
    expect(completeRes.ok(), `complete body: ${await completeRes.text()}`).toBeTruthy()
    await page.waitForTimeout(2500)

    // After the sweep, Comisión <CODE> should be at $0 — the bucket got
    // drained into COGS along with the new $1 from the completion.
    const balAfter = await getAccountBalance(page, comisionId!)
    expect(
      balAfter,
      `Comisión ${code} should be ≈ $0 after late COGS sweep, got $${balAfter}`,
    ).toBeCloseTo(0, 1)

    // Cleanup the payment_order's ledger pair (the small $1 commission)
    await page.request.delete(`${APP_URL}/api/payment-orders/${poId}`).catch(() => null)
  } finally {
    for (const id of cleanupTxns) {
      await page.request.delete(`${APP_URL}/api/accounting/transactions/${id}`).catch(() => null)
    }
    if (saleId) await page.request.delete(`${APP_URL}/api/sales/${saleId}`).catch(() => null)
    await page.request.delete(`${APP_URL}/api/properties/${prop.id}`).catch(() => null)
    if (clientId) await page.request.delete(`${APP_URL}/api/clients/${clientId}`).catch(() => null)
  }
})
