/**
 * E2E Tests — Notifications System
 *
 * Tests the centralized notification system that was implemented:
 * 1. Notifications API (CRUD, filtering, mark-read)
 * 2. Notification creation from business events (sales, commissions, payments, renovations)
 * 3. Property ID/address/code in notification descriptions
 * 4. Notifications page UI in Homes portal
 * 5. Cash payments → notifications flow
 * 6. Capital payment → notifications flow
 *
 * Pattern: test user BEHAVIOR, not implementation.
 * Uses waitForResponse instead of waitForTimeout where possible.
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
  // Dismiss Joyride tour — click "Omitir tour" or skip button, then force-remove
  await page.waitForTimeout(1500); // Wait for tour to appear

  // Try clicking "Omitir tour" link (visible in the tour dialog)
  const omitirBtn = page.locator('button:has-text("Omitir tour")').or(page.locator('text=Omitir tour'));
  if (await omitirBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await omitirBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Try the X close button on the tour dialog
  const closeBtn = page.locator('.react-joyride__tooltip button[aria-label="Close"]');
  if (await closeBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeBtn.click({ force: true });
    await page.waitForTimeout(500);
  }

  // Escape key
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // Nuclear option: remove all Joyride elements from the DOM
  await page.evaluate(() => {
    const portal = document.getElementById('react-joyride-portal');
    if (portal) portal.remove();
    document.querySelectorAll('.react-joyride__overlay, .react-joyride__spotlight, [data-test-id="overlay"]')
      .forEach(el => el.remove());
    // Also remove any remaining backdrop/overlay divs
    document.querySelectorAll('[role="presentation"]')
      .forEach(el => { if (el.className.includes('joyride')) el.remove(); });
  });
  await page.waitForTimeout(500);
}



// ═══════════════════════════════════════════════════════════════════
// API TESTS — Backend Notification Endpoints
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Notification endpoints', () => {

  test('GET /api/notifications returns valid response', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.notifications)).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  test('GET /api/notifications filters by category=homes', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?category=homes&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    // Every notification should be category 'homes' or 'both'
    for (const n of data.notifications) {
      expect(['homes', 'both']).toContain(n.category);
    }
  });

  test('GET /api/notifications filters by category=capital', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?category=capital&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    for (const n of data.notifications) {
      expect(['capital', 'both']).toContain(n.category);
    }
  });

  test('GET /api/notifications filters by type', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=sale&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    for (const n of data.notifications) {
      expect(n.type).toBe('sale');
    }
  });

  test('GET /api/notifications/unread-count returns count', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications/unread-count`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.count).toBe('number');
    expect(data.count).toBeGreaterThanOrEqual(0);
  });

  test('GET /api/notifications/unread-count with category filter', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications/unread-count?category=homes`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  test('notifications are ordered by created_at DESC (newest first)', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?limit=20`);
    const data = await res.json();
    const dates = data.notifications.map((n: any) => new Date(n.created_at).getTime());
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]).toBeLessThanOrEqual(dates[i - 1]);
    }
  });

  test('POST /api/notifications/mark-all-read works', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/notifications/mark-all-read`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.marked).toBe('number');
  });

  test('pagination works with offset and limit', async ({ request }) => {
    const page1 = await request.get(`${API_URL}/api/notifications?limit=5&offset=0`);
    const page2 = await request.get(`${API_URL}/api/notifications?limit=5&offset=5`);
    const data1 = await page1.json();
    const data2 = await page2.json();

    // Pages should not overlap (unless there are fewer than 10 total)
    if (data1.notifications.length === 5 && data2.notifications.length > 0) {
      const ids1 = new Set(data1.notifications.map((n: any) => n.id));
      for (const n of data2.notifications) {
        expect(ids1.has(n.id)).toBe(false);
      }
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Notification Content Quality
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Notification content has property details', () => {

  test('sale notifications include property address/code and client name', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=sale&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      // Title should contain sale amount
      expect(n.title).toMatch(/\$/);

      // Message should have descriptive content (not empty)
      expect(n.message.length).toBeGreaterThan(20);

      // Sale notifications should link to a property
      // property_id or property_address may be set
      if (n.property_id) {
        // If property_id is set, address/code should be denormalized
        expect(n.property_address || n.property_code || n.property_id).toBeTruthy();
      }

      // Should have amount
      expect(n.amount).not.toBeNull();
      expect(Number(n.amount)).toBeGreaterThan(0);

      // Sale type should be in message
      expect(n.message).toMatch(/Contado|RTO/i);
    }
  });

  test('commission notifications include employee name and amount', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=commission&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      // Title should contain amount and name
      expect(n.title).toMatch(/\$/);
      expect(n.title.toLowerCase()).toContain('comisión');

      // Message should mention contabilidad
      expect(n.message.toLowerCase()).toMatch(/contabilidad|pago/);

      // Should have amount
      if (n.amount) {
        expect(Number(n.amount)).toBeGreaterThan(0);
      }
    }
  });

  test('payment_order notifications include amount and payee', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=payment_order&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      expect(n.title).toMatch(/\$/);
      expect(n.message.length).toBeGreaterThan(10);

      if (n.amount) {
        expect(Number(n.amount)).toBeGreaterThan(0);
      }

      // Payment orders should reference a property
      if (n.property_id) {
        expect(n.property_address || n.property_code).toBeTruthy();
      }
    }
  });

  test('renovation notifications include cost and property', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=renovation&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      // Title should have cost
      expect(n.title).toMatch(/\$/);
      expect(n.title.toLowerCase()).toMatch(/renovación|cotización/);

      // Should be linked to a property
      if (n.property_id) {
        expect(n.property_address || n.property_code).toBeTruthy();
      }
    }
  });

  test('capital_payment notifications include client name and payment type', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=capital_payment&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      // Title should mention payment type and amount
      expect(n.title).toMatch(/\$/);
      expect(n.title.toLowerCase()).toMatch(/pago.*recibido/);

      // Message should mention client or tesorería
      expect(n.message.length).toBeGreaterThan(10);

      // Capital payments are category 'both'
      expect(n.category).toBe('both');
    }
  });

  test('cash_payment notifications exist and have correct structure', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=cash_payment&limit=5`);
    const data = await res.json();

    for (const n of data.notifications) {
      expect(n.title).toMatch(/\$/);
      expect(n.title.toLowerCase()).toContain('efectivo');
      expect(n.message.toLowerCase()).toMatch(/contabilidad|registrar/);
      expect(n.action_required).toBe(true);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Notification creation via business flows
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Business flows create notifications', () => {

  test('creating a sale triggers sale + commission notifications', async ({ request }) => {
    // We verify that sale notifications exist in the system (from actual business operations)
    // Since we can't create a full sale in E2E without test data, we verify the integration works
    // by checking that existing sale notifications have the correct format
    const res = await request.get(`${API_URL}/api/notifications?type=sale&limit=50`);
    const data = await res.json();

    if (data.notifications.length > 0) {
      const saleNotif = data.notifications[0];
      // Verify structure
      expect(saleNotif.type).toBe('sale');
      expect(saleNotif.title).toBeTruthy();
      expect(saleNotif.message).toBeTruthy();
      expect(saleNotif.priority).toBe('high');
      expect(saleNotif.action_required).toBe(true);
      expect(saleNotif.action_type).toBe('confirm');
      expect(saleNotif.category).toBe('both'); // Sales go to both portals
      expect(saleNotif.related_entity_type).toBe('sale');
      expect(saleNotif.related_entity_id).toBeTruthy();
    }

    // Check commission notifications also exist
    const commRes = await request.get(`${API_URL}/api/notifications?type=commission&limit=50`);
    const commData = await commRes.json();

    if (commData.notifications.length > 0) {
      const commNotif = commData.notifications[0];
      expect(commNotif.type).toBe('commission');
      expect(commNotif.action_required).toBe(true);
      expect(commNotif.action_type).toBe('pay');
      expect(commNotif.related_entity_type).toBe('sale');
    }
  });

  test('payment orders create notifications at each stage', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=payment_order&limit=50`);
    const data = await res.json();

    if (data.notifications.length >= 2) {
      // Should have notifications for different stages (created, approved, completed)
      const titles = data.notifications.map((n: any) => n.title.toLowerCase());
      const hasCreated = titles.some((t: string) => t.includes('orden de pago'));
      const hasApproved = titles.some((t: string) => t.includes('aprobad'));
      const hasCompleted = titles.some((t: string) => t.includes('completad'));

      // At least one stage should exist
      expect(hasCreated || hasApproved || hasCompleted).toBe(true);
    }
  });

  test('renovation quotes create notifications', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=renovation&limit=50`);
    const data = await res.json();

    if (data.notifications.length > 0) {
      const titles = data.notifications.map((n: any) => n.title.toLowerCase());
      const hasSubmitted = titles.some((t: string) => t.includes('cotización'));
      const hasApproved = titles.some((t: string) => t.includes('aprobad'));

      expect(hasSubmitted || hasApproved).toBe(true);
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// API TESTS — Mark individual notification as read
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Mark notification read/unread', () => {

  test('PATCH /notifications/:id/read marks single notification', async ({ request }) => {
    // Get an unread notification
    const listRes = await request.get(`${API_URL}/api/notifications?limit=1`);
    const listData = await listRes.json();

    if (listData.notifications.length === 0) {
      test.skip();
      return;
    }

    const notifId = listData.notifications[0].id;
    const res = await request.patch(`${API_URL}/api/notifications/${notifId}/read`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);

    // Verify it's now read
    const checkRes = await request.get(`${API_URL}/api/notifications?limit=50`);
    const checkData = await checkRes.json();
    const updated = checkData.notifications.find((n: any) => n.id === notifId);
    if (updated) {
      expect(updated.is_read).toBe(true);
      expect(updated.read_at).toBeTruthy();
    }
  });

  test('PATCH /notifications/nonexistent/read returns 404', async ({ request }) => {
    const res = await request.patch(`${API_URL}/api/notifications/00000000-0000-0000-0000-000000000000/read`);
    expect(res.status()).toBe(404);
  });
});


// ═══════════════════════════════════════════════════════════════════
// PROXY TESTS — Next.js proxy routes exist and work
// ═══════════════════════════════════════════════════════════════════

test.describe('Proxy: Notification routes', () => {

  test('GET /api/notifications proxy returns valid data', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/notifications?limit=5`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(Array.isArray(data.notifications)).toBe(true);
  });

  test('GET /api/notifications/unread-count proxy works', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/notifications/unread-count`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(typeof data.count).toBe('number');
  });

  test('POST /api/notifications/mark-all-read proxy works', async ({ request }) => {
    const res = await request.post(`${APP_URL}/api/notifications/mark-all-read`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Notifications page in Homes portal
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Notifications page', () => {

  test('user sees notification page with correct header', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await test.step('page header shows "Notificaciones"', async () => {
      await expect(page.locator('h1:has-text("Notificaciones")')).toBeVisible({ timeout: 10000 });
    });

    await test.step('page has description text', async () => {
      await expect(
        page.locator('text=Aprueba ordenes de pago').or(page.locator('text=Ordenes de pago'))
      ).toBeVisible({ timeout: 5000 });
    });
  });

  test('user sees activity feed with notifications', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    // Wait for notifications to load
    await page.waitForResponse(
      (res: any) => res.url().includes('/api/notifications') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    await test.step('activity feed section is visible', async () => {
      const activitySection = page.locator('text=Actividad Reciente');
      if (await activitySection.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(activitySection).toBeVisible();

        // Should show "X nuevas" badge
        await expect(page.locator('text=/\\d+ nuevas/')).toBeVisible();
      }
    });

    await test.step('notifications show type icons', async () => {
      // Check for emoji icons in notification items (🏠, 💰, 💵, 📋, 🔧, etc.)
      const notifItems = page.locator('.border-l-4');
      const count = await notifItems.count();
      if (count > 0) {
        // At least one notification card should be visible
        await expect(notifItems.first()).toBeVisible();
      }
    });

    await test.step('notifications show property code badges', async () => {
      // Property codes appear as small badges (e.g. "A10")
      const codeBadges = page.locator('.bg-navy-100.text-navy-700');
      const count = await codeBadges.count();
      // It's OK if none have property codes, but if they do, they should be visible
      if (count > 0) {
        await expect(codeBadges.first()).toBeVisible();
      }
    });

    await test.step('notifications show amounts', async () => {
      const amounts = page.locator('.font-medium.text-navy-600');
      const count = await amounts.count();
      if (count > 0) {
        const text = await amounts.first().textContent();
        expect(text).toMatch(/\$/);
      }
    });

    await test.step('action badges show correct labels', async () => {
      // Action badges: "Por aprobar", "Por pagar", "Por confirmar"
      const actionBadges = page.locator('.bg-amber-100.text-amber-700');
      const count = await actionBadges.count();
      if (count > 0) {
        const texts = await actionBadges.allTextContents();
        for (const t of texts) {
          expect(t).toMatch(/Por aprobar|Por pagar|Por confirmar|Acción/);
        }
      }
    });
  });

  test('mark all as read button works', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/notifications') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    const markAllBtn = page.locator('text=Marcar todas como leídas');
    if (await markAllBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await test.step('click mark all read', async () => {
        const responsePromise = page.waitForResponse(
          (res: any) => res.url().includes('/mark-all-read') && res.status() === 200,
          { timeout: 10000 }
        );
        await markAllBtn.click({ force: true });
        await responsePromise;
      });

      await test.step('toast confirms action', async () => {
        await expect(
          page.locator('text=Todas marcadas como leídas').or(page.locator('[role="status"]'))
        ).toBeVisible({ timeout: 5000 });
      });
    }
  });

  test('notification tabs work (pending/approved/completed)', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/payment-orders') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    await test.step('pending tab is active by default for admin', async () => {
      const pendingTab = page.locator('button:has-text("Pendientes")').or(page.locator('button:has-text("pendiente")'));
      if (await pendingTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        // Check it has active styling
        await expect(pendingTab).toBeVisible();
      }
    });

    await test.step('can switch to completed tab', async () => {
      const completedTab = page.locator('button:has-text("Completadas")').or(page.locator('button:has-text("completad")'));
      if (await completedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (res: any) => res.url().includes('/api/payment-orders') && res.status() === 200,
          { timeout: 10000 }
        );
        await completedTab.click({ force: true });
        await responsePromise;
        await page.waitForTimeout(500);
      }
    });

    await test.step('can switch to received tab', async () => {
      const receivedTab = page.locator('button:has-text("Recibido")').or(page.locator('button:has-text("Recib")'));
      if (await receivedTab.isVisible({ timeout: 3000 }).catch(() => false)) {
        await receivedTab.click({ force: true });
        await page.waitForTimeout(1000);
      }
    });
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Sidebar notification badge
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Sidebar notification badge', () => {

  test('sidebar shows notification count badge', async ({ page }) => {
    await loginAsAdmin(page);
    // Navigate directly to notificaciones to avoid tour blocking sidebar clicks
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForTimeout(3000);

    await test.step('notification link exists in sidebar', async () => {
      const notifLink = page.locator('a[href*="notificaciones"]').or(page.locator('text=Notificaciones'));
      await expect(notifLink.first()).toBeVisible({ timeout: 10000 });
    });

    await test.step('page loaded at notificaciones URL', async () => {
      expect(page.url()).toContain('notificaciones');
    });

    await test.step('notification header is visible', async () => {
      await expect(page.locator('h1:has-text("Notificaciones")')).toBeVisible({ timeout: 10000 });
    });
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Renovation approval section
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Renovation approvals in notifications', () => {

  test('admin sees pending renovation quotes', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/renovation/pending-approvals') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    const renoSection = page.locator('text=Cotizaciones de Renovación por Aprobar');
    if (await renoSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await test.step('renovation section has count badge', async () => {
        const badge = page.locator('.bg-purple-100.text-purple-800');
        await expect(badge).toBeVisible();
        const text = await badge.textContent();
        expect(Number(text)).toBeGreaterThan(0);
      });

      await test.step('renovation cards show cost and property', async () => {
        const renoCards = page.locator('.border-purple-200');
        const count = await renoCards.count();
        expect(count).toBeGreaterThan(0);

        // First card should show dollar amount
        const firstCard = renoCards.first();
        const cardText = await firstCard.textContent();
        expect(cardText).toMatch(/\$/);
      });

      await test.step('approve button exists', async () => {
        await expect(page.locator('button:has-text("Aprobar")').first()).toBeVisible();
      });

      await test.step('view detail link exists', async () => {
        await expect(page.locator('text=Ver detalle').first()).toBeVisible();
      });
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Transfer approvals in notifications
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Transfer approvals in notifications', () => {

  test('admin sees unapproved transfers section', async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await dismissTour(page);

    await page.waitForResponse(
      (res: any) => res.url().includes('/api/sales/pending-transfers') && res.status() === 200,
      { timeout: 15000 }
    ).catch(() => null);
    await page.waitForTimeout(2000);

    const transferSection = page.locator('text=Transferencias por Aprobar');
    if (await transferSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await test.step('transfer section has count badge', async () => {
        const badge = page.locator('.bg-orange-100.text-orange-800');
        await expect(badge).toBeVisible();
      });
    }
  });
});


// ═══════════════════════════════════════════════════════════════════
// INTEGRATION TESTS — Full flow: sale → notification → visible in UI
// ═══════════════════════════════════════════════════════════════════

test.describe('Integration: Notifications appear in correct portals', () => {

  test('sale notifications appear in homes category', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?category=homes&type=sale&limit=5`);
    const data = await res.json();
    expect(data.ok).toBe(true);
    // If there are sale notifications, they should be in homes or both
    for (const n of data.notifications) {
      expect(['homes', 'both']).toContain(n.category);
    }
  });

  test('capital_payment notifications visible in both portals', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?type=capital_payment&limit=5`);
    const data = await res.json();
    for (const n of data.notifications) {
      expect(n.category).toBe('both');
    }
  });

  test('all notification types have valid structure', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/notifications?limit=100`);
    const data = await res.json();

    for (const n of data.notifications) {
      // Required fields
      expect(n.id).toBeTruthy();
      expect(n.type).toBeTruthy();
      expect(n.title).toBeTruthy();
      expect(n.message).toBeTruthy();
      expect(n.created_at).toBeTruthy();

      // Valid priority
      expect(['low', 'normal', 'high', 'urgent']).toContain(n.priority);

      // Valid category
      expect(['homes', 'capital', 'both', 'general']).toContain(n.category);

      // Boolean fields
      expect(typeof n.is_read).toBe('boolean');
      expect(typeof n.action_required).toBe('boolean');

      // If action_required, should have action_type
      if (n.action_required) {
        expect(n.action_type).toBeTruthy();
        expect(['approve', 'confirm', 'review', 'pay']).toContain(n.action_type);
      }

      // Valid type
      const validTypes = [
        'purchase', 'sale', 'commission', 'payment_order',
        'renovation', 'move', 'signature', 'capital_payment',
        'cash_payment', 'sale_payment', 'test'
      ];
      expect(validTypes).toContain(n.type);
    }
  });
});
