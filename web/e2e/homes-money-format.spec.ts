/**
 * E2E (solo lectura): en las pantallas de Homes todo monto visible tiene el
 * formato $20,000.00. Recorre las páginas principales, lee el texto visible
 * (sin las marcas de los ejes de las gráficas, que son SVG) y falla con la
 * lista de montos mal formateados.
 * Necesita E2E_STAFF_EMAIL + E2E_STAFF_PASSWORD (en ../.env, no versionado).
 */
import { test, expect, Page } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

function loadRootEnv() {
  const envPath = path.resolve(process.cwd(), '../.env')
  if (!fs.existsSync(envPath)) return
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}
loadRootEnv()

const PAGES = [
  '/homes',
  '/homes/properties',
  '/homes/sales',
  '/homes/commissions',
  '/homes/clients',
  '/homes/notificaciones',
  '/homes/accounting',
  '/homes/resumen-financiero',
  '/homes/market',
]

// Un "$" seguido de un número. innerText pega textos vecinos ("$809,928.72Inversión",
// "$0.000 ventas"), así que se valida el PREFIJO: tiene que empezar por $20,000.00
// y no seguir con "k"/"K" ni más cifras con coma.
const AMOUNT = /\$\s?-?\d[\d,]*(\.\d*)?[kK]?/g
const GOOD = /^\$\d{1,3}(,\d{3})*\.\d{2}(?![\d,]*[kK])/

async function login(page: Page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('maninos_tour_completed_homes', 'true')
      for (const p of ['homes', 'properties', 'sales', 'commissions', 'clients', 'notificaciones', 'accounting', 'resumen-financiero', 'market']) {
        localStorage.setItem(`maninos_tour_page_homes__homes_${p}`, 'true')
      }
      localStorage.setItem('maninos_tour_page_homes__homes', 'true')
    } catch (e) { /* ignore */ }
  })
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.locator('input[type="email"]').fill(process.env.E2E_STAFF_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.E2E_STAFF_PASSWORD!)
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) { await page.waitForTimeout(2000); if (!page.url().includes('/login')) break }
}

async function visibleText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const main = (document.querySelector('main') || document.body).cloneNode(true) as HTMLElement
    // data-external-text: texto de terceros (títulos de anuncios) o frases, no montos nuestros
    main.querySelectorAll('svg, script, style, input, textarea, select, [data-external-text]').forEach(n => n.remove())
    return main.innerText
  })
}

test('Homes: todos los montos visibles con formato $20,000.00', async ({ page }) => {
  test.setTimeout(300000)
  expect(process.env.E2E_STAFF_EMAIL, 'E2E_STAFF_EMAIL missing').toBeTruthy()
  await login(page)

  const bad: string[] = []
  let checked = 0
  const visit = async (url: string) => {
    await page.goto(`${APP_URL}${url}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {})
    await page.waitForTimeout(2500)
    const text = await visibleText(page)
    for (const m of text.matchAll(AMOUNT)) {
      const amt = m[0].trim().replace(/^\$\s?-/, '$')
      checked++
      if (!GOOD.test(amt)) {
        const ctx = text.slice(Math.max(0, m.index! - 35), m.index! + m[0].length + 15).replace(/\s+/g, ' ')
        bad.push(`${url}: "${m[0].trim()}" … ${ctx}`)
      }
    }
  }

  for (const url of PAGES) await visit(url)

  // Una ficha de casa real (la primera del listado).
  await page.goto(`${APP_URL}/homes/properties`, { waitUntil: 'domcontentloaded' })
  const first = page.locator('a[href^="/homes/properties/"]').filter({ hasNotText: /nueva|new/i }).first()
  const href = await first.getAttribute('href', { timeout: 20000 }).catch(() => null)
  if (href) await visit(href)

  console.log(`Montos revisados: ${checked}`)
  expect(checked, 'no se encontró ningún monto: la prueba no está viendo las páginas').toBeGreaterThan(20)
  expect([...new Set(bad)]).toEqual([])
})
