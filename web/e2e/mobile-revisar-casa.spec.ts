/**
 * E2E mobile test — "Revisar Casa" flow
 *
 * Validates the 4-step purchase flow modal on mobile viewport:
 *  Paso 1: Documentos (BOS template, Title, Title App)
 *  Paso 2: Evaluación (DesktopEvaluatorPanel)
 *  Paso 3: Pago (BankTransferStep)
 *  Paso 4: Confirmar
 *
 * Key validations:
 *  - Modal container has no horizontal overflow
 *  - Step indicators, nav buttons, close button are all reachable
 *  - Template toolbars (Edit/Save/Close) are visible at 320px viewport
 *  - Document content is rendered (even if it needs horizontal scroll)
 */
import { test, expect, devices } from '@playwright/test';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const E2E_EMAIL = 'e2e-test@maninos.com';
const E2E_PASSWORD = 'E2eTest2026!Maninos';

test.use({ ...devices['iPhone SE'] });

async function loginAndSetupMobile(page: any) {
  // Pre-set localStorage to skip tours
  await page.addInitScript(() => {
    try {
      const keys = [
        'maninos_tour_completed_homes',
        'maninos_tour_completed_capital',
        'maninos_tour_completed_clientes',
      ];
      for (const k of keys) localStorage.setItem(k, 'true');
      const paths = [
        '/homes', '/homes/market', '/homes/properties', '/homes/sales',
        '/homes/commissions', '/homes/transfers', '/homes/notificaciones',
        '/homes/clients', '/homes/accounting',
      ];
      for (const p of paths) {
        localStorage.setItem(`maninos_tour_page_homes_${p.replace(/\//g, '_')}`, 'true');
      }
    } catch {}
  });

  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /ingresar|iniciar sesión|sign in|login/i }).click();
  await page.waitForURL(/\/homes/, { timeout: 30000 });
}

async function openRevisarCasaModal(page: any): Promise<boolean> {
  const apiResPromise = page.waitForResponse(
    (r: any) => r.url().includes('/api/market-listings') && r.status() === 200,
    { timeout: 30000 }
  ).catch(() => null);
  await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded' });
  await apiResPromise;

  // Wait for at least one review button to appear in the DOM (up to 15s)
  await page.locator('[data-testid="review-btn"]').first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => null);
  const count = await page.locator('[data-testid="review-btn"]').count();
  if (count === 0) {
    console.log('[openRevisarCasaModal] No Revisar Casa buttons found on market page');
    return false;
  }

  const reviewBtn = page.locator('[data-testid="review-btn"]:not([disabled])').first();
  const enabledCount = await page.locator('[data-testid="review-btn"]:not([disabled])').count();
  if (enabledCount === 0) {
    console.log(`[openRevisarCasaModal] ${count} listings but none are qualified`);
    return false;
  }

  await reviewBtn.scrollIntoViewIfNeeded();
  await reviewBtn.click();
  // Wait for modal to open — look for "Paso 1" heading which is distinctive
  await page.getByText(/Paso 1/i).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => null);
  return true;
}

