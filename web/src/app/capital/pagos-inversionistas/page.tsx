'use client'

import { useEffect, useState } from 'react'
import { CalendarClock, Users, DollarSign, TrendingUp, Mail, Loader2 } from 'lucide-react'

interface NoteLine {
  note_id: string
  loan_amount: number
  annual_rate: number
  period: number
  term: number
  payment: number
  principal: number
  interest: number
}
interface InvestorPay {
  investor_id: string | null
  name: string
  email: string | null
  total: number
  principal: number
  interest: number
  notes: NoteLine[]
}
interface PaymentsDue {
  ok: boolean
  pay_date: string
  investors: InvestorPay[]
  totals: { total: number; principal: number; interest: number; count: number }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)

export default function PagosInversionistasPage() {
  const [data, setData] = useState<PaymentsDue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/capital/investors/payments-due', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.error || 'Error') })
      .catch(() => setError('No se pudo cargar'))
      .finally(() => setLoading(false))
  }, [])

  const payLabel = data?.pay_date
    ? new Date(data.pay_date + 'T00:00:00').toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Pagos a Inversionistas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          <CalendarClock className="w-4 h-4 inline mr-1" style={{ color: 'var(--gold-700)' }} />
          A pagar el <strong>{payLabel}</strong> — resumen por inversionista, calculado del cronograma de cada pagaré.
        </p>
      </div>

      {/* Info: aviso automático */}
      <div className="rounded-lg p-4 flex items-start gap-3" style={{ backgroundColor: 'var(--info-light)', border: '1px solid var(--info)' }}>
        <Mail className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
        <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
          Cada <strong>día 12</strong> se envía automáticamente este resumen por correo a tesorería (Abby),
          para preparar los pagos con antelación al día 15.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>{error}</div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total a pagar', value: fmt(data.totals.total), icon: DollarSign, color: 'var(--navy-800)' },
              { label: 'Inversionistas', value: String(data.totals.count), icon: Users, color: 'var(--charcoal)' },
              { label: 'Capital', value: fmt(data.totals.principal), icon: TrendingUp, color: 'var(--success)' },
              { label: 'Interés', value: fmt(data.totals.interest), icon: TrendingUp, color: 'var(--gold-700)' },
            ].map(k => (
              <div key={k.label} className="card-luxury p-4">
                <div className="flex items-center gap-2 mb-1">
                  <k.icon className="w-4 h-4" style={{ color: k.color }} />
                  <span className="text-xs" style={{ color: 'var(--slate)' }}>{k.label}</span>
                </div>
                <p className="font-serif text-xl font-semibold" style={{ color: k.color }}>{k.value}</p>
              </div>
            ))}
          </div>

          {/* Tabla */}
          <div className="card-luxury overflow-hidden">
            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Inversionista</th>
                    <th className="text-center">Pagarés</th>
                    <th className="text-right">A pagar</th>
                    <th className="text-right">Capital</th>
                    <th className="text-right">Interés</th>
                  </tr>
                </thead>
                <tbody>
                  {data.investors.map(inv => (
                    <tr key={inv.investor_id || inv.name}>
                      <td>
                        <span className="font-medium" style={{ color: 'var(--navy-800)' }}>{inv.name}</span>
                        {inv.email && <span className="block text-xs" style={{ color: 'var(--ash)' }}>{inv.email}</span>}
                      </td>
                      <td className="text-center" style={{ color: 'var(--slate)' }}>
                        {inv.notes.length > 1
                          ? `${inv.notes.length} pagarés`
                          : `Periodo ${inv.notes[0]?.period}/${inv.notes[0]?.term}`}
                      </td>
                      <td className="text-right font-serif font-semibold" style={{ color: 'var(--ink)' }}>{fmt(inv.total)}</td>
                      <td className="text-right" style={{ color: 'var(--slate)' }}>{fmt(inv.principal)}</td>
                      <td className="text-right" style={{ color: 'var(--gold-700)' }}>{fmt(inv.interest)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '2px solid var(--sand)', fontWeight: 700 }}>
                    <td colSpan={2} style={{ color: 'var(--ink)' }}>TOTAL</td>
                    <td className="text-right font-serif" style={{ color: 'var(--ink)' }}>{fmt(data.totals.total)}</td>
                    <td className="text-right" style={{ color: 'var(--charcoal)' }}>{fmt(data.totals.principal)}</td>
                    <td className="text-right" style={{ color: 'var(--gold-700)' }}>{fmt(data.totals.interest)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {data.investors.length === 0 && (
            <div className="text-center py-12" style={{ color: 'var(--slate)' }}>
              No hay pagos programados para este ciclo.
            </div>
          )}
        </>
      )}
    </div>
  )
}
