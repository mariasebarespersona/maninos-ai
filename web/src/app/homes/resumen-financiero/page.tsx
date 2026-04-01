'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import {
  BarChart3, Building2, Search, ChevronDown, ChevronRight, Plus, Loader2,
  CreditCard, CheckCircle, Clock, AlertCircle,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/Auth/AuthProvider'

interface PropertyFinancial {
  id: string; address: string; property_code: string; city: string; status: string
  purchase_price: number; renovation_cost: number; move_cost: number
  commission: number; margin: number; total_investment: number
  sale_price: number; profit: number; amount_paid: number; amount_pending: number
  sale_id: string | null; sale_status: string | null; sale_type: string | null; client_name: string
  payment_orders_count: number; payment_orders_total: number; accounting_txn_count: number
}

const statusLabels: Record<string, { label: string; cls: string }> = {
  pending_payment: { label: 'Pago Pendiente', cls: 'bg-orange-100 text-orange-700' },
  purchased: { label: 'Comprada', cls: 'bg-blue-100 text-blue-700' },
  published: { label: 'Publicada', cls: 'bg-emerald-100 text-emerald-700' },
  renovating: { label: 'Renovando', cls: 'bg-amber-100 text-amber-700' },
  reserved: { label: 'Reservada', cls: 'bg-purple-100 text-purple-700' },
  sold: { label: 'Vendida', cls: 'bg-navy-100 text-navy-700' },
}

const fmt = (n: number) => n > 0 ? `$${n.toLocaleString('en-US')}` : '—'
const fmtDate = (d: string | null) => d ? new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: '2-digit' }) : ''

