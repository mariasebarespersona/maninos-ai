'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, DollarSign, Calendar, Clock,
  CheckCircle, AlertCircle, Loader2, TrendingUp,
  FileText, Download, ExternalLink, Home
} from 'lucide-react'
import { useClientAuth } from '@/hooks/useClientAuth'

interface RTOContract {
  id: string
  monthly_rent: number
  purchase_price: number
  down_payment: number
  term_months: number
  start_date: string
  end_date: string
  payment_due_day: number
  status: string
  contract_pdf_url?: string | null
  properties: {
    address: string
    city: string
    state: string
    photos?: string[]
    square_feet?: number
  }
}

interface RTOPayment {
  id: string
  payment_number: number
  amount: number
  due_date: string
  paid_date: string | null
  paid_amount: number | null
  payment_method: string | null
  status: string
}

interface Progress {
  payments_made: number
  total_payments: number
  total_paid: number
  total_expected: number
  remaining_balance: number
  percentage: number
}

export default function ClientRTOPage() {
  const { saleId } = useParams()
  const { client, loading: authLoading, error: authError } = useClientAuth()
  const [contract, setContract] = useState<RTOContract | null>(null)
  const [payments, setPayments] = useState<RTOPayment[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (authLoading) return // Still loading auth, wait

    if (!client) {
      // Auth resolved but no client — stop loading
      setLoading(false)
      return
    }

    if (saleId) {
      loadRTOContract()
    } else {
      setLoading(false)
    }
  }, [client, saleId, authLoading])

  const loadRTOContract = async () => {
    setLoading(true)
    setFetchError(null)
    try {
      const res = await fetch(`/api/public/clients/${client!.id}/rto-contract/${saleId}`)
      const data = await res.json()
      if (data.ok) {
        setContract(data.contract)
        setPayments(data.payments || [])
        setProgress(data.progress)
        if (data.message) setMessage(data.message)
      } else {
        const errMsg = data.error || data.detail || 'No se pudo cargar el contrato'
        console.error('RTO contract load error:', errMsg)
        setFetchError(errMsg)
      }
    } catch (err) {
      console.error('Error loading RTO:', err)
      setFetchError('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  // ─── Loading state ───
  if (authLoading || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#004274] mx-auto mb-3" />
          <p className="text-[14px] text-[#717171]">Cargando tu contrato…</p>
        </div>
      </div>
    )
  }

  // ─── Auth error ───
  if (authError || !client) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
          </Link>
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2 className="text-[18px] font-bold text-[#222] mb-2">Error de autenticación</h2>
            <p className="text-[14px] text-[#717171]">
              {authError || 'No se pudo verificar tu sesión. Inicia sesión de nuevo.'}
            </p>
            <Link href="/clientes/login" className="inline-flex items-center gap-2 mt-4 px-6 py-3 rounded-xl bg-[#004274] text-white font-semibold text-[14px] hover:bg-[#003560] transition-colors">
              Iniciar sesión
            </Link>
          </div>
        </div>
      </div>
    )
  }

  // ─── Fetch error ───
  if (fetchError) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
          </Link>
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <AlertCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
            <h2 className="text-[18px] font-bold text-[#222] mb-2">Error al cargar</h2>
            <p className="text-[14px] text-[#717171] mb-4">{fetchError}</p>
            <button
              onClick={loadRTOContract}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-[#222] text-white font-semibold text-[14px] hover:bg-black transition-colors"
            >
              Reintentar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ─── Contract not yet created (solicitud en revisión) ───
  if (!contract) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-8">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
          </Link>
          <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
            <Clock className="w-10 h-10 text-amber-500 mx-auto mb-3" />
            <h2 className="text-[18px] font-bold text-[#222] mb-2">Solicitud en revisión</h2>
            <p className="text-[14px] text-[#717171]">
              {message || 'Tu solicitud Rent-to-Own está siendo procesada. Te notificaremos cuando el contrato esté listo.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ─── Contract data is available — render full view ───

  const statusLabels: Record<string, { color: string; bg: string; label: string }> = {
    draft: { color: 'text-gray-700', bg: 'bg-gray-100', label: 'En preparación' },
    pending_signature: { color: 'text-amber-700', bg: 'bg-amber-100', label: 'Pendiente de firma' },
    active: { color: 'text-[#004274]', bg: 'bg-blue-50', label: '✅ Activo' },
    completed: { color: 'text-green-700', bg: 'bg-green-100', label: '¡Pagos completados!' },
    delivered: { color: 'text-green-700', bg: 'bg-green-100', label: '🏠 ¡Casa entregada!' },
  }

  const paymentStatusStyles: Record<string, { color: string; bg: string; label: string }> = {
    scheduled: { color: 'text-gray-600', bg: 'bg-gray-100', label: 'Programado' },
    pending: { color: 'text-amber-600', bg: 'bg-amber-100', label: 'Pendiente' },
    paid: { color: 'text-green-600', bg: 'bg-green-100', label: 'Pagado' },
    late: { color: 'text-red-600', bg: 'bg-red-100', label: 'Atrasado' },
    partial: { color: 'text-orange-600', bg: 'bg-orange-100', label: 'Parcial' },
    client_reported: { color: 'text-blue-600', bg: 'bg-blue-100', label: 'Reportado' },
    waived: { color: 'text-cyan-600', bg: 'bg-cyan-100', label: 'Exonerado' },
    failed: { color: 'text-red-600', bg: 'bg-red-100', label: 'Fallido' },
  }

  const cs = statusLabels[contract.status] || statusLabels.active

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        {/* Back */}
        <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
        </Link>

        {/* Header Card */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
          {contract.properties?.photos?.[0] && (
            <div className="h-48 sm:h-56 overflow-hidden">
              <img
                src={contract.properties.photos[0]}
                alt={contract.properties.address}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div className="p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="text-[22px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>
                  Mi Contrato Rent-to-Own
                </h1>
                <p className="text-[14px] text-[#717171] mt-1 flex items-center gap-1.5">
                  <Home className="w-4 h-4" />
                  {contract.properties?.address}, {contract.properties?.city || 'TX'}
                </p>
              </div>
              <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-[13px] font-semibold ${cs.bg} ${cs.color}`}>
                {cs.label}
              </span>
            </div>

            {/* Contract PDF Download */}
            {contract.contract_pdf_url && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <a
                  href={contract.contract_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#004274] text-white font-semibold text-[14px] hover:bg-[#003560] transition-colors shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Descargar Contrato PDF
                  <ExternalLink className="w-3.5 h-3.5 opacity-60" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Progress (active contracts) */}
        {progress && contract.status === 'active' && (
          <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[#222] flex items-center gap-2 text-[16px]">
                <TrendingUp className="w-5 h-5 text-[#004274]" />
                Tu Progreso
              </h2>
              <span className="text-[24px] font-bold text-[#004274]">{progress.percentage}%</span>
            </div>
            <div className="w-full h-4 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress.percentage}%`,
                  background: progress.percentage >= 100
                    ? 'linear-gradient(90deg, #22c55e, #16a34a)'
                    : 'linear-gradient(90deg, #004274, #0068b7)'
                }}
              />
            </div>
            <div className="flex justify-between mt-3 text-[13px] text-[#717171]">
              <span>{progress.payments_made} de {progress.total_payments} pagos realizados</span>
              <span>{fmt(progress.total_paid)} de {fmt(progress.total_expected)}</span>
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-xl">
              <p className="text-[#004274] text-[14px] font-medium">
                💰 Saldo restante: <span className="text-[18px] font-bold">{fmt(progress.remaining_balance)}</span>
              </p>
            </div>
          </div>
        )}

        {/* Delivered celebration */}
        {contract.status === 'delivered' && (
          <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 mb-6 border-2 border-green-300">
            <div className="text-center">
              <span className="text-4xl mb-3 block">🏠🎉</span>
              <h2 className="text-[22px] font-bold text-[#222]">¡Felicidades!</h2>
              <p className="text-[14px] text-[#484848] mt-2">
                Has completado todos los pagos. Tu casa ya es oficialmente tuya.
              </p>
              <Link
                href="/clientes/mi-cuenta/documentos"
                className="inline-flex items-center gap-2 mt-4 bg-[#004274] text-white px-6 py-3 rounded-xl font-semibold text-[14px] hover:bg-[#003560] transition-colors"
              >
                <FileText className="w-5 h-5" />
                Ver mis documentos
              </Link>
            </div>
          </div>
        )}

        {/* Contract Terms & Dates */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-[#222] mb-4 flex items-center gap-2 text-[15px]">
              <FileText className="w-5 h-5 text-[#004274]" />
              Resumen del Contrato
            </h3>
            <div className="space-y-3">
              <Row label="Renta Mensual" value={fmt(contract.monthly_rent)} highlight />
              <Row label="Precio de Compra" value={fmt(contract.purchase_price)} />
              <Row label="Enganche" value={fmt(contract.down_payment)} />
              <Row label="Plazo" value={`${contract.term_months} meses`} />
              <Row label="Día de Pago" value={`Día ${contract.payment_due_day} de cada mes`} />
            </div>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-bold text-[#222] mb-4 flex items-center gap-2 text-[15px]">
              <Calendar className="w-5 h-5 text-[#004274]" />
              Fechas
            </h3>
            <div className="space-y-3">
              <Row label="Inicio" value={new Date(contract.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row label="Fin" value={new Date(contract.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
            {contract.properties?.square_feet && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-[13px] text-[#717171]">Tamaño: <strong className="text-[#222]">{contract.properties.square_feet} sqft</strong></p>
              </div>
            )}

            {/* PDF download - also shown in dates card as secondary link */}
            {contract.contract_pdf_url && (
              <div className="mt-4 pt-4 border-t border-gray-100">
                <a
                  href={contract.contract_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#004274] hover:underline"
                >
                  <Download className="w-3.5 h-3.5" />
                  Descargar contrato completo (PDF)
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Payment Schedule */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-bold text-[#222] flex items-center gap-2 text-[15px]">
                <DollarSign className="w-5 h-5 text-[#004274]" />
                Calendario de Pagos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-[11px] text-[#717171] uppercase tracking-wider">
                    <th className="px-6 py-3 font-semibold">#</th>
                    <th className="px-6 py-3 font-semibold">Vencimiento</th>
                    <th className="px-6 py-3 font-semibold">Monto</th>
                    <th className="px-6 py-3 font-semibold">Estado</th>
                    <th className="px-6 py-3 font-semibold">Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {payments.map((p) => {
                    const ps = paymentStatusStyles[p.status] || paymentStatusStyles.scheduled
                    return (
                      <tr key={p.id} className={p.status === 'paid' ? 'bg-green-50/40' : ''}>
                        <td className="px-6 py-4 text-[14px] font-medium text-[#222]">{p.payment_number}</td>
                        <td className="px-6 py-4 text-[14px] text-[#484848]">
                          {new Date(p.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 text-[14px] font-medium text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.amount)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold ${ps.bg} ${ps.color}`}>
                            {p.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                            {p.status === 'late' && <AlertCircle className="w-3 h-3" />}
                            {p.status === 'pending' && <Clock className="w-3 h-3" />}
                            {ps.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {p.paid_amount ? (
                            <span className="text-green-600 font-medium text-[14px]" style={{ fontVariantNumeric: 'tabular-nums' }}>{fmt(p.paid_amount)}</span>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Estado de cuenta link */}
        <div className="mt-6 text-center">
          <Link
            href="/clientes/mi-cuenta/estado-de-cuenta"
            className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#004274] hover:underline"
          >
            <FileText className="w-4 h-4" />
            Ver estado de cuenta completo
          </Link>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
      <span className="text-[13px] text-[#717171]">{label}</span>
      <span className={`text-[13px] font-semibold ${highlight ? 'text-[#004274] text-[15px]' : 'text-[#222]'}`} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </span>
    </div>
  )
}
