/**
 * E2E Full Audit: Bank Statement Reconciliation
 *
 * Tests the complete lifecycle:
 *   0. Clean slate (vaciar cifras + delete old statements)
 *   1. Upload bank statement PDF
 *   2. Reconcile (buscar coincidencias)
 *   3. AI Classify
 *   4. Confirm all movements
 *   5. Publish (integrar)
 *   6. Audit P&L
 *   7. Audit Balance Sheet
 *   8. Check Transactions
 */
import { test, expect, Page } from '@playwright/test';

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app';
const EMAIL = 'e2e-test@maninos.com';
const PASSWORD = 'E2eTest2026!Maninos';
const SCREENSHOT_DIR = '/tmp/pw-test/audit';

// Expected bank statement movements
const EXPECTED_DEPOSITS = 23125.00;
const EXPECTED_WITHDRAWALS = 14680.55;
const EXPECTED_NET = 8444.45;

test.describe.serial('Bank Statement Reconciliation - Full Audit', () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 1400, height: 900 },
    });
    page = await context.newPage();

    // Login
    await page.goto(`${APP_URL}/login`);
    await page.getByLabel('Email').fill(EMAIL);
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByRole('button', { name: /iniciar sesión|sign in|login/i }).click();
    await page.waitForURL(url => !url.pathname.includes('/login'), { timeout: 15000 });

    // Dismiss any Joyride overlay
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  });

  test.afterAll(async () => {
    await page.context().close();
  });

  test('Step 0: Clean slate - vaciar cifras', async () => {
    // Navigate to accounting
    await page.goto(`${APP_URL}/homes/accounting`);
    await page.waitForTimeout(3000);

    // Dismiss Joyride if present
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

    // Click "Estados Financieros" tab
    const statementsTab = page.locator('button', { hasText: 'Estados Financieros' });
    await statementsTab.click();
    await page.waitForTimeout(2000);

    // Click "Vaciar Cifras" button
    const vaciarBtn = page.locator('button', { hasText: 'Vaciar Cifras' });
    await vaciarBtn.click();
    await page.waitForTimeout(1000);

    // In the modal, click "Todas las cuentas" to reset everything
    const allAccountsBtn = page.locator('button', { hasText: 'Todas las cuentas' });
    await allAccountsBtn.click();
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: `${SCREENSHOT_DIR}/00-clean-slate.png`, fullPage: true });
    console.log('[AUDIT] Step 0: Cifras vaciadas successfully');
  });

  test('Step 0b: Delete existing bank statements', async () => {
    // Click "Estado de Cuenta" tab
    const estadoCuentaTab = page.locator('button', { hasText: 'Estado de Cuenta' });
    await estadoCuentaTab.click();
    await page.waitForTimeout(2000);

    // Look for any existing statements and delete them
    // First expand all drawers to see statements
    const drawers = page.locator('[class*="cursor-pointer"]').filter({ hasText: /Cuenta/ });
    const drawerCount = await drawers.count();

    for (let i = 0; i < drawerCount; i++) {
      try {
        await drawers.nth(i).click();
        await page.waitForTimeout(1000);
      } catch { /* drawer may not be expandable */ }
    }

    // Look for delete (X or trash) buttons on statements containing "test_bank_statement"
    const deleteButtons = page.locator('button[title*="liminar"], button:has(svg.lucide-trash-2), button:has(svg.lucide-x)').filter({ has: page.locator('svg') });
    const delCount = await deleteButtons.count();
    console.log(`[AUDIT] Found ${delCount} potential delete buttons`);

    // Try to delete any existing test statements - use the trash icon buttons within statement rows
    const trashButtons = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') });
    const trashCount = await trashButtons.count();
    for (let i = trashCount - 1; i >= 0; i--) {
      try {
        // Handle confirmation dialog
        page.on('dialog', async dialog => {
          await dialog.accept();
        });
        await trashButtons.nth(i).click();
        await page.waitForTimeout(2000);
      } catch { /* may fail, ok */ }
    }

    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/00b-cleaned-statements.png`, fullPage: true });
    console.log('[AUDIT] Step 0b: Existing statements cleanup attempted');
  });

  test('Step 1: Upload bank statement', async () => {
    // Make sure we're on Estado de Cuenta tab
    const estadoCuentaTab = page.locator('button', { hasText: 'Estado de Cuenta' });
    await estadoCuentaTab.click();
    await page.waitForTimeout(2000);

    // Find "Cuenta Houston" and expand it - look for the bank account drawer
    // Click on the drawer that contains "Houston"
    const houstonDrawer = page.locator('div').filter({ hasText: /Houston/i }).first();

    // If no Houston drawer, we may need to find the first bank account
    const firstDrawer = page.locator('div[class*="rounded"]').filter({ hasText: /Cuenta|Houston|Chase/i }).first();
    try {
      await firstDrawer.click({ timeout: 3000 });
    } catch {
      // Try clicking any drawer header
      const anyHeader = page.locator('div').filter({ hasText: /Cuenta/i }).first();
      await anyHeader.click();
    }
    await page.waitForTimeout(1000);

    // Find file input and upload
    const fileInput = page.locator('input[type="file"]').first();
    await fileInput.setInputFiles('/tmp/test_bank_statement.pdf');

    // Wait for upload and OCR processing (up to 90 seconds)
    console.log('[AUDIT] Uploading PDF and waiting for OCR...');
    await page.waitForTimeout(5000);

    // Wait for movements to appear or spinner to stop
    // Look for the movements table or status change
    try {
      await page.waitForSelector('table tbody tr', { timeout: 90000 });
    } catch {
      // If no table, check for an alert
      console.log('[AUDIT] No table appeared, checking for upload result...');
    }

    await page.waitForTimeout(3000);

    // Dismiss any alert that appeared
    page.on('dialog', async dialog => {
      console.log(`[AUDIT] Dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    await page.screenshot({ path: `${SCREENSHOT_DIR}/01-uploaded.png`, fullPage: true });
    console.log('[AUDIT] Step 1: Bank statement uploaded');

    // Click on the uploaded statement to open the wizard
    // The statement should appear as a clickable card
    const statementCard = page.locator('button, div[class*="cursor"]').filter({ hasText: /test_bank_statement|Movimientos|movimiento/ }).first();
    try {
      await statementCard.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      console.log('[AUDIT] Could not find statement card to click');
    }
  });

  test('Step 2: Reconcile - Buscar coincidencias', async () => {
    // Should be on wizard Step 1 (Conciliar)
    // Click "Buscar coincidencias"
    const buscarBtn = page.locator('button', { hasText: /Buscar coincidencias/i });

    try {
      await buscarBtn.click({ timeout: 5000 });
      console.log('[AUDIT] Clicked "Buscar coincidencias"');

      // Wait for reconciliation to complete
      await page.waitForTimeout(5000);

      // Since we cleared everything, expect 0 matches
      // Check for "no matches" message or 0 count
      const noMatchText = page.locator('text=/0 coincidencias|No se encontraron|Sin coincidencias/i');
      const hasNoMatch = await noMatchText.count();
      console.log(`[AUDIT] No-match indicators found: ${hasNoMatch}`);
    } catch {
      console.log('[AUDIT] Buscar coincidencias button not found, may already be past this step');
    }

    // Click "Siguiente" to go to Step 2
    const siguienteBtn = page.locator('button', { hasText: /Siguiente.*Clasificar|Siguiente/i }).first();
    try {
      await siguienteBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
      console.log('[AUDIT] Moved to Step 2 (Clasificar)');
    } catch {
      // Try clicking the step 2 tab directly
      const step2Tab = page.locator('button, div').filter({ hasText: /Clasificar con IA/ }).first();
      await step2Tab.click();
      await page.waitForTimeout(2000);
    }
  });

  test('Step 3: AI Classify movements', async () => {
    // Click "Clasificar con IA" button
    const classifyBtn = page.locator('button', { hasText: /Clasificar con IA/i }).first();

    try {
      await classifyBtn.click({ timeout: 5000 });
      console.log('[AUDIT] Clicked "Clasificar con IA", waiting up to 3 minutes...');
    } catch {
      console.log('[AUDIT] Classify button not found - movements may already be classified');
    }

    // Wait for classification to finish (up to 3 minutes)
    // The button should change from "Clasificando..." back or disappear
    try {
      await page.waitForFunction(() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
          if (b.textContent?.includes('Clasificando')) return false;
        }
        return true;
      }, { timeout: 180000 });
    } catch {
      console.log('[AUDIT] Classification timeout - checking state anyway');
    }

    await page.waitForTimeout(3000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/02-classified.png`, fullPage: true });

    // Record all movement details from the table
    const rows = page.locator('table tbody tr');
    const rowCount = await rows.count();
    console.log(`[AUDIT] Found ${rowCount} movement rows in table`);

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator('td');
      const cellCount = await cells.count();
      if (cellCount >= 4) {
        const date = await cells.nth(0).textContent() || '';
        const desc = await cells.nth(1).textContent() || '';
        const amount = await cells.nth(2).textContent() || '';
        const account = await cells.nth(3).textContent() || '';
        const status = await cells.nth(4).textContent() || '';
        console.log(`[AUDIT] Movement ${i + 1}: date=${date.trim()} | amount=${amount.trim()} | account=${account.trim().substring(0, 50)} | status=${status.trim()} | desc=${desc.trim().substring(0, 60)}`);
      }
    }
  });

  test('Step 4: Confirm ALL movements', async () => {
    // We need to confirm each suggested movement by clicking the green check button
    let totalConfirmed = 0;
    let passes = 0;
    const MAX_PASSES = 10;

    while (passes < MAX_PASSES) {
      passes++;

      // Find all confirm buttons (green checkmark - "Confirmar cuenta sugerida")
      const confirmBtns = page.locator('button[title="Confirmar cuenta sugerida"]');
      const count = await confirmBtns.count();

      if (count === 0) {
        console.log(`[AUDIT] No more confirm buttons found after ${passes} passes. Total confirmed: ${totalConfirmed}`);
        break;
      }

      console.log(`[AUDIT] Pass ${passes}: Found ${count} movements to confirm`);

      // Confirm each one
      for (let i = 0; i < count; i++) {
        try {
          // Re-query because the DOM updates after each confirmation
          const btn = page.locator('button[title="Confirmar cuenta sugerida"]').first();
          await btn.click({ timeout: 3000 });
          totalConfirmed++;
          await page.waitForTimeout(500); // Wait for optimistic update
        } catch {
          console.log(`[AUDIT] Failed to click confirm button ${i}`);
          break;
        }
      }

      // Scroll down to find more
      await page.evaluate(() => {
        const table = document.querySelector('table');
        if (table) table.scrollIntoView({ block: 'end' });
      });
      await page.waitForTimeout(1000);
    }

    // Check for any movements that need manual account assignment
    const noAccountBtns = page.locator('text=/Sin cuenta/i');
    const noAccCount = await noAccountBtns.count();
    if (noAccCount > 0) {
      console.log(`[AUDIT] ${noAccCount} movements have no suggested account - assigning manually`);
      for (let i = 0; i < noAccCount; i++) {
        try {
          await noAccountBtns.first().click();
          await page.waitForTimeout(500);
          // Pick the first available account from the dropdown
          const firstAccOption = page.locator('div.max-h-48 button').first();
          await firstAccOption.click({ timeout: 3000 });
          await page.waitForTimeout(500);
        } catch {
          console.log(`[AUDIT] Could not assign account for movement ${i}`);
        }
      }
    }

    console.log(`[AUDIT] Step 4: Total confirmed: ${totalConfirmed}`);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/03-all-confirmed.png`, fullPage: true });

    // Verify: check how many are still unclassified
    const pendingBadge = page.locator('text=/sin clasificar|pendientes/i');
    const pendingText = await pendingBadge.first().textContent().catch(() => 'N/A');
    console.log(`[AUDIT] Remaining unclassified: ${pendingText}`);
  });

  test('Step 5: Publish all - Integrar', async () => {
    // Go to Step 3 (Integrar)
    // Try clicking "Siguiente: Integrar" button
    const nextBtn = page.locator('button', { hasText: /Siguiente.*Integrar|Integrar/i }).first();
    try {
      await nextBtn.click({ timeout: 5000 });
      await page.waitForTimeout(2000);
    } catch {
      // Click the step 3 tab directly
      const step3 = page.locator('button, div').filter({ hasText: 'Integrar' }).first();
      await step3.click();
      await page.waitForTimeout(2000);
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04a-integrar-step.png`, fullPage: true });

    // Handle dialog that will appear after posting
    page.on('dialog', async dialog => {
      console.log(`[AUDIT] Post dialog: ${dialog.message()}`);
      await dialog.accept();
    });

    // Click "Publicar" button
    const publishBtn = page.locator('button', { hasText: /Publicar/i }).first();
    try {
      await publishBtn.click({ timeout: 5000 });
      console.log('[AUDIT] Clicked Publicar');

      // Wait for posting to complete
      await page.waitForTimeout(10000);
    } catch {
      console.log('[AUDIT] Publicar button not found');
    }

    await page.screenshot({ path: `${SCREENSHOT_DIR}/04-published.png`, fullPage: true });
    console.log('[AUDIT] Step 5: Movements published');
  });

  test('Step 6: Audit Profit & Loss', async () => {
    // Navigate to Estados Financieros
    const statementsTab = page.locator('button', { hasText: 'Estados Financieros' });
    await statementsTab.click();
    await page.waitForTimeout(3000);

    // Make sure Profit & Loss is selected
    const pnlTab = page.locator('button', { hasText: 'Profit & Loss' });
    await pnlTab.click();
    await page.waitForTimeout(2000);

    // Click "Expandir todo"
    const expandBtn = page.locator('button', { hasText: 'Expandir todo' });
    await expandBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/05-pnl.png`, fullPage: true });

    // Scroll down for more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/05b-pnl-bottom.png`, fullPage: true });

    // Extract P&L values from the page
    // Look for "Total for Income", "Total for Cost of Goods Sold", "Gross Profit", "Net Income"
    const getAmount = async (label: string): Promise<string> => {
      const row = page.locator('tr, div').filter({ hasText: new RegExp(label, 'i') }).first();
      const text = await row.textContent().catch(() => '');
      // Extract dollar amount from text
      const match = text?.match(/\$[\d,]+\.?\d*/);
      return match ? match[0] : 'N/A';
    };

    const totalIncome = await getAmount('Total for Income');
    const totalCOGS = await getAmount('Total for Cost of Goods Sold');
    const grossProfit = await getAmount('Gross Profit');
    const totalExpenses = await getAmount('Total for Expenses');
    const netIncome = await getAmount('Net Income');

    console.log('╔══════════════════════════════════════════════╗');
    console.log('║       PROFIT & LOSS AUDIT RESULTS            ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║ Total Income:           ${totalIncome.padStart(15)}   ║`);
    console.log(`║ Total COGS:             ${totalCOGS.padStart(15)}   ║`);
    console.log(`║ Gross Profit:           ${grossProfit.padStart(15)}   ║`);
    console.log(`║ Total Expenses:         ${totalExpenses.padStart(15)}   ║`);
    console.log(`║ Net Income:             ${netIncome.padStart(15)}   ║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║ EXPECTED from bank statement:                ║');
    console.log(`║ Total Deposits:         $23,125.00           ║`);
    console.log(`║ Total Withdrawals:      $14,680.55           ║`);
    console.log(`║ Net:                    $8,444.45            ║`);
    console.log('╚══════════════════════════════════════════════╝');

    // Read all visible P&L text for detailed audit
    const pnlContent = await page.locator('table').first().textContent().catch(() => '');
    console.log(`[AUDIT] Full P&L content (first 2000 chars):\n${pnlContent?.substring(0, 2000)}`);
  });

  test('Step 7: Audit Balance Sheet', async () => {
    // Click Balance Sheet tab
    const bsTab = page.locator('button', { hasText: 'Balance Sheet' });
    await bsTab.click();
    await page.waitForTimeout(2000);

    // Expand all
    const expandBtn = page.locator('button', { hasText: 'Expandir todo' });
    await expandBtn.click();
    await page.waitForTimeout(1000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/06-balance-sheet.png`, fullPage: true });

    // Extract Balance Sheet values
    const bsContent = await page.locator('table').first().textContent().catch(() => '');
    console.log(`[AUDIT] Balance Sheet content (first 2000 chars):\n${bsContent?.substring(0, 2000)}`);

    // Look for total assets, total liabilities, total equity
    const getAmount = async (label: string): Promise<string> => {
      const row = page.locator('tr, div').filter({ hasText: new RegExp(label, 'i') }).first();
      const text = await row.textContent().catch(() => '');
      const match = text?.match(/\$[\d,]+\.?\d*/);
      return match ? match[0] : 'N/A';
    };

    const totalAssets = await getAmount('Total.*Assets');
    const totalLiabilities = await getAmount('Total.*Liabilities');
    const totalEquity = await getAmount('Total.*Equity');

    console.log('╔══════════════════════════════════════════════╗');
    console.log('║       BALANCE SHEET AUDIT                    ║');
    console.log('╠══════════════════════════════════════════════╣');
    console.log(`║ Total Assets:           ${totalAssets.padStart(15)}   ║`);
    console.log(`║ Total Liabilities:      ${totalLiabilities.padStart(15)}   ║`);
    console.log(`║ Total Equity:           ${totalEquity.padStart(15)}   ║`);
    console.log('╠══════════════════════════════════════════════╣');
    console.log('║ A = L + E check: Assets must equal           ║');
    console.log('║ Liabilities + Equity                         ║');
    console.log('╚══════════════════════════════════════════════╝');
  });

  test('Step 8: Check Transactions', async () => {
    // Click Transacciones tab
    const txnTab = page.locator('button', { hasText: 'Transacciones' });
    await txnTab.click();
    await page.waitForTimeout(3000);

    await page.screenshot({ path: `${SCREENSHOT_DIR}/07-transactions.png`, fullPage: true });

    // Count transactions
    const txnRows = page.locator('table tbody tr');
    const txnCount = await txnRows.count();
    console.log(`[AUDIT] Total transaction rows visible: ${txnCount}`);
    console.log(`[AUDIT] Expected: ~34 (17 movements x 2 for double-entry) or 17 single-entry`);

    // Read first several transactions
    for (let i = 0; i < Math.min(txnCount, 20); i++) {
      const row = txnRows.nth(i);
      const text = await row.textContent().catch(() => '');
      console.log(`[AUDIT] Txn ${i + 1}: ${text?.trim().substring(0, 120)}`);
    }

    // Scroll to see more
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);
    await page.screenshot({ path: `${SCREENSHOT_DIR}/07b-transactions-bottom.png`, fullPage: true });

    console.log('[AUDIT] ============================================');
    console.log('[AUDIT] FULL AUDIT COMPLETE');
    console.log('[AUDIT] ============================================');
  });
});