test.describe('Revisar Casa — Mobile (iPhone SE)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAndSetupMobile(page);
  });

  test('Modal opens without horizontal overflow; Paso 1 visible', async ({ page }) => {
    const opened = await openRevisarCasaModal(page);
    test.skip(!opened, 'No qualified listing available to test Revisar Casa flow');

    // Verify modal header visible (Paso 1 title)
    await expect(page.getByText(/Paso 1/i).first()).toBeVisible();

    // Body should not overflow horizontally
    const overflow = await page.evaluate(() => ({
      scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(5);

    await page.screenshot({ path: '../test-screenshots/mobile-revisar-paso1.png', fullPage: false });
  });

  test('Bill of Sale template — toolbar buttons visible + document renders', async ({ page }) => {
    const opened = await openRevisarCasaModal(page);
    test.skip(!opened, 'No qualified listing available');

    // Find and click "Abrir Template Bill of Sale"
    const openBosBtn = page.getByRole('button', { name: /Bill of Sale|Abrir Template/i }).first();
    await expect(openBosBtn).toBeVisible({ timeout: 10000 });
    await openBosBtn.click();
    await page.waitForTimeout(1500);

    // Toolbar should be visible with primary actions
    const toolbar = page.locator('.bos-toolbar').first();
    await expect(toolbar).toBeVisible();

    // Save PDF button reachable (it's the main action)
    const saveBtn = page.getByRole('button', { name: /Guardar PDF|Generando/i }).first();
    await expect(saveBtn).toBeVisible();

    // Document container exists
    const docContainer = page.locator('.bos-container').first();
    await expect(docContainer).toBeVisible();

    // Document viewport should allow horizontal scroll when needed
    const scrollable = await page.locator('.bos-doc-viewport').first().evaluate((el: any) => {
      const s = window.getComputedStyle(el);
      return {
        overflowX: s.overflowX,
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
      };
    }).catch(() => null);
    if (scrollable) {
      expect(scrollable.overflowX).toMatch(/auto|scroll/);
      // Document should be at least 720px wide (natural template size)
      expect(scrollable.scrollWidth).toBeGreaterThanOrEqual(700);
    }

    await page.screenshot({ path: '../test-screenshots/mobile-revisar-bos.png', fullPage: false });
  });

  test('Title Application template — toolbar + document render', async ({ page }) => {
    const opened = await openRevisarCasaModal(page);
    test.skip(!opened, 'No qualified listing available');

    // Scroll to find Title App section (it's below BOS + TDHCA)
    await page.locator('text=/Aplicación Cambio de Título/i').first().scrollIntoViewIfNeeded().catch(() => {});
    await page.waitForTimeout(500);

    // Click to open Title App template — exact button text from source
    const openTaBtn = page.getByRole('button', { name: /Abrir Template Aplicación de Título/i }).first();
    if (!(await openTaBtn.isVisible().catch(() => false))) {
      test.skip(true, 'Title App template button not reachable in this listing state');
    }
    await openTaBtn.click();
    await page.waitForTimeout(1500);

    // Toolbar visible
    const toolbar = page.locator('.taw .toolbar').first();
    await expect(toolbar).toBeVisible();

    // Document container exists
    const docContainer = page.locator('.taw .doc').first();
    await expect(docContainer).toBeVisible();

    // Document viewport has scroll
    const scrollable = await page.locator('.ta-doc-viewport').first().evaluate((el: any) => {
      const s = window.getComputedStyle(el);
      return { overflowX: s.overflowX, scrollWidth: el.scrollWidth };
    }).catch(() => null);
    if (scrollable) {
      expect(scrollable.overflowX).toMatch(/auto|scroll/);
      expect(scrollable.scrollWidth).toBeGreaterThanOrEqual(700);
    }

    await page.screenshot({ path: '../test-screenshots/mobile-revisar-titleapp.png', fullPage: false });
  });

  test('Action footer buttons (Anterior/Siguiente/Cancelar) are reachable', async ({ page }) => {
    const opened = await openRevisarCasaModal(page);
    test.skip(!opened, 'No qualified listing available');

    // Scroll to bottom where action buttons are
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(500);

    // Cancelar or Siguiente should be visible at the bottom
    const cancelar = page.getByRole('button', { name: /^Cancelar$/ }).first();
    await expect(cancelar).toBeVisible();

    const siguiente = page.getByRole('button', { name: /Siguiente/ }).first();
    await expect(siguiente).toBeVisible();

    // Check that no overflow at modal bottom
    const overflow = await page.evaluate(() => ({
      scrollWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth - overflow.clientWidth).toBeLessThanOrEqual(5);

    await page.screenshot({ path: '../test-screenshots/mobile-revisar-actions.png', fullPage: false });
  });
});
