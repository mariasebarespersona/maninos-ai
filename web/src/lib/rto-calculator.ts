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

// ── Compound Amortization ───────────────────────────────────────────────────
//
// The CLIENTES tab in the Excel uses **declining-balance compound interest**.
// Given: principal, fixed monthly payment, and number of months,
// the compound monthly rate is derived so that saldo = 0 on the last period.
//
// Each row of the amortization:
//   interest   = remaining_balance × monthly_rate
//   capital    = payment − interest
//   new_balance = balance − capital
//
// Sebastian: "the table answers: how much interest to charge so the balance
//            hits exactly 0 on the last month?"
// ────────────────────────────────────────────────────────────────────────────

export interface AmortizationRow {
  /** 1-based period number */
  period: number
  /** Capital (principal) portion of the payment */
  abonoCapital: number
  /** Interest portion of the payment */
  interes: number
  /** Total payment for this period */
  pago: number
  /** Remaining balance after this payment */
  saldo: number
}

export interface AmortizationSchedule {
  rows: AmortizationRow[]
  /** Monthly compound rate that was used / solved (decimal) */
  monthlyRate: number
  /** Annualized compound rate = monthlyRate × 12 (decimal) */
  annualCompoundRate: number
  /** Total interest paid over the life of the loan */
  totalInterest: number
  /** Total amount paid (principal + interest) */
  totalPaid: number
  /** Original principal */
  principal: number
  /** Fixed monthly payment */
  monthlyPayment: number
  /** Number of months */
  termMonths: number
}

/**
 * Solve for the monthly compound rate using Newton's method.
 *
 * Given principal P, fixed payment PMT, and n months, find r such that:
 *   PMT = P × r / (1 − (1+r)^(−n))
 *
 * This ensures the balance reaches exactly 0 on the last payment.
 */
export function solveMonthlyRate(
  principal: number,
  monthlyPayment: number,
  termMonths: number,
  tolerance = 1e-10,
  maxIterations = 500,
): number {
  if (principal <= 0 || monthlyPayment <= 0 || termMonths <= 0) return 0

  // Edge case: if total payments exactly equal principal → 0% interest
  const totalPayments = monthlyPayment * termMonths
  if (Math.abs(totalPayments - principal) < 0.01) return 0

  // Initial guess based on simple interest approximation
  const totalInterestGuess = totalPayments - principal
  let r = totalInterestGuess / principal / termMonths
  if (r <= 0) r = 0.001

  for (let i = 0; i < maxIterations; i++) {
    const factor = Math.pow(1 + r, termMonths)
    const numerator = principal * r * factor
    const denominator = factor - 1

    if (Math.abs(denominator) < 1e-15) break

    const f = numerator / denominator - monthlyPayment

    // Derivative of f with respect to r (for Newton's method)
    const dfactor_dr = termMonths * Math.pow(1 + r, termMonths - 1)
    const dNum = principal * (factor + r * dfactor_dr)
    const dDen = dfactor_dr
    const df = (dNum * denominator - numerator * dDen) / (denominator * denominator)

    if (Math.abs(df) < 1e-15) break

    const rNew = r - f / df
    if (Math.abs(rNew - r) < tolerance) {
      return Math.max(rNew, 0)
    }
    r = Math.max(rNew, 1e-10) // keep positive
  }

  return Math.max(r, 0)
}

/**
 * Generate a full amortization schedule (declining-balance compound interest).
 *
 * If `monthlyRate` is not provided, it is solved automatically from the
 * other three parameters so that the balance hits 0 on the last period.
 *
 * @example
 * ```ts
 * const schedule = generateAmortizationSchedule({
 *   principal: 20_000,
 *   monthlyPayment: 1_000,
 *   termMonths: 36,
 * })
 * // schedule.rows[35].saldo ≈ 0
 * // schedule.annualCompoundRate ≈ 0.4321  (43.21 %)
 * ```
 */
export function generateAmortizationSchedule(params: {
  principal: number
  monthlyPayment: number
  termMonths: number
  /** Provide to skip solving; otherwise it's derived automatically. */
  monthlyRate?: number
}): AmortizationSchedule {
  const { principal, monthlyPayment, termMonths } = params

  if (principal <= 0 || monthlyPayment <= 0 || termMonths <= 0) {
    return {
      rows: [],
      monthlyRate: 0,
      annualCompoundRate: 0,
      totalInterest: 0,
      totalPaid: 0,
      principal,
      monthlyPayment,
      termMonths,
    }
  }

  const monthlyRate =
    params.monthlyRate ?? solveMonthlyRate(principal, monthlyPayment, termMonths)

  const rows: AmortizationRow[] = []
  let balance = principal
  let totalInterest = 0

  for (let p = 1; p <= termMonths; p++) {
    const interes = balance * monthlyRate
    let abonoCapital = monthlyPayment - interes

    // On the very last payment, adjust so balance = 0 exactly
    if (p === termMonths) {
      abonoCapital = balance
      // The actual last payment = capital + interest (might differ slightly from fixed payment)
    }

    const pago = p === termMonths ? abonoCapital + interes : monthlyPayment
    balance = Math.max(balance - abonoCapital, 0)
    totalInterest += interes

    rows.push({
      period: p,
      abonoCapital: Math.round(abonoCapital * 100) / 100,
      interes: Math.round(interes * 100) / 100,
      pago: Math.round(pago * 100) / 100,
      saldo: Math.round(balance * 100) / 100,
    })
  }

  return {
    rows,
    monthlyRate,
    annualCompoundRate: monthlyRate * 12,
    totalInterest: Math.round(totalInterest * 100) / 100,
    totalPaid: Math.round((principal + totalInterest) * 100) / 100,
    principal,
    monthlyPayment,
    termMonths,
  }
}

