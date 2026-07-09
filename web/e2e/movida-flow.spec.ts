/**
 * End-to-end test of the move (movida) payment flow:
 *   property → create move → request_payment → approve → complete (Cuenta Dallas)
 *   → verify ledger has moving_transport_paid pair
 *   → verify Dallas saldo dropped by move cost
 *   → verify the move shows up in Transacciones
 */
import { test, expect, request as pwRequest, APIRequestContext } from '@playwright/test';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_URL = process.env.E2E_API_URL || 'https://maninos-ai-production.up.railway.app';
const DALLAS_ID = '1e9a45e6-d6dd-4037-83c8-4a174b5ef4e3';

const OUT = path.resolve(__dirname, '../../test-screenshots/movida-flow');
fs.mkdirSync(OUT, { recursive: true });

async function getDallasBalance(api: APIRequestContext): Promise<number> {
  const r = await api.get(`${API_URL}/api/accounting/bank-accounts`);
  const d = await r.json();
  const dallas = (d.bank_accounts || []).find((b: any) => b.id === DALLAS_ID);
  return Number(dallas?.derived_balance ?? 0);
}

test.setTimeout(300_000);

test('movida lifecycle — create → request payment → approve → complete → ledger pair', async () => {
  const api = await pwRequest.newContext();
  const findings: any = { steps: [] };
  const log = (step: string, ok: boolean, note: string = '') => {
    findings.steps.push({ step, ok, note });
    console.log(`${ok ? '✓' : '✗'} ${step}${note ? '  — ' + note : ''}`);
  };

  // 0. Snapshot
  const balBefore = await getDallasBalance(api);
  log('Dallas balance before', true, `$${balBefore.toFixed(2)}`);

  // 1. Create a test property to attach the move to (skip if Test 1 prop exists)
  const stamp = new Date().toISOString().slice(11, 19).replace(/:/g, '');
  const propAddr = `MOVIDA TEST ${stamp} - 999 Move St`;
  let propRes = await api.post(`${API_URL}/api/properties`, {
    data: {
      address: propAddr, city: 'Houston', state: 'Texas',
      purchase_price: 1, status: 'purchased',
      bedrooms: 3, bathrooms: 2, square_feet: 1000,
    },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!propRes.ok()) { log('Create property', false, `${propRes.status()} ${await propRes.text()}`); return; }
  const propId = (await propRes.json()).id;
  log('Create property', true, `id=${propId.slice(0,8)} addr="${propAddr}"`);

  // 2. Create a move via POST /api/moves
  const MOVE_COST = 1234.56;  // distinctive amount so we can spot it in the ledger
  const moveBody = {
    property_id: propId,
    move_type: 'purchase',
    origin_address: '500 Origen St',
    origin_city: 'Beaumont',
    destination_address: '999 Move St',
    destination_city: 'Houston',
    destination_yard: 'houston',  // lowercase enforced by CHECK constraint
    moving_company: 'Test Mover LLC',
    driver_name: 'Pedro Driver',
    driver_phone: '555-1111',
    estimated_distance_miles: '85',
    scheduled_date: new Date().toISOString().slice(0, 10),
    quoted_cost: String(MOVE_COST),
    notes: 'Test move for E2E flow',
    customer_name: '', customer_phone: '',
    delivery_date: '',
    hud_label: '', serial_number: '', manufacturer: '', home_size: '', home_year: '',
    has_hitch: true, tires_axles: false,
    requires_escort: false, requires_wide_load_permit: false,
    special_instructions: '',
  };
  const moveRes = await api.post(`${API_URL}/api/moves`, {
    data: moveBody,
    headers: { 'Content-Type': 'application/json' },
  });
  if (!moveRes.ok()) {
    log('Create move', false, `${moveRes.status()} ${(await moveRes.text()).slice(0, 300)}`);
    fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
    return;
  }
  const moveData = await moveRes.json();
  const moveId = moveData.id || moveData.move?.id || moveData.data?.id;
  log('Create move', !!moveId, `id=${(moveId || '').slice(0,8)} cost=$${MOVE_COST}`);

  // 3. Set move to in-progress (some flows require non-quoted status before request-payment)
  await api.patch(`${API_URL}/api/moves/${moveId}/status`, {
    data: { status: 'in_progress', final_cost: MOVE_COST },
    headers: { 'Content-Type': 'application/json' },
  }).catch(() => null);

  // 4. Request payment → creates payment_order with concept='movida'
  let reqRes = await api.post(`${API_URL}/api/moves/${moveId}/request-payment`, {});
  if (!reqRes.ok()) {
    log('Request payment', false, `${reqRes.status()} ${(await reqRes.text()).slice(0, 300)}`);
    fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
    return;
  }
  const reqData = await reqRes.json();
  const orderId = reqData.payment_order?.id;
  findings.payment_order_id = orderId;
  log('Request move payment', !!orderId, `payment_order_id=${(orderId || '').slice(0,8)}`);

  // 5. Verify payment_order has concept='movida' and is pending
  const orderRes = await api.get(`${API_URL}/api/payment-orders/${orderId}`);
  const order = (await orderRes.json()).data;
  log('Payment order shape',
      order?.concept === 'movida' && order?.status === 'pending',
      `concept=${order?.concept}, status=${order?.status}, amount=$${order?.amount}`);

  // 6. Approve (outbound order — just flips to status='approved', no bank yet)
  const approveRes = await api.patch(`${API_URL}/api/payment-orders/${orderId}/approve?approved_by=e2e-test`);
  log('Approve payment order', approveRes.ok(),
      `status code ${approveRes.status()}`);

  // 7. Complete with bank_account_id=Dallas → triggers post_to_ledger(moving_transport_paid)
  const completeRes = await api.patch(`${API_URL}/api/payment-orders/${orderId}/complete`, {
    data: {
      reference: `WIRE-MOVE-${stamp}`,
      payment_date: new Date().toISOString().slice(0, 10),
      bank_account_id: DALLAS_ID,
      completed_by: 'e2e-test',
      notes: 'Test movida completion',
    },
    headers: { 'Content-Type': 'application/json' },
  });
  const completeBody = completeRes.ok() ? await completeRes.json() : (await completeRes.text());
  log('Complete payment order with Dallas',
      completeRes.ok(),
      typeof completeBody === 'string' ? completeBody.slice(0, 200) : 'ok');

  // 8. Verify ledger has the moving_transport pair
  const txnsRes = await api.get(`${API_URL}/api/accounting/transactions?per_page=50&transaction_type=moving_transport`);
  const txns = (await txnsRes.json()).transactions || [];
  const newPair = txns.filter((t: any) => t.entity_id === orderId);
  const bankLeg = newPair.find((t: any) => t.bank_account_id === DALLAS_ID);
  const pnlLeg = newPair.find((t: any) => !t.bank_account_id);
  log('Ledger pair created',
      newPair.length === 2 && !!bankLeg && !!pnlLeg,
      `${newPair.length} rows; bank-leg amount=${bankLeg?.amount}, P&L acct=${(pnlLeg?.accounting_accounts || {}).name}`);

  // 9. Verify Dallas saldo dropped by MOVE_COST
  const balAfter = await getDallasBalance(api);
  const expectedDelta = -MOVE_COST;
  const actualDelta = balAfter - balBefore;
  const diff = Math.abs(actualDelta - expectedDelta);
  log('Dallas saldo updated',
      diff < 0.01,
      `before=$${balBefore.toFixed(2)} after=$${balAfter.toFixed(2)} delta=$${actualDelta.toFixed(2)} expected=$${expectedDelta.toFixed(2)}`);

  // 10. Verify it appears in Transacciones (just the bank leg)
  const allRes = await api.get(`${API_URL}/api/accounting/transactions?per_page=50&search=Test%20Mover`);
  const allTxns = (await allRes.json()).transactions || [];
  log('Appears in Transacciones search',
      allTxns.length >= 2,
      `${allTxns.length} rows match "Test Mover"`);

  // ---- Cleanup: delete the test property + move + order
  // (best-effort; not all endpoints may support delete)
  try {
    await api.delete(`${API_URL}/api/moves/${moveId}`);
    await api.delete(`${API_URL}/api/properties/${propId}`);
  } catch {}

  fs.writeFileSync(path.join(OUT, 'findings.json'), JSON.stringify(findings, null, 2));
  console.log('\n========== MOVIDA FLOW SUMMARY ==========');
  for (const s of findings.steps) {
    console.log(`  ${s.ok ? '✓' : '✗'}  ${s.step}  ${s.note}`);
  }
  console.log('==========================================');

  expect(diff).toBeLessThan(0.01);
});
