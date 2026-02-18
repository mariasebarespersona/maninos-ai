'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  User, Home, FileText, Clock, CheckCircle, AlertCircle,
  XCircle, LogOut, Phone, Mail, MapPin, Loader2,
  DollarSign, TrendingUp, ShieldCheck, ArrowRight, MessageCircle,
  Bell, CreditCard, CalendarClock, AlertTriangle,
  Banknote, Building2, Copy, X, CheckCheck,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

interface Sale {
  id: string
  property_id: string
  sale_type: 'contado' | 'rto'
  sale_price: number
  status: string
  payment_method: string
  rto_contract_id?: string
  rto_monthly_payment?: number
  rto_term_months?: number
  rto_notes?: string
  created_at: string
  completed_at: string
  properties: {
    address: string
    city: string
    state: string
    photos: string[]
  }
  title_transfers?: {
    id: string
    status: string
    transfer_date: string
  }[]
}

interface Payment {
  id: string
  payment_number: number
  amount: number
  due_date: string
  paid_date?: string
  paid_amount?: number
  payment_method?: string
  payment_reference?: string
  status: string
  late_fee_amount?: number
  rto_contract_id: string
  property_address: string
  property_city: string
  client_payment_method?: string
  client_reported_at?: string
}

interface PaymentAlert {
  type: 'overdue' | 'upcoming'
  severity: 'error' | 'warning'
  title: string
  message: string
}

interface PaymentSummary {
  total_payments: number
  payments_made: number
  payments_upcoming: number
  payments_overdue: number
  total_paid: number
  total_expected: number
  remaining_balance: number
  total_late_fees: number
  percentage_complete: number
}

