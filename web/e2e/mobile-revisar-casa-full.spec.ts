/**
 * E2E mobile FULL flow test — "Revisar Casa" ending with "Confirmar Compra"
 *
 * This test walks through all 4 steps of the Revisar Casa modal at iPhone SE
 * viewport (320×568) and clicks "Confirmar Compra" at the end, creating a
 * real property in production DB. Cleanup deletes it after.
 *
 * Approach:
 *  1. SETUP (API): Create a test evaluation report, pick a qualified listing,
 *     pre-populate the listing's `review_progress` with fake-but-valid
 *     billOfSaleData and tdhcaResult so Paso 1 gates are green without having
 *     to perform TDHCA external lookup.
 *  2. UI FLOW: Open modal on mobile, walk through each step, click Siguiente,
 *     capture screenshots, end with Confirmar Compra.
 *  3. CLEANUP: Delete the created property + test evaluation, clear the
 *     listing's review_progress.
 */
import { test, expect, devices } from '@playwright/test';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const E2E_EMAIL = 'e2e-test@maninos.com';
const E2E_PASSWORD = 'E2eTest2026!Maninos';

test.use({ ...devices['iPhone SE'] });

// ─── Helpers ─────────────────────────────────────────────────────────────

async function loginMobile(page: any) {
  await page.addInitScript(() => {
    try {
      const keys = [
        'maninos_tour_completed_homes',
        'maninos_tour_completed_capital',
        'maninos_tour_completed_clientes',
      ];
      for (const k of keys) localStorage.setItem(k, 'true');
      const paths = ['/homes', '/homes/market', '/homes/properties'];
      for (const p of paths) localStorage.setItem(`maninos_tour_page_homes_${p.replace(/\//g, '_')}`, 'true');
    } catch {}
  });
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[type="email"]').fill(E2E_EMAIL);
  await page.locator('input[type="password"]').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /ingresar|iniciar sesión|sign in|login/i }).click();
  await page.waitForURL(/\/homes/, { timeout: 30000 });
}

interface Fixture {
  listing: any;
  evalReport: any;
  listingId: string;
}

async function setupFixture(request: any): Promise<Fixture> {
  // 1. Create evaluation draft
  const evalRes = await request.post(`${API_URL}/api/evaluations`);
  if (!evalRes.ok()) throw new Error(`Failed to create eval: ${evalRes.status()}`);
  const evalDraft = await evalRes.json();
  console.log(`[fixture] Created eval draft ${evalDraft.report_number} (id=${evalDraft.id})`);

  // 2. Mark all checklist items as "pass"
  const passedChecklist = (evalDraft.checklist || []).map((item: any) => ({
    ...item,
    status: 'pass',
    note: 'e2e-test auto-pass',
  }));
  await request.patch(`${API_URL}/api/evaluations/${evalDraft.id}`, {
    data: { checklist: passedChecklist },
  });

  // 3. Generate final report
  const genRes = await request.post(`${API_URL}/api/evaluations/${evalDraft.id}/generate-report`);
  if (!genRes.ok()) throw new Error(`Failed to generate report: ${genRes.status()}`);
  const finalReport = await genRes.json();
  console.log(`[fixture] Generated report score=${finalReport.score} rec=${finalReport.recommendation}`);

  // 4. Pick a qualified listing
  const listingsRes = await request.get(`${API_URL}/api/market-listings?qualified_only=true&limit=20`);
  const listingsData = await listingsRes.json();
  const listings = listingsData.listings || [];
  // Prefer a listing without existing review_progress so we start clean
  const listing = listings.find((l: any) => !l.review_progress) || listings[0];
  if (!listing) throw new Error('No qualified market listings available');
  console.log(`[fixture] Using listing ${listing.id} — ${listing.address}`);

  // 5. Pre-populate review_progress to skip TDHCA external lookup + BOS save
  const progress = {
    purchaseStep: 'documents',
    billOfSaleData: {
      seller_name: 'E2E Test Seller',
      buyer_name: 'MANINOS HOMES',
      buyer_address: listing.address,
      buyer_date: new Date().toISOString().split('T')[0],
      manufacturer: 'Test Manufacturer',
      make: 'Test Model',
      date_manufactured: '2015',
      bedrooms: String(listing.bedrooms || 3),
      baths: String(listing.bathrooms || 2),
      dimensions: listing.sqft ? `${listing.sqft} sqft` : '1200 sqft',
      serial_number: 'E2ETEST-SERIAL-001',
      hud_label_number: 'E2ETEST-LABEL-001',
      location_of_home: `${listing.address}, ${listing.city || ''}, ${listing.state || 'TX'}`,
      total_payment: `$${(listing.listing_price || 0).toLocaleString()}`,
      is_new: false,
      is_used: true,
    },
    titleAppData: null,
    tdhcaResult: {
      label_seal: 'E2ETEST-LABEL-001',
      serial_number: 'E2ETEST-SERIAL-001',
      manufacturer: 'Test Manufacturer',
      model: 'Test Model',
      year: '2015',
      square_feet: '1200',
      certificate_number: 'E2E-CERT-001',
      county: 'Harris',
    },
    tdhcaSearchValue: 'E2ETEST-LABEL-001',
    checklist: {},
    documents: { billOfSale: null, title: null, titleApplication: null },
    payment: {
      method: 'transferencia',
      reference: '',
      date: new Date().toISOString().split('T')[0],
      amount: listing.listing_price || 0,
      payee_id: null,
      payee_name: 'E2E Test Payee',
    },
    evalReport: finalReport,
    payeeInfo: { payee_id: null, payee_name: 'E2E Test Payee' },
  };
  const progRes = await request.patch(`${API_URL}/api/market-listings/${listing.id}/review-progress`, {
    data: { progress },
  });
  if (!progRes.ok()) throw new Error(`Failed to save review_progress: ${progRes.status()}`);
  console.log(`[fixture] Pre-populated review_progress for listing ${listing.id}`);

  return { listing, evalReport: finalReport, listingId: listing.id };
}

