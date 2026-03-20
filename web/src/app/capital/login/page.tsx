'use client'

export const dynamic = 'force-dynamic'

import { useState, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useToast } from '@/components/ui/Toast'
import { Loader2 } from 'lucide-react'

const ALLOWED_EMAILS = ['lupita', 'sebastian']

function isEmailAuthorized(email: string): boolean {
  const lower = email.toLowerCase()
  return ALLOWED_EMAILS.some(name => lower.includes(name))
}

function CapitalLoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const router = useRouter()
  const toast = useToast()
  const supabase = getSupabaseClient()

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    if (!isEmailAuthorized(email)) {
      setError('Acceso restringido')
      setLoading(false)
      return
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      const msg = error.message === 'Invalid login credentials'
        ? 'Correo o contrasena incorrectos'
        : error.message
      setError(msg)
      toast.error(msg)
      setLoading(false)
      return
    }

    toast.success('Bienvenido a Capital')
    router.push('/capital')
    router.refresh()
  }

  return (
    <div className="min-h-screen flex" style={{ backgroundColor: 'var(--ivory)' }}>

      {/* Left Panel - Brand */}
      <div className="hidden lg:flex w-5/12 flex-col justify-between p-12"
           style={{ backgroundColor: 'var(--navy-900)' }}>

        <div>
          <div className="flex items-center gap-3 mb-16">
            <div className="w-12 h-12 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-700)' }}>
              <span className="text-white font-serif font-bold text-xl">MC</span>
            </div>
            <div>
              <h1 className="font-serif font-bold text-xl text-white">Portal Capital</h1>
              <span className="text-sm" style={{ color: 'var(--navy-300)' }}>Maninos Capital LLC</span>
            </div>
          </div>

          <h2 className="font-serif text-4xl text-white leading-tight mb-6">
            Portal Capital<br/>Maninos Capital LLC
          </h2>
          <p className="text-lg leading-relaxed" style={{ color: 'var(--navy-300)' }}>
            Administra clientes RTO, contratos, pagos e inversionistas.
          </p>
        </div>

        <p className="text-sm" style={{ color: 'var(--navy-400)' }}>
          &copy; 2026 Maninos Capital LLC &mdash; Texas, USA
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-12">
        <div className="w-full max-w-md">

          {/* Mobile Logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10 justify-center">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-700)' }}>
              <span className="text-white font-serif font-bold text-lg">MC</span>
            </div>
            <span className="font-serif font-bold text-lg" style={{ color: 'var(--ink)' }}>
              Portal Capital
            </span>
          </div>

          {/* Form Card */}
          <div className="card p-8">

            <div className="mb-8">
              <h2 className="font-serif text-2xl mb-2" style={{ color: 'var(--ink)' }}>
                Iniciar Sesion
              </h2>
              <p style={{ color: 'var(--slate)' }}>
                Acceso exclusivo para administradores de Capital
              </p>
            </div>

            <form onSubmit={handleLogin} className="space-y-5">

              {error && (
                <div className="alert alert-error">
                  <span>{error}</span>
                </div>
              )}

              <div>
                <label className="label">Correo Electronico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="tu@correo.com"
                  required
                />
              </div>

              <div>
                <label className="label">Contrasena</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="********"
                  required
                  minLength={6}
                />
              </div>

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
                  'Ingresar'
                )}
              </button>

            </form>

          </div>

          <p className="text-center text-sm mt-6" style={{ color: 'var(--ash)' }}>
            Acceso restringido a personal autorizado
          </p>

        </div>
      </div>
    </div>
  )
}

export default function CapitalLoginPage() {
  return (
    <Suspense>
      <CapitalLoginForm />
    </Suspense>
  )
}
