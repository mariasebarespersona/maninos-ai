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
      setError(error.message === 'Invalid login credentials' ? 'Credenciales inválidas' : error.message)
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

    setMessage('Revisa tu correo para confirmar.')
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

    setMessage('Correo de recuperación enviado.')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex bg-white font-sans">
      
      {/* Left Panel - Brand Identity (Navy) */}
      <div className="hidden lg:flex w-5/12 bg-navy-900 relative overflow-hidden flex-col justify-between p-12 text-white">
        {/* Subtle Pattern Overlay */}
        <div className="absolute inset-0 opacity-10" 
             style={{ backgroundImage: 'radial-gradient(#ffffff 1px, transparent 1px)', backgroundSize: '40px 40px' }}>
        </div>
        
        {/* Gold Glow */}
        <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-gold-500/20 rounded-full blur-[120px] -translate-y-1/2 translate-x-1/2"></div>

        <div className="relative z-10">
          <div className="w-12 h-12 bg-white/10 backdrop-blur-md rounded-lg flex items-center justify-center border border-white/20 mb-6">
            <span className="text-2xl font-serif font-bold text-gold-400">M</span>
          </div>
          <h1 className="text-4xl font-serif font-bold leading-tight mb-4">
            Tu hogar,<br/>
            <span className="text-gold-400">nuestro compromiso.</span>
          </h1>
          <p className="text-navy-200 text-lg max-w-sm leading-relaxed">
            Plataforma de inteligencia artificial para la gestión inmobiliaria de excelencia.
          </p>
        </div>

        <div className="relative z-10 text-xs tracking-widest uppercase text-navy-400 font-medium">
          © 2026 Maninos Capital LLC
        </div>
      </div>

      {/* Right Panel - Form (White) */}
      <div className="flex-1 flex items-center justify-center p-8 bg-slate-50">
        <div className="w-full max-w-[400px] bg-white p-8 rounded-2xl shadow-soft border border-navy-50 animate-fade-in">
          
          <div className="text-center mb-8">
            <h2 className="text-2xl font-serif font-bold text-navy-900 mb-2">
              {mode === 'login' && 'Bienvenido'}
              {mode === 'signup' && 'Crear Cuenta'}
              {mode === 'forgot' && 'Recuperar'}
            </h2>
            <p className="text-navy-500 text-sm">
              {mode === 'login' && 'Ingresa a tu panel de control'}
              {mode === 'signup' && 'Registra una nueva cuenta de empleado'}
              {mode === 'forgot' && 'Ingresa tu correo para continuar'}
            </p>
          </div>

          {message ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <p className="text-navy-800 font-medium mb-4">{message}</p>
              <button onClick={() => {setMessage(null); setMode('login')}} className="text-gold-600 hover:text-gold-700 font-medium text-sm underline">
                Volver al inicio
              </button>
            </div>
          ) : (
            <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword} className="space-y-5">
              
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 text-red-600 text-sm rounded-lg">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-navy-500 uppercase tracking-wider mb-1.5">Correo Electrónico</label>
                <input 
                  type="email" 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input-luxury"
                  placeholder="nombre@empresa.com"
                  required
                />
              </div>

              {mode !== 'forgot' && (
                <div>
                  <label className="block text-xs font-bold text-navy-500 uppercase tracking-wider mb-1.5">Contraseña</label>
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input-luxury"
                    placeholder="••••••••"
                    required
                  />
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full shadow-lg shadow-navy-900/10">
                {loading ? 'Procesando...' : (mode === 'login' ? 'Iniciar Sesión' : mode === 'signup' ? 'Registrarse' : 'Enviar Enlace')}
              </button>

            </form>
          )}

          {!message && (
            <div className="mt-8 pt-6 border-t border-navy-50 text-center text-sm text-navy-500 flex flex-col gap-3">
              {mode === 'login' && (
                <>
                  <button onClick={() => setMode('forgot')} className="hover:text-gold-600 transition-colors">¿Olvidaste tu contraseña?</button>
                  <button onClick={() => setMode('signup')} className="hover:text-gold-600 transition-colors">¿No tienes cuenta? <span className="font-bold text-navy-700">Regístrate</span></button>
                </>
              )}
              {mode !== 'login' && (
                <button onClick={() => setMode('login')} className="hover:text-gold-600 transition-colors">← Volver al inicio de sesión</button>
              )}
            </div>
          )}

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
