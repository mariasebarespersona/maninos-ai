'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell,
  CheckCircle,
  Clock,
  DollarSign,
  Loader2,
  AlertCircle,
  Building2,
  CreditCard,
  X,
  Calendar,
  ShieldCheck,
  Hammer,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/Auth/AuthProvider'

interface PaymentOrder {
  id: string
  property_id: string
  property_address: string
  property_code: string | null
  status: 'pending' | 'approved' | 'completed' | 'cancelled'
  payee_name: string
  bank_name: string | null
  routing_number: string | null
  account_number: string | null
  routing_number_last4: string | null
  account_number_last4: string | null
  account_type: string
  payee_address: string | null
  bank_address: string | null
  amount: number
  method: string
  reference: string | null
  payment_date: string | null
  notes: string | null
  concept: string | null
  direction: string | null
  created_by: string | null
  completed_by: string | null
  completed_at: string | null
  approved_by: string | null
  approved_at: string | null
  created_at: string
}

interface BankAccount {
  id: string
  name: string
  bank_name: string
  current_balance: number
}

export default function NotificacionesPage() {
  const toast = useToast()
  const { teamUser } = useAuth()
  const userRole = teamUser?.role || 'admin'
  const isAdmin = userRole === 'admin'
  const isTreasury = userRole === 'treasury' || userRole === 'admin'

  const isAbigail = teamUser?.email === 'abigail@maninoshomes.com'
  const canSeePending = isAdmin || isAbigail

  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'completed' | 'received'>('pending')

  // Completion modal state
  const [completing, setCompleting] = useState<PaymentOrder | null>(null)
  const [completeForm, setCompleteForm] = useState({ reference: '', payment_date: '', bank_account_id: '' })
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [submitting, setSubmitting] = useState(false)

  // Transfer state
  const [pendingTransfers, setPendingTransfers] = useState<any[]>([])
  const [loadingTransfers, setLoadingTransfers] = useState(true)
  const [confirmingTransfer, setConfirmingTransfer] = useState<any | null>(null)
  const [confirmingSubmitting, setConfirmingSubmitting] = useState(false)

  const [confirmedTransfers, setConfirmedTransfers] = useState<any[]>([])
  const [loadingConfirmed, setLoadingConfirmed] = useState(true)

  // Inbound completed payment orders (pagos recibidos de clientes)
  const [inboundReceived, setInboundReceived] = useState<PaymentOrder[]>([])

  // Renovation approvals
  const [pendingRenovations, setPendingRenovations] = useState<any[]>([])
  const [loadingRenovations, setLoadingRenovations] = useState(true)

  // Centralized notifications
  const [notifications, setNotifications] = useState<any[]>([])
  const [notifCount, setNotifCount] = useState(0)
  const [showAllNotifs, setShowAllNotifs] = useState(false)

  // Approval state
  const [approvingId, setApprovingId] = useState<string | null>(null)

  // Default tab based on role (admin sees pending first, pure treasury sees approved)
  useEffect(() => {
    if (isTreasury && !isAdmin) setActiveTab('approved')
    else setActiveTab('pending')
  }, [isTreasury, isAdmin])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const status = activeTab === 'approved' ? 'approved' : activeTab
      const res = await fetch(`/api/payment-orders?status=${status}`)
      const data = await res.json()
      if (data.ok) setOrders(data.data || [])
    } catch (e) {
      console.error('Error fetching orders:', e)
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  const fetchBankAccounts = async () => {
    try {
      const res = await fetch('/api/accounting/bank-accounts')
      const data = await res.json()
      setBankAccounts(data.bank_accounts || [])
    } catch (e) {
      console.error('Error fetching bank accounts:', e)
    }
  }

  const fetchPendingTransfers = useCallback(async () => {
    setLoadingTransfers(true)
    try {
      const res = await fetch('/api/sales/pending-transfers')
      const data = await res.json()
      if (data.ok) setPendingTransfers(data.transfers || [])
    } catch (e) {
      console.error('Error fetching pending transfers:', e)
    } finally {
      setLoadingTransfers(false)
    }
  }, [])

  const fetchConfirmedTransfers = useCallback(async () => {
    setLoadingConfirmed(true)
    try {
      const res = await fetch('/api/sales/confirmed-transfers')
      const data = await res.json()
      if (data.ok) setConfirmedTransfers(data.transfers || [])
    } catch (e) {
      console.error('Error fetching confirmed transfers:', e)
    } finally {
      setLoadingConfirmed(false)
    }
  }, [])

  const fetchPendingRenovations = useCallback(async () => {
    setLoadingRenovations(true)
    try {
      const res = await fetch('/api/renovation/pending-approvals')
      const data = await res.json()
      if (data.ok) setPendingRenovations(data.pending || [])
    } catch (e) {
      console.error('Error fetching pending renovations:', e)
    } finally {
      setLoadingRenovations(false)
    }
  }, [])

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?category=homes&limit=20&unread_only=true')
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setNotifCount(data.count || 0)
      }
    } catch {}
  }, [])

  const fetchInboundReceived = useCallback(async () => {
    try {
      // Inbound payments: approved (enganche, capital) go to "Recibidos"
      const res = await fetch('/api/payment-orders?status=approved')
      const data = await res.json()
      const approved = (data.data || []).filter((o: any) => o.direction === 'inbound')
      // Also include completed inbound for history
      const res2 = await fetch('/api/payment-orders?status=completed')
      const data2 = await res2.json()
      const completed = (data2.data || []).filter((o: any) => o.direction === 'inbound')
      setInboundReceived([...approved, ...completed])
    } catch {}
  }, [])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchInboundReceived() }, [fetchInboundReceived])
  useEffect(() => { fetchPendingTransfers() }, [fetchPendingTransfers])
  useEffect(() => { fetchConfirmedTransfers() }, [fetchConfirmedTransfers])
  useEffect(() => { fetchPendingRenovations() }, [fetchPendingRenovations])
  useEffect(() => { fetchNotifications() }, [fetchNotifications])

  // ── Approve (admin only) ──────────────────────────────────────────────
  const handleApproveOrder = async (orderId: string) => {
    setApprovingId(orderId)
    try {
      const res = await fetch(`/api/payment-orders/${orderId}/approve?approved_by=${teamUser?.id || ''}`, {
        method: 'PATCH',
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Orden aprobada')
        fetchOrders()
        fetchInboundReceived() // Refresh Recibidos tab for inbound orders
      } else {
        toast.error(data.detail || 'Error al aprobar')
      }
    } catch (e) {
      console.error('Error approving order:', e)
    } finally {
      setApprovingId(null)
    }
  }

  const handleApproveTransfer = async (saleId: string) => {
    setApprovingId(saleId)
    try {
      const res = await fetch(`/api/sales/${saleId}/approve-transfer?approved_by=${teamUser?.id || ''}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Transferencia aprobada')
        fetchPendingTransfers()
      } else {
        toast.error(data.detail || 'Error al aprobar')
      }
    } catch (e) {
      console.error('Error approving transfer:', e)
    } finally {
      setApprovingId(null)
    }
  }

  // ── Approve renovation (admin only) ──────────────────────────────────
  const handleApproveRenovation = async (propertyId: string) => {
    setApprovingId(propertyId)
    try {
      const res = await fetch(`/api/renovation/${propertyId}/approve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved_by: teamUser?.name || teamUser?.id || 'admin' }),
      })
      const data = await res.json()
      if (data.success) {
        toast.success('Cotización de renovación aprobada')
        fetchPendingRenovations()
      } else {
        toast.error(data.detail || 'Error al aprobar')
      }
    } catch (e) {
      console.error('Error approving renovation:', e)
      toast.error('Error de conexión')
    } finally {
      setApprovingId(null)
    }
  }

  // ── Complete (treasury) ───────────────────────────────────────────────
  const openCompleteModal = (order: PaymentOrder) => {
    setCompleting(order)
    setCompleteForm({ reference: '', payment_date: new Date().toISOString().split('T')[0], bank_account_id: '' })
    if (bankAccounts.length === 0) fetchBankAccounts()
  }

  const handleComplete = async () => {
    if (!completing || !completeForm.reference) return
    setSubmitting(true)
    try {
      const res = await fetch(`/api/payment-orders/${completing.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(completeForm),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Pago completado')
        setCompleting(null)
        fetchOrders()
      } else {
        toast.error(data.detail || 'Error al completar')
      }
    } catch (e) {
      console.error('Error completing order:', e)
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmTransfer = async (saleId: string) => {
    setConfirmingSubmitting(true)
    try {
      const res = await fetch(`/api/sales/${saleId}/confirm-transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Pago confirmado. Documentos generados y email enviado al cliente.')
        setConfirmingTransfer(null)
        fetchPendingTransfers()
        fetchConfirmedTransfers()
        fetchOrders()
      } else {
        toast.error(data.detail || 'Error al confirmar la transferencia')
      }
    } catch (e) {
      console.error('Error confirming transfer:', e)
      toast.error('Error de conexion al confirmar la transferencia')
    } finally {
      setConfirmingSubmitting(false)
    }
  }

  const formatCurrency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

  // Filter transfers: admin sees all, treasury only sees approved ones
  const transfersForRole = isTreasury
    ? pendingTransfers.filter((t: any) => t.transfer_approved_at)
    : pendingTransfers

  // Unapproved transfers (for admin to approve)
  const unapprovedTransfers = pendingTransfers.filter((t: any) => !t.transfer_approved_at)

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
            <Bell className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="font-serif text-2xl font-semibold" style={{ color: 'var(--ink)' }}>
              Notificaciones
            </h1>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              {isAdmin
                ? 'Aprueba ordenes de pago y transferencias'
                : 'Ordenes de pago y transferencias pendientes'}
            </p>
          </div>
        </div>
      </div>

      {/* Actividad Reciente removed per user request — all actions go through the 4 tabs below */}

      {/* ── ADMIN / Abigail: Renovation quotes pending approval ───────── */}
      {canSeePending && pendingRenovations.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-purple-500 animate-pulse" />
            <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Cotizaciones de Renovación por Aprobar
            </h2>
            <span className="ml-auto bg-purple-100 text-purple-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {pendingRenovations.length}
            </span>
          </div>
          <div className="space-y-3">
            {pendingRenovations.map((reno: any) => (
              <div key={reno.renovation_id} className="bg-white rounded-xl border-2 border-purple-200 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Hammer className="w-4 h-4 text-purple-500" />
                      <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                        Cotización de Renovación
                      </span>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                        <Clock className="w-3 h-3" />
                        Pendiente
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className="w-4 h-4" style={{ color: 'var(--navy-600)' }} />
                      {reno.property_id ? (
                        <Link href={`/homes/properties/${reno.property_id}`} className="text-sm truncate hover:underline" style={{ color: 'var(--navy-600)' }}>
                          {reno.address || reno.property_id} →
                        </Link>
                      ) : (
                        <span className="text-sm truncate" style={{ color: 'var(--charcoal)' }}>
                          {reno.address || 'Propiedad'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 mb-2">
                      <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                        ${reno.total_cost?.toLocaleString('en-US', { minimumFractionDigits: 2 }) || '0.00'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                      {reno.responsable && <span>Responsable: <strong>{reno.responsable}</strong></span>}
                      {reno.created_at && <span>Creada: {new Date(reno.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleApproveRenovation(reno.property_id)}
                      disabled={approvingId === reno.property_id}
                      className="px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      {approvingId === reno.property_id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      Aprobar
                    </button>
                    <Link
                      href={`/homes/properties/${reno.property_id}/renovate`}
                      className="px-4 py-2 rounded-lg text-xs font-medium text-center transition-colors border flex items-center justify-center gap-1.5"
                      style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
                    >
                      <ExternalLink className="w-3 h-3" />
                      Ver detalle
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN / Abigail: Unapproved transfers to approve ──────────── */}
      {canSeePending && unapprovedTransfers.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-orange-500 animate-pulse" />
            <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Transferencias por Aprobar
            </h2>
            <span className="ml-auto bg-orange-100 text-orange-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {unapprovedTransfers.length}
            </span>
          </div>
          <div className="space-y-3">
            {unapprovedTransfers.map((transfer: any) => (
              <TransferCard
                key={transfer.sale_id}
                transfer={transfer}
                action={
                  <button
                    onClick={() => handleApproveTransfer(transfer.sale_id)}
                    disabled={approvingId === transfer.sale_id}
                    className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                    style={{ backgroundColor: 'var(--navy-800)' }}
                  >
                    {approvingId === transfer.sale_id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-4 h-4" />
                    )}
                    Aprobar
                  </button>
                }
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── TREASURY: Approved transfers to confirm ────────────────────── */}
      {isTreasury && transfersForRole.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
              Transferencias Aprobadas — Confirmar Pago
            </h2>
            <span className="ml-auto bg-emerald-100 text-emerald-800 text-xs font-bold px-2.5 py-1 rounded-full">
              {transfersForRole.length}
            </span>
          </div>
          <div className="space-y-3">
            {transfersForRole.map((transfer: any) => (
              <TransferCard
                key={transfer.sale_id}
                transfer={transfer}
                action={
                  confirmingTransfer?.sale_id === transfer.sale_id ? (
                    <div className="bg-white border rounded-xl p-4 shadow-lg space-y-3 min-w-[240px]">
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                        ¿Confirmas que el pago ha sido recibido?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setConfirmingTransfer(null)}
                          className="flex-1 px-3 py-2 rounded-lg border text-xs font-medium hover:bg-gray-50"
                          style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
                        >
                          Cancelar
                        </button>
                        <button
                          onClick={() => handleConfirmTransfer(transfer.sale_id)}
                          disabled={confirmingSubmitting}
                          className="flex-1 px-3 py-2 rounded-lg text-xs font-medium text-white disabled:opacity-50"
                          style={{ backgroundColor: '#16a34a' }}
                        >
                          {confirmingSubmitting ? (
                            <span className="flex items-center justify-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> ...
                            </span>
                          ) : 'Si, confirmar'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingTransfer(transfer)}
                      className="flex-shrink-0 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: '#16a34a' }}
                    >
                      El pago ha sido recibido
                    </button>
                  )
                }
                formatCurrency={formatCurrency}
                formatDate={formatDate}
              />
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-lg border p-1" style={{ borderColor: 'var(--sand)' }}>
        {/* Admin + Abigail see "Pending" (to approve), Treasury sees "Approved" (to execute) */}
        {canSeePending && (
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'pending'
                ? 'bg-amber-50 text-amber-800 border border-amber-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Clock className="w-4 h-4" />
            Por Aprobar
          </button>
        )}
        {isTreasury && (
          <button
            onClick={() => setActiveTab('approved')}
            className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'approved'
                ? 'bg-blue-50 text-blue-800 border border-blue-200'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            Aprobadas
          </button>
        )}
        <button
          onClick={() => setActiveTab('received')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'received'
              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Recibidos
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'completed'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <CheckCircle className="w-4 h-4" />
          Realizados
        </button>
      </div>

      {/* Received: inbound payment orders + confirmed transfers */}
      {activeTab === 'received' && (
        <>
          {/* Inbound payments received (from sale payments) */}
          {inboundReceived.length > 0 && (
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Pagos de Clientes Recibidos</h3>
              {inboundReceived.map((o: any) => (
                <div key={o.id} className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--sand)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                          {o.payee_name} — ${Number(o.amount).toLocaleString()}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">Recibido</span>
                        {o.concept && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                            o.concept === 'pago_venta' ? 'bg-emerald-50 text-emerald-600' : 'bg-gray-100 text-gray-600'
                          }`}>{o.concept === 'pago_venta' ? 'Pago de Venta' : o.concept}</span>
                        )}
                      </div>
                      {o.property_address && (
                        <div className="flex items-center gap-1 text-xs mb-1" style={{ color: 'var(--slate)' }}>
                          <Building2 className="w-3 h-3" />
                          {o.property_code && <span className="text-[9px] bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-bold">{o.property_code}</span>}
                          {o.property_id ? (
                            <Link href={`/homes/properties/${o.property_id}`} className="hover:underline" style={{ color: 'var(--navy-600)' }}>
                              {o.property_address} →
                            </Link>
                          ) : o.property_address}
                        </div>
                      )}
                      {o.notes && <p className="text-xs" style={{ color: 'var(--slate)' }}>{o.notes.substring(0, 120)}</p>}
                      <span className="text-[10px]" style={{ color: 'var(--slate)' }}>
                        {o.completed_at ? new Date(o.completed_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Confirmed bank transfers */}
          {loadingConfirmed ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--slate)' }} />
            </div>
          ) : confirmedTransfers.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border" style={{ borderColor: 'var(--sand)' }}>
              <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                <DollarSign className="w-6 h-6 text-emerald-400" />
              </div>
              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                No hay pagos recibidos aun
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {confirmedTransfers.map((ct: any) => (
                <div key={ct.sale_id} className="bg-white rounded-xl border p-5" style={{ borderColor: 'var(--sand)' }}>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <CheckCircle className="w-4 h-4 text-emerald-500" />
                        <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
                          Pago Confirmado - {ct.payment_method || 'Transferencia'}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800">
                          Completado
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4" style={{ color: 'var(--navy-600)' }} />
                        {ct.property_id ? (
                          <Link href={`/homes/properties/${ct.property_id}`} className="text-sm hover:underline" style={{ color: 'var(--navy-600)' }}>
                            {ct.property_address}{ct.property_city ? `, ${ct.property_city}` : ''} →
                          </Link>
                        ) : (
                          <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                            {ct.property_address}{ct.property_city ? `, ${ct.property_city}` : ''}
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                        <span>Cliente: <strong>{ct.client_name}</strong></span>
                        {ct.completed_at && (
                          <span>Confirmado: {formatDate(ct.completed_at)}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                        {formatCurrency(ct.sale_price)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Orders List (pending/approved/completed tabs) */}
      {activeTab !== 'received' && (() => {
        // For "Aprobadas" tab: only show outbound (Maninos pays). Inbound go to "Recibidos".
        const displayOrders = activeTab === 'approved'
          ? orders.filter((o: any) => o.direction !== 'inbound')
          : orders
        return loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--slate)' }} />
        </div>
      ) : displayOrders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border" style={{ borderColor: 'var(--sand)' }}>
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            {activeTab === 'pending' ? <Clock className="w-6 h-6 text-gray-400" /> :
             activeTab === 'approved' ? <ShieldCheck className="w-6 h-6 text-gray-400" /> :
             <CheckCircle className="w-6 h-6 text-gray-400" />}
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
            {activeTab === 'pending' ? 'No hay ordenes por aprobar' :
             activeTab === 'approved' ? 'No hay ordenes aprobadas pendientes' :
             'No hay ordenes completadas'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayOrders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow" style={{ borderColor: 'var(--sand)' }}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--navy-600)' }} />
                    {order.property_code && (
                      <span className="text-[9px] bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-bold flex-shrink-0">{order.property_code}</span>
                    )}
                    {order.property_id ? (
                      <Link
                        href={`/homes/properties/${order.property_id}`}
                        className="font-medium text-sm truncate hover:underline"
                        style={{ color: 'var(--navy-600)' }}
                      >
                        {order.property_address || 'Propiedad'} →
                      </Link>
                    ) : (
                      <span className="font-medium text-sm truncate" style={{ color: 'var(--ink)' }}>
                        {order.property_address || 'Propiedad'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                      {formatCurrency(order.amount)}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      order.status === 'approved' ? 'bg-blue-100 text-blue-800' :
                      order.status === 'completed' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {order.status === 'pending' && <Clock className="w-3 h-3" />}
                      {order.status === 'approved' && <ShieldCheck className="w-3 h-3" />}
                      {order.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                      {order.status === 'pending' ? 'Pendiente' :
                       order.status === 'approved' ? 'Aprobada' :
                       order.status === 'completed' ? 'Completado' : 'Cancelado'}
                    </span>
                  </div>
                  {/* Concept + Notes (detailed description) */}
                  {(order.concept || order.notes) && (
                    <div className="mb-2 p-2.5 bg-blue-50 rounded-lg border border-blue-100">
                      {order.concept && (
                        <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-medium mb-1 ${
                          order.concept === 'compra' ? 'bg-blue-100 text-blue-700' :
                          order.concept === 'renovacion' ? 'bg-amber-100 text-amber-700' :
                          order.concept === 'movida' ? 'bg-purple-100 text-purple-700' :
                          order.concept === 'comision' ? 'bg-gold-100 text-gold-700' :
                          order.concept === 'pago_venta' ? 'bg-emerald-100 text-emerald-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {order.concept === 'compra' ? 'Compra de Casa' :
                           order.concept === 'renovacion' ? 'Renovación' :
                           order.concept === 'movida' ? 'Movida / Transporte' :
                           order.concept === 'comision' ? 'Comisión' :
                           order.concept === 'pago_venta' ? 'Pago de Venta' :
                           order.concept}
                        </span>
                      )}
                      {order.notes && (
                        <p className="text-xs text-navy-600 leading-relaxed">{order.notes}</p>
                      )}
                    </div>
                  )}
                  {/* Bank Details */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                      <CreditCard className="w-4 h-4" />
                      {order.payee_name}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                      {order.bank_name && <div><span className="font-medium">Banco:</span> {order.bank_name}</div>}
                      {order.account_type && <div><span className="font-medium">Tipo:</span> {order.account_type === 'checking' ? 'Checking' : 'Savings'}</div>}
                      {order.routing_number && <div><span className="font-medium">Routing #:</span> <span className="font-mono">{order.routing_number}</span></div>}
                      {order.account_number && <div><span className="font-medium">Account #:</span> <span className="font-mono">{order.account_number}</span></div>}
                      {!order.routing_number && order.routing_number_last4 && <div><span className="font-medium">Routing #:</span> ****{order.routing_number_last4}</div>}
                      {!order.account_number && order.account_number_last4 && <div><span className="font-medium">Account #:</span> ****{order.account_number_last4}</div>}
                      {order.payee_address && <div className="col-span-2"><span className="font-medium">Dir. beneficiario:</span> {order.payee_address}</div>}
                      {order.bank_address && <div className="col-span-2"><span className="font-medium">Dir. banco:</span> {order.bank_address}</div>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Creado: {formatDate(order.created_at)}
                    </span>
                    {order.reference && <span>Ref: {order.reference}</span>}
                    {order.payment_date && <span>Pagado: {formatDate(order.payment_date)}</span>}
                  </div>
                </div>

                {/* Actions based on role */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {/* Admin / Abigail: approve pending orders */}
                  {canSeePending && order.status === 'pending' && (
                    <button
                      onClick={() => handleApproveOrder(order.id)}
                      disabled={approvingId === order.id}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50 flex items-center gap-2"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      {approvingId === order.id ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <ShieldCheck className="w-4 h-4" />
                      )}
                      Aprobar
                    </button>
                  )}
                  {/* Treasury/Admin: complete approved orders (single button) */}
                  {isTreasury && order.status === 'approved' && (
                    <button
                      onClick={() => openCompleteModal(order)}
                      className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      Completar Pago
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )
      })()}

      {/* Complete Payment Modal */}
      {completing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCompleting(null)} />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                Completar Pago
              </h3>
              <button onClick={() => setCompleting(null)} className="p-1 rounded hover:bg-gray-100">
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--slate)' }}>Propiedad</span>
                {completing.property_id ? (
                  <div className="flex items-center gap-1.5">
                    {completing.property_code && <span className="text-[9px] bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-bold">{completing.property_code}</span>}
                    <Link href={`/homes/properties/${completing.property_id}`} className="font-medium hover:underline" style={{ color: 'var(--navy-600)' }}>
                      {completing.property_address || 'N/A'} →
                    </Link>
                  </div>
                ) : (
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>{completing.property_address || 'N/A'}</span>
                )}
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--slate)' }}>Beneficiario</span>
                <span className="font-medium" style={{ color: 'var(--ink)' }}>{completing.payee_name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--slate)' }}>Monto</span>
                <span className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{formatCurrency(completing.amount)}</span>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Numero de confirmacion *
                </label>
                <input
                  type="text"
                  value={completeForm.reference}
                  onChange={e => setCompleteForm(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="Ingresa el # de confirmacion"
                  className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                  style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Fecha del pago *
                </label>
                <input
                  type="date"
                  value={completeForm.payment_date}
                  onChange={e => setCompleteForm(prev => ({ ...prev, payment_date: e.target.value }))}
                  className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500"
                  style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              {bankAccounts.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                    Cuenta bancaria de origen
                  </label>
                  <select
                    value={completeForm.bank_account_id}
                    onChange={e => setCompleteForm(prev => ({ ...prev, bank_account_id: e.target.value }))}
                    className="w-full p-3 border rounded-lg text-sm bg-white"
                    style={{ borderColor: 'var(--stone)' }}
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {bankAccounts.map(ba => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} - {ba.bank_name} (${ba.current_balance?.toLocaleString()})
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCompleting(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium hover:bg-gray-50"
                style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleComplete}
                disabled={!completeForm.reference || submitting}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ backgroundColor: 'var(--navy-800)' }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
                  </span>
                ) : 'Confirmar Pago Realizado'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Reusable Transfer Card ──────────────────────────────────────────────
function TransferCard({
  transfer,
  action,
  formatCurrency,
  formatDate,
}: {
  transfer: any
  action: React.ReactNode
  formatCurrency: (n: number) => string
  formatDate: (d: string) => string
}) {
  return (
    <div className="bg-white rounded-xl border-2 border-orange-200 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-orange-500" />
            <span className="font-medium text-sm" style={{ color: 'var(--ink)' }}>
              Pago Contado - Transferencia Bancaria
            </span>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <Building2 className="w-4 h-4" style={{ color: 'var(--navy-600)' }} />
            {transfer.property_id ? (
              <Link href={`/homes/properties/${transfer.property_id}`} className="text-sm truncate hover:underline" style={{ color: 'var(--navy-600)' }}>
                {transfer.property_address} →
              </Link>
            ) : (
              <span className="text-sm truncate" style={{ color: 'var(--charcoal)' }}>
                {transfer.property_address}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mb-3">
            <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {formatCurrency(transfer.sale_price)}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
              <AlertCircle className="w-3 h-3" />
              Pendiente
            </span>
          </div>
          <div className="bg-orange-50 rounded-lg p-3 mb-2">
            <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--slate)' }}>
              <div><span className="font-medium">Cliente:</span> {transfer.client_name}</div>
              <div><span className="font-medium">Email:</span> {transfer.client_email}</div>
              <div><span className="font-medium">Telefono:</span> {transfer.client_phone}</div>
              <div><span className="font-medium">Reportado:</span> {formatDate(transfer.reported_at)}</div>
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          {action}
        </div>
      </div>
    </div>
  )
}
