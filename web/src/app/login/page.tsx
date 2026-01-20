'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { Mail, Lock, ArrowRight, Eye, EyeOff, Phone, MapPin, Home } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [message, setMessage] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/'
  
  const supabase = getSupabaseClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? 'Credenciales incorrectas. Verifica tu email y contraseña.'
        : error.message)
      setLoading(false)
      return
    }

    router.push(redirectTo)
    router.refresh()
  }

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Revisa tu correo para confirmar tu cuenta.')
    setLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Revisa tu correo para restablecer tu contraseña.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex bg-grid">
      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-[600px] h-[600px] bg-amber-500/10 rounded-full blur-[150px]" />
        <div className="absolute bottom-1/4 right-1/4 w-[400px] h-[400px] bg-blue-500/8 rounded-full blur-[120px]" />
      </div>

      {/* Left Panel - Branding */}
      <div className="hidden lg:flex lg:w-1/2 xl:w-3/5 relative flex-col justify-between p-12 bg-glow">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute -inset-2 bg-gradient-to-r from-amber-400/40 to-orange-500/40 rounded-2xl blur-xl" />
            <div className="relative w-14 h-14 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-2xl shadow-xl">
              M
            </div>
          </div>
          <div>
            <h1 className="text-white font-bold text-2xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
              MANINOS
            </h1>
            <p className="text-amber-400/80 text-xs font-medium uppercase tracking-widest">
              AI Platform
            </p>
          </div>
        </div>

        {/* Hero Content */}
        <div className="max-w-lg">
          <h2 
            className="text-4xl xl:text-5xl font-bold text-white mb-6 leading-tight"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            Tu hogar,{' '}
            <span className="gradient-text">nuestro compromiso</span>
          </h2>
          <p className="text-slate-400 text-lg leading-relaxed mb-8">
            Plataforma inteligente para la gestión de casas móviles rent-to-own. 
            Automatiza tus procesos con el poder de la inteligencia artificial.
          </p>

          {/* Features */}
          <div className="space-y-4">
            {[
              { icon: Home, text: '6 Agentes especializados para cada proceso' },
              { icon: Lock, text: 'Verificación KYC automatizada con Stripe' },
              { icon: Phone, text: 'Soporte 24/7 vía WhatsApp: 832-745-9600' },
            ].map((feature, i) => (
              <div key={i} className="flex items-center gap-4 text-slate-300">
                <div className="p-2 rounded-lg bg-amber-500/10">
                  <feature.icon size={18} className="text-amber-400" />
                </div>
                <span className="text-sm">{feature.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center gap-6 text-slate-500 text-sm">
          <a href="https://www.maninoshomes.com" target="_blank" rel="noopener noreferrer" className="hover:text-amber-400 transition-colors">
            maninoshomes.com
          </a>
          <span>•</span>
          <span className="flex items-center gap-2">
            <MapPin size={14} />
            Conroe, Texas
          </span>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md">
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center justify-center gap-3 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-xl flex items-center justify-center text-white font-bold text-xl shadow-lg">
              M
            </div>
            <div>
              <h1 className="text-white font-bold text-xl tracking-tight" style={{ fontFamily: 'var(--font-display)' }}>
                MANINOS AI
              </h1>
            </div>
          </div>

          {/* Card */}
          <div className="card p-8 shadow-2xl border-white/10">
            {/* Header */}
            <div className="text-center mb-8">
              <h3 
                className="text-2xl font-bold text-white mb-2"
                style={{ fontFamily: 'var(--font-display)' }}
              >
                {mode === 'login' && '¡Bienvenido de vuelta!'}
                {mode === 'signup' && 'Crear cuenta'}
                {mode === 'forgot' && 'Recuperar contraseña'}
              </h3>
              <p className="text-slate-400 text-sm">
                {mode === 'login' && 'Ingresa a tu cuenta para continuar'}
                {mode === 'signup' && 'Regístrate como empleado de Maninos'}
                {mode === 'forgot' && 'Te enviaremos un enlace de recuperación'}
              </p>
            </div>

            {message ? (
              /* Success Message */
              <div className="text-center py-8 animate-fade-in">
                <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-6">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white text-lg mb-6">{message}</p>
                <button
                  onClick={() => { setMessage(null); setMode('login'); }}
                  className="text-amber-400 hover:text-amber-300 font-medium transition-colors"
                >
                  Volver al login
                </button>
              </div>
            ) : (
              /* Form */
              <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword}>
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                    {error}
                  </div>
                )}

                <div className="space-y-5">
                  {/* Email */}
                  <div>
                    <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                      Correo electrónico
                    </label>
                    <div className="relative">
                      <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                      <input
                        id="email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        className="input pl-12"
                        placeholder="tu@email.com"
                      />
                    </div>
                  </div>

                  {/* Password */}
                  {mode !== 'forgot' && (
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-slate-300 mb-2">
                        Contraseña
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-500" />
                        <input
                          id="password"
                          type={showPassword ? 'text' : 'password'}
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={6}
                          className="input pl-12 pr-12"
                          placeholder="••••••••"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                        >
                          {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Submit Button */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full h-12 text-base"
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Procesando...
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-2">
                        {mode === 'login' && 'Iniciar sesión'}
                        {mode === 'signup' && 'Crear cuenta'}
                        {mode === 'forgot' && 'Enviar enlace'}
                        <ArrowRight size={18} />
                      </span>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Footer links */}
            {!message && (
              <div className="mt-8 text-center text-sm">
                {mode === 'login' && (
                  <>
                    <button
                      onClick={() => setMode('forgot')}
                      className="text-slate-400 hover:text-white transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                    <div className="mt-6 pt-6 border-t border-white/10 text-slate-500">
                      ¿No tienes cuenta?{' '}
                      <button
                        onClick={() => setMode('signup')}
                        className="text-amber-400 hover:text-amber-300 font-medium transition-colors"
                      >
                        Regístrate
                      </button>
                    </div>
                  </>
                )}
                {mode === 'signup' && (
                  <div className="text-slate-500">
                    ¿Ya tienes cuenta?{' '}
                    <button
                      onClick={() => setMode('login')}
                      className="text-amber-400 hover:text-amber-300 font-medium transition-colors"
                    >
                      Inicia sesión
                    </button>
                  </div>
                )}
                {mode === 'forgot' && (
                  <button
                    onClick={() => setMode('login')}
                    className="text-slate-400 hover:text-white transition-colors flex items-center gap-2 mx-auto"
                  >
                    ← Volver al login
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Copyright */}
          <p className="text-center text-slate-600 text-xs mt-8">
            © 2026 Maninos Capital LLC. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}
