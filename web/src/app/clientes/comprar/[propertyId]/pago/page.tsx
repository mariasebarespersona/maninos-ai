'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { 
  ArrowLeft, 
  Shield,
  Lock,
  CreditCard,
  Loader2,
  Home,
  AlertCircle
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'

// Initialize Stripe once
const stripeKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''
const stripePromise = stripeKey ? loadStripe(stripeKey) : null

interface PurchaseData {
  client_id: string
  sale_id: string
  stripe_customer_id: string
  amount: number
  client_email: string
  property: {
    id: string
    address: string
    city: string
    state: string
    sale_price: number
    photos: string[]
  }
}

// Separate component for the payment form that uses Stripe hooks
function CheckoutForm({ 
  purchaseData, 
  onSuccess 
}: { 
  purchaseData: PurchaseData
  onSuccess: (paymentIntentId: string) => void 
}) {
  const stripe = useStripe()
  const elements = useElements()
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!stripe || !elements) {
      setError('Por favor espera a que cargue el formulario de pago')
      return
    }
    
    setProcessing(true)
    setError('')
    
    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: `${window.location.origin}/clientes/comprar/${purchaseData.property.id}/confirmacion?sale_id=${purchaseData.sale_id}`,
        },
        redirect: 'if_required'
      })
      
      if (submitError) {
        setError(submitError.message || 'Error al procesar el pago')
        toast.error(submitError.message || 'Error al procesar el pago')
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        onSuccess(paymentIntent.id)
      }
    } catch (err: any) {
      setError(err.message || 'Error inesperado')
      toast.error('Error al procesar el pago')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement 
        id="payment-element"
        options={{
          layout: 'tabs'
        }}
      />
      
      {error && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
      
      <button
        type="submit"
        disabled={!stripe || processing}
        className="w-full mt-6 bg-gold-500 text-navy-900 font-bold py-4 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {processing ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            Procesando pago...
          </>
        ) : (
          <>
            <Lock className="w-5 h-5" />
            Pagar ${purchaseData.amount?.toLocaleString()}
          </>
        )}
      </button>
      
      <p className="mt-4 text-xs text-gray-500 text-center flex items-center justify-center gap-1">
        <Shield className="w-4 h-4" />
        Pago seguro procesado por Stripe
      </p>
    </form>
  )
}