export default function ResumenFinancieroPage() {
  const toast = useToast()
  const { teamUser } = useAuth()
  const isAdmin = teamUser?.role === 'admin'

  const [properties, setProperties] = useState<PropertyFinancial[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/properties/financial-summary')
      const data = await res.json()
      if (data.ok) setProperties(data.properties || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  if (!isAdmin) return (
    <div className="py-20 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <h2 className="font-serif text-xl text-navy-900 mb-2">Acceso Restringido</h2>
      <p className="text-navy-500">Solo administradores pueden acceder.</p>
    </div>
  )

  const cities = Array.from(new Set(properties.map(p => p.city).filter(Boolean))).sort()
  const filtered = properties.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!p.address.toLowerCase().includes(q) && !(p.property_code || '').toLowerCase().includes(q) && !p.client_name.toLowerCase().includes(q)) return false
    }
    return true
  })

  const totals = filtered.reduce((a, p) => ({
    purchase: a.purchase + p.purchase_price, reno: a.reno + p.renovation_cost,
    move: a.move + p.move_cost, sale: a.sale + (p.sale_id ? p.sale_price : 0),
    paid: a.paid + p.amount_paid, profit: a.profit + (p.sale_price > 0 ? p.profit : 0),
    investment: a.investment + p.total_investment,
  }), { purchase: 0, reno: 0, move: 0, sale: 0, paid: 0, profit: 0, investment: 0 })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
          <BarChart3 className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Resumen Financiero</h1>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>Ficha financiera de cada propiedad</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Invertido', value: totals.investment, color: 'text-navy-900' },
          { label: 'Vendido', value: totals.sale, color: 'text-navy-900' },
          { label: 'Cobrado', value: totals.paid, color: 'text-emerald-700' },
          { label: 'Ganancia', value: totals.profit, color: totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600' },
        ].map(kpi => (
          <div key={kpi.label} className="card-luxury p-3">
            <p className="text-[10px] text-navy-500 uppercase tracking-wider">{kpi.label}</p>
            <p className={`text-lg font-serif font-bold ${kpi.color}`}>{fmt(kpi.value)}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
          <input type="text" placeholder="Buscar..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-navy-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-gold-400" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-navy-200 rounded-lg px-2 py-1.5">
          <option value="">Todos</option>
          {Object.entries(statusLabels).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span className="text-[10px] text-navy-400">{filtered.length} propiedades</span>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12 gap-2 text-navy-500"><Loader2 className="w-5 h-5 animate-spin" /> Cargando...</div>
      ) : (
        <div className="card-luxury overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-navy-200 text-left text-[11px] text-navy-500 uppercase tracking-wider">
                <th className="px-2 py-2 w-6"></th>
                <th className="px-2 py-2">Propiedad</th>
                <th className="px-2 py-2">Estado</th>
                <th className="px-2 py-2 text-right">Inversión</th>
                <th className="px-2 py-2">Venta</th>
                <th className="px-2 py-2 text-right">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => {
                const st = statusLabels[p.status] || { label: p.status, cls: 'bg-gray-100 text-gray-600' }
                const isExp = expandedId === p.id
                const hasSale = !!p.sale_id
                return (
                  <PropertyRowGroup key={p.id} p={p} st={st} isExp={isExp}
                    onToggle={() => setExpandedId(isExp ? null : p.id)} onRefresh={fetchData} toast={toast} />
                )
              })}
              <tr className="border-t-2 border-navy-300 font-bold bg-navy-50 text-xs">
                <td className="px-2 py-2" colSpan={2}>TOTALES ({filtered.length})</td>
                <td className="px-2 py-2"></td>
                <td className="px-2 py-2 text-right">{fmt(totals.investment)}</td>
                <td className="px-2 py-2">{totals.sale > 0 ? `${fmt(totals.sale)} · Cobrado ${fmt(totals.paid)}` : '—'}</td>
                <td className={`px-2 py-2 text-right ${totals.profit >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>{fmt(totals.profit)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Property Row + Expanded Timeline Detail
// ═══════════════════════════════════════════════════════════════

function PropertyRowGroup({ p, st, isExp, onToggle, onRefresh, toast }: {
  p: PropertyFinancial; st: { label: string; cls: string }; isExp: boolean
  onToggle: () => void; onRefresh: () => void; toast: any
}) {
  const hasSale = !!p.sale_id
  return (
    <>
      <tr className={`border-b border-navy-100 hover:bg-navy-50 cursor-pointer transition-colors ${isExp ? 'bg-navy-50' : ''}`} onClick={onToggle}>
        <td className="px-2 py-2.5">{isExp ? <ChevronDown className="w-4 h-4 text-navy-400" /> : <ChevronRight className="w-4 h-4 text-navy-400" />}</td>
        <td className="px-2 py-2.5">
          <div className="flex items-center gap-1.5">
            {p.property_code && <span className="text-[9px] bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-bold">{p.property_code}</span>}
            <span className="font-medium text-navy-900 truncate max-w-[200px]">{p.address}</span>
          </div>
          {p.city && <p className="text-[10px] text-navy-400">{p.city}</p>}
        </td>
        <td className="px-2 py-2.5"><span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.cls}`}>{st.label}</span></td>
        <td className="px-2 py-2.5 text-right">
          <div className="text-navy-900 font-medium">{fmt(p.total_investment)}</div>
          <div className="text-[10px] text-navy-400">
            {p.purchase_price > 0 ? `C:${fmt(p.purchase_price)}` : ''}
            {p.renovation_cost > 0 ? ` R:${fmt(p.renovation_cost)}` : ''}
            {p.move_cost > 0 ? ` M:${fmt(p.move_cost)}` : ''}
          </div>
        </td>
        <td className="px-2 py-2.5">
          {hasSale ? (
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-medium text-navy-900">{fmt(p.sale_price)}</span>
                <span className="text-[9px] px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-600">{p.sale_type === 'rto' ? 'RTO' : 'Contado'}</span>
              </div>
              <div className="text-[10px] text-navy-400">
                {p.client_name && <span>{p.client_name} · </span>}
                {p.amount_paid > 0 ? (
                  <span className="text-emerald-600">Pagado {fmt(p.amount_paid)}{p.amount_pending > 0 ? ` · Falta ${fmt(p.amount_pending)}` : ' · Completo'}</span>
                ) : (
                  <span className="text-amber-600">Sin pagos</span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-[10px] text-navy-300">Sin venta</span>
          )}
        </td>
        <td className={`px-2 py-2.5 text-right font-bold ${p.profit > 0 ? 'text-emerald-700' : p.profit < 0 ? 'text-red-600' : 'text-navy-300'}`}>
          {p.sale_price > 0 ? fmt(p.profit) : '—'}
        </td>
      </tr>
      {isExp && (
        <tr><td colSpan={6} className="p-0"><TimelineDetail propertyId={p.id} p={p} onRefresh={onRefresh} toast={toast} /></td></tr>
      )}
    </>
  )
}

// ═══════════════════════════════════════════════════════════════
// Timeline Detail (fetches full data)
// ═══════════════════════════════════════════════════════════════

function TimelineDetail({ propertyId, p, onRefresh, toast }: { propertyId: string; p: PropertyFinancial; onRefresh: () => void; toast: any }) {
  const [detail, setDetail] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [newPay, setNewPay] = useState({ payment_type: 'partial', amount: '', payment_method: 'zelle' })
  const [editId, setEditId] = useState<string | null>(null)
  const [editAmt, setEditAmt] = useState('')

  const load = () => {
    setLoading(true)
    fetch(`/api/properties/${propertyId}/financial-detail`)
      .then(r => r.json()).then(d => { if (d.ok) setDetail(d) })
      .catch(() => {}).finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [propertyId])

  const handleAddPay = async () => {
    if (!detail?.sale?.id || !newPay.amount) return
    setAddingPayment(true)
    try {
      const r = await fetch(`/api/sales/${detail.sale.id}/payments`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newPay, amount: Number(newPay.amount), reported_by: 'staff' }),
      })
      if ((await r.json()).ok) { toast.success('Pago registrado'); setShowAddPayment(false); load(); onRefresh() }
    } catch {} finally { setAddingPayment(false) }
  }

  const handleEditPay = async (payId: string) => {
    if (!detail?.sale?.id || !editAmt) return
    try {
      const r = await fetch(`/api/sales/${detail.sale.id}/payments/${payId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(editAmt) }),
      })
      if ((await r.json()).ok) { toast.success('Actualizado'); setEditId(null); load(); onRefresh() }
    } catch {}
  }

  if (loading) return <div className="px-8 py-6 bg-slate-50 border-t flex items-center gap-2 text-xs text-navy-400"><Loader2 className="w-3 h-3 animate-spin" /> Cargando...</div>
  if (!detail) return <div className="px-8 py-4 bg-red-50 text-xs text-red-500">Error cargando detalle</div>

  const { property: prop, renovation: reno, moves, sale, payments, payment_orders, title_transfer: tt, transactions } = detail
  const badge = (s: string) => {
    const m: Record<string, string> = { pending: 'bg-amber-100 text-amber-700', confirmed: 'bg-emerald-100 text-emerald-700', completed: 'bg-emerald-100 text-emerald-700', approved: 'bg-blue-100 text-blue-700', cancelled: 'bg-red-100 text-red-700', in_progress: 'bg-blue-100 text-blue-700', pending_approval: 'bg-amber-100 text-amber-700', draft: 'bg-gray-100 text-gray-500' }
    return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${m[s] || 'bg-gray-100 text-gray-500'}`}>{s}</span>
  }
  const tl = (label: string, cls: string) => (
    <div className={`flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider ${cls}`}>{label}</div>
  )

  return (
    <div className="px-8 py-5 bg-slate-50 border-t border-navy-200 space-y-3">
      {/* Property header */}
      <div className="flex items-center gap-2 text-sm font-semibold text-navy-700">
        <Building2 className="w-4 h-4" />
        {p.property_code && <span className="bg-navy-100 text-navy-700 px-1.5 py-0.5 rounded text-[10px] font-bold">{p.property_code}</span>}
        {prop?.address}, {prop?.city} — {fmtDate(prop?.created_at)}
      </div>

      {/* TIMELINE */}
      <div className="space-y-2 pl-2 border-l-2 border-navy-200 ml-2">

        {/* 1. COMPRA */}
        <div className="pl-4 relative">
          <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-blue-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">1</span></div>
          {tl('Compra', 'text-blue-600')}
          <div className="text-xs text-navy-700 space-y-0.5 mt-0.5">
            <p><strong>{fmt(p.purchase_price)}</strong> {prop?.seller_name ? `— Vendedor: ${prop.seller_name}` : ''} {prop?.seller_contact ? `(${prop.seller_contact})` : ''}</p>
            {payment_orders && payment_orders.length > 0 && (
              <div className="text-[10px] text-navy-500">
                {payment_orders.filter((o: any) => o.concept === 'compra' || (!o.concept && o.notes?.toLowerCase().includes('compra'))).map((o: any) => (
                  <p key={o.id}>Orden: {fmt(Number(o.amount))} → {o.payee_name} {badge(o.status)} {o.reference ? `Ref: ${o.reference}` : ''}</p>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 2. RENOVACIÓN */}
        {reno && (
          <div className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-amber-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">2</span></div>
            {tl('Renovación', 'text-amber-600')}
            <div className="text-xs text-navy-700 space-y-0.5 mt-0.5">
              <p><strong>{fmt(reno.total_cost)}</strong> — {reno.items_summary || 'Sin detalle'} — Responsable: {reno.responsable || 'N/A'} {badge(reno.approval_status || reno.status)}</p>
              {reno.fecha_inicio && <p className="text-[10px] text-navy-400">Inicio: {reno.fecha_inicio} {reno.fecha_fin ? `→ Fin: ${reno.fecha_fin}` : ''}</p>}
              {payment_orders && payment_orders.filter((o: any) => o.concept === 'comision').length > 0 && (
                <div className="text-[10px] text-navy-500 mt-1">
                  <p className="font-medium">Comisiones:</p>
                  {payment_orders.filter((o: any) => o.concept === 'comision').map((o: any) => (
                    <p key={o.id}>{fmt(Number(o.amount))} → {o.payee_name} {badge(o.status)} {o.notes ? `(${o.notes.substring(0, 60)})` : ''}</p>
                  ))}
                </div>
              )}
              {payment_orders && payment_orders.filter((o: any) => o.concept === 'renovacion').length > 0 && (
                <div className="text-[10px] text-navy-500 mt-1">
                  <p className="font-medium">Órdenes de pago renovación:</p>
                  {payment_orders.filter((o: any) => o.concept === 'renovacion').map((o: any) => (
                    <p key={o.id}>{fmt(Number(o.amount))} → {o.payee_name} {badge(o.status)} {o.notes ? `(${o.notes.substring(0, 50)})` : ''}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. MOVIDAS */}
        {moves && moves.length > 0 && moves.map((m: any, i: number) => (
          <div key={i} className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-purple-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">{reno ? 3 : 2}</span></div>
            {i === 0 && tl('Movida', 'text-purple-600')}
            <p className="text-xs text-navy-700"><strong>{fmt(m.cost)}</strong> — {m.origin || '?'} → {m.destination || '?'} {m.company ? `· ${m.company}` : ''} {badge(m.status)}</p>
          </div>
        ))}

        {/* 4. PUBLICADA */}
        {p.sale_price > 0 && (
          <div className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">{(reno ? 3 : 2) + (moves?.length ? 1 : 0) + 1}</span></div>
            {tl('Publicada', 'text-emerald-600')}
            <p className="text-xs text-navy-700">Precio de venta: <strong>{fmt(p.sale_price)}</strong></p>
          </div>
        )}

        {/* 5. VENTA */}
        {sale && (
          <div className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-gold-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">V</span></div>
            {tl(`Venta ${sale.type === 'rto' ? 'RTO' : 'Contado'}`, 'text-gold-700')}
            <div className="text-xs text-navy-700 space-y-1 mt-0.5">
              <p><strong>{fmt(sale.price)}</strong> — Cliente: <strong>{sale.client_name || 'N/A'}</strong> — {fmtDate(sale.created_at)} {badge(sale.status)}</p>

              {/* Pagos */}
              {payments && payments.length > 0 ? (
                <div className="bg-white rounded-lg border border-emerald-200 p-2 mt-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-emerald-600">PAGOS: {fmt(sale.amount_paid)} de {fmt(sale.price)}</span>
                    {sale.price > 0 && <span className="text-[9px] text-emerald-600 font-bold">{Math.round((sale.amount_paid / sale.price) * 100)}%</span>}
                  </div>
                  <div className="w-full h-1.5 bg-emerald-100 rounded-full mb-1.5">
                    <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, sale.price > 0 ? (sale.amount_paid / sale.price) * 100 : 0)}%` }} />
                  </div>
                  {sale.amount_pending > 0 && <p className="text-[10px] text-amber-600 mb-1">Falta: <strong>{fmt(sale.amount_pending)}</strong></p>}
                  {payments.map((pay: any) => {
                    const typeL: Record<string, string> = { down_payment: 'Enganche', remaining: 'Saldo', full: 'Total', partial: 'Parcial', adjustment: 'Ajuste' }
                    return (
                      <div key={pay.id} className="flex items-center gap-2 text-[10px] py-0.5">
                        <span className="text-emerald-600 font-medium w-12">{typeL[pay.payment_type] || pay.payment_type}</span>
                        {editId === pay.id ? (
                          <input type="number" className="w-16 px-1 py-0.5 border border-blue-400 rounded text-[10px] bg-blue-50" value={editAmt}
                            onChange={e => setEditAmt(e.target.value)} autoFocus
                            onKeyDown={e => { if (e.key === 'Enter') handleEditPay(pay.id); if (e.key === 'Escape') setEditId(null) }}
                            onBlur={() => handleEditPay(pay.id)} />
                        ) : (
                          <span className="font-bold text-navy-900 cursor-pointer hover:text-blue-600" onClick={() => { setEditId(pay.id); setEditAmt(String(pay.amount)) }}>{fmt(Number(pay.amount))}</span>
                        )}
                        <span className="text-navy-400">{pay.payment_method}</span>
                        <span className="text-navy-400">{fmtDate(pay.payment_date)}</span>
                        {badge(pay.status)}
                        {pay.reported_by === 'client' && <span className="text-[8px] bg-blue-100 text-blue-600 px-1 rounded">Cliente</span>}
                      </div>
                    )
                  })}
                  {!showAddPayment ? (
                    <button onClick={() => setShowAddPayment(true)} className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1"><Plus className="w-3 h-3" /> Registrar Pago</button>
                  ) : (
                    <div className="flex gap-1 mt-1">
                      <select value={newPay.payment_type} onChange={e => setNewPay({ ...newPay, payment_type: e.target.value })} className="text-[10px] border rounded px-1 py-0.5">
                        <option value="down_payment">Enganche</option><option value="remaining">Saldo</option><option value="full">Total</option><option value="partial">Parcial</option>
                      </select>
                      <input type="number" placeholder="$" value={newPay.amount} onChange={e => setNewPay({ ...newPay, amount: e.target.value })} className="w-16 text-[10px] border rounded px-1 py-0.5" />
                      <button onClick={handleAddPay} disabled={addingPayment || !newPay.amount} className="text-[10px] px-2 py-0.5 rounded text-white bg-emerald-600 disabled:opacity-50">{addingPayment ? '...' : 'OK'}</button>
                      <button onClick={() => setShowAddPayment(false)} className="text-[10px] px-1 text-navy-400">X</button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-[10px] text-amber-600">Sin pagos registrados
                  {!showAddPayment ? (
                    <button onClick={() => setShowAddPayment(true)} className="ml-2 text-emerald-600"><Plus className="w-3 h-3 inline" /> Registrar</button>
                  ) : (
                    <div className="flex gap-1 mt-1">
                      <input type="number" placeholder="$" value={newPay.amount} onChange={e => setNewPay({ ...newPay, amount: e.target.value })} className="w-16 text-[10px] border rounded px-1 py-0.5" />
                      <button onClick={handleAddPay} disabled={addingPayment} className="text-[10px] px-2 py-0.5 rounded text-white bg-emerald-600">OK</button>
                      <button onClick={() => setShowAddPayment(false)} className="text-[10px] text-navy-400">X</button>
                    </div>
                  )}
                </div>
              )}

              {/* Comisiones */}
              {sale.commission_total > 0 && (
                <p className="text-[10px] text-navy-500">Comisión: {fmt(sale.commission_total)} {sale.found_by ? `(${sale.found_by} ${fmt(sale.commission_found)})` : ''} {sale.sold_by ? `(${sale.sold_by} ${fmt(sale.commission_sold)})` : ''}</p>
              )}
            </div>
          </div>
        )}

        {/* 6. TÍTULO */}
        {tt && (
          <div className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-navy-500 flex items-center justify-center"><span className="text-white text-[8px] font-bold">T</span></div>
            {tl('Título', 'text-navy-600')}
            <p className="text-xs text-navy-700">{tt.from_name} → {tt.to_name} {badge(tt.status)}</p>
          </div>
        )}

        {/* Contabilidad (compact) */}
        {transactions && transactions.length > 0 && (
          <div className="pl-4 relative">
            <div className="absolute -left-[9px] top-1 w-4 h-4 rounded-full bg-gray-400 flex items-center justify-center"><span className="text-white text-[8px] font-bold">$</span></div>
            {tl(`Contabilidad (${transactions.length})`, 'text-gray-500')}
            {transactions.slice(0, 4).map((t: any) => (
              <p key={t.id} className="text-[10px] text-navy-500">{t.is_income ? '+' : '-'}{fmt(Number(t.amount))} {t.transaction_type} {badge(t.status)} {fmtDate(t.transaction_date)}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
