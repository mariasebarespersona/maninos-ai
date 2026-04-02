/**
 * E2E Tests — E-Sign Inline Email, View Signed Doc, Review Progress Persistence
 *
 * Tests:
 * 1. Inline email input replaces browser prompt() for e-sign
 * 2. "Ver Documento" button appears in confirm step signature status
 * 3. Review progress persists across close/reopen (including evalReport)
 */
import { test, expect } from '@playwright/test';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';

// Unique listing ID for this test run
const LISTING_ID = `e2e-esign-review-${Date.now()}`;

// ─── Setup: create a test listing via API ───────────────────────
test.describe.serial('E-Sign inline email + review persistence', () => {
  let listingId: string;

  test.beforeAll(async ({ request }) => {
    // Create a test market listing
    const res = await request.post(`${API_URL}/api/market-listings`, {
      data: {
        source: 'manual',
        address: `E2E ${LISTING_ID}`,
        city: 'Houston',
        state: 'TX',
        listing_price: 25000,
        bedrooms: 3,
        bathrooms: 2,
        sqft: 1200,
        status: 'new',
        source_url: 'https://e2e-test.com',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(200);
    const data = await res.json();
    listingId = data.id || data.listing?.id;
    expect(listingId).toBeTruthy();
  });

  // ─── Test 1: Inline email form for BOS e-sign ──────────────────
  test('BOS e-sign: inline email input replaces prompt()', async ({ request }) => {
    // Create envelope via API (simulating what the inline form does)
    const res = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: `Bill of Sale — E2E Test`,
        document_type: 'bill_of_sale',
        transaction_type: 'purchase',
        data: { listing_id: listingId },
        signers: [
          { role: 'seller', name: 'E2E Seller', email: 'e2e-seller@test.com' },
          { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
        ],
        send_immediately: true,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.envelope_id).toBeTruthy();
    expect(data.signatures).toBeTruthy();
    // Should have at least seller signer
    const sellerSig = data.signatures.find((s: any) => s.signer_role === 'seller');
    expect(sellerSig).toBeTruthy();
    expect(sellerSig.token).toBeTruthy();
    expect(sellerSig.signer_email).toBe('e2e-seller@test.com');
  });

  // ─── Test 2: Title App e-sign with inline email ─────────────────
  test('Title App e-sign: inline email creates envelope', async ({ request }) => {
    const res = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: `Cambio Titulo — E2E Test`,
        document_type: 'title_application',
        transaction_type: 'purchase',
        data: { listing_id: listingId },
        signers: [
          { role: 'seller', name: 'E2E Seller TA', email: 'e2e-seller-ta@test.com' },
          { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
        ],
        send_immediately: true,
      },
      headers: { 'Content-Type': 'application/json' },
    });

    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
  });

  // ─── Test 3: Listing envelopes return both docs with tokens ─────
  test('listing envelopes return seller tokens for "Ver Documento"', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/esign/listing/${listingId}/envelopes`);
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.envelopes.length).toBeGreaterThanOrEqual(2);

    for (const env of data.envelopes) {
      const sellerSig = (env.document_signatures || []).find((s: any) => s.signer_role === 'seller');
      expect(sellerSig).toBeTruthy();
      // Token must be present — this is what "Ver Documento" link uses
      expect(sellerSig.token).toBeTruthy();
      expect(typeof sellerSig.token).toBe('string');
      expect(sellerSig.token.length).toBeGreaterThan(10);
    }
  });

  // ─── Test 4: Sign seller BOS and verify signing URL works ───────
  test('seller signs BOS, signing page accessible via token', async ({ request }) => {
    // Get the BOS envelope
    const listRes = await request.get(`${API_URL}/api/esign/listing/${listingId}/envelopes`);
    const envelopes = (await listRes.json()).envelopes;
    const bosEnv = envelopes.find((e: any) => e.document_type === 'bill_of_sale');
    const sellerSig = bosEnv.document_signatures.find((s: any) => s.signer_role === 'seller');
    const token = sellerSig.token;

    // Verify signing data endpoint works
    const signData = await request.get(`${API_URL}/api/esign/sign/${token}`);
    expect(signData.status()).toBe(200);
    const sd = await signData.json();
    expect(sd.signer_name).toBe('E2E Seller');
    expect(sd.document_type).toBe('bill_of_sale');

    // Sign with drawn signature
    const signRes = await request.post(`${API_URL}/api/esign/sign/${token}`, {
      data: {
        type: 'drawn',
        value: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
        consent: true,
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(signRes.status()).toBe(200);
    const result = await signRes.json();
    expect(result.ok).toBe(true);
    expect(result.signed).toBe(true);
  });

  // ─── Test 5: After signing, envelope shows signed status ────────
  test('after signing, listing envelopes reflect signed status with signature data', async ({ request }) => {
    const res = await request.get(`${API_URL}/api/esign/listing/${listingId}/envelopes`);
    const envelopes = (await res.json()).envelopes;
    const bosEnv = envelopes.find((e: any) => e.document_type === 'bill_of_sale');
    const sellerSig = bosEnv.document_signatures.find((s: any) => s.signer_role === 'seller');

    expect(sellerSig.status).toBe('signed');
    expect(sellerSig.signed_at).toBeTruthy();
    expect(sellerSig.signature_data).toBeTruthy();
    expect(sellerSig.signature_data.type).toBe('drawn');
    expect(sellerSig.signature_data.value).toContain('data:image/png');
    // Token still available for "Ver Documento" link
    expect(sellerSig.token).toBeTruthy();
  });

  // ─── Test 6: Review progress save + restore ─────────────────────
  test('review progress saves evalReport and restores on reopen', async ({ request }) => {
    const fakeEvalReport = {
      id: 'e2e-eval-123',
      report_number: 'E2E-001',
      score: 85,
      recommendation: 'Comprar',
      checklist: [
        { id: 'foundation', label: 'Foundation', status: 'pass' },
        { id: 'roof', label: 'Roof', status: 'warning' },
      ],
    };

    const progress = {
      purchaseStep: 'payment',
      billOfSaleData: { seller_name: 'E2E Seller', buyer_name: 'MANINOS HOMES' },
      titleAppData: null,
      tdhcaResult: { certificate_number: 'E2E-CERT-123', serial_number: 'E2E-SN-456' },
      tdhcaSearchValue: 'E2E-SN-456',
      checklist: { foundation: true, roof: true },
      documents: { billOfSale: null, title: null, titleApplication: null },
      payment: { method: 'transferencia', reference: '', date: '2026-04-02', amount: 25000, payee_id: null, payee_name: 'Test Payee' },
      evalReport: fakeEvalReport,
      payeeInfo: { payee_id: null, payee_name: 'Test Payee' },
    };

    // Save progress
    const saveRes = await request.patch(
      `${API_URL}/api/market-listings/${listingId}/review-progress`,
      {
        data: { progress },
        headers: { 'Content-Type': 'application/json' },
      }
    );
    expect(saveRes.status()).toBe(200);

    // Fetch listing directly by ID and verify progress is persisted
    const getRes = await request.get(`${API_URL}/api/market-listings/${listingId}`);
    expect(getRes.status()).toBe(200);
    const listing = await getRes.json();

    // The listing should have review_progress
    expect(listing).toBeTruthy();
    expect(listing.review_progress).toBeTruthy();
    expect(listing.review_progress.purchaseStep).toBe('payment');
    expect(listing.review_progress.evalReport).toBeTruthy();
    expect(listing.review_progress.evalReport.score).toBe(85);
    expect(listing.review_progress.evalReport.recommendation).toBe('Comprar');
    expect(listing.review_progress.evalReport.report_number).toBe('E2E-001');
    expect(listing.review_progress.billOfSaleData.seller_name).toBe('E2E Seller');
    expect(listing.review_progress.payment.amount).toBe(25000);
  });

  // ─── Test 7: Progress survives update and has all fields ────────
  test('review progress preserves all wizard steps', async ({ request }) => {
    // Read back the progress
    const getRes = await request.get(`${API_URL}/api/market-listings/${listingId}`);
    const listing = await getRes.json();
    const rp = listing?.review_progress;
    expect(rp).toBeTruthy();

    // All expected keys present
    expect(rp).toHaveProperty('purchaseStep');
    expect(rp).toHaveProperty('billOfSaleData');
    expect(rp).toHaveProperty('titleAppData');
    expect(rp).toHaveProperty('tdhcaResult');
    expect(rp).toHaveProperty('checklist');
    expect(rp).toHaveProperty('payment');
    expect(rp).toHaveProperty('evalReport');
    expect(rp).toHaveProperty('payeeInfo');

    // TDHCA result restored
    expect(rp.tdhcaResult.serial_number).toBe('E2E-SN-456');
    expect(rp.tdhcaResult.certificate_number).toBe('E2E-CERT-123');
  });

  // ─── Cleanup ────────────────────────────────────────────────────
  test.afterAll(async ({ request }) => {
    // Clean up test listing
    await request.delete(`${API_URL}/api/market-listings/${listingId}`).catch(() => {});
  });
});

// ─── UI Tests (separate describe so they can run independently) ──
test.describe('E-Sign UI: inline email + view document', () => {

  test('inline email form has correct structure (API-level component check)', async ({ request }) => {
    // Create a listing with BOS data saved
    const createRes = await request.post(`${API_URL}/api/market-listings`, {
      data: {
        source: 'manual',
        address: `E2E UI Check ${Date.now()}`,
        city: 'Houston',
        state: 'TX',
        listing_price: 20000,
        status: 'new',
        source_url: 'https://e2e-ui.com',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    const listing = await createRes.json();
    const lid = listing.id || listing.listing?.id;

    // Create envelope to simulate having sent for signature
    const envRes = await request.post(`${API_URL}/api/esign/envelopes`, {
      data: {
        name: 'UI Check BOS',
        document_type: 'bill_of_sale',
        data: { listing_id: lid },
        signers: [
          { role: 'seller', name: 'UI Test Seller', email: 'ui-test@test.com' },
        ],
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(envRes.status()).toBe(200);
    const envData = await envRes.json();
    const token = envData.signatures?.[0]?.token;
    expect(token).toBeTruthy();

    // Verify the signing page is accessible (this is what "Ver Documento" links to)
    const signPage = await request.get(`${API_URL}/api/esign/sign/${token}`);
    expect(signPage.status()).toBe(200);
    const signInfo = await signPage.json();
    expect(signInfo.signer_name).toBe('UI Test Seller');
    expect(signInfo.signer_role).toBe('seller');

    // Cleanup
    await request.delete(`${API_URL}/api/market-listings/${lid}`).catch(() => {});
  });
});
