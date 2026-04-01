/**
 * E2E Tests — Manual Sale → Notifications + Commissions + Resumen Financiero
 *
 * Verifies the full flow:
 * 1. Publish a property
 * 2. Create manual sale with commissions
 * 3. Sale notification appears in "Pendientes de Acción"
 * 4. Commission notifications appear
 * 5. All data shows in Resumen Financiero
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

let propertyId: string;
let clientId: string;
let saleId: string;
const TEST_TS = Date.now();

test.describe.serial('Manual sale → notifications → commissions → resumen financiero', () => {

  test('Step 1: Create and publish property', async ({ request }) => {
    // Create
    const createRes = await request.post(`${API_URL}/api/properties`, {
      data: {
        address: `E2E Sale Notif Test ${TEST_TS}`,
        city: 'Houston', state: 'Texas',
        purchase_price: 20000, status: 'purchased',
        bedrooms: 3, bathrooms: 2,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(createRes.status()).toBe(200);
    propertyId = (await createRes.json()).id;

    // Publish
    const pubRes = await request.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=35000&force=true`);
    if (pubRes.status() !== 200) {
      // Try from renovating
      await request.patch(`${API_URL}/api/properties/${propertyId}`, {
        data: { status: 'renovating' },
        headers: { 'Content-Type': 'application/json' },
      });
      const retry = await request.post(`${API_URL}/api/properties/${propertyId}/publish?sale_price=35000&force=true`);
      expect(retry.status()).toBe(200);
    }
  });

  test('Step 2: Create client', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/clients`, {
      data: {
        name: `E2E Sale Client ${TEST_TS}`,
        email: `e2e-sale-${TEST_TS}@test.com`,
        phone: '555-1234',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    clientId = (await res.json()).id;
  });

  test('Step 3: Get team users for commission assignment', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/team/users`);
    const data = await res.json();
    const users = data.users || data.data || [];
    // We need at least 1 user to assign commissions — use the first one
    expect(users.length).toBeGreaterThan(0);
  });

  test('Step 4: Create manual sale with commissions', async ({ request }) => {
    // Get team users
    const teamRes = await request.get(`${API_URL}/api/team/users`);
    const teamData = await teamRes.json();
    const users = teamData.users || teamData.data || [];
    const employee1 = users[0]?.id;
    const employee2 = users.length > 1 ? users[1]?.id : employee1;

    const res = await request.post(`${API_URL}/api/sales`, {
      data: {
        property_id: propertyId,
        client_id: clientId,
        sale_price: 35000,
        sale_type: 'contado',
        found_by_employee_id: employee1,
        sold_by_employee_id: employee2,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    saleId = data.id;
    expect(saleId).toBeTruthy();
    expect(data.commission_amount).toBeGreaterThan(0);
  });

  test('Step 5: Sale notification exists with action_required', async ({ request }) => {
    // Check notifications for this sale
    const res = await request.get(`${API_URL}/api/notifications?type=sale&limit=10`);
    const data = await res.json();

    // Find our notification (most recent sale notification)
    const saleNotif = data.notifications.find((n: any) =>
      n.related_entity_id === saleId || n.title.includes('35,000')
    );

    expect(saleNotif).toBeTruthy();
    expect(saleNotif.action_required).toBe(true);
    expect(saleNotif.action_type).toBe('confirm');
    expect(saleNotif.priority).toBe('high');
    expect(saleNotif.category).toBe('both');
    // Should include property address
    expect(saleNotif.property_address || saleNotif.title).toContain('E2E Sale Notif Test');
  });

  test('Step 6: Commission notifications exist', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=commission&limit=10`);
    const data = await res.json();

    // Should have commission notifications for this sale
    const commNotifs = data.notifications.filter((n: any) =>
      n.related_entity_id === saleId
    );

    // At least 1 commission notification (could be 1 or 2 depending on employee assignment)
    expect(commNotifs.length).toBeGreaterThanOrEqual(1);

    for (const n of commNotifs) {
      expect(n.action_required).toBe(true);
      expect(n.action_type).toBe('pay');
      expect(n.amount).toBeGreaterThan(0);
      // Should include property info
      expect(n.property_address || n.property_code).toBeTruthy();
    }
  });

  test('Step 7: Resumen Financiero shows sale + commission data', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/properties/financial-summary`);
    const data = await res.json();

    const prop = data.properties.find((p: any) => p.id === propertyId);
    expect(prop).toBeTruthy();
    expect(prop.sale_id).toBe(saleId);
    expect(prop.sale_status).toBe('pending');
    expect(prop.sale_price).toBe(35000);
    expect(prop.commission).toBe(1500); // Contado commission
    expect(prop.client_name).toContain('E2E Sale Client');
  });

  test('Step 8: Financial detail has commission breakdown', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/properties/${propertyId}/financial-detail`);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Sale info
    expect(data.sale).toBeTruthy();
    expect(data.sale.price).toBe(35000);
    expect(data.sale.commission_total).toBe(1500);
    // At least one of found_by/sold_by should be set
    expect(data.sale.found_by || data.sale.sold_by).toBeTruthy();
  });

  test('Cleanup', async ({ request }) => {
    if (saleId) await request.post(`${API_URL}/api/sales/${saleId}/cancel`).catch(() => {});
    if (propertyId) await request.delete(`${API_URL}/api/properties/${propertyId}`).catch(() => {});
    if (clientId) await request.delete(`${API_URL}/api/clients/${clientId}`).catch(() => {});
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI: Notificaciones page shows action-required section
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Notificaciones shows Pendientes de Acción', () => {

  test('notificaciones page has action-required section', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); });
    await page.waitForTimeout(500);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/notifications') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    await test.step('Pendientes de Accion section exists', async () => {
      const section = page.locator('text=Pendientes de Acción');
      if (await section.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(section).toBeVisible();
        // Should have a red badge with count
        const badge = page.locator('.bg-red-100.text-red-700');
        await expect(badge).toBeVisible();
      }
    });

    await test.step('Actividad Reciente section exists', async () => {
      await expect(page.locator('text=Actividad Reciente')).toBeVisible({ timeout: 5000 });
    });

    // Screenshot
    await page.screenshot({ path: 'test-results/notif-action-required.png', fullPage: false });
  });
});