export default function ClientDashboard() {
  const { client, loading: authLoading, error: authError, signOut } = useClientAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [kycRequested, setKycRequested] = useState(false)
  const [kycVerified, setKycVerified] = useState(false)

  // Payments state
  const [payments, setPayments] = useState<Payment[]>([])
  const [paymentAlerts, setPaymentAlerts] = useState<PaymentAlert[]>([])
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null)
  const [hasRto, setHasRto] = useState(false)
  const [paymentsLoading, setPaymentsLoading] = useState(true)

  // Active tab for main section
  const [activeTab, setActiveTab] = useState<'purchases' | 'payments'>('purchases')

  // Payment modal state
  const [payModalPayment, setPayModalPayment] = useState<Payment | null>(null)
  const [payModalStep, setPayModalStep] = useState<'choose' | 'cash' | 'transfer' | 'success'>('choose')
  const [payModalLoading, setPayModalLoading] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  useEffect(() => {
    if (client) {
      fetchClientSales(client.id)
      fetchKycStatus(client.id)
      fetchPayments(client.id)
    }
  }, [client])

  const fetchKycStatus = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/kyc-status`)
      const data = await res.json()
      if (data.ok) {
        setKycRequested(data.kyc_requested || false)
        setKycVerified(data.kyc_verified || false)
      }
    } catch (err) { console.error('Error fetching KYC status:', err) }
  }

  const fetchClientSales = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/purchases`)
      const data = await res.json()
      if (data.ok) setSales(data.purchases || [])
    } catch (error) { console.error('Error:', error) }
    finally { setSalesLoading(false) }
  }

  const fetchPayments = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/payments`)
      const data = await res.json()
      if (data.ok) {
        setHasRto(data.has_rto || false)
        setPayments(data.payments || [])
        setPaymentAlerts(data.alerts || [])
        setPaymentSummary(data.summary || null)
      }
    } catch (error) { console.error('Error fetching payments:', error) }
    finally { setPaymentsLoading(false) }
  }

  const handleLogout = async () => {
    await signOut()
    toast.info('Sesión cerrada')
  }

  const openPayModal = (pmt: Payment) => {
    setPayModalPayment(pmt)
    setPayModalStep('choose')
    setPayModalLoading(false)
    setCopiedField(null)
  }

  const closePayModal = () => {
    setPayModalPayment(null)
    setPayModalStep('choose')
    setPayModalLoading(false)
  }

  const handleReportPayment = async (method: 'cash_office' | 'bank_transfer') => {
    if (!payModalPayment || !client) return
    setPayModalLoading(true)
    try {
      const res = await fetch(
        `/api/public/clients/${client.id}/payments/${payModalPayment.id}/report`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ payment_method: method }),
        }
      )
      const data = await res.json()
      if (data.ok) {
        setPayModalStep('success')
        toast.success(data.message || '¡Pago reportado!')
        // Refresh payments list
        setTimeout(() => {
          fetchPayments(client.id)
        }, 1500)
      } else {
        toast.error(data.error || 'Error al reportar el pago')
        setPayModalLoading(false)
      }
    } catch (err) {
      console.error('Error reporting payment:', err)
      toast.error('Error de conexión')
      setPayModalLoading(false)
    }
  }

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const getStatusBadge = (sale: Sale) => {
    const badges: Record<string, { bg: string; text: string; icon: typeof CheckCircle; label: string }> = {
      paid: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle, label: 'Pagado' },
      completed: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle, label: 'Pagado' },
      rto_pending: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock, label: 'En revisión' },
      rto_approved: { bg: 'bg-blue-50', text: 'text-blue-700', icon: CheckCircle, label: 'Aprobado' },
      rto_active: { bg: 'bg-purple-50', text: 'text-purple-700', icon: CheckCircle, label: 'RTO Activo' },
      pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: Clock, label: 'Pendiente' },
      cancelled: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle, label: 'Denegada' },
    }
    const badge = badges[sale.status]
    if (!badge) return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{sale.status}</span>
    const Icon = badge.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" /> {badge.label}
      </span>
    )
  }

  const getPaymentStatusBadge = (status: string) => {
    const map: Record<string, { bg: string; text: string; label: string }> = {
      paid: { bg: 'bg-green-50', text: 'text-green-700', label: 'Pagado' },
      scheduled: { bg: 'bg-gray-50', text: 'text-gray-600', label: 'Programado' },
      pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', label: 'Pendiente' },
      late: { bg: 'bg-red-50', text: 'text-red-700', label: 'Vencido' },
      partial: { bg: 'bg-orange-50', text: 'text-orange-700', label: 'Parcial' },
      client_reported: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Reportado' },
    }
    const badge = map[status] || { bg: 'bg-gray-50', text: 'text-gray-600', label: status }
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    )
  }

  if (authLoading || (client && salesLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-400">Cargando tu cuenta…</p>
      </div>
    )
  }

  if (!client) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md text-center p-8">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-[20px] font-bold text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>No encontramos tu cuenta</h1>
            <p className="text-[15px] text-[#717171] mb-6">{authError}</p>
            <div className="flex flex-col gap-2">
              <Link href="/clientes/casas" className="px-6 py-3 rounded-xl bg-[#222] text-white font-semibold text-[14px] text-center">
                Ver casas disponibles
              </Link>
              <button onClick={async () => { await signOut() }} className="px-6 py-3 rounded-xl border border-gray-300 text-[14px] font-medium text-center hover:bg-gray-50">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  const hasActiveRtoSales = sales.some(s => s.sale_type === 'rto' && s.status !== 'cancelled')

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HEADER ── */}
      <section className="bg-white border-b border-gray-200 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#004274] flex items-center justify-center text-white font-bold text-[18px]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>
                  Hola, {client.name.split(' ')[0]}
                </h1>
                <p className="text-[13px] text-[#717171]">{client.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#717171] hover:text-[#222] hover:bg-gray-100 transition-colors text-[13px]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-8">

        {/* ═══════════ ALERTS ═══════════ */}
        {paymentAlerts.length > 0 && (
          <div className="mb-6 space-y-3">
            {paymentAlerts.map((alert, i) => (
              <div
                key={i}
                className={`rounded-xl p-4 flex items-start gap-3 border ${
                  alert.severity === 'error'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
                }`}
              >
                {alert.severity === 'error' ? (
                  <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                ) : (
                  <Bell className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <h3 className={`font-bold text-[14px] ${alert.severity === 'error' ? 'text-red-700' : 'text-amber-700'}`} style={{ letterSpacing: '-0.015em' }}>
                    {alert.title}
                  </h3>
                  <p className={`text-[13px] mt-0.5 ${alert.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}>
                    {alert.message}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══════════ KYC BANNER ═══════════ */}
        {kycRequested && !kycVerified && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[#004274] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#222] text-[14px]" style={{ letterSpacing: '-0.015em' }}>Verificación de Identidad Requerida</h3>
                <p className="text-[12px] text-[#484848]">Maninos Capital necesita que verifiques tu identidad.</p>
              </div>
            </div>
            <Link
              href="/clientes/mi-cuenta/verificacion"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[#004274] hover:bg-[#00233d] transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Verificar <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ═══════════ MAIN CONTENT ═══════════ */}
          <div className="lg:col-span-2 space-y-6">

            {/* Tabs */}
            {hasActiveRtoSales && (
              <div className="flex gap-1 bg-white rounded-xl border border-gray-200 p-1">
                <button
                  onClick={() => setActiveTab('purchases')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[14px] font-semibold transition-colors ${
                    activeTab === 'purchases'
                      ? 'bg-[#004274] text-white'
                      : 'text-[#717171] hover:text-[#222] hover:bg-gray-50'
                  }`}
                >
                  <Home className="w-4 h-4" /> Mis Compras
                </button>
                <button
                  onClick={() => setActiveTab('payments')}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-[14px] font-semibold transition-colors relative ${
                    activeTab === 'payments'
                      ? 'bg-[#004274] text-white'
                      : 'text-[#717171] hover:text-[#222] hover:bg-gray-50'
                  }`}
                >
                  <CreditCard className="w-4 h-4" /> Mis Pagos
                  {paymentAlerts.some(a => a.severity === 'error') && (
                    <span className="absolute top-1.5 right-3 w-2 h-2 rounded-full bg-red-500" />
                  )}
                </button>
              </div>
            )}

            {/* Purchases Tab */}
            {activeTab === 'purchases' && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                  <Home className="w-5 h-5 text-[#717171]" />
                  <h2 className="font-bold text-[16px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>Mis Compras</h2>
                </div>

                {sales.length === 0 ? (
                  <div className="p-10 text-center">
                    <Home className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                    <h3 className="font-bold text-[16px] text-[#222] mb-1" style={{ letterSpacing: '-0.015em' }}>No tienes compras aún</h3>
                    <p className="text-[14px] text-[#717171] mb-4">Explora nuestro catálogo y encuentra tu casa ideal</p>
                    <Link href="/clientes/casas" className="text-[13px] font-semibold text-[#004274] hover:underline inline-flex items-center gap-1">
                      Ver casas disponibles <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {sales.map(sale => (
                      <div key={sale.id} className="p-5">
                        <div className="flex flex-col sm:flex-row gap-4">
                          {/* Photo */}
                          <div className="w-full sm:w-24 h-36 sm:h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                            {sale.properties?.photos?.[0] ? (
                              <img src={sale.properties.photos[0]} alt={sale.properties.address} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center"><Home className="w-8 h-8 text-gray-300" /></div>
                            )}
                          </div>

                          {/* Details */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <div className="min-w-0">
                                <h3 className="font-semibold text-[14px] text-[#222] truncate" style={{ letterSpacing: '-0.01em' }}>{sale.properties?.address}</h3>
                                <p className="text-[12px] text-[#717171] flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {sale.properties?.city || 'Texas'}, {sale.properties?.state || 'TX'}
                                </p>
                              </div>
                              {getStatusBadge(sale)}
                            </div>

                            <div className="flex items-center gap-4 text-[13px] mt-2 flex-wrap">
                              <span className="text-[#717171]">Precio: <strong className="text-[#222] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>${sale.sale_price?.toLocaleString()}</strong></span>
                              <span className="text-[#717171]">Tipo: <strong className={`font-semibold ${sale.sale_type === 'rto' ? 'text-[#004274]' : 'text-green-600'}`}>{sale.sale_type === 'rto' ? 'Dueño a dueño RTO' : 'Contado'}</strong></span>
                              <span className="text-[#b0b0b0] text-[12px]">{new Date(sale.completed_at || sale.created_at).toLocaleDateString()}</span>
                            </div>

                            {/* Denial message */}
                            {sale.status === 'cancelled' && (
                              <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
                                <div className="flex items-start gap-2">
                                  <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="font-semibold text-[13px] text-red-700">Solicitud denegada</p>
                                    <p className="text-[12px] text-red-600 mt-0.5">{sale.rto_notes || 'Tu solicitud no fue aprobada.'}</p>
                                    <Link href="/clientes/casas" className="text-[12px] font-medium text-red-700 underline mt-1 inline-block">
                                      Ver casas disponibles
                                    </Link>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* RTO info */}
                            {sale.sale_type === 'rto' && sale.rto_monthly_payment && sale.status !== 'cancelled' && (
                              <div className="mt-3 p-3 rounded-lg bg-blue-50 flex items-center justify-between">
                                <div className="flex items-center gap-2 text-[14px]">
                                  <DollarSign className="w-4 h-4 text-[#004274]" />
                                  <span className="text-[#484848]">Mensual:</span>
                                  <span className="font-semibold text-[#004274]" style={{ fontVariantNumeric: 'tabular-nums' }}>${sale.rto_monthly_payment?.toLocaleString()}/mes</span>
                                </div>
                                {sale.rto_term_months && <span className="text-[12px] text-[#717171]">{sale.rto_term_months} meses</span>}
                              </div>
                            )}

                            {/* Links */}
                            {sale.status !== 'cancelled' && (
                              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                                {sale.sale_type === 'rto' && (
                                  <Link href={`/clientes/mi-cuenta/rto/${sale.id}`} className="text-[12px] font-semibold text-[#004274] hover:underline flex items-center gap-1">
                                    <TrendingUp className="w-3.5 h-3.5" /> Ver contrato RTO
                                  </Link>
                                )}
                                {sale.status === 'paid' && (
                                  <Link href={`/clientes/mi-cuenta/documentos?sale=${sale.id}`} className="text-[12px] font-semibold text-[#717171] hover:underline flex items-center gap-1">
                                    <FileText className="w-3.5 h-3.5" /> Ver documentos
                                  </Link>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Payments Tab */}
            {activeTab === 'payments' && (
              <div className="space-y-6">

                {/* Payment Summary */}
                {paymentSummary && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-[12px] text-[#717171] mb-1">Total pagado</p>
                      <p className="text-[18px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${paymentSummary.total_paid.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-[12px] text-[#717171] mb-1">Saldo pendiente</p>
                      <p className="text-[18px] font-bold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                        ${paymentSummary.remaining_balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-[12px] text-[#717171] mb-1">Pagos realizados</p>
                      <p className="text-[18px] font-bold text-[#004274]">
                        {paymentSummary.payments_made}/{paymentSummary.total_payments}
                      </p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-200 p-4">
                      <p className="text-[12px] text-[#717171] mb-1">Progreso</p>
                      <div className="flex items-center gap-2">
                        <p className="text-[18px] font-bold text-[#004274]">{paymentSummary.percentage_complete}%</p>
                      </div>
                      <div className="mt-1.5 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-[#004274] rounded-full transition-all duration-500"
                          style={{ width: `${paymentSummary.percentage_complete}%` }}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment List */}
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                    <CreditCard className="w-5 h-5 text-[#717171]" />
                    <h2 className="font-bold text-[16px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>Historial de Pagos</h2>
                  </div>

                  {paymentsLoading ? (
                    <div className="p-10 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-gray-300 mx-auto" />
                    </div>
                  ) : !hasRto ? (
                    <div className="p-10 text-center">
                      <CreditCard className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                      <h3 className="font-bold text-[16px] text-[#222] mb-1">Sin pagos programados</h3>
                      <p className="text-[14px] text-[#717171]">Cuando tengas un contrato dueño a dueño RTO activo, tus pagos aparecerán aquí.</p>
                    </div>
                  ) : payments.length === 0 ? (
                    <div className="p-10 text-center">
                      <CheckCircle className="w-10 h-10 text-green-300 mx-auto mb-3" />
                      <h3 className="font-bold text-[16px] text-[#222] mb-1">¡Todo al día!</h3>
                      <p className="text-[14px] text-[#717171]">No tienes pagos pendientes.</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {payments.slice(0, 20).map(pmt => {
                        const isOverdue = pmt.status === 'late' || (pmt.status === 'scheduled' && pmt.due_date && new Date(pmt.due_date) < new Date())
                        const isPayable = ['scheduled', 'pending', 'late', 'partial'].includes(pmt.status)
                        const isReported = pmt.status === 'client_reported'
                        return (
                          <div key={pmt.id} className={`px-5 py-4 ${isOverdue ? 'bg-red-50/50' : isReported ? 'bg-blue-50/30' : ''}`}>
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                                  pmt.status === 'paid' ? 'bg-green-100' :
                                  isReported ? 'bg-blue-100' :
                                  isOverdue ? 'bg-red-100' :
                                  'bg-gray-100'
                                }`}>
                                  {pmt.status === 'paid' ? (
                                    <CheckCircle className="w-4 h-4 text-green-600" />
                                  ) : isReported ? (
                                    <CheckCheck className="w-4 h-4 text-blue-600" />
                                  ) : isOverdue ? (
                                    <AlertTriangle className="w-4 h-4 text-red-500" />
                                  ) : (
                                    <CalendarClock className="w-4 h-4 text-gray-400" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className="font-semibold text-[14px] text-[#222]" style={{ letterSpacing: '-0.01em' }}>
                                      Pago #{pmt.payment_number}
                                    </p>
                                    {getPaymentStatusBadge(isOverdue && pmt.status !== 'paid' && !isReported ? 'late' : pmt.status)}
                                  </div>
                                  <p className="text-[12px] text-[#717171] truncate">
                                    {pmt.property_address && `${pmt.property_address}, `}{pmt.property_city || ''}
                                    {pmt.due_date && ` · Vence: ${new Date(pmt.due_date).toLocaleDateString('es-MX')}`}
                                  </p>
                                  {isReported && (
                                    <p className="text-[11px] text-blue-600 mt-0.5 flex items-center gap-1">
                                      <CheckCheck className="w-3 h-3" />
                                      Reportado {pmt.client_reported_at ? new Date(pmt.client_reported_at).toLocaleDateString('es-MX') : ''} · Esperando confirmación
                                    </p>
                                  )}
                                </div>
                              </div>
                              <div className="text-right flex-shrink-0 flex items-center gap-3">
                                <div>
                                  <p className="font-bold text-[15px] text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                                    ${pmt.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                  </p>
                                  {pmt.status === 'paid' && pmt.paid_date && (
                                    <p className="text-[11px] text-green-600">
                                      Pagado {new Date(pmt.paid_date).toLocaleDateString('es-MX')}
                                    </p>
                                  )}
                                  {pmt.late_fee_amount && pmt.late_fee_amount > 0 && (
                                    <p className="text-[11px] text-red-500">
                                      + ${pmt.late_fee_amount.toLocaleString()} mora
                                    </p>
                                  )}
                                </div>
                                {isPayable && (
                                  <button
                                    onClick={() => openPayModal(pmt)}
                                    className="px-3 py-1.5 rounded-lg bg-[#004274] hover:bg-[#00233d] text-white text-[12px] font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap"
                                  >
                                    <Banknote className="w-3.5 h-3.5" />
                                    Pagar
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                      {payments.length > 20 && (
                        <div className="px-5 py-3 text-center">
                          <p className="text-[12px] text-[#717171]">Mostrando los primeros 20 pagos de {payments.length} totales.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* ═══════════ SIDEBAR ═══════════ */}
          <div className="space-y-4">

            {/* Profile */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-4" style={{ letterSpacing: '-0.015em' }}>Mi Información</h2>
              <div className="space-y-3">
                {[
                  { icon: User, label: client.name },
                  { icon: Mail, label: client.email },
                  ...(client.phone ? [{ icon: Phone, label: client.phone }] : []),
                  ...(client.terreno ? [{ icon: MapPin, label: client.terreno }] : []),
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-[#b0b0b0]" />
                    <span className="text-[14px] text-[#484848] truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Help */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>¿Necesitas ayuda?</h2>
              <p className="text-[12px] text-[#717171] mb-4">Estamos aquí para ayudarte.</p>
              <div className="space-y-2">
                <a
                  href="tel:+19362005200"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[13px] font-semibold text-[#222] border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <Phone className="w-4 h-4" /> Conroe: (936) 200-5200
                </a>
                <a
                  href="https://api.whatsapp.com/send?phone=+19362005200&text=Hola!%20Tengo%20una%20pregunta"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors"
                  style={{ background: '#25d366' }}
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>Enlaces rápidos</h2>
              <div className="space-y-1">
                {[
                  { href: '/clientes/casas', icon: Home, label: 'Ver más casas' },
                  { href: '/clientes/mi-cuenta/estado-de-cuenta', icon: DollarSign, label: 'Estado de cuenta' },
                  { href: '/clientes/mi-cuenta/documentos', icon: FileText, label: 'Mis documentos' },
                ].map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 p-2.5 rounded-lg text-[14px] text-[#484848] hover:bg-gray-50 hover:text-[#222] transition-colors group"
                  >
                    <link.icon className="w-4 h-4 text-gray-400 group-hover:text-[#004274]" />
                    {link.label}
                    <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════ PAYMENT MODAL ═══════════ */}
      {payModalPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closePayModal} />

          {/* Modal */}
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="sticky top-0 bg-white rounded-t-2xl px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between z-10">
              <div>
                <h2 className="font-bold text-[18px] text-[#222]" style={{ letterSpacing: '-0.02em' }}>
                  {payModalStep === 'success' ? '¡Pago reportado!' : 'Realizar Pago'}
                </h2>
                <p className="text-[13px] text-[#717171] mt-0.5">
                  Pago #{payModalPayment.payment_number} · ${payModalPayment.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <button onClick={closePayModal} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
                <X className="w-5 h-5 text-[#717171]" />
              </button>
            </div>

            <div className="px-6 py-5">

              {/* ── STEP: CHOOSE METHOD ── */}
              {payModalStep === 'choose' && (
                <div className="space-y-3">
                  <p className="text-[14px] text-[#484848] mb-4">¿Cómo deseas pagar?</p>

                  {/* Cash at office */}
                  <button
                    onClick={() => setPayModalStep('cash')}
                    className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-[#004274] hover:bg-blue-50/30 transition-all text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-green-50 flex items-center justify-center flex-shrink-0 group-hover:bg-green-100 transition-colors">
                        <Banknote className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <p className="font-semibold text-[15px] text-[#222]">Efectivo en oficina</p>
                        <p className="text-[13px] text-[#717171] mt-0.5">Paga directamente en cualquiera de nuestras oficinas</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#004274] ml-auto flex-shrink-0 transition-colors" />
                    </div>
                  </button>

                  {/* Bank transfer */}
                  <button
                    onClick={() => setPayModalStep('transfer')}
                    className="w-full p-4 rounded-xl border-2 border-gray-200 hover:border-[#004274] hover:bg-blue-50/30 transition-all text-left group"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-100 transition-colors">
                        <Building2 className="w-6 h-6 text-[#004274]" />
                      </div>
                      <div>
                        <p className="font-semibold text-[15px] text-[#222]">Transferencia bancaria</p>
                        <p className="text-[13px] text-[#717171] mt-0.5">Transfiere a la cuenta de Maninos Capital</p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#004274] ml-auto flex-shrink-0 transition-colors" />
                    </div>
                  </button>
                </div>
              )}

              {/* ── STEP: CASH AT OFFICE ── */}
              {payModalStep === 'cash' && (
                <div className="space-y-5">
                  <div className="bg-green-50 rounded-xl p-4 border border-green-100">
                    <div className="flex items-center gap-3 mb-3">
                      <Banknote className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-[15px] text-green-800">Pago en efectivo</h3>
                    </div>
                    <p className="text-[13px] text-green-700 leading-relaxed">
                      Visita cualquiera de nuestras oficinas y realiza tu pago en efectivo. Un miembro del equipo te atenderá.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[13px] text-[#222] mb-3 uppercase tracking-wide">Nuestras oficinas</h4>
                    <div className="space-y-2">
                      {[
                        { city: 'Conroe', address: 'Conroe, TX', phone: '(936) 200-5200' },
                        { city: 'Houston', address: 'Houston, TX', phone: '(713) 555-0100' },
                        { city: 'Dallas', address: 'Dallas, TX', phone: '(469) 555-0100' },
                      ].map(office => (
                        <div key={office.city} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 border border-gray-100">
                          <div>
                            <p className="font-semibold text-[13px] text-[#222]">{office.city}</p>
                            <p className="text-[12px] text-[#717171]">{office.address}</p>
                          </div>
                          <a href={`tel:${office.phone.replace(/\D/g, '')}`} className="text-[12px] text-[#004274] font-semibold hover:underline">
                            {office.phone}
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[12px] text-amber-700">
                      <strong>Importante:</strong> Después de pagar, presiona &quot;Ya he pagado&quot; para notificar a Maninos. Tu pago será confirmado por nuestro equipo.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setPayModalStep('choose')}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-[#484848] hover:bg-gray-50 transition-colors"
                    >
                      ← Atrás
                    </button>
                    <button
                      onClick={() => handleReportPayment('cash_office')}
                      disabled={payModalLoading}
                      className="flex-1 py-3 rounded-xl bg-[#004274] hover:bg-[#00233d] text-white text-[14px] font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payModalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Ya he pagado
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP: BANK TRANSFER ── */}
              {payModalStep === 'transfer' && (
                <div className="space-y-5">
                  <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
                    <div className="flex items-center gap-3 mb-3">
                      <Building2 className="w-5 h-5 text-[#004274]" />
                      <h3 className="font-semibold text-[15px] text-[#004274]">Transferencia bancaria</h3>
                    </div>
                    <p className="text-[13px] text-blue-700 leading-relaxed">
                      Transfiere el monto exacto a la siguiente cuenta bancaria.
                    </p>
                  </div>

                  <div>
                    <h4 className="font-semibold text-[13px] text-[#222] mb-3 uppercase tracking-wide">Datos bancarios</h4>
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                      {[
                        { label: 'Banco', value: 'Chase Bank' },
                        { label: 'Nombre de la cuenta', value: 'Maninos Capital LLC' },
                        { label: 'Número de cuenta', value: '000123456789' },
                        { label: 'Routing Number', value: '021000021' },
                        { label: 'Tipo de cuenta', value: 'Business Checking' },
                        { label: 'Monto a transferir', value: `$${payModalPayment.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` },
                        { label: 'Referencia', value: `Pago #${payModalPayment.payment_number}` },
                      ].map((item, i) => (
                        <div key={item.label} className={`flex items-center justify-between px-4 py-3 ${i > 0 ? 'border-t border-gray-100' : ''}`}>
                          <span className="text-[12px] text-[#717171]">{item.label}</span>
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-semibold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{item.value}</span>
                            <button
                              onClick={() => copyToClipboard(item.value, item.label)}
                              className="p-1 rounded hover:bg-gray-100 transition-colors"
                              title="Copiar"
                            >
                              {copiedField === item.label ? (
                                <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5 text-gray-400" />
                              )}
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <p className="text-[12px] text-amber-700">
                      <strong>Importante:</strong> Después de realizar la transferencia, presiona &quot;Ya he pagado&quot; para notificar a Maninos. La confirmación puede tardar 1-2 días hábiles.
                    </p>
                  </div>

                  <div className="flex gap-3 pt-2">
                    <button
                      onClick={() => setPayModalStep('choose')}
                      className="flex-1 py-3 rounded-xl border border-gray-200 text-[14px] font-semibold text-[#484848] hover:bg-gray-50 transition-colors"
                    >
                      ← Atrás
                    </button>
                    <button
                      onClick={() => handleReportPayment('bank_transfer')}
                      disabled={payModalLoading}
                      className="flex-1 py-3 rounded-xl bg-[#004274] hover:bg-[#00233d] text-white text-[14px] font-semibold transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {payModalLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                      Ya he pagado
                    </button>
                  </div>
                </div>
              )}

              {/* ── STEP: SUCCESS ── */}
              {payModalStep === 'success' && (
                <div className="text-center py-4">
                  <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                    <CheckCircle className="w-8 h-8 text-green-600" />
                  </div>
                  <h3 className="font-bold text-[18px] text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>
                    ¡Pago reportado con éxito!
                  </h3>
                  <p className="text-[14px] text-[#717171] mb-1">
                    Pago #{payModalPayment.payment_number} — ${payModalPayment.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </p>
                  <p className="text-[13px] text-[#717171] mb-6">
                    Nuestro equipo confirmará tu pago pronto.
                  </p>
                  <button
                    onClick={closePayModal}
                    className="px-8 py-3 rounded-xl bg-[#004274] hover:bg-[#00233d] text-white text-[14px] font-semibold transition-colors"
                  >
                    Entendido
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
