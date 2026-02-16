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
      toast.error('Sesión expirada. Por favor, vuelve a empezar.')
      router.push(`/clientes/comprar/${propertyId}`)
      return
    }
    setClientData(JSON.parse(stored))
    setLoading(false)
  }, [propertyId, router])

  const handleContado = async () => {
    if (!clientData) return
    setSubmitting(true)
    setSelectedMethod('contado')

    try {
      // Call backend to initiate contado purchase
      const res = await fetch('/api/public/purchases/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: clientData.property_id,
          client_name: clientData.client_name,
          client_email: clientData.client_email,
          client_phone: clientData.client_phone,
          client_terreno: clientData.client_terreno
        })
      })

      const data = await res.json()

      if (data.ok) {
        sessionStorage.setItem('maninos_purchase', JSON.stringify({
          ...data,
          client_email: clientData.client_email
        }))
        toast.success('¡Continuando al pago!')
        router.push(`/clientes/comprar/${propertyId}/pago`)
      } else {
        toast.error(data.detail || 'Error al procesar')
        setSubmitting(false)
        setSelectedMethod(null)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
      setSubmitting(false)
      setSelectedMethod(null)
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
        toast.success('¡Solicitud enviada!')
        router.push(`/clientes/comprar/${propertyId}/rto-solicitud`)
      } else {
        toast.error(data.detail || 'Error al procesar')
        setSubmitting(false)
        setSelectedMethod(null)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
      setSubmitting(false)
      setSelectedMethod(null)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!clientData) return null

  const property = clientData.property

  // Pull from simulator if available, otherwise default 36mo
  const simRaw = typeof window !== 'undefined' ? sessionStorage.getItem('maninos_rto_sim') : null
  const simParams = simRaw ? JSON.parse(simRaw) : null
  const estimatedMonthly = simParams?.monthly_payment ?? Math.round((property.sale_price || 0) / 36)
  const simTermMonths = simParams?.term_months ?? 36
  const simDownPayment = simParams?.down_payment_amount ?? 0

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link
            href={`/clientes/comprar/${propertyId}`}
            className="flex items-center gap-2 text-gray-600 hover:text-navy-900"
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
              <div className="flex items-center justify-center w-10 h-10 bg-green-500 text-white rounded-full">
                ✓
              </div>
              <span className="ml-2 text-green-600">Tus Datos</span>
            </div>
            <div className="w-12 h-1 bg-gold-500 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gold-500 text-navy-900 rounded-full font-bold">
                2
              </div>
              <span className="ml-2 font-medium text-navy-900">Forma de Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-gray-500 rounded-full font-bold">
                3
              </div>
              <span className="ml-2 text-gray-500">Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-gray-500 rounded-full font-bold">
                4
              </div>
              <span className="ml-2 text-gray-500">Confirmación</span>
            </div>
          </div>
        </div>

        {/* Title */}
        <div className="max-w-4xl mx-auto text-center mb-10">
          <h1 className="text-3xl font-bold text-navy-900 mb-3">
            ¿Cómo te gustaría pagar?
          </h1>
          <p className="text-gray-600 text-lg">
            Elige la opción que mejor se adapte a tu situación. Ambas opciones son seguras y confiables.
          </p>
        </div>

        {/* Payment Options */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
          {/* Option 1: Contado */}
          <div
            className={`relative bg-white rounded-2xl shadow-sm border-2 transition-all cursor-pointer hover:shadow-lg ${
              selectedMethod === 'contado' && submitting
                ? 'border-green-500 shadow-lg'
                : 'border-gray-200 hover:border-green-400'
            }`}
            onClick={() => !submitting && handleContado()}
          >
            {/* Badge */}
            <div className="absolute -top-3 left-6">
              <span className="bg-green-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                PAGO INMEDIATO
              </span>
            </div>

            <div className="p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-green-100 rounded-xl flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-green-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Al Contado</h2>
                  <p className="text-gray-500 text-sm">Pago completo ahora</p>
                </div>
              </div>

              {/* Price */}
              <div className="bg-green-50 rounded-xl p-5 mb-6 text-center">
                <p className="text-sm text-green-700 mb-1">Precio total</p>
                <p className="text-3xl font-bold text-green-700">
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>

              {/* Benefits */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">La casa es tuya <strong>inmediatamente</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Título transferido <strong>a tu nombre</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Sin pagos mensuales ni intereses</span>
                </li>
                <li className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Pago seguro con <strong>Stripe</strong></span>
                </li>
              </ul>

              {/* CTA Button */}
              <button
                disabled={submitting}
                className="w-full bg-green-600 text-white font-bold py-4 rounded-xl hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {submitting && selectedMethod === 'contado' ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Procesando...
                  </>
                ) : (
                  <>
                    Pagar al Contado
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Option 2: RTO */}
          <div
            className={`relative bg-white rounded-2xl shadow-sm border-2 transition-all cursor-pointer hover:shadow-lg ${
              selectedMethod === 'rto' && submitting
                ? 'border-orange-500 shadow-lg'
                : 'border-gray-200 hover:border-orange-400'
            }`}
            onClick={() => !submitting && handleRTO()}
          >
            {/* Badge */}
            <div className="absolute -top-3 left-6">
              <span className="bg-orange-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                PAGOS MENSUALES
              </span>
            </div>

            <div className="p-8">
              {/* Header */}
              <div className="flex items-center gap-4 mb-6">
                <div className="w-14 h-14 bg-orange-100 rounded-xl flex items-center justify-center">
                  <Key className="w-8 h-8 text-orange-600" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-navy-900">Rent-to-Own</h2>
                  <p className="text-gray-500 text-sm">Renta con opción a compra</p>
                </div>
              </div>

              {/* Estimated Monthly */}
              <div className="bg-orange-50 rounded-xl p-5 mb-6 text-center">
                <p className="text-sm text-orange-700 mb-1">Pago mensual estimado</p>
                <p className="text-3xl font-bold text-orange-700">
                  ${estimatedMonthly.toLocaleString()}<span className="text-lg font-normal">/mes</span>
                </p>
                <p className="text-xs text-orange-500 mt-1">
                  {simDownPayment > 0
                    ? `Enganche: $${simDownPayment.toLocaleString()} · ${simTermMonths} meses`
                    : `*Precio final: $${property.sale_price?.toLocaleString()}`
                  }
                </p>
              </div>

              {/* Benefits */}
              <ul className="space-y-3 mb-8">
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Entra a vivir con un <strong>depósito inicial</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Pagos mensuales <strong>accesibles</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Parte de tu renta <strong>se aplica a la compra</strong></span>
                </li>
                <li className="flex items-start gap-3">
                  <Calendar className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                  <span className="text-gray-700">Al final del plazo, <strong>la casa es tuya</strong></span>
                </li>
              </ul>

              {/* CTA Button */}
              <button
                disabled={submitting}
                className="w-full bg-orange-600 text-white font-bold py-4 rounded-xl hover:bg-orange-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
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
          <div className="bg-white rounded-xl p-5 shadow-sm flex items-center gap-5">
            <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
              {property.photos?.[0] ? (
                <img
                  src={property.photos[0]}
                  alt={property.address}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <HomeIcon className="w-8 h-8 text-gray-400" />
                </div>
              )}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-navy-900">{property.address}</p>
              <p className="text-gray-500 text-sm">{property.city || 'Texas'}, {property.state || 'TX'}</p>
              <p className="text-gold-600 font-bold text-lg">${property.sale_price?.toLocaleString()}</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Shield className="w-4 h-4 text-green-500" />
              <span>Compra segura</span>
            </div>
          </div>
        </div>

        {/* FAQ Section */}
        <div className="max-w-4xl mx-auto mt-10 bg-white rounded-xl p-8 shadow-sm">
          <h3 className="text-lg font-bold text-navy-900 mb-6 text-center">
            Preguntas Frecuentes
          </h3>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-green-500" />
                ¿Qué es pagar al contado?
              </h4>
              <p className="text-sm text-gray-600">
                Pagas el precio completo de la casa en un solo pago. El título se transfiere 
                directamente a tu nombre y la casa es tuya inmediatamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <Key className="w-4 h-4 text-orange-500" />
                ¿Qué es Rent-to-Own?
              </h4>
              <p className="text-sm text-gray-600">
                Es un programa donde rentas la casa con la opción de comprarla. Haces pagos 
                mensuales y al final del plazo acordado, la casa pasa a ser tuya.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-500" />
                ¿Cuánto tiempo tarda el proceso RTO?
              </h4>
              <p className="text-sm text-gray-600">
                Después de enviar tu solicitud, nuestro equipo de Maninos Capital la revisa 
                en 24-48 horas. Si es aprobada, puedes mudarte rápidamente.
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-navy-900 mb-2 flex items-center gap-2">
                <Shield className="w-4 h-4 text-green-500" />
                ¿Es seguro?
              </h4>
              <p className="text-sm text-gray-600">
                Sí. Todos los pagos se procesan de forma segura. Los contratos están protegidos 
                por las leyes del estado de Texas.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

