/**
 * E2E contra producción, con casa + traspaso de compra desechables (teardown
 * completo, ficheros incluidos):
 *  1. El Bill of Sale de VENTA trae los datos de la casa del de COMPRA
 *     (fabricante, marca, serie, HUD…), y un campo guardado vacío en la venta
 *     no los borra.
 *  2. "Importar PDF" de la Aplicación de cambio de título (compra): el PDF
 *     queda en la casa y en el traspaso, y la serie/HUD siguen donde los lee
 *     el monitor de títulos.
 * Necesita SUPABASE_URL + SERVICE_ROLE_KEY + E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD.
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2ESDP${Date.now() % 100000}`
const BUCKET = 'transaction-documents'

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

const COMPRA = {
  seller_name: 'E2E Vendedor Original',
  buyer_name: 'MANINOS HOMES',
  manufacturer: 'E2E Fabricante',
  make: 'E2E Marca',
  date_manufactured: '2004',
  serial_number: 'E2ESERIE123',
  hud_label_number: 'E2EHUD999',
}

let sb: SupabaseClient
let propId: string
let transferId: string

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      localStorage.setItem('maninos_tour_page_homes__homes_properties', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_STAFF_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

async function openProperty(page: Page) {
  await page.goto(`${APP_URL}/homes/properties/${propId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByRole('button', { name: 'Bill of Sale (Venta)', exact: true })).toBeVisible({ timeout: 30000 })
}

const inputValues = (page: Page) =>
  page.locator('.bos-container input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  for (const k of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'E2E_STAFF_EMAIL', 'E2E_STAFF_PASSWORD']) {
    expect(process.env[k], `${k} missing`).toBeTruthy()
  }
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const p = await sb.from('properties').insert({
    address: 'E2E Sale Docs From Purchase St', city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'purchased', purchase_price: 20000, sale_price: 30000,
    document_data: {
      bos_purchase: COMPRA,
      // Venta guardada con el fabricante VACÍO: no debe borrar el de la compra.
      bos_sale: { manufacturer: '', buyer_name: 'E2E Cliente Venta' },
      title_app_purchase: { section1_serial: 'E2ESERIE123', section1_label: 'E2EHUD999', manufacturer: 'E2E Fabricante' },
    },
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id
  const t = await sb.from('title_transfers').insert({
    property_id: propId, transfer_type: 'purchase', status: 'pending',
    from_name: COMPRA.seller_name, to_name: 'Maninos Homes LLC', documents_checklist: {},
  }).select('id').single()
  expect(t.error).toBeFalsy()
  transferId = t.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
    for (const folder of [transferId, propId]) {
      if (!folder) continue
      const files = (await sb.storage.from(BUCKET).list(folder)).data || []
      if (files.length) await sb.storage.from(BUCKET).remove(files.map(f => `${folder}/${f.name}`))
    }
    await sb.from('documents').delete().eq('property_id', propId)
    await sb.from('title_transfers').delete().eq('property_id', propId)
    await sb.from('notifications').delete().eq('property_id', propId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('El Bill of Sale de venta trae los datos de la casa de la compra', async ({ page }) => {
  test.setTimeout(120000)
  await login(page)
  await openProperty(page)
  await page.getByRole('button', { name: 'Bill of Sale (Venta)', exact: true }).click()
  await expect(page.locator('.bos-container')).toBeVisible({ timeout: 15000 })

  const values = await inputValues(page)
  for (const k of ['manufacturer', 'make', 'date_manufactured', 'serial_number', 'hud_label_number'] as const) {
    expect(values, `falta ${k} de la compra`).toContain(COMPRA[k])
  }
  // Lo propio de la venta se respeta, y el vendedor NO es el de la compra.
  expect(values).toContain('E2E Cliente Venta')
  expect(values).not.toContain(COMPRA.seller_name)
})

test('Importar PDF de la aplicación de título (compra)', async ({ page }) => {
  test.setTimeout(120000)
  await login(page)
  await openProperty(page)

  const pdf = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')
  const input = page.locator('label[title*="aplicación de cambio de título"] input[type="file"]').first()
  await input.setInputFiles({ name: 'aplicacion-titulo-e2e.pdf', mimeType: 'application/pdf', buffer: pdf })

  await expect(page.getByRole('link', { name: /Aplicación Título \(Compra\) — Ver PDF/ })).toBeVisible({ timeout: 30000 })

  const p = await sb.from('properties').select('document_data').eq('id', propId).single()
  const ta = p.data?.document_data?.title_app_purchase
  expect(ta?._uploaded_file).toBe(true)
  expect(ta?.file_name).toBe('aplicacion-titulo-e2e.pdf')
  expect(ta?.file_url).toContain(BUCKET)
  // El monitor de títulos lee la serie y el HUD de aquí: siguen en su sitio.
  expect(ta?.section1_serial).toBe('E2ESERIE123')
  expect(ta?.section1_label).toBe('E2EHUD999')

  let checklistUrl = ''
  for (let i = 0; i < 10 && !checklistUrl; i++) {
    const t = await sb.from('title_transfers').select('documents_checklist').eq('id', transferId).single()
    checklistUrl = t.data?.documents_checklist?.title_application?.file_url || ''
    if (!checklistUrl) await page.waitForTimeout(1500)
  }
  expect(checklistUrl, 'el PDF no llegó al traspaso').toBeTruthy()
})
