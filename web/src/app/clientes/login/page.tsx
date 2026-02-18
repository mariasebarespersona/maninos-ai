'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Mail, Lock, Loader2, ArrowRight, AlertCircle, CheckCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { signInWithPassword, signUpWithPassword, sendPasswordResetEmail, getClientUser } from '@/lib/supabase/client-auth'

type AuthMode = 'login' | 'register' | 'forgot'

export default function ClientLoginPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const nextUrl = searchParams.get('next') || '/clientes/mi-cuenta'
  const [mode, setMode] = useState<AuthMode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const callbackError = searchParams.get('error')

  useEffect(() => {
    if (callbackError === 'auth_callback_failed') {
      setError('El enlace ha expirado o es inválido. Por favor intenta de nuevo.')
    }
    const checkAuth = async () => {
      const user = await getClientUser()
      if (user) { router.push('/clientes/mi-cuenta') }
      else { setCheckingAuth(false) }
    }
    checkAuth()
  }, [router, callbackError])

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Por favor ingresa tu correo electrónico'); return }
    if (!password) { setError('Por favor ingresa tu contraseña'); return }
    setLoading(true)
    try {
      const { error: authError } = await signInWithPassword(email, password)
      if (authError) {
        if (authError.message.includes('Invalid login credentials')) {
          setError('Correo o contraseña incorrectos. ¿Olvidaste tu contraseña?')
        } else if (authError.message.includes('Email not confirmed')) {
          setError('Necesitas confirmar tu correo electrónico. Revisa tu bandeja de entrada.')
        } else {
          setError('Error al iniciar sesión. Intenta de nuevo.')
        }
        return
      }
      toast.success('¡Bienvenido!')
      router.push(nextUrl)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally { setLoading(false) }
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Por favor ingresa tu correo electrónico'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Correo electrónico inválido'); return }
    if (!password || password.length < 6) { setError('La contraseña debe tener al menos 6 caracteres'); return }
    setLoading(true)
    try {
      // Check if client exists in our DB
      const lookupRes = await fetch(`/api/public/clients/lookup?email=${encodeURIComponent(email)}`)
      const lookupData = await lookupRes.json()
      if (!lookupData.ok || !lookupData.client) {
        setError('No encontramos una cuenta con este correo. Para crear una cuenta, primero solicita una casa en nuestro catálogo.')
        setLoading(false)
        return
      }

      const { data, error: authError } = await signUpWithPassword(email, password)
      if (authError) {
        if (authError.message.includes('already registered')) {
          setError('Este correo ya tiene una cuenta. ¿Olvidaste tu contraseña?')
        } else {
          setError('Error al crear la cuenta. Intenta de nuevo.')
        }
        return
      }
      
      // Check if email confirmation is needed
      if (data?.user?.identities?.length === 0) {
        setError('Este correo ya tiene una cuenta. Intenta iniciar sesión.')
        return
      }
      
      setSuccessMessage('¡Cuenta creada! Revisa tu correo para confirmar tu cuenta.')
      toast.success('¡Revisa tu correo!')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally { setLoading(false) }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (!email.trim()) { setError('Por favor ingresa tu correo electrónico'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Correo electrónico inválido'); return }
    setLoading(true)
    try {
      const { error: resetError } = await sendPasswordResetEmail(email)
      if (resetError) { setError('Error al enviar el enlace. Intenta de nuevo.'); return }
      setSuccessMessage('¡Enlace enviado! Revisa tu correo para crear una nueva contraseña.')
      toast.success('¡Revisa tu correo!')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
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

          {successMessage ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="font-bold text-[18px] text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>¡Revisa tu correo!</h2>
              <p className="text-[14px] text-[#717171] mb-6">{successMessage}</p>
              <div className="bg-blue-50 rounded-lg p-3 text-[13px] text-blue-700">
                Si no lo ves, revisa tu carpeta de spam.
              </div>
              <button
                onClick={() => { setSuccessMessage(''); setMode('login'); setError('') }}
                className="mt-6 text-[13px] font-medium text-[#717171] underline hover:text-[#222]"
              >
                Volver al inicio de sesión
              </button>
            </div>
          ) : mode === 'login' ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-[20px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>Accede a tu cuenta</h1>
                <p className="text-[14px] text-[#717171]">Ingresa tu correo y contraseña</p>
              </div>

              <form onSubmit={handleLogin}>
                <div className="mb-3">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="tu@email.com"
                      className={`w-full pl-10 pr-4 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent transition-colors ${
                        error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="Tu contraseña"
                      className={`w-full pl-10 pr-10 py-3 rounded-xl border text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent transition-colors ${
                        error ? 'border-red-300 bg-red-50' : 'border-gray-300 bg-white'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <div className="text-right mt-1.5">
                    <button
                      type="button"
                      onClick={() => { setMode('forgot'); setError('') }}
                      className="text-[12px] text-[#004274] hover:underline font-medium"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[15px] transition-colors disabled:opacity-50"
                  style={{ background: '#0068b7' }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Entrando...</>
                  ) : (
                    <>Iniciar sesión <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                <p className="text-[13px] text-[#717171] mb-1">¿No tienes cuenta?</p>
                <button
                  onClick={() => { setMode('register'); setError('') }}
                  className="text-[13px] font-semibold text-[#004274] hover:underline inline-flex items-center gap-1"
                >
                  Crear contraseña <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </>
          ) : mode === 'register' ? (
            <>
              <div className="text-center mb-6">
                <h1 className="text-[20px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>Crear tu cuenta</h1>
                <p className="text-[14px] text-[#717171]">Ingresa tu correo y elige una contraseña</p>
              </div>

              <form onSubmit={handleRegister}>
                <div className="mb-3">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="tu@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                    />
                  </div>
                </div>

                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => { setPassword(e.target.value); setError('') }}
                      placeholder="Mínimo 6 caracteres"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[15px] transition-colors disabled:opacity-50"
                  style={{ background: '#0068b7' }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Creando cuenta...</>
                  ) : (
                    <>Crear cuenta <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="text-[13px] font-medium text-[#717171] hover:text-[#222] underline"
                >
                  Ya tengo cuenta — Iniciar sesión
                </button>
              </div>
            </>
          ) : (
            /* FORGOT PASSWORD */
            <>
              <div className="text-center mb-6">
                <h1 className="text-[20px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>Recuperar contraseña</h1>
                <p className="text-[14px] text-[#717171]">Te enviaremos un enlace para crear una nueva</p>
              </div>

              <form onSubmit={handleForgotPassword}>
                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Correo electrónico</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => { setEmail(e.target.value); setError('') }}
                      placeholder="tu@email.com"
                      className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
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
                  className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[15px] transition-colors disabled:opacity-50"
                  style={{ background: '#0068b7' }}
                >
                  {loading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                  ) : (
                    <>Enviar enlace <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>

              <div className="mt-5 pt-5 border-t border-gray-100 text-center">
                <button
                  onClick={() => { setMode('login'); setError('') }}
                  className="text-[13px] font-medium text-[#717171] hover:text-[#222] underline"
                >
                  Volver al inicio de sesión
                </button>
              </div>
            </>
          )}
        </div>

        <p className="text-center text-[12px] text-[#b0b0b0] mt-6">
          ¿Necesitas ayuda? Llámanos al{' '}
          <a href="tel:+19362005200" className="font-medium text-[#717171] hover:underline">(936) 200-5200</a>
        </p>
      </div>
    </div>
  )
}
