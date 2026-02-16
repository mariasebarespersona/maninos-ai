'use client'

import { useMemo, useState } from 'react'
import {
  generateAmortizationSchedule,
  type AmortizationSchedule,
  type AmortizationRow,
} from '@/lib/rto-calculator'
import {
  ChevronDown,
  ChevronUp,
  Download,
  TrendingDown,
  DollarSign,
  Percent,
  CheckCircle2,
} from 'lucide-react'

interface AmortizationTableProps {
  principal: number
  monthlyPayment: number
  termMonths: number
  /** If provided, skips auto-solving the rate */
  monthlyRate?: number
  /** Label to display (e.g. client name, contract #) */
  title?: string
  /** Start date for labeling periods (defaults to next month) */
  startDate?: Date
  /** Compact mode (no summary cards, just table) */
  compact?: boolean
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(n)

const fmtShort = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

/**
 * Format a period number into a month-year label.
 * E.g. period 1 with startDate Jan 2025 → "ENE-25"
 */
function periodLabel(period: number, startDate: Date): string {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + period - 1)
  const months = [
    'ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN',
    'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC',
  ]
  const yr = String(d.getFullYear()).slice(-2)
  return `${months[d.getMonth()]}-${yr}`
}

export default function AmortizationTable({
  principal,
  monthlyPayment,
  termMonths,
  monthlyRate,
  title,
  startDate,
  compact = false,
}: AmortizationTableProps) {
  const [expanded, setExpanded] = useState(true)

  const schedule: AmortizationSchedule = useMemo(
    () =>
      generateAmortizationSchedule({
        principal,
        monthlyPayment,
        termMonths,
        monthlyRate,
      }),
    [principal, monthlyPayment, termMonths, monthlyRate],
  )

  const start = startDate ?? new Date()

  if (schedule.rows.length === 0) {
    return (
      <div className="card-luxury p-5 text-center" style={{ color: 'var(--ash)' }}>
        No se puede generar la tabla con los parámetros actuales.
      </div>
    )
  }

  const handleExportCSV = () => {
    const headers = ['Periodo', 'Mes', 'Abono Capital', 'Interés', 'Pago', 'Saldo']
    const csvRows = [headers.join(',')]
    schedule.rows.forEach((row) => {
      csvRows.push(
        [
          row.period,
          periodLabel(row.period, start),
          row.abonoCapital.toFixed(2),
          row.interes.toFixed(2),
          row.pago.toFixed(2),
          row.saldo.toFixed(2),
        ].join(','),
      )
    })
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `amortizacion_${title?.replace(/\s/g, '_') || 'tabla'}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="card-luxury overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-gray-50/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: 'var(--gold-100)' }}
          >
            <TrendingDown className="w-4.5 h-4.5" style={{ color: 'var(--gold-700)' }} />
          </div>
          <div>
            <h3 className="font-serif text-base font-semibold" style={{ color: 'var(--ink)' }}>
              Tabla de Amortización
            </h3>
            {title && (
              <p className="text-xs" style={{ color: 'var(--ash)' }}>
                {title}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded-full"
            style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}
          >
            {termMonths} meses
          </span>
          {expanded ? (
            <ChevronUp className="w-4 h-4" style={{ color: 'var(--slate)' }} />
          ) : (
            <ChevronDown className="w-4 h-4" style={{ color: 'var(--slate)' }} />
          )}
        </div>
      </button>

      {expanded && (
        <div className="border-t" style={{ borderColor: 'var(--sand)' }}>
          {/* Summary cards */}
          {!compact && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5 pb-3">
              <SummaryCard
                label="Préstamo"
                value={fmtShort(schedule.principal)}
                icon={<DollarSign className="w-3.5 h-3.5" />}
                color="var(--charcoal)"
              />
              <SummaryCard
                label="Pago Mensual"
                value={fmtShort(schedule.monthlyPayment)}
                icon={<DollarSign className="w-3.5 h-3.5" />}
                color="var(--gold-700)"
              />
              <SummaryCard
                label="Total Intereses"
                value={fmtShort(schedule.totalInterest)}
                icon={<Percent className="w-3.5 h-3.5" />}
                color="var(--warning)"
              />
              <SummaryCard
                label="Tasa Compuesta"
                value={`${(schedule.annualCompoundRate * 100).toFixed(2)}%`}
                subtitle={`${(schedule.monthlyRate * 100).toFixed(2)}%/mes`}
                icon={<TrendingDown className="w-3.5 h-3.5" />}
                color="var(--info)"
              />
            </div>
          )}

          {/* Export button */}
          <div className="px-5 pb-3 flex justify-end">
            <button
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-md border transition-colors hover:bg-gray-50"
              style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
            >
              <Download className="w-3 h-3" />
              Exportar CSV
            </button>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr
                  className="text-xs uppercase tracking-wider"
                  style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}
                >
                  <th className="px-4 py-2.5 text-left font-semibold w-16">#</th>
                  <th className="px-4 py-2.5 text-left font-semibold">Periodo</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Abono Capital</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Interés</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Pago</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Saldo</th>
                </tr>
              </thead>
              <tbody>
                {schedule.rows.map((row, i) => (
                  <AmortizationRowView
                    key={row.period}
                    row={row}
                    label={periodLabel(row.period, start)}
                    isLast={i === schedule.rows.length - 1}
                    isEven={i % 2 === 0}
                  />
                ))}
              </tbody>
              {/* Totals */}
              <tfoot>
                <tr
                  className="text-xs font-bold"
                  style={{ backgroundColor: 'var(--cream)', color: 'var(--ink)' }}
                >
                  <td className="px-4 py-3" colSpan={2}>
                    TOTALES
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(schedule.principal)}</td>
                  <td className="px-4 py-3 text-right" style={{ color: 'var(--warning)' }}>
                    {fmt(schedule.totalInterest)}
                  </td>
                  <td className="px-4 py-3 text-right">{fmt(schedule.totalPaid)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className="inline-flex items-center gap-1 text-green-600">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      $0.00
                    </span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Formula explanation */}
          {!compact && (
            <div className="px-5 py-3 border-t text-xs" style={{ borderColor: 'var(--sand)', color: 'var(--ash)' }}>
              <p>
                <strong>Fórmula:</strong> Interés del mes = Saldo anterior × {(schedule.monthlyRate * 100).toFixed(4)}%
                &nbsp;|&nbsp; Abono capital = Pago − Interés &nbsp;|&nbsp; Saldo = Saldo anterior − Abono capital
              </p>
              <p className="mt-1">
                La tasa mensual ({(schedule.monthlyRate * 100).toFixed(4)}%) se calcula para que el saldo
                sea exactamente <strong>$0.00</strong> en el mes {schedule.termMonths}.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function AmortizationRowView({
  row,
  label,
  isLast,
  isEven,
}: {
  row: AmortizationRow
  label: string
  isLast: boolean
  isEven: boolean
}) {
  // Capital increases over time, interest decreases — color code subtly
  return (
    <tr
      className={`transition-colors hover:bg-gray-50 ${isLast ? 'font-semibold' : ''}`}
      style={{
        backgroundColor: isEven ? 'white' : 'var(--cream-light, #fafaf8)',
      }}
    >
      <td className="px-4 py-2" style={{ color: 'var(--ash)' }}>
        {row.period}
      </td>
      <td className="px-4 py-2 font-medium" style={{ color: 'var(--charcoal)' }}>
        {label}
      </td>
      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--success)' }}>
        {fmt(row.abonoCapital)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums" style={{ color: 'var(--warning)' }}>
        {fmt(row.interes)}
      </td>
      <td className="px-4 py-2 text-right tabular-nums font-medium" style={{ color: 'var(--charcoal)' }}>
        {fmt(row.pago)}
      </td>
      <td
        className="px-4 py-2 text-right tabular-nums font-medium"
        style={{ color: isLast ? 'var(--success)' : row.saldo < 0 ? 'var(--error)' : 'var(--ink)' }}
      >
        {isLast ? '$0.00' : fmt(row.saldo)}
      </td>
    </tr>
  )
}

function SummaryCard({
  label,
  value,
  subtitle,
  icon,
  color,
}: {
  label: string
  value: string
  subtitle?: string
  icon: React.ReactNode
  color: string
}) {
  return (
    <div className="rounded-lg p-3 border" style={{ borderColor: 'var(--sand)' }}>
      <div className="flex items-center gap-1.5 mb-1">
        <span style={{ color }}>{icon}</span>
        <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>
          {label}
        </span>
      </div>
      <p className="text-base font-bold tabular-nums" style={{ color }}>
        {value}
      </p>
      {subtitle && (
        <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
          {subtitle}
        </p>
      )}
    </div>
  )
}

