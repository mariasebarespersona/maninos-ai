import { formatMoney, formatMoneyText, formatMoneyFields } from '../money'

describe('formatMoney', () => {
  it.each([
    [20000, '$20,000.00'],
    [20000.5, '$20,000.50'],
    [1234567.891, '$1,234,567.89'],
    [0, '$0.00'],
    [-1234.56, '-$1,234.56'],
    [-0.001, '$0.00'],
    ['20000', '$20,000.00'],
    ['$20,000', '$20,000.00'],
    [null, '$0.00'],
    [undefined, '$0.00'],
    [NaN, '$0.00'],
  ])('%p → %s', (input, expected) => {
    expect(formatMoney(input as any)).toBe(expected)
  })
})

describe('formatMoneyText', () => {
  it.each([
    ['20000', '$20,000.00'],
    ['$20,000', '$20,000.00'],
    ['$ 20,000.5', '$20,000.50'],
    ['$34,648.89', '$34,648.89'],
    ['TBD', 'TBD'],
    ['', ''],
    ['$', '$'],
    ['20 mil', '20 mil'],
  ])('%p → %p', (input, expected) => {
    expect(formatMoneyText(input)).toBe(expected)
  })

  it('formatMoneyFields solo toca las claves indicadas', () => {
    expect(formatMoneyFields({ total: '1500', dimensions: '76 x 16' }, ['total']))
      .toEqual({ total: '$1,500.00', dimensions: '76 x 16' })
  })
})

/**
 * Vigilancia: en Homes ningún monto se formatea a mano. Si este test falla,
 * usa formatMoney() de '@/lib/money' en vez de toLocaleString/toFixed/Intl.
 */
describe('Homes usa formatMoney para todos los montos', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const SRC = path.join(__dirname, '../..')
  const ROOTS = ['app/homes', 'components']
  const SKIP = /components\/capital\/|__tests__|\.test\./

  const files: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.tsx?$/.test(e.name) && !SKIP.test(p)) files.push(p)
    }
  }
  ROOTS.forEach(r => walk(path.join(SRC, r)))

  const FORBIDDEN: [string, RegExp][] = [
    ['"$" + toLocaleString', /\$\$\{[^}`]*\.toLocaleString\(/],
    ['"$" + toFixed', /\$\$\{[^}`]*\.toFixed\(/],
    ['Intl.NumberFormat currency', /NumberFormat\([^)]*currency/],
  ]

  it('no quedan formatos de dinero sueltos', () => {
    const hits: string[] = []
    for (const f of files) {
      fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        // Marcas del eje de las gráficas: escala compacta ($20k), no un monto.
        if (line.includes('tickFormatter')) return
        for (const [name, re] of FORBIDDEN) {
          if (re.test(line)) hits.push(`${path.relative(SRC, f)}:${i + 1} (${name})`)
        }
      })
    }
    expect(hits).toEqual([])
  })
})
