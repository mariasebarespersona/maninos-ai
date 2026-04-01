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
  const [payments, setPayments] = useState<any[]>([])
  const [orders, setOrders] = useState<any[]>([])
  const [transactions, setTransactions] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(true)
  const [loadingOrders, setLoadingOrders] = useState(true)
  const [loadingTxns, setLoadingTxns] = useState(true)

  // Add payment form
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [newPayment, setNewPayment] = useState({
    payment_type: 'partial', amount: '', payment_method: 'bank_transfer', payment_reference: '', notes: '',
  })

  // Edit payment
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')

  useEffect(() => {
    // Fetch sale payments
    if (p.sale_id) {
      setLoadingPayments(true)
      fetch(`/api/sales/${p.sale_id}/payments`)
        .then(r => r.json())
        .then(d => setPayments(d.payments || []))
        .catch(() => {})
        .finally(() => setLoadingPayments(false))
    } else {
      setLoadingPayments(false)
    }

    // Fetch payment orders for this property
    setLoadingOrders(true)
    fetch(`/api/payment-orders?property_id=${p.id}`)
      .then(r => r.json())
      .then(d => setOrders(d.data || []))
      .catch(() => {})
      .finally(() => setLoadingOrders(false))

    // Fetch accounting transactions
    setLoadingTxns(true)
    fetch(`/api/accounting/reports/property/${p.id}`)
      .then(r => r.json())
      .then(d => setTransactions(d.transactions || []))
      .catch(() => {})
      .finally(() => setLoadingTxns(false))
  }, [p.id, p.sale_id])

  const handleAddPayment = async () => {
    if (!p.sale_id || !newPayment.amount) return
    setAddingPayment(true)
    try {
      const res = await fetch(`/api/sales/${p.sale_id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPayment, amount: Number(newPayment.amount), reported_by: 'staff' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Pago registrado')
        setShowAddPayment(false)
        setNewPayment({ payment_type: 'partial', amount: '', payment_method: 'bank_transfer', payment_reference: '', notes: '' })
        // Refresh payments
        const r = await fetch(`/api/sales/${p.sale_id}/payments`)
        const d = await r.json()
        setPayments(d.payments || [])
        onRefresh()
      } else toast.error(data.detail || 'Error')
    } catch { toast.error('Error de conexion') }
    finally { setAddingPayment(false) }
  }

  const handleEditPayment = async (paymentId: string) => {
    if (!p.sale_id || !editAmount) return
    try {
      const res = await fetch(`/api/sales/${p.sale_id}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(editAmount) }),
      })
      if ((await res.json()).ok) {
        toast.success('Monto actualizado')
        setEditingId(null)
        const r = await fetch(`/api/sales/${p.sale_id}/payments`)
        setPayments((await r.json()).payments || [])
        onRefresh()
      }
    } catch { toast.error('Error') }
  }

  const typeLabels: Record<string, string> = {
    down_payment: 'Enganche', remaining: 'Saldo', full: 'Pago total',
    partial: 'Parcial', adjustment: 'Ajuste',
  }
  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
      confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
      approved: { label: 'Aprobado', cls: 'bg-blue-100 text-blue-700' },
      completed: { label: 'Completado', cls: 'bg-emerald-100 text-emerald-700' },
      cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
    }
    const b = map[s] || { label: s, cls: 'bg-gray-100 text-gray-600' }
    return <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${b.cls}`}>{b.label}</span>
  }

  return (
    <div className="px-6 py-4 bg-slate-50 border-t border-navy-200 space-y-4">
      <div className="flex items-center gap-2 text-sm text-navy-600 font-medium">
        <Building2 className="w-4 h-4" />
        {p.property_code && <span className="bg-navy-100 text-navy-600 px-1.5 py-0.5 rounded text-xs font-bold">{p.property_code}</span>}
        {p.address}, {p.city}
        {p.sale_type && <span className="text-[10px] bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full ml-2">{p.sale_type === 'rto' ? 'RTO' : 'Contado'}</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Sale Payments */}
        <div className="bg-white rounded-lg border border-emerald-200 p-3">
          <h4 className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1.5">
            <CreditCard className="w-3.5 h-3.5" /> Pagos Recibidos
            {p.sale_id && p.amount_paid > 0 && (
              <span className="ml-auto text-emerald-600">{fmt(p.amount_paid)} / {fmt(p.sale_price)}</span>
            )}
          </h4>

          {!p.sale_id ? (
            <p className="text-xs text-navy-400">Sin venta asociada</p>
          ) : loadingPayments ? (
            <div className="flex items-center gap-1 text-xs text-navy-400"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
          ) : payments.length === 0 ? (
            <p className="text-xs text-navy-400 mb-2">Sin pagos registrados</p>
          ) : (
            <div className="space-y-1.5 mb-2">
              {payments.map((pay: any) => (
                <div key={pay.id} className="flex items-center gap-2 text-xs bg-emerald-50 rounded px-2 py-1.5">
                  <span className="font-medium text-emerald-700 w-14">{typeLabels[pay.payment_type] || pay.payment_type}</span>
                  {editingId === pay.id ? (
                    <input
                      type="number"
                      className="w-16 px-1 py-0.5 border border-blue-400 rounded text-xs bg-blue-50"
                      value={editAmount}
                      onChange={e => setEditAmount(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleEditPayment(pay.id); if (e.key === 'Escape') setEditingId(null) }}
                      onBlur={() => handleEditPayment(pay.id)}
                      autoFocus
                    />
                  ) : (
                    <span
                      className="font-bold text-navy-900 cursor-pointer hover:text-blue-600"
                      onClick={() => { setEditingId(pay.id); setEditAmount(String(pay.amount)) }}
                    >
                      {fmt(Number(pay.amount))}
                    </span>
                  )}
                  <span className="text-navy-400">{pay.payment_method || ''}</span>
                  {statusBadge(pay.status)}
                  {pay.reported_by === 'client' && <span className="text-[9px] bg-blue-100 text-blue-600 px-1 rounded">Cliente</span>}
                </div>
              ))}
            </div>
          )}

          {p.sale_id && !showAddPayment && (
            <button onClick={() => setShowAddPayment(true)} className="text-xs text-emerald-600 font-medium flex items-center gap-1 hover:text-emerald-800">
              <Plus className="w-3 h-3" /> Registrar Pago
            </button>
          )}
          {showAddPayment && (
            <div className="space-y-1.5 mt-2 p-2 bg-emerald-50 rounded border border-emerald-200">
              <div className="grid grid-cols-2 gap-1.5">
                <select value={newPayment.payment_type} onChange={e => setNewPayment({ ...newPayment, payment_type: e.target.value })} className="text-xs border rounded px-1.5 py-1">
                  <option value="down_payment">Enganche</option>
                  <option value="remaining">Saldo</option>
                  <option value="full">Total</option>
                  <option value="partial">Parcial</option>
                </select>
                <input type="number" placeholder="$" value={newPayment.amount} onChange={e => setNewPayment({ ...newPayment, amount: e.target.value })} className="text-xs border rounded px-1.5 py-1" />
              </div>
              <select value={newPayment.payment_method} onChange={e => setNewPayment({ ...newPayment, payment_method: e.target.value })} className="w-full text-xs border rounded px-1.5 py-1">
                <option value="bank_transfer">Transferencia</option>
                <option value="zelle">Zelle</option>
                <option value="cash">Efectivo</option>
                <option value="check">Cheque</option>
              </select>
              <div className="flex gap-1.5">
                <button onClick={handleAddPayment} disabled={addingPayment || !newPayment.amount} className="flex-1 text-xs py-1 rounded text-white font-medium disabled:opacity-50" style={{ backgroundColor: 'var(--navy-800)' }}>
                  {addingPayment ? 'Guardando...' : 'Guardar'}
                </button>
                <button onClick={() => setShowAddPayment(false)} className="text-xs py-1 px-2 rounded border text-navy-600">Cancelar</button>
              </div>
            </div>
          )}
        </div>

        {/* Payment Orders */}
        <div className="bg-white rounded-lg border border-blue-200 p-3">
          <h4 className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5" /> Ordenes de Pago
            {p.payment_orders_count > 0 && <span className="ml-auto text-blue-600">{p.payment_orders_count} — {fmt(p.payment_orders_total)}</span>}
          </h4>
          {loadingOrders ? (
            <div className="flex items-center gap-1 text-xs text-navy-400"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
          ) : orders.length === 0 ? (
            <p className="text-xs text-navy-400">Sin ordenes de pago</p>
          ) : (
            <div className="space-y-1.5">
              {orders.map((o: any) => (
                <div key={o.id} className="flex items-center gap-2 text-xs bg-blue-50 rounded px-2 py-1.5">
                  <span className="font-medium text-navy-900">{fmt(Number(o.amount))}</span>
                  <span className="text-navy-400 truncate max-w-[80px]">{o.payee_name || 'Vendedor'}</span>
                  {statusBadge(o.status)}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Accounting Transactions */}
        <div className="bg-white rounded-lg border border-navy-200 p-3">
          <h4 className="text-xs font-semibold text-navy-700 mb-2 flex items-center gap-1.5">
            <DollarSign className="w-3.5 h-3.5" /> Transacciones Contables
            {p.accounting_txn_count > 0 && <span className="ml-auto text-navy-500">{p.accounting_txn_count}</span>}
          </h4>
          {loadingTxns ? (
            <div className="flex items-center gap-1 text-xs text-navy-400"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
          ) : transactions.length === 0 ? (
            <p className="text-xs text-navy-400">Sin transacciones</p>
          ) : (
            <div className="space-y-1.5">
              {transactions.slice(0, 8).map((t: any) => (
                <div key={t.id} className="flex items-center gap-2 text-xs bg-navy-50 rounded px-2 py-1.5">
                  <span className={`font-bold ${t.is_income ? 'text-emerald-700' : 'text-red-600'}`}>
                    {t.is_income ? '+' : '-'}{fmt(Number(t.amount))}
                  </span>
                  <span className="text-navy-400 truncate max-w-[100px]">{t.transaction_type}</span>
                  {statusBadge(t.status)}
                </div>
              ))}
              {transactions.length > 8 && (
                <p className="text-[10px] text-navy-400">+{transactions.length - 8} mas...</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
