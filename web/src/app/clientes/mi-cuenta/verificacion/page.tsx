'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
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

/* ───── Sumsub Web SDK type (loaded dynamically via <script>) ───── */
declare global {
  interface Window {
    snsWebSdk: any
  }
}

export default function ClientVerificationPage() {
  const { client, loading: authLoading } = useClientAuth()

  const [kycStatus, setKycStatus] = useState<string>('loading')
  const [kycVerified, setKycVerified] = useState(false)
  const [kycRequested, setKycRequested] = useState(false)
  const [kycFailReason, setKycFailReason] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [showSdk, setShowSdk] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const sdkContainerRef = useRef<HTMLDivElement>(null)
  const sdkInstanceRef = useRef<any>(null)

  /* ─── Load KYC status from backend ─── */
  const loadKycStatus = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/kyc-status`)
      const data = await res.json()
      if (data.ok) {
        setKycVerified(data.kyc_verified || false)
        setKycStatus(data.kyc_status || 'unverified')
        setKycRequested(data.kyc_requested || false)
        setKycFailReason(data.kyc_failure_reason || null)
      }
    } catch (err) {
      console.error('Error loading KYC status:', err)
      setKycStatus('error')
    }
  }, [])

  useEffect(() => {
    if (client) loadKycStatus(client.id)
  }, [client, loadKycStatus])

  /* ─── Load Sumsub Web SDK script dynamically ─── */
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.snsWebSdk) {
      setSdkReady(true)
      return
    }
    const script = document.createElement('script')
    script.src = 'https://static.sumsub.com/idensic/static/sns-websdk-builder.js'
    script.async = true
    script.onload = () => setSdkReady(true)
    script.onerror = () => {
      console.error('Failed to load Sumsub Web SDK')
      toast.error('Error cargando el servicio de verificación')
    }
    document.head.appendChild(script)
  }, [])

  /* ─── Start verification → get token → launch SDK ─── */
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

      if (data.ok && data.access_token) {
        setShowSdk(true)
        // Wait a tick for the container div to render
        setTimeout(() => launchSumsubSdk(data.access_token), 150)
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

  /* ─── Initialize the Sumsub Web SDK ─── */
  const launchSumsubSdk = (accessToken: string) => {
    if (!window.snsWebSdk || !sdkContainerRef.current || !client) return

    // Destroy previous instance if any
    if (sdkInstanceRef.current) {
      try { sdkInstanceRef.current.destroy() } catch { /* ignore */ }
    }

    const clientId = client.id

    const snsWebSdkInstance = window.snsWebSdk
      .init(accessToken, () => {
        // Token expiration handler — refresh from our backend
        return fetch(`/api/public/clients/${clientId}/kyc-refresh-token`, {
          method: 'POST',
        })
          .then((res: Response) => res.json())
          .then((data: { access_token: string }) => data.access_token)
      })
      .withConf({
        lang: 'es',
        theme: 'light',
      })
      .withOptions({
        addViewportTag: false,
        adaptIframeHeight: true,
      })
      .on('idCheck.onStepCompleted', (payload: any) => {
        console.log('[Sumsub] Step completed:', payload)
      })
      .on('idCheck.onError', (error: any) => {
        console.error('[Sumsub] Error:', error)
        toast.error('Error durante la verificación')
      })
      .on('idCheck.onApplicantStatusChanged', (payload: any) => {
        console.log('[Sumsub] Status changed:', payload)
        // When Sumsub reports final status, poll our backend
        if (payload?.reviewStatus === 'completed') {
          handleCheckResult()
        }
      })
      .build()

    snsWebSdkInstance.launch('#sumsub-websdk-container')
    sdkInstanceRef.current = snsWebSdkInstance
  }

  /* ─── Poll backend for verification result ─── */
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
          setShowSdk(false)
        } else if (data.status === 'pending') {
          toast.info('⏳ Tu verificación está siendo procesada...')
        } else if (data.status === 'requires_input') {
          toast.error('La verificación necesita reintento')
          setKycFailReason(data.message || null)
        } else if (data.status === 'failed') {
          toast.error(data.message || 'Verificación rechazada')
          setKycFailReason(data.message || null)
          setShowSdk(false)
        }
      }
    } catch {
      toast.error('Error al consultar estado')
    } finally {
      setChecking(false)
    }
  }

  /* ─── Loading state ─── */
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

          {/* ═══════════ SUMSUB WEB SDK CONTAINER ═══════════ */}
          {showSdk && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-bold text-[16px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>
                  Verificación en Curso
                </h2>
                <button
                  onClick={handleCheckResult}
                  disabled={checking}
                  className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#004274] hover:underline"
                >
                  {checking ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                  Verificar estado
                </button>
              </div>
              <div
                id="sumsub-websdk-container"
                ref={sdkContainerRef}
                style={{ minHeight: 600 }}
              />
            </div>
          )}

          {/* ═══════════ VERIFIED ═══════════ */}
          {kycVerified && !showSdk && (
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

          {/* ═══════════ PENDING ═══════════ */}
          {!kycVerified && !showSdk && kycStatus === 'pending' && (
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
              <div className="p-6 border-t border-gray-100 text-center">
                <p className="text-[13px] text-[#717171] mb-2">¿No completaste la verificación?</p>
                <button
                  onClick={handleStartVerification}
                  disabled={starting || !sdkReady}
                  className="text-[13px] font-semibold text-[#004274] hover:underline"
                >
                  Reiniciar verificación
                </button>
              </div>
            </div>
          )}

          {/* ═══════════ FAILED / REQUIRES INPUT ═══════════ */}
          {!kycVerified && !showSdk && (kycStatus === 'failed' || kycStatus === 'requires_input') && (
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
                  disabled={starting || !sdkReady}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-white font-semibold text-[14px] transition-colors"
                  style={{ background: '#004274' }}
                >
                  {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                  Reintentar Verificación
                </button>
              </div>
            </div>
          )}

          {/* ═══════════ UNVERIFIED — ready to start ═══════════ */}
          {!kycVerified && !showSdk && kycStatus === 'unverified' && (
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
                  disabled={starting || !sdkReady}
                  className="inline-flex items-center gap-2 px-8 py-4 rounded-xl text-white font-bold text-[16px] transition-all hover:brightness-110 disabled:opacity-50"
                  style={{ background: '#0068b7', boxShadow: '0 4px 14px rgba(0,104,183,0.3)' }}
                >
                  {starting ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
                  {sdkReady ? 'Verificar Mi Identidad' : 'Cargando...'}
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
                      La verificación se realiza a través de Sumsub, líder mundial en verificación de identidad.
                      Tu información personal está protegida y encriptada.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ERROR ═══════════ */}
          {kycStatus === 'error' && !showSdk && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden p-8 text-center">
              <XCircle className="w-10 h-10 text-red-400 mx-auto mb-3" />
              <h2 className="text-[18px] font-bold text-[#222] mb-2">Error de conexión</h2>
              <p className="text-[14px] text-[#717171] mb-4">No pudimos cargar tu estado de verificación.</p>
              <button
                onClick={() => { if (client) loadKycStatus(client.id) }}
                className="px-5 py-2.5 rounded-lg bg-[#004274] text-white text-[14px] font-semibold hover:bg-[#00233d] transition-colors"
              >
                Reintentar
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
