/**
 * Snapshot of the current Estados Financieros — read-only check, used to
 * verify with the user that what the prod UI renders is what we expect.
 * Logs in, walks P&L and Balance Sheet, attempts a drilldown, and dumps
 * the structure to the test output so the human can sanity-check it.
 */
import { test, expect, Page } from '@playwright/test'

const APP_URL = process.env.E2E_BASE_URL || 'https://maninos-ai.vercel.app'

async function loginAsAdmin(page: Page) {
  await page.goto(`${APP_URL}/login`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.locator('input[type="email"]').fill('e2e-test@maninos.com')
  await page.locator('input[type="password"]').fill('E2eTest2026!Maninos')
  await page.getByRole('button', { name: /ingresar|login|submit/i }).click()
  for (let i = 0; i < 15; i++) {
    await page.waitForTimeout(2000)
    if (!page.url().includes('/login')) break
  }
}

async function killOverlays(page: Page) {
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(500)
    const omitir = page.locator('button:has-text("Omitir tour")')
    if (await omitir.isVisible({ timeout: 500 }).catch(() => false)) {
      await omitir.click({ force: true }).catch(() => {})
    }
    await page.keyboard.press('Escape').catch(() => {})
    await page.evaluate(() => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"], #react-joyride-step-0'
      ).forEach((el) => el.remove())
    })
  }
  await page.evaluate(() => {
    const strip = () => {
      document.getElementById('react-joyride-portal')?.remove()
      document.querySelectorAll(
        '.react-joyride__overlay, .react-joyride__spotlight, .react-joyride__tooltip, [data-test-id="overlay"]'
      ).forEach((el) => el.remove())
    }
    new MutationObserver(strip).observe(document.body, { childList: true, subtree: true })
    strip()
  })
}

test('Estados Financieros — snapshot P&L and Balance Sheet', async ({ page }) => {
  test.setTimeout(180000)
  await loginAsAdmin(page)
  await page.goto(`${APP_URL}/homes/accounting`, { waitUntil: 'domcontentloaded' })
  await killOverlays(page)

  await page.getByRole('button', { name: /Estados Financieros/i }).first().click({ force: true })
  await page.waitForResponse(
    (r) => r.url().includes('/api/accounting/reports/income-statement') && r.status() === 200,
    { timeout: 30000 },
  )
  await page.waitForTimeout(2000)

  // ── P&L snapshot ──
  console.log('\n========== PROFIT & LOSS ==========')
  const plRows = await page.evaluate(() => {
    const rows: { label: string; amount: string; clickable: boolean; depth: number }[] = []
    document.querySelectorAll('table tbody tr').forEach((tr) => {
      const labelCell = tr.querySelector('td:first-child')
      const amountCell = tr.querySelector('td:last-child')
      if (!labelCell || !amountCell) return
      const padding = parseInt((labelCell as HTMLElement).style.paddingLeft || '0')
      const depth = Math.round((padding - 12) / 24)
      const labelText = (labelCell.textContent || '').trim().replace(/\s+/g, ' ')
      const amountText = (amountCell.textContent || '').trim()
      const clickable = !!amountCell.querySelector('button')
      if (labelText) rows.push({ label: labelText, amount: amountText, clickable, depth })
    })
    return rows
  })
  for (const r of plRows) {
    const indent = '  '.repeat(Math.max(0, r.depth))
    console.log(`${indent}${r.clickable ? '🔗' : '  '} ${r.label.padEnd(50)} ${r.amount}`)
  }
  const plClickable = plRows.filter((r) => r.clickable).length
  console.log(`\nP&L summary: ${plRows.length} rows, ${plClickable} clickable amounts`)

  // ── Balance Sheet snapshot ──
  console.log('\n========== BALANCE SHEET ==========')
  await page.getByRole('button', { name: /Balance Sheet/i }).first().click({ force: true })
  await page.waitForResponse(
    (r) => r.url().includes('/api/accounting/reports/balance-sheet') && r.status() === 200,
    { timeout: 30000 },
  )
  await page.waitForTimeout(2000)

  const bsRows = await page.evaluate(() => {
    const rows: { label: string; amount: string; clickable: boolean; depth: number }[] = []
    document.querySelectorAll('table tbody tr').forEach((tr) => {
      const labelCell = tr.querySelector('td:first-child')
      const amountCell = tr.querySelector('td:last-child')
      if (!labelCell || !amountCell) return
      const padding = parseInt((labelCell as HTMLElement).style.paddingLeft || '0')
      const depth = Math.round((padding - 12) / 24)
      const labelText = (labelCell.textContent || '').trim().replace(/\s+/g, ' ')
      const amountText = (amountCell.textContent || '').trim()
      const clickable = !!amountCell.querySelector('button')
      if (labelText) rows.push({ label: labelText, amount: amountText, clickable, depth })
    })
    return rows
  })
  for (const r of bsRows) {
    const indent = '  '.repeat(Math.max(0, r.depth))
    console.log(`${indent}${r.clickable ? '🔗' : '  '} ${r.label.padEnd(50)} ${r.amount}`)
  }
  const bsClickable = bsRows.filter((r) => r.clickable).length
  console.log(`\nBalance Sheet summary: ${bsRows.length} rows, ${bsClickable} clickable amounts`)

  // ── Try a drilldown on the first clickable Balance Sheet row ──
  if (bsClickable > 0) {
    console.log('\n========== DRILLDOWN TEST (Balance Sheet, first clickable amount) ==========')
    const firstClickableBtn = page.locator('table tbody tr td:last-child button').first()
    await firstClickableBtn.click({ force: true })
    await page.waitForTimeout(2000)
    const modal = await page.evaluate(() => {
      const modalRoot = document.querySelector('[class*="fixed inset-0 z-50"]')
      if (!modalRoot) return null
      const title = modalRoot.querySelector('h3')?.textContent || '?'
      const subtitle = modalRoot.querySelector('h3 + p')?.textContent || ''
      const summaryRow = modalRoot.querySelectorAll('.grid p.text-sm')
      const summary = Array.from(summaryRow).map((el) => el.textContent?.trim())
      const rows = modalRoot.querySelectorAll('table tbody tr')
      return { title, subtitle, summary, rowCount: rows.length }
    })
    if (modal) {
      console.log(`Title:   ${modal.title}`)
      console.log(`Subtitle:${modal.subtitle}`)
      console.log(`Summary: ${modal.summary.join(' | ')}`)
      console.log(`Rows:    ${modal.rowCount}`)
    } else {
      console.log('Modal did not open')
    }
  }

  // Sanity asserts — both reports rendered with at least the headers we expect.
  expect(plRows.length).toBeGreaterThan(0)
  expect(bsRows.length).toBeGreaterThan(0)
})
