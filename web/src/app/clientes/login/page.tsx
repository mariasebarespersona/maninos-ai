'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Loader2, ArrowRight, AlertCircle, CheckCircle } from 'lucide-react'
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

  const callbackError = searchParams.get('error')

  useEffect(() => {
    if (callbackError === 'auth_callback_failed') {
      setError('El enlace ha expirado o es inválido. Por favor solicita uno nuevo.')
    }
    const checkAuth = async () => {
      const user = await getClientUser()
      if (user) { router.push('/clientes/mi-cuenta') }
      else { setCheckingAuth(false) }
    }
    checkAuth()
  }, [router, callbackError])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Por favor ingresa tu correo electrónico'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Correo electrónico inválido'); return }
    setLoading(true)
    try {
      const lookupRes = await fetch(`/api/public/clients/lookup?email=${encodeURIComponent(email)}`)
      const lookupData = await lookupRes.json()
      if (!lookupData.ok || !lookupData.client) {
        setError('No encontramos una cuenta con este correo. ¿Ya has comprado con nosotros?')
        setLoading(false)
        return
      }
      const callbackUrl = `${getAppBaseUrl()}/clientes/auth/callback?next=${encodeURIComponent(nextUrl)}`
      const { error: authError } = await signInWithMagicLink(email, callbackUrl)
      if (authError) { setError('Error al enviar el enlace. Por favor intenta de nuevo.'); setLoading(false); return }
      setEmailSent(true)
      toast.success('¡Enlace enviado a tu correo!')
    } catch {
      setError('Error de conexión. Por favor intenta de nuevo.')
    } finally { setLoading(false) }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 bg-gray-50">
      <div className="max-w-sm w-full">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/clientes" className="inline-block">
            <Image
              src="/images/maninos-logo.png"
              alt="Maninos Homes"
              width={140}
              height={64}
              className="h-10 w-auto mx-auto"
              priority
            />
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8">

          {emailSent ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="font-semibold text-lg text-[#222] mb-2">¡Revisa tu correo!</h2>
              <p className="text-sm text-gray-500 mb-6">
                Te enviamos un enlace seguro a <strong className="text-[#222]">{email}</strong>. Haz clic para acceder.
              </p>
              <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-700">
                Si no lo ves, revisa tu carpeta de spam.
              </div>
              <button
                onClick={() => { setEmailSent(false); setEmail('') }}
                className="mt-6 text-sm font-medium text-gray-500 underline hover:text-[#222]"
              >
                Usar otro correo
              </button>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-[#222] mb-1">Accede a tu cuenta</h1>
                <p className="text-sm text-gray-500">Te enviaremos un enlace seguro por email</p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#222] mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="tu@email.com"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent transition-colors ${
                        error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                </div>

                {error && (
                  <div className="mb-4 p-3 rounded-lg bg-red-50 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                    <p className="text-sm text-red-600">{error}</p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-sm transition-colors disabled:opacity-50"
                  style={{ background: '#FF385C' }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <>Enviar enlace de acceso <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>

                <p className="mt-3 text-center text-xs text-gray-400">
                  Sin contraseñas. Recibirás un enlace seguro.
                </p>
              </form>
            </>
          )}

          <div className="mt-6 pt-6 border-t border-gray-100 text-center">
            <p className="text-sm text-gray-500 mb-1">¿Aún no has comprado con nosotros?</p>
            <Link href="/clientes/casas" className="text-sm font-semibold text-[#004274] hover:underline inline-flex items-center gap-1">
              Ver casas disponibles <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        <p className="text-center text-xs text-gray-400 mt-6">
          ¿Necesitas ayuda? Llámanos al{' '}
          <a href="tel:+18327459600" className="font-medium text-gray-500 hover:underline">(832) 745-9600</a>
        </p>
      </div>
    </div>
  )
}
