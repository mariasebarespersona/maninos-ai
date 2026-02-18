'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { Lock, Loader2, CheckCircle, AlertCircle, Eye, EyeOff } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { updatePassword, getClientUser } from '@/lib/supabase/client-auth'

export default function CreatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    // The user should already have a session from the callback redirect
    const check = async () => {
      const user = await getClientUser()
      if (!user) {
        // No session — the link may have expired
        router.push('/clientes/login?error=auth_callback_failed')
        return
      }
      setCheckingAuth(false)
    }
    check()
  }, [router])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password || password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres')
      return
    }
    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden')
      return
    }

    setLoading(true)
    try {
      const { error: updateError } = await updatePassword(password)
      if (updateError) {
        setError('Error al actualizar la contraseña. Intenta de nuevo.')
        return
      }
      setSuccess(true)
      toast.success('¡Contraseña creada!')
      setTimeout(() => router.push('/clientes/mi-cuenta'), 2000)
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
    } finally {
      setLoading(false)
    }
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

          {success ? (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="font-bold text-[18px] text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>
                ¡Contraseña creada!
              </h2>
              <p className="text-[14px] text-[#717171]">
                Redirigiendo a tu cuenta...
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <h1 className="text-[20px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>
                  Crea tu contraseña
                </h1>
                <p className="text-[14px] text-[#717171]">
                  Elige una contraseña segura para tu cuenta
                </p>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Nueva contraseña</label>
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

                <div className="mb-4">
                  <label className="block text-[13px] font-semibold text-[#222] mb-1.5">Confirmar contraseña</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={e => { setConfirmPassword(e.target.value); setError('') }}
                      placeholder="Repite tu contraseña"
                      className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
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
                    <><Loader2 className="w-4 h-4 animate-spin" /> Guardando...</>
                  ) : (
                    'Guardar contraseña'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

