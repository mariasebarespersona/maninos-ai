'use client'

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import {
  Home, User, MapPin, ArrowLeft, Users, Plus, X, Loader2,
  Building2, TrendingUp, Wallet, AlertTriangle, Check,
} from 'lucide-react'

interface InvestorLink {
  investment_id: string
  investor_id: string
  investor_name: string | null
  amount: number
  rate: number
  status: string
  note_backed: boolean
}

interface AssignableInvestor {
  investor_id: string
  investor_name: string | null
  available_capital: number
  total_invested: number
}

interface ScheduleRow {
  payment_number: number
  amount: number
  paid_amount: number | null
  due_date: string
  paid_date: string | null
  status: string
}

interface HouseDetail {
  sale_id: string
  status: string
  bucket: string
  capital_payment_status: string | null
  property: { id: string | null; code: string | null; address: string | null; city: string | null; state: string | null; yard: string | null; photo: string | null }
  client: { id: string | null; name: string | null; email: string | null; phone: string | null }
  terms: { sale_price: number; down_payment: number; financed_remaining: number; monthly_payment: number; term_months: number }
  contract: { id: string; status: string; start_date: string; end_date: string } | null
  collection: { payments_made: number; total_payments: number; total_paid: number; next_due: string | null; overdue: number; percentage: number }
  investors: InvestorLink[]
  investor_funded_total: number
  capital_position: {
    capital_invested_house: number
    down_payment_income: number
    rental_income: number
    late_fee_income: number
    ar_outstanding: number
  }
  schedule: ScheduleRow[]
}

const bucketLabels: Record<string, { bg: string; color: string; label: string }> = {
  por_revisar: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Por revisar' },
  aprobada: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Aprobada' },
  activa: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
  liquidada: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Liquidada' },
  cancelada: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Cancelada' },
}

const payStyles: Record<string, { color: string; label: string }> = {
  scheduled: { color: 'var(--slate)', label: 'Programado' },
  pending: { color: 'var(--warning)', label: 'Pendiente' },
  paid: { color: 'var(--success)', label: 'Pagado' },
  late: { color: 'var(--error)', label: 'Atrasado' },
  partial: { color: 'var(--warning)', label: 'Parcial' },
  waived: { color: 'var(--ash)', label: 'Condonado' },
  failed: { color: 'var(--error)', label: 'Fallido' },
}

