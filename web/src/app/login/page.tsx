'use client'

export const dynamic = 'force-dynamic'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { getAppBaseUrl } from '@/lib/supabase/client-auth'
import { useToast } from '@/components/ui/Toast'
import { Loader2 } from 'lucide-react'

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [message, setMessage] = useState<string | null>(null)
  
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirectTo = searchParams.get('redirectTo') || '/homes'
  const toast = useToast()
  
  const supabase = getSupabaseClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = error.message === 'Invalid login credentials' 
        ? 'Correo o contraseña incorrectos' 
        : error.message
      setError(msg)
      toast.error(msg)
      setLoading(false)
      return
    }

    toast.success('Bienvenido')
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
      options: { emailRedirectTo: `${getAppBaseUrl()}/auth/callback` },
    })

    if (error) {
      setError(error.message)
      toast.error(error.message)
      setLoading(false)
      return
    }

    setMessage('Cuenta creada. Revisa tu correo para confirmar.')
    toast.success('Cuenta creada')
    setLoading(false)
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${getAppBaseUrl()}/auth/callback?type=recovery`,
    })

    if (error) {
      setError(error.message)
      toast.error(error.message)
      setLoading(false)
      return
    }

    setMessage('Te enviamos un correo con instrucciones.')
    toast.success('Correo enviado')
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--ivory)' }}>
      
      {/* Left Panel - Brand */}
      <div className="hidden lg:flex w-5/12 flex-col justify-between p-12"
           style={{ backgroundColor: 'var(--navy-900)' }}>
        
        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-500)' }}>
              <span className="text-white font-serif font-bold text-xl">M</span>
            </div>
            <div>
              <h1 className="font-serif font-bold text-xl text-white">Maninos Homes</h1>
            </div>
          </div>
          
          <h2 className="font-serif text-4xl text-white leading-tight mb-6">
            Sistema de<br/>Gestión Inmobiliaria
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--navy-300)' }}>
            Administra propiedades, clientes y ventas de casas móviles en Texas.
          </p>
        </div>

        <p className="text-sm" style={{ color: 'var(--navy-400)' }}>
          © 2026 Maninos Homes LLC — Texas, USA
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">
          
          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: 'var(--navy-800)' }}>
              <span className="text-white font-serif font-bold text-lg">M</span>
            </div>
            <span className="font-serif font-bold text-lg" style={{ color: 'var(--ink)' }}>
              Maninos Homes
            </span>
          </div>

          {/* Form Card */}
          <div className="card p-8">
            
            <div className="mb-8">
              <h2 className="font-serif text-2xl mb-2" style={{ color: 'var(--ink)' }}>
                {mode === 'login' && 'Iniciar Sesión'}
                {mode === 'signup' && 'Crear Cuenta'}
                {mode === 'forgot' && 'Recuperar Contraseña'}
              </h2>
              <p style={{ color: 'var(--slate)' }}>
                {mode === 'login' && 'Ingresa con tu correo y contraseña'}
                {mode === 'signup' && 'Registra una nueva cuenta'}
                {mode === 'forgot' && 'Te enviaremos un enlace de recuperación'}
              </p>
            </div>

            {message ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                     style={{ backgroundColor: 'var(--success-light)' }}>
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="var(--success)">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <p className="text-lg mb-6" style={{ color: 'var(--charcoal)' }}>{message}</p>
                <button 
                  onClick={() => {setMessage(null); setMode('login')}} 
                  className="btn-secondary"
                >
                  Volver al inicio
                </button>
              </div>
            ) : (
              <form onSubmit={mode === 'login' ? handleLogin : mode === 'signup' ? handleSignup : handleForgotPassword} 
                    className="space-y-5">
                
                {error && (
                  <div className="alert alert-error">
                    <span>{error}</span>
                  </div>
                )}

                <div>
                  <label className="label">Correo Electrónico</label>
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="tu@correo.com"
                    required
                  />
                </div>

                {mode !== 'forgot' && (
                  <div>
                    <label className="label">Contraseña</label>
                    <input 
                      type="password" 
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="input"
                      placeholder="••••••••"
                      required
                      minLength={6}
                    />
                    {mode === 'signup' && (
                      <p className="help-text">Mínimo 6 caracteres</p>
                    )}
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={loading} 
                  className="btn-primary w-full"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    <>
                      {mode === 'login' && 'Ingresar'}
                      {mode === 'signup' && 'Crear Cuenta'}
                      {mode === 'forgot' && 'Enviar Enlace'}
                    </>
                  )}
                </button>

              </form>
            )}

            {!message && (
              <div className="mt-6 pt-6 border-t space-y-3" style={{ borderColor: 'var(--sand)' }}>
                {mode === 'login' && (
                  <>
                    <button 
                      onClick={() => setMode('forgot')} 
                      className="text-sm w-full text-center transition-colors"
                      style={{ color: 'var(--slate)' }}
                    >
                      ¿Olvidaste tu contraseña?
                    </button>
                    <button 
                      onClick={() => setMode('signup')} 
                      className="text-sm w-full text-center transition-colors"
                      style={{ color: 'var(--slate)' }}
                    >
                      ¿No tienes cuenta? <span style={{ color: 'var(--charcoal)', fontWeight: 600 }}>Regístrate</span>
                    </button>
                  </>
                )}
                {mode !== 'login' && (
                  <button 
                    onClick={() => setMode('login')} 
                    className="text-sm w-full text-center transition-colors"
                    style={{ color: 'var(--slate)' }}
                  >
                    ← Volver al inicio
                  </button>
                )}
              </div>
            )}

          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--ash)' }}>
            ¿Necesitas ayuda?{' '}
            <a href="mailto:info@maninoshomes.com" 
               className="font-medium"
               style={{ color: 'var(--navy-600)' }}>
              info@maninoshomes.com
            </a>
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