async function cleanupFixture(request: any, fixture: Fixture, createdPropertyId: string | null) {
  // Delete created property if any
  if (createdPropertyId) {
    try {
      const r = await request.delete(`${API_URL}/api/properties/${createdPropertyId}`);
      console.log(`[cleanup] Deleted property ${createdPropertyId}: ${r.status()}`);
    } catch (e) {
      console.log(`[cleanup] Failed to delete property: ${e}`);
    }
  }
  // Clear listing review_progress
  try {
    await request.patch(`${API_URL}/api/market-listings/${fixture.listingId}/review-progress`, {
      data: { progress: null },
    });
    console.log(`[cleanup] Cleared review_progress on listing ${fixture.listingId}`);
  } catch (e) {
    console.log(`[cleanup] Failed to clear progress: ${e}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  FULL FLOW TEST
// ═══════════════════════════════════════════════════════════════════════════

test.describe('Revisar Casa — FULL flow with Confirmar Compra (iPhone SE)', () => {
  test('walks through 4 steps and creates a real property', async ({ page, request }) => {
    test.setTimeout(180000); // 3 min for full flow

    let fixture: Fixture | null = null;
    let createdPropertyId: string | null = null;

    try {
      fixture = await setupFixture(request);
      await loginMobile(page);

      // Listen for property creation response
      page.on('response', async (res: any) => {
        if (res.url().endsWith('/api/properties') && res.request().method() === 'POST' && res.ok()) {
          try {
            const body = await res.json();
            if (body?.id) createdPropertyId = body.id;
          } catch {}
        }
      });

      // Navigate to market and wait for listings
      const apiResPromise = page.waitForResponse(
        (r: any) => r.url().includes('/api/market-listings') && r.status() === 200,
        { timeout: 30000 }
      ).catch(() => null);
      await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded' });
      await apiResPromise;
      await page.waitForTimeout(2000);

      // Click Revisar Casa on OUR specific fixture listing
      const specificCard = page.locator(`[data-listing-id="${fixture.listingId}"]`).first();
      await specificCard.scrollIntoViewIfNeeded();
      const specificBtn = specificCard.locator('[data-testid="review-btn"]').first();
      await expect(specificBtn).toBeEnabled({ timeout: 10000 });
      await specificBtn.click();

      // Wait for modal
      await page.getByText(/Paso 1/i).first().waitFor({ state: 'visible', timeout: 15000 });
      console.log('[test] Modal opened at Paso 1');

      await page.screenshot({ path: '../test-screenshots/full-paso1.png', fullPage: false });

      // ─── PASO 1 → PASO 2: click Siguiente ────────────────────────
      // Because we pre-populated progress, allDocsReady should be true
      const siguiente1 = page.getByRole('button', { name: /^Siguiente$/ }).first();
      await expect(siguiente1).toBeEnabled({ timeout: 10000 });
      await siguiente1.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText(/Paso 2/i).first()).toBeVisible({ timeout: 10000 });
      console.log('[test] Reached Paso 2');
      await page.screenshot({ path: '../test-screenshots/full-paso2.png', fullPage: false });

      // ─── PASO 2 → PASO 3: click Siguiente ────────────────────────
      // evalReport is pre-populated so Siguiente should be enabled
      const siguiente2 = page.getByRole('button', { name: /^Siguiente$/ }).first();
      await expect(siguiente2).toBeEnabled({ timeout: 10000 });
      await siguiente2.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText(/Paso 3/i).first()).toBeVisible({ timeout: 10000 });
      console.log('[test] Reached Paso 3');
      await page.screenshot({ path: '../test-screenshots/full-paso3.png', fullPage: false });

      // ─── PASO 3: fill payment form ────────────────────────
      // Select "Nuevo beneficiario" mode or use existing if saved
      const newPayeeBtn = page.getByRole('button', { name: /Nuevo beneficiario/i }).first();
      if (await newPayeeBtn.isVisible().catch(() => false)) {
        await newPayeeBtn.click();
        await page.waitForTimeout(500);

        // Fill minimum required fields
        await page.locator('input[placeholder*="Nombre legal"]').first().fill('E2E Test Seller');
        await page.locator('input[placeholder*="Chase"]').first().fill('Chase Bank');
        await page.locator('input[placeholder*="9 digitos"]').first().fill('111000614');
        await page.locator('input[placeholder*="Numero"]').first().fill('1234567890');
        await page.waitForTimeout(500);
      }

      const siguiente3 = page.getByRole('button', { name: /^Siguiente$/ }).first();
      await expect(siguiente3).toBeEnabled({ timeout: 10000 });
      await siguiente3.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText(/Paso 4/i).first()).toBeVisible({ timeout: 10000 });
      console.log('[test] Reached Paso 4');
      await page.screenshot({ path: '../test-screenshots/full-paso4.png', fullPage: false });

      // ─── PASO 4: select Houston leadership + Confirmar ────────────
      const houstonBtn = page.getByRole('button', { name: /Houston/i }).first();
      await expect(houstonBtn).toBeVisible({ timeout: 10000 });
      await houstonBtn.click();
      await page.waitForTimeout(500);

      // Scroll to find Confirmar button
      const confirmBtn = page.getByRole('button', { name: /Confirmar Compra/i }).first();
      await confirmBtn.scrollIntoViewIfNeeded();
      await expect(confirmBtn).toBeEnabled({ timeout: 10000 });
      await page.screenshot({ path: '../test-screenshots/full-paso4-ready.png', fullPage: false });

      console.log('[test] Clicking Confirmar Compra...');
      await confirmBtn.click();

      // Wait for API call + modal to either close or show success
      await page.waitForTimeout(5000);

      // Verify: either modal closed OR success indicator visible
      const modalStillOpen = await page.getByText(/Paso 4/i).first().isVisible().catch(() => false);
      if (!modalStillOpen || createdPropertyId) {
        console.log(`[test] ✅ Property creation flow completed. ID=${createdPropertyId}`);
      } else {
        const errText = await page.locator('text=/error|failed|fallo/i').first().textContent().catch(() => null);
        console.log(`[test] ⚠️ Modal still open. Error: ${errText}`);
      }

      // Give a moment for any async property creation to complete
      await page.waitForTimeout(3000);

      expect(createdPropertyId, 'Expected a property to be created').toBeTruthy();

    } finally {
      if (fixture) {
        await cleanupFixture(request, fixture, createdPropertyId);
      }
    }
  });
});
