import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

test.describe('E-Sign API', () => {

  test('can create BOS and title_application envelopes', async ({ request }) => {
    // Create BOS envelope
    let res = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: 'E2E BOS', document_type: 'bill_of_sale', transaction_type: 'purchase',
        data: { listing_id: 'e2e-esign-test' },
        signers: [
          { role: 'seller', name: 'E2E Seller', email: 'e2e@test.com' },
          { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Create title_application envelope
    res = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: 'E2E Title', document_type: 'title_application', transaction_type: 'purchase',
        data: { listing_id: 'e2e-esign-test' },
        signers: [
          { role: 'seller', name: 'E2E Seller', email: 'e2e@test.com' },
          { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  test('listing envelopes returns both types', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/esign/listing/e2e-esign-test/envelopes`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.envelopes.length).toBeGreaterThanOrEqual(2);
    const types = data.envelopes.map((e: any) => e.document_type);
    expect(types).toContain('bill_of_sale');
    expect(types).toContain('title_application');
  });

  test('envelopes have signers with tokens', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/esign/listing/e2e-esign-test/envelopes`);
    const { envelopes } = await res.json();
    for (const env of envelopes) {
      expect(env.document_signatures.length).toBeGreaterThanOrEqual(2);
      for (const sig of env.document_signatures) {
        expect(sig.signer_name).toBeTruthy();
        expect(sig.sign_token).toBeTruthy();
      }
    }
  });

  test('can submit drawn signature', async ({ request }) => {
    const envRes = await request.get(`${API_URL}/api/esign/listing/e2e-esign-test/envelopes`);
    const bosEnv = (await envRes.json()).envelopes.find((e: any) => e.document_type === 'bill_of_sale');
    const sellerSig = bosEnv?.document_signatures?.find((s: any) => s.signer_role === 'seller' && !s.signed_at);
    if (!sellerSig) { test.skip(); return; }

    const res = await request.post(`${API_URL}/api/esign/sign/${sellerSig.sign_token}`, {
      data: {
        type: 'drawn',
        value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        consent: true,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    expect((await res.json()).ok).toBe(true);

    // Verify already_signed
    const check = await request.get(`${API_URL}/api/esign/sign/${sellerSig.sign_token}`);
    expect((await check.json()).already_signed).toBe(true);
  });
});

test.describe('E-Sign Proxy', () => {

  test('listing envelopes proxy works', async ({ request }) => {
    const res = await request.get(`${APP_URL}/api/esign/listing/e2e-esign-test/envelopes`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });
});

test.describe('UI: Market page', () => {

  test('market page loads with listings', async ({ page }) => {
    await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('input[type="email"]', { timeout: 15000 });
    await page.locator('input[type="email"]').fill('e2e-test@maninos.com');
    await page.locator('input[type="password"]').fill('E2eTest2026!Maninos');
    await page.getByRole('button', { name: /ingresar|login/i }).click();
    for (let i = 0; i < 10; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break; }

    await page.goto(`${APP_URL}/homes/market`, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => { document.getElementById('react-joyride-portal')?.remove(); });
    await page.waitForTimeout(2000);

    await expect(page.locator('text=Casas del Mercado').first()).toBeVisible({ timeout: 10000 });
  });
});
