/**
 * Verifies horizontal scroll works inside BOS + Title App templates on mobile.
 *
 * Checks:
 *  1. In Revisar Casa modal: .bos-doc-viewport is horizontally scrollable AND
 *     the scroll actually moves when we scroll it.
 *  2. In Property detail page: same check for the docs templates.
 */
import { test, expect, devices } from '@playwright/test';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const E2E_EMAIL = 'e2e-test@maninos.com';
const E2E_PASSWORD = 'E2eTest2026!Maninos';

test.use({ ...devices['iPhone SE'] });

async function login(page: any) {
  await page.addInitScript(() => {
    try {
      ['maninos_tour_completed_homes', 'maninos_tour_completed_capital', 'maninos_tour_completed_clientes']
        .forEach(k => localStorage.setItem(k, 'true'));
      ['/homes', '/homes/market', '/homes/properties', '/homes/properties/id']
        .forEach(p => localStorage.setItem(`maninos_tour_page_homes_${p.replace(/\//g, '_')}`, 'true'));
    } catch {}
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /ingresar/i }).click();
  await page.waitForURL(/\/homes/, { timeout: 30000 });
}

test.describe('Template horizontal scroll — mobile', () => {
  test('BOS template in Revisar Casa: horizontally scrollable', async ({ page }) => {
    await login(page);
    const apiPromise = page.waitForResponse(
      (r: any) => r.url().includes('/api/market-listings') && r.status() === 200,
      { timeout: 30000 }
    ).catch(() => null);
    await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded' });
    await apiPromise;
    await page.locator('[data-testid="review-btn"]').first().waitFor({ state: 'attached', timeout: 15000 });

    const reviewBtn = page.locator('[data-testid="review-btn"]:not([disabled])').first();
    await reviewBtn.scrollIntoViewIfNeeded();
    await reviewBtn.click();
    await page.getByText(/Paso 1/i).first().waitFor({ state: 'visible', timeout: 10000 });

    // Open BOS template
    await page.getByRole('button', { name: /Abrir Template Bill of Sale/i }).first().click();
    await page.locator('.bos-doc-viewport').first().waitFor({ state: 'visible', timeout: 10000 });

    const viewport = page.locator('.bos-doc-viewport').first();
    const metrics = await viewport.evaluate((el: any) => {
      const s = window.getComputedStyle(el);
      return {
        overflowX: s.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollable: el.scrollWidth > el.clientWidth,
      };
    });
    console.log('[bos-modal]', metrics);

    // Must be scrollable (content wider than viewport)
    expect(metrics.overflowX).toMatch(/auto|scroll/);
    expect(metrics.scrollable, `Expected scrollWidth(${metrics.scrollWidth}) > clientWidth(${metrics.clientWidth})`).toBe(true);
    expect(metrics.scrollWidth).toBeGreaterThanOrEqual(720);

    // Actually scroll and verify movement
    await viewport.evaluate((el: any) => { el.scrollLeft = 200; });
    await page.waitForTimeout(300);
    const afterScroll = await viewport.evaluate((el: any) => el.scrollLeft);
    console.log('[bos-modal] scrollLeft after scroll:', afterScroll);
    expect(afterScroll).toBeGreaterThan(0);

    await page.screenshot({ path: '../test-screenshots/scroll-bos-modal.png', fullPage: false });
  });

  test('Property detail docs: BOS template horizontally scrollable', async ({ page, request }) => {
    await login(page);

    // Find a property with docs available (pending_payment or later stages)
    const propsRes = await request.get(`${API_URL}/api/properties?limit=50`);
    const propsData = await propsRes.json();
    const properties = Array.isArray(propsData) ? propsData : (propsData.properties || []);
    // Pick any property — docs section shows "Abrir Template" buttons
    const prop = properties[0];
    test.skip(!prop, 'No property to test');
    console.log(`[property] Testing property ${prop.id}`);

    await page.goto(`${APP_URL}/homes/properties/${prop.id}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Scroll to the "Documentos de la Transacción" section
    const docsHeader = page.getByText(/Documentos de la Transacción/i).first();
    if (!(await docsHeader.isVisible().catch(() => false))) {
      test.skip(true, 'Documentos section not visible for this property');
    }
    await docsHeader.scrollIntoViewIfNeeded();

    // Find and click "Abrir Template" for Bill of Sale (purchase)
    const openBtn = page.getByRole('button', { name: /Bill of Sale/i }).first();
    if (!(await openBtn.isVisible().catch(() => false))) {
      test.skip(true, 'No Bill of Sale open button for this property');
    }
    await openBtn.click();
    await page.locator('.bos-doc-viewport').first().waitFor({ state: 'visible', timeout: 10000 });

    const viewport = page.locator('.bos-doc-viewport').first();
    const metrics = await viewport.evaluate((el: any) => {
      const s = window.getComputedStyle(el);
      return {
        overflowX: s.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        scrollable: el.scrollWidth > el.clientWidth,
      };
    });
    console.log('[bos-property]', metrics);

    expect(metrics.overflowX).toMatch(/auto|scroll/);
    expect(metrics.scrollable, `Expected scrollWidth(${metrics.scrollWidth}) > clientWidth(${metrics.clientWidth})`).toBe(true);
    expect(metrics.scrollWidth).toBeGreaterThanOrEqual(720);

    await viewport.evaluate((el: any) => { el.scrollLeft = 200; });
    await page.waitForTimeout(300);
    const afterScroll = await viewport.evaluate((el: any) => el.scrollLeft);
    expect(afterScroll).toBeGreaterThan(0);

    await page.screenshot({ path: '../test-screenshots/scroll-bos-property.png', fullPage: false });
  });
});
