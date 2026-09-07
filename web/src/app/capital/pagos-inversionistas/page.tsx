'use client'

import { Fragment, useEffect, useState } from 'react'
import { CalendarClock, Users, DollarSign, TrendingUp, Mail, Loader2, ChevronDown, ChevronRight, BookOpen } from 'lucide-react'

interface NoteLine {
  note_id: string
  loan_amount: number
  annual_rate: number
  period: number
  term: number
  payment: number
  principal: number
  interest: number
  balance_before?: number
  balance_after?: number
  interest_only_months?: number
  amort_months?: number
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

/** Tasa mensual con los decimales que de verdad se usan en el cálculo. */
const fmtRate = (annualPct: number) => (annualPct / 100 / 12).toFixed(6)

const mono: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  fontVariantNumeric: 'tabular-nums',
}

/**
 * Explicación de UNA línea concreta, con los números de ESE pagaré.
 *
 * No es un texto genérico: reconstruye el pago del mes desde la tasa y el saldo
 * que devuelve el backend, para que quien pregunte "¿de dónde salen estos
 * $518,29?" pueda seguir la cuenta con una calculadora. Por eso se muestran los
 * saldos del cuadro y no un saldo deducido: dividir el interés por la tasa
 * arrastra el redondeo a dos decimales y el número deja de cuadrar.
 */
