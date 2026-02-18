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

  useEffect(() => {
    if (client) loadKycStatus(client.id)
  }, [client, loadKycStatus])

  // If returning from Stripe, automatically poll result
  useEffect(() => {
    if (client && statusParam === 'complete') handleCheckResult()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, statusParam])

  const handleStartVerification = async () => {
    if (!client) return
    setStarting(true)
    try {
      const res = await fetch(`/api/public/clients/${client.id}/kyc-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ return_url: window.location.origin }),
      })
      const data = await res.json()
      if (data.ok && data.url) {
        window.location.href = data.url
      } else if (data.already_verified) {
        toast.success('¡Tu identidad ya está verificada!')
        setKycVerified(true)
        setKycStatus('verified')
      } else {
        toast.error(data.detail || 'Error al iniciar verificación')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setStarting(false)
    }
  }

  const handleCheckResult = async () => {
    if (!client) return
    setChecking(true)
    try {
      const res = await fetch(`/api/public/clients/${client.id}/kyc-check`, { method: 'POST' })
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
    } catch {
      toast.error('Error al consultar estado')
    } finally {
      setChecking(false)
    }
  }

  if (authLoading || kycStatus === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!client) return null

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <Link href="/clientes/mi-cuenta" className="inline-flex items-center gap-2 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Volver a Mi Cuenta
          </Link>
          <h1 className="text-[22px] font-bold text-[#222] flex items-center gap-3" style={{ letterSpacing: '-0.02em' }}>
            <ShieldCheck className="w-6 h-6 text-[#004274]" />
            Verificación de Identidad
          </h1>
          <p className="text-[14px] text-[#717171] mt-1">
            Para completar tu solicitud dueño a dueño RTO, necesitamos verificar tu identidad.
          </p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        <div className="max-w-xl mx-auto">

          {/* VERIFIED */}
          {kycVerified && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-green-50 p-8 text-center">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-9 h-9 text-green-600" />
                </div>
                <h2 className="text-[20px] font-bold text-green-800 mb-2" style={{ letterSpacing: '-0.02em' }}>
                  ¡Identidad Verificada!
                </h2>
                <p className="text-[14px] text-green-600">
                  Tu identidad ha sido verificada exitosamente. No necesitas hacer nada más.
                </p>
              </div>
              <div className="p-6 text-center">
                <Link
                  href="/clientes/mi-cuenta"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[14px] transition-colors"
                  style={{ background: '#004274' }}
                >
                  Volver a Mi Cuenta
                </Link>
              </div>
            </div>
          )}

          {/* PENDING */}
          {!kycVerified && kycStatus === 'pending' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-amber-50 p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-9 h-9 text-amber-600 animate-spin" />
                </div>
                <h2 className="text-[20px] font-bold text-amber-800 mb-2" style={{ letterSpacing: '-0.02em' }}>
                  Verificación en Proceso
                </h2>
                <p className="text-[14px] text-amber-600 mb-4">
                  Tu verificación está siendo procesada. Esto puede tomar unos minutos.
                </p>
                <button
                  onClick={handleCheckResult}
                  disabled={checking}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[14px] transition-colors"
                  style={{ background: '#0068b7' }}
                >
                  {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Verificar Estado
                </button>
              </div>
              {hasSession && (
                <div className="p-6 border-t border-gray-100 text-center">
                  <p className="text-[13px] text-[#717171] mb-2">¿No completaste la verificación?</p>
                  <button
                    onClick={handleStartVerification}
                    disabled={starting}
                    className="text-[13px] font-semibold text-[#004274] hover:underline"
                  >
                    Reiniciar verificación
                  </button>
                </div>
              )}
            </div>
          )}

          {/* FAILED / REQUIRES INPUT */}
          {!kycVerified && (kycStatus === 'failed' || kycStatus === 'requires_input') && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-red-50 p-8 text-center">
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <XCircle className="w-9 h-9 text-red-600" />
                </div>
                <h2 className="text-[20px] font-bold text-red-800 mb-2" style={{ letterSpacing: '-0.02em' }}>
                  Verificación No Completada
                </h2>
                <p className="text-[14px] text-red-600 mb-2">
                  {kycFailReason || 'La verificación no se completó exitosamente.'}
                </p>
                <p className="text-[13px] text-[#717171] mb-6">
                  Puedes intentar de nuevo. Asegúrate de tener buena iluminación y un documento válido.
                </p>
                <button
                  onClick={handleStartVerification}
                  disabled={starting}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[14px] transition-colors"
                  style={{ background: '#004274' }}
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reintentar Verificación
                </button>
              </div>
            </div>
          )}

          {/* UNVERIFIED — ready to start */}
          {!kycVerified && kycStatus === 'unverified' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-blue-50 p-8 text-center">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ShieldCheck className="w-9 h-9 text-[#004274]" />
                </div>
                <h2 className="text-[20px] font-bold text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>
                  Verifica tu Identidad
                </h2>
                <p className="text-[14px] text-[#717171] mb-6">
                  {kycRequested 
                    ? 'Maninos Capital te ha solicitado verificar tu identidad para continuar con tu solicitud dueño a dueño RTO.'
                    : 'Para avanzar con tu solicitud dueño a dueño RTO, necesitamos verificar tu identidad.'
                  }
                </p>
                <button
                  onClick={handleStartVerification}
                  disabled={starting}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-[16px] transition-all hover:brightness-110"
                  style={{ background: '#0068b7', boxShadow: '0 4px 14px rgba(0,104,183,0.3)' }}
                >
                  {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  Verificar Mi Identidad
                </button>
              </div>

              {/* How it works */}
              <div className="p-8 border-t border-gray-100">
                <h3 className="font-bold text-[15px] text-[#222] mb-4" style={{ letterSpacing: '-0.015em' }}>¿Cómo funciona?</h3>
                <div className="space-y-3">
                  {[
                    { icon: FileText, title: 'Prepara tu documento', desc: 'Licencia de conducir, pasaporte o ID estatal' },
                    { icon: Camera, title: 'Toma una foto de tu documento', desc: 'Sigue las instrucciones en pantalla para fotografiar ambos lados' },
                    { icon: Camera, title: 'Tómate una selfie', desc: 'Verificamos que la persona del documento eres tú' },
                    { icon: CheckCircle, title: '¡Listo!', desc: 'La verificación se procesa automáticamente en minutos' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                      <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <step.icon className="w-4 h-4 text-[#004274]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[14px] text-[#222]">{step.title}</h4>
                        <p className="text-[13px] text-[#717171]">{step.desc}</p>
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
                    <p className="font-semibold text-[13px] text-green-800">Seguro y confidencial</p>
                    <p className="text-[12px] text-green-700">
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
