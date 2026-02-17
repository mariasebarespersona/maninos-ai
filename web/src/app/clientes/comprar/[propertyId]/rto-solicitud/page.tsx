'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import {
  CheckCircle,
  Home,
  Phone,
  Mail,
  ArrowRight,
  Clock,
  FileText,
  Shield,
  ShieldCheck,
  Key,
  Loader2,
  UserCheck,
} from 'lucide-react'
import confetti from 'canvas-confetti'

interface RTOData {
  ok: boolean
  client_id: string
  sale_id: string
  sale_type: string
  amount: number
  property: {
    id: string
    address: string
    city: string
    state: string
    sale_price: number
    photos: string[]
  }
  message: string
}

export default function RTOConfirmationPage() {
  const params = useParams()
  const propertyId = params.propertyId as string

  const [rtoData, setRtoData] = useState<RTOData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = sessionStorage.getItem('maninos_rto_data')
    if (stored) {
      const data = JSON.parse(stored)
      setRtoData(data)
      sessionStorage.removeItem('maninos_rto_data')
      sessionStorage.removeItem('maninos_client_data')
      triggerConfetti()
    }
    setLoading(false)
  }, [])

  const triggerConfetti = () => {
    confetti({
      particleCount: 80,
      spread: 60,
      origin: { x: 0.15, y: 0.5 },
      colors: ['#f97316', '#ea580c', '#1e3a5f', '#c9a227']
    })
    setTimeout(() => {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { x: 0.85, y: 0.5 },
        colors: ['#f97316', '#ea580c', '#1e3a5f', '#c9a227']
      })
    }, 200)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-orange-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-orange-50 to-white">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white p-8 text-center">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <Key className="w-12 h-12 text-orange-500" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                ¡Solicitud Enviada!
              </h1>
              <p className="text-orange-100 text-lg">
                Tu solicitud de Rent-to-Own ha sido recibida
              </p>
            </div>

            {/* Content */}
            <div className="p-8">
              {rtoData ? (
                <>
                  {/* Property Info */}
                  <div className="bg-orange-50 rounded-xl p-6 mb-6">
                    <h2 className="font-semibold text-navy-900 mb-4">Detalles de tu solicitud</h2>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Propiedad</span>
                        <span className="font-medium text-navy-900 text-right">{rtoData.property.address}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Ubicación</span>
                        <span className="font-medium text-navy-900">
                          {rtoData.property.city || 'Texas'}, {rtoData.property.state || 'TX'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Precio de venta</span>
                        <span className="font-bold text-orange-600 text-lg">
                          ${rtoData.amount?.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Tipo de pago</span>
                        <span className="inline-flex items-center gap-1 bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-sm font-medium">
                          <Key className="w-3 h-3" />
                          Rent-to-Own
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Referencia</span>
                        <span className="font-mono text-sm text-gray-500">
                          {rtoData.sale_id?.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Timeline / Next Steps */}
                  <div className="mb-8">
                    <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                      <Clock className="w-5 h-5 text-orange-600" />
                      ¿Qué sigue?
                    </h2>

                    <div className="space-y-4">
                      {[
                        {
                          step: 1,
                          title: 'Revisión de solicitud',
                          description: 'Nuestro equipo de Maninos Capital revisará tu aplicación',
                          time: '24-48 horas',
                          icon: FileText,
                          active: true
                        },
                        {
                          step: 2,
                          title: 'Verificación de identidad',
                          description: 'Te pediremos que verifiques tu identidad desde tu cuenta. Entra a "Mi Cuenta" y sigue las instrucciones cuando aparezca la solicitud.',
                          time: 'Desde tu cuenta',
                          icon: ShieldCheck
                        },
                        {
                          step: 3,
                          title: 'Te contactamos',
                          description: 'Un asesor te llamará para discutir los términos del contrato',
                          time: 'Después de revisión',
                          icon: Phone
                        },
                        {
                          step: 4,
                          title: 'Documentación y capacidad de pago',
                          description: 'Evaluaremos tu información financiera para completar tu perfil',
                          time: 'Durante llamada',
                          icon: FileText
                        },
                        {
                          step: 5,
                          title: 'Firma de contrato',
                          description: 'Si todo está en orden, firmas el contrato y te mudas',
                          time: 'Una vez aprobado',
                          icon: Key
                        }
                      ].map((item) => (
                        <div
                          key={item.step}
                          className={`flex items-start gap-4 p-4 rounded-xl ${
                            item.active ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
                            item.active
                              ? 'bg-orange-500 text-white'
                              : 'bg-gray-200 text-gray-500'
                          }`}>
                            {item.active ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <span className="font-bold text-sm">{item.step}</span>
                            )}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="font-semibold text-navy-900">{item.title}</h4>
                              <span className="text-xs text-gray-500 bg-white px-2 py-1 rounded">
                                {item.time}
                              </span>
                            </div>
                            <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Key className="w-16 h-16 text-orange-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-navy-900 mb-2">
                    ¡Tu solicitud está en proceso!
                  </h2>
                  <p className="text-gray-600">
                    Pronto recibirás noticias de nuestro equipo.
                  </p>
                </div>
              )}

              {/* Email notification */}
              <div className="bg-blue-50 rounded-xl p-4 mb-6 flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Te hemos enviado un correo de confirmación con los detalles de tu solicitud.
                  Revisa tu bandeja de entrada.
                </p>
              </div>

              {/* KYC Info Box */}
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 mb-6 border border-blue-200">
                <div className="flex items-start gap-3">
                  <UserCheck className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-blue-800 mb-1">Verificación de identidad</p>
                    <p className="text-sm text-blue-700 mb-2">
                      Como parte del proceso, te pediremos que verifiques tu identidad.
                      Cuando nuestro equipo lo solicite, aparecerá un aviso en tu cuenta.
                    </p>
                    <p className="text-sm text-blue-700">
                      Entra a <Link href="/clientes/mi-cuenta" className="font-semibold underline">Mi Cuenta</Link> y 
                      sigue las instrucciones. Solo necesitas un documento de identidad (licencia, pasaporte o ID).
                    </p>
                  </div>
                </div>
              </div>

              {/* RTO Info Box */}
              <div className="bg-gradient-to-br from-orange-50 to-amber-50 rounded-xl p-5 mb-6 border border-orange-100">
                <div className="flex items-start gap-3">
                  <Shield className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-orange-800 mb-1">Programa Rent-to-Own de Maninos Capital</p>
                    <p className="text-sm text-orange-700">
                      Nuestro programa te permite entrar a vivir en tu casa con un depósito inicial
                      y pagos mensuales accesibles. Parte de cada pago se aplica al precio final.
                      Al completar el plazo, la casa es 100% tuya.
                    </p>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-3">
                <Link
                  href="/clientes/mi-cuenta"
                  className="block w-full bg-orange-500 text-white text-center font-bold py-4 rounded-lg hover:bg-orange-600 transition-colors"
                >
                  Ver Mi Cuenta
                  <ArrowRight className="w-5 h-5 inline ml-2" />
                </Link>

                <Link
                  href="/clientes/casas"
                  className="block w-full border-2 border-gray-200 text-gray-700 text-center font-medium py-4 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Volver al Catálogo
                </Link>
              </div>
            </div>

            {/* Footer */}
            <div className="bg-gray-50 px-8 py-6 border-t">
              <p className="text-center text-gray-600 text-sm mb-2">
                ¿Tienes alguna pregunta?
              </p>
              <div className="flex items-center justify-center gap-4">
                <a
                  href="tel:+18327459600"
                  className="flex items-center gap-2 text-navy-900 font-medium hover:text-orange-600"
                >
                  <Phone className="w-4 h-4" />
                  (832) 745-9600
                </a>
              </div>
            </div>
          </div>

          <p className="text-center text-gray-500 text-sm mt-8">
            Gracias por confiar en Maninos Homes y Maninos Capital. 🏠
          </p>
        </div>
      </div>
    </div>
  )
}

