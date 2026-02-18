'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Home, DollarSign, Calendar, Clock,
  CheckCircle, AlertCircle, Loader2, TrendingUp,
  FileText
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
  const { client, loading: authLoading } = useClientAuth()
  const [contract, setContract] = useState<RTOContract | null>(null)
  const [payments, setPayments] = useState<RTOPayment[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (client && saleId) {
      loadRTOContract()
    }
  }, [client, saleId])

  const loadRTOContract = async () => {
    try {
      const res = await fetch(`/api/public/clients/${client!.id}/rto-contract/${saleId}`)
      const data = await res.json()
      if (data.ok) {
        setContract(data.contract)
        setPayments(data.payments || [])
        setProgress(data.progress)
        if (data.message) setMessage(data.message)
      }
    } catch (err) {
      console.error('Error loading RTO:', err)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!contract) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <Link href="/clientes/mi-cuenta" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
            <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
          </Link>
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <Clock className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-navy-900 mb-2">Solicitud en revisión</h2>
            <p className="text-gray-600">
              {message || 'Tu solicitud Rent-to-Own está siendo procesada. Te notificaremos cuando el contrato esté listo.'}
            </p>
          </div>
        </div>
      </div>
    )
  }

  const statusLabels: Record<string, { color: string; bg: string; label: string }> = {
    draft: { color: 'text-gray-700', bg: 'bg-gray-100', label: 'En preparación' },
    pending_signature: { color: 'text-amber-700', bg: 'bg-amber-100', label: 'Pendiente de firma' },
    active: { color: 'text-blue-700', bg: 'bg-blue-100', label: 'Activo' },
    completed: { color: 'text-green-700', bg: 'bg-green-100', label: '¡Pagos completados!' },
    delivered: { color: 'text-gold-700', bg: 'bg-gold-100', label: '✅ ¡Casa entregada!' },
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
    <div className="min-h-screen bg-slate-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Back */}
        <Link href="/clientes/mi-cuenta" className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-6">
          <ArrowLeft className="w-4 h-4" /> Volver a Mi Cuenta
        </Link>

        {/* Header */}
        <div className="bg-white rounded-xl shadow-sm overflow-hidden mb-6">
          {contract.properties?.photos?.[0] && (
            <div className="h-48 overflow-hidden">
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
                <h1 className="text-2xl font-bold text-navy-900">Mi Contrato Rent-to-Own</h1>
                <p className="text-gray-600 mt-1">
                  {contract.properties?.address}, {contract.properties?.city || 'TX'}
                </p>
              </div>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${cs.bg} ${cs.color}`}>
                {cs.label}
              </span>
            </div>
          </div>
        </div>

        {/* Progress */}
        {progress && contract.status === 'active' && (
          <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-navy-900 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-gold-600" />
                Tu Progreso
              </h2>
              <span className="text-2xl font-bold text-gold-600">{progress.percentage}%</span>
            </div>
            <div className="w-full h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${progress.percentage}%`,
                  backgroundColor: progress.percentage >= 100 ? '#22c55e' : '#b8960c'
                }}
              />
            </div>
            <div className="flex justify-between mt-3 text-sm text-gray-600">
              <span>{progress.payments_made} de {progress.total_payments} pagos realizados</span>
              <span>{fmt(progress.total_paid)} de {fmt(progress.total_expected)}</span>
            </div>
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-blue-800 text-sm font-medium">
                💰 Saldo restante: <span className="text-lg">{fmt(progress.remaining_balance)}</span>
              </p>
            </div>
          </div>
        )}

        {/* Delivered celebration */}
        {contract.status === 'delivered' && (
          <div className="bg-gradient-to-r from-gold-50 to-amber-50 rounded-xl p-6 mb-6 border-2 border-gold-300">
            <div className="text-center">
              <span className="text-4xl mb-3 block">🏠🎉</span>
              <h2 className="text-2xl font-bold text-navy-900">¡Felicidades!</h2>
              <p className="text-gray-700 mt-2">
                Has completado todos los pagos. Tu casa ya es oficialmente tuya.
              </p>
              <Link
                href="/clientes/mi-cuenta/documentos"
                className="inline-flex items-center gap-2 mt-4 bg-navy-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-navy-800 transition-colors"
              >
                <FileText className="w-5 h-5" />
                Ver mis documentos
              </Link>
            </div>
          </div>
        )}

        {/* Contract Terms */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-gold-600" />
              Términos del Contrato
            </h3>
            <div className="space-y-3">
              <Row label="Renta Mensual" value={fmt(contract.monthly_rent)} highlight />
              <Row label="Precio de Compra" value={fmt(contract.purchase_price)} />
              <Row label="Enganche" value={fmt(contract.down_payment)} />
              <Row label="Plazo" value={`${contract.term_months} meses`} />
              <Row label="Día de Pago" value={`Día ${contract.payment_due_day} de cada mes`} />
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="font-bold text-navy-900 mb-4 flex items-center gap-2">
              <Calendar className="w-5 h-5 text-gold-600" />
              Fechas
            </h3>
            <div className="space-y-3">
              <Row label="Inicio" value={new Date(contract.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />
              <Row label="Fin" value={new Date(contract.end_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })} />
            </div>
            {contract.properties?.square_feet && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-sm text-gray-600">Tamaño: <strong>{contract.properties.square_feet} sqft</strong></p>
              </div>
            )}
          </div>
        </div>

        {/* Payment Schedule */}
        {payments.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="p-6 border-b">
              <h3 className="font-bold text-navy-900 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gold-600" />
                Calendario de Pagos
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase tracking-wide">
                    <th className="px-6 py-3">#</th>
                    <th className="px-6 py-3">Vencimiento</th>
                    <th className="px-6 py-3">Monto</th>
                    <th className="px-6 py-3">Estado</th>
                    <th className="px-6 py-3">Pagado</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.map((p) => {
                    const ps = paymentStatusStyles[p.status] || paymentStatusStyles.scheduled
                    return (
                      <tr key={p.id} className={p.status === 'paid' ? 'bg-green-50/30' : ''}>
                        <td className="px-6 py-4 font-medium text-gray-900">{p.payment_number}</td>
                        <td className="px-6 py-4 text-gray-600">
                          {new Date(p.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </td>
                        <td className="px-6 py-4 font-medium">{fmt(p.amount)}</td>
                        <td className="px-6 py-4">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${ps.bg} ${ps.color}`}>
                            {p.status === 'paid' && <CheckCircle className="w-3 h-3" />}
                            {p.status === 'late' && <AlertCircle className="w-3 h-3" />}
                            {p.status === 'pending' && <Clock className="w-3 h-3" />}
                            {ps.label}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {p.paid_amount ? (
                            <span className="text-green-600 font-medium">{fmt(p.paid_amount)}</span>
                          ) : (
                            <span className="text-gray-400">—</span>
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
      </div>
    </div>
  )
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500">{label}</span>
      <span className={`text-sm font-medium ${highlight ? 'text-gold-600 text-base' : 'text-gray-900'}`}>
        {value}
      </span>
    </div>
  )
}

