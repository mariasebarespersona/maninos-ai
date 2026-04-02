import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

test.describe('E-Sign: envelope creation and signing', () => {

  test('create BOS + title_app envelopes with listing_id', async ({ request }) => {
    for (const docType of ['bill_of_sale', 'title_application']) {
      const res = await request.post(`${API_URL}/api/esign/envelopes`, {
        data: {
          name: `E2E ${docType}`, document_type: docType,
          data: { listing_id: 'e2e-esign-v2' },
          signers: [
            { role: 'seller', name: 'E2E Seller', email: 'e2e@test.com' },
            { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
          ],
        },
        headers: { 'Content-Type': 'application/json' },
      });
      expect(res.status()).toBe(200);
      expect((await res.json()).ok).toBe(true);
    }
  });

  test('listing envelopes returns both doc types', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/esign/listing/e2e-esign-v2/envelopes`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    const types = data.envelopes.map((e: any) => e.document_type);
    expect(types).toContain('bill_of_sale');
    expect(types).toContain('title_application');
  });

  test('submit drawn signature stores in document_data', async ({ request }) => {
    // Create property
    let r = await request.post(`${API_URL}/api/properties`, {
      data: { address: 'E2E Sig Store', city: 'Houston', state: 'Texas', purchase_price: 10000, status: 'purchased' },
      headers: { 'Content-Type': 'application/json' },
    });
    const propId = (await r.json()).id;

    // Create envelope
    r = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: 'Sig Store Test', document_type: 'bill_of_sale', property_id: propId,
        signers: [{ role: 'seller', name: 'Drawn Signer', email: 's@t.com' }],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const token = (await r.json()).signatures?.[0]?.token;

    // Sign with drawn
    await request.post(`${API_URL}/api/esign/sign/${token}`, {
      data: { type: 'drawn', value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', consent: true },
      headers: { 'Content-Type': 'application/json' },
    });

    // Check document_data
    r = await request.get(`${API_URL}/api/properties/${propId}`);
    const prop = await r.json();
    const bos = (prop.document_data || {}).bos_purchase || {};
    expect(bos.seller_signature_type).toBe('drawn');
    expect(bos.seller_signature_image).toContain('data:image/png');
    expect(bos.seller_name).toBe('Drawn Signer');

    // Cleanup
    await request.delete(`${API_URL}/api/properties/${propId}`).catch(() => {});
  });

  test('drawn signature shows as image in BOS HTML', async ({ request, page }) => {
    // Create property with drawn sig data
    let r = await request.post(`${API_URL}/api/properties`, {
      data: {
        address: 'E2E Visual Sig', city: 'Houston', state: 'Texas', purchase_price: 10000, status: 'purchased',
        document_data: {
          bos_purchase: {
            seller_name: 'Visual Test Seller',
            seller_signature_type: 'drawn',
            seller_signature_image: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADIAAAAyCAYAAAAeP4ixAAAARElEQVR42u3PMQEAAAjDMOZf9GBBh5mAsNvujgAAAAAAAAAAAICX7OvdAQAAAAAAAAAAAAAAAAD+Z18CAAAAAP7MAxeD2AEBWDM3AAAAAElFTkSuQmCC',
            seller_date: '2026-04-02',
            buyer_name: 'MANINOS HOMES',
            total_payment: '$10,000',
            is_used: true,
          }
        }
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const propId = (await r.json()).id;

    // Login
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    // Go to property
    await page.goto(`${APP_URL}/homes/properties/${propId}`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); document.querySelectorAll('.react-joyride__overlay').forEach(e => e.remove()); });
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Click Bill of Sale (Compra)
    const bosBtn = page.locator('button:has-text("Bill of Sale (Compra)")');
    await bosBtn.click({ force: true });
    await page.waitForTimeout(3000);

    // Check for drawn signature image
    const sigImgs = await page.locator('img[alt*="Firma"]').count();
    expect(sigImgs).toBeGreaterThanOrEqual(1);

    await page.screenshot({ path: 'test-results/e2e-drawn-signature-visible.png', fullPage: true });

    // Cleanup
    await request.delete(`${API_URL}/api/properties/${propId}`).catch(() => {});
  });
});

test.describe('E-Sign: proxy routes', () => {

  test('listing envelopes proxy works', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/esign/listing/test/envelopes`);
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});
