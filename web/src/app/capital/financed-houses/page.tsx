'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Home, User, MapPin, DollarSign, Clock, Filter, Users, AlertTriangle, Trash2, Hammer } from 'lucide-react'
import DeleteChainModal from '@/components/capital/DeleteChainModal'

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
    renovation_cost: number | null
  }
  /** Motivo por el que este contrato necesita revisión (carga histórica). */
  revisar?: string | null
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

interface PriceVsMarket {
  kpi: {
    minima: number; rentabilidad_media: number | null; rentabilidad_mediana: number | null
    con_datos: number; total: number; cumplen: number; no_cumplen: number
    mercado_evaluadas: number; por_encima_de_mercado: number
    costo_total_media: number | null; renta_evaluadas: number; renta_por_encima: number
    costo_fondeo?: number | null; bajo_fondeo?: number
    margen_proyectado_medio?: number | null; margen_real_medio?: number | null
    casas_con_vencimientos?: number; cobranza?: number | null
  }
  por_casa: Record<string, { rentabilidad: number | null; rentabilidad_estado: string; semaforo?: string; mercado_estado: string }>
}

const pctTxt = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`)

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
  const [deleteSaleId, setDeleteSaleId] = useState<string | null>(null)
  const [pvm, setPvm] = useState<PriceVsMarket | null>(null)

  useEffect(() => { loadHouses() }, [filter])

  // KPI "precio promedio ≤ 70% del valor de mercado" + veredicto por casa
  useEffect(() => {
    fetch('/api/capital/financed-houses/kpi/price-vs-market', { cache: 'no-store' })
      .then(r => r.json()).then(d => { if (d.ok) setPvm(d) }).catch(() => {})
  }, [])

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
          <Link href="/capital/applications/alta-manual?desde=casas" className="btn-primary btn-sm flex-shrink-0">
            ＋ Alta manual de casa
          </Link>
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

      {/* KPI: rentabilidad anual de la cartera (mínimo 30%) y compras vs. mercado */}
      {pvm && (
        <div className="card-luxury p-4 flex flex-wrap items-center gap-x-6 gap-y-2" data-testid="kpi-price-vs-market">
          <div>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Rentabilidad anual media</p>
            <p className="font-serif text-2xl" style={{ color: pvm.kpi.rentabilidad_media == null ? 'var(--ink)' : pvm.kpi.rentabilidad_media >= pvm.kpi.minima ? 'var(--success)' : 'var(--danger)' }}>
              {pctTxt(pvm.kpi.rentabilidad_media)}
              <span className="text-sm ml-2" style={{ color: 'var(--ash)' }}>mínimo {pctTxt(pvm.kpi.minima)}</span>
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Margen s/ costo total (con enganche)</p>
            <p className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>{pctTxt(pvm.kpi.costo_total_media)}<span className="text-sm ml-1" style={{ color: 'var(--ash)' }}>anual</span></p>
          </div>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>
            <strong>{pvm.kpi.cumplen} de {pvm.kpi.con_datos}</strong> casas llegan al {pctTxt(pvm.kpi.minima)} · mediana {pctTxt(pvm.kpi.rentabilidad_mediana)}
            {' · '}{pvm.kpi.por_encima_de_mercado} de {pvm.kpi.mercado_evaluadas} con valor de mercado no se compraron por debajo
            {' · '}{pvm.kpi.renta_por_encima} de {pvm.kpi.renta_evaluadas} con renta de mercado la superan
            {pvm.kpi.costo_fondeo != null && (
              <span className="block" data-testid="kpi-bajo-fondeo" style={{ color: (pvm.kpi.bajo_fondeo || 0) > 0 ? 'var(--danger)' : 'var(--success)' }}>
                <strong>{pvm.kpi.bajo_fondeo || 0}</strong> casas con margen por debajo del costo del fondeo ({pctTxt(pvm.kpi.costo_fondeo)})
              </span>
            )}
            {pvm.kpi.margen_real_medio != null && (
              <span className="block" data-testid="kpi-margen-real" title="Real = proyectado × (cobrado ÷ lo que debía cobrarse hasta hoy según el calendario)">
                Margen proyectado {pctTxt(pvm.kpi.margen_proyectado_medio)} · real a la fecha <strong>{pctTxt(pvm.kpi.margen_real_medio)}</strong>
                {' '}(cobrado el {pctTxt(pvm.kpi.cobranza)} de lo vencido, {pvm.kpi.casas_con_vencimientos} casas)
              </span>
            )}
          </p>
          <Link href="/capital/evaluar-compra" className="btn-secondary btn-sm ml-auto">Propuesta de compra</Link>
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
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {(() => {
                        const e = pvm?.por_casa[h.sale_id]
                        if (!e || e.rentabilidad == null) return null
                        const sem = e.semaforo || (e.rentabilidad_estado === 'cumple' ? 'verde' : 'rojo')
                        const col = sem === 'verde' ? { bg: 'var(--success-light)', fg: 'var(--success)' }
                          : sem === 'amarillo' ? { bg: 'var(--warning-light, #fdf6e3)', fg: 'var(--warning, #b7791f)' }
                          : { bg: 'var(--error-light)', fg: 'var(--error)' }
                        return (
                          <span className="px-2 py-1 rounded-full text-[11px] font-medium whitespace-nowrap"
                                title="Margen anual sobre lo que pone Capital: rojo = no cubre el fondeo, amarillo = no llega al 30%, verde = llega"
                                style={{ backgroundColor: col.bg, color: col.fg }}>
                            {pctTxt(e.rentabilidad)} anual
                          </span>
                        )
                      })()}
                      <span className="px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                            style={{ backgroundColor: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeleteSaleId(h.sale_id) }}
                        className="p-1.5 rounded hover:opacity-80"
                        title="Eliminar operación RTO completa"
                        aria-label="Eliminar operación RTO completa"
                      >
                        <Trash2 className="w-4 h-4" style={{ color: 'var(--error)' }} />
                      </button>
                    </div>
                  </div>

                  {/* Client */}
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                    <User className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                    {h.client.name || 'Sin cliente'}
                  </div>

                  {/* Revisión pendiente: la carga histórica trajo datos que la
                      app no puede validar sola. En rojo y con el motivo, para
                      que se vea desde el listado sin tener que entrar. */}
                  {h.revisar && (
                    <div className="flex items-start gap-2 text-xs rounded-lg p-2"
                         style={{ backgroundColor: 'var(--error-light)', border: '1px solid var(--danger)' }}>
                      <AlertTriangle className="w-4 h-4 flex-none mt-0.5" style={{ color: 'var(--danger)' }} />
                      <span style={{ color: 'var(--danger)' }}>
                        <strong>Revisar:</strong> {h.revisar}
                      </span>
                    </div>
                  )}

                  {/* Remodelación — dato de Homes, aquí solo se muestra. Se
                      omite la línea si nadie lo ha registrado, para no llenar
                      la tarjeta de guiones. */}
                  {h.property.renovation_cost != null && (
                    <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                      <Hammer className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                      Remodelación {fmt(h.property.renovation_cost)}
                    </div>
                  )}

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

      {/* Modal de borrado en cascada */}
      {deleteSaleId && (
        <DeleteChainModal
          saleId={deleteSaleId}
          onClose={() => setDeleteSaleId(null)}
          onDeleted={() => { setDeleteSaleId(null); loadHouses() }}
        />
      )}
    </div>
  )
}
