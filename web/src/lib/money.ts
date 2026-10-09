/**
 * Formato único de montos en Homes: $20,000.00 — símbolo, separador de miles
 * y SIEMPRE dos decimales. Negativos: -$1,234.56.
 *
 * Cualquier monto que se muestre en Homes pasa por aquí; no uses
 * toLocaleString()/Intl.NumberFormat sueltos para dinero (lo vigila
 * src/lib/__tests__/money.test.ts).
 */
const USD = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

export function formatMoney(value: number | string | null | undefined): string {
  const n = typeof value === 'string' ? Number(value.replace(/[$,\s]/g, '')) : Number(value ?? 0)
  if (!Number.isFinite(n)) return USD.format(0)
  // Evita "-$0.00" con importes como -0.001
  return USD.format(Math.abs(n) < 0.005 ? 0 : n)
}

/**
 * Para campos de documento que guardan el monto como TEXTO editable
 * (Bill of Sale, Title Application). Si el texto es un número ("20000",
 * "$20,000", "$20,000.5") lo deja como $20,000.00; si es otra cosa
 * ("TBD", "N/A", vacío) lo devuelve tal cual.
 */
export function formatMoneyText(text: string | null | undefined): string {
  const s = (text ?? '').trim()
  if (!/^-?\$?\s*-?(\d{1,3}(,\d{3})+|\d+)?(\.\d+)?$/.test(s) || !/\d/.test(s)) return text ?? ''
  return formatMoney(s.replace(/[$,\s]/g, ''))
}

/** Aplica formatMoneyText a las claves indicadas de un objeto de documento. */
export function formatMoneyFields<T extends Record<string, any>>(data: T, keys: readonly string[]): T {
  const out: Record<string, any> = { ...data }
  for (const k of keys) if (typeof out[k] === 'string') out[k] = formatMoneyText(out[k])
  return out as T
}
