'use client'

export const dynamic = 'force-dynamic'

import React, { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  DollarSign,
  Plus,
  Building2,
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  CreditCard,
  TrendingUp,
  FileDown,
  Loader2,
  Award,
  ChevronDown,
  ChevronUp,
  Banknote,
  FileText,
  Landmark,
  Copy,
} from 'lucide-react'
import { ConfirmModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'

// Maninos bank info for client payments
const MANINOS_BANK_INFO = {
  bank_name: 'Chase Bank',
  account_name: 'Maninos Homes LLC',
  zelle: '832-745-9600',
  routing_number: '111000614',
  account_number: 'Contact Abigail for details',
  note: 'Incluir ID de venta como referencia',
}

interface Sale {
  id: string
  property_id: string
  client_id: string
  sale_type: 'contado' | 'rto'
  sale_price: number
  status: string
  sold_before_renovation: boolean
  payment_method?: string
  payment_reference?: string
  created_at: string
  completed_at?: string
  property_address?: string
  client_name?: string
  // Commission fields
  found_by_employee_id?: string
  sold_by_employee_id?: string
  commission_amount?: number
  commission_found_by?: number
  commission_sold_by?: number
  found_by_name?: string
  sold_by_name?: string
  // RTO fields
  rto_monthly_payment?: number
  rto_term_months?: number
  rto_down_payment?: number
  // Payment tracking
  amount_paid?: number
  amount_pending?: number
}

const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-50 text-amber-700 border-amber-200', icon: Clock },
  paid: { label: 'Pagada', color: 'bg-blue-50 text-blue-700 border-blue-200', icon: CreditCard },
  completed: { label: 'Completada', color: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelada', color: 'bg-red-50 text-red-700 border-red-200', icon: XCircle },
}

export default function SalesPageWrapper() {
  return (
    <Suspense fallback={<div className="animate-pulse p-8 text-center text-navy-500">Cargando...</div>}>
      <SalesPage />
    </Suspense>
  )
}

function SalesPage() {
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status')

  const [sales, setSales] = useState<Sale[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    total_sales: 0,
    total_revenue: 0,
    pending: 0,
    paid: 0,
    completed: 0,
    cancelled: 0,
    rto_approved: 0,
  })

  useEffect(() => {
    fetchSales()
    fetchStats()
  }, [statusFilter])

  const fetchSales = async () => {
    setLoading(true)
    try {
      const url = new URL('/api/sales', window.location.origin)
      if (statusFilter) url.searchParams.set('status', statusFilter)

      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setSales(data)
      }
    } catch (error) {
      console.error('Error fetching sales:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/sales/stats/summary')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Ventas</h1>
          <p className="text-navy-500 text-sm mt-1">
            Registro de ventas y pagos confirmados
          </p>
        </div>
        <Link href="/homes/sales/new" className="btn-gold whitespace-nowrap">
          <Plus className="w-5 h-5" />
          Nueva Venta
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="card-luxury p-5">
          <div className="p-3 bg-gold-100 rounded-xl w-fit mb-3">
            <TrendingUp className="w-6 h-6 text-gold-600" />
          </div>
          <p className="text-2xl font-serif font-bold text-navy-900">
            ${stats.total_revenue.toLocaleString()}
          </p>
          <p className="text-sm text-navy-500 mt-1">Ingresos Totales</p>
        </div>

        <Link
          href="/homes/sales?status=pending"
          className={`card-luxury p-5 transition-all hover:shadow-card ${statusFilter === 'pending' ? 'ring-2 ring-gold-400' : ''}`}
        >
          <div className="p-3 bg-amber-100 rounded-xl w-fit mb-3">
            <Clock className="w-6 h-6 text-amber-600" />
          </div>
          <p className="text-2xl font-serif font-bold text-navy-900">{stats.pending}</p>
          <p className="text-sm text-navy-500 mt-1">Pendientes</p>
        </Link>

        <Link
          href="/homes/sales?status=completed"
          className={`card-luxury p-5 transition-all hover:shadow-card ${statusFilter === 'completed' ? 'ring-2 ring-gold-400' : ''}`}
        >
          <div className="p-3 bg-emerald-100 rounded-xl w-fit mb-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600" />
          </div>
          <p className="text-2xl font-serif font-bold text-navy-900">{stats.completed}</p>
          <p className="text-sm text-navy-500 mt-1">Completadas</p>
        </Link>
      </div>

      {/* Filters */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        <Link
          href="/homes/sales"
          className={`btn-ghost whitespace-nowrap ${!statusFilter ? 'bg-navy-100' : ''}`}
        >
          Todas
        </Link>
        {Object.entries(statusConfig)
          .filter(([key]) => key !== 'paid')
          .map(([key, config]) => (
          <Link
            key={key}
            href={`/homes/sales?status=${key}`}
            className={`btn-ghost whitespace-nowrap ${statusFilter === key ? 'bg-navy-100' : ''}`}
          >
            {config.label}
          </Link>
        ))}
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card-luxury p-4 animate-pulse">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-navy-100 rounded-lg" />
                <div className="flex-1">
                  <div className="h-4 bg-navy-100 rounded w-1/3 mb-2" />
                  <div className="h-3 bg-navy-100 rounded w-1/4" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : sales.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <DollarSign className="w-12 h-12 text-navy-300 mx-auto mb-4" />
          <h3 className="font-serif text-xl text-navy-900 mb-2">No hay ventas</h3>
          <p className="text-navy-500 mb-6">
            {statusFilter
              ? `No hay ventas con estado "${statusConfig[statusFilter as keyof typeof statusConfig]?.label}"`
              : 'Comienza registrando tu primera venta'
            }
          </p>
          <Link href="/homes/sales/new" className="btn-primary inline-flex">
            <Plus className="w-5 h-5" />
            Nueva Venta
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {sales.map((sale) => (
            <SaleCard
              key={sale.id}
              sale={sale}
              onUpdate={() => { fetchSales(); fetchStats() }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function SaleCard({ sale, onUpdate }: { sale: Sale; onUpdate: () => void }) {
  const status = statusConfig[sale.status] || statusConfig.pending
  const StatusIcon = status.icon
  const toast = useToast()
  const [actionLoading, setActionLoading] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  const [showCommission, setShowCommission] = useState(false)
  const [showBankInfo, setShowBankInfo] = useState(false)
  const [showDocs, setShowDocs] = useState(false)

  // Modal states
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [showPayments, setShowPayments] = useState(false)
  const [payments, setPayments] = useState<any[]>([])
  const [loadingPayments, setLoadingPayments] = useState(false)
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [addingPayment, setAddingPayment] = useState(false)
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null)
  const [editAmount, setEditAmount] = useState('')
  const [newPayment, setNewPayment] = useState({
    payment_type: 'partial',
    amount: '',
    payment_method: 'bank_transfer',
    payment_reference: '',
    notes: '',
  })

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast.success(`${label} copiado`)
  }

  const handleDownloadBillOfSale = async () => {
    setDownloadingPdf(true)
    try {
      const res = await fetch('/api/documents/bill-of-sale', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_id: sale.id }),
      })

      if (!res.ok) throw new Error('Error al generar PDF')

      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `bill_of_sale_${sale.id.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      toast.success('Bill of Sale descargado')
    } catch (error) {
      console.error('Error downloading PDF:', error)
      toast.error('Error al descargar Bill of Sale')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const handleCancel = async () => {
    setShowCancelModal(false)
    setActionLoading(true)
    try {
      const res = await fetch(`/api/sales/${sale.id}/cancel`, { method: 'POST' })
      if (res.ok) {
        toast.info('Venta cancelada')
        onUpdate()
      } else toast.error('Error al cancelar la venta')
    } catch (error) {
      toast.error('Error de conexion')
    } finally {
      setActionLoading(false)
    }
  }

  const fetchPayments = async () => {
    setLoadingPayments(true)
    try {
      const res = await fetch(`/api/sales/${sale.id}/payments`)
      const data = await res.json()
      if (data.ok) setPayments(data.payments || [])
    } catch (e) { console.error('Error fetching payments:', e) }
    finally { setLoadingPayments(false) }
  }

  const handleTogglePayments = () => {
    if (!showPayments && payments.length === 0) fetchPayments()
    setShowPayments(!showPayments)
  }

  const handleAddPayment = async () => {
    if (!newPayment.amount || Number(newPayment.amount) <= 0) return
    setAddingPayment(true)
    try {
      const res = await fetch(`/api/sales/${sale.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newPayment,
          amount: Number(newPayment.amount),
          reported_by: 'staff',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Pago registrado')
        setShowAddPayment(false)
        setNewPayment({ payment_type: 'partial', amount: '', payment_method: 'bank_transfer', payment_reference: '', notes: '' })
        fetchPayments()
        onUpdate()
      } else toast.error(data.detail || 'Error al registrar pago')
    } catch { toast.error('Error de conexion') }
    finally { setAddingPayment(false) }
  }

  const handleEditPaymentAmount = async (paymentId: string) => {
    if (!editAmount || Number(editAmount) <= 0) return
    try {
      const res = await fetch(`/api/sales/${sale.id}/payments/${paymentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: Number(editAmount) }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Monto actualizado')
        setEditingPaymentId(null)
        fetchPayments()
        onUpdate()
      } else toast.error('Error al actualizar')
    } catch { toast.error('Error de conexion') }
  }

  return (
    <>
      <div className="card-luxury p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Icon */}
          <div className={`p-3 rounded-xl flex-shrink-0 ${
            sale.sale_type === 'rto' ? 'bg-purple-50' : 'bg-gold-50'
          }`}>
            {sale.sale_type === 'rto' ? (
              <Landmark className="w-6 h-6 text-purple-600" />
            ) : (
              <DollarSign className="w-6 h-6 text-gold-600" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-navy-900">
                ${sale.sale_price.toLocaleString()}
              </h3>
              <div className={`badge ${status.color}`}>
                <StatusIcon className="w-3 h-3" />
                {status.label}
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                sale.sale_type === 'rto'
                  ? 'bg-purple-50 text-purple-600'
                  : 'bg-emerald-50 text-emerald-600'
              }`}>
                {sale.sale_type === 'rto' ? 'RTO' : 'Contado'}
              </span>
            </div>

            <div className="flex items-center gap-4 mt-2 text-sm text-navy-500">
              <span className="flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {sale.property_address || 'Propiedad'}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                {sale.client_name || 'Cliente'}
              </span>
              <span className="text-xs text-navy-400">
                {new Date(sale.created_at).toLocaleDateString('es-MX')}
              </span>
            </div>

            {/* Quick Action Buttons (expandable sections) */}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              {/* Commission toggle */}
              {sale.commission_amount != null && sale.commission_amount > 0 && (
                <button
                  onClick={() => setShowCommission(!showCommission)}
                  className="flex items-center gap-1 text-xs text-gold-700 bg-gold-50 px-2 py-1 rounded-full hover:bg-gold-100 transition-colors"
                >
                  <Award className="w-3 h-3" />
                  ${sale.commission_amount.toLocaleString()}
                  {showCommission ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              {/* Bank Info toggle (for pending contado sales) */}
              {sale.status === 'pending' && sale.sale_type === 'contado' && (
                <button
                  onClick={() => setShowBankInfo(!showBankInfo)}
                  className="flex items-center gap-1 text-xs text-blue-700 bg-blue-50 px-2 py-1 rounded-full hover:bg-blue-100 transition-colors"
                >
                  <Banknote className="w-3 h-3" />
                  Info Banco
                  {showBankInfo ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              {/* Documents toggle */}
              <button
                onClick={() => setShowDocs(!showDocs)}
                className="flex items-center gap-1 text-xs text-navy-600 bg-navy-50 px-2 py-1 rounded-full hover:bg-navy-100 transition-colors"
              >
                <FileText className="w-3 h-3" />
                Documentos
                {showDocs ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
              </button>

              {/* Payments toggle (contado sales only) */}
              {sale.sale_type === 'contado' && (
                <button
                  onClick={handleTogglePayments}
                  className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded-full hover:bg-emerald-100 transition-colors"
                >
                  <CreditCard className="w-3 h-3" />
                  Pagos
                  {sale.amount_paid != null && sale.amount_paid > 0 && (
                    <span className="font-semibold">${Number(sale.amount_paid).toLocaleString()}</span>
                  )}
                  {showPayments ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                </button>
              )}

              {/* Payment method badge */}
              {sale.payment_method && (
                <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                  {sale.payment_method}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 flex-shrink-0">
            {/* RTO sales: link to Capital portal */}
            {sale.sale_type === 'rto' && (
              <Link
                href="/capital/applications"
                className="btn-ghost text-sm py-2 flex items-center gap-1.5 text-purple-600 border-purple-200 hover:bg-purple-50"
              >
                <Landmark className="w-4 h-4" />
                Ver en Capital
              </Link>
            )}
            {sale.status === 'pending' && sale.sale_type !== 'rto' && (
              <button
                onClick={() => setShowCancelModal(true)}
                disabled={actionLoading}
                className="btn-ghost text-red-600 text-sm py-2"
              >
                Cancelar
              </button>
            )}
            {sale.status === 'completed' && (
              <button
                onClick={handleDownloadBillOfSale}
                disabled={downloadingPdf}
                className="btn-ghost text-sm py-2 flex items-center gap-1.5"
              >
                {downloadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileDown className="w-4 h-4" />
                )}
                Bill of Sale
              </button>
            )}
          </div>
        </div>

        {/* Bank Info (expandable) */}
        {showBankInfo && (
          <div className="mt-3 pt-3 border-t border-navy-100">
            <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-3 flex items-center gap-2">
                <Banknote className="w-4 h-4" />
                Datos Bancarios para el Cliente
              </h4>
              <p className="text-xs text-blue-600 mb-3">
                Comparte estos datos con el cliente para que realice el pago
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <BankField label="Zelle" value={MANINOS_BANK_INFO.zelle} onCopy={copyToClipboard} />
                <BankField label="Nombre Cuenta" value={MANINOS_BANK_INFO.account_name} onCopy={copyToClipboard} />
                <BankField label="Banco" value={MANINOS_BANK_INFO.bank_name} onCopy={copyToClipboard} />
                <BankField label="Routing #" value={MANINOS_BANK_INFO.routing_number} onCopy={copyToClipboard} />
              </div>
              <div className="mt-3 p-2 bg-blue-100 rounded-lg text-xs text-blue-700">
                <strong>Referencia:</strong> Venta #{sale.id.slice(0, 8)} — ${sale.sale_price.toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Payments Section (expandable) */}
        {showPayments && sale.sale_type === 'contado' && (
          <div className="mt-3 pt-3 border-t border-navy-100">
            <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
              {/* Payment Summary */}
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-semibold text-emerald-800 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Pagos — ${Number(sale.amount_paid || 0).toLocaleString()} de ${sale.sale_price.toLocaleString()}
                </h4>
                <span className="text-xs font-bold text-emerald-700">
                  {sale.sale_price > 0 ? Math.round((Number(sale.amount_paid || 0) / sale.sale_price) * 100) : 0}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full h-2.5 bg-emerald-200 rounded-full mb-4">
                <div
                  className="h-full bg-emerald-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, sale.sale_price > 0 ? (Number(sale.amount_paid || 0) / sale.sale_price) * 100 : 0)}%` }}
                />
              </div>

              {/* Pending amount */}
              {Number(sale.amount_pending || 0) > 0 && (
                <div className="mb-3 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  Pendiente: <strong>${Number(sale.amount_pending).toLocaleString()}</strong>
                </div>
              )}

              {/* Payment List */}
              {loadingPayments ? (
                <div className="flex items-center gap-2 text-sm text-emerald-600">
                  <Loader2 className="w-4 h-4 animate-spin" /> Cargando pagos...
                </div>
              ) : payments.length === 0 ? (
                <p className="text-sm text-emerald-600 mb-3">No hay pagos registrados aún.</p>
              ) : (
                <div className="space-y-2 mb-3">
                  {payments.map((p: any) => {
                    const typeLabels: Record<string, string> = {
                      down_payment: 'Enganche', remaining: 'Saldo', full: 'Pago total',
                      partial: 'Parcial', adjustment: 'Ajuste',
                    }
                    const statusBadges: Record<string, { label: string; cls: string }> = {
                      pending: { label: 'Pendiente', cls: 'bg-amber-100 text-amber-700' },
                      confirmed: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700' },
                      cancelled: { label: 'Cancelado', cls: 'bg-red-100 text-red-700' },
                    }
                    const badge = statusBadges[p.status] || statusBadges.pending
                    const isEditing = editingPaymentId === p.id

                    return (
                      <div key={p.id} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-emerald-100">
                        <span className="text-xs font-medium text-emerald-600 w-16">{typeLabels[p.payment_type] || p.payment_type}</span>
                        {isEditing ? (
                          <input
                            type="number"
                            className="w-24 px-2 py-1 text-sm border border-blue-400 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleEditPaymentAmount(p.id); if (e.key === 'Escape') setEditingPaymentId(null) }}
                            onBlur={() => handleEditPaymentAmount(p.id)}
                            autoFocus
                          />
                        ) : (
                          <span
                            className="font-bold text-navy-900 cursor-pointer hover:text-blue-600 transition-colors"
                            onClick={() => { setEditingPaymentId(p.id); setEditAmount(String(p.amount)) }}
                            title="Click para editar"
                          >
                            ${Number(p.amount).toLocaleString()}
                          </span>
                        )}
                        <span className="text-xs text-navy-400">{p.payment_method || '—'}</span>
                        <span className="text-xs text-navy-400">{p.payment_date ? new Date(p.payment_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : ''}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                        {p.reported_by === 'client' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">Cliente</span>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Add Payment Form */}
              {showAddPayment ? (
                <div className="p-3 bg-white rounded-lg border border-emerald-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newPayment.payment_type}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_type: e.target.value })}
                      className="text-sm border border-navy-200 rounded px-2 py-1.5"
                    >
                      <option value="down_payment">Enganche</option>
                      <option value="remaining">Saldo restante</option>
                      <option value="full">Pago total</option>
                      <option value="partial">Pago parcial</option>
                      <option value="adjustment">Ajuste</option>
                    </select>
                    <input
                      type="number"
                      placeholder="Monto $"
                      value={newPayment.amount}
                      onChange={(e) => setNewPayment({ ...newPayment, amount: e.target.value })}
                      className="text-sm border border-navy-200 rounded px-2 py-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      value={newPayment.payment_method}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_method: e.target.value })}
                      className="text-sm border border-navy-200 rounded px-2 py-1.5"
                    >
                      <option value="bank_transfer">Transferencia</option>
                      <option value="zelle">Zelle</option>
                      <option value="cash">Efectivo</option>
                      <option value="check">Cheque</option>
                      <option value="other">Otro</option>
                    </select>
                    <input
                      type="text"
                      placeholder="Referencia"
                      value={newPayment.payment_reference}
                      onChange={(e) => setNewPayment({ ...newPayment, payment_reference: e.target.value })}
                      className="text-sm border border-navy-200 rounded px-2 py-1.5"
                    />
                  </div>
                  <input
                    type="text"
                    placeholder="Notas (opcional)"
                    value={newPayment.notes}
                    onChange={(e) => setNewPayment({ ...newPayment, notes: e.target.value })}
                    className="w-full text-sm border border-navy-200 rounded px-2 py-1.5"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleAddPayment}
                      disabled={addingPayment || !newPayment.amount}
                      className="flex-1 text-sm py-1.5 rounded-lg font-medium text-white disabled:opacity-50"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      {addingPayment ? 'Guardando...' : 'Guardar Pago'}
                    </button>
                    <button
                      onClick={() => setShowAddPayment(false)}
                      className="text-sm py-1.5 px-3 rounded-lg border border-navy-200 text-navy-600"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setShowAddPayment(true)}
                  className="flex items-center gap-1.5 text-sm text-emerald-700 font-medium hover:text-emerald-800"
                >
                  <Plus className="w-4 h-4" />
                  Registrar Pago
                </button>
              )}
            </div>
          </div>
        )}

        {/* Commission Detail (expandable) */}
        {showCommission && sale.commission_amount != null && sale.commission_amount > 0 && (
          <div className="mt-3 pt-3 border-t border-navy-100">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
              <div className="p-2.5 bg-blue-50 rounded-lg">
                <p className="text-xs text-blue-600 mb-0.5">Encontro al cliente</p>
                <p className="font-medium text-navy-900">{sale.found_by_name || '—'}</p>
                {sale.commission_found_by != null && sale.commission_found_by > 0 && (
                  <p className="text-emerald-600 font-semibold">${sale.commission_found_by.toLocaleString()}</p>
                )}
              </div>
              <div className="p-2.5 bg-emerald-50 rounded-lg">
                <p className="text-xs text-emerald-600 mb-0.5">Cerro la venta</p>
                <p className="font-medium text-navy-900">{sale.sold_by_name || '—'}</p>
                {sale.commission_sold_by != null && sale.commission_sold_by > 0 && (
                  <p className="text-emerald-600 font-semibold">${sale.commission_sold_by.toLocaleString()}</p>
                )}
              </div>
              <div className="p-2.5 bg-gold-50 rounded-lg">
                <p className="text-xs text-gold-600 mb-0.5">Total Comision</p>
                <p className="font-bold text-navy-900">${sale.commission_amount.toLocaleString()}</p>
                <p className="text-xs text-navy-500">
                  {sale.sale_type === 'rto' ? 'RTO' : 'Cash'}
                  {sale.found_by_employee_id && sale.sold_by_employee_id && sale.found_by_employee_id === sale.sold_by_employee_id
                    ? ' - 100% misma persona'
                    : sale.found_by_employee_id && sale.sold_by_employee_id
                    ? ' - 50/50'
                    : ''}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Documents (expandable) */}
        {showDocs && (
          <div className="mt-3 pt-3 border-t border-navy-100">
            {sale.sale_type === 'rto' ? (
              /* RTO: Redirect to Capital portal */
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                <h4 className="font-semibold text-purple-800 mb-2 flex items-center gap-2">
                  <Landmark className="w-4 h-4" />
                  Documentos RTO
                </h4>
                <p className="text-sm text-purple-600 mb-3">
                  Los documentos de esta venta RTO se gestionan desde el portal Capital.
                </p>
                <Link
                  href="/capital/applications"
                  className="text-sm text-purple-600 hover:text-purple-700 flex items-center gap-1 font-medium"
                >
                  Ir al portal Capital →
                </Link>
              </div>
            ) : (
              /* Contado: Direct sale docs */
              <div className="p-4 bg-navy-50 rounded-xl">
                <h4 className="font-semibold text-navy-800 mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Documentos de la Venta
                </h4>
                <p className="text-xs text-navy-500 mb-3">
                  Estos documentos se comparten con el cliente al realizar la compra.
                </p>
                <div className="space-y-2">
                  <DocRow
                    label="Bill of Sale"
                    description="Factura de compra-venta"
                    status={sale.status === 'completed' ? 'ready' : 'pending'}
                    saleId={sale.id}
                  />
                  <DocRow
                    label="Aplicacion Cambio de Titulo"
                    description="Formulario TDHCA"
                    status="template"
                    saleId={sale.id}
                  />
                  <DocRow
                    label="Titulo (TDHCA)"
                    description="Titulo de la propiedad"
                    status="pending"
                    saleId={sale.id}
                  />
                </div>
                {sale.property_id && (
                  <Link
                    href={`/homes/properties/${sale.property_id}`}
                    className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1 mt-3"
                  >
                    Ver documentos completos en propiedad →
                  </Link>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ========== MODALS ========== */}
      <ConfirmModal
        isOpen={showCancelModal}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleCancel}
        title="Cancelar Venta"
        message={
          <div>
            <p>Estas seguro de cancelar esta venta?</p>
            <div className="mt-3 p-3 bg-slate-50 rounded-lg">
              <p className="font-medium text-navy-900">${sale.sale_price.toLocaleString()}</p>
              <p className="text-sm text-navy-500 mt-1">{sale.property_address}</p>
            </div>
            <p className="mt-3 text-sm text-red-600">
              La propiedad volvera a estar disponible para la venta.
            </p>
          </div>
        }
        confirmText="Cancelar Venta"
        variant="danger"
      />
    </>
  )
}

function BankField({ label, value, onCopy }: { label: string; value: string; onCopy: (v: string, l: string) => void }) {
  return (
    <div className="flex items-center justify-between p-2 bg-white rounded-lg">
      <div>
        <p className="text-xs text-blue-500">{label}</p>
        <p className="font-medium text-navy-900">{value}</p>
      </div>
      <button
        onClick={() => onCopy(value, label)}
        className="p-1.5 hover:bg-blue-100 rounded-lg transition-colors"
        title="Copiar"
      >
        <Copy className="w-3.5 h-3.5 text-blue-500" />
      </button>
    </div>
  )
}

function DocRow({ label, description, status, saleId }: { label: string; description: string; status: 'ready' | 'pending' | 'template'; saleId: string }) {
  return (
    <div className="flex items-center gap-3 p-2.5 bg-white rounded-lg">
      <FileText className="w-4 h-4 text-navy-400 flex-shrink-0" />
      <div className="flex-1">
        <p className="text-sm font-medium text-navy-900">{label}</p>
        <p className="text-xs text-navy-400">{description}</p>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full ${
        status === 'ready'
          ? 'bg-emerald-100 text-emerald-700'
          : status === 'template'
          ? 'bg-blue-100 text-blue-700'
          : 'bg-amber-100 text-amber-700'
      }`}>
        {status === 'ready' ? 'Listo' : status === 'template' ? 'Template' : 'Pendiente'}
      </span>
    </div>
  )
}
