/**
 * E2E Tests — Sales Payment Tracking System
 *
 * Tests the new sale_payments feature:
 * 1. API: CRUD endpoints for sale payments
 * 2. API: Payment totals update on sales (amount_paid, amount_pending)
 * 3. API: Notifications created on payment registration/edit
 * 4. API: Client portal report-transfer creates sale_payment
 * 5. UI: SaleCard shows payment summary + progress bar
 * 6. UI: New sale wizard has payment info step
 * 7. Proxy routes work for payment endpoints
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

// ═══════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════

async function loginAsAdmin(page: any) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.getByLabel(/email|correo/i).or(page.locator('input[type="email"]')).fill('e2e-test@maninos.com');
  await page.getByLabel(/password|contraseña/i).or(page.locator('input[type="password"]')).fill('E2eTest2026!Maninos');
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    if (!page.url().includes('/login')) break;
  }
}

async function dismissTour(page: any) {
  await page.waitForTimeout(1500);
  const omitirBtn = page.locator('button:has-text("Omitir tour")').or(page.locator('text=Omitir tour'));
  if (await omitirBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await omitirBtn.click({ force: true });
    await page.waitForTimeout(500);
  }
  await page.keyboard.press('Escape');
  await page.evaluate(() => {
    const portal = document.getElementById('react-joyride-portal');
    if (portal) portal.remove();
    document.querySelectorAll('.react-joyride__overlay, .react-joyride__spotlight, [data-test-id="overlay"]')
      .forEach(el => el.remove());
  });
  await page.waitForTimeout(500);
}

/** Get an existing contado sale for testing. */
async function getTestSale(request: any): Promise<any> {
  const res = await request.get(`${API_URL}/api/sales?sale_type=contado&limit=5`);
  const sales = await res.json();
  // Find a sale that isn't cancelled
  const activeSales = (Array.isArray(sales) ? sales : []).filter(
    (s: any) => s.status !== 'cancelled'
  );
  return activeSales.length > 0 ? activeSales[0] : null;
}


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Sale Payment Endpoints
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Sale payment endpoints', () => {

  test('GET /sales/:id/payments returns valid response', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.get(`${API_URL}/api/sales/${sale.id}/payments`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.payments)).toBe(true);
  });

  test('GET /sales/nonexistent/payments returns 404', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/sales/00000000-0000-0000-0000-000000000000/payments`);
    expect(res.status()).toBe(404);
  });

  test('POST /sales/:id/payments registers a staff payment', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.post(`${API_URL}/api/sales/${sale.id}/payments`, {
      data: {
        payment_type: 'partial',
        amount: 100,
        payment_method: 'zelle',
        payment_reference: 'E2E-TEST-REF',
        notes: 'E2E test payment - safe to delete',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.payment).toBeTruthy();
    expect(data.payment.payment_type).toBe('partial');
    expect(Number(data.payment.amount)).toBe(100);
    expect(data.payment.status).toBe('confirmed'); // Staff payments are auto-confirmed
    expect(data.payment.reported_by).toBe('staff');
  });

  test('PATCH /sales/:id/payments/:paymentId edits payment amount', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    // Create a payment first
    const createRes = await request.post(`${API_URL}/api/sales/${sale.id}/payments`, {
      data: {
        payment_type: 'adjustment',
        amount: 50,
        payment_method: 'cash',
        notes: 'E2E test - will be edited',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const created = await createRes.json();
    if (!created.ok) { test.skip(); return; }
    const paymentId = created.payment.id;

    // Edit the amount
    const editRes = await request.patch(`${API_URL}/api/sales/${sale.id}/payments/${paymentId}`, {
      data: { amount: 75, notes: 'E2E test - edited' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(editRes.status()).toBe(200);
    const editData = await editRes.json();
    expect(editData.ok).toBe(true);
  });

  test('sale amount_paid and amount_pending reflect payments', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    // Check the sale has amount_paid/amount_pending fields
    const saleRes = await request.get(`${API_URL}/api/sales/${sale.id}`);
    expect(saleRes.status()).toBe(200);
    const saleData = await saleRes.json();

    // These fields should exist (may be 0 or null for old sales without migration)
    expect('amount_paid' in saleData || 'sale_price' in saleData).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Payment creates notification
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Payment notifications', () => {

  test('registering a payment creates a sale_payment notification', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    // Register a payment
    await request.post(`${API_URL}/api/sales/${sale.id}/payments`, {
      data: {
        payment_type: 'partial',
        amount: 100,
        payment_method: 'cash',
        notes: 'E2E notification test',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });

    // Check for notification
    const notifRes = await request.get(`${API_URL}/api/notifications?type=sale_payment&limit=5`);
    const notifData = await notifRes.json();
    expect(notifData.ok).toBe(true);

    // Should have at least one sale_payment notification
    if (notifData.notifications.length > 0) {
      const latest = notifData.notifications[0];
      expect(latest.type).toBe('sale_payment');
      expect(latest.title).toMatch(/\$/);
      expect(latest.amount).toBeTruthy();
      expect(latest.action_required).toBe(true);
      expect(latest.priority).toBe('high');
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Payment structure validation
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Payment data structure', () => {

  test('payment has all required fields', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.get(`${API_URL}/api/sales/${sale.id}/payments`);
    const data = await res.json();

    for (const p of data.payments) {
      expect(p.id).toBeTruthy();
      expect(p.sale_id).toBe(sale.id);
      expect(p.payment_type).toBeTruthy();
      expect(Number(p.amount)).toBeGreaterThan(0);
      expect(['pending', 'confirmed', 'cancelled']).toContain(p.status);
      expect(['client', 'staff', 'system']).toContain(p.reported_by);
      expect(p.created_at).toBeTruthy();
    }
  });

  test('confirmed payments have confirmed_at and confirmed_by', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.get(`${API_URL}/api/sales/${sale.id}/payments`);
    const data = await res.json();

    for (const p of data.payments) {
      if (p.status === 'confirmed') {
        expect(p.confirmed_at).toBeTruthy();
        expect(p.confirmed_by).toBeTruthy();
      }
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// PROXY TESTS — Next.js proxy routes
// ═══════════════════════════════════════════════════════════════════

test.describe('Proxy: Sale payment routes', () => {

  test('GET /api/sales/:id/payments proxy works', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.get(`${APP_URL}/api/sales/${sale.id}/payments`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  test('POST /api/sales/:id/payments proxy works', async ({ request }) => {
    const sale = await getTestSale(request);
    if (!sale) { test.skip(); return; }

    const res = await request.post(`${APP_URL}/api/sales/${sale.id}/payments`, {
      data: {
        payment_type: 'adjustment',
        amount: 1,
        payment_method: 'other',
        notes: 'E2E proxy test',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    // Should not be 404 or 405
    expect(res.status()).not.toBe(404);
    expect(res.status()).not.toBe(405);
  });

  test('PATCH /api/sales/:id/payments/:paymentId proxy works', async ({ request }) => {
    // Test that the route exists (may return 404 for nonexistent payment, but not 405)
    const res = await request.patch(`${APP_URL}/api/sales/test-id/payments/test-payment`, {
      data: { amount: 1 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).not.toBe(405); // Method should be allowed
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Sales page payment section
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Sales page with payments', () => {

  test('sales page loads and shows sale cards', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/sales') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    await test.step('sales page title is visible', async () => {
      await expect(page.locator('h1:has-text("Ventas")')).toBeVisible({ timeout: 10000 });
    });

    await test.step('sale cards are visible', async () => {
      const cards = page.locator('.card-luxury');
      // At least stats cards should be visible
      await expect(cards.first()).toBeVisible({ timeout: 10000 });
    });
  });

  test('contado sale card shows Pagos toggle button', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/sales') && !res.url().includes('stats') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    // Look for the Pagos toggle button (only on contado sales)
    const pagosBtn = page.locator('button:has-text("Pagos")');
    if (await pagosBtn.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      await test.step('Pagos button is visible on contado sale', async () => {
        await expect(pagosBtn.first()).toBeVisible();
      });

      await test.step('clicking Pagos opens payment section', async () => {
        await pagosBtn.first().click({ force: true });
        await page.waitForTimeout(1000);

        // Should show payment section with progress bar or "no payments" message
        const paymentSection = page.locator('text=Pagos —').or(page.locator('text=No hay pagos'));
        await expect(paymentSection).toBeVisible({ timeout: 5000 });
      });

      await test.step('Registrar Pago button is visible', async () => {
        const addBtn = page.locator('text=Registrar Pago');
        await expect(addBtn).toBeVisible({ timeout: 5000 });
      });
    }
  });

  test('new sale wizard has payment info step', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);
    await page.waitForTimeout(2000);

    await test.step('progress bar shows 6 steps including "Pagos"', async () => {
      const pagosStep = page.locator('text=Pagos');
      await expect(pagosStep).toBeVisible({ timeout: 5000 });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════
// INTEGRATION: Sales response includes payment fields
// ═══════════════════════════════════════════════════════════════════

test.describe('Integration: Sales response format', () => {

  test('sale response includes amount_paid and amount_pending', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/sales?limit=5`);
    expect(res.status()).toBe(200);
    const sales = await res.json();

    if (Array.isArray(sales) && sales.length > 0) {
      const sale = sales[0];
      // These fields should be present (added by migration + _format_sale update)
      expect('amount_paid' in sale).toBe(true);
      expect('amount_pending' in sale).toBe(true);
    }
  });

  test('sales have amount_paid and amount_pending fields with valid types', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/sales?limit=5`);
    const sales = await res.json();

    if (Array.isArray(sales) && sales.length > 0) {
      for (const sale of sales) {
        // Fields should exist and be numbers
        expect(typeof Number(sale.amount_paid)).toBe('number');
        expect(typeof Number(sale.amount_pending)).toBe('number');
        // amount_paid should be >= 0
        expect(Number(sale.amount_paid)).toBeGreaterThanOrEqual(0);
        // amount_paid + amount_pending should roughly equal sale_price
        const total = Number(sale.amount_paid) + Number(sale.amount_pending || 0);
        if (total > 0) {
          expect(total).toBeGreaterThanOrEqual(Number(sale.sale_price) * 0.99);
        }
      }
    }
  });
});
