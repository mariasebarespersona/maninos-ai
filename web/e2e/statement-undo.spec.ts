/**
 * Statement upload → publish → DELETE roundtrip.
 *
 * Verifies the new cascading-delete behavior: after uploading a bank
 * statement, classifying its movements and publishing them, deleting
 * the statement should restore the bank's derived saldo to exactly
 * what it was before the upload.
 *
 * API-driven (no UI clicks) for reliability.
 */
import { test, expect, request as pwRequest } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const DALLAS_ID = '1e9a45e6-d6dd-4037-83c8-4a174b5ef4e3';
const PDF_PATH = '/Users/mariasebares/Desktop/Cuenta_Dallas_Statement_TEST.pdf';

const OUT = path.resolve(__dirname, '../../test-screenshots/statement-undo');
fs.mkdirSync(OUT, { recursive: true });

async function getDallasBalance(api: any): Promise<number> {
  const res = await api.get(`${API_URL}/api/accounting/bank-accounts`);
  const data = await res.json();
  const dallas = (data.bank_accounts || []).find((b: any) => b.id === DALLAS_ID);
  return Number(dallas?.derived_balance ?? dallas?.current_balance ?? 0);
}

test.setTimeout(300_000);

test('upload bank statement → publish → delete restores saldo', async () => {
  const api = await pwRequest.newContext();
  const findings: any = { steps: [] };
  const log = (step: string, ok: boolean, note: string = '') => {
    findings.steps.push({ step, ok, note });
    console.log(`${ok ? '✓' : '✗'} ${step}${note ? '  — ' + note : ''}`);
  };

  // 0. Snapshot Dallas saldo BEFORE anything
  const balBefore = await getDallasBalance(api);
  findings.balance_before = balBefore;
  log('Initial Dallas balance', true, `$${balBefore.toFixed(2)}`);

  if (!fs.existsSync(PDF_PATH)) {
    log('PDF not found', false, `${PDF_PATH}`);
    findings.error = 'PDF missing';
    fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
    return;
  }

  // 1. Upload the PDF as a Dallas statement
  const pdfBuf = fs.readFileSync(PDF_PATH);
  const uploadRes = await api.post(`${API_URL}/api/accounting/bank-statements`, {
    multipart: {
      bank_account_id: DALLAS_ID,
      file: {
        name: 'Cuenta_Dallas_Statement_TEST.pdf',
        mimeType: 'application/pdf',
        buffer: pdfBuf,
      },
    },
  });
  if (!uploadRes.ok()) {
    log('Upload statement', false, `${uploadRes.status()} ${(await uploadRes.text()).slice(0, 200)}`);
    return;
  }
  const uploadData = await uploadRes.json();
  const stmtId = uploadData.statement?.id;
  findings.statement_id = stmtId;
  log('Upload statement', true, `id=${stmtId}, ${uploadData.movements?.length || 0} movements parsed`);

  // 2. Run reconcile (find matches with existing Test 1 txns + open invoices)
  const reconcileRes = await api.post(`${API_URL}/api/accounting/bank-statements/${stmtId}/reconcile`, {});
  const reconcileData = await reconcileRes.json();
  log('Reconcile', reconcileRes.ok(), `${reconcileData.matches?.length || 0} matches`);

  // 3. Confirm the matches (auto-select all)
  const matches = reconcileData.matches || [];
  if (matches.length > 0) {
    const pairs = matches.map((m: any) => ({
      movement_id: m.movement_id,
      transaction_id: m.transaction_id || null,
      invoice_id: m.invoice_id || null,
      target_type: m.target_type || (m.invoice_id ? 'invoice' : 'transaction'),
    }));
    const confirmRes = await api.post(`${API_URL}/api/accounting/bank-statements/${stmtId}/reconcile/confirm`, {
      data: { pairs },
      headers: { 'Content-Type': 'application/json' },
    });
    log('Confirm reconciliation', confirmRes.ok(),
        `reconciled ${(await confirmRes.json()).reconciled || 0} pairs`);
  }

  // 4. Try to classify the unmatched ones with AI (best-effort)
  try {
    await api.post(`${API_URL}/api/accounting/bank-statements/${stmtId}/classify`, {});
    log('AI classify', true);
  } catch (e) {
    log('AI classify', false, 'best-effort, skipped');
  }

  // Manually confirm all suggested movements so /post will pick them up
  const stmtDetail = await api.get(`${API_URL}/api/accounting/bank-statements/${stmtId}`);
  const stmtData = await stmtDetail.json();
  const allMvs = stmtData.movements || [];
  for (const mv of allMvs) {
    if (mv.status === 'suggested' && mv.suggested_account_id) {
      await api.patch(`${API_URL}/api/accounting/bank-statements/movements/${mv.id}`, {
        data: { status: 'confirmed', final_account_id: mv.suggested_account_id },
        headers: { 'Content-Type': 'application/json' },
      }).catch(() => null);
    }
  }

  // 5. Publish — creates accounting_transactions for non-reconciled movements
  const postRes = await api.post(`${API_URL}/api/accounting/bank-statements/${stmtId}/post`, {});
  const postData = await postRes.json();
  log('Publish movements', postRes.ok(), `posted=${postData.posted}, skipped=${postData.skipped}`);

  // 6. Snapshot Dallas saldo AFTER publish
  const balAfter = await getDallasBalance(api);
  findings.balance_after_publish = balAfter;
  log('Dallas balance AFTER publish', true,
      `$${balAfter.toFixed(2)}  (delta from initial: ${(balAfter - balBefore).toFixed(2)})`);

  // 7. NOW DELETE the statement and check rollback
  // First, snapshot the movements so we can see what state they were in
  const mvsBeforeDelete = await api.get(`${API_URL}/api/accounting/bank-statements/${stmtId}`);
  const mvsBefore = (await mvsBeforeDelete.json()).movements || [];
  findings.movements_before_delete = mvsBefore.map((m: any) => ({
    id: m.id, status: m.status, transaction_id: m.transaction_id,
    matched_transaction_id: m.matched_transaction_id,
    amount: m.amount, description: m.description?.slice(0, 50),
  }));
  log('Movements before delete', true,
      `${mvsBefore.length} movements, statuses: ${mvsBefore.map((m: any) => m.status).join(',')}`);

  const delRes = await api.delete(`${API_URL}/api/accounting/bank-statements/${stmtId}`);
  const delData = await delRes.json();
  findings.delete_response = delData;
  log('Delete statement', delRes.ok(),
      `reverted_existing=${delData.reverted_existing}, deleted_new_pairs=${delData.deleted_new_pairs}, reverted_invoices=${delData.reverted_invoices}, errors=${JSON.stringify(delData.errors || [])}`);

  // 8. Snapshot Dallas saldo AFTER delete — should == initial
  const balRestored = await getDallasBalance(api);
  findings.balance_after_delete = balRestored;
  const diff = Math.abs(balRestored - balBefore);
  log('Dallas balance AFTER delete', diff < 0.01,
      `$${balRestored.toFixed(2)}  (delta from initial: ${(balRestored - balBefore).toFixed(2)})`);

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));

  console.log('\n========== STATEMENT UNDO TEST SUMMARY ==========');
  console.log(`  Initial saldo:     $${balBefore.toFixed(2)}`);
  console.log(`  After publish:     $${balAfter.toFixed(2)}  (delta ${(balAfter - balBefore).toFixed(2)})`);
  console.log(`  After delete:      $${balRestored.toFixed(2)}  (delta ${(balRestored - balBefore).toFixed(2)})`);
  console.log(`  ROLLBACK ${diff < 0.01 ? 'CORRECT ✓' : 'BROKEN ✗ — saldo did not restore'}`);
  console.log('==================================================');

  expect(diff).toBeLessThan(0.01);
});
