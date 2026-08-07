/**
 * Seguridad E2E: candado del API + buckets privados con firma-al-leer.
 *
 * 1) El backend de Railway rechaza (401) cualquier request sin X-Internal-Key
 *    y /docs está apagado — pero la app (vía el proxy de Vercel, que añade la
 *    clave server-side) sigue funcionando con normalidad.
 * 2) kyc-documents y transaction-documents son privados: la URL pública
 *    antigua ya no sirve archivos, y las respuestas del API reescriben las
 *    URLs guardadas por URLs firmadas (object/sign) que SÍ funcionan.
 *
 * Necesita SUPABASE_URL + SERVICE_ROLE_KEY (se cargan del .env raíz).
 */
import { test, expect, Page } from '@playwright/test'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'
const RAILWAY = process.env.E2E_RAILWAY_URL || 'https://maninos-ai-production.up.railway.app'

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

async function loginAsStaff(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

test.beforeAll(async () => {
  expect(process.env.SUPABASE_URL, 'SUPABASE_URL missing').toBeTruthy()
  expect(process.env.SUPABASE_SERVICE_ROLE_KEY, 'SERVICE_ROLE_KEY missing').toBeTruthy()
  sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
})

test('API directa a Railway bloqueada (401) y /docs apagado', async ({ request }) => {
  const clients = await request.get(`${RAILWAY}/api/clients`)
  expect(clients.status(), 'GET /api/clients sin clave debe dar 401').toBe(401)

  const sales = await request.get(`${RAILWAY}/api/sales`)
  expect(sales.status(), 'GET /api/sales sin clave debe dar 401').toBe(401)

  // El middleware del candado responde 401 antes de que el router diga 404:
  // cualquiera de los dos significa "inaccesible sin la clave".
  const docs = await request.get(`${RAILWAY}/docs`)
  expect([401, 404], '/docs debe estar inaccesible en prod').toContain(docs.status())

  const openapi = await request.get(`${RAILWAY}/openapi.json`)
  expect([401, 404], '/openapi.json debe estar inaccesible en prod').toContain(openapi.status())

  const health = await request.get(`${RAILWAY}/health`)
  expect(health.status(), '/health sigue abierto para monitoreo').toBe(200)
})

test('La app sigue funcionando a través del proxy (con candado activo)', async ({ page }) => {
  test.setTimeout(120000)
  await loginAsStaff(page)

  // El proxy de Vercel añade X-Internal-Key server-side: los datos cargan.
  const apiResp = await page.request.get(`${APP_URL}/api/clients`)
  expect(apiResp.status(), 'proxy /api/clients responde').toBe(200)
  const data = await apiResp.json()
  expect(Array.isArray(data) ? data.length : 0).toBeGreaterThan(0)

  await page.goto(`${APP_URL}/homes/properties`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await expect(page.getByText(/Propiedades|propiedad/i).first()).toBeVisible({ timeout: 20000 })
})

test('Buckets privados: URL pública muerta, URL firmada viva', async ({ page, request }) => {
  test.setTimeout(120000)

  // 1) Un objeto REAL del bucket ya no se sirve por la URL pública antigua
  const folders = await sb.storage.from('kyc-documents').list('', { limit: 3 })
  expect(folders.data?.length, 'hay objetos en kyc-documents').toBeTruthy()
  const folder = folders.data![0].name
  const files = await sb.storage.from('kyc-documents').list(folder, { limit: 1 })
  expect(files.data?.length, `hay archivos en kyc-documents/${folder}`).toBeTruthy()
  const objectPath = `${folder}/${files.data![0].name}`
  const publicUrl = `${process.env.SUPABASE_URL}/storage/v1/object/public/kyc-documents/${objectPath}`
  const pub = await request.get(publicUrl)
  expect(pub.status(), 'la URL pública de un KYC debe estar bloqueada').not.toBe(200)

  // 2) El API reescribe las URLs guardadas por firmadas que SÍ funcionan.
  //    Transfer conocido con documentos en el checklist (JSONB).
  await loginAsStaff(page)
  const resp = await page.request.get(`${APP_URL}/api/transfers/property/4331a5ef-d0ad-4572-b6d4-87ad0b1e1032`)
  expect(resp.status()).toBe(200)
  const body = await resp.text()
  expect(body, 'no debe quedar ninguna URL pública de bucket privado')
    .not.toContain('/object/public/transaction-documents/')
  expect(body, 'debe haber URLs firmadas').toContain('/object/sign/')

  const m = body.match(/https:\/\/[^"\\]+\/storage\/v1\/object\/sign\/[^"\\]+/)
  expect(m, 'se extrajo una URL firmada de la respuesta').toBeTruthy()
  const signed = await request.get(m![0].replace(/\\u0026/g, '&'))
  expect(signed.status(), 'la URL firmada descarga el documento').toBe(200)
})
