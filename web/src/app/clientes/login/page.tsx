'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Loader2, ArrowRight, AlertCircle, CheckCircle, Shield, Home } from 'lucide-react'
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
      const lookupRes = await fetch(`/api/public/clients/lookup?email=${encodeURIComponent(email)}`)
      const lookupData = await lookupRes.json()
      
      if (!lookupData.ok || !lookupData.client) {
        setError('No encontramos una cuenta con este correo. ¿Ya has comprado con nosotros?')
        setLoading(false)
        return
      }
      
      const callbackUrl = `${getAppBaseUrl()}/clientes/auth/callback?next=${encodeURIComponent(nextUrl)}`
      const { error: authError } = await signInWithMagicLink(email, callbackUrl)
      
      if (authError) {
        console.error('Magic link error:', authError)
        setError('Error al enviar el enlace. Por favor intenta de nuevo.')
        setLoading(false)
        return
      }
      
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
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--mn-blue)' }} />
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center py-12 px-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #00233d 0%, #004274 50%, #005a9e 100%)' }}
    >
      {/* Decorative */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(163,141,72,0.15) 0%, transparent 70%)' }} />
        <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full" style={{ background: 'radial-gradient(circle, rgba(0,90,158,0.3) 0%, transparent 70%)' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />
      </div>

      <div className="relative max-w-md w-full mn-animate-fade-up">

        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/clientes" className="inline-block">
            <Image
              src="/images/maninos-logo.png"
              alt="Maninos Homes"
              width={160}
              height={74}
              className="mn-logo-white h-12 w-auto mx-auto"
              priority
            />
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 sm:p-10" style={{ border: '1px solid var(--mn-light-200)' }}>

          <div className="text-center mb-8">
            <div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: 'var(--mn-blue-50)' }}
            >
              <Shield className="w-7 h-7" style={{ color: 'var(--mn-blue)' }} />
            </div>
            <h1
              className="text-2xl font-black mb-2"
              style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
            >
              Accede a tu cuenta
            </h1>
            <p style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
              Te enviaremos un enlace seguro a tu correo
            </p>
          </div>

          {emailSent ? (
            <div className="text-center py-6 mn-animate-scale-in">
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                style={{ background: 'rgba(22, 163, 74, 0.1)' }}
              >
                <CheckCircle className="w-8 h-8" style={{ color: '#16a34a' }} />
              </div>
              <h2
                className="font-bold text-lg mb-2"
                style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
              >
                ¡Revisa tu correo!
              </h2>
              <p className="text-sm mb-6" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                Te hemos enviado un enlace seguro a{' '}
                <strong style={{ color: 'var(--mn-dark)' }}>{email}</strong>.
                <br />
                Haz clic en el enlace para acceder a tu cuenta.
              </p>
              <div
                className="rounded-xl p-4 text-sm"
                style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Mulish', sans-serif" }}
              >
                💡 Si no ves el correo, revisa tu carpeta de spam.
              </div>
              <button
                onClick={() => {
                  setEmailSent(false)
                  setEmail('')
                }}
                className="mt-6 text-sm font-semibold hover:underline"
                style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
              >
                Usar otro correo
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              <div className="mb-5">
                <label
                  className="block text-xs font-bold uppercase tracking-wider mb-2"
                  style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Correo electrónico
                </label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'var(--mn-gray)' }} />
                  <input
                    type="email"
                    value={email}
                    onChange={e => {
                      setEmail(e.target.value)
                      setError('')
                    }}
                    placeholder="tu@email.com"
                    className="input-brand w-full !pl-11"
                    style={error ? { borderColor: '#b91c1c' } : undefined}
                  />
                </div>
              </div>

              {error && (
                <div
                  className="mb-5 p-3.5 rounded-xl flex items-start gap-2.5"
                  style={{ background: 'rgba(185, 28, 28, 0.06)', border: '1px solid rgba(185, 28, 28, 0.15)' }}
                >
                  <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#b91c1c' }} />
                  <p className="text-sm" style={{ color: '#b91c1c', fontFamily: "'Mulish', sans-serif" }}>{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full btn-brand btn-brand-primary !py-3.5 !rounded-xl !text-base disabled:opacity-50 disabled:cursor-not-allowed"
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

              <p className="mt-4 text-center text-xs" style={{ color: 'var(--mn-gray)' }}>
                Sin contraseñas. Recibirás un enlace seguro por email.
              </p>
            </form>
          )}

          <div className="mt-8 text-center pt-6 border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
            <p className="text-sm mb-1" style={{ color: 'var(--mn-gray)' }}>
              ¿Aún no has comprado con nosotros?
            </p>
            <Link
              href="/clientes/casas"
              className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
              style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
            >
              Ver casas disponibles
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>

        {/* Help */}
        <p className="text-center text-sm mt-8" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Mulish', sans-serif" }}>
          ¿Necesitas ayuda? Llámanos al{' '}
          <a href="tel:+18327459600" className="font-semibold hover:underline" style={{ color: '#c4af6a' }}>
            (832) 745-9600
          </a>
        </p>
      </div>
    </div>
  )
}
