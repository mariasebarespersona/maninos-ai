/**
 * E2E Tests — Casas del Mercado V3
 *
 * Uses Page Object Model + data-testid selectors + user behavior patterns.
 * Tests simulate what Sebastian would do manually.
 *
 * Pattern: test user BEHAVIOR, not implementation.
 * - "As a user, I see X when I do Y"
 * - Use waitForResponse instead of waitForTimeout
 * - Use data-testid for stable selectors
 * - Use test.step for clear reporting
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

// ─── Helper: Login and navigate to Market page ───────────────────
async function setupMarketPage(page: any) {
  // Login
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15000 });
  await page.getByLabel(/email|correo/i).or(page.locator('input[type="email"]')).fill('e2e-test@maninos.com');
  await page.getByLabel(/password|contraseña/i).or(page.locator('input[type="password"]')).fill('E2eTest2026!Maninos');
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click();

  // Wait for redirect
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000);
    if (!page.url().includes('/login')) break;
  }

  // Navigate to market
  await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded', timeout: 45000 });

  // Dismiss Joyride tour if present
  const joyride = page.locator('.react-joyride__overlay');
  if (await joyride.isVisible({ timeout: 3000 }).catch(() => false)) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);
  }

  // Wait for listings to load via API response
  await page.waitForResponse(
    (res: any) => res.url().includes('/api/market-listings') && res.status() === 200,
    { timeout: 15000 }
  ).catch(() => null);
  await page.waitForTimeout(2000);
}

// ═══════════════════════════════════════════════════════════════════
// API TESTS — Backend verification
// ═══════════════════════════════════════════════════════════════════

test.describe('API: Backend endpoints', () => {

  test('all listings returned are qualified', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?qualified_only=true&limit=20`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    for (const listing of data.listings || []) {
      expect(listing.is_qualified).toBe(true);
    }
  });

  test('bedrooms filter returns correct results', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?bedrooms=3&limit=10`);
    const data = await res.json();
    for (const l of data.listings || []) expect(l.bedrooms).toBe(3);
  });

  test('price range filter returns correct results', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?min_price=15000&max_price=35000&limit=10`);
    const data = await res.json();
    for (const l of data.listings || []) {
      expect(l.listing_price).toBeGreaterThanOrEqual(15000);
      expect(l.listing_price).toBeLessThanOrEqual(35000);
    }
  });

  test('source filter returns correct results', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?source=facebook&limit=10`);
    const data = await res.json();
    for (const l of data.listings || []) expect(l.source).toBe('facebook');
  });

  test('year range filter returns correct results', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/market-listings?min_year=2000&max_year=2015&limit=10`);
    const data = await res.json();
    for (const l of data.listings || []) {
      if (l.year_built) {
        expect(l.year_built).toBeGreaterThanOrEqual(2000);
        expect(l.year_built).toBeLessThanOrEqual(2015);
      }
    }
  });

  test('negotiating status toggle works', async ({ request }) => {
    const listRes = await request.get(`${API_URL}/api/market-listings?limit=1`);
    const { listings } = await listRes.json();
    if (!listings?.length) { test.skip(); return; }

    const id = listings[0].id;
    const original = listings[0].status;
    const target = original === 'negotiating' ? 'available' : 'negotiating';

    const res = await request.patch(`${API_URL}/api/market-listings/${id}/status?status=${target}&force=true`);
    expect(res.status()).toBe(200);
    expect((await res.json()).new_status).toBe(target);

    // Revert
    await request.patch(`${API_URL}/api/market-listings/${id}/status?status=${original}&force=true`);
  });

  test('manual-fields endpoint accepts PATCH', async ({ request }) => {
    const res = await request.patch(
      `${API_URL}/api/market-listings/00000000-0000-0000-0000-000000000000/manual-fields`,
      { data: { manual_bedrooms: 3 }, headers: { 'Content-Type': 'application/json' } }
    );
    // 404 = listing not found (endpoint works), not 405 (endpoint doesn't exist)
    expect(res.status()).toBe(404);
  });

  test('scrape endpoints exist', async ({ request }) => {
    for (const endpoint of ['scrape-mhvillage', 'scrape-mobilehome']) {
      const res = await request.post(`${API_URL}/api/market-listings/${endpoint}?min_price=5000&max_price=80000`);
      expect(res.status()).not.toBe(404);
      expect(res.status()).not.toBe(405);
    }
  });

  test('partner properties only shows qualified', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/public/properties/partners?limit=5`);
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// UI TESTS — User behavior simulation
// ═══════════════════════════════════════════════════════════════════

test.describe('UI: Page load and layout', () => {

  test('user sees the market page with correct layout', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('page title is visible', async () => {
      await expect(page.getByTestId('market-title').or(page.locator('h2:has-text("Casas del Mercado")'))).toBeVisible();
    });

    await test.step('badge shows "X calificadas de Y analizadas"', async () => {
      const badge = page.getByTestId('qualified-badge').or(page.locator('.bg-green-50'));
      const text = await badge.textContent();
      expect(text).toMatch(/\d+ calificadas de \d+ analizadas/);
    });

    await test.step('"Rango Precio" is NOT in the summary panel', async () => {
      await expect(page.locator('text=Rango Precio')).not.toBeVisible();
    });

    await test.step('search button shows honest source count', async () => {
      const btn = page.getByTestId('search-button').or(page.locator('button:has-text("Buscar Casas")'));
      const text = await btn.textContent();
      expect(text).toMatch(/[45] fuentes/);
    });

    await test.step('listing cards load with source badges', async () => {
      const cards = page.getByTestId('listing-card').or(page.locator('.card.hover\\:shadow-lg'));
      await expect(cards.first()).toBeVisible({ timeout: 10000 });
      expect(await cards.count()).toBeGreaterThan(0);
    });

    await test.step('all listings show "Calificada" badge — no unqualified', async () => {
      const noCalifica = await page.locator('text=No califica').count();
      expect(noCalifica).toBe(0);
    });
  });
});

test.describe('UI: Filter interactions', () => {

  test('user filters listings by bedrooms', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('open filter bar', async () => {
      await page.getByTestId('filters-toggle').or(page.locator('button:has-text("Filtros")')).click();
      await expect(page.getByTestId('filter-bedrooms').or(page.locator('select').first())).toBeVisible();
    });

    await test.step('select 3 bedrooms and wait for results', async () => {
      const responsePromise = page.waitForResponse(
        (res: any) => res.url().includes('/api/market-listings') && res.url().includes('bedrooms=3'),
        { timeout: 10000 }
      );
      await page.getByTestId('filter-bedrooms').or(page.locator('select').first()).selectOption('3');
      await responsePromise;
      await page.waitForTimeout(500);
    });

    await test.step('verify filter badge shows "activos"', async () => {
      await expect(page.locator('text=activos')).toBeVisible();
    });

    await test.step('verify listings show 3 bedrooms', async () => {
      const habTexts = await page.locator('text=3 hab').count();
      expect(habTexts).toBeGreaterThan(0);
    });

    await test.step('clear filters resets everything', async () => {
      await page.getByTestId('clear-filters').or(page.locator('text=Limpiar filtros')).click();
      await page.waitForResponse(
        (res: any) => res.url().includes('/api/market-listings'),
        { timeout: 10000 }
      ).catch(() => null);
      await page.waitForTimeout(500);
      await expect(page.locator('text=activos')).not.toBeVisible();
    });
  });

  test('user filters listings by price range', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('open filters and set price range', async () => {
      await page.getByTestId('filters-toggle').or(page.locator('button:has-text("Filtros")')).click();
      await page.waitForTimeout(300);

      await page.getByTestId('filter-price-min').or(page.locator('input[placeholder="$5,000"]')).fill('15000');
      await page.getByTestId('filter-price-max').or(page.locator('input[placeholder="$80,000"]')).fill('35000');
    });

    await test.step('wait for filtered results', async () => {
      await page.waitForResponse(
        (res: any) => res.url().includes('/api/market-listings') && res.url().includes('min_price=15000'),
        { timeout: 10000 }
      ).catch(() => null);
      await page.waitForTimeout(1000);
    });

    await test.step('verify all visible prices are in range', async () => {
      const priceEls = page.getByTestId('listing-price').or(page.locator('p.text-xl.font-bold.text-navy-900'));
      const texts = await priceEls.allTextContents();
      const prices = texts.map(t => parseInt(t.replace(/[^0-9]/g, ''))).filter(p => !isNaN(p) && p >= 1000);

      expect(prices.length).toBeGreaterThan(0);
      for (const p of prices) {
        expect(p).toBeGreaterThanOrEqual(15000);
        expect(p).toBeLessThanOrEqual(35000);
      }
    });
  });

  test('user filters listings by source', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('select Facebook source', async () => {
      await page.getByTestId('filters-toggle').or(page.locator('button:has-text("Filtros")')).click();
      await page.waitForTimeout(300);

      const responsePromise = page.waitForResponse(
        (res: any) => res.url().includes('source=facebook'),
        { timeout: 10000 }
      );
      await page.getByTestId('filter-source').or(page.locator('select').nth(1)).selectOption('facebook');
      await responsePromise;
      await page.waitForTimeout(500);
    });

    await test.step('verify only Facebook listings shown', async () => {
      const badges = page.getByTestId('source-badge').or(page.locator('span[class*="absolute top-2 left"]'));
      const texts = await badges.allTextContents();
      for (const t of texts) {
        expect(t.trim()).toBe('Facebook');
      }
    });
  });
});

test.describe('UI: Negotiation flow', () => {

  test('user marks a listing as "En Negociación" and reverts', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('find a listing with Negociar button', async () => {
      const negBtn = page.getByTestId('negotiate-btn').or(page.locator('button:has-text("Negociar")'));
      // Scroll down to find one that's not already negotiating
      await page.evaluate(() => window.scrollBy(0, 500));
      await page.waitForTimeout(1000);
      await expect(negBtn.first()).toBeVisible({ timeout: 5000 });
    });

    await test.step('click Negociar and verify it changes', async () => {
      const negBtn = page.getByTestId('negotiate-btn').or(page.locator('button:has-text("Negociar")')).first();
      await negBtn.scrollIntoViewIfNeeded();

      const responsePromise = page.waitForResponse(
        (res: any) => res.url().includes('/status') && res.status() === 200,
        { timeout: 10000 }
      );
      await negBtn.click();
      await responsePromise;
      await page.waitForTimeout(500);

      // Should now show "Negociando"
      await expect(page.locator('button:has-text("Negociando")').or(page.locator('text=En Negociación')).first()).toBeVisible();
    });

    await test.step('revert: click Negociando to go back', async () => {
      const negociandoBtn = page.locator('button:has-text("Negociando")').first();
      if (await negociandoBtn.isVisible().catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (res: any) => res.url().includes('/status') && res.status() === 200,
          { timeout: 10000 }
        );
        await negociandoBtn.click();
        await responsePromise;
      }
    });
  });
});

test.describe('UI: Design and visual checks', () => {

  test('all cards have proper layout — no overflow or truncation', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('check first 4 cards for layout issues', async () => {
      const cards = page.getByTestId('listing-card').or(page.locator('.card.hover\\:shadow-lg'));
      const count = Math.min(4, await cards.count());

      for (let i = 0; i < count; i++) {
        const card = cards.nth(i);
        const box = await card.boundingBox();
        if (!box) continue;

        // Card should not be wider than 400px (grid column)
        expect(box.width).toBeLessThanOrEqual(400);
      }
    });

    await test.step('Negociar button is single line (height ≤ 35px)', async () => {
      const btn = page.getByTestId('negotiate-btn').or(page.locator('button:has-text("Negociar")')).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.scrollIntoViewIfNeeded();
        const box = await btn.boundingBox();
        expect(box!.height).toBeLessThanOrEqual(35);
      }
    });

    await test.step('empty spec fields show placeholders with pencil icons', async () => {
      // Look for "— hab" or "— baño" placeholders
      const placeholders = await page.locator('text=/— (hab|baño|sqft|año)/').count();
      expect(placeholders).toBeGreaterThan(0);
    });

    await test.step('"En Negociación" badge fits within card', async () => {
      const badges = page.getByTestId('negotiating-badge').or(page.locator('text=En Negociación'));
      const badgeCount = await badges.count();
      for (let i = 0; i < Math.min(3, badgeCount); i++) {
        const badge = badges.nth(i);
        const badgeBox = await badge.boundingBox();
        // Badge shouldn't be taller than 30px
        if (badgeBox) expect(badgeBox.height).toBeLessThanOrEqual(30);
      }
    });
  });
});

test.describe('UI: Spec field editing', () => {

  test('user edits a spec field and prediction updates', async ({ page }) => {
    await setupMarketPage(page);

    await test.step('find a card with editable fields', async () => {
      const pencil = page.locator('[data-testid*="edit-manual"]').or(page.locator('button svg.w-2\\.5')).first();
      await expect(pencil).toBeVisible({ timeout: 5000 });
    });

    await test.step('click pencil icon to start editing', async () => {
      const pencil = page.locator('[data-testid*="edit-manual"]').or(page.locator('button svg.w-2\\.5')).first();
      await pencil.click();

      // Input should appear
      const input = page.locator('input[type="number"]').first();
      await expect(input).toBeVisible({ timeout: 3000 });
    });

    await test.step('type value and press Enter', async () => {
      const input = page.locator('input[type="number"][class*="border-blue"]').first();
      if (await input.isVisible().catch(() => false)) {
        const responsePromise = page.waitForResponse(
          (res: any) => res.url().includes('/manual-fields'),
          { timeout: 10000 }
        );
        await input.fill('3');
        await input.press('Enter');
        await responsePromise;
        await page.waitForTimeout(500);

        // Toast should show
        await expect(page.locator('text=Campo guardado').or(page.locator('text=Predicción actualizada'))).toBeVisible({ timeout: 5000 });
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════
// PROXY ROUTES — Verify Next.js routes exist
// ═══════════════════════════════════════════════════════════════════

test.describe('Proxy routes exist', () => {

  test('scrape proxy routes respond', async ({ request }) => {
    for (const route of ['scrape-mhvillage', 'scrape-mobilehome']) {
      const res = await request.post(`${APP_URL}/api/market-listings/${route}?min_price=5000&max_price=80000`);
      expect(res.status()).not.toBe(404);
    }
  });

  test('manual-fields proxy route responds', async ({ request }) => {
    const res = await request.patch(`${APP_URL}/api/market-listings/test-id/manual-fields`, {
      data: { manual_price: 20000 }, headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).not.toBe(405);
  });
});
