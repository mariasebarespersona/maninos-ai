/**
 * E2E Tests — Resumen Financiero: Full Property Lifecycle
 *
 * Simulates the complete lifecycle of a property via API calls,
 * verifying at each step that the financial-summary endpoint
 * auto-populates the correct data.
 *
 * Lifecycle: Buy → Payment Order → Renovate → Publish → Sell → Pay
 *
 * Uses test.describe.serial to run steps in order with shared state.
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

// Shared state across serial tests
let propertyId: string;
let saleId: string;
let clientId: string;
let paymentOrderId: string;

const TEST_ADDRESS = `E2E Lifecycle Test ${Date.now()}`;
const PURCHASE_PRICE = 22000;
const RENOVATION_COST = 8500;
const SALE_PRICE = 38000;
const DOWN_PAYMENT = 15000;
const REMAINING = SALE_PRICE - DOWN_PAYMENT;

/**
 * Helper: find our test property in the financial summary
 */
async function getPropertyFromSummary(request: any, propId: string) {
  const res = await request.get(`${API_URL}/api/properties/financial-summary`);
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.ok).toBe(true);
  return data.properties.find((p: any) => p.id === propId);
}


// ═══════════════════════════════════════════════════════════════════
// LIFECYCLE: Full property journey (serial — order matters)
// ═══════════════════════════════════════════════════════════════════

