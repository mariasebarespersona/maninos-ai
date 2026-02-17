'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ShieldCheck,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Camera,
  FileText,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

export default function ClientVerificationPage() {
  const searchParams = useSearchParams()
  const statusParam = searchParams.get('status') // 'complete' when returning from Stripe
  const { client, loading: authLoading } = useClientAuth()

  const [kycStatus, setKycStatus] = useState<string>('loading')
  const [kycVerified, setKycVerified] = useState(false)
  const [kycRequested, setKycRequested] = useState(false)
  const [kycFailReason, setKycFailReason] = useState<string | null>(null)
  const [hasSession, setHasSession] = useState(false)
  const [starting, setStarting] = useState(false)
  const [checking, setChecking] = useState(false)

  const loadKycStatus = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/kyc-status`)
      const data = await res.json()
      if (data.ok) {
        setKycVerified(data.kyc_verified || false)
        setKycStatus(data.kyc_status || 'unverified')
        setKycRequested(data.kyc_requested || false)
        setKycFailReason(data.kyc_failure_reason || null)
        setHasSession(data.has_session || false)
      }
    } catch (err) {
      console.error('Error loading KYC status:', err)
      setKycStatus('error')
    }
  }, [])

  // Load KYC status when client loads
  useEffect(() => {
    if (client) {
      loadKycStatus(client.id)
    }
  }, [client, loadKycStatus])

  // If returning from Stripe, automatically poll result
  useEffect(() => {
    if (client && statusParam === 'complete') {
      handleCheckResult()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, statusParam])

  const handleStartVerification = async () => {
    if (!client) return
    setStarting(true)
    try {
      const res = await fetch(`/api/public/clients/${client.id}/kyc-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          return_url: window.location.origin,
        }),
      })
      const data = await res.json()
      if (data.ok && data.url) {
        // Redirect client to Stripe Identity verification
        window.location.href = data.url
      } else if (data.already_verified) {
        toast.success('¡Tu identidad ya está verificada!')
        setKycVerified(true)
        setKycStatus('verified')
      } else {
        toast.error(data.detail || 'Error al iniciar verificación')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setStarting(false)
    }
  }

  const handleCheckResult = async () => {
    if (!client) return
    setChecking(true)
    try {
      const res = await fetch(`/api/public/clients/${client.id}/kyc-check`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.ok) {
        setKycVerified(data.verified || false)
        setKycStatus(data.status || 'pending')
        if (data.verified) {
          toast.success('✅ ¡Tu identidad ha sido verificada!')
        } else if (data.status === 'pending') {
          toast.info('⏳ Tu verificación está siendo procesada...')
        } else if (data.status === 'requires_input') {
          toast.error('La verificación necesita reintento')
          setKycFailReason(data.message || null)
        }
      }
    } catch (err) {
      toast.error('Error al consultar estado')
    } finally {
      setChecking(false)
    }
  }

  if (authLoading || kycStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-900 text-white">
        <div className="container mx-auto px-4 py-6">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Volver a Mi Cuenta
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-gold-400" />
            Verificación de Identidad
          </h1>
          <p className="text-gray-300 mt-1">
            Para completar tu solicitud de Rent-to-Own, necesitamos verificar tu identidad.
          </p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-2xl mx-auto">
          {/* VERIFIED */}
          {kycVerified && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-green-50 p-8 text-center">
                <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-12 h-12 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-green-800 mb-2">
                  ¡Identidad Verificada!
                </h2>
                <p className="text-green-600">
                  Tu identidad ha sido verificada exitosamente. No necesitas hacer nada más.
                </p>
              </div>
              <div className="p-6 text-center">
                <Link
                  href="/clientes/mi-cuenta"
                  className="inline-flex items-center gap-2 bg-navy-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-navy-800 transition-colors"
                >
                  Volver a Mi Cuenta
                </Link>
              </div>
            </div>
          )}

          {/* PENDING — waiting for Stripe to process */}
          {!kycVerified && kycStatus === 'pending' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-amber-50 p-8 text-center">
                <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-12 h-12 text-amber-600 animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-amber-800 mb-2">
                  Verificación en Proceso
                </h2>
                <p className="text-amber-600 mb-4">
                  Tu verificación está siendo procesada. Esto puede tomar unos minutos.
                </p>
                <button
                  onClick={handleCheckResult}
                  disabled={checking}
                  className="inline-flex items-center gap-2 bg-amber-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-amber-600 transition-colors"
                >
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Verificar Estado
                </button>
              </div>

              {hasSession && (
                <div className="p-6 border-t text-center">
                  <p className="text-gray-500 text-sm mb-3">¿No completaste la verificación?</p>
                  <button
                    onClick={handleStartVerification}
                    disabled={starting}
                    className="text-navy-900 font-medium hover:underline"
                  >
                    Reiniciar verificación
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FAILED / REQUIRES INPUT */}
          {!kycVerified && (kycStatus === 'failed' || kycStatus === 'requires_input') && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-red-50 p-8 text-center">
                <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-12 h-12 text-red-600" />
                </div>
                <h2 className="text-2xl font-bold text-red-800 mb-2">
                  Verificación No Completada
                </h2>
                <p className="text-red-600 mb-2">
                  {kycFailReason || 'La verificación no se completó exitosamente.'}
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  Puedes intentar de nuevo. Asegúrate de tener buena iluminación y un documento válido.
                </p>
                <button
                  onClick={handleStartVerification}
                  disabled={starting}
                  className="inline-flex items-center gap-2 bg-navy-900 text-white px-6 py-3 rounded-lg font-medium hover:bg-navy-800 transition-colors"
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reintentar Verificación
                </button>
              </div>
            </div>
          )}

          {/* UNVERIFIED — ready to start */}
          {!kycVerified && kycStatus === 'unverified' && (
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
              <div className="bg-blue-50 p-8 text-center">
                <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-12 h-12 text-blue-600" />
                </div>
                <h2 className="text-2xl font-bold text-navy-900 mb-2">
                  Verifica tu Identidad
                </h2>
                <p className="text-gray-600 mb-6">
                  {kycRequested 
                    ? 'Maninos Capital te ha solicitado verificar tu identidad para continuar con tu solicitud RTO.'
                    : 'Para avanzar con tu solicitud Rent-to-Own, necesitamos verificar tu identidad.'
                  }
                </p>
                <button
                  onClick={handleStartVerification}
                  disabled={starting}
                  className="inline-flex items-center gap-2 bg-gold-500 text-navy-900 px-8 py-4 rounded-lg font-bold text-lg hover:bg-gold-400 transition-colors"
                >
                  {starting ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                  Verificar Mi Identidad
                </button>
              </div>

              {/* How it works */}
              <div className="p-8">
                <h3 className="font-semibold text-navy-900 mb-4">¿Cómo funciona?</h3>
                <div className="space-y-4">
                  {[
                    {
                      icon: FileText,
                      title: 'Prepara tu documento',
                      desc: 'Licencia de conducir, pasaporte o ID estatal',
                    },
                    {
                      icon: Camera,
                      title: 'Toma una foto de tu documento',
                      desc: 'Sigue las instrucciones en pantalla para fotografiar ambos lados',
                    },
                    {
                      icon: Camera,
                      title: 'Tómate una selfie',
                      desc: 'Verificamos que la persona del documento eres tú',
                    },
                    {
                      icon: CheckCircle,
                      title: '¡Listo!',
                      desc: 'La verificación se procesa automáticamente en minutos',
                    },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-4 p-4 bg-gray-50 rounded-xl">
                      <div className="w-10 h-10 bg-gold-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <step.icon className="w-5 h-5 text-gold-700" />
                      </div>
                      <div>
                        <h4 className="font-medium text-navy-900">{step.title}</h4>
                        <p className="text-sm text-gray-500">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security note */}
              <div className="px-8 pb-8">
                <div className="bg-green-50 rounded-xl p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-green-800">Seguro y confidencial</p>
                    <p className="text-sm text-green-700">
                      La verificación se realiza a través de Stripe, líder mundial en pagos seguros.
                      Tu información personal está protegida y encriptada.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

