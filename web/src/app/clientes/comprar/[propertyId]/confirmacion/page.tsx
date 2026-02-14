'use client'

import { useState, useEffect } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  CheckCircle, 
  Home, 
  FileText, 
  Phone,
  Mail,
  ArrowRight,
  Download,
  Loader2
} from 'lucide-react'
import confetti from 'canvas-confetti'

interface ConfirmationData {
  ok: boolean
  message: string
  sale_id: string
  property_address: string
  client_name: string
  amount_paid: number
  next_steps: string[]
}

export default function ConfirmationPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const propertyId = params.propertyId as string
  
  const [confirmationData, setConfirmationData] = useState<ConfirmationData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get confirmation data from session
    const storedData = sessionStorage.getItem('maninos_purchase_complete')
    
    if (storedData) {
      const data = JSON.parse(storedData)
      setConfirmationData(data)
      sessionStorage.removeItem('maninos_purchase_complete')
      
      // Trigger confetti
      triggerConfetti()
    }
    
    setLoading(false)
  }, [])

  const triggerConfetti = () => {
    // Left side
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { x: 0.1, y: 0.5 },
      colors: ['#c9a227', '#1e3a5f', '#22c55e']
    })
    
    // Right side
    setTimeout(() => {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.9, y: 0.5 },
        colors: ['#c9a227', '#1e3a5f', '#22c55e']
      })
    }, 200)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-green-50 to-white">
      <div className="container mx-auto px-4 py-12">
        {/* Success Card */}
        <div className="max-w-2xl mx-auto">
          <div className="bg-white rounded-2xl shadow-lg overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-green-500 to-green-600 text-white p-8 text-center">
              <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-12 h-12 text-green-500" />
              </div>
              <h1 className="text-3xl font-bold mb-2">
                ¡Felicidades!
              </h1>
              <p className="text-green-100 text-lg">
                Tu compra ha sido completada exitosamente
              </p>
            </div>
            
            {/* Content */}
            <div className="p-8">
              {confirmationData ? (
                <>
                  {/* Purchase details */}
                  <div className="bg-gray-50 rounded-xl p-6 mb-6">
                    <h2 className="font-semibold text-navy-900 mb-4">Detalles de tu compra</h2>
                    
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Propiedad</span>
                        <span className="font-medium text-navy-900">{confirmationData.property_address}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Comprador</span>
                        <span className="font-medium text-navy-900">{confirmationData.client_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Monto pagado</span>
                        <span className="font-bold text-gold-600">${confirmationData.amount_paid?.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Referencia</span>
                        <span className="font-mono text-sm text-gray-500">{confirmationData.sale_id?.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Next steps */}
                  <div className="mb-8">
                    <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5 text-gold-600" />
                      Próximos pasos
                    </h2>
                    
                    <ol className="space-y-3">
                      {confirmationData.next_steps?.map((step, index) => (
                        <li key={index} className="flex items-start gap-3">
                          <span className="w-6 h-6 bg-gold-100 text-gold-700 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0">
                            {index + 1}
                          </span>
                          <span className="text-gray-700">{step}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <Home className="w-16 h-16 text-gold-500 mx-auto mb-4" />
                  <h2 className="text-xl font-bold text-navy-900 mb-2">
                    ¡Tu casa te espera!
                  </h2>
                  <p className="text-gray-600">
                    Gracias por confiar en Maninos Homes.
                  </p>
                </div>
              )}
              
              {/* Email confirmation */}
              <div className="bg-blue-50 rounded-xl p-4 mb-6 flex items-start gap-3">
                <Mail className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-blue-800">
                  Hemos enviado un correo de confirmación con todos los detalles de tu compra.
                </p>
              </div>
              
              {/* Actions */}
              <div className="space-y-3">
                <Link
                  href="/clientes/mi-cuenta"
                  className="block w-full bg-gold-500 text-navy-900 text-center font-bold py-4 rounded-lg hover:bg-gold-400 transition-colors"
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
                  className="flex items-center gap-2 text-navy-900 font-medium hover:text-gold-600"
                >
                  <Phone className="w-4 h-4" />
                  (832) 745-9600
                </a>
              </div>
            </div>
          </div>
          
          {/* Trust message */}
          <p className="text-center text-gray-500 text-sm mt-8">
            Gracias por confiar en Maninos Homes. 
            Tu hogar es nuestra misión. 🏠
          </p>
        </div>
      </div>
    </div>
  )
}


