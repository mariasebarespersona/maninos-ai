'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle, FileText, Loader2, AlertCircle,
  Home, DollarSign, CalendarClock, ArrowLeft, ShieldCheck,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

interface ContractData {
  id: string
  status: string
  monthly_rent: number
  purchase_price: number
  down_payment: number
  term_months: number
  start_date: string
  end_date: string
  payment_due_day: number
  signed_by_company: string | null
  signed_at: string | null
  property_id: string
  property_address: string
  property_city: string
}

export default function SignContractPage() {
  const { contractId } = useParams<{ contractId: string }>()
  const router = useRouter()
  const { client, loading: authLoading } = useClientAuth()

  const [contract, setContract] = useState<ContractData | null>(null)
  const [contractLoading, setContractLoading] = useState(true)
  const [contractError, setContractError] = useState<string | null>(null)

  const [signedName, setSignedName] = useState('')
  const [accepted, setAccepted] = useState(false)
  const [signing, setSigning] = useState(false)
  const [signed, setSigned] = useState(false)

  useEffect(() => {
    if (client && contractId) {
      fetchContract()
    }
  }, [client, contractId])

  const fetchContract = async () => {
    try {
      const res = await fetch(`/api/public/clients/${client!.id}/contract/${contractId}`)
      const data = await res.json()
      if (data.ok && data.contract) {
        setContract(data.contract)
        if (data.contract.status === 'active') {
          setSigned(true)
        }
      } else {
        setContractError(data.detail || 'No se pudo cargar el contrato')
      }
    } catch {
      setContractError('Error de conexion')
    } finally {
      setContractLoading(false)
    }
  }

  const handleSign = async () => {
    if (!signedName.trim()) {
      toast.error('Escribe tu nombre completo')
      return
    }
    if (!accepted) {
      toast.error('Debes aceptar los terminos del contrato')
      return
    }

    setSigning(true)
    try {
      const res = await fetch(`/api/public/clients/${client!.id}/sign-contract/${contractId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signed_name: signedName.trim() }),
      })
      const data = await res.json()
      if (data.ok) {
        setSigned(true)
        toast.success('Contrato firmado exitosamente')
        setTimeout(() => {
          router.push('/clientes/mi-cuenta')
        }, 2500)
      } else {
        toast.error(data.detail || 'Error al firmar el contrato')
      }
    } catch {
      toast.error('Error de conexion')
    } finally {
      setSigning(false)
    }
  }

  if (authLoading || contractLoading) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#004274]" />
      </div>
    )
  }

  if (contractError) {
    return (
      <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-md w-full text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-[#222] mb-2">Error</h2>
          <p className="text-[14px] text-[#717171] mb-6">{contractError}</p>
          <Link href="/clientes/mi-cuenta" className="text-[#004274] font-semibold text-[14px] hover:underline">
            Volver a mi cuenta
          </Link>
        </div>
      </div>
    )
  }

  if (!contract) return null

  const isPendingSignature = contract.status === 'pending_signature'

  return (
    <div className="min-h-screen bg-[#f7f7f7]">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-2xl mx-auto px-4 py-4 flex items-center gap-3">
          <Link href="/clientes/mi-cuenta" className="text-[#717171] hover:text-[#222] transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-[18px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>
              Firmar Contrato RTO
            </h1>
            <p className="text-[13px] text-[#717171]">Rent-to-Own</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {/* Success State */}
        {signed && (
          <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-8 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-[#222] mb-2">Contrato Firmado</h2>
            <p className="text-[14px] text-[#717171] mb-6">
              Tu contrato ha sido firmado exitosamente. Tu plan de pagos ya esta activo.
            </p>
            <Link
              href="/clientes/mi-cuenta"
              className="inline-flex items-center gap-2 bg-[#004274] text-white px-6 py-3 rounded-xl font-semibold text-[14px] hover:bg-[#00345c] transition-colors"
            >
              Ir a Mi Cuenta
            </Link>
          </div>
        )}

        {/* Contract Details */}
        {!signed && isPendingSignature && (
          <>
            {/* Property & Terms Summary */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center">
                  <FileText className="w-5 h-5 text-[#004274]" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#222]">Resumen del Contrato</h2>
                  <p className="text-[12px] text-[#717171]">Revisa los detalles antes de firmar</p>
                </div>
              </div>

              <div className="space-y-4">
                {/* Property */}
                <div className="flex items-start gap-3 p-3 rounded-xl bg-gray-50">
                  <Home className="w-5 h-5 text-[#004274] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[12px] text-[#717171] font-medium">Propiedad</p>
                    <p className="text-[14px] font-semibold text-[#222]">{contract.property_address}</p>
                    <p className="text-[12px] text-[#717171]">{contract.property_city}, TX</p>
                  </div>
                </div>

                {/* Financial Terms */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-[#004274]" />
                      <p className="text-[12px] text-[#717171] font-medium">Mensualidad</p>
                    </div>
                    <p className="text-[18px] font-bold text-[#004274]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${contract.monthly_rent?.toLocaleString()}<span className="text-[12px] font-normal text-[#717171]">/mes</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-2 mb-1">
                      <CalendarClock className="w-4 h-4 text-[#004274]" />
                      <p className="text-[12px] text-[#717171] font-medium">Plazo</p>
                    </div>
                    <p className="text-[18px] font-bold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      {contract.term_months} <span className="text-[12px] font-normal text-[#717171]">meses</span>
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-emerald-600" />
                      <p className="text-[12px] text-[#717171] font-medium">Enganche</p>
                    </div>
                    <p className="text-[18px] font-bold text-emerald-700" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${contract.down_payment?.toLocaleString()}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-gray-50">
                    <div className="flex items-center gap-2 mb-1">
                      <DollarSign className="w-4 h-4 text-[#717171]" />
                      <p className="text-[12px] text-[#717171] font-medium">Precio de Compra</p>
                    </div>
                    <p className="text-[18px] font-bold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>
                      ${contract.purchase_price?.toLocaleString()}
                    </p>
                  </div>
                </div>

                {/* Dates */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-gray-50 text-[13px]">
                  <div>
                    <p className="text-[#717171]">Inicio</p>
                    <p className="font-semibold text-[#222]">{contract.start_date ? new Date(contract.start_date + 'T00:00:00').toLocaleDateString('es-MX') : '-'}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[#717171]">Fin</p>
                    <p className="font-semibold text-[#222]">{contract.end_date ? new Date(contract.end_date + 'T00:00:00').toLocaleDateString('es-MX') : '-'}</p>
                  </div>
                </div>

                <div className="text-[12px] text-[#717171] text-center">
                  Dia de pago: <strong>dia {contract.payment_due_day}</strong> de cada mes
                </div>
              </div>
            </div>

            {/* Company Signature */}
            <div className="bg-white rounded-2xl shadow-sm border border-emerald-200 p-5">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-emerald-50 rounded-full flex items-center justify-center flex-shrink-0">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-[14px] font-semibold text-emerald-700">Maninos Capital LLC ha firmado este contrato</p>
                  <p className="text-[12px] text-emerald-600">{contract.signed_by_company || 'Sebastian Sebares, Maninos Capital LLC'}</p>
                </div>
              </div>
            </div>

            {/* Client Signature Form */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h3 className="text-[16px] font-bold text-[#222] mb-4">Tu Firma</h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-[13px] font-semibold text-[#484848] mb-1.5">
                    Escribe tu nombre completo tal como aparece en tu identificacion
                  </label>
                  <input
                    type="text"
                    value={signedName}
                    onChange={(e) => setSignedName(e.target.value)}
                    placeholder="Nombre completo"
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 text-[14px] text-[#222] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#004274]/20 focus:border-[#004274] transition-colors"
                    style={{ fontFamily: "'Caveat', cursive, Inter, sans-serif" }}
                  />
                </div>

                <label className={`flex items-start gap-3 cursor-pointer select-none p-4 rounded-xl border-2 transition-colors ${
                  accepted ? 'border-[#004274] bg-blue-50' : 'border-red-300 bg-red-50'
                }`}>
                  <input
                    type="checkbox"
                    checked={accepted}
                    onChange={(e) => setAccepted(e.target.checked)}
                    className="mt-0.5 w-5 h-5 rounded border-gray-300 text-[#004274] focus:ring-[#004274] accent-[#004274] flex-shrink-0"
                  />
                  <div>
                    <span className={`text-[13px] leading-relaxed font-medium ${accepted ? 'text-[#004274]' : 'text-red-700'}`}>
                      {accepted ? '' : '(Obligatorio) '}He leido y acepto los terminos del contrato de Rent-to-Own.
                    </span>
                    <span className="text-[12px] text-[#717171] block mt-1">
                      Entiendo que al firmar me comprometo a realizar los pagos mensuales segun lo establecido en este contrato.
                    </span>
                  </div>
                </label>

                <button
                  onClick={handleSign}
                  disabled={signing || !signedName.trim() || !accepted}
                  className="w-full py-3.5 rounded-xl font-bold text-[15px] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed bg-[#004274] text-white hover:bg-[#00345c] active:scale-[0.98]"
                >
                  {signing ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Firmando...
                    </>
                  ) : (
                    <>
                      <FileText className="w-5 h-5" />
                      Firmar Contrato
                    </>
                  )}
                </button>
              </div>
            </div>
          </>
        )}

        {/* Already signed / wrong status */}
        {!signed && !isPendingSignature && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
            <AlertCircle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-lg font-bold text-[#222] mb-2">Contrato no disponible para firma</h2>
            <p className="text-[14px] text-[#717171] mb-6">
              Este contrato tiene estado &quot;{contract.status}&quot; y no esta pendiente de firma.
            </p>
            <Link href="/clientes/mi-cuenta" className="text-[#004274] font-semibold text-[14px] hover:underline">
              Volver a mi cuenta
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}
