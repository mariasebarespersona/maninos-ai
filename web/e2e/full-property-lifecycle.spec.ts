/**
 * Full property lifecycle E2E — Phase A reality check.
 *
 * Drives a complete property flow against production with the e2e-test user
 * and captures what actually ends up in Contabilidad at each step, so we can
 * tell the user the truth about which links are broken and which work.
 *
 * Mixes API calls (for fast, reliable writes) with UI snapshots (to verify
 * what an operator would actually SEE on screen). After each step we query
 * /api/accounting/transactions and dump the rows that match this run's
 * property_id so we can see, in order, what got written to the ledger and
 * — critically — whether bank_account_id was populated.
 *
 * Outputs: test-screenshots/full-lifecycle/{01..NN}-*.png + findings.json
 */
import { test, expect, request as pwRequest, APIRequestContext, Page } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const EMAIL = 'e2e-test@maninos.com';
const PASSWORD = 'E2eTest2026!Maninos';

const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const TEST_ADDRESS = `E2E LIFECYCLE ${STAMP} - 123 Test St`;
const PURCHASE_PRICE = 25000;
const SALE_PRICE = 48000;
const DOWN_PAYMENT = 12000;

const OUT_DIR = path.resolve(__dirname, '../../test-screenshots/full-lifecycle');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface StepLog {
  step: string;
  ok: boolean;
  note: string;
  ledger_after?: any[];
}
const log: StepLog[] = [];
const issues: string[] = [];

function record(step: string, ok: boolean, note: string, ledger_after?: any[]) {
  log.push({ step, ok, note, ledger_after });
  console.log(`\n=== ${step} ===\n  ok=${ok}\n  ${note}`);
  if (ledger_after && ledger_after.length) {
    console.log(`  ledger rows now visible for this property:`);
    for (const r of ledger_after) {
      console.log(`    - ${r.transaction_number} | ${r.transaction_type} | amount=${r.amount} is_income=${r.is_income} bank=${r.bank_account_id ?? 'NULL'} desc="${r.description}"`);
    }
  }
}

function flag(msg: string) {
  issues.push(msg);
  console.log(`  ⚠ ${msg}`);
}

async function login(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar|login/i }).click();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1500);
    if (!page.url().includes('/login')) break;
  }
}

async function killTour(page: Page) {
  await page.evaluate(() => {
    document.getElementById('react-joyride-portal')?.remove();
    document.querySelectorAll('.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip').forEach((e) => e.remove());
  }).catch(() => {});
}

async function snap(page: Page, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true }).catch(() => {});
}

async function ledgerForProperty(api: APIRequestContext, propertyId: string): Promise<any[]> {
  const res = await api.get(`${API_URL}/api/accounting/transactions?property_id=${propertyId}&limit=200`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => ({}));
  return data.transactions || data.data || data || [];
}

async function ledgerForEntity(api: APIRequestContext, entityType: string, entityId: string): Promise<any[]> {
  const res = await api.get(`${API_URL}/api/accounting/transactions?entity_type=${entityType}&entity_id=${entityId}&limit=200`).catch(() => null);
  if (!res || !res.ok()) return [];
  const data = await res.json().catch(() => ({}));
  return data.transactions || data.data || data || [];
}

async function getBank(api: APIRequestContext, nameSubstr: string): Promise<any | null> {
  const res = await api.get(`${API_URL}/api/accounting/bank-accounts`).catch(() => null);
  if (!res || !res.ok()) return null;
  const data = await res.json();
  const banks = data.bank_accounts || [];
  return banks.find((b: any) => (b.name || '').toLowerCase().includes(nameSubstr.toLowerCase())) ?? null;
}

test.setTimeout(900_000); // 15 minutes — this is a long flow