function ExplicacionLinea({ n }: { n: NoteLine }) {
  const i = n.annual_rate / 100 / 12
  const soloInteres = n.principal === 0 && (n.interest_only_months ?? 0) >= n.period
  const S = n.balance_before ?? n.loan_amount

  return (
    <div className="text-sm space-y-3" style={{ color: 'var(--charcoal)' }}>
      <p>
        Pagaré de <strong>{fmt(n.loan_amount)}</strong> al <strong>{n.annual_rate}%</strong> anual,
        a {n.term} meses{n.interest_only_months
          ? ` (${n.interest_only_months} de solo interés + ${n.amort_months} amortizando)`
          : ''}. Este mes es el <strong>periodo {n.period}</strong>.
      </p>

      <div className="rounded p-3 space-y-1" style={{ backgroundColor: 'var(--cream)', border: '1px solid var(--sand)', ...mono }}>
        <div style={{ color: 'var(--slate)' }}>
          Tasa mensual = {n.annual_rate}% ÷ 12 ÷ 100 = <strong style={{ color: 'var(--ink)' }}>{fmtRate(n.annual_rate)}</strong>
        </div>

        {soloInteres ? (
          <>
            <div className="pt-1" style={{ color: 'var(--slate)' }}>
              Cuota = capital × tasa mensual
            </div>
            <div style={{ color: 'var(--gold-700)' }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {fmt(n.loan_amount)} × {fmtRate(n.annual_rate)} = <strong>{fmt(n.payment)}</strong>
            </div>
          </>
        ) : (
          <>
            <div className="pt-1" style={{ color: 'var(--slate)' }}>
              Saldo al empezar el mes = <strong style={{ color: 'var(--ink)' }}>{fmt(S)}</strong>
            </div>
            <div style={{ color: 'var(--slate)' }}>
              Interés = saldo × tasa mensual
            </div>
            <div style={{ color: 'var(--gold-700)' }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {fmt(S)} × {fmtRate(n.annual_rate)} = <strong>{fmt(n.interest)}</strong>
            </div>
            <div style={{ color: 'var(--slate)' }}>
              Capital = cuota − interés
            </div>
            <div style={{ color: 'var(--gold-700)' }}>
              &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= {fmt(n.payment)} − {fmt(n.interest)} = <strong>{fmt(n.principal)}</strong>
            </div>
            <div className="pt-1" style={{ color: 'var(--slate)' }}>
              Saldo al terminar el mes = {fmt(S)} − {fmt(n.principal)} = <strong style={{ color: 'var(--ink)' }}>{fmt(n.balance_after ?? 0)}</strong>
            </div>
          </>
        )}
      </div>

      <p style={{ color: 'var(--slate)' }}>
        {soloInteres
          ? 'Está en el tramo de solo interés: cobra la renta del dinero y su capital no baja todavía. Por eso la columna Capital sale en $0.00.'
          : 'La cuota no cambia en ningún mes. Lo que cambia es el reparto: como el saldo baja, el interés baja, y el hueco lo ocupa el capital.'}
      </p>
    </div>
  )
}

/** Panel plegable con las fórmulas. Cerrado por defecto: la pantalla es para
 *  pagar, no para estudiar; pero la explicación tiene que estar a un clic. */
function ComoSeCalcula() {
  const [abierto, setAbierto] = useState(false)

  return (
    <div className="card-luxury overflow-hidden">
      <button
        onClick={() => setAbierto(v => !v)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left"
        style={{ color: 'var(--navy-800)' }}
      >
        <BookOpen className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--gold-700)' }} />
        <span className="text-sm font-medium flex-1">¿Cómo se calcula cada pago?</span>
        {abierto ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
      </button>

      {abierto && (
        <div className="px-4 pb-5 pt-1 space-y-4 text-sm" style={{ color: 'var(--charcoal)', borderTop: '1px solid var(--sand)' }}>
          <p className="pt-3">
            No hay un cálculo &ldquo;del mes&rdquo;. Cada pagaré tiene su <strong>cuadro de pagos completo,
            fijo desde el día que se firma</strong>. Aquí solo se lee la fila que toca y se suma.
          </p>
          <p>
            Un pagaré puede tener dos tramos: primero <strong>solo interés</strong> (el inversionista
            cobra la renta del dinero y su capital no se mueve) y después <strong>amortización</strong>
            {' '}(empieza a recuperar el capital). Cualquiera de los dos puede durar cero meses.
          </p>

          <div className="rounded p-3 space-y-2" style={{ backgroundColor: 'var(--cream)', border: '1px solid var(--sand)', ...mono }}>
            <div>
              <span style={{ color: 'var(--ash)' }}>1 · tasa mensual</span><br />
              tasa mensual = tasa anual ÷ 12
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>2 · cuota en el tramo de solo interés</span><br />
              cuota = capital × tasa mensual
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>3 · cuota en el tramo de amortización (se calcula una sola vez)</span><br />
              cuota = capital × tasa ÷ (1 − (1 + tasa)<sup>−meses</sup>)
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>4 · el reparto de cada mes</span><br />
              interés = saldo pendiente × tasa mensual<br />
              capital = cuota − interés<br />
              saldo nuevo = saldo − capital
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>5 · qué fila toca</span><br />
              periodo = días 15 transcurridos desde el inicio del pagaré
            </div>
          </div>

          <p>
            <strong>La clave está en la fórmula 4:</strong> el interés se cobra sobre el saldo que
            <em> queda</em>, no sobre el capital original. Como el saldo baja cada mes, el interés
            baja; y como la cuota es fija, el hueco lo ocupa el capital. De ahí que al principio se
            devuelva poco capital y al final mucho, cobrando siempre lo mismo.
          </p>

          <p style={{ color: 'var(--slate)' }}>
            Para ver la cuenta con los números concretos de un inversionista, haz clic en su fila.
          </p>

          <div className="rounded p-3" style={{ backgroundColor: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
            <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Qué NO incluye esta cifra</p>
            <ul className="list-disc pl-5 space-y-1" style={{ color: 'var(--charcoal)' }}>
              <li>Es la <strong>cuota que toca este mes</strong>, no la deuda pendiente: no resta lo ya pagado.</li>
              <li>No arrastra atrasos: si un mes no se pagó, no reaparece sumado al siguiente.</li>
              <li>El contador de inversionistas cuenta <strong>pagarés</strong>, y un mismo inversionista puede tener varios.</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}

export default function PagosInversionistasPage() {
  const [data, setData] = useState<PaymentsDue | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [abierta, setAbierta] = useState<string | null>(null)

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

      {/* Explicación del cálculo */}
      <ComoSeCalcula />

      {error && (
        <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>{error}</div>
      )}

      {data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Total a pagar', value: fmt(data.totals.total), icon: DollarSign, color: 'var(--navy-800)' },
              { label: 'Pagarés', value: String(data.totals.count), icon: Users, color: 'var(--charcoal)' },
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
                    <th className="text-center">Periodo</th>
                    <th className="text-right">A pagar</th>
                    <th className="text-right">Capital</th>
                    <th className="text-right">Interés</th>
                  </tr>
                </thead>
                <tbody>
                  {data.investors.map(inv => {
                    const clave = inv.investor_id || inv.name
                    const abiertaEsta = abierta === clave
                    return (
                      <Fragment key={clave}>
                        <tr
                          onClick={() => setAbierta(abiertaEsta ? null : clave)}
                          style={{ cursor: 'pointer', backgroundColor: abiertaEsta ? 'var(--cream)' : undefined }}
                        >
                          <td>
                            <span className="flex items-center gap-1.5">
                              {abiertaEsta
                                ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--gold-700)' }} />
                                : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />}
                              <span className="font-medium" style={{ color: 'var(--navy-800)' }}>{inv.name}</span>
                            </span>
                            {inv.email && <span className="block text-xs pl-5" style={{ color: 'var(--ash)' }}>{inv.email}</span>}
                          </td>
                          <td className="text-center" style={{ color: 'var(--slate)' }}>
                            {inv.notes.length > 1
                              ? `${inv.notes.length} pagarés`
                              : `${inv.notes[0]?.period} de ${inv.notes[0]?.term}`}
                          </td>
                          <td className="text-right font-serif font-semibold" style={{ color: 'var(--ink)' }}>{fmt(inv.total)}</td>
                          <td className="text-right" style={{ color: 'var(--slate)' }}>{fmt(inv.principal)}</td>
                          <td className="text-right" style={{ color: 'var(--gold-700)' }}>{fmt(inv.interest)}</td>
                        </tr>

                        {abiertaEsta && (
                          <tr>
                            <td colSpan={5} className="p-0">
                              <div className="px-4 py-4 space-y-4" style={{ backgroundColor: 'var(--cream)', borderBottom: '1px solid var(--sand)' }}>
                                {inv.notes.map((n, idx) => (
                                  <div key={n.note_id || idx}>
                                    {inv.notes.length > 1 && (
                                      <p className="text-xs font-medium mb-2" style={{ color: 'var(--ash)' }}>
                                        Pagaré {idx + 1} de {inv.notes.length}
                                      </p>
                                    )}
                                    <ExplicacionLinea n={n} />
                                  </div>
                                ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
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
