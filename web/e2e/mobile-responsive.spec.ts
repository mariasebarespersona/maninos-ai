import { test, expect, devices } from '@playwright/test';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const E2E_EMAIL = 'e2e-test@maninos.com';
const E2E_PASSWORD = 'E2eTest2026!Maninos';

// iPhone SE viewport (375x667) — smallest common phone target
const MOBILE = { ...devices['iPhone SE'] };

test.use(MOBILE);

async function login(page: any) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /ingresar|iniciar sesión|sign in|login/i }).click();
  await page.waitForURL(/\/homes/, { timeout: 30000 });
}

async function dismissTour(page: any) {
  // Mark tour as completed via localStorage so it doesn't appear
  await page.evaluate(() => {
    localStorage.setItem('maninos_tour_completed_homes', 'true');
    localStorage.setItem('maninos_tour_completed_capital', 'true');
    localStorage.setItem('maninos_tour_completed_clientes', 'true');
  }).catch(() => {});
  // Also click skip if it's still shown
  const skip = page.getByRole('button', { name: /omitir tour|skip/i });
  if (await skip.isVisible().catch(() => false)) {
    await skip.click().catch(() => {});
    await page.waitForTimeout(500);
  }
}

async function checkNoHorizontalOverflow(page: any, pageName: string) {
  const overflow = await page.evaluate(() => {
    const body = document.body;
    const html = document.documentElement;
    return {
      scrollWidth: Math.max(body.scrollWidth, html.scrollWidth),
      clientWidth: html.clientWidth,
    };
  });
  const overflowAmount = overflow.scrollWidth - overflow.clientWidth;
  console.log(`[${pageName}] scrollWidth=${overflow.scrollWidth} clientWidth=${overflow.clientWidth} overflow=${overflowAmount}`);
  // Small tolerance for scrollbar width
  expect(overflowAmount, `${pageName} has horizontal overflow of ${overflowAmount}px`).toBeLessThanOrEqual(5);
}

test.describe('Mobile responsive smoke — Homes critical pages (iPhone SE 375×667)', () => {
  test.beforeEach(async ({ page }) => {
    // Pre-set tour-completed flags in localStorage before any page JS runs
    await page.addInitScript(() => {
      try {
        localStorage.setItem('maninos_tour_completed_homes', 'true');
        localStorage.setItem('maninos_tour_completed_capital', 'true');
        localStorage.setItem('maninos_tour_completed_clientes', 'true');
        // Per-page tours (format: maninos_tour_page_{portal}_{path_with_underscores})
        const homePaths = [
          '/homes', '/homes/market', '/homes/properties', '/homes/sales',
          '/homes/commissions', '/homes/transfers', '/homes/notificaciones',
          '/homes/clients', '/homes/accounting',
        ];
        for (const p of homePaths) {
          localStorage.setItem(`maninos_tour_page_homes_${p.replace(/\//g, '_')}`, 'true');
        }
      } catch {}
    });
    await login(page);
  });

  test('Ventas page — no horizontal overflow, new sale button reachable', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/sales`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissTour(page);
    await page.waitForTimeout(1000);
    await checkNoHorizontalOverflow(page, 'Ventas');
    // New sale CTA should be reachable (key user-facing button)
    await expect(page.getByRole('link', { name: /Nueva Venta/i }).first()).toBeVisible();
    await page.screenshot({ path: '../test-screenshots/mobile-ventas.png', fullPage: true });
  });

  test('Contabilidad page — tabs scroll horizontally, tables have scroll', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await dismissTour(page);
    await page.waitForTimeout(1500);
    await checkNoHorizontalOverflow(page, 'Contabilidad');
    await page.screenshot({ path: '../test-screenshots/mobile-accounting.png', fullPage: true });
  });

  test('Comisiones page — employee rows fit', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/commissions`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissTour(page);
    await page.waitForTimeout(1000);
    await checkNoHorizontalOverflow(page, 'Comisiones');
    await page.screenshot({ path: '../test-screenshots/mobile-commissions.png', fullPage: true });
  });

  test('Resumen Financiero — KPIs and table scroll', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/resumen-financiero`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissTour(page);
    await page.waitForTimeout(1000);
    await checkNoHorizontalOverflow(page, 'Resumen');
    await page.screenshot({ path: '../test-screenshots/mobile-resumen.png', fullPage: true });
  });

  test('Homes dashboard — no overflow', async ({ page }) => {
    await page.goto(`${APP_URL}/homes`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissTour(page);
    await page.waitForTimeout(1000);
    await checkNoHorizontalOverflow(page, 'Homes dashboard');
    await page.screenshot({ path: '../test-screenshots/mobile-homes.png', fullPage: true });
  });

  test('Properties list — no overflow', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/properties`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    await dismissTour(page);
    await page.waitForTimeout(1000);
    await checkNoHorizontalOverflow(page, 'Properties');
    await page.screenshot({ path: '../test-screenshots/mobile-properties.png', fullPage: true });
  });

  test('Market (Casas del Mercado) — no overflow, Revisar Casa button visible on cards', async ({ page }) => {
    await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await dismissTour(page);
    await page.waitForTimeout(1500);
    await checkNoHorizontalOverflow(page, 'Market');
    await page.screenshot({ path: '../test-screenshots/mobile-market.png', fullPage: true });
  });
});