export default function PaymentPage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.propertyId as string
  
  const [purchaseData, setPurchaseData] = useState<PurchaseData | null>(null)
  const [clientSecret, setClientSecret] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const initialized = useRef(false)

  useEffect(() => {
    // Prevent double initialization in React Strict Mode
    if (initialized.current) return
    initialized.current = true
    
    // Get purchase data from session
    const storedData = sessionStorage.getItem('maninos_purchase')
    
    if (!storedData) {
      toast.error('Sesión expirada. Por favor, vuelve a empezar.')
      router.push(`/clientes/comprar/${propertyId}`)
      return
    }
    
    const data = JSON.parse(storedData) as PurchaseData
    setPurchaseData(data)
    
    // Check if we already have a payment intent stored
    const existingSecret = sessionStorage.getItem('maninos_client_secret')
    if (existingSecret) {
      setClientSecret(existingSecret)
      setLoading(false)
    } else {
      createPaymentIntent(data)
    }
  }, [propertyId, router])

  const createPaymentIntent = async (data: PurchaseData) => {
    console.log('Creating payment intent for sale:', data.sale_id)
    console.log('Stripe customer:', data.stripe_customer_id)
    
    try {
      const res = await fetch('/api/public/purchases/payment/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: data.sale_id,
          stripe_customer_id: data.stripe_customer_id
        })
      })
      
      const result = await res.json()
      console.log('Payment intent result:', result)
      
      if (result.ok && result.client_secret) {
        setClientSecret(result.client_secret)
        // Store to avoid creating duplicate intents on re-render
        sessionStorage.setItem('maninos_client_secret', result.client_secret)
      } else {
        setError(result.detail || result.error || 'Error al iniciar el pago')
        toast.error(result.detail || result.error || 'Error al iniciar el pago')
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexión')
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handlePaymentSuccess = async (paymentIntentId: string) => {
    try {
      // Confirm payment on backend
      const res = await fetch('/api/public/purchases/payment/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sale_id: purchaseData?.sale_id,
          payment_intent_id: paymentIntentId
        })
      })
      
      const result = await res.json()
      
      if (result.ok) {
        // Clear session and redirect to confirmation
        sessionStorage.setItem('maninos_purchase_complete', JSON.stringify(result))
        sessionStorage.removeItem('maninos_purchase')
        sessionStorage.removeItem('maninos_client_secret')
        router.push(`/clientes/comprar/${propertyId}/confirmacion`)
      } else {
        toast.error(result.detail || 'Error al confirmar el pago')
      }
    } catch (err) {
      console.error('Error:', err)
      toast.error('Error al confirmar el pago')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500 mx-auto mb-4" />
          <p className="text-gray-600">Preparando el pago seguro...</p>
        </div>
      </div>
    )
  }

  if (error && !clientSecret) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center max-w-md mx-auto p-6">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Error al cargar el pago</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <Link 
            href={`/clientes/comprar/${propertyId}`}
            className="inline-block bg-gold-500 text-navy-900 font-semibold px-6 py-3 rounded-lg hover:bg-gold-400 transition-colors"
          >
            Volver a intentar
          </Link>
        </div>
      </div>
    )
  }

  if (!purchaseData) {
    return null
  }

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
            Volver a datos
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
            <div className="w-12 h-1 bg-green-500 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-green-500 text-white rounded-full">
                ✓
              </div>
              <span className="ml-2 text-green-600">Contado</span>
            </div>
            <div className="w-12 h-1 bg-gold-500 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gold-500 text-navy-900 rounded-full font-bold">
                3
              </div>
              <span className="ml-2 font-medium text-navy-900">Pago</span>
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
        
        <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Payment Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center gap-3 mb-6">
                <CreditCard className="w-6 h-6 text-gold-600" />
                <div>
                  <h1 className="text-2xl font-bold text-navy-900">
                    Método de Pago
                  </h1>
                  <p className="text-gray-600 text-sm">
                    Pago seguro con tarjeta
                  </p>
                </div>
              </div>
              
              {!stripePromise ? (
                <div className="py-8 text-center">
                  <AlertCircle className="w-6 h-6 text-red-500 mx-auto mb-2" />
                  <p className="text-red-600 text-sm">Error: Stripe no está configurado</p>
                  <p className="text-gray-500 text-xs mt-1">Falta NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY</p>
                </div>
              ) : clientSecret ? (
                <Elements 
                  stripe={stripePromise} 
                  options={{ 
                    clientSecret,
                    appearance: {
                      theme: 'stripe',
                      variables: {
                        colorPrimary: '#c9a227',
                        colorBackground: '#ffffff',
                        colorText: '#1e3a5f',
                        fontFamily: 'system-ui, sans-serif',
                        borderRadius: '8px'
                      }
                    }
                  }}
                >
                  <CheckoutForm 
                    purchaseData={purchaseData} 
                    onSuccess={handlePaymentSuccess}
                  />
                </Elements>
              ) : (
                <div className="py-8 text-center">
                  <Loader2 className="w-6 h-6 animate-spin text-gold-500 mx-auto mb-2" />
                  <p className="text-gray-500 text-sm">Cargando formulario de pago...</p>
                </div>
              )}
            </div>
            
            {/* Security info */}
            <div className="mt-6 bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-green-800 mb-1">Pago 100% Seguro</p>
                  <p className="text-sm text-green-700">
                    Tu información de pago está encriptada y procesada por Stripe, 
                    el procesador de pagos más seguro del mundo. Nunca almacenamos 
                    los datos de tu tarjeta.
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
              <h2 className="font-semibold text-navy-900 mb-4">Resumen de compra</h2>
              
              {/* Property thumbnail */}
              <div className="flex gap-4 pb-4 border-b">
                <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                  {purchaseData.property.photos?.[0] ? (
                    <img
                      src={purchaseData.property.photos[0]}
                      alt={purchaseData.property.address}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-900 text-sm line-clamp-2">
                    {purchaseData.property.address}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {purchaseData.property.city || 'Texas'}, {purchaseData.property.state || 'TX'}
                  </p>
                </div>
              </div>
              
              {/* Price */}
              <div className="py-4">
                <div className="flex justify-between">
                  <span className="font-bold text-navy-900">Total a pagar</span>
                  <span className="font-bold text-2xl text-gold-600">
                    ${purchaseData.amount?.toLocaleString()}
                  </span>
                </div>
              </div>
              
              {/* Accepted cards */}
              <div className="pt-4 border-t">
                <p className="text-xs text-gray-500 mb-2">Aceptamos</p>
                <div className="flex gap-2">
                  <div className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">Visa</div>
                  <div className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">Mastercard</div>
                  <div className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">Amex</div>
                  <div className="bg-gray-100 px-2 py-1 rounded text-xs font-medium">Discover</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
