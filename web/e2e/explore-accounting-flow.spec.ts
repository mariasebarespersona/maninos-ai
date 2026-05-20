/**
 * Exploratory walk-through of accounting + notificaciones to capture
 * the real UI: bank-account names, plan de cuentas, requisición-de-pago
 * bank picker. Writes screenshots + JSON to test-screenshots/.
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const EMAIL = 'e2e-test@maninos.com';
const PASSWORD = 'E2eTest2026!Maninos';

const OUT_DIR = path.resolve(__dirname, '../../test-screenshots/explore-accounting');
fs.mkdirSync(OUT_DIR, { recursive: true });

interface Findings {
  bankAccounts: string[];
  planDeCuentas: string[];
  transacciones: string[];
  porConciliar: string[];
  facturas: string[];
  notificacionesItems: string[];
  notificacionesBankOptions: string[];
  notes: string[];
}

async function killTour(page: any) {
  await page.evaluate(() => {
    document.getElementById('react-joyride-portal')?.remove();
    document.querySelectorAll('.react-joyride__overlay, .react-joyride__beacon').forEach((el: any) => el.remove());
  }).catch(() => {});
}

async function snap(page: any, name: string) {
  await page.screenshot({ path: path.join(OUT_DIR, name), fullPage: true }).catch(() => {});
}

async function dumpText(page: any, selector: string, maxLen = 300, minLen = 5, max = 40): Promise<string[]> {
  return await page.locator(selector).evaluateAll(
    (els: Element[], { mn, mx }) =>
      els
        .map((e) => (e.textContent || '').trim().replace(/\s+/g, ' '))
        .filter((t) => t.length >= mn && t.length <= mx),
    { mn: minLen, mx: maxLen },
  ).then((r: string[]) => Array.from(new Set(r)).slice(0, max));
}

test.setTimeout(300_000);

test('walk accounting + notificaciones', async ({ page }) => {
  const f: Findings = {
    bankAccounts: [], planDeCuentas: [], transacciones: [], porConciliar: [],
    facturas: [], notificacionesItems: [], notificacionesBankOptions: [], notes: [],
  };

  // ---- login ----
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForSelector('input[type="email"]', { timeout: 15_000 });
  await page.locator('input[type="email"]').fill(EMAIL);
  await page.locator('input[type="password"]').fill(PASSWORD);
  await page.getByRole('button', { name: /ingresar|login/i }).click();
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(1500);
    if (!page.url().includes('/login')) break;
  }
  f.notes.push(`Post-login URL: ${page.url()}`);
  await snap(page, '01-after-login.png');

  // ---- accounting (Contabilidad) ----
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);
  await killTour(page);
  await page.waitForTimeout(1500);
  await snap(page, '02-accounting-landing.png');
  f.notes.push(`Accounting URL: ${page.url()}`);

  // capture top-level tab labels
  const tabs = await dumpText(page, '[role="tab"], button', 40, 2, 60);
  f.notes.push(`Tabs/buttons seen: ${tabs.join(' | ')}`);

  // ---- Bancos / Cuentas Bancarias ----
  const banks = page.locator('button, [role="tab"]').filter({ hasText: /^Bancos$|Cuentas Bancarias/i }).first();
  if (await banks.count()) {
    await banks.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await killTour(page);
    await snap(page, '03-cuentas-bancarias.png');
    f.bankAccounts = await dumpText(page, '[class*="card"], [class*="Card"], li, tr, [data-testid*="bank"]', 400, 10, 30);
  } else {
    f.notes.push('No "Bancos" tab found');
  }

  // ---- Plan de Cuentas ----
  const plan = page.locator('button, [role="tab"]').filter({ hasText: /Plan de Cuentas|Chart of Accounts/i }).first();
  if (await plan.count()) {
    await plan.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '04-plan-de-cuentas.png');
    // QB-style codes (4-5 digits) or BS_/PL_ identifiers
    const all = await page.locator('tr, li, [class*="account"], div').evaluateAll((els) =>
      els.map((e) => (e.textContent || '').trim().replace(/\s+/g, ' '))
        .filter((t) => t.length >= 4 && t.length <= 200)
        .filter((t) => /^\d{4,5}\b/.test(t) || /\b(BS_|PL_|ACT-|GAS-|ING-|PAS-|LT_|SEC_|INV_)\w*/.test(t))
    );
    f.planDeCuentas = Array.from(new Set(all)).slice(0, 200);
  } else {
    f.notes.push('No "Plan de Cuentas" tab found');
  }

  // ---- Transacciones (Detalle) ----
  const tx = page.locator('button, [role="tab"]').filter({ hasText: /^Transacciones$|^Detalle$|Transacciones de la App/i }).first();
  if (await tx.count()) {
    await tx.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '05-transacciones.png');
    f.transacciones = await dumpText(page, 'tr, li, [class*="transaction"]', 400, 15, 40);
  }

  // ---- Conciliación / Por Conciliar ----
  const con = page.locator('button, [role="tab"]').filter({ hasText: /Conciliaci|Por Conciliar/i }).first();
  if (await con.count()) {
    await con.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '06-por-conciliar.png');
    f.porConciliar = await dumpText(page, 'tr, li, [class*="transaction"], [class*="movement"]', 400, 15, 40);
  }

  // ---- Estado de Cuenta ----
  const ec = page.locator('button, [role="tab"]').filter({ hasText: /Estado de Cuenta/i }).first();
  if (await ec.count()) {
    await ec.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '07-estado-de-cuenta.png');
  }

  // ---- Facturas ----
  const fa = page.locator('button, [role="tab"]').filter({ hasText: /^Facturas$|Invoices/i }).first();
  if (await fa.count()) {
    await fa.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);
    await killTour(page);
    await snap(page, '08-facturas.png');
    f.facturas = await dumpText(page, 'tr, li, [class*="invoice"]', 400, 15, 40);
  } else {
    f.notes.push('No "Facturas" tab found');
  }

  // ---- Notificaciones — find a requisición de pago ----
  await page.goto(`${APP_URL}/homes/notificaciones`, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3500);
  await killTour(page);
  await snap(page, '09-notificaciones.png');
  f.notificacionesItems = await dumpText(page, 'li, [class*="card"], [class*="notification"], button', 300, 10, 60);

  // Try multiple click strategies — look for any "Asignar/Pagar/Cuenta/Banco" CTA
  const candidates = [
    page.locator('text=/requisici(o|ó)n/i').first(),
    page.locator('text=/asignar.*(banco|cuenta)/i').first(),
    page.locator('text=/pagar/i').first(),
    page.locator('[class*="card"]').filter({ hasText: /pago|requisici(o|ó)n|banco|cuenta/i }).first(),
  ];
  for (const c of candidates) {
    if (await c.count()) {
      await c.click({ force: true }).catch(() => {});
      await page.waitForTimeout(2000);
      await killTour(page);
      break;
    }
  }
  await snap(page, '10-notif-after-click.png');

  // Look for any modal/select offering a bank pick
  const banksDropdown = page.locator('select, [role="combobox"], [role="listbox"]').filter({ hasText: /banco|cuenta|bank/i }).first();
  if (await banksDropdown.count()) {
    const opts = await banksDropdown.locator('option, [role="option"]').allTextContents().catch(() => []);
    f.notificacionesBankOptions = opts;
  } else {
    // Try clicking any select to expose options
    const anySelect = page.locator('select').first();
    if (await anySelect.count()) {
      const opts = await anySelect.locator('option').allTextContents().catch(() => []);
      f.notificacionesBankOptions = opts;
      f.notes.push('Used first <select>; not explicitly labelled bank.');
    } else {
      // Try opening shadcn-style combobox
      const combos = page.locator('[role="combobox"]');
      const n = await combos.count();
      for (let i = 0; i < Math.min(n, 5); i++) {
        await combos.nth(i).click({ force: true }).catch(() => {});
        await page.waitForTimeout(600);
      }
      await snap(page, '11-notif-combobox.png');
      const listboxOpts = await page.locator('[role="option"]').allTextContents().catch(() => []);
      if (listboxOpts.length) f.notificacionesBankOptions = listboxOpts;
      else f.notes.push('No bank dropdown found on notificaciones detail.');
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'findings.json'), JSON.stringify(f, null, 2));
  console.log('FINDINGS:\n' + JSON.stringify(f, null, 2));
  expect(f.notes.length).toBeGreaterThan(0);
});
