'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [message, setMessage] = useState<string | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/'
  
  const supabase = getSupabaseClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      setError(error.message === 'Invalid login credentials' 
        ? 'Credenciales incorrectas' : error.message)
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
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }

    setMessage('Revisa tu correo para confirmar tu cuenta')
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

    setMessage('Revisa tu correo para restablecer tu contraseña')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 bg-[#09090b]">
        {/* Large gradient orbs */}
        <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] bg-amber-500/20 rounded-full blur-[120px] animate-pulse-glow" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-orange-600/15 rounded-full blur-[100px]" />
        <div className="absolute top-[40%] right-[20%] w-[300px] h-[300px] bg-amber-400/10 rounded-full blur-[80px]" />
        
        {/* Grid pattern */}
        <div 
          className="absolute inset-0 opacity-[0.02]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }}
        />
      </div>

      {/* Left Side - Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative z-10 flex-col justify-between p-12">
        {/* Logo */}
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl blur-xl opacity-50" />
            <div className="relative w-14 h-14 bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-2xl">
              <span className="text-black text-2xl font-black">M</span>
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white tracking-tight">MANINOS</h1>
            <p className="text-amber-400/80 text-xs font-medium tracking-[0.2em]">CAPITAL</p>
          </div>
        </div>

        {/* Hero Text */}
        <div className="max-w-md">
          <h2 className="text-5xl font-bold text-white leading-[1.1] mb-6">
            Tu hogar,
            <br />
            <span className="text-gradient">nuestro compromiso</span>
          </h2>
          <p className="text-zinc-400 text-lg leading-relaxed mb-10">
            La plataforma de inteligencia artificial que transforma la gestión de casas móviles rent-to-own.
          </p>

          {/* Stats */}
          <div className="flex gap-8">
            <div>
              <div className="text-3xl font-bold text-gradient">6</div>
              <div className="text-sm text-zinc-500">Agentes IA</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gradient">24/7</div>
              <div className="text-sm text-zinc-500">Disponible</div>
            </div>
            <div>
              <div className="text-3xl font-bold text-gradient">100%</div>
              <div className="text-sm text-zinc-500">Automatizado</div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-zinc-600 text-sm">
          Conroe, Texas • 832-745-9600
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12 relative z-10">
        <div className="w-full max-w-[420px]">
          {/* Mobile Logo */}
          <div className="lg:hidden flex justify-center mb-10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center">
                <span className="text-black text-xl font-black">M</span>
              </div>
              <span className="text-xl font-bold text-white">MANINOS</span>
            </div>
          </div>

          {/* Card */}
          <div className="card p-8 animate-fade-in">
            {/* Header */}
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-white mb-2">
                {mode === 'login' && 'Bienvenido'}
                {mode === 'signup' && 'Crear cuenta'}
                {mode === 'forgot' && 'Recuperar acceso'}
              </h3>
              <p className="text-zinc-500">
                {mode === 'login' && 'Ingresa tus credenciales'}
                {mode === 'signup' && 'Registra tu cuenta de empleado'}
                {mode === 'forgot' && 'Te enviaremos instrucciones'}
              </p>
            </div>

            {message ? (
              <div className="text-center py-6 animate-fade-in">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <svg className="w-8 h-8 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-white mb-6">{message}</p>
                <button
                  onClick={() => { setMessage(null); setMode('login'); }}
                  className="text-amber-400 hover:text-amber-300 font-medium"
                >
                  Volver al login
                </button>
              </div>
            ) : (
              <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword}>
                {error && (
                  <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm animate-fade-in">
                    {error}
                  </div>
                )}

                <div className="space-y-5">
                  {/* Email */}
                  <div>
                    <label className="block text-sm font-medium text-zinc-300 mb-2">
                      Correo electrónico
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="input"
                      placeholder="tu@email.com"
                    />
                  </div>

                  {/* Password */}
                  {mode !== 'forgot' && (
                    <div>
                      <label className="block text-sm font-medium text-zinc-300 mb-2">
                        Contraseña
                      </label>
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        minLength={6}
                        className="input"
                        placeholder="••••••••"
                      />
                    </div>
                  )}

                  {/* Submit */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="btn-primary w-full h-12"
                  >
                    {loading ? (
                      <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <>
                        {mode === 'login' && 'Iniciar sesión'}
                        {mode === 'signup' && 'Crear cuenta'}
                        {mode === 'forgot' && 'Enviar instrucciones'}
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}

            {/* Links */}
            {!message && (
              <div className="mt-8 text-center text-sm">
                {mode === 'login' && (
                  <>
                    <button
                      onClick={() => setMode('forgot')}
                      className="text-zinc-500 hover:text-white transition-colors"
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                    <div className="mt-6 pt-6 border-t border-zinc-800 text-zinc-500">
                      ¿No tienes cuenta?{' '}
                      <button
                        onClick={() => setMode('signup')}
                        className="text-amber-400 hover:text-amber-300 font-semibold"
                      >
                        Regístrate
                      </button>
                    </div>
                  </>
                )}
                {mode === 'signup' && (
                  <div className="text-zinc-500">
                    ¿Ya tienes cuenta?{' '}
                    <button
                      onClick={() => setMode('login')}
                      className="text-amber-400 hover:text-amber-300 font-semibold"
                    >
                      Inicia sesión
                    </button>
                  </div>
                )}
                {mode === 'forgot' && (
                  <button
                    onClick={() => setMode('login')}
                    className="text-zinc-500 hover:text-white transition-colors"
                  >
                    ← Volver al login
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Copyright */}
          <p className="text-center text-zinc-700 text-xs mt-8">
            © 2026 Maninos Capital LLC
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
