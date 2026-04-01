'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Clock, Loader2, Building2, ShieldCheck, Hammer, DollarSign, CreditCard, CheckCircle, X } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/Auth/AuthProvider'

export default function NotificacionesPage() {
  const toast = useToast()
  const { teamUser } = useAuth()
  const isAdmin = teamUser?.role === 'admin'
  const isTreasury = teamUser?.role === 'treasury' || isAdmin

  // Data sources
  const [pendingOrders, setPendingOrders] = useState<any[]>([])
  const [approvedOrders, setApprovedOrders] = useState<any[]>([])
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
  const [pendingRenos, setPendingRenos] = useState<any[]>([])
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Complete modal
  const [completing, setCompleting] = useState<any>(null)
  const [completeForm, setCompleteForm] = useState({ reference: '', payment_date: '', bank_account_id: '' })
  const [bankAccounts, setBankAccounts] = useState<any[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Confirm transfer
  const [confirmingTransferId, setConfirmingTransferId] = useState<string | null>(null)
  const [confirmingSubmitting, setConfirmingSubmitting] = useState(false)

  // Active tab for history
  const [historyTab, setHistoryTab] = useState<'activity' | 'completed'>('activity')

  // ─── Fetchers ────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [ordPend, ordAppr, xfers, renos, notifs] = await Promise.allSettled([
        fetch('/api/payment-orders?status=pending').then(r => r.json()),
        fetch('/api/payment-orders?status=approved').then(r => r.json()),
        fetch('/api/sales/pending-transfers').then(r => r.json()),
        fetch('/api/renovation/pending-approvals').then(r => r.json()),
        fetch('/api/notifications?category=homes&limit=30').then(r => r.json()),
      ])
      if (ordPend.status === 'fulfilled') setPendingOrders(ordPend.value.data || [])
      if (ordAppr.status === 'fulfilled') setApprovedOrders(ordAppr.value.data || [])
      if (xfers.status === 'fulfilled') setPendingTransfers(xfers.value.transfers || [])
      if (renos.status === 'fulfilled') setPendingRenos(renos.value.pending || [])
      if (notifs.status === 'fulfilled') setNotifications(notifs.value.notifications || [])
    } catch {} finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  // ─── Actions ─────────────────────────────────────────────────────
  const handleApproveOrder = async (id: string) => {
    setApprovingId(id)
    try {
      const res = await fetch(`/api/payment-orders/${id}/approve?approved_by=${teamUser?.id || ''}`, { method: 'PATCH' })
      if ((await res.json()).ok) { toast.success('Orden aprobada'); fetchAll() }
      else toast.error('Error al aprobar')
    } catch { toast.error('Error') } finally { setApprovingId(null) }
  }

  const handleApproveTransfer = async (saleId: string) => {
    setApprovingId(saleId)
    try {
      const res = await fetch(`/api/sales/${saleId}/approve-transfer?approved_by=${teamUser?.id || ''}`, { method: 'POST' })
      if ((await res.json()).ok) { toast.success('Transferencia aprobada'); fetchAll() }
      else toast.error('Error')
    } catch { toast.error('Error') } finally { setApprovingId(null) }
  }

  const handleApproveReno = async (propertyId: string) => {
    setApprovingId(propertyId)
    try {
      const res = await fetch(`/api/renovation/${propertyId}/approve`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: teamUser?.name || 'admin' }),
      })
      if ((await res.json()).success) { toast.success('Renovación aprobada'); fetchAll() }
      else toast.error('Error')
    } catch { toast.error('Error') } finally { setApprovingId(null) }
  }

  const handleCompleteOrder = async () => {
    if (!completing || !completeForm.reference) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/payment-orders/${completing.id}/complete`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeForm),
      })
      if ((await res.json()).ok) { toast.success('Pago completado'); setCompleting(null); fetchAll() }
      else toast.error('Error')
    } catch { toast.error('Error') } finally { setSubmitting(false) }
  }

  const handleConfirmTransfer = async (saleId: string) => {
    setConfirmingSubmitting(true)
    try {
      const res = await fetch(`/api/sales/${saleId}/confirm-transfer`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      if ((await res.json()).ok) { toast.success('Pago confirmado'); setConfirmingTransferId(null); fetchAll() }
      else toast.error('Error')
    } catch { toast.error('Error') } finally { setConfirmingSubmitting(false) }
  }

  // ─── Computed ────────────────────────────────────────────────────
  const unapprovedTransfers = isAdmin ? pendingTransfers.filter(t => !t.transfer_approved_at) : []
  const approvedTransfers = isTreasury ? pendingTransfers.filter(t => t.transfer_approved_at) : []
  const actionNotifs = notifications.filter(n => n.action_required && !n.action_completed)
  const infoNotifs = notifications.filter(n => !n.action_required || n.action_completed)

  const totalPending = (isAdmin ? pendingOrders.length : 0) + unapprovedTransfers.length +
    (isAdmin ? pendingRenos.length : 0) + (isTreasury ? approvedOrders.length + approvedTransfers.length : 0) +
    actionNotifs.length

  const fmt = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 0 })}`
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })

  if (loading) return <div className="flex items-center justify-center py-20 gap-2 text-navy-500"><Loader2 className="w-5 h-5 animate-spin" /> Cargando...</div>

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-semibold" style={{ color: 'var(--ink)' }}>Notificaciones</h1>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>
            {totalPending > 0 ? `${totalPending} pendientes de acción` : 'Todo al día'}
          </p>
        </div>
      </div>

      {/* ═══════════════ PENDIENTES DE ACCIÓN ═══════════════ */}
      {totalPending > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>Pendientes de Acción</h2>
            <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-bold">{totalPending}</span>
          </div>

          {/* ADMIN: Pending payment orders */}
          {isAdmin && pendingOrders.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Órdenes de Pago ({pendingOrders.length})</p>
              {pendingOrders.map(o => (
                <ActionCard key={o.id} icon="📋" color="border-l-red-500"
                  title={`${fmt(Number(o.amount))} → ${o.payee_name}`}
                  subtitle={`${o.property_address || 'Propiedad'} ${o.concept ? `· ${o.concept}` : ''}`}
                  detail={o.notes?.substring(0, 80) || ''}
                  date={o.created_at}
                  action={<button onClick={() => handleApproveOrder(o.id)} disabled={approvingId === o.id}
                    className="text-xs px-3 py-1 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--navy-800)' }}>
                    {approvingId === o.id ? '...' : 'Aprobar'}
                  </button>}
                />
              ))}
            </div>
          )}

          {/* TREASURY: Approved orders ready to execute */}
          {isTreasury && approvedOrders.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Por Ejecutar — Aprobados ({approvedOrders.length})</p>
              {approvedOrders.map(o => (
                <ActionCard key={o.id} icon="✅" color="border-l-blue-500"
                  title={`${fmt(Number(o.amount))} → ${o.payee_name}`}
                  subtitle={o.property_address || 'Propiedad'}
                  detail={o.notes?.substring(0, 60) || ''}
                  date={o.approved_at || o.created_at}
                  action={<button onClick={() => {
                    setCompleting(o)
                    setCompleteForm({ reference: '', payment_date: new Date().toISOString().split('T')[0], bank_account_id: '' })
                    if (bankAccounts.length === 0) fetch('/api/accounting/bank-accounts').then(r => r.json()).then(d => setBankAccounts(d.bank_accounts || []))
                  }} className="text-xs px-3 py-1 rounded-lg font-medium text-white bg-blue-600">
                    Ejecutar Pago
                  </button>}
                />
              ))}
            </div>
          )}

          {/* Unapproved transfers */}
          {unapprovedTransfers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Transferencias por Aprobar ({unapprovedTransfers.length})</p>
              {unapprovedTransfers.map(t => (
                <ActionCard key={t.sale_id} icon="💰" color="border-l-orange-500"
                  title={`${fmt(Number(t.sale_price))} — ${t.client_name || 'Cliente'}`}
                  subtitle={t.property_address || 'Propiedad'}
                  detail={`${t.client_email || ''} · ${t.client_phone || ''}`}
                  date={t.reported_at}
                  action={<button onClick={() => handleApproveTransfer(t.sale_id)} disabled={approvingId === t.sale_id}
                    className="text-xs px-3 py-1 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--navy-800)' }}>
                    {approvingId === t.sale_id ? '...' : 'Aprobar'}
                  </button>}
                />
              ))}
            </div>
          )}

          {/* Approved transfers — treasury confirms receipt */}
          {approvedTransfers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Confirmar Recepción ({approvedTransfers.length})</p>
              {approvedTransfers.map(t => (
                <ActionCard key={t.sale_id} icon="🏦" color="border-l-emerald-500"
                  title={`${fmt(Number(t.sale_price))} — ${t.client_name || 'Cliente'}`}
                  subtitle={t.property_address || 'Propiedad'}
                  detail="Transferencia aprobada — confirmar que el pago fue recibido"
                  date={t.reported_at}
                  action={
                    confirmingTransferId === t.sale_id ? (
                      <div className="flex gap-1">
                        <button onClick={() => handleConfirmTransfer(t.sale_id)} disabled={confirmingSubmitting}
                          className="text-xs px-2 py-1 rounded bg-emerald-600 text-white font-medium">
                          {confirmingSubmitting ? '...' : 'Sí, recibido'}
                        </button>
                        <button onClick={() => setConfirmingTransferId(null)} className="text-xs px-2 py-1 rounded border text-navy-500">No</button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmingTransferId(t.sale_id)}
                        className="text-xs px-3 py-1 rounded-lg font-medium text-white bg-emerald-600">
                        Confirmar
                      </button>
                    )
                  }
                />
              ))}
            </div>
          )}

          {/* Pending renovations */}
          {isAdmin && pendingRenos.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Cotizaciones Renovación ({pendingRenos.length})</p>
              {pendingRenos.map(r => (
                <ActionCard key={r.renovation_id} icon="🔧" color="border-l-purple-500"
                  title={`${fmt(Number(r.total_cost || 0))} — Renovación`}
                  subtitle={r.address || 'Propiedad'}
                  detail={`Responsable: ${r.responsable || 'N/A'}`}
                  date={r.created_at}
                  action={<button onClick={() => handleApproveReno(r.property_id)} disabled={approvingId === r.property_id}
                    className="text-xs px-3 py-1 rounded-lg font-medium text-white" style={{ backgroundColor: 'var(--navy-800)' }}>
                    {approvingId === r.property_id ? '...' : 'Aprobar'}
                  </button>}
                />
              ))}
            </div>
          )}

          {/* Sale payment notifications (action_required) */}
          {actionNotifs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] font-bold text-navy-500 uppercase tracking-wider">Pagos por Confirmar ({actionNotifs.length})</p>
              {actionNotifs.slice(0, 8).map(n => (
                <ActionCard key={n.id} icon={n.type === 'sale_payment' ? '💳' : n.type === 'commission' ? '💵' : '🔔'}
                  color={`border-l-${n.priority === 'high' ? 'red' : 'blue'}-400`}
                  title={n.title} subtitle={n.property_address || ''} detail={n.message?.substring(0, 80) || ''}
                  date={n.created_at} badge={n.property_code}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════ HISTORIAL ═══════════════ */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>Historial</h2>
          <div className="flex gap-1 ml-auto">
            <button onClick={() => setHistoryTab('activity')}
              className={`text-xs px-3 py-1 rounded-full ${historyTab === 'activity' ? 'bg-navy-100 text-navy-700 font-medium' : 'text-navy-400'}`}>
              Actividad
            </button>
            <button onClick={() => setHistoryTab('completed')}
              className={`text-xs px-3 py-1 rounded-full ${historyTab === 'completed' ? 'bg-navy-100 text-navy-700 font-medium' : 'text-navy-400'}`}>
              Completados
            </button>
          </div>
        </div>

        {historyTab === 'activity' && (
          <div className="space-y-1.5">
            {infoNotifs.length === 0 ? (
              <p className="text-sm text-navy-400 py-4 text-center">Sin actividad reciente</p>
            ) : infoNotifs.slice(0, 15).map(n => {
              const icons: Record<string, string> = {
                purchase: '🏠', sale: '💰', commission: '💵', payment_order: '📋',
                renovation: '🔧', move: '🚛', sale_payment: '💳', cash_payment: '💵',
              }
              return (
                <div key={n.id} className={`flex items-start gap-2.5 p-2.5 rounded-lg text-xs ${n.is_read ? 'bg-gray-50 opacity-60' : 'bg-white border border-navy-100'}`}>
                  <span className="text-base mt-0.5">{icons[n.type] || '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className={`${n.is_read ? 'text-gray-500' : 'text-navy-800 font-medium'}`}>{n.title}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5 truncate">{n.message}</p>
                  </div>
                  <div className="text-[10px] text-gray-400 whitespace-nowrap flex items-center gap-1.5">
                    {n.property_code && <span className="bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-medium">{n.property_code}</span>}
                    {n.amount && <span className="font-medium text-navy-500">{fmt(Number(n.amount))}</span>}
                    <span>{fmtDate(n.created_at)}</span>
                  </div>
                </div>
              )
            })}
            {infoNotifs.length > 0 && (
              <button onClick={async () => {
                await fetch('/api/notifications/mark-all-read', { method: 'POST' })
                fetchAll()
                toast.success('Marcadas como leídas')
              }} className="w-full text-center text-[10px] text-blue-500 hover:text-blue-700 py-1">
                Marcar todas como leídas
              </button>
            )}
          </div>
        )}

        {historyTab === 'completed' && (
          <p className="text-sm text-navy-400 py-4 text-center">
            Ver órdenes completadas en Contabilidad
          </p>
        )}
      </div>

      {/* ═══════════════ COMPLETE ORDER MODAL ═══════════════ */}
      {completing && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setCompleting(null)}>
          <div className="bg-white rounded-xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold">Completar Pago</h3>
              <button onClick={() => setCompleting(null)}><X className="w-5 h-5 text-navy-400" /></button>
            </div>
            <div className="p-3 bg-navy-50 rounded-lg text-sm">
              <p className="font-medium">{fmt(Number(completing.amount))} → {completing.payee_name}</p>
              <p className="text-xs text-navy-500 mt-1">{completing.property_address}</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-navy-600">Referencia / Confirmación *</label>
                <input type="text" value={completeForm.reference} onChange={e => setCompleteForm({ ...completeForm, reference: e.target.value })}
                  className="w-full mt-1 border border-navy-200 rounded-lg px-3 py-2 text-sm" placeholder="Número de confirmación" />
              </div>
              <div>
                <label className="text-xs font-medium text-navy-600">Fecha de pago</label>
                <input type="date" value={completeForm.payment_date} onChange={e => setCompleteForm({ ...completeForm, payment_date: e.target.value })}
                  className="w-full mt-1 border border-navy-200 rounded-lg px-3 py-2 text-sm" />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-navy-600">Cuenta bancaria</label>
                  <select value={completeForm.bank_account_id} onChange={e => setCompleteForm({ ...completeForm, bank_account_id: e.target.value })}
                    className="w-full mt-1 border border-navy-200 rounded-lg px-3 py-2 text-sm">
                    <option value="">— Seleccionar —</option>
                    {bankAccounts.map((b: any) => <option key={b.id} value={b.id}>{b.name} ({b.bank_name})</option>)}
                  </select>
                </div>
              )}
            </div>
            <button onClick={handleCompleteOrder} disabled={submitting || !completeForm.reference}
              className="w-full py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--navy-800)' }}>
              {submitting ? 'Procesando...' : 'Completar Pago'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════
// Compact action card
// ═══════════════════════════════════════════════════════════════

function ActionCard({ icon, color, title, subtitle, detail, date, action, badge }: {
  icon: string; color: string; title: string; subtitle: string; detail?: string; date?: string; action?: React.ReactNode; badge?: string
}) {
  return (
    <div className={`flex items-center gap-3 p-2.5 rounded-lg border border-l-4 ${color} bg-white`}>
      <span className="text-base flex-shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-navy-900 font-medium truncate">{title}</p>
        <div className="flex items-center gap-2 mt-0.5">
          <p className="text-[11px] text-navy-500 truncate">{subtitle}</p>
          {badge && <span className="text-[9px] bg-navy-100 text-navy-600 px-1 rounded font-bold">{badge}</span>}
        </div>
        {detail && <p className="text-[10px] text-gray-400 truncate mt-0.5">{detail}</p>}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {date && <span className="text-[10px] text-gray-400">{new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</span>}
        {action}
      </div>
    </div>
  )
}
