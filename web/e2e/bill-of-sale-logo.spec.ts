/**
 * E2E: el logo oficial de Maninos Homes sale en TODOS los Bill of Sale.
 *
 * Contra producción, con casa + traspaso + cliente + venta desechables
 * (teardown completo, ficheros de storage incluidos). Recorre los 4 puntos:
 *   1. plantilla en pantalla (la imagen carga de verdad)
 *   2. Imprimir (la ventana lleva el logo cargado antes de imprimir)
 *   3. Guardar PDF → el PDF que queda en el traspaso lleva el logo
 *   4. PDF del backend (/api/documents/bill-of-sale) lleva el logo
 * Necesita SUPABASE_URL + SERVICE_ROLE_KEY, y el usuario staff de pruebas en
 * E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD (no se versionan: el repo es público).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const PCODE = `E2EBOS${Date.now() % 100000}`
const ADDRESS = 'E2E Bill Of Sale Logo St'
const SELLER = 'E2E Vendedor Logo'
const BUCKET = 'transaction-documents'

function loadRootEnv() {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) return
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

let sb: SupabaseClient
let propId: string
let clientId: string
let saleId: string
let transferId: string

/** The logo PNG is 926x439; every Bill of Sale PDF must embed exactly that image. */
function expectLogoInPdf(pdf: Buffer) {
  const text = pdf.toString('latin1')
  expect(text, 'PDF sin imagen').toMatch(/\/Subtype\s*\/Image/)
  expect(text, 'la imagen no es el logo (926x439)').toMatch(/\/Width 926/)
  expect(text).toMatch(/\/Height 439/)
}

async function loginAsStaff(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
    } catch (e) { /* ignore */ }
    // Imprimir abre una ventana y llama a print(): lo registramos en vez de abrir el diálogo.
    const open = window.open.bind(window)
    window.open = ((...args: Parameters<typeof window.open>) => {
      const w = open(...args)
      if (w) (w as any).print = () => { (w as any).__printed = true }
      return w
    }) as typeof window.open
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_STAFF_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

async function openPurchaseBos(page: Page) {
  await page.goto(`${APP_URL}/homes/properties/${propId}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  const skip = page.getByRole('button', { name: /Omitir tour/i })
  if (await skip.isVisible({ timeout: 3000 }).catch(() => false)) await skip.click().catch(() => {})
  const btn = page.getByRole('button', { name: /Bill of Sale \(Compra\)/ })
  await expect(btn).toBeVisible({ timeout: 30000 })
  await btn.click()
}

test.describe.configure({ mode: 'serial' })

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL missing').toBeTruthy()
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY missing').toBeTruthy()
  expect(process.env.E2E_STAFF_EMAIL, 'E2E_STAFF_EMAIL missing').toBeTruthy()
  expect(process.env.E2E_STAFF_PASSWORD, 'E2E_STAFF_PASSWORD missing').toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  const p = await sb.from('properties').insert({
    address: ADDRESS, city: 'Houston', state: 'Texas',
    property_code: PCODE, status: 'purchased', purchase_price: 20000, sale_price: 30000,
  }).select('id').single()
  expect(p.error).toBeFalsy()
  propId = p.data!.id

  const t = await sb.from('title_transfers').insert({
    property_id: propId, transfer_type: 'purchase', status: 'pending',
    from_name: SELLER, to_name: 'Maninos Homes LLC', documents_checklist: {},
  }).select('id').single()
  expect(t.error).toBeFalsy()
  transferId = t.data!.id

  const c = await sb.from('clients').insert({ name: 'E2E Logo Cliente', status: 'active' })
    .select('id').single()
  expect(c.error).toBeFalsy()
  clientId = c.data!.id

  const s = await sb.from('sales').insert({
    property_id: propId, client_id: clientId, sale_type: 'contado', sale_price: 30000, status: 'pending',
  }).select('id').single()
  expect(s.error).toBeFalsy()
  saleId = s.data!.id
})

test.afterAll(async () => {
  if (!sb) return
  try {
    const files = (await sb.storage.from(BUCKET).list(transferId)).data || []
    if (files.length) await sb.storage.from(BUCKET).remove(files.map(f => `${transferId}/${f.name}`))
    if (saleId) await sb.from('sales').delete().eq('id', saleId)
    await sb.from('title_transfers').delete().eq('property_id', propId)
    await sb.from('notifications').delete().eq('property_id', propId)
    if (clientId) await sb.from('clients').delete().eq('id', clientId)
    if (propId) await sb.from('properties').delete().eq('id', propId)
  } catch (e) { console.warn('teardown warning:', e) }
})

test('Plantilla en pantalla e Imprimir muestran el logo oficial', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsStaff(page)
  await openPurchaseBos(page)

  const logo = page.locator('img.bos-logo-img')
  await expect(logo).toBeVisible({ timeout: 15000 })
  await expect(logo).toHaveAttribute('src', '/images/bill-of-sale-logo.png')
  await expect.poll(() => logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(926)

  const [popup] = await Promise.all([
    page.waitForEvent('popup'),
    page.getByRole('button', { name: /Imprimir/ }).click(),
  ])
  await expect.poll(() => popup.evaluate(() => (window as any).__printed === true), { timeout: 15000 }).toBe(true)
  const printed = await popup.evaluate(() => {
    const img = document.querySelector('img.bos-logo-img') as HTMLImageElement | null
    return img ? { w: img.naturalWidth, src: img.src } : null
  })
  expect(printed, 'la ventana de impresión no lleva el logo').not.toBeNull()
  expect(printed!.w, 'el logo no había cargado al imprimir').toBe(926)
  await popup.close()
})

test('Guardar PDF deja en el traspaso un Bill of Sale con el logo', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsStaff(page)
  await openPurchaseBos(page)

  await page.getByPlaceholder('Nombre vendedor').fill(SELLER)
  await page.getByRole('button', { name: /Guardar PDF/ }).click()

  let fileUrl = ''
  for (let i = 0; i < 20 && !fileUrl; i++) {
    await page.waitForTimeout(1500)
    const t = await sb.from('title_transfers').select('documents_checklist').eq('id', transferId).single()
    fileUrl = t.data?.documents_checklist?.bill_of_sale?.file_url || ''
  }
  expect(fileUrl, 'el PDF no llegó al traspaso').toBeTruthy()

  const storagePath = decodeURIComponent(fileUrl.split(`/${BUCKET}/`)[1].split('?')[0])
  const dl = await sb.storage.from(BUCKET).download(storagePath)
  expect(dl.error).toBeFalsy()
  const pdf = Buffer.from(await dl.data!.arrayBuffer())
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  expectLogoInPdf(pdf)
  expect(pdf.length, 'PDF demasiado grande: logo sin comprimir').toBeLessThan(400_000)
  // El nombre escrito llega al PDF (regresión del "se borra el nombre").
  const p = await sb.from('properties').select('document_data').eq('id', propId).single()
  expect(p.data?.document_data?.bos_purchase?.seller_name).toBe(SELLER)
})

test('El PDF del backend lleva el logo', async ({ page }) => {
  test.setTimeout(90000)
  await loginAsStaff(page)
  const res = await page.request.post(`${APP_URL}/api/documents/bill-of-sale`, { data: { sale_id: saleId } })
  expect(res.status()).toBe(200)
  const pdf = Buffer.from(await res.body())
  expect(pdf.subarray(0, 4).toString()).toBe('%PDF')
  expectLogoInPdf(pdf)
})
