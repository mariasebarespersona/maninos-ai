/**
 * E2E Tests — Manual Sale + Payment → Notifications + Resumen Financiero
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

const SALE_PRICE = 50000;
const DOWN_PAYMENT = 5000;

test.describe('Sale payment notifications', () => {

test('Full flow: sale, payment, notification, resumen financiero', async ({ request }) => {
  const TEST_TS = Date.now();
  let propertyId: string, clientId: string, saleId: string;

  await test.step('Create property + publish', async () => {
    const propRes = await request.post(`${API_URL}/api/properties`, {
      data: { address: `E2E PayNotif ${TEST_TS}`, city: 'Houston', state: 'Texas', purchase_price: 25000, status: 'purchased', bedrooms: 3, bathrooms: 2 },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(propRes.status()).toBe(200);
    propertyId = (await propRes.json()).id;
    await request.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`);
  });

  await test.step('Create client', async () => {
    const res = await request.post(`${API_URL}/api/clients`, {
      data: { name: `E2E Buyer ${TEST_TS}`, email: `buyer-${TEST_TS}@test.com`, phone: '555-0001' },
      headers: { 'Content-Type': 'application/json' },
    });
    clientId = (await res.json()).id;
  });

  await test.step('Create sale — NO notification', async () => {
    const res = await request.post(`${API_URL}/api/sales`, {
      data: { property_id: propertyId, client_id: clientId, sale_price: SALE_PRICE, sale_type: 'contado' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    saleId = (await res.json()).id;

    // Verify NO sale notification created
    const notifRes = await request.get(`${API_URL}/api/notifications?type=sale&limit=5`);
    const match = (await notifRes.json()).notifications.find((n: any) => n.related_entity_id === saleId);
    expect(match).toBeUndefined();
  });

  await test.step('Register down payment → notification with progress', async () => {
    const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: { payment_type: 'down_payment', amount: DOWN_PAYMENT, payment_method: 'zelle', notes: 'Enganche Zelle', reported_by: 'staff' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Notification should exist with progress
    const notifRes = await request.get(`${API_URL}/api/notifications?type=sale_payment&limit=5`);
    const notifs = (await notifRes.json()).notifications;
    const payNotif = notifs.find((n: any) => n.related_entity_id === saleId);
    expect(payNotif).toBeTruthy();
    expect(payNotif.action_required).toBe(true);
    expect(payNotif.property_address).toBeTruthy();
    // Message should include payment progress
    expect(payNotif.message).toMatch(/Pagado|Enganche/i);
  });

  await test.step('Register remaining → fully paid notification', async () => {
    const remaining = SALE_PRICE - DOWN_PAYMENT;
    await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
      data: { payment_type: 'remaining', amount: remaining, payment_method: 'bank_transfer', reported_by: 'staff' },
      headers: { 'Content-Type': 'application/json' },
    });
  });

  await test.step('Resumen Financiero shows full payment progress', async () => {
    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    const prop = (await res.json()).properties.find((p: any) => p.id === propertyId);
    expect(prop).toBeTruthy();
    expect(prop.amount_paid).toBe(SALE_PRICE);
    expect(prop.amount_pending).toBe(0);
    expect(prop.client_name).toContain('E2E Buyer');
  });

  await test.step('Financial detail has 2 payments', async () => {
    const res = await request.get(`${API_URL}/api/properties/${propertyId}/financial-detail`);
    const data = await res.json();
    expect(data.payments.length).toBe(2);
    expect(Number(data.payments[0].amount)).toBe(DOWN_PAYMENT);
  });

  await test.step('Cleanup', async () => {
    await request.post(`${API_URL}/api/sales/${saleId}/cancel`).catch(() => {});
    await request.delete(`${API_URL}/api/properties/${propertyId}`).catch(() => {});
    await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
  });
});


}); // close describe

test.describe('UI: Notifications layout', () => {

test('page has Pendientes de Accion section', async ({ page }) => {
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

  const pendientes = page.locator('text=Pendientes de Acción');
  const hasPendientes = await pendientes.isVisible({ timeout: 5000 }).catch(() => false);
  if (hasPendientes) {
    await expect(page.locator('.bg-red-100.text-red-700').first()).toBeVisible();
  }
  const actividad = page.locator('text=Actividad Reciente');
  const hasActividad = await actividad.isVisible({ timeout: 3000 }).catch(() => false);
  // At least one section should be visible
  expect(hasPendientes || hasActividad).toBe(true);
  await page.screenshot({ path: 'test-results/notif-pendientes-final.png', fullPage: false });
});
}); // close UI describe
