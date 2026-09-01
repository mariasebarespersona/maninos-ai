'use client'

import { useEffect, useState } from 'react'
import { Home, Loader2, CheckCircle2, DollarSign, CalendarCheck } from 'lucide-react'

/**
 * Casas Entregadas — casas que ya son del cliente.
 *
 * Una casa se entrega cuando el cliente termina de pagar su RTO: el contrato
 * pasa a `delivered` (con su `delivered_at`), la venta a `completed` y el
 * cliente a `rto_completed`. Ver POST /capital/contracts/{id}/deliver.
 *
 * Esta vista es SOLO LECTURA: refleja lo que ya ocurrió, no dispara entregas.
 */

interface Contract {
  id: string
  purchase_price: number
  delivered_at: string | null
  created_at: string
  clients: { id: string; name: string; email: string | null; phone: string | null } | null
  properties: { id: string; address: string; city: string | null; state: string | null } | null
  progress?: {
    payments_made: number
    total_payments: number
    total_paid: number
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

/** Meses entre la firma del contrato y la entrega. */
const meses = (desde: string, hasta: string | null) => {
  if (!hasta) return null
  const a = new Date(desde), b = new Date(hasta)
  const m = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth())
  return m >= 0 ? m : null
}

export default function CasasEntregadasPage() {
  const [contracts, setContracts] = useState<Contract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    fetch('/api/capital/contracts?status=delivered')
      .then(r => r.json())
      .then(d => {
        if (cancelled) return
        if (d.ok === false) { setError(d.error || 'No se pudieron cargar las entregas'); return }
        setContracts(d.contracts || [])
      })
      .catch(() => { if (!cancelled) setError('No se pudieron cargar las entregas') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const totalCobrado = contracts.reduce((a, c) => a + (c.progress?.total_paid || 0), 0)
  const plazos = contracts.map(c => meses(c.created_at, c.delivered_at)).filter((x): x is number => x !== null)
  const plazoMedio = plazos.length ? Math.round(plazos.reduce((a, b) => a + b, 0) / plazos.length) : null

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Casas Entregadas</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          <Home className="w-4 h-4 inline mr-1" style={{ color: 'var(--gold-700)' }} />
          Casas que ya son del cliente: terminó de pagar su RTO y se le entregó el título.
        </p>
      </div>

      {error && (
        <div className="rounded-lg p-4 text-sm"
             style={{ backgroundColor: 'var(--danger-light)', border: '1px solid var(--danger)', color: 'var(--ink)' }}>
          {error}
        </div>
      )}

      {!error && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-luxury p-5">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Casas entregadas</p>
            <p className="font-serif text-2xl mt-1" style={{ color: 'var(--ink)' }}>{contracts.length}</p>
          </div>
          <div className="card-luxury p-5">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total cobrado</p>
            <p className="font-serif text-2xl mt-1" style={{ color: 'var(--ink)' }}>{fmt(totalCobrado)}</p>
            <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Suma de los pagos RTO recibidos</p>
          </div>
          <div className="card-luxury p-5">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Plazo medio hasta la entrega</p>
            <p className="font-serif text-2xl mt-1" style={{ color: 'var(--ink)' }}>
              {plazoMedio !== null ? `${plazoMedio} meses` : '—'}
            </p>
          </div>
        </div>
      )}

      {!error && contracts.length === 0 && (
        <div className="rounded-lg p-6 flex items-start gap-3"
             style={{ backgroundColor: 'var(--info-light)', border: '1px solid var(--info)' }}>
          <CalendarCheck className="w-5 h-5 flex-none mt-0.5" style={{ color: 'var(--info)' }} />
          <div>
            <p className="font-semibold" style={{ color: 'var(--ink)' }}>Todavía no hay casas entregadas</p>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
              Aquí aparecerán en cuanto un cliente termine de pagar su RTO y se le entregue el título.
              La entrega se hace desde la ficha del contrato, en <strong>Contratos</strong>.
            </p>
          </div>
        </div>
      )}

      {contracts.length > 0 && (
        <div className="card-luxury overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: '52rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--sand)' }}>
                {['Cliente', 'Casa', 'Entregada', 'Precio', 'Pagos', 'Total cobrado'].map((h, i) => (
                  <th key={h}
                      className="text-xs font-medium uppercase tracking-wide px-4 py-3"
                      style={{ color: 'var(--ash)', textAlign: i >= 3 ? 'right' : 'left' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {contracts.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid var(--sand)' }}>
                  <td className="px-4 py-3" style={{ color: 'var(--ink)' }}>
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 flex-none" style={{ color: 'var(--success)' }} />
                      {c.clients?.name || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--slate)' }}>
                    {c.properties?.address || '—'}
                    {c.properties?.city ? `, ${c.properties.city}` : ''}
                  </td>
                  <td className="px-4 py-3" style={{ color: 'var(--slate)' }}>{fmtDate(c.delivered_at)}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>
                    {fmt(c.purchase_price)}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--slate)' }}>
                    {c.progress ? `${c.progress.payments_made}/${c.progress.total_payments}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--ink)' }}>
                    {fmt(c.progress?.total_paid || 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {contracts.length > 0 && (
        <p className="text-xs" style={{ color: 'var(--slate)' }}>
          <DollarSign className="w-3 h-3 inline mr-1" />
          "Total cobrado" son los pagos RTO efectivamente recibidos de cada contrato, no el precio pactado.
        </p>
      )}
    </div>
  )
}
