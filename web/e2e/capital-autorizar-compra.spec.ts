/**
 * E2E contra producción — "Autorizar compra" (Comité de Inversión + VoBo).
 *
 *  1. Una propuesta de OTRA persona llega al comité. Desde la pantalla:
 *     se piden ajustes de renta → vuelve a quien propuso (ajustes); quien
 *     propuso la corrige (se recalcula el margen) y la reenvía (versión 2);
 *     el comité la aprueba → pasa al VoBo; se da el VoBo → aprobada. El KPI
 *     "tiempo de solicitud a decisión" y el acta de comité (PDF) existen.
 *  2. Quien propone no vota: con su propia propuesta, la pantalla no ofrece
 *     votar y la API lo rechaza (403). Aprobar "por las bravas" con PATCH
 *     también se rechaza, y no se borra lo que ya pasó por el comité.
 *
 * Solo datos de capital_purchase_proposals (+ votos en cascada), borrados al
 * final. Necesita las migraciones 120 y 121, SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY y E2E_CAPITAL_EMAIL + E2E_CAPITAL_PASSWORD.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EAC${Date.now() % 100000}`
const OTRO = `e2e-proponente-${PCODE.toLowerCase()}@maninos.com`

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

let sb: SupabaseClient

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      for (const k of ['maninos_tour_completed_capital', 'maninos_tour_page_capital__capital']) localStorage.setItem(k, 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_CAPITAL_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_CAPITAL_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_CAPITAL_EMAIL', 'E2E_CAPITAL_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
})

test.afterAll(async () => {
  if (sb) await sb.from('capital_purchase_proposals').delete().ilike('casa', `%${PCODE}%`)
})

test('Comité pide ajustes → se corrige y reenvía → comité aprueba → VoBo → aprobada; acta y KPI', async ({ page, request }) => {
  test.setTimeout(240000)
  // Propuesta de otra persona, enviada al comité
  const c = await request.post(`${APP_URL}/api/capital/purchase-proposals`, {
    data: { origen: 'mercado', casa: `${PCODE} Comité`, precio: 30000, enganche: 3000, plazo_meses: 36, mensualidad: 1100, created_by: OTRO },
  })
  expect(c.status(), await c.text()).toBe(200)
  const id = (await c.json()).proposal.id
  const sub = await request.post(`${APP_URL}/api/capital/purchase-proposals/${id}/submit`, { data: { submitted_by: OTRO } })
  expect(sub.status(), await sub.text()).toBe(200)

  await login(page)
  await page.goto(`${APP_URL}/capital/autorizaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const card = page.getByTestId(`autorizacion-${id}`)
  await expect(card).toBeVisible({ timeout: 45000 })
  await expect(card.getByTestId('estado')).toHaveText('En comité')

  // 1. El comité pide ajustes de renta
  await card.getByTestId('btn-ajustes').click()
  await card.locator('label:text-is("Renta mensual")').locator('xpath=..').locator('input').fill('1425')
  await card.getByTestId('motivo-ajuste').fill('E2E: subir la renta para llegar al 30%')
  await card.getByTestId('confirmar-ajustes').click()
  await expect(card.getByTestId('estado')).toHaveText('Ajustes pedidos', { timeout: 20000 })
  await expect(card.getByTestId('votos')).toContainText('pide ajustes')
  await expect(card.getByTestId('votos')).toContainText('renta $1,425.00')

  // 2. Quien propuso corrige (el servidor recalcula) y reenvía
  const put = await request.put(`${APP_URL}/api/capital/purchase-proposals/${id}`, { data: { mensualidad: 1425, edited_by: OTRO } })
  expect(put.status(), await put.text()).toBe(200)
  const corr = (await put.json()).proposal
  expect(Number(corr.margen_anual)).toBe(0.3)
  expect(corr.semaforo).toBe('verde')
  // Otro usuario no puede corregir la propuesta ajena
  expect((await request.put(`${APP_URL}/api/capital/purchase-proposals/${id}`, { data: { mensualidad: 2000, edited_by: process.env.E2E_CAPITAL_EMAIL } })).status()).toBe(403)
  expect((await request.post(`${APP_URL}/api/capital/purchase-proposals/${id}/submit`, { data: { submitted_by: OTRO } })).status()).toBe(200)

  // 3. Comité aprueba → VoBo
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(card.getByTestId('estado')).toHaveText('En comité', { timeout: 45000 })
  await expect(card).toContainText('versión 2')
  await card.getByTestId('btn-aprobar').click()
  await card.getByTestId('confirmar-voto').click()
  await expect(card.getByTestId('estado')).toHaveText('Pendiente de VoBo', { timeout: 20000 })

  // 4. VoBo final → aprobada
  await card.getByTestId('btn-aprobar').click()
  await card.getByTestId('confirmar-voto').click()
  await page.getByRole('button', { name: /^Decididas/ }).click()
  await expect(card.getByTestId('estado')).toHaveText('Aprobada', { timeout: 20000 })

  const row = (await sb.from('capital_purchase_proposals').select('*').eq('id', id).single()).data!
  expect(row).toMatchObject({ status: 'aprobada', version: 2, decided_by: process.env.E2E_CAPITAL_EMAIL })
  expect(row.requested_at).toBeTruthy()
  const votos = (await sb.from('capital_proposal_votes').select('etapa, decision, proposal_version').eq('proposal_id', id).order('created_at')).data || []
  expect(votos.map(v => `${v.etapa}:${v.decision}:v${v.proposal_version}`)).toEqual(['comite:ajustes:v1', 'comite:aprobar:v2', 'vobo:aprobar:v2'])

  // KPI y acta
  await expect(page.getByTestId('kpi-dias')).toContainText('días')
  const acta = await request.get(`${APP_URL}/api/capital/purchase-proposals/${id}/acta`)
  expect(acta.status()).toBe(200)
  expect(acta.headers()['content-type']).toContain('application/pdf')
  expect((await acta.body()).subarray(0, 5).toString()).toBe('%PDF-')

  // Lo que pasó por el comité no se borra ni se "aprueba" por PATCH
  expect((await request.delete(`${APP_URL}/api/capital/purchase-proposals/${id}`)).status()).toBe(400)
})

test('Quien propone no vota su propia propuesta', async ({ page, request }) => {
  test.setTimeout(120000)
  const yo = process.env.E2E_CAPITAL_EMAIL!
  const c = await request.post(`${APP_URL}/api/capital/purchase-proposals`, {
    data: { origen: 'homes', casa: `${PCODE} Propia`, precio: 30000, enganche: 3000, plazo_meses: 36, mensualidad: 1425, created_by: yo },
  })
  const id = (await c.json()).proposal.id
  expect((await request.patch(`${APP_URL}/api/capital/purchase-proposals/${id}`, { data: { status: 'aprobada', decided_by: yo } })).status()).toBe(400)
  expect((await request.post(`${APP_URL}/api/capital/purchase-proposals/${id}/submit`, { data: { submitted_by: yo } })).status()).toBe(200)

  const v = await request.post(`${APP_URL}/api/capital/purchase-proposals/${id}/vote`, { data: { decision: 'aprobar', voter_email: yo } })
  expect(v.status()).toBe(403)
  expect(JSON.stringify(await v.json())).toContain('Quien propone no puede aprobar')

  await login(page)
  await page.goto(`${APP_URL}/capital/autorizaciones`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const card = page.getByTestId(`autorizacion-${id}`)
  await expect(card.getByTestId('no-puedes-votar')).toBeVisible({ timeout: 45000 })
  await expect(card.getByTestId('btn-aprobar')).toHaveCount(0)
})
