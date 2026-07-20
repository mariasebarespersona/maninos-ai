'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home, User, MapPin, DollarSign, Clock, Filter, Users, AlertTriangle } from 'lucide-react'

interface InvestorLink {
  investment_id: string
  investor_id: string
  investor_name: string | null
  amount: number
  rate: number
  status: string
  note_backed: boolean
}

interface FinancedHouse {
  sale_id: string
  status: string
  bucket: string
  created_at: string
  property: {
    id: string | null
    code: string | null
    address: string | null
    city: string | null
    state: string | null
    yard: string | null
    photo: string | null
  }
  client: { id: string | null; name: string | null; email: string | null; phone: string | null }
  terms: {
    sale_price: number
    down_payment: number
    financed_remaining: number
    monthly_payment: number
    term_months: number
  }
  contract: { id: string; status: string; start_date: string; end_date: string } | null
  collection: {
    payments_made: number
    total_payments: number
    total_paid: number
    next_due: string | null
    overdue: number
    percentage: number
  }
  investors: InvestorLink[]
  investor_funded_total: number
}

const bucketStyles: Record<string, { bg: string; color: string; label: string }> = {
  por_revisar: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Por revisar' },
  aprobada: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Aprobada' },
  activa: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
  liquidada: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Liquidada' },
  cancelada: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Cancelada' },
}

const FILTERS = [
  { value: '', label: 'Todas' },
  { value: 'por_revisar', label: 'Por revisar' },
  { value: 'aprobada', label: 'Aprobadas' },
  { value: 'activa', label: 'Activas' },
  { value: 'liquidada', label: 'Liquidadas' },
  { value: 'cancelada', label: 'Canceladas' },
]

export default function FinancedHousesPage() {
  const [houses, setHouses] = useState<FinancedHouse[]>([])
  const [buckets, setBuckets] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => { loadHouses() }, [filter])

  const loadHouses = async () => {
    setLoading(true)
    try {
      const params = filter ? `?status=${filter}` : ''
      const res = await fetch(`/api/capital/financed-houses${params}`)
      const data = await res.json()
      if (data.ok) {
        setHouses(data.houses)
        setBuckets(data.buckets || {})
      }
    } catch (err) {
      console.error('Error loading financed houses:', err)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n || 0)

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Casas Financiadas</h1>
          <p style={{ color: 'var(--slate)' }}>
            Cartera de propiedades de Homes vendidas con financiamiento (RTO) — la posición de Capital por casa
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: 'var(--ash)' }} />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="input py-2 px-3 text-sm"
            style={{ minHeight: 'auto', width: 'auto' }}
          >
            {FILTERS.map(f => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Bucket tallies */}
      {!loading && Object.keys(buckets).length > 0 && (
        <div className="flex flex-wrap gap-3">
          {FILTERS.filter(f => f.value && buckets[f.value]).map(f => {
            const s = bucketStyles[f.value]
            return (
              <button
                key={f.value}
                onClick={() => setFilter(filter === f.value ? '' : f.value)}
                className="px-3 py-1.5 rounded-full text-sm font-medium transition-opacity"
                style={{ backgroundColor: s.bg, color: s.color, opacity: filter && filter !== f.value ? 0.5 : 1 }}
              >
                {s.label}: {buckets[f.value]}
              </button>
            )
          })}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
        </div>
      ) : houses.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <Home className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            No hay casas financiadas {filter ? `(${bucketStyles[filter]?.label || filter})` : ''}
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            Aparecen aquí en cuanto Homes crea una venta financiada (RTO)
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {houses.map((h) => {
            const s = bucketStyles[h.bucket] || bucketStyles.por_revisar
            return (
              <Link
                key={h.sale_id}
                href={`/capital/financed-houses/${h.sale_id}`}
                className="card-luxury block hover:border-gold-400 transition-colors"
              >
                <div className="p-5 space-y-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0"
                           style={{ backgroundColor: 'var(--gold-100)' }}>
                        <Home className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold truncate" style={{ color: 'var(--ink)' }}>
                          {h.property.code || 'Sin código'}
                          {h.property.yard && (
                            <span className="ml-2 text-xs font-normal" style={{ color: 'var(--ash)' }}>· {h.property.yard}</span>
                          )}
                        </h3>
                        <p className="text-sm flex items-center gap-1 truncate" style={{ color: 'var(--slate)' }}>
                          <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                          <span className="truncate">{h.property.address || 's/dirección'}{h.property.city ? `, ${h.property.city}` : ''}</span>
                        </p>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                          style={{ backgroundColor: s.bg, color: s.color }}>
                      {s.label}
                    </span>
                  </div>

                  {/* Client */}
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                    <User className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                    {h.client.name || 'Sin cliente'}
                  </div>

                  {/* Numbers */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Saldo financiado</p>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(h.terms.financed_remaining)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Mensualidad</p>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(h.terms.monthly_payment)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Plazo</p>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>{h.terms.term_months || '—'} m</p>
                    </div>
                  </div>

                  {/* Progress */}
                  {h.collection.total_payments > 0 && (
                    <div>
                      <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--slate)' }}>
                        <span>{h.collection.payments_made}/{h.collection.total_payments} pagos · {fmt(h.collection.total_paid)}</span>
                        <span>{h.collection.percentage}%</span>
                      </div>
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--cream)' }}>
                        <div className="h-full rounded-full" style={{ width: `${h.collection.percentage}%`, backgroundColor: 'var(--success)' }} />
                      </div>
                    </div>
                  )}

                  {/* Footer: investors + overdue */}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--slate)' }}>
                      <Users className="w-3.5 h-3.5" />
                      {h.investors.length > 0
                        ? `${h.investors.length} inversionista${h.investors.length > 1 ? 's' : ''} · ${fmt(h.investor_funded_total)}`
                        : 'Sin inversionista asignado'}
                    </div>
                    {h.collection.overdue > 0 && (
                      <span className="flex items-center gap-1 text-xs font-medium" style={{ color: 'var(--error)' }}>
                        <AlertTriangle className="w-3.5 h-3.5" /> {h.collection.overdue} en mora
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
