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
} from 'lucide-react'

interface PaymentOrder {
  id: string
  property_id: string
  property_address: string
  status: 'pending' | 'completed' | 'cancelled'
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
  created_by: string | null
  completed_by: string | null
  completed_at: string | null
  created_at: string
}

interface BankAccount {
  id: string
  name: string
  bank_name: string
  current_balance: number
}

export default function NotificacionesPage() {
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'pending' | 'completed'>('pending')

  // Completion modal state
  const [completing, setCompleting] = useState<PaymentOrder | null>(null)
  const [completeForm, setCompleteForm] = useState({ reference: '', payment_date: '', bank_account_id: '' })
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [submitting, setSubmitting] = useState(false)

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/payment-orders?status=${activeTab}`)
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

  useEffect(() => { fetchOrders() }, [fetchOrders])

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
        setCompleting(null)
        fetchOrders()
      }
    } catch (e) {
      console.error('Error completing order:', e)
    } finally {
      setSubmitting(false)
    }
  }

  const formatCurrency = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
  const formatDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

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
              Ordenes de pago pendientes y realizadas
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white rounded-lg border p-1" style={{ borderColor: 'var(--sand)' }}>
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-md text-sm font-medium transition-colors ${
            activeTab === 'pending'
              ? 'bg-amber-50 text-amber-800 border border-amber-200'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          <Clock className="w-4 h-4" />
          Pendientes
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

      {/* Orders List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--slate)' }} />
        </div>
      ) : orders.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border" style={{ borderColor: 'var(--sand)' }}>
          <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-3">
            {activeTab === 'pending' ? <Clock className="w-6 h-6 text-gray-400" /> : <CheckCircle className="w-6 h-6 text-gray-400" />}
          </div>
          <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
            {activeTab === 'pending' ? 'No hay ordenes pendientes' : 'No hay ordenes completadas'}
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
            {activeTab === 'pending'
              ? 'Las ordenes de pago apareceran aqui cuando se cree una compra'
              : 'Las ordenes completadas apareceran aqui'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {orders.map(order => (
            <div
              key={order.id}
              className="bg-white rounded-xl border p-5 hover:shadow-sm transition-shadow"
              style={{ borderColor: 'var(--sand)' }}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  {/* Property + Amount */}
                  <div className="flex items-center gap-2 mb-2">
                    <Building2 className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--navy-600)' }} />
                    <span className="font-medium text-sm truncate" style={{ color: 'var(--ink)' }}>
                      {order.property_address || 'Propiedad'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 mb-3">
                    <span className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
                      {formatCurrency(order.amount)}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                      order.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'completed'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {order.status === 'pending' && <Clock className="w-3 h-3" />}
                      {order.status === 'completed' && <CheckCircle className="w-3 h-3" />}
                      {order.status === 'pending' ? 'Pendiente' : order.status === 'completed' ? 'Completado' : 'Cancelado'}
                    </span>
                  </div>

                  {/* Bank Details for Abigail */}
                  <div className="bg-gray-50 rounded-lg p-3 mb-2 space-y-1.5">
                    <div className="flex items-center gap-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                      <CreditCard className="w-4 h-4" />
                      {order.payee_name}
                    </div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                      {order.bank_name && (
                        <div><span className="font-medium">Banco:</span> {order.bank_name}</div>
                      )}
                      {order.account_type && (
                        <div><span className="font-medium">Tipo:</span> {order.account_type === 'checking' ? 'Checking' : 'Savings'}</div>
                      )}
                      {order.routing_number && (
                        <div><span className="font-medium">Routing #:</span> <span className="font-mono">{order.routing_number}</span></div>
                      )}
                      {order.account_number && (
                        <div><span className="font-medium">Account #:</span> <span className="font-mono">{order.account_number}</span></div>
                      )}
                      {!order.routing_number && order.routing_number_last4 && (
                        <div><span className="font-medium">Routing #:</span> ****{order.routing_number_last4}</div>
                      )}
                      {!order.account_number && order.account_number_last4 && (
                        <div><span className="font-medium">Account #:</span> ****{order.account_number_last4}</div>
                      )}
                      {order.payee_address && (
                        <div className="col-span-2"><span className="font-medium">Dir. beneficiario:</span> {order.payee_address}</div>
                      )}
                      {order.bank_address && (
                        <div className="col-span-2"><span className="font-medium">Dir. banco:</span> {order.bank_address}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: 'var(--slate)' }}>
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      Creado: {formatDate(order.created_at)}
                    </span>
                    {order.reference && (
                      <span className="flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Ref: {order.reference}
                      </span>
                    )}
                    {order.payment_date && (
                      <span>Pagado: {formatDate(order.payment_date)}</span>
                    )}
                  </div>
                </div>

                {/* Action */}
                {order.status === 'pending' && (
                  <button
                    onClick={() => openCompleteModal(order)}
                    className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                    style={{ backgroundColor: 'var(--navy-800)' }}
                    onMouseOver={e => (e.currentTarget.style.backgroundColor = 'var(--navy-700)')}
                    onMouseOut={e => (e.currentTarget.style.backgroundColor = 'var(--navy-800)')}
                  >
                    Completar Pago
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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

            {/* Order summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span style={{ color: 'var(--slate)' }}>Propiedad</span>
                <span className="font-medium" style={{ color: 'var(--ink)' }}>{completing.property_address || 'N/A'}</span>
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

            {/* Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>
                  Numero de confirmacion *
                </label>
                <input
                  type="text"
                  value={completeForm.reference}
                  onChange={e => setCompleteForm(prev => ({ ...prev, reference: e.target.value }))}
                  placeholder="Ingresa el # de confirmacion de la transferencia"
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
                    className="w-full p-3 border rounded-lg text-sm focus:ring-2 focus:ring-navy-500 focus:border-navy-500 bg-white"
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

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setCompleting(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
              >
                Cancelar
              </button>
              <button
                onClick={handleComplete}
                disabled={!completeForm.reference || submitting}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--navy-800)' }}
              >
                {submitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" /> Procesando...
                  </span>
                ) : (
                  'Confirmar Pago Realizado'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
