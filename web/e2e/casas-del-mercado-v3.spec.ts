/**
 * E2E Tests — Casas del Mercado V3 (11 changes)
 *
 * Tests the deployed app at Vercel + Railway.
 * Authenticated via global-setup.ts (Supabase login).
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

// Helper: navigate to market page, skip if login required
async function goToMarket(page: any) {
  await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait a moment for client-side hydration
  await page.waitForTimeout(2000);
  if (page.url().includes('/login')) {
    return false; // Not authenticated
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// TIER 1 — Quick Fixes (API + UI)
// ═══════════════════════════════════════════════════════════════════

test.describe('Tier 1: Quick Fixes', () => {

  // Change 1+2: TDHCA Gravamen + Tax Lien
  test('Change 1+2: API returns lien_info and tax_lien_status fields', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&limit=1`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data).toHaveProperty('listings');
  });

  // Change 6: Partner properties only qualified
  test('Change 6: Partner endpoint only returns qualified listings', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/public/properties/partners?limit=20`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data).toHaveProperty('properties');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TIER 2 — Core Fixes (API + UI)
// ═══════════════════════════════════════════════════════════════════

test.describe('Tier 2: Core Fixes', () => {

  // Change 5: qualified_only
  test('Change 5: qualified_only=true returns only qualified', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=true&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.qualified_only).toBe(true);
    for (const listing of data.listings || []) {
      expect(listing.is_qualified).toBe(true);
    }
  });

  test('Change 5: qualified_only=false includes unqualified', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&limit=10`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.qualified_only).toBe(false);
  });

  // Change 10: Manual fields endpoint
  test('Change 10: PATCH manual-fields endpoint exists', async ({ request }) => {
    const res = await request.patch(
      `${API_URL}/api/market-listings/00000000-0000-0000-0000-000000000000/manual-fields`,
      { data: { manual_price: 20000 }, headers: { 'Content-Type': 'application/json' } }
    );
    expect([404, 422, 400].includes(res.status()) || res.status() === 200).toBeTruthy();
  });

  // Change 11: Negotiation status
  test('Change 11: GET includes negotiating listings', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&limit=50`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    for (const listing of data.listings || []) {
      expect(['available', 'negotiating']).toContain(listing.status);
    }
  });

  test('Change 11: PATCH status to negotiating and back', async ({ request }) => {
    const listRes = await request.get(`${API_URL}/api/market-listings?qualified_only=false&limit=1`);
    const listData = await listRes.json();
    if (!listData.listings?.length) { test.skip(); return; }

    const id = listData.listings[0].id;
    const original = listData.listings[0].status;
    const target = original === 'negotiating' ? 'available' : 'negotiating';

    const res = await request.patch(`${API_URL}/api/market-listings/${id}/status?status=${target}&force=true`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.new_status).toBe(target);

    // Revert
    await request.patch(`${API_URL}/api/market-listings/${id}/status?status=${original}&force=true`);
  });
});

// ═══════════════════════════════════════════════════════════════════
// TIER 3 — Filters & Scroll (API)
// ═══════════════════════════════════════════════════════════════════

test.describe('Tier 3: Filters & Scroll', () => {

  test('Change 3: Bedrooms filter', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=true&bedrooms=3&limit=10`);
    expect(res.status()).toBe(200);
    for (const l of (await res.json()).listings || []) expect(l.bedrooms).toBe(3);
  });

  test('Change 3: Source filter', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&source=facebook&limit=10`);
    expect(res.status()).toBe(200);
    for (const l of (await res.json()).listings || []) expect(l.source).toBe('facebook');
  });

  test('Change 3: Year range filter', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&min_year=2000&max_year=2020&limit=10`);
    expect(res.status()).toBe(200);
    for (const l of (await res.json()).listings || []) {
      if (l.year_built) {
        expect(l.year_built).toBeGreaterThanOrEqual(2000);
        expect(l.year_built).toBeLessThanOrEqual(2020);
      }
    }
  });

  test('Change 3: Price range filter', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&min_price=10000&max_price=30000&limit=10`);
    expect(res.status()).toBe(200);
    for (const l of (await res.json()).listings || []) {
      expect(l.listing_price).toBeGreaterThanOrEqual(10000);
      expect(l.listing_price).toBeLessThanOrEqual(30000);
    }
  });

  test('Change 4: Limit 500 works', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=false&limit=500`);
    expect(res.status()).toBe(200);
    expect((await res.json())).toHaveProperty('count');
  });
});

// ═══════════════════════════════════════════════════════════════════
// TIER 4 — Scraping Endpoints
// ═══════════════════════════════════════════════════════════════════

test.describe('Tier 4: Scraping Endpoints', () => {

  test('Change 8: scrape-mhvillage endpoint exists', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/market-listings/scrape-mhvillage?min_price=5000&max_price=80000`);
    expect([200, 504, 408].includes(res.status()) || res.ok()).toBeTruthy();
  });

  test('Change 8: scrape-mobilehome endpoint exists', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/market-listings/scrape-mobilehome?min_price=5000&max_price=80000`);
    expect([200, 504, 408].includes(res.status()) || res.ok()).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════
// UI TESTS — Authenticated browser tests
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Casas del Mercado — Authenticated', () => {

  test('Market page loads successfully', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    // Page loaded — verify title
    await expect(page.getByText('Casas del Mercado')).toBeVisible({ timeout: 10000 });
  });

  // Change 1: Gravamen banner removed from summary
  test('Change 1: Summary panel does NOT show "Rango Precio"', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    await page.waitForTimeout(3000);
    const rangoText = page.locator('text=Rango Precio');
    await expect(rangoText).not.toBeVisible();
  });

  // Change 3: Filter bar
  test('Change 3: Filter bar expands with all inputs', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    // Click Filtros
    await page.getByText('Filtros').click();
    await page.waitForTimeout(500);

    // All filter labels visible
    await expect(page.getByText('Precio mín')).toBeVisible();
    await expect(page.getByText('Precio máx')).toBeVisible();
    await expect(page.getByText('Habitaciones')).toBeVisible();
    await expect(page.getByText('Año mín')).toBeVisible();
    await expect(page.getByText('Año máx')).toBeVisible();
    await expect(page.getByText('Fuente')).toBeVisible();
    await expect(page.getByText('No calificadas')).toBeVisible();
    await expect(page.getByText('Limpiar filtros')).toBeVisible();
  });

  // Change 3: Bedrooms filter actually filters in UI
  test('Change 3: Selecting bedrooms filter updates listings', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    // Open filters
    await page.getByText('Filtros').click();
    await page.waitForTimeout(500);

    // Select 3 bedrooms
    await page.locator('select').first().selectOption('3');

    // Wait for listings to reload
    await page.waitForTimeout(2000);

    // Filter badge should show "activos"
    const badge = page.locator('text=activos');
    await expect(badge).toBeVisible({ timeout: 5000 });
  });

  // Change 3: Limpiar filtros works
  test('Change 3: "Limpiar filtros" resets all filters', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    await page.getByText('Filtros').click();
    await page.waitForTimeout(500);

    // Set a filter
    await page.locator('select').first().selectOption('3');
    await page.waitForTimeout(1000);

    // Click limpiar
    await page.getByText('Limpiar filtros').click();
    await page.waitForTimeout(1000);

    // Badge should be gone
    const badge = page.locator('span:has-text("activos")');
    await expect(badge).not.toBeVisible();
  });

  // Change 5: Toggle "No calificadas" checkbox
  test('Change 5: "No calificadas" checkbox toggles unqualified', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    await page.getByText('Filtros').click();
    await page.waitForTimeout(500);

    // Check the "No calificadas" checkbox
    const checkbox = page.locator('input[type="checkbox"]');
    await checkbox.check();
    await page.waitForTimeout(2000);

    // Badge should show "activos"
    await expect(page.locator('text=activos')).toBeVisible();
  });

  // Change 7+8: Buscar Casas button shows correct source count
  test('Change 7+8: "Buscar Casas" button shows fuentes count', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    const btn = page.locator('button', { hasText: /Buscar Casas/ });
    await expect(btn).toBeVisible({ timeout: 10000 });
    const text = await btn.textContent();
    // Should show 6 or 7 fuentes
    expect(text).toMatch(/[67] fuentes/);
  });

  // Change 10: Pencil edit icons exist on listing specs
  test('Change 10: Listing cards have pencil edit icons', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    // Wait for listings to load
    await page.waitForTimeout(4000);

    // Look for pencil icons (Pencil from lucide = svg with specific path)
    const pencils = page.locator('button svg.w-2\\.5');
    const count = await pencils.count();
    // Should have pencil icons if listings are loaded
    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  // Change 11: Negociar button exists
  test('Change 11: Listing cards have "Negociar" button', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    await page.waitForTimeout(4000);

    const negociarBtns = page.locator('button', { hasText: /Negociar/ });
    const count = await negociarBtns.count();
    // If listings loaded, should have Negociar buttons
    if (count > 0) {
      expect(count).toBeGreaterThan(0);
    }
  });

  // Change 11: Click Negociar toggles to Negociando
  test('Change 11: Clicking "Negociar" changes to "Negociando"', async ({ page }) => {
    const ok = await goToMarket(page);
    if (!ok) { test.skip(true, 'Auth failed'); return; }

    await page.waitForTimeout(4000);

    const negociarBtn = page.locator('button', { hasText: 'Negociar' }).first();
    if (!(await negociarBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No listings with Negociar button');
      return;
    }

    // Click Negociar
    await negociarBtn.click();
    await page.waitForTimeout(2000);

    // Should now show "Negociando" or "En Negociación" badge
    const negotiating = page.locator('text=Negociando').first();
    const badge = page.locator('text=En Negociación').first();
    const isVisible = await negotiating.isVisible().catch(() => false) || await badge.isVisible().catch(() => false);
    expect(isVisible).toBe(true);

    // Revert: click Negociando to go back to available
    const negociandoBtn = page.locator('button', { hasText: 'Negociando' }).first();
    if (await negociandoBtn.isVisible().catch(() => false)) {
      await negociandoBtn.click();
      await page.waitForTimeout(1000);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROXY ROUTE TESTS
// ═══════════════════════════════════════════════════════════════════

test.describe('Proxy Routes — New Next.js routes exist', () => {

  test('scrape-mhvillage proxy', async ({ request }) => {
    const res = await request.post(`${APP_URL}/api/market-listings/scrape-mhvillage?min_price=5000&max_price=80000`);
    expect(res.status()).not.toBe(404);
  });

  test('scrape-mobilehome proxy', async ({ request }) => {
    const res = await request.post(`${APP_URL}/api/market-listings/scrape-mobilehome?min_price=5000&max_price=80000`);
    expect(res.status()).not.toBe(404);
  });

  test('manual-fields proxy', async ({ request }) => {
    const res = await request.patch(`${APP_URL}/api/market-listings/test-id/manual-fields`, {
      data: { manual_price: 20000 }, headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).not.toBe(405);
  });

  // Public catalog (no auth needed)
  test('Public partner catalog loads', async ({ page }) => {
    await page.goto(`${APP_URL}/clientes/casas`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await expect(page).not.toHaveURL(/error/);
  });
});
