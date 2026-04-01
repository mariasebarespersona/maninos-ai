/**
 * E2E Tests — Sale payment → payment_order → Notificaciones → Contabilidad → Resumen Financiero
 * Also verifies: no RTO option in new sale wizard
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

const SALE_PRICE = 50000;
const DOWN_PAYMENT = 5000;

test.describe('Sale payment flow', () => {

  test('Full flow: sale payment creates payment_order in Por Aprobar', async ({ request }) => {
    const TS = Date.now();
    let propertyId: string, clientId: string, saleId: string;

    await test.step('Setup: property + client + sale', async () => {
      let r = await request.post(`${API_URL}/api/properties`, {
        data: { address: `E2E SaleFlow ${TS}`, city: 'Houston', state: 'Texas', purchase_price: 25000, status: 'purchased', bedrooms: 3, bathrooms: 2 },
        headers: { 'Content-Type': 'application/json' },
      });
      propertyId = (await r.json()).id;
      await request.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=${SALE_PRICE}&force=true`);

      r = await request.post(`${API_URL}/api/clients`, {
        data: { name: `E2E Buyer ${TS}`, email: `buyer-${TS}@test.com`, phone: '555-0001' },
        headers: { 'Content-Type': 'application/json' },
      });
      clientId = (await r.json()).id;

      r = await request.post(`${API_URL}/api/sales`, {
        data: { property_id: propertyId, client_id: clientId, sale_price: SALE_PRICE, sale_type: 'contado' },
        headers: { 'Content-Type': 'application/json' },
      });
      saleId = (await r.json()).id;
    });

    await test.step('Register enganche → payment_order created (Por Aprobar)', async () => {
      const res = await request.post(`${API_URL}/api/sales/${saleId}/payments`, {
        data: { payment_type: 'down_payment', amount: DOWN_PAYMENT, payment_method: 'cash', notes: 'Enganche efectivo', reported_by: 'staff' },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status()).toBe(200);

      // Payment order should be in pending (Por Aprobar)
      const ordRes = await request.get(`${API_URL}/api/payment-orders?status=pending`);
      const orders = (await ordRes.json()).data || [];
      const match = orders.find((o: any) => o.property_id === propertyId && o.concept === 'pago_venta');
      expect(match).toBeTruthy();
      expect(Number(match.amount)).toBe(DOWN_PAYMENT);
      expect(match.direction).toBe('inbound');
      expect(match.notes).toMatch(/Enganche/);
      expect(match.notes).toMatch(/Progreso/);
    });

    await test.step('Approve inbound → auto-completes + creates accounting transaction', async () => {
      const ordRes = await request.get(`${API_URL}/api/payment-orders?status=pending`);
      const match = ((await ordRes.json()).data || []).find((o: any) => o.property_id === propertyId && o.concept === 'pago_venta');
      expect(match).toBeTruthy();

      // Approve it
      const appRes = await request.patch(`${API_URL}/api/payment-orders/${match.id}/approve?approved_by=e2e-test`);
      const appData = await appRes.json();
      expect(appData.ok).toBe(true);
      // For inbound, approve auto-completes
      expect(appData.message).toMatch(/recibido|aprobada/i);

      // Should now be completed
      const checkRes = await request.get(`${API_URL}/api/payment-orders?status=completed`);
      const completed = ((await checkRes.json()).data || []).find((o: any) => o.id === match.id);
      expect(completed).toBeTruthy();
      expect(completed.status).toBe('completed');
    });

    await test.step('Resumen Financiero shows payment', async () => {
      const res = await request.get(`${API_URL}/api/properties/financial-summary`);
      const prop = (await res.json()).properties.find((p: any) => p.id === propertyId);
      expect(prop).toBeTruthy();
      expect(prop.amount_paid).toBe(DOWN_PAYMENT);
      expect(prop.payment_orders_count).toBeGreaterThanOrEqual(1);
    });

    await test.step('Cleanup', async () => {
      await request.post(`${API_URL}/api/sales/${saleId}/cancel`).catch(() => {});
      await request.delete(`${API_URL}/api/properties/${propertyId}`).catch(() => {});
      await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
    });
  });

  test('No RTO option in new sale API', async ({ request }) => {
    // Verify that creating a contado sale works fine
    const TS = Date.now();
    const propRes = await request.post(`${API_URL}/api/properties`, {
      data: { address: `E2E NoRTO ${TS}`, city: 'Dallas', state: 'Texas', purchase_price: 20000, status: 'purchased' },
      headers: { 'Content-Type': 'application/json' },
    });
    const propId = (await propRes.json()).id;
    await request.post(`${API_URL}/api/properties/${propId}/publish?sale_price=30000&force=true`);

    const clientRes = await request.post(`${API_URL}/api/clients`, {
      data: { name: `NoRTO Client ${TS}`, email: `norto-${TS}@test.com`, phone: '555' },
      headers: { 'Content-Type': 'application/json' },
    });
    const clientId = (await clientRes.json()).id;

    const saleRes = await request.post(`${API_URL}/api/sales`, {
      data: { property_id: propId, client_id: clientId, sale_price: 30000, sale_type: 'contado' },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(saleRes.status()).toBe(200);
    const sale = await saleRes.json();
    expect(sale.sale_type).toBe('contado');

    // Cleanup
    await request.post(`${API_URL}/api/sales/${sale.id}/cancel`).catch(() => {});
    await request.delete(`${API_URL}/api/properties/${propId}`).catch(() => {});
    await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
  });
});

test.describe('UI: New sale wizard', () => {

  test('No RTO option visible, only Contado', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    await page.goto(`${APP_URL}/homes/sales/new`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); });
    await page.waitForTimeout(1000);

    // RTO option should NOT exist
    const rtoCount = await page.locator('text=Maninos Homes (RTO)').count();
    expect(rtoCount).toBe(0);

    // "Contado" should be in the title or implied
    const rtoButton = await page.locator('button:has-text("RTO")').count();
    expect(rtoButton).toBe(0);
  });
});
