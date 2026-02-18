'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Loader2, DollarSign, TrendingUp, AlertTriangle,
  CheckCircle, Clock, FileText, Home, CreditCard, BarChart3,
  AlertCircle, ShoppingBag,
} from 'lucide-react'
import { useClientAuth } from '@/hooks/useClientAuth'

interface ContractStatement {
  contract_id: string
  status: string
  property_address: string
  property_city: string
  purchase_price: number
  down_payment: number
  monthly_rent: number
  term_months: number
  interest_rate: number | null
  start_date: string
  end_date: string
  total_expected: number
  total_paid: number
  remaining_balance: number
  total_late_fees: number
  total_overdue: number
  payments_made: number
  payments_total: number
  payments_overdue: number
  completion_pct: number
}

interface AccountStatement {
  client: {
    id: string
    name: string
    email: string
    phone?: string
    kyc_verified: boolean
  }
  summary: {
    total_contracts: number
    active_contracts: number
    total_purchases: number
    total_owed: number
    total_paid: number
    remaining_balance: number
    total_late_fees: number
    total_overdue: number
  }
  payment_health: {
    on_time_payments: number
    late_payments: number
    on_time_rate: number
    health_score: 'excellent' | 'good' | 'fair' | 'poor'
  }
  contracts: ContractStatement[]
}

const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

const healthConfig = {
  excellent: { color: 'text-green-700', bg: 'bg-green-50', label: 'Excelente', icon: CheckCircle },
  good: { color: 'text-blue-700', bg: 'bg-blue-50', label: 'Bueno', icon: TrendingUp },
  fair: { color: 'text-amber-700', bg: 'bg-amber-50', label: 'Regular', icon: Clock },
  poor: { color: 'text-red-700', bg: 'bg-red-50', label: 'En riesgo', icon: AlertTriangle },
}

