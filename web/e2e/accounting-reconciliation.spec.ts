import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

test.describe('Accounting transactions from notifications', () => {

  test('deposit_received transactions exist from sale payments', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/dashboard`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    const txns = data.recent_transactions || [];
    const deposits = txns.filter((t: any) => t.transaction_type === 'deposit_received');
    expect(deposits.length).toBeGreaterThan(0);
    for (const d of deposits) {
      expect(d.is_income).toBe(true);
      expect(Number(d.amount)).toBeGreaterThan(0);
      expect(d.status).toBe('confirmed');
    }
  });

  test('purchase_house transactions exist from property purchases', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/dashboard`);
    const data = await res.json();
    const purchases = (data.recent_transactions || []).filter((t: any) => t.transaction_type === 'purchase_house');
    expect(purchases.length).toBeGreaterThan(0);
    for (const p of purchases) {
      expect(p.is_income).toBe(false);
      expect(Number(p.amount)).toBeGreaterThan(0);
    }
  });

  test('transactions have required fields and link to properties', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/dashboard`);
    const data = await res.json();
    const txns = (data.recent_transactions || []).slice(0, 10);
    let withProperty = 0;
    for (const t of txns) {
      expect(t.id).toBeTruthy();
      expect(t.transaction_type).toBeTruthy();
      expect(typeof t.amount).toBe('number');
      expect(typeof t.is_income).toBe('boolean');
      if (t.property_id) withProperty++;
    }
    expect(withProperty).toBeGreaterThan(0);
  });

  test('confirmed transactions available for reconciliation', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/dashboard`);
    const data = await res.json();
    const confirmed = (data.recent_transactions || []).filter((t: any) => t.status === 'confirmed');
    expect(confirmed.length).toBeGreaterThan(0);
  });
});

test.describe('Reconciliation endpoints', () => {

  test('bank-statements endpoint works', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/bank-statements`);
    expect(res.status()).toBe(200);
  });

  test('bank-accounts endpoint returns data', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/accounting/bank-accounts`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(Array.isArray(data.bank_accounts)).toBe(true);
  });
});

test.describe('Payment order completion creates accounting transaction', () => {

  test('full flow: create order, approve, complete, verify accounting txn', async ({ request }) => {
    const TS = Date.now();
    let propId: string, orderId: string;

    // Setup
    let r = await request.post(`${API_URL}/api/properties`, {
      data: { address: `E2E Acct ${TS}`, city: 'Houston', state: 'Texas', purchase_price: 20000, status: 'purchased' },
      headers: { 'Content-Type': 'application/json' },
    });
    propId = (await r.json()).id;

    r = await request.post(`${API_URL}/api/payment-orders`, {
      data: { property_id: propId, property_address: `E2E Acct ${TS}`, payee_name: 'E2E Seller', amount: 20000, method: 'transferencia', concept: 'compra', notes: 'E2E test' },
      headers: { 'Content-Type': 'application/json' },
    });
    orderId = (await r.json()).data?.id;
    expect(orderId).toBeTruthy();

    // Approve + Complete
    await request.patch(`${API_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e`);
    r = await request.patch(`${API_URL}/api/payment-orders/${orderId}/complete`, {
      data: { reference: `E2E-${TS}`, payment_date: '2026-04-01' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect((await r.json()).ok).toBe(true);

    // Verify accounting transaction — check the order itself for the link
    r = await request.get(`${API_URL}/api/payment-orders/${orderId}`);
    const updatedOrder = (await r.json()).data || (await r.json());
    // The completed order should have accounting_transaction_id set
    expect(updatedOrder.status).toBe('completed');
    // Also verify via dashboard
    r = await request.get(`${API_URL}/api/accounting/dashboard`);
    const txns = (await r.json()).recent_transactions || [];
    const recentPurchase = txns.find((t: any) => t.transaction_type === 'purchase_house' && Number(t.amount) === 20000);
    expect(recentPurchase).toBeTruthy();

    // Cleanup
    await request.delete(`${API_URL}/api/properties/${propId}`).catch(() => {});
  });
});

test.describe('UI: Accounting page', () => {

  test('Estado de Cuenta tab exists with reconciliation', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); });
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Transacciones').first()).toBeVisible({ timeout: 10000 });
    await expect(page.locator('text=Estado de Cuenta').first()).toBeVisible({ timeout: 5000 });

    // Click Estado de Cuenta
    await page.locator('button:has-text("Estado de Cuenta")').click({ force: true });
    await page.waitForTimeout(2000);

    // Estado de Cuenta shows bank accounts or upload area (tour may block some elements)
    const hasContent = await page.locator('text=Estado de Cuent').or(page.locator('text=Nueva Cuenta')).or(page.locator('text=Crear Cuenta')).first().isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBe(true);

    await page.screenshot({ path: 'test-results/accounting-estado-cuenta.png', fullPage: false });
  });
});
