'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, DollarSign, TrendingUp, Building2, Search,
  ChevronDown, ChevronRight, Plus, Loader2, CreditCard,
  FileText, CheckCircle, Clock, XCircle, AlertCircle,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/Auth/AuthProvider'

interface PropertyFinancial {
  id: string
  address: string
  property_code: string
  city: string
  status: string
  purchase_price: number
  renovation_cost: number
  move_cost: number
  commission: number
  margin: number
  total_investment: number
  sale_price: number
  profit: number
  amount_paid: number
  amount_pending: number
  sale_id: string | null
  sale_status: string | null
  sale_type: string | null
  client_name: string
  payment_orders_count: number
  payment_orders_total: number
  accounting_txn_count: number
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Pago Pendiente', cls: 'bg-orange-100 text-orange-700' },
  purchased: { label: 'Comprada', cls: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicada', cls: 'bg-emerald-100 text-emerald-700' },
  renovating: { label: 'Renovando', cls: 'bg-amber-100 text-amber-700' },
  reserved: { label: 'Reservada', cls: 'bg-purple-100 text-purple-700' },
  sold: { label: 'Vendida', cls: 'bg-navy-100 text-navy-700' },
}

const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`

export default function ResumenFinancieroPage() {
  const toast = useToast()
  const { teamUser } = useAuth()
  const isAdmin = teamUser?.role === 'admin'

  const [properties, setProperties] = useState<PropertyFinancial[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [cityFilter, setCityFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/properties/financial-summary')
      const data = await res.json()
      if (data.ok) setProperties(data.properties || [])
    } catch (e) {
      console.error('Error fetching financial summary:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (!isAdmin) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h2 className="font-serif text-xl text-navy-900 mb-2">Acceso Restringido</h2>
        <p className="text-navy-500">Solo administradores pueden acceder a esta seccion.</p>
      </div>
    )
  }

  // Filters
  const cities = Array.from(new Set(properties.map(p => p.city).filter(Boolean))).sort()
  const filtered = properties.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (cityFilter && p.city !== cityFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!p.address.toLowerCase().includes(q) && !p.property_code.toLowerCase().includes(q) && !p.client_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  // Totals
  const totals = filtered.reduce((acc, p) => ({
    purchase: acc.purchase + p.purchase_price,
    reno: acc.reno + p.renovation_cost,
    move: acc.move + p.move_cost,
    sale: acc.sale + p.sale_price,
    paid: acc.paid + p.amount_paid,
    pending: acc.pending + p.amount_pending,
    profit: acc.profit + p.profit,
    investment: acc.investment + p.total_investment,
  }), { purchase: 0, reno: 0, move: 0, sale: 0, paid: 0, pending: 0, profit: 0, investment: 0 })

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
            <BarChart3 className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
              Resumen Financiero
            </h1>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              Vista consolidada de todas las propiedades — solo administradores
            </p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-luxury p-4">
          <p className="text-xs text-navy-500 mb-1">Total Invertido</p>
          <p className="text-xl font-serif font-bold text-navy-900">{fmt(totals.investment)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs text-navy-500 mb-1">Total Vendido</p>
          <p className="text-xl font-serif font-bold text-navy-900">{fmt(totals.sale)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs text-navy-500 mb-1">Total Cobrado</p>
          <p className="text-xl font-serif font-bold text-emerald-700">{fmt(totals.paid)}</p>
        </div>
        <div className="card-luxury p-4">
          <p className="text-xs text-navy-500 mb-1">Ganancia Total</p>
          <p className={`text-xl font-serif font-bold ${totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
            {fmt(totals.profit)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input
            type="text"
            placeholder="Buscar propiedad, codigo o cliente..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-navy-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gold-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-sm border border-navy-200 rounded-lg px-3 py-2"
        >
          <option value="">Todos los estados</option>
          <option value="purchased">Comprada</option>
          <option value="published">Publicada</option>
          <option value="renovating">Renovando</option>
          <option value="reserved">Reservada</option>
          <option value="sold">Vendida</option>
        </select>
        <select
          value={cityFilter}
          onChange={e => setCityFilter(e.target.value)}
          className="text-sm border border-navy-200 rounded-lg px-3 py-2"
        >
          <option value="">Todas las ciudades</option>
          {cities.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="text-xs text-navy-400">{filtered.length} propiedades</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-navy-500">
          <Loader2 className="w-5 h-5 animate-spin" /> Cargando datos financieros...
        </div>
      ) : (
        <div className="card-luxury overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left">
                <th className="px-3 py-3 font-medium text-navy-600 w-8"></th>
                <th className="px-3 py-3 font-medium text-navy-600">Propiedad</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Compra</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Reno</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Movida</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Venta</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Pagado</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Pendiente</th>
                <th className="px-3 py-3 font-medium text-navy-600 text-right">Ganancia</th>
                <th className="px-3 py-3 font-medium text-navy-600">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <PropertyRow
                  key={p.id}
                  property={p}
                  isExpanded={expandedId === p.id}
                  onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
                  onRefresh={fetchData}
                />
              ))}
              {/* Totals row */}
              <tr className="border-t-2 border-navy-300 font-bold bg-navy-50">
                <td className="px-3 py-3"></td>
                <td className="px-3 py-3 text-navy-900">TOTALES</td>
                <td className="px-3 py-3 text-right text-navy-900">{fmt(totals.purchase)}</td>
                <td className="px-3 py-3 text-right text-navy-900">{fmt(totals.reno)}</td>
                <td className="px-3 py-3 text-right text-navy-900">{fmt(totals.move)}</td>
                <td className="px-3 py-3 text-right text-navy-900">{fmt(totals.sale)}</td>
                <td className="px-3 py-3 text-right text-emerald-700">{fmt(totals.paid)}</td>
                <td className="px-3 py-3 text-right text-amber-700">{fmt(totals.pending)}</td>
                <td className={`px-3 py-3 text-right ${totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                  {fmt(totals.profit)}
                </td>
                <td className="px-3 py-3"></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════
// PROPERTY ROW (with inline edit + expandable detail)
// ═══════════════════════════════════════════════════════════════════

function PropertyRow({
  property: p,
  isExpanded,
  onToggle,
  onRefresh,
}: {
  property: PropertyFinancial
  isExpanded: boolean
  onToggle: () => void
  onRefresh: () => void
}) {
  const toast = useToast()
  const [editField, setEditField] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  const status = statusLabels[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' }

  const handleSave = async (field: string, value: number) => {
    try {
      // purchase_price and sale_price update the property directly
      if (field === 'purchase_price' || field === 'sale_price') {
        const res = await fetch(`/api/properties/${p.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ [field]: value }),
        })
        if (!res.ok) throw new Error('Error al guardar')
      }
      // renovation_cost — not directly patchable on property, would need renovation update
      // For now, show toast that it was updated in the Financiero panel
      toast.success('Guardado')
      setEditField(null)
      onRefresh()
    } catch {
      toast.error('Error al guardar')
    }
  }

  const EditableCell = ({ field, value }: { field: string; value: number }) => {
    const isEditing = editField === `${p.id}-${field}`
    const editable = field === 'purchase_price' || field === 'sale_price'

    if (isEditing && editable) {
      return (
        <input
          type="number"
          className="w-20 px-1 py-0.5 text-sm text-right border border-blue-400 rounded bg-blue-50 focus:outline-none"
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') handleSave(field, Number(editValue))
            if (e.key === 'Escape') setEditField(null)
          }}
          onBlur={() => handleSave(field, Number(editValue))}
          autoFocus
        />
      )
    }

    return (
      <span
        className={`${editable ? 'cursor-pointer hover:text-blue-600 hover:bg-blue-50 px-1 rounded transition-colors' : ''}`}
        onClick={editable ? () => { setEditField(`${p.id}-${field}`); setEditValue(String(value)) } : undefined}
        title={editable ? 'Click para editar' : undefined}
      >
        {fmt(value)}
      </span>
    )
  }

  return (
    <>
      <tr
        className={`border-b border-navy-100 hover:bg-navy-50 transition-colors cursor-pointer ${isExpanded ? 'bg-navy-50' : ''}`}
        onClick={onToggle}
      >
        <td className="px-3 py-3">
          {isExpanded
            ? <ChevronDown className="w-4 h-4 text-navy-400" />
            : <ChevronRight className="w-4 h-4 text-navy-400" />
          }
        </td>
        <td className="px-3 py-3">
          <div className="flex items-center gap-2">
            {p.property_code && (
              <span className="text-[10px] bg-navy-100 text-navy-600 px-1.5 py-0.5 rounded font-medium">{p.property_code}</span>
            )}
            <span className="text-navy-900 font-medium truncate max-w-[180px]">{p.address}</span>
          </div>
          {p.client_name && <p className="text-[11px] text-navy-400 mt-0.5">{p.client_name}</p>}
        </td>
        <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
          <EditableCell field="purchase_price" value={p.purchase_price} />
        </td>
        <td className="px-3 py-3 text-right text-navy-700">{fmt(p.renovation_cost)}</td>
        <td className="px-3 py-3 text-right text-navy-700">{fmt(p.move_cost)}</td>
        <td className="px-3 py-3 text-right" onClick={e => e.stopPropagation()}>
          <EditableCell field="sale_price" value={p.sale_price} />
        </td>
        <td className="px-3 py-3 text-right text-emerald-700 font-medium">{p.amount_paid > 0 ? fmt(p.amount_paid) : '—'}</td>
        <td className="px-3 py-3 text-right text-amber-600">{p.amount_pending > 0 ? fmt(p.amount_pending) : '—'}</td>
        <td className={`px-3 py-3 text-right font-bold ${p.profit > 0 ? 'text-emerald-700' : p.profit < 0 ? 'text-red-600' : 'text-navy-400'}`}>
          {p.sale_price > 0 ? fmt(p.profit) : '—'}
        </td>
        <td className="px-3 py-3">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${status.cls}`}>{status.label}</span>
        </td>
      </tr>

      {/* Expanded detail */}
      {isExpanded && (
        <tr>
          <td colSpan={10} className="p-0">
            <ExpandedDetail property={p} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  )
}


// ═══════════════════════════════════════════════════════════════════
// EXPANDED DETAIL (payments, orders, transactions)
// ═══════════════════════════════════════════════════════════════════

function ExpandedDetail({ property: p, onRefresh }: { property: PropertyFinancial; onRefresh: () => void }) {
  const toast = useToast()
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [newPayment, setNewPayment] = useState({ payment_type: 'partial', amount: '', payment_method: 'bank_transfer' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  const fetchDetail = () => {
    setLoading(true)
    fetch(`/api/properties/${p.id}/financial-detail`)
      .then(r => r.json())
      .then(d => { if (d.ok) setDetail(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { fetchDetail() }, [p.id])

  const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'
  const typeLabels: Record<string, string> = { down_payment: 'Enganche', remaining: 'Saldo', full: 'Total', partial: 'Parcial', adjustment: 'Ajuste' }
  const badge = (s: string) => {
    const m: Record<string, { l: string; c: string }> = {
      pending: { l: 'Pendiente', c: 'bg-amber-100 text-amber-700' }, confirmed: { l: 'Confirmado', c: 'bg-emerald-100 text-emerald-700' },
      approved: { l: 'Aprobado', c: 'bg-blue-100 text-blue-700' }, completed: { l: 'Completado', c: 'bg-emerald-100 text-emerald-700' },
      cancelled: { l: 'Cancelado', c: 'bg-red-100 text-red-700' }, in_progress: { l: 'En progreso', c: 'bg-blue-100 text-blue-700' },
      pending_approval: { l: 'Por aprobar', c: 'bg-amber-100 text-amber-700' }, draft: { l: 'Borrador', c: 'bg-gray-100 text-gray-600' },
    }
    const b = m[s] || { l: s, c: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${b.c}`}>{b.l}</span>
  }

  const handleAddPayment = async () => {
    if (!detail?.sale?.id || !newPayment.amount) return
    setAddingPayment(true)
    try {
      const res = await fetch(`/api/sales/${detail.sale.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPayment, amount: Number(newPayment.amount), reported_by: 'staff' }),
      })
      if ((await res.json()).ok) { toast.success('Pago registrado'); setShowAddPayment(false); fetchDetail(); onRefresh() }
      else toast.error('Error')
    } catch { toast.error('Error') } finally { setAddingPayment(false) }
  }

  const handleEditPayment = async (paymentId: string) => {
    if (!detail?.sale?.id || !editAmount) return
    try {
      const res = await fetch(`/api/sales/${detail.sale.id}/payments/${paymentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(editAmount) }),
      })
      if ((await res.json()).ok) { toast.success('Actualizado'); setEditingId(null); fetchDetail(); onRefresh() }
    } catch { toast.error('Error') }
  }

  if (loading) return <div className="px-6 py-6 bg-slate-50 border-t border-navy-200 flex items-center gap-2 text-sm text-navy-400"><Loader2 className="w-4 h-4 animate-spin" /> Cargando detalle financiero...</div>
  if (!detail) return <div className="px-6 py-4 bg-slate-50 border-t text-xs text-red-500">Error cargando detalle</div>

  const { property: prop, renovation: reno, moves, sale, payments, payment_orders, title_transfer: tt, transactions } = detail

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-navy-200 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-navy-700 font-semibold">
          <Building2 className="w-4 h-4" />
          {p.property_code && <span className="bg-navy-100 text-navy-700 px-1.5 py-0.5 rounded text-xs font-bold">{p.property_code}</span>}
          {prop?.address}, {prop?.city}
        </div>
        <span className="text-[10px] text-navy-400">Creada: {fmtDate(prop?.created_at)}</span>
      </div>

      {/* Top 4 info cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* COMPRA */}
        <div className="bg-white rounded-lg border border-blue-200 p-3">
          <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-2">Compra</h4>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between"><span className="text-navy-500">Precio</span><span className="font-bold text-navy-900">{fmt(p.purchase_price)}</span></div>
            <div className="flex justify-between"><span className="text-navy-500">Vendedor</span><span className="text-navy-700">{prop?.seller_name || '—'}</span></div>
            <div className="flex justify-between"><span className="text-navy-500">Fecha</span><span className="text-navy-700">{fmtDate(prop?.created_at)}</span></div>
          </div>
        </div>

        {/* RENOVACION */}
        <div className="bg-white rounded-lg border border-amber-200 p-3">
          <h4 className="text-[10px] font-bold text-amber-600 uppercase tracking-wide mb-2">Renovacion</h4>
          {reno ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-navy-500">Costo</span><span className="font-bold text-navy-900">{fmt(reno.total_cost)}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">Responsable</span><span className="text-navy-700">{reno.responsable || '—'}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">Estado</span>{badge(reno.approval_status || reno.status)}</div>
              {reno.items_summary && <div className="text-[10px] text-navy-400 mt-1">{reno.items_summary}</div>}
            </div>
          ) : <p className="text-xs text-navy-400">Sin renovacion</p>}
        </div>

        {/* VENTA */}
        <div className="bg-white rounded-lg border border-emerald-200 p-3">
          <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-2">Venta</h4>
          {sale ? (
            <div className="space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-navy-500">Precio</span><span className="font-bold text-navy-900">{fmt(sale.price)}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">Cliente</span><span className="text-navy-700">{sale.client_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">Tipo</span><span className="text-navy-700">{sale.type === 'rto' ? 'RTO' : 'Contado'}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">Estado</span>{badge(sale.status)}</div>
              <div className="flex justify-between"><span className="text-navy-500">Comision</span><span className="text-navy-700">{fmt(sale.commission_total)}</span></div>
              {sale.found_by && <div className="text-[10px] text-navy-400">Encontro: {sale.found_by} ({fmt(sale.commission_found)})</div>}
              {sale.sold_by && <div className="text-[10px] text-navy-400">Vendio: {sale.sold_by} ({fmt(sale.commission_sold)})</div>}
            </div>
          ) : <p className="text-xs text-navy-400">Sin venta</p>}
        </div>

        {/* TITULO + MOVIDAS */}
        <div className="bg-white rounded-lg border border-purple-200 p-3">
          <h4 className="text-[10px] font-bold text-purple-600 uppercase tracking-wide mb-2">Titulo / Movidas</h4>
          {tt ? (
            <div className="space-y-1 text-xs mb-2">
              <div className="flex justify-between"><span className="text-navy-500">Estado</span>{badge(tt.status)}</div>
              <div className="flex justify-between"><span className="text-navy-500">De</span><span className="text-navy-700 text-[10px]">{tt.from_name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-navy-500">A</span><span className="text-navy-700 text-[10px]">{tt.to_name || '—'}</span></div>
            </div>
          ) : <p className="text-xs text-navy-400 mb-2">Sin transferencia titulo</p>}
          {moves && moves.length > 0 ? moves.map((m: any, i: number) => (
            <div key={i} className="text-[10px] text-navy-500 border-t border-purple-100 pt-1 mt-1">
              Movida: {m.origin || '?'} → {m.destination || '?'} · {fmt(m.cost)} · {badge(m.status)}
            </div>
          )) : null}
        </div>
      </div>

      {/* Bottom: Payments + Orders + Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* PAGOS RECIBIDOS */}
        <div className="bg-white rounded-lg border border-emerald-200 p-3">
          <h4 className="text-[10px] font-bold text-emerald-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <CreditCard className="w-3 h-3" /> Pagos Recibidos
            {sale && <span className="ml-auto text-emerald-600 normal-case font-normal">{fmt(sale.amount_paid)} / {fmt(sale.price)}</span>}
          </h4>
          {sale && sale.price > 0 && (
            <div className="w-full h-1.5 bg-emerald-200 rounded-full mb-2">
              <div className="h-full bg-emerald-600 rounded-full" style={{ width: `${Math.min(100, (sale.amount_paid / sale.price) * 100)}%` }} />
            </div>
          )}
          {!sale ? <p className="text-xs text-navy-400">Sin venta</p>
          : !payments || payments.length === 0 ? <p className="text-xs text-navy-400 mb-2">Sin pagos</p>
          : (
            <div className="space-y-1 mb-2">
              {payments.map((pay: any) => (
                <div key={pay.id} className="flex items-center gap-1.5 text-[11px] bg-emerald-50 rounded px-2 py-1">
                  <span className="font-medium text-emerald-700 w-12">{typeLabels[pay.payment_type] || pay.payment_type}</span>
                  {editingId === pay.id ? (
                    <input type="number" className="w-14 px-1 py-0.5 border border-blue-400 rounded text-[11px] bg-blue-50" value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditPayment(pay.id); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={() => handleEditPayment(pay.id)} autoFocus />
                  ) : (
                    <span className="font-bold text-navy-900 cursor-pointer hover:text-blue-600" onClick={() => { setEditingId(pay.id); setEditAmount(String(pay.amount)) }}>
                      {fmt(Number(pay.amount))}
                    </span>
                  )}
                  <span className="text-navy-400">{pay.payment_method || ''}</span>
                  <span className="text-navy-400">{pay.payment_date ? fmtDate(pay.payment_date) : ''}</span>
                  {badge(pay.status)}
                  {pay.reported_by === 'client' && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded">Cliente</span>}
                </div>
              ))}
            </div>
          )}
          {sale && !showAddPayment && (
            <button onClick={() => setShowAddPayment(true)} className="text-[11px] text-emerald-600 font-medium flex items-center gap-1"><Plus className="w-3 h-3" /> Registrar Pago</button>
          )}
          {showAddPayment && (
            <div className="space-y-1 mt-1 p-2 bg-emerald-50 rounded border border-emerald-200">
              <div className="grid grid-cols-2 gap-1">
                <select value={newPayment.payment_type} onChange={e => setNewPayment({ ...newPayment, payment_type: e.target.value })} className="text-[11px] border rounded px-1 py-0.5">
                  <option value="down_payment">Enganche</option><option value="remaining">Saldo</option><option value="full">Total</option><option value="partial">Parcial</option>
                </select>
                <input type="number" placeholder="$" value={newPayment.amount} onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })} className="text-[11px] border rounded px-1 py-0.5" />
              </div>
              <div className="flex gap-1">
                <button onClick={handleAddPayment} disabled={addingPayment || !newPayment.amount} className="flex-1 text-[11px] py-0.5 rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--navy-800)' }}>{addingPayment ? '...' : 'Guardar'}</button>
                <button onClick={() => setShowAddPayment(false)} className="text-[11px] py-0.5 px-2 rounded border text-navy-500">X</button>
              </div>
            </div>
          )}
        </div>

        {/* ORDENES DE PAGO */}
        <div className="bg-white rounded-lg border border-blue-200 p-3">
          <h4 className="text-[10px] font-bold text-blue-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileText className="w-3 h-3" /> Ordenes de Pago
          </h4>
          {!payment_orders || payment_orders.length === 0 ? <p className="text-xs text-navy-400">Sin ordenes</p> : (
            <div className="space-y-1">
              {payment_orders.map((o: any) => (
                <div key={o.id} className="text-[11px] bg-blue-50 rounded px-2 py-1.5 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-navy-900">{fmt(Number(o.amount))}</span>
                    <span className="text-navy-500">{o.payee_name || 'Vendedor'}</span>
                    {badge(o.status)}
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-navy-400">
                    {o.method && <span>{o.method}</span>}
                    {o.reference && <span>Ref: {o.reference}</span>}
                    {o.payment_date && <span>{fmtDate(o.payment_date)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* TRANSACCIONES CONTABLES */}
        <div className="bg-white rounded-lg border border-navy-200 p-3">
          <h4 className="text-[10px] font-bold text-navy-600 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3 h-3" /> Contabilidad
          </h4>
          {!transactions || transactions.length === 0 ? <p className="text-xs text-navy-400">Sin transacciones</p> : (
            <div className="space-y-1">
              {transactions.slice(0, 8).map((t: any) => (
                <div key={t.id} className="flex items-center gap-1.5 text-[11px] bg-navy-50 rounded px-2 py-1">
                  <span className={`font-bold ${t.is_income ? 'text-emerald-700' : 'text-red-600'}`}>{t.is_income ? '+' : '-'}{fmt(Number(t.amount))}</span>
                  <span className="text-navy-400 truncate max-w-[80px]">{t.transaction_type}</span>
                  <span className="text-navy-400">{t.transaction_date ? fmtDate(t.transaction_date) : ''}</span>
                  {badge(t.status)}
                </div>
              ))}
              {transactions.length > 8 && <p className="text-[10px] text-navy-400">+{transactions.length - 8} mas</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
