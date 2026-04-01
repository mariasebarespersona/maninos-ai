/**
 * E2E Tests — Manual Sale + Payment → Notifications + Resumen Financiero
 *
 * Flow:
 * 1. Create property → publish
 * 2. Create manual sale (NO notification triggered)
 * 3. Register payment (enganche) → notification in "Pendientes de Acción"
 * 4. Register remaining payment → notification with progress
 * 5. Verify Resumen Financiero shows full payment progress
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

let propertyId: string;
let clientId: string;
let saleId: string;
const TEST_TS = Date.now();
const SALE_PRICE = 50000;
const DOWN_PAYMENT = 5000;

test.describe('Sale payment flow: sale → payment → notification → resumen financiero', () => {

  test('Setup: create property + client + sale', async ({ request }) => {
    // Create property
    const propRes = await request.post(`${API_URL}/api/properties`, {
      data: { address: `E2E Payment Notif ${TEST_TS}`, city: 'Houston', state: 'Texas', purchase_price: 25000, status: 'purchased', bedrooms: 3, bathrooms: 2 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(propRes.status()).toBe(200);
    propertyId = (await propRes.json()).id;

    // Publish
    await request.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`);

    // Create client
    const clientRes = await request.post(`${API_URL}/api/clients`, {
      data: { name: `E2E Buyer ${TEST_TS}`, email: `e2e-buyer-${TEST_TS}@test.com`, phone: '555-9999' },
      headers: { 'Content-Type': 'application/json' },
    });
    clientId = (await clientRes.json()).id;

    // Create sale — should NOT trigger notification
    const saleRes = await request.post(`${API_URL}/api/sales`, {
      data: { property_id: propertyId, client_id: clientId, sale_price: SALE_PRICE, sale_type: 'contado' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(saleRes.status()).toBe(200);
    saleId = (await saleRes.json()).id;
  });

  test('Sale creation does NOT trigger notification', async ({ request }) => {
    expect(saleId).toBeTruthy();

    // Check no sale-type notification for this sale
    const res = await request.get(`${API_URL}/api/notifications?type=sale&limit=5`);
    const data = await res.json();
    const match = data.notifications.find((n: any) => n.related_entity_id === saleId);
    // Should NOT exist (we removed notify_new_sale from create_sale)
    expect(match).toBeUndefined();
  });

  test('Register down payment → notification with payment progress', async ({ request }) => {
    expect(saleId).toBeTruthy();

    const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: {
        payment_type: 'down_payment',
        amount: DOWN_PAYMENT,
        payment_method: 'zelle',
        notes: 'Enganche via Zelle',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Check notification was created
    const notifRes = await request.get(`${API_URL}/api/notifications?type=sale_payment&limit=5`);
    const notifs = (await notifRes.json()).notifications;
    const paymentNotif = notifs.find((n: any) =>
      n.related_entity_id === saleId && n.title.includes(`${DOWN_PAYMENT.toLocaleString()}`)
    );

    expect(paymentNotif).toBeTruthy();
    expect(paymentNotif.action_required).toBe(true);
    expect(paymentNotif.action_type).toBe('confirm');
    expect(paymentNotif.priority).toBe('high');
    // Should include property address
    expect(paymentNotif.property_address).toBeTruthy();
    // Message should include payment progress
    expect(paymentNotif.message).toMatch(/Pagado.*falta|Enganche/);
  });

  test('Register remaining payment → notification shows fully paid', async ({ request }) => {
    expect(saleId).toBeTruthy();
    const remaining = SALE_PRICE - DOWN_PAYMENT;

    const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: {
        payment_type: 'remaining',
        amount: remaining,
        payment_method: 'bank_transfer',
        notes: 'Saldo restante',
        reported_by: 'staff',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);

    // Check notification
    const notifRes = await request.get(`${API_URL}/api/notifications?type=sale_payment&limit=5`);
    const notifs = (await notifRes.json()).notifications;
    const remainNotif = notifs.find((n: any) =>
      n.related_entity_id === saleId && n.title.includes('Saldo restante')
    );
    expect(remainNotif).toBeTruthy();
  });

  test('Resumen Financiero shows payment progress', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    const data = await res.json();
    const prop = data.properties.find((p: any) => p.id === propertyId);

    expect(prop).toBeTruthy();
    expect(prop.amount_paid).toBe(SALE_PRICE); // Fully paid
    expect(prop.amount_pending).toBe(0);
    expect(prop.sale_price).toBe(SALE_PRICE);
    expect(prop.client_name).toContain('E2E Buyer');
  });

  test('Financial detail has full payment history', async ({ request }) => {
    expect(propertyId).toBeTruthy();

    const res = await request.get(`${API_URL}/api/properties/${propertyId}/financial-detail`);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Should have 2 payments (down + remaining)
    expect(data.payments.length).toBe(2);

    const dp = data.payments.find((p: any) => p.payment_type === 'down_payment');
    const rem = data.payments.find((p: any) => p.payment_type === 'remaining');
    expect(dp).toBeTruthy();
    expect(Number(dp.amount)).toBe(DOWN_PAYMENT);
    expect(rem).toBeTruthy();
    expect(Number(rem.amount)).toBe(SALE_PRICE - DOWN_PAYMENT);
  });

  test('Cleanup', async ({ request }) => {
    if (saleId) await request.post(`${API_URL}/api/sales/${saleId}/cancel`).catch(() => {});
    if (propertyId) await request.delete(`${API_URL}/api/properties/${propertyId}`).catch(() => {});
    if (clientId) await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI: Pendientes de Acción shows payment notifications
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Notifications page layout', () => {

  test('page has Pendientes de Accion and Actividad Reciente sections', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); });

    await page.waitForResponse(r => r.url().includes('/api/notifications') && r.status() === 200, { timeout: 15000 }).catch(() => null);
    await page.waitForTimeout(2000);

    // "Pendientes de Acción" should be visible if there are action-required notifications
    const pendientes = page.locator('text=Pendientes de Acción');
    if (await pendientes.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendientes).toBeVisible();
      // Red badge with count
      await expect(page.locator('.bg-red-100.text-red-700').first()).toBeVisible();
    }

    // "Actividad Reciente" should always be visible
    await expect(page.locator('text=Actividad Reciente')).toBeVisible({ timeout: 5000 });

    await page.screenshot({ path: 'test-results/notif-pendientes-actividad.png', fullPage: false });
  });
});