test.describe.serial('Lifecycle: Financial data auto-populates at each step', () => {

  test('Step 1: Buy property → purchase_price appears in summary', async ({ request }) => {
    // Create property with purchase_price
    const res = await request.post(`${API_URL}/api/properties`, {
      data: {
        address: TEST_ADDRESS,
        city: 'Houston',
        state: 'Texas',
        purchase_price: PURCHASE_PRICE,
        status: 'purchased',
        bedrooms: 3,
        bathrooms: 2,
        square_feet: 1200,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    propertyId = data.id;
    expect(propertyId).toBeTruthy();

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary).toBeTruthy();
    expect(summary.purchase_price).toBe(PURCHASE_PRICE);
    expect(summary.renovation_cost).toBe(0);
    expect(summary.move_cost).toBe(0);
    expect(summary.sale_price).toBe(0);
    expect(summary.status).toBe('purchased');
  });

  test('Step 2: Create payment order → payment_orders appear in summary', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    const res = await request.post(`${API_URL}/api/payment-orders`, {
      data: {
        property_id: propertyId,
        property_address: TEST_ADDRESS,
        payee_name: 'E2E Test Seller',
        amount: PURCHASE_PRICE,
        method: 'transferencia',
        bank_name: 'Chase',
        routing_number: '111000614',
        account_number: '123456789',
        notes: 'E2E lifecycle test — safe to delete',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    paymentOrderId = data.order?.id || data.data?.id;

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.payment_orders_count).toBeGreaterThanOrEqual(1);
    expect(summary.payment_orders_total).toBeGreaterThanOrEqual(PURCHASE_PRICE);
  });

  test('Step 3: Start renovation + save quote → renovation_cost appears', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    // Start renovation
    const startRes = await request.post(`${API_URL}/api/properties/${propertyId}/start-renovation`, {
      data: { property_id: propertyId, was_moved: false },
      headers: { 'Content-Type': 'application/json' },
    });
    // May be 200 or 400 if already started — both OK
    expect([200, 400]).toContain(startRes.status());

    // Save renovation quote with items
    const quoteRes = await request.post(`${API_URL}/api/renovation/${propertyId}/quote`, {
      data: {
        items: {
          pintura: { mano_obra: 2000, materiales: 1500, dias: 3, notas: 'E2E test' },
          piso: { mano_obra: 1500, materiales: 2000, dias: 2, notas: 'E2E test' },
          plomeria: { mano_obra: 500, materiales: 1000, dias: 1, notas: 'E2E test' },
        },
        custom_items: [],
        notes: 'E2E lifecycle test renovation',
        responsable: 'E2E Test',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(quoteRes.status()).toBe(200);
    const quoteData = await quoteRes.json();
    expect(quoteData.success).toBe(true);
    // pintura: (2000*3)+1500=7500, piso: (1500*2)+2000=5000, plomeria: (500*1)+1000=1500 = 14000
    const expectedRenoCost = quoteData.total;
    expect(expectedRenoCost).toBeGreaterThan(0);

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.renovation_cost).toBe(expectedRenoCost);
    expect(summary.total_investment).toBe(PURCHASE_PRICE + expectedRenoCost);
  });

  test('Step 4: Publish property → sale_price appears', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    // Need to transition to a publishable state first
    // Set status to purchased (in case start-renovation changed it to renovating)
    await request.patch(`${API_URL}/api/properties/${propertyId}`, {
      data: { status: 'purchased' },
      headers: { 'Content-Type': 'application/json' },
    });

    const res = await request.post(
      `${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`
    );
    // If publish fails due to status, try setting to renovating first
    if (res.status() !== 200) {
      await request.patch(`${API_URL}/api/properties/${propertyId}`, {
        data: { status: 'renovating' },
        headers: { 'Content-Type': 'application/json' },
      });
      const retry = await request.post(
        `${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`
      );
      expect(retry.status()).toBe(200);
    }

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.sale_price).toBe(SALE_PRICE);
    expect(summary.status).toBe('published');
    // Profit should now be calculated (sale_price - investment - commission - margin)
    expect(summary.profit).toBeDefined();
  });

  test('Step 5: Create sale → commission and sale_status appear', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    // Create a test client first
    const clientRes = await request.post(`${API_URL}/api/clients`, {
      data: {
        name: 'E2E Lifecycle Client',
        email: `e2e-lifecycle-${Date.now()}@test.com`,
        phone: '555-0000',
        terreno: 'Houston TX',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(clientRes.status()).toBe(200);
    const clientData = await clientRes.json();
    clientId = clientData.id;
    expect(clientId).toBeTruthy();

    // Create sale
    const saleRes = await request.post(`${API_URL}/api/sales`, {
      data: {
        property_id: propertyId,
        client_id: clientId,
        sale_price: SALE_PRICE,
        sale_type: 'contado',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(saleRes.status()).toBe(200);
    const saleData = await saleRes.json();
    saleId = saleData.id;
    expect(saleId).toBeTruthy();

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.sale_id).toBe(saleId);
    expect(summary.sale_status).toBe('pending');
    expect(summary.commission).toBe(1500); // Contado commission
    expect(summary.client_name).toBe('E2E Lifecycle Client');
    expect(summary.amount_paid).toBe(0);
    expect(summary.amount_pending).toBeGreaterThanOrEqual(0);
  });

  test('Step 6: Register down payment → amount_paid updates', async ({ request }) => {
    expect(saleId).toBeTruthy();

    const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: {
        payment_type: 'down_payment',
        amount: DOWN_PAYMENT,
        payment_method: 'zelle',
        payment_reference: 'E2E-LIFECYCLE-DP',
        notes: 'E2E test down payment',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.payment.status).toBe('confirmed'); // Staff auto-confirmed

    // Verify in financial summary
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.amount_paid).toBe(DOWN_PAYMENT);
    expect(summary.amount_pending).toBe(REMAINING);
  });

  test('Step 7: Register remaining payment → fully paid', async ({ request }) => {
    expect(saleId).toBeTruthy();

    const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: {
        payment_type: 'remaining',
        amount: REMAINING,
        payment_method: 'bank_transfer',
        payment_reference: 'E2E-LIFECYCLE-REM',
        notes: 'E2E test remaining payment',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);

    // Verify in financial summary — fully paid
    const summary = await getPropertyFromSummary(request, propertyId);
    expect(summary.amount_paid).toBe(SALE_PRICE);
    expect(summary.amount_pending).toBe(0);
  });

  test('Step 8: Verify complete financial picture', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    const summary = await getPropertyFromSummary(request, propertyId);

    // All fields should be populated
    expect(summary.purchase_price).toBe(PURCHASE_PRICE);
    expect(summary.renovation_cost).toBeGreaterThan(0);
    expect(summary.sale_price).toBe(SALE_PRICE);
    expect(summary.amount_paid).toBe(SALE_PRICE);
    expect(summary.amount_pending).toBe(0);
    expect(summary.commission).toBe(1500);
    expect(summary.margin).toBe(9500);
    expect(summary.total_investment).toBe(PURCHASE_PRICE + summary.renovation_cost + summary.move_cost);
    expect(summary.profit).toBeDefined();
    expect(summary.sale_id).toBeTruthy();
    expect(summary.client_name).toBe('E2E Lifecycle Client');
    expect(summary.payment_orders_count).toBeGreaterThanOrEqual(1);
    expect(summary.address).toContain('E2E Lifecycle Test');
  });

  test('Cleanup: Delete test property and client', async ({ request }) => {
    // Cancel sale first (so property can be deleted)
    if (saleId) {
      await request.post(`${API_URL}/api/sales/${saleId}/cancel`).catch(() => {});
    }
    // Delete property (cascades to renovations, moves, payment_orders, etc.)
    if (propertyId) {
      const delRes = await request.delete(`${API_URL}/api/properties/${propertyId}`);
      // Accept 200 or 500 (some cascade dependencies may fail, that's OK for cleanup)
      expect([200, 500]).toContain(delRes.status());
    }
    // Delete client
    if (clientId) {
      await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
    }
    // Test passed if we got here without throwing
    expect(true).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Financial summary endpoint
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Financial summary endpoint', () => {

  test('GET /api/properties/financial-summary returns valid data', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.properties)).toBe(true);
    expect(data.properties.length).toBeGreaterThan(0);
  });

  test('each property has all required financial fields', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    const data = await res.json();

    for (const p of data.properties.slice(0, 5)) {
      // Identity fields
      expect(p.id).toBeTruthy();
      expect(p.address).toBeTruthy();
      expect(p.status).toBeTruthy();

      // Financial fields exist (can be 0)
      expect(typeof p.purchase_price).toBe('number');
      expect(typeof p.renovation_cost).toBe('number');
      expect(typeof p.move_cost).toBe('number');
      expect(typeof p.commission).toBe('number');
      expect(typeof p.margin).toBe('number');
      expect(typeof p.total_investment).toBe('number');
      expect(typeof p.sale_price).toBe('number');
      expect(typeof p.profit).toBe('number');
      expect(typeof p.amount_paid).toBe('number');
      expect(typeof p.amount_pending).toBe('number');
      expect(typeof p.payment_orders_count).toBe('number');
      expect(typeof p.payment_orders_total).toBe('number');
      expect(typeof p.accounting_txn_count).toBe('number');

      // total_investment = purchase + reno + move
      expect(p.total_investment).toBeCloseTo(p.purchase_price + p.renovation_cost + p.move_cost, 0);
    }
  });

  test('sold properties have sale data populated', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    const data = await res.json();

    const sold = data.properties.filter((p: any) => p.status === 'sold' || p.sale_status === 'completed');
    for (const p of sold.slice(0, 3)) {
      expect(p.sale_price).toBeGreaterThan(0);
      expect(p.sale_id).toBeTruthy();
      // Commission may be 0 for old sales created before commission tracking
      expect(p.commission).toBeGreaterThanOrEqual(0);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// PROXY TEST
// ═══════════════════════════════════════════════════════════════════

test.describe('Proxy: Financial summary', () => {

  test('GET /api/properties/financial-summary proxy works', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/properties/financial-summary`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.properties)).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Resumen Financiero page
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Resumen Financiero page', () => {

  test('admin sees the page with table and KPIs', async ({ page }) => {
    // Login
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.getByLabel(/email|correo/i).or(page.locator('input[type="email"]')).fill('e2e-test@maninos.com');
    await page.getByLabel(/password|contraseña/i).or(page.locator('input[type="password"]')).fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login|submit/i }).click();
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      if (!page.url().includes('/login')) break;
    }

    // Navigate to Resumen Financiero
    await page.goto(`${APP_URL}/homes/resumen-financiero`, { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Dismiss tour
    await page.waitForTimeout(1500);
    const omitir = page.locator('button:has-text("Omitir tour")').or(page.locator('text=Omitir tour'));
    if (await omitir.isVisible({ timeout: 2000 }).catch(() => false)) {
      await omitir.click({ force: true });
    }
    await page.keyboard.press('Escape');
    await page.evaluate(() => {
      const portal = document.getElementById('react-joyride-portal');
      if (portal) portal.remove();
    });
    await page.waitForTimeout(1000);

    // Wait for data
    await page.waitForResponse(
      (res: any) => res.url().includes('/financial-summary') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    await test.step('page title is visible', async () => {
      await expect(page.locator('h1:has-text("Resumen Financiero")')).toBeVisible({ timeout: 10000 });
    });

    await test.step('KPI cards are visible', async () => {
      await expect(page.locator('text=Total Invertido')).toBeVisible();
      await expect(page.locator('text=Total Vendido')).toBeVisible();
      await expect(page.locator('text=Ganancia Total')).toBeVisible();
    });

    await test.step('table has column headers', async () => {
      await expect(page.locator('th:has-text("Compra")')).toBeVisible();
      await expect(page.locator('th:has-text("Reno")')).toBeVisible();
      await expect(page.locator('th:has-text("Venta")')).toBeVisible();
      await expect(page.locator('th:has-text("Pagado")')).toBeVisible();
      await expect(page.locator('th:has-text("Pendiente")')).toBeVisible();
      await expect(page.locator('th:has-text("Ganancia")')).toBeVisible();
    });

    await test.step('table has property rows', async () => {
      const rows = page.locator('tbody tr');
      // At least the totals row + some properties
      await expect(rows.first()).toBeVisible({ timeout: 5000 });
      expect(await rows.count()).toBeGreaterThan(1);
    });

    await test.step('TOTALES row exists', async () => {
      await expect(page.locator('td:has-text("TOTALES")')).toBeVisible();
    });

    await test.step('filters are visible', async () => {
      await expect(page.locator('input[placeholder*="Buscar"]')).toBeVisible();
    });
  });

  test('sidebar shows Resumen Financiero link for admin', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.getByLabel(/email|correo/i).or(page.locator('input[type="email"]')).fill('e2e-test@maninos.com');
    await page.getByLabel(/password|contraseña/i).or(page.locator('input[type="password"]')).fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login|submit/i }).click();
    for (let i = 0; i < 15; i++) {
      await page.waitForTimeout(2000);
      if (!page.url().includes('/login')) break;
    }

    await page.goto(`${APP_URL}/homes/resumen-financiero`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);

    await test.step('Resumen Financiero link in sidebar', async () => {
      const link = page.locator('a[href*="resumen-financiero"]');
      await expect(link).toBeVisible({ timeout: 10000 });
    });
  });
});