export default function FinancedHouseDetailPage() {
  const params = useParams()
  const saleId = params.id as string
  const [house, setHouse] = useState<HouseDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [assignable, setAssignable] = useState<AssignableInvestor[]>([])
  const [loadingAssign, setLoadingAssign] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [selInvestor, setSelInvestor] = useState('')
  const [amount, setAmount] = useState('')
  const [rate, setRate] = useState('12')
  const [submitting, setSubmitting] = useState(false)

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n || 0)

  const loadHouse = useCallback(async () => {
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}`)
      const data = await res.json()
      if (data.ok) setHouse(data.house)
    } catch (err) {
      console.error('Error loading house:', err)
    } finally {
      setLoading(false)
    }
  }, [saleId])

  useEffect(() => { loadHouse() }, [loadHouse])

  const openModal = async () => {
    setSelInvestor(''); setAmount(''); setRate('12')
    setShowModal(true)
    setLoadingAssign(true)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/assignable-investments`)
      const data = await res.json()
      if (data.ok) setAssignable(data.investors)
    } catch (err) {
      console.error('Error loading assignable:', err)
    } finally {
      setLoadingAssign(false)
    }
  }

  const assign = async () => {
    const amt = parseFloat(amount)
    if (!selInvestor || !amt || amt <= 0) { alert('Elegí un inversionista y un monto válido'); return }
    const rateNum = rate.trim() === '' ? 12 : parseFloat(rate)
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/assign-investor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investor_id: selInvestor, amount: amt, expected_return_rate: isNaN(rateNum) ? 12 : rateNum }),
      })
      const data = await res.json()
      if (data.ok) {
        setShowModal(false)
        setSelInvestor(''); setAmount(''); setRate('12')
        await loadHouse()
      } else {
        alert(data.detail || 'No se pudo asignar')
      }
    } catch (err) {
      console.error(err)
      alert('Error de red al asignar. Intentá de nuevo.')
    } finally {
      setSubmitting(false)
    }
  }

  const unassign = async (investmentId: string) => {
    if (!confirm('¿Deshacer esta asignación? Se borra el ticket, se revierte el asiento de 23900 y se restaura el capital disponible del inversionista.')) return
    setBusy(investmentId)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/unassign-investor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ investment_id: investmentId }),
      })
      const data = await res.json()
      if (data.ok) await loadHouse()
      else alert(data.detail || 'No se pudo quitar')
    } catch (err) {
      console.error(err)
    } finally {
      setBusy(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!house) {
    return (
      <div className="card-luxury p-12 text-center">
        <p style={{ color: 'var(--slate)' }}>Casa no encontrada.</p>
        <Link href="/capital/financed-houses" className="text-sm mt-3 inline-block" style={{ color: 'var(--gold-700)' }}>
          ← Volver a Casas Financiadas
        </Link>
      </div>
    )
  }

  const s = bucketLabels[house.bucket] || bucketLabels.por_revisar
  const selAvail = assignable.find(a => a.investor_id === selInvestor)?.available_capital ?? null
  const amtNum = parseFloat(amount)

  const posItems = [
    { icon: Building2, label: 'Capital invertido (14300)', value: house.capital_position.capital_invested_house, hint: 'Pagado a Homes por la casa' },
    { icon: Wallet, label: 'Enganche cobrado (42000)', value: house.capital_position.down_payment_income, hint: 'Ingreso por enganche' },
    { icon: TrendingUp, label: 'Renta cobrada (41000)', value: house.capital_position.rental_income, hint: 'Mensualidades cobradas' },
    { icon: AlertTriangle, label: 'Mora cobrada (43000)', value: house.capital_position.late_fee_income, hint: 'Cargos por atraso' },
    { icon: User, label: 'Por cobrar cliente (12000)', value: house.capital_position.ar_outstanding, hint: 'A/R acumulada' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/capital/financed-houses" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
        <ArrowLeft className="w-4 h-4" /> Casas Financiadas
      </Link>

      {/* Header */}
      <div className="card-luxury p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ backgroundColor: 'var(--gold-100)' }}>
              <Home className="w-7 h-7" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div>
              <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
                {house.property.code || 'Sin código'}
                {house.property.yard && <span className="ml-2 text-base font-normal" style={{ color: 'var(--ash)' }}>· {house.property.yard}</span>}
              </h1>
              <p className="flex items-center gap-1.5 text-sm mt-1" style={{ color: 'var(--slate)' }}>
                <MapPin className="w-4 h-4" />
                {house.property.address || 's/dirección'}{house.property.city ? `, ${house.property.city}` : ''}{house.property.state ? `, ${house.property.state}` : ''}
              </p>
              <p className="flex items-center gap-1.5 text-sm mt-1" style={{ color: 'var(--charcoal)' }}>
                <User className="w-4 h-4" style={{ color: 'var(--ash)' }} /> {house.client.name || 'Sin cliente'}
              </p>
            </div>
          </div>
          <span className="px-3 py-1.5 rounded-full text-sm font-medium" style={{ backgroundColor: s.bg, color: s.color }}>
            {s.label}
          </span>
        </div>

        {/* Cross-links: Clientes RTO ↔ Casas Financiadas */}
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t" style={{ borderColor: 'var(--cream)' }}>
          <Link href="/capital/applications" className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}>
            Ver en Clientes RTO
          </Link>
          {house.contract && (
            <Link href={`/capital/contracts/${house.contract.id}`} className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}>
              Ver contrato
            </Link>
          )}
          <Link href="/capital/payments" className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}>
            Ver pagos
          </Link>
          {house.client.id && (
            <Link href={`/capital/investors`} className="text-xs px-2.5 py-1 rounded-full" style={{ backgroundColor: 'var(--cream)', color: 'var(--slate)' }}>
              Seguimiento inversionistas
            </Link>
          )}
        </div>
      </div>

      {/* Terms */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Precio de venta', value: house.terms.sale_price },
          { label: 'Enganche', value: house.terms.down_payment },
          { label: 'Saldo financiado', value: house.terms.financed_remaining },
          { label: 'Mensualidad', value: house.terms.monthly_payment },
        ].map((t) => (
          <div key={t.label} className="card-luxury p-4">
            <p className="text-xs" style={{ color: 'var(--ash)' }}>{t.label}</p>
            <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>{fmt(t.value)}</p>
          </div>
        ))}
        <div className="card-luxury p-4">
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Plazo</p>
          <p className="font-semibold text-lg" style={{ color: 'var(--ink)' }}>{house.terms.term_months || '—'} meses</p>
        </div>
      </div>

      {/* Collection progress */}
      {house.collection.total_payments > 0 && (
        <div className="card-luxury p-5">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Cobranza</h2>
            <span className="text-sm" style={{ color: 'var(--slate)' }}>
              {house.collection.payments_made}/{house.collection.total_payments} pagos · {fmt(house.collection.total_paid)} · {house.collection.percentage}%
            </span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--cream)' }}>
            <div className="h-full rounded-full" style={{ width: `${house.collection.percentage}%`, backgroundColor: 'var(--success)' }} />
          </div>
          {house.collection.overdue > 0 && (
            <p className="flex items-center gap-1.5 text-sm mt-2" style={{ color: 'var(--error)' }}>
              <AlertTriangle className="w-4 h-4" /> {house.collection.overdue} pago(s) en mora
            </p>
          )}
          {house.collection.next_due && (
            <p className="text-sm mt-2" style={{ color: 'var(--slate)' }}>Próximo vencimiento: {house.collection.next_due}</p>
          )}
        </div>
      )}

      {/* Capital accounting position */}
      <div className="card-luxury p-5">
        <h2 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>Posición contable (Capital)</h2>
        <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>Del ledger de Capital (capital_transactions). No incluye la contabilidad de Homes.</p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {posItems.map((p) => (
            <div key={p.label}>
              <p className="flex items-center gap-1.5 text-xs mb-1" style={{ color: 'var(--ash)' }}>
                <p.icon className="w-3.5 h-3.5" /> {p.label}
              </p>
              <p className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(p.value)}</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>{p.hint}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Investors */}
      <div className="card-luxury p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Users className="w-5 h-5" style={{ color: 'var(--gold-700)' }} /> Inversionistas
          </h2>
          <button onClick={openModal} className="btn-secondary text-sm py-2 px-3 inline-flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> Asignar inversionista
          </button>
        </div>
        {house.investors.length === 0 ? (
          <p className="text-sm" style={{ color: 'var(--slate)' }}>Ninguna inversión asignada a esta casa todavía.</p>
        ) : (
          <div className="space-y-2">
            {house.investors.map((inv) => (
              <div key={inv.investment_id} className="flex items-center justify-between gap-3 p-3 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                <div className="min-w-0">
                  <p className="font-medium truncate" style={{ color: 'var(--ink)' }}>{inv.investor_name || 'Inversionista'}</p>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>
                    {fmt(inv.amount)} · {inv.rate}%{inv.note_backed ? ' · con pagaré' : ''}
                  </p>
                </div>
                <button
                  onClick={() => unassign(inv.investment_id)}
                  disabled={busy === inv.investment_id}
                  className="text-xs flex items-center gap-1 disabled:opacity-50"
                  style={{ color: 'var(--error)' }}
                >
                  {busy === inv.investment_id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />} Quitar
                </button>
              </div>
            ))}
            <p className="text-sm pt-1" style={{ color: 'var(--slate)' }}>
              Total fondeado: <span className="font-semibold" style={{ color: 'var(--ink)' }}>{fmt(house.investor_funded_total)}</span>
            </p>
          </div>
        )}
      </div>

      {/* Payment schedule */}
      {house.schedule.length > 0 && (
        <div className="card-luxury p-5">
          <h2 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Cronograma de pagos</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--ash)' }} className="text-left text-xs">
                  <th className="pb-2 pr-4">#</th>
                  <th className="pb-2 pr-4">Vencimiento</th>
                  <th className="pb-2 pr-4">Monto</th>
                  <th className="pb-2 pr-4">Pagado</th>
                  <th className="pb-2 pr-4">Fecha pago</th>
                  <th className="pb-2">Estado</th>
                </tr>
              </thead>
              <tbody>
                {house.schedule.map((r) => {
                  const ps = payStyles[r.status] || payStyles.scheduled
                  return (
                    <tr key={r.payment_number} className="border-t" style={{ borderColor: 'var(--cream)' }}>
                      <td className="py-2 pr-4" style={{ color: 'var(--slate)' }}>{r.payment_number}</td>
                      <td className="py-2 pr-4" style={{ color: 'var(--charcoal)' }}>{r.due_date}</td>
                      <td className="py-2 pr-4" style={{ color: 'var(--charcoal)' }}>{fmt(r.amount)}</td>
                      <td className="py-2 pr-4" style={{ color: 'var(--charcoal)' }}>{r.paid_amount ? fmt(r.paid_amount) : '—'}</td>
                      <td className="py-2 pr-4" style={{ color: 'var(--slate)' }}>{r.paid_date || '—'}</td>
                      <td className="py-2 font-medium" style={{ color: ps.color }}>{ps.label}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Assign modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} onClick={() => setShowModal(false)}>
          <div className="card-luxury p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Asignar inversionista a esta casa</h3>
              <button onClick={() => setShowModal(false)}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
              Despliega capital de un inversionista a esta casa: baja su <strong>capital disponible</strong>, sube su capital invertido y registra el depósito en contabilidad (23900, sujeto a aprobación).
            </p>
            {loadingAssign ? (
              <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
            ) : assignable.length === 0 ? (
              <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>No hay inversionistas activos disponibles.</p>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Inversionista</label>
                  <select value={selInvestor} onChange={(e) => setSelInvestor(e.target.value)} className="input w-full mt-1 text-sm">
                    <option value="">Elegí un inversionista…</option>
                    {assignable.map((a) => (
                      <option key={a.investor_id} value={a.investor_id}>
                        {a.investor_name || 'Inversionista'} — disponible {fmt(a.available_capital)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Monto</label>
                    <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="input w-full mt-1 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Tasa % anual</label>
                    <input type="number" value={rate} onChange={(e) => setRate(e.target.value)} className="input w-full mt-1 text-sm" />
                  </div>
                </div>
                {selAvail != null && !isNaN(amtNum) && amtNum > selAvail && (
                  <p className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--warning)' }}>
                    <AlertTriangle className="w-3.5 h-3.5" /> El monto supera el capital disponible ({fmt(selAvail)}).
                  </p>
                )}
                <button
                  onClick={assign}
                  disabled={submitting || !selInvestor || !amtNum || amtNum <= 0 || (selAvail != null && amtNum > selAvail)}
                  className="btn-primary w-full inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Asignar capital a esta casa
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
