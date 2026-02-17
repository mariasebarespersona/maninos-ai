'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Home, Mail, Loader2, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { signInWithMagicLink, getClientUser, getAppBaseUrl } from '@/lib/supabase/client-auth'

export default function ClientLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/clientes/mi-cuenta'
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [emailSent, setEmailSent] = useState(false)

  // Show error if callback failed
  const callbackError = searchParams.get('error')

  // Check if already logged in
  useEffect(() => {
    if (callbackError === 'auth_callback_failed') {
      setError('El enlace ha expirado o es inválido. Por favor solicita uno nuevo.')
    }
    
    const checkAuth = async () => {
      const user = await getClientUser()
      if (user) {
        router.push('/clientes/mi-cuenta')
      } else {
        setCheckingAuth(false)
      }
    }
    checkAuth()
  }, [router, callbackError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!email.trim()) {
      setError('Por favor ingresa tu correo electrónico')
      return
    }
    
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Correo electrónico inválido')
      return
    }
    
    setLoading(true)
    
    try {
      // First check if this email exists in our clients table
      const lookupRes = await fetch(`/api/public/clients/lookup?email=${encodeURIComponent(email)}`)
      const lookupData = await lookupRes.json()
      
      if (!lookupData.ok || !lookupData.client) {
        setError('No encontramos una cuenta con este correo. ¿Ya has comprado con nosotros?')
        setLoading(false)
        return
      }
      
      // Send magic link via Supabase Auth
      // Include the next URL so after verification the user lands on the right page
      const callbackUrl = `${getAppBaseUrl()}/clientes/auth/callback?next=${encodeURIComponent(nextUrl)}`
      const { error: authError } = await signInWithMagicLink(email, callbackUrl)
      
      if (authError) {
        console.error('Magic link error:', authError)
        setError('Error al enviar el enlace. Por favor intenta de nuevo.')
        setLoading(false)
        return
      }
      
      // Success - email sent
      setEmailSent(true)
      toast.success('¡Enlace enviado a tu correo!')
      
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexión. Por favor intenta de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white flex items-center justify-center py-12 px-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/clientes" className="inline-flex items-center gap-3">
            <div className="w-12 h-12 bg-gold-500 rounded-xl flex items-center justify-center">
              <Home className="w-7 h-7 text-navy-900" />
            </div>
            <span className="font-bold text-2xl text-navy-900">Maninos Homes</span>
          </Link>
        </div>
        
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <h1 className="text-2xl font-bold text-navy-900 text-center mb-2">
            Accede a tu cuenta
          </h1>
          <p className="text-gray-600 text-center mb-8">
            Te enviaremos un enlace seguro a tu correo
          </p>
          
          {emailSent ? (
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="font-semibold text-navy-900 mb-2">
                ¡Revisa tu correo!
              </h2>
              <p className="text-gray-600 text-sm mb-4">
                Te hemos enviado un enlace seguro a <strong>{email}</strong>.
                <br />
                Haz clic en el enlace para acceder a tu cuenta.
              </p>
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-700">
                <p>💡 Si no ves el correo, revisa tu carpeta de spam.</p>
              </div>
              <button
                onClick={() => {
                  setEmailSent(false)
                  setEmail('')
                }}
                className="mt-6 text-sm text-gold-600 hover:text-gold-700 font-medium"
              >
                Usar otro correo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      setError('')
                    }}
                    placeholder="tu@email.com"
                    className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                      error ? 'border-red-500' : 'border-gray-300'
                    }`}
                  />
                </div>
              </div>
              
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-red-700">{error}</p>
                </div>
              )}
              
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-500 text-navy-900 font-bold py-3 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Enviando enlace...
                  </>
                ) : (
                  <>
                    Enviar enlace de acceso
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
              
              <div className="mt-4 text-center">
                <p className="text-xs text-gray-400">
                  Sin contraseñas. Recibirás un enlace seguro por email.
                </p>
              </div>
            </form>
          )}
          
          <div className="mt-6 text-center">
            <p className="text-sm text-gray-500">
              ¿Aún no has comprado con nosotros?
            </p>
            <Link 
              href="/clientes/casas" 
              className="text-sm text-gold-600 hover:text-gold-700 font-medium"
            >
              Ver casas disponibles →
            </Link>
          </div>
        </div>
        
        {/* Help */}
        <p className="text-center text-gray-500 text-sm mt-6">
          ¿Necesitas ayuda? Llámanos al{' '}
          <a href="tel:+18327459600" className="text-gold-600 hover:underline">
            (832) 745-9600
          </a>
        </p>
      </div>
    </div>
  )
}