test('full property lifecycle reality check', async ({ page, browser }) => {
  let propertyId = '';
  let clientId = '';
  let saleId = '';
  let paymentOrderId = '';
  let invoiceId = '';

  const api = await pwRequest.newContext();

  // ---- Login (UI) — establishes session for screenshots ----
  await login(page);
  await snap(page, '01-after-login.png');
  record('Login', !page.url().includes('/login'), `Landed at ${page.url()}`);

  // ---- Snapshot all 6 banks BEFORE we do anything ----
  const banksRes = await api.get(`${API_URL}/api/accounting/bank-accounts`);
  const banksBefore = (await banksRes.json()).bank_accounts || [];
  fs.writeFileSync(path.join(OUT_DIR, 'banks-before.json'), JSON.stringify(banksBefore, null, 2));
  record('Banks before', true, `Found ${banksBefore.length} banks. Names: ${banksBefore.map((b: any) => b.name).join(', ')}`);
  const targetBank = banksBefore.find((b: any) => /dallas$/i.test(b.name)) || banksBefore[0];
  if (!targetBank) throw new Error('No banks configured — aborting');
  const targetBankInitialBalance = Number(targetBank.current_balance || 0);
  record('Target bank chosen', true, `Will use "${targetBank.name}" (id=${targetBank.id}) — initial saldo=${targetBankInitialBalance}; accounting_account_id=${targetBank.accounting_account_id || 'NULL'}`);
  if (!targetBank.accounting_account_id) {
    flag(`Bank "${targetBank.name}" has no accounting_account_id → double-entry path will fall back to single-entry only`);
  }

  // ---- STEP 1: create property via API ----
  let res = await api.post(`${API_URL}/api/properties`, {
    data: {
      address: TEST_ADDRESS,
      city: 'Houston', state: 'Texas',
      purchase_price: PURCHASE_PRICE,
      status: 'purchased',
      bedrooms: 3, bathrooms: 2, square_feet: 1200,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) { record('Create property', false, `POST /properties → ${res.status()} ${await res.text()}`); throw new Error('property failed'); }
  propertyId = (await res.json()).id;
  record('Create property', true, `propertyId=${propertyId}, address="${TEST_ADDRESS}", purchase_price=${PURCHASE_PRICE}`, await ledgerForProperty(api, propertyId));
  const ledgerAfterCreate = await ledgerForProperty(api, propertyId);
  if (ledgerAfterCreate.length === 0) {
    flag(`Property creation produced ZERO ledger rows. The $${PURCHASE_PRICE} owed to the seller is not yet recorded — only the manual /api/accounting/sync would create it.`);
  }

  // ---- STEP 2: create payment_order to pay the seller ----
  res = await api.post(`${API_URL}/api/payment-orders`, {
    data: {
      property_id: propertyId, property_address: TEST_ADDRESS,
      payee_name: 'E2E Test Seller', amount: PURCHASE_PRICE,
      method: 'transferencia',
      bank_name: 'Chase', routing_number: '111000614', account_number: '123456789',
      concept: 'compra', notes: 'E2E lifecycle test — safe to delete',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) { record('Create payment_order', false, `POST /payment-orders → ${res.status()} ${await res.text()}`); }
  else {
    const j = await res.json();
    paymentOrderId = j.data?.id || j.order?.id || j.id;
    record('Create payment_order', true, `paymentOrderId=${paymentOrderId}`);
  }
  const ledgerAfterPaymentOrder = await ledgerForProperty(api, propertyId);
  if (ledgerAfterPaymentOrder.length === ledgerAfterCreate.length) {
    record('Ledger after payment_order create', true, 'No ledger row yet (expected — requisición only writes ledger on /complete).');
  }

  // ---- STEP 3: approve & complete payment_order WITH bank assignment ----
  await api.patch(`${API_URL}/api/payment-orders/${paymentOrderId}/approve?approved_by=e2e-test`);
  res = await api.patch(`${API_URL}/api/payment-orders/${paymentOrderId}/complete`, {
    data: {
      reference: `E2E-PO-${STAMP}`,
      payment_date: new Date().toISOString().slice(0, 10),
      bank_account_id: targetBank.id,
      completed_by: 'e2e-test',
      notes: 'Lifecycle test',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) record('Complete payment_order', false, `${res.status()} ${await res.text()}`);
  else record('Complete payment_order', true, `Assigned bank_account_id=${targetBank.id} (${targetBank.name})`, await ledgerForProperty(api, propertyId));
  const ledgerAfterPOComplete = await ledgerForProperty(api, propertyId);
  const purchaseRow = ledgerAfterPOComplete.find((r: any) => r.transaction_type === 'purchase_house');
  if (!purchaseRow) flag(`No 'purchase_house' row after completing requisición — the writer is not firing on payment_order complete.`);
  else {
    if (!purchaseRow.bank_account_id) flag(`'purchase_house' row created BUT bank_account_id is NULL — the bank link is broken here.`);
    else if (purchaseRow.bank_account_id !== targetBank.id) flag(`bank_account_id on ledger row (${purchaseRow.bank_account_id}) ≠ bank assigned in requisición (${targetBank.id})`);
    if (!purchaseRow.description || purchaseRow.description.length < 5) flag(`'purchase_house' row description is empty/too short: "${purchaseRow.description}"`);
  }
  // Also check the double-entry pair
  const pair = ledgerAfterPOComplete.filter((r: any) => r.linked_transaction_id === purchaseRow?.id || r.id === purchaseRow?.linked_transaction_id);
  record('Double-entry pair check', pair.length > 0, `Found ${pair.length} pair rows linked to the purchase_house txn (expecting 1 if double-entry working, 0 if single-entry).`);

  // ---- STEP 4: add renovation quote ----
  await api.post(`${API_URL}/api/properties/${propertyId}/start-renovation`, {
    data: { property_id: propertyId, was_moved: false },
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => null);
  res = await api.post(`${API_URL}/api/renovation/${propertyId}/quote`, {
    data: {
      items: {
        pintura: { mano_obra: 2000, materiales: 1500, dias: 3, notas: 'E2E' },
        piso: { mano_obra: 1500, materiales: 2000, dias: 2, notas: 'E2E' },
      },
      custom_items: [], notes: 'E2E lifecycle test', responsable: 'E2E Test',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  record('Renovation quote', res.ok(), `Total expected: $7,000 ($3,500 + $3,500). Status ${res.status()}`, await ledgerForProperty(api, propertyId));
  const ledgerAfterReno = await ledgerForProperty(api, propertyId);
  const renoRows = ledgerAfterReno.filter((r: any) => r.transaction_type === 'renovation');
  if (renoRows.length === 0) {
    flag(`Renovation quote saved but NO 'renovation' ledger row was created. Renovations only land in the ledger via the manual /api/accounting/sync endpoint.`);
  }

  // ---- STEP 5: publish property ----
  await api.patch(`${API_URL}/api/properties/${propertyId}`, { data: { status: 'renovating' }, headers: { 'Content-Type': 'application/json' } }).catch(() => null);
  res = await api.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`);
  record('Publish property', res.ok(), `→ ${res.status()}`);

  // ---- STEP 6: create client ----
  res = await api.post(`${API_URL}/api/clients`, {
    data: { name: `E2E Lifecycle Client ${STAMP}`, email: `e2e-lc-${Date.now()}@test.com`, phone: '555-0000', terreno: 'Houston TX' },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) { record('Create client', false, `${res.status()} ${await res.text()}`); }
  else {
    clientId = (await res.json()).id;
    record('Create client', true, `clientId=${clientId}`);
  }

  // ---- STEP 7: create sale ----
  res = await api.post(`${API_URL}/api/sales`, {
    data: { property_id: propertyId, client_id: clientId, sale_price: SALE_PRICE, sale_type: 'contado' },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok()) { record('Create sale', false, `${res.status()} ${await res.text()}`); }
  else {
    saleId = (await res.json()).id;
    record('Create sale', true, `saleId=${saleId}, type=contado, price=${SALE_PRICE}`, await ledgerForProperty(api, propertyId));
  }

  // ---- STEP 8: register the down payment from the client ----
  res = await api.post(`${API_URL}/api/sales/${saleId}/payments`, {
    data: {
      payment_type: 'down_payment', amount: DOWN_PAYMENT,
      payment_method: 'zelle', payment_reference: `E2E-DP-${STAMP}`,
      notes: 'E2E down payment', reported_by: 'staff',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  record('Register down payment', res.ok(), `Amount=$${DOWN_PAYMENT}. Status ${res.status()}`, await ledgerForProperty(api, propertyId));
  const ledgerAfterDP = await ledgerForProperty(api, propertyId);
  const dpRow = ledgerAfterDP.find((r: any) => r.amount === DOWN_PAYMENT && r.is_income === true);
  if (!dpRow) flag(`Down payment $${DOWN_PAYMENT} did NOT produce an income ledger row.`);
  else if (!dpRow.bank_account_id) flag(`Down payment ledger row created but bank_account_id=NULL — system doesn't know WHICH of the 6 banks received the money.`);

  // ---- STEP 9: register remaining payment ----
  res = await api.post(`${API_URL}/api/sales/${saleId}/payments`, {
    data: {
      payment_type: 'remaining', amount: SALE_PRICE - DOWN_PAYMENT,
      payment_method: 'bank_transfer', payment_reference: `E2E-REM-${STAMP}`,
      notes: 'E2E remaining', reported_by: 'staff',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  record('Register remaining payment', res.ok(), `Amount=$${SALE_PRICE - DOWN_PAYMENT}. Status ${res.status()}`, await ledgerForProperty(api, propertyId));

  // ---- STEP 10: try to create an invoice (factura) tied to this sale ----
  res = await api.post(`${API_URL}/api/accounting/invoices`, {
    data: {
      direction: 'receivable',
      counterparty_name: `E2E Lifecycle Client ${STAMP}`,
      counterparty_type: 'client',
      property_id: propertyId, sale_id: saleId,
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: new Date().toISOString().slice(0, 10),
      total_amount: SALE_PRICE,
      line_items: [{ description: 'Venta de casa móvil', amount: SALE_PRICE }],
    },
    headers: { 'Content-Type': 'application/json' },
  });
  if (res.ok()) {
    invoiceId = (await res.json()).id || (await res.json()).invoice?.id;
    record('Issue invoice (factura)', true, `invoiceId=${invoiceId}, total=$${SALE_PRICE}`);
    // Now check ledger
    const lAfterInv = await ledgerForProperty(api, propertyId);
    const arRow = lAfterInv.find((r: any) => r.entity_type === 'invoice' && r.entity_id === invoiceId);
    if (!arRow) flag(`Invoice ${invoiceId} created in accounting_invoices but NO matching row in accounting_transactions. → This is why facturas never show up in "transacciones por conciliar".`);
  } else {
    record('Issue invoice (factura)', false, `${res.status()} ${await res.text().catch(()=>'')}`);
  }

  // ---- STEP 11: mark commission as paid (if there is one) ----
  const commRes = await api.get(`${API_URL}/api/sales/commission-payments`).catch(() => null);
  if (commRes && commRes.ok()) {
    const commData = await commRes.json();
    const allPayments = commData.payments || commData.data || commData || [];
    const payments = (Array.isArray(allPayments) ? allPayments : []).filter((p: any) => p.sale_id === saleId);
    if (payments.length > 0) {
      const cp = payments[0];
      const payRes = await api.patch(`${API_URL}/api/sales/commission-payments/${cp.id}/pay`, {
        data: { bank_account_id: targetBank.id, paid_at: new Date().toISOString(), reference: `E2E-COMM-${STAMP}` },
        headers: { 'Content-Type': 'application/json' },
      });
      record('Pay commission', payRes.ok(), `commission_payment_id=${cp.id}, bank=${targetBank.name}. Status ${payRes.status()}`, await ledgerForProperty(api, propertyId));
      const lAfterComm = await ledgerForProperty(api, propertyId);
      const commRow = lAfterComm.find((r: any) => r.transaction_type === 'commission');
      if (commRow && !commRow.bank_account_id) flag(`Commission paid but bank_account_id=NULL on the ledger row, despite assigning bank in the API call.`);
    } else {
      record('Pay commission', false, 'No commission_payments rows generated for this sale.');
    }
  } else {
    record('Pay commission', false, 'GET commission-payments failed or unauthorized.');
  }

  // ---- STEP 12: re-fetch banks and compare saldos ----
  const banksAfterRes = await api.get(`${API_URL}/api/accounting/bank-accounts`);
  const banksAfter = (await banksAfterRes.json()).bank_accounts || [];
  fs.writeFileSync(path.join(OUT_DIR, 'banks-after.json'), JSON.stringify(banksAfter, null, 2));
  const tBankAfter = banksAfter.find((b: any) => b.id === targetBank.id);
  const deltaActual = Number(tBankAfter?.current_balance || 0) - targetBankInitialBalance;
  // Expected delta from this run if everything were correct:
  //   - $25,000 out (purchase)
  //   - $12,000 in (down payment)
  //   - $36,000 in (remaining)
  //   - $1,500 out (commission)
  //   - $0 from renovation (we only quoted, didn't pay)
  //   = net +$21,500
  const deltaExpected = -PURCHASE_PRICE + SALE_PRICE - 1500;
  record('Bank saldo delta', false,
    `Target bank "${targetBank.name}" saldo changed by $${deltaActual} (expected ≈ $${deltaExpected}).\n` +
    `  Before: $${targetBankInitialBalance}\n  After:  $${tBankAfter?.current_balance}\n  Note: saldo only updates from estado de cuenta upload, not from app transactions — so $0 delta means the bank-balance pipeline is decoupled from the ledger.`);
  if (Math.abs(deltaActual) < 1) {
    flag(`Bank saldo did NOT move at all despite $${Math.abs(deltaExpected)} of activity through that bank in this run. Confirms: bank balance is not derived from the ledger.`);
  }

  // ---- STEP 13: now check the UI side ----
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  await killTour(page);
  await snap(page, '13a-accounting-resumen.png');

  // Click "Transacciones"
  await page.locator('button:has-text("Transacciones"), [role="tab"]:has-text("Transacciones")').first().click({ force: true }).catch(() => {});
  await page.waitForTimeout(2000);
  await snap(page, '13b-transacciones.png');
  // Capture rows that mention our property address
  const txRows = await page.locator('tr, li, div').evaluateAll((els, addr: string) =>
    els.map((e) => (e.textContent || '').trim().replace(/\s+/g, ' '))
       .filter((t) => t.includes(addr) || t.includes('E2E LIFECYCLE')),
  TEST_ADDRESS);
  fs.writeFileSync(path.join(OUT_DIR, 'tx-rows-matching-property.json'), JSON.stringify(txRows, null, 2));

  // Click "Por Conciliar" / Conciliación
  const conciTab = page.locator('button, [role="tab"]').filter({ hasText: /conciliaci/i }).first();
  if (await conciTab.count()) {
    await conciTab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '13c-por-conciliar.png');
    const conRows = await page.locator('tr, li, div').evaluateAll((els, addr: string) =>
      els.map((e) => (e.textContent || '').trim().replace(/\s+/g, ' '))
         .filter((t) => t.includes(addr) || t.includes('E2E LIFECYCLE')),
    TEST_ADDRESS);
    fs.writeFileSync(path.join(OUT_DIR, 'conciliar-rows-matching-property.json'), JSON.stringify(conRows, null, 2));
    if (conRows.length === 0 && txRows.length > 0) {
      flag(`Transactions for our property appear in "Transacciones" but NONE appear in "Por Conciliar".`);
    }
  }

  // Click "Facturación"
  const factTab = page.locator('button, [role="tab"]').filter({ hasText: /facturaci/i }).first();
  if (await factTab.count()) {
    await factTab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '13d-facturacion.png');
  }

  // Click "Cuentas Bancarias"
  const bankTab = page.locator('button, [role="tab"]').filter({ hasText: /cuentas bancarias/i }).first();
  if (await bankTab.count()) {
    await bankTab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '13e-cuentas-bancarias.png');
  }

  // Click "Estado de Cuenta"
  const ecTab = page.locator('button, [role="tab"]').filter({ hasText: /estado de cuenta/i }).first();
  if (await ecTab.count()) {
    await ecTab.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '13f-estado-cuenta.png');
  }

  // ---- Final report ----
  const finalLedger = await ledgerForProperty(api, propertyId);
  fs.writeFileSync(path.join(OUT_DIR, 'final-ledger.json'), JSON.stringify(finalLedger, null, 2));
  const finalSummary = {
    test_address: TEST_ADDRESS,
    property_id: propertyId,
    sale_id: saleId,
    payment_order_id: paymentOrderId,
    invoice_id: invoiceId,
    target_bank: { id: targetBank.id, name: targetBank.name, accounting_account_id: targetBank.accounting_account_id, balance_before: targetBankInitialBalance, balance_after: tBankAfter?.current_balance },
    steps: log,
    issues_observed: issues,
    ledger_final_rows: finalLedger.length,
    ledger_rows_with_bank_link: finalLedger.filter((r: any) => r.bank_account_id).length,
    ledger_rows_without_bank_link: finalLedger.filter((r: any) => !r.bank_account_id).length,
  };
  fs.writeFileSync(path.join(OUT_DIR, 'findings.json'), JSON.stringify(finalSummary, null, 2));

  console.log('\n========================= TRUTH REPORT =========================');
  console.log(`Property: ${TEST_ADDRESS}`);
  console.log(`Final ledger rows for this property: ${finalLedger.length}`);
  console.log(`  With bank_account_id: ${finalSummary.ledger_rows_with_bank_link}`);
  console.log(`  WITHOUT bank link:    ${finalSummary.ledger_rows_without_bank_link}`);
  console.log(`Bank saldo change: $${deltaActual} (expected ≈ $${deltaExpected})`);
  console.log(`\nISSUES OBSERVED (${issues.length}):`);
  for (const i of issues) console.log(`  - ${i}`);
  console.log('================================================================\n');

  expect(propertyId).toBeTruthy();
});
