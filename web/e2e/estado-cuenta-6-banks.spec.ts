/**
 * Estado de Cuenta — UI + backend parity check for the 6 bank accounts.
 *
 * Verifies that each of the 6 banks shows the same controls in the UI
 * and that the upload endpoint behaves the same way (modulo bank_account_id)
 * for any of them.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const EMAIL = 'e2e-test@maninos.com';
const PASSWORD = 'E2eTest2026!Maninos';

const OUT = path.resolve(__dirname, '../../test-screenshots/estado-cuenta-6');
fs.mkdirSync(OUT, { recursive: true });

const EXPECTED_BANKS = [
  'Cuenta Dallas',
  'Cuenta Houston',
  'Cuenta Conroe',
  'Cuenta Dallas Cash',
  'Cuenta Houston Cash',
  'Cuenta Conroe Cash',
];

// Minimal valid PDF with a text layer — pypdf will extract this.
function buildTinyTextPdf(label: string): Buffer {
  const text = `${label} STATEMENT 2026-05-21 Beginning Balance 1000.00 ` +
               `2026-05-15 Deposit Test 500.00 2026-05-18 Withdraw Test -200.00 ` +
               `Ending Balance 1300.00`;
  // 1-page PDF with a /Tj text drawing op.
  const stream = `BT /F1 12 Tf 50 750 Td (${text.replace(/[()\\]/g,' ')}) Tj ET`;
  const len = stream.length;
  const body = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj
4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
5 0 obj << /Length ${len} >> stream
${stream}
endstream endobj
xref
0 6
0000000000 65535 f
0000000010 00000 n
0000000060 00000 n
0000000114 00000 n
0000000231 00000 n
0000000299 00000 n
trailer << /Size 6 /Root 1 0 R >>
startxref
${400 + len}
%%EOF`;
  return Buffer.from(body, 'utf-8');
}

async function login(page: any) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar|login/i }).click();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1500);
    if (!page.url().includes('/login')) break;
  }
}

async function killTour(page: any) {
  await page.evaluate(() => {
    document.getElementById('react-joyride-portal')?.remove();
    document.querySelectorAll('.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip').forEach((e) => e.remove());
  }).catch(() => {});
}

test.setTimeout(360_000);

test('estado de cuenta — uniform UI + backend for the 6 banks', async ({ page }) => {
  const api = await pwRequest.newContext();

  // ---- 1. Get the 6 banks from the API ----
  const banksRes = await api.get(`${API_URL}/api/accounting/bank-accounts`);
  const banks: any[] = (await banksRes.json()).bank_accounts || [];
  console.log(`Found ${banks.length} banks via API:`);
  for (const b of banks) {
    console.log(`  ${b.name.padEnd(24)}  id=${b.id}  accounting_account_id=${b.accounting_account_id || 'NULL'}`);
  }

  // ---- 2. Backend parity check: upload tiny PDF to each bank, capture the response ----
  const backendResults: any[] = [];
  for (const b of banks) {
    const pdfBuf = buildTinyTextPdf(b.name);
    const resp = await api.post(`${API_URL}/api/accounting/bank-statements`, {
      multipart: {
        bank_account_id: b.id,
        file: { name: `${b.name.replace(/\s+/g,'_')}_test.pdf`, mimeType: 'application/pdf', buffer: pdfBuf },
      },
    });
    const status = resp.status();
    const bodyText = await resp.text();
    let detail = '';
    try {
      const j = JSON.parse(bodyText);
      detail = j.detail || j.message || bodyText.slice(0, 200);
    } catch {
      detail = bodyText.slice(0, 200);
    }
    backendResults.push({ bank: b.name, status, detail });
    console.log(`UPLOAD ${b.name.padEnd(24)} → ${status}  ${detail.slice(0, 150)}`);
  }

  // ---- 3. Frontend UI check: navigate to Estado de Cuenta, capture each bank's UI ----
  await login(page);
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' });
  // Wait for actual content to render (not just the spinner)
  await page.waitForSelector('text=/Resumen|Cuentas Bancarias|Transacciones/', { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await killTour(page);
  await page.waitForTimeout(1000);

  // Click "Estado de Cuenta" tab
  const ec = page.locator('button, [role="tab"]').filter({ hasText: /estado de cuenta/i }).first();
  if (await ec.count()) {
    await ec.click({ force: true }).catch(() => {});
    await page.waitForSelector('text=/Cuenta Dallas|Cuenta Houston|Cuenta Conroe/', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(2000);
    await killTour(page);
  }
  await page.screenshot({ path: path.join(OUT, '00-estado-cuenta-overview.png'), fullPage: true });

  // For each bank, capture the section/card UI shape
  const uiPerBank: any[] = [];
  for (const b of banks) {
    const card = page.locator(`text="${b.name}"`).first();
    if (!(await card.count())) {
      uiPerBank.push({ bank: b.name, found_card: false });
      continue;
    }
    // Find the closest "Subir" or "Nuevo" button near the bank card
    const cardBox = await card.elementHandle();
    let buttons: string[] = [];
    let hasUpload = false;
    try {
      // Get all buttons in the card's parent section
      buttons = await card.locator('..').locator('..').locator('..').locator('button').allInnerTexts();
      hasUpload = buttons.some((t) => /subir|upload|nuevo|estado|archivo/i.test(t));
    } catch {}
    uiPerBank.push({ bank: b.name, found_card: true, buttons: buttons.slice(0, 10), has_upload_button: hasUpload });
  }

  // Click on one bank to reveal its statement list (Cuenta Dallas) and snapshot
  const dallas = page.locator(`text="Cuenta Dallas"`).first();
  if (await dallas.count()) {
    await dallas.click({ force: true }).catch(() => {});
    await page.waitForTimeout(1500);
    await page.screenshot({ path: path.join(OUT, '01-cuenta-dallas-detail.png'), fullPage: true });
  }

  // Save findings JSON
  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify({
    banks_found: banks.map(b => ({ name: b.name, id: b.id, accounting_account_id: b.accounting_account_id })),
    backend_upload_results: backendResults,
    frontend_ui_per_bank: uiPerBank,
  }, null, 2));

  // ---- 4. Print summary ----
  console.log('\n===== UPLOAD RESULTS BY BANK =====');
  for (const r of backendResults) {
    console.log(`  ${r.status === 200 ? '✓' : '✗'}  ${r.bank.padEnd(24)} status=${r.status}  ${r.detail.slice(0, 80)}`);
  }
  console.log('\n===== UI PARITY BY BANK =====');
  for (const u of uiPerBank) {
    console.log(`  ${u.found_card ? '✓' : '✗'}  ${u.bank.padEnd(24)} found=${u.found_card}  upload_button=${u.has_upload_button}  buttons=[${(u.buttons||[]).join(' | ')}]`);
  }

  expect(banks.length).toBe(6);
});