export default function AccountStatementPage() {
  const { client, loading: authLoading, error: authError } = useClientAuth()
  const [statement, setStatement] = useState<AccountStatement | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return
    if (client) {
      fetchStatement(client.id)
    } else {
      // No client found — stop loading
      setLoading(false)
    }
  }, [client, authLoading])

  const fetchStatement = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/account-statement`)
      const data = await res.json()
      if (data.ok) {
        setStatement(data)
      } else {
        setFetchError(data.error || 'No se pudo cargar el estado de cuenta')
      }
    } catch (err) {
      console.error('Error fetching account statement:', err)
      setFetchError('Error de conexión al cargar el estado de cuenta')
    } finally {
      setLoading(false)
    }
  }

  // Loading states
  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-[13px] text-[#717171]">Cargando estado de cuenta…</p>
      </div>
    )
  }

  // Auth error — no client record
  if (!client) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" />
              Volver a Mi Cuenta
            </Link>
            <h1 className="text-[22px] font-bold text-[#222] flex items-center gap-3" style={{ letterSpacing: '-0.02em' }}>
              <FileText className="w-6 h-6 text-[#004274]" />
              Estado de Cuenta
            </h1>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="font-bold text-[18px] text-[#222] mb-2">No encontramos tu cuenta</h3>
            <p className="text-[14px] text-[#717171] mb-6">
              {authError || 'Necesitas tener una cuenta de cliente para ver tu estado de cuenta.'}
            </p>
            <Link href="/clientes/casas" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#004274] text-white font-semibold text-[14px] hover:bg-[#00233d] transition-colors">
              <Home className="w-4 h-4" />
              Ver casas disponibles
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // Fetch error
  if (fetchError && !statement) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" />
              Volver a Mi Cuenta
            </Link>
            <h1 className="text-[22px] font-bold text-[#222] flex items-center gap-3" style={{ letterSpacing: '-0.02em' }}>
              <FileText className="w-6 h-6 text-[#004274]" />
              Estado de Cuenta
            </h1>
            <p className="text-[14px] text-[#717171] mt-1">{client.name} · {client.email}</p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="font-bold text-[18px] text-[#222] mb-2">Error al cargar</h3>
            <p className="text-[14px] text-[#717171] mb-6">{fetchError}</p>
            <button
              onClick={() => { setFetchError(null); setLoading(true); fetchStatement(client.id) }}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#222] text-white font-semibold text-[14px] hover:bg-black transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Empty state — client exists but no contracts/statement data
  if (!statement) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-6">
            <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-4">
              <ArrowLeft className="w-4 h-4" />
              Volver a Mi Cuenta
            </Link>
            <h1 className="text-[22px] font-bold text-[#222] flex items-center gap-3" style={{ letterSpacing: '-0.02em' }}>
              <FileText className="w-6 h-6 text-[#004274]" />
              Estado de Cuenta
            </h1>
            <p className="text-[14px] text-[#717171] mt-1">{client.name} · {client.email}</p>
          </div>
        </div>
        <div className="max-w-4xl mx-auto px-6 py-12">
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <ShoppingBag className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="font-bold text-[18px] text-[#222] mb-2">Sin movimientos aún</h3>
            <p className="text-[14px] text-[#717171] mb-6">
              Cuando compres una casa o tengas un contrato dueño a dueño RTO,<br className="hidden sm:inline" />
              tu estado de cuenta aparecerá aquí con todos los detalles.
            </p>
            <Link href="/clientes/casas" className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#004274] text-white font-semibold text-[14px] hover:bg-[#00233d] transition-colors">
              <Home className="w-4 h-4" />
              Explorar casas
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const s = statement.summary
  const h = statement.payment_health
  const hc = healthConfig[h.health_score] || healthConfig.good
  const HealthIcon = hc.icon

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Volver a Mi Cuenta
          </Link>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-[22px] font-bold text-[#222] flex items-center gap-3" style={{ letterSpacing: '-0.02em' }}>
                <FileText className="w-6 h-6 text-[#004274]" />
                Estado de Cuenta
              </h1>
              <p className="text-[14px] text-[#717171] mt-1">{statement.client.name} · {statement.client.email}</p>
            </div>
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${hc.bg}`}>
              <HealthIcon className={`w-4 h-4 ${hc.color}`} />
              <span className={`text-[13px] font-semibold ${hc.color}`}>{hc.label}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

        {/* Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-[#717171]" />
              <p className="text-[12px] text-[#717171]">Total pagado</p>
            </div>
            <p className="text-[20px] font-bold text-green-600" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.total_paid)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <CreditCard className="w-4 h-4 text-[#717171]" />
              <p className="text-[12px] text-[#717171]">Saldo pendiente</p>
            </div>
            <p className="text-[20px] font-bold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(s.remaining_balance)}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-[#717171]" />
              <p className="text-[12px] text-[#717171]">Vencido</p>
            </div>
            <p className={`text-[20px] font-bold ${s.total_overdue > 0 ? 'text-red-600' : 'text-[#222]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
              {fmt(s.total_overdue)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-[#717171]" />
              <p className="text-[12px] text-[#717171]">Puntualidad</p>
            </div>
            <p className={`text-[20px] font-bold ${hc.color}`}>{h.on_time_rate}%</p>
          </div>
        </div>

        {/* Payment Health Detail */}
        {(h.on_time_payments > 0 || h.late_payments > 0) && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h2 className="font-bold text-[15px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>Historial de Pagos</h2>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-[13px] text-[#484848]">A tiempo: <strong>{h.on_time_payments}</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-[13px] text-[#484848]">Con retraso: <strong>{h.late_payments}</strong></span>
              </div>
            </div>
            <div className="mt-3 h-2 bg-gray-100 rounded-full overflow-hidden flex">
              {h.on_time_payments > 0 && (
                <div className="h-full bg-green-500 rounded-l-full" style={{ width: `${h.on_time_rate}%` }} />
              )}
              {h.late_payments > 0 && (
                <div className="h-full bg-red-400 rounded-r-full" style={{ width: `${100 - h.on_time_rate}%` }} />
              )}
            </div>
            {s.total_late_fees > 0 && (
              <p className="text-[12px] text-red-500 mt-2">
                Total en cargos por mora: {fmt(s.total_late_fees)}
              </p>
            )}
          </div>
        )}

        {/* Contracts */}
        {statement.contracts.length > 0 ? (
          <div className="space-y-4">
            <h2 className="font-bold text-[16px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>Contratos</h2>
            {statement.contracts.map(c => {
              const statusLabel = c.status === 'active' ? 'Activo' : c.status === 'completed' ? 'Completado' : c.status
              const statusColor = c.status === 'active' ? 'text-blue-700 bg-blue-50' : c.status === 'completed' ? 'text-green-700 bg-green-50' : 'text-gray-700 bg-gray-50'
              return (
                <div key={c.contract_id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3 mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-[#e6f0f8] flex items-center justify-center">
                          <Home className="w-5 h-5 text-[#004274]" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-[15px] text-[#222]" style={{ letterSpacing: '-0.01em' }}>
                            {c.property_address}
                          </h3>
                          <p className="text-[12px] text-[#717171]">{c.property_city}</p>
                        </div>
                      </div>
                      <span className={`text-[11px] font-semibold px-2 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                    </div>

                    {/* Contract details grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl">
                      <div>
                        <p className="text-[11px] text-[#717171]">Precio de compra</p>
                        <p className="text-[14px] font-semibold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(c.purchase_price)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#717171]">Enganche</p>
                        <p className="text-[14px] font-semibold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(c.down_payment)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#717171]">Pago mensual</p>
                        <p className="text-[14px] font-semibold text-[#004274]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(c.monthly_rent)}</p>
                      </div>
                      <div>
                        <p className="text-[11px] text-[#717171]">Plazo</p>
                        <p className="text-[14px] font-semibold text-[#222]">{c.term_months} meses</p>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[12px] text-[#717171]">{c.payments_made} de {c.payments_total} pagos</span>
                        <span className="text-[12px] font-semibold text-[#004274]">{c.completion_pct}%</span>
                      </div>
                      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div className="h-full bg-[#004274] rounded-full transition-all" style={{ width: `${c.completion_pct}%` }} />
                      </div>
                    </div>

                    {/* Balance summary */}
                    <div className="mt-4 flex items-center justify-between text-[13px]">
                      <span className="text-[#717171]">Total pagado: <strong className="text-green-600">{fmt(c.total_paid)}</strong></span>
                      <span className="text-[#717171]">Saldo: <strong className="text-[#222]">{fmt(c.remaining_balance)}</strong></span>
                    </div>

                    {c.total_overdue > 0 && (
                      <div className="mt-2 p-2.5 bg-red-50 rounded-lg flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-red-500" />
                        <span className="text-[12px] text-red-600 font-medium">
                          {c.payments_overdue} pago(s) vencido(s) — {fmt(c.total_overdue)} pendiente
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-10 text-center">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <h3 className="font-bold text-[16px] text-[#222] mb-1">Sin contratos activos</h3>
            <p className="text-[14px] text-[#717171]">Cuando tengas un contrato dueño a dueño RTO, tu estado de cuenta aparecerá aquí.</p>
          </div>
        )}
      </div>
    </div>
  )
}

