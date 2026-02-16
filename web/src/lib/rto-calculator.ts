/**
 * RTO (Rent-to-Own) Payment Calculator
 *
 * Business rules confirmed by Maninos employee:
 *   1. finance_amount = sale_price − down_payment
 *   2. total_interest  = finance_amount × annual_rate × (term_months / 12)
 *   3. total_to_pay    = finance_amount + total_interest
 *   4. monthly_payment  = total_to_pay / term_months
 *   5. monthly_payment  = round UP to nearest $5
 *
 * The annual rate defaults to 24 % but varies by term and is editable per deal.
 */

// ── Default rate ────────────────────────────────────────────────────────────
export const DEFAULT_ANNUAL_RATE = 0.24 // 24 %

/**
 * Default rate table indexed by term length (months).
 * All start at 24 %; Capital can override per-application.
 * If a term is not in the table we fall back to DEFAULT_ANNUAL_RATE.
 */
export const RATE_TABLE: Record<number, number> = {
  12: 0.24,
  18: 0.24,
  24: 0.24,
  30: 0.24,
  36: 0.24,
  42: 0.24,
  48: 0.24,
  54: 0.24,
  60: 0.24,
}

/** Get the default annual rate for a given term. */
export function getDefaultRate(termMonths: number): number {
  return RATE_TABLE[termMonths] ?? DEFAULT_ANNUAL_RATE
}

// ── Helpers ─────────────────────────────────────────────────────────────────
/** Round UP to the nearest multiple of $5. */
export function ceilToNearest5(amount: number): number {
  return Math.ceil(amount / 5) * 5
}

// ── Main calculator ─────────────────────────────────────────────────────────
export interface RTOCalcInput {
  salePrice: number
  downPayment: number
  termMonths: number
  /** Override the annual interest rate (decimal, e.g. 0.24 = 24 %). */
  annualRate?: number
}

export interface RTOCalcResult {
  financeAmount: number
  totalInterest: number
  totalToPay: number
  /** Monthly payment rounded up to nearest $5 */
  monthlyPayment: number
  /** Monthly payment BEFORE the $5 rounding */
  rawMonthly: number
  /** Annual rate used (decimal) */
  annualRate: number
  /** Total interest as a percentage of the financed amount */
  effectiveRatePct: number
}

/**
 * Calculate RTO monthly payment using **simple interest**.
 *
 * @example
 * ```ts
 * const r = calculateRTOMonthly({ salePrice: 40000, downPayment: 5000, termMonths: 36 })
 * // r.monthlyPayment → $1,675   (35 000 + 25 200 interest = 60 200 / 36 ≈ 1672.22 → ceil5 → 1675)
 * ```
 */
export function calculateRTOMonthly(input: RTOCalcInput): RTOCalcResult {
  const { salePrice, downPayment, termMonths } = input
  const annualRate = input.annualRate ?? getDefaultRate(termMonths)

  if (termMonths <= 0 || salePrice <= 0) {
    return {
      financeAmount: 0,
      totalInterest: 0,
      totalToPay: 0,
      monthlyPayment: 0,
      rawMonthly: 0,
      annualRate,
      effectiveRatePct: 0,
    }
  }

  const financeAmount = Math.max(salePrice - downPayment, 0)
  const years = termMonths / 12
  const totalInterest = financeAmount * annualRate * years
  const totalToPay = financeAmount + totalInterest
  const rawMonthly = totalToPay / termMonths
  const monthlyPayment = ceilToNearest5(rawMonthly)
  const effectiveRatePct = financeAmount > 0 ? (totalInterest / financeAmount) * 100 : 0

  return {
    financeAmount,
    totalInterest,
    totalToPay,
    monthlyPayment,
    rawMonthly,
    annualRate,
    effectiveRatePct,
  }
}

