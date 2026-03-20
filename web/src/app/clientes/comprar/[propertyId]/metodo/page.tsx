'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  CreditCard,
  Home as HomeIcon,
  Shield,
  CheckCircle,
  Loader2,
  DollarSign,
  Calendar,
  Key,
  ArrowRight,
  Clock,
  AlertCircle
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { calculateRTOMonthly } from '@/lib/rto-calculator'

interface Property {
  id: string
  address: string
  city: string
  state: string
  sale_price: number
  photos: string[]
}

interface ClientData {
  property_id: string
  client_name: string
  client_email: string
  client_phone: string
  client_terreno: string
  property: Property
}

export default function PaymentMethodPage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.propertyId as string

  const [clientData, setClientData] = useState<ClientData | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [selectedMethod, setSelectedMethod] = useState<'contado' | 'rto' | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('maninos_client_data')
    if (!stored) {
      toast.error('Sesion expirada. Por favor, vuelve a empezar.')
      router.push(`/clientes/comprar/${propertyId}`)
      return
    }
    setClientData(JSON.parse(stored))
    setLoading(false)
  }, [propertyId, router])

  const [showBankDetails, setShowBankDetails] = useState(false)
  const [reportingTransfer, setReportingTransfer] = useState(false)
  const [transferReported, setTransferReported] = useState(false)

  const handleContado = () => {
    setSelectedMethod('contado')
    setShowBankDetails(true)
  }

  const handleReportTransfer = async () => {
    if (!clientData) return
    setReportingTransfer(true)
    try {
      const res = await fetch('/api/public/purchases/report-transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: clientData.property_id,
          client_name: clientData.client_name,
          client_email: clientData.client_email,
          client_phone: clientData.client_phone,
          client_terreno: clientData.client_terreno,
        })
      })
      const data = await res.json()
      if (data.ok) {
        setTransferReported(true)
        toast.success('Transferencia registrada!')
      } else {
        toast.error(data.detail || 'Error al registrar la transferencia')
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexion')
    } finally {
      setReportingTransfer(false)
    }
  }

  const handleRTO = async () => {
    if (!clientData) return
    setSubmitting(true)
    setSelectedMethod('rto')

    try {
      // Recover RTO simulator params if client used the simulator
      const simRaw = sessionStorage.getItem('maninos_rto_sim')
      const simParams = simRaw ? JSON.parse(simRaw) : null

      const res = await fetch('/api/public/purchases/initiate-rto', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: clientData.property_id,
          client_name: clientData.client_name,
          client_email: clientData.client_email,
          client_phone: clientData.client_phone,
          client_terreno: clientData.client_terreno,
          // Pass simulator values if available
          desired_down_payment: simParams?.down_payment_amount ?? undefined,
          desired_term_months: simParams?.term_months ?? undefined,
        })
      })

      const data = await res.json()

      if (data.ok) {
        sessionStorage.setItem('maninos_rto_data', JSON.stringify(data))
        sessionStorage.removeItem('maninos_rto_sim') // cleanup
        toast.success('Solicitud enviada!')
        router.push(`/clientes/comprar/${propertyId}/rto-solicitud`)
      } else {
        toast.error(data.detail || 'Error al procesar')
        setSubmitting(false)
        setSelectedMethod(null)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexion')
      setSubmitting(false)
      setSelectedMethod(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-[#004274]" />
      </div>
    )
  }

  if (!clientData) return null

  const property = clientData.property

  // Pull from simulator if available, otherwise calculate with formula
  const simRaw = typeof window !== 'undefined' ? sessionStorage.getItem('maninos_rto_sim') : null
  const simParams = simRaw ? JSON.parse(simRaw) : null
  const simTermMonths = simParams?.term_months ?? 36
  const simDownPayment = simParams?.down_payment_amount ?? 0
  const estimatedMonthly = simParams?.monthly_payment
    ?? calculateRTOMonthly({
      salePrice: property.sale_price || 0,
      downPayment: 0,
      termMonths: 36,
    }).monthlyPayment

  return (
    <div className="min-h-screen bg-white">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`/clientes/comprar/${propertyId}`}
            className="flex items-center gap-2 text-[#717171] hover:text-[#004274] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a mis datos
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-[#004274] text-white rounded-full text-[14px] font-semibold">
                ✓
              </div>
              <span className="ml-2 text-[#004274] text-[14px] font-medium">Tus Datos</span>
            </div>
            <div className="w-12 h-1 bg-[#004274] mx-3 rounded" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-[#004274] text-white rounded-full text-[14px] font-bold">
                2
              </div>
              <span className="ml-2 font-semibold text-[#222] text-[14px]">Forma de Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3 rounded" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-[#717171] rounded-full text-[14px] font-bold">
                3
              </div>
              <span className="ml-2 text-[#717171] text-[14px]">Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3 rounded" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-[#717171] rounded-full text-[14px] font-bold">
                4
              </div>
              <span className="ml-2 text-[#717171] text-[14px]">Confirmacion</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h1 className="text-[24px] font-bold text-[#222] mb-3">
            Como te gustaria pagar?
          </h1>
          <p className="text-[#484848] text-[16px]">
            Elige la opcion que mejor se adapte a tu situacion. Ambas opciones son seguras y confiables.
          </p>
        </div>

        {/* Payment Options */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Option 1: Contado */}
          <div
            className={`relative bg-white rounded-xl shadow-sm border-2 transition-all ${
              showBankDetails
                ? 'border-[#004274] shadow-lg'
                : 'border-gray-200 hover:border-[#004274] cursor-pointer hover:shadow-lg'
            }`}
            onClick={() => !showBankDetails && handleContado()}
          >
            {/* Badge */}
            <div className="absolute -top-3 left-6">
              <span className="bg-[#004274] text-white text-[11px] font-bold px-3 py-1 rounded-full tracking-wide">
                PAGO INMEDIATO
              </span>
            </div>

            <div className="p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-[#004274]" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#222]">Al Contado</h2>
                  <p className="text-[#717171] text-[13px]">Transferencia bancaria</p>
                </div>
              </div>

              {/* Price */}
              <div className="bg-blue-50 rounded-xl p-5 mb-6 text-center">
                <p className="text-[13px] text-[#004274] mb-1">Precio total</p>
                <p className="text-3xl font-bold text-[#004274]">
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>

              {showBankDetails ? (
                transferReported ? (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                    <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                    <h3 className="text-[16px] font-bold text-emerald-800 mb-2">Transferencia Registrada!</h3>
                    <p className="text-[13px] text-emerald-700 mb-4">
                      Hemos registrado tu reporte. Nuestro equipo verificara la transferencia y te notificaremos por email.
                    </p>
                    <Link
                      href="/clientes/mi-cuenta"
                      className="inline-flex items-center gap-2 bg-[#004274] text-white font-bold py-3 px-6 rounded-xl hover:bg-[#00345c] transition-colors"
                    >
                      Ir a Mi Cuenta
                      <ArrowRight className="w-5 h-5" />
                    </Link>
                  </div>
                ) : (
                <>
                  {/* Bank Details */}
                  <div className="bg-gray-50 rounded-xl p-5 mb-6 space-y-3">
                    <p className="text-[13px] font-bold text-[#222] mb-3">Datos para transferencia:</p>
                    {[
                      { label: 'Banco', value: 'Chase Bank' },
                      { label: 'Nombre de la cuenta', value: 'Maninos Homes LLC' },
                      { label: 'Numero de cuenta', value: '000000000000' },
                      { label: 'Routing Number', value: '000000000' },
                      { label: 'Tipo de cuenta', value: 'Business Checking' },
                    ].map((item) => (
                      <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-gray-200 last:border-0">
                        <span className="text-[13px] text-[#717171]">{item.label}</span>
                        <span className="text-[13px] font-semibold text-[#222] font-mono">{item.value}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={handleReportTransfer}
                    disabled={reportingTransfer}
                    className="w-full flex items-center justify-center gap-2 py-4 rounded-xl font-bold transition-colors bg-[#004274] text-white hover:bg-[#00345c] disabled:opacity-50"
                  >
                    {reportingTransfer ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Ya he hecho la transferencia
                      </>
                    )}
                  </button>

                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mt-4">
                    <p className="text-[13px] text-[#004274] mb-3">
                      <strong>Opcional:</strong> Si deseas, tambien puedes enviarnos el comprobante
                      por WhatsApp para agilizar la confirmacion.
                    </p>
                    <a
                      href={`https://api.whatsapp.com/send?phone=+18327459600&text=${encodeURIComponent(
                        `Hola! Acabo de hacer una transferencia para la compra al contado de la casa en ${property.address}. Mi nombre es ${clientData?.client_name || ''}. Adjunto mi comprobante.`
                      )}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold transition-colors border-2 border-[#004274] text-[#004274] hover:bg-blue-50"
                    >
                      Enviar comprobante por WhatsApp
                      <ArrowRight className="w-4 h-4" />
                    </a>
                  </div>
                </>
                )
              ) : (
                <>
                  {/* Benefits */}
                  <ul className="space-y-3 mb-8">
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                      <span className="text-[#484848] text-[14px]">La casa es tuya <strong>inmediatamente</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                      <span className="text-[#484848] text-[14px]">Titulo transferido <strong>a tu nombre</strong></span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                      <span className="text-[#484848] text-[14px]">Sin pagos mensuales ni intereses</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                      <span className="text-[#484848] text-[14px]">Pago por <strong>transferencia bancaria</strong></span>
                    </li>
                  </ul>

                  {/* CTA Button */}
                  <button
                    className="w-full bg-[#004274] text-white font-bold py-4 rounded-xl hover:bg-[#00345c] transition-colors flex items-center justify-center gap-2"
                  >
                    Pagar al Contado
                    <ArrowRight className="w-5 h-5" />
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Option 2: RTO */}
          <div
            className={`relative bg-white rounded-xl shadow-sm border-2 transition-all cursor-pointer hover:shadow-lg ${
              selectedMethod === 'rto' && submitting
                ? 'border-[#004274] shadow-lg'
                : 'border-gray-200 hover:border-[#004274]'
            }`}
            onClick={() => !submitting && handleRTO()}
          >
            {/* Badge */}
            <div className="absolute -top-3 left-6">
              <span className="bg-[#004274] text-white text-[11px] font-bold px-3 py-1 rounded-full tracking-wide">
                PAGOS MENSUALES
              </span>
            </div>

            <div className="p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center">
                  <Key className="w-8 h-8 text-[#004274]" />
                </div>
                <div>
                  <h2 className="text-[16px] font-bold text-[#222]">Rent-to-Own</h2>
                  <p className="text-[#717171] text-[13px]">Renta con opcion a compra</p>
                </div>
              </div>

              {/* Estimated Monthly */}
              <div className="bg-blue-50 rounded-xl p-5 mb-6 text-center">
                <p className="text-[13px] text-[#004274] mb-1">Pago mensual estimado</p>
                <p className="text-3xl font-bold text-[#004274]">
                  ${estimatedMonthly.toLocaleString()}<span className="text-lg font-normal">/mes</span>
                </p>
                <p className="text-[12px] text-[#717171] mt-1">
                  {simDownPayment > 0
                    ? `Enganche: $${simDownPayment.toLocaleString()} · ${simTermMonths} meses`
                    : `*Precio final: $${property.sale_price?.toLocaleString()}`
                  }
                </p>
              </div>

              {/* Benefits */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                  <span className="text-[#484848] text-[14px]">Entra a vivir con un <strong>deposito inicial</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                  <span className="text-[#484848] text-[14px]">Pagos mensuales <strong>accesibles</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                  <span className="text-[#484848] text-[14px]">Parte de tu renta <strong>se aplica a la compra</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
                  <span className="text-[#484848] text-[14px]">Al final del plazo, <strong>la casa es tuya</strong></span>
                </li>
              </ul>

              {/* CTA Button */}
              <button
                disabled={submitting}
                className="w-full bg-[#004274] text-white font-bold py-4 rounded-xl hover:bg-[#00345c] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && selectedMethod === 'rto' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando solicitud...
                  </>
                ) : (
                  <>
                    Solicitar Rent-to-Own
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Property Summary */}
        <div className="max-w-4xl mx-auto mt-10">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200 flex items-center gap-5">
            <div className="w-20 h-20 bg-gray-100 rounded-lg overflow-hidden flex-shrink-0">
              {property.photos?.[0] ? (
                <img
                  src={property.photos[0]}
                  alt={property.address}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HomeIcon className="w-8 h-8 text-[#b0b0b0]" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-[#222] text-[14px]">{property.address}</p>
              <p className="text-[#717171] text-[13px]">{property.city || 'Texas'}, {property.state || 'TX'}</p>
              <p className="text-[#004274] font-bold text-lg">${property.sale_price?.toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2 text-[13px] text-[#717171]">
              <Shield className="w-4 h-4 text-[#004274]" />
              <span>Compra segura</span>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mt-10 bg-white rounded-xl p-8 shadow-sm border border-gray-200">
          <h3 className="text-[16px] font-bold text-[#222] mb-6 text-center">
            Preguntas Frecuentes
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-[#222] text-[14px] mb-2 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-[#004274]" />
                Que es pagar al contado?
              </h4>
              <p className="text-[13px] text-[#484848]">
                Pagas el precio completo de la casa por transferencia bancaria. El titulo se transfiere
                directamente a tu nombre y la casa es tuya inmediatamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-[#222] text-[14px] mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-[#004274]" />
                Que es Rent-to-Own?
              </h4>
              <p className="text-[13px] text-[#484848]">
                Es un programa donde rentas la casa con la opcion de comprarla. Haces pagos
                mensuales y al final del plazo acordado, la casa pasa a ser tuya.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-[#222] text-[14px] mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#004274]" />
                Cuanto tiempo tarda el proceso RTO?
              </h4>
              <p className="text-[13px] text-[#484848]">
                Despues de enviar tu solicitud, nuestro equipo de Maninos Homes la revisa
                en 24-48 horas. Si es aprobada, puedes mudarte rapidamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-[#222] text-[14px] mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-[#004274]" />
                Es seguro?
              </h4>
              <p className="text-[13px] text-[#484848]">
                Si. Todos los pagos se procesan de forma segura. Los contratos estan protegidos
                por las leyes del estado de Texas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
