'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  ShieldCheck,
  Loader2,
  CheckCircle,
  XCircle,
  ArrowLeft,
  Camera,
  FileText,
  Upload,
  X,
  User,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

type IdType = 'drivers_license' | 'passport' | 'state_id'

export default function ClientVerificationPage() {
  const { client, loading: authLoading } = useClientAuth()

  const [kycStatus, setKycStatus] = useState<string>('loading')
  const [kycVerified, setKycVerified] = useState(false)
  const [kycRequested, setKycRequested] = useState(false)
  const [kycFailReason, setKycFailReason] = useState<string | null>(null)
  const [hasDocuments, setHasDocuments] = useState(false)

  // Upload state
  const [idType, setIdType] = useState<IdType>('drivers_license')
  const [idFront, setIdFront] = useState<File | null>(null)
  const [idBack, setIdBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [idFrontPreview, setIdFrontPreview] = useState<string | null>(null)
  const [idBackPreview, setIdBackPreview] = useState<string | null>(null)
  const [selfiePreview, setSelfiePreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  const idFrontRef = useRef<HTMLInputElement>(null)
  const idBackRef = useRef<HTMLInputElement>(null)
  const selfieRef = useRef<HTMLInputElement>(null)

  /* ─── Load KYC status ─── */
  const loadKycStatus = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/kyc-status`)
      const data = await res.json()
      if (data.ok) {
        setKycVerified(data.kyc_verified || false)
        setKycStatus(data.kyc_status || 'unverified')
        setKycRequested(data.kyc_requested || false)
        setKycFailReason(data.kyc_failure_reason || null)
        setHasDocuments(data.has_documents || false)
      }
    } catch (err) {
      console.error('Error loading KYC status:', err)
      setKycStatus('error')
    }
  }, [])

  useEffect(() => {
    if (client) loadKycStatus(client.id)
  }, [client, loadKycStatus])

  /* ─── File selection ─── */
  const handleFileSelect = (
    e: React.ChangeEvent<HTMLInputElement>,
    setter: (f: File | null) => void,
    previewSetter: (url: string | null) => void
  ) => {
    const file = e.target.files?.[0]
    if (!file) return

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
    if (!allowedTypes.includes(file.type)) {
      toast.error('Solo se permiten imágenes JPG, PNG o WebP')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('La imagen es demasiado grande (máx 10MB)')
      return
    }

    setter(file)
    const url = URL.createObjectURL(file)
    previewSetter(url)
  }

  const clearFile = (
    setter: (f: File | null) => void,
    previewSetter: (url: string | null) => void,
    preview: string | null
  ) => {
    setter(null)
    if (preview) URL.revokeObjectURL(preview)
    previewSetter(null)
  }

  /* ─── Submit documents ─── */
  const handleSubmit = async () => {
    if (!client) return

    if (!idFront) {
      toast.error('Sube una foto del frente de tu identificación')
      return
    }
    if (!selfie) {
      toast.error('Sube una selfie')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('id_front', idFront)
      if (idBack) formData.append('id_back', idBack)
      formData.append('selfie', selfie)
      formData.append('id_type', idType)

      const res = await fetch(`/api/public/clients/${client.id}/kyc-upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()

      if (data.ok) {
        toast.success('¡Documentos enviados! Te avisaremos cuando sean revisados.')
        setKycStatus('pending_review')
        setHasDocuments(true)
        // Clear files
        setIdFront(null)
        setIdBack(null)
        setSelfie(null)
        setIdFrontPreview(null)
        setIdBackPreview(null)
        setSelfiePreview(null)
      } else {
        toast.error(data.error || data.detail || 'Error al enviar documentos')
      }
    } catch {
      toast.error('Error de conexión al enviar documentos')
    } finally {
      setUploading(false)
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

  const canUpload = !kycVerified && (kycStatus === 'unverified' || kycStatus === 'failed' || kycStatus === 'requires_input')

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

          {/* ═══════════ VERIFIED ═══════════ */}
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

          {/* ═══════════ PENDING REVIEW ═══════════ */}
          {!kycVerified && kycStatus === 'pending_review' && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-amber-50 p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-9 h-9 text-amber-600 animate-spin" />
                </div>
                <h2 className="text-[20px] font-bold text-amber-800 mb-2" style={{ letterSpacing: '-0.02em' }}>
                  Documentos en Revisión
                </h2>
                <p className="text-[14px] text-amber-600 mb-4">
                  Tus documentos fueron enviados y están siendo revisados por nuestro equipo. Te notificaremos cuando el proceso esté completo.
                </p>
                <button
                  onClick={() => client && loadKycStatus(client.id)}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-[13px] font-semibold text-[#004274] border border-[#004274]/20 hover:bg-[#004274]/5 transition-colors"
                >
                  Actualizar Estado
                </button>
              </div>
              <div className="p-6 text-center">
                <Link
                  href="/clientes/mi-cuenta"
                  className="text-[13px] font-semibold text-[#717171] hover:underline"
                >
                  Volver a Mi Cuenta
                </Link>
              </div>
            </div>
          )}

          {/* ═══════════ PENDING (legacy, same as pending_review) ═══════════ */}
          {!kycVerified && kycStatus === 'pending' && hasDocuments && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="bg-amber-50 p-8 text-center">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Loader2 className="w-9 h-9 text-amber-600 animate-spin" />
                </div>
                <h2 className="text-[20px] font-bold text-amber-800 mb-2" style={{ letterSpacing: '-0.02em' }}>
                  Documentos en Revisión
                </h2>
                <p className="text-[14px] text-amber-600 mb-4">
                  Tus documentos están siendo revisados.
                </p>
              </div>
            </div>
          )}

          {/* ═══════════ FAILED — can retry ═══════════ */}
          {!kycVerified && (kycStatus === 'failed' || kycStatus === 'requires_input') && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden mb-6">
              <div className="bg-red-50 p-6">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <h2 className="text-[16px] font-bold text-red-800 mb-1" style={{ letterSpacing: '-0.015em' }}>
                      Verificación No Aprobada
                    </h2>
                    <p className="text-[13px] text-red-600">
                      {kycFailReason || 'Los documentos enviados no cumplieron los requisitos.'}
                    </p>
                    <p className="text-[13px] text-[#717171] mt-2">
                      Puedes volver a subir tus documentos abajo.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ UPLOAD FORM ═══════════ */}
          {canUpload && (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="p-6 border-b border-gray-100">
                <h2 className="text-[18px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.015em' }}>
                  {kycStatus === 'failed' ? 'Vuelve a subir tus documentos' : 'Sube tus documentos'}
                </h2>
                <p className="text-[13px] text-[#717171]">
                  Necesitamos una foto de tu identificación y una selfie para verificar tu identidad.
                </p>
              </div>

              <div className="p-6 space-y-6">
                {/* ID Type selector */}
                <div>
                  <label className="block text-[13px] font-semibold text-[#222] mb-2">
                    Tipo de identificación
                  </label>
                  <div className="flex gap-2">
                    {([
                      { value: 'drivers_license', label: 'Licencia de conducir' },
                      { value: 'passport', label: 'Pasaporte' },
                      { value: 'state_id', label: 'ID estatal' },
                    ] as { value: IdType; label: string }[]).map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setIdType(opt.value)}
                        className={`px-3 py-2 rounded-lg text-[12px] font-medium border transition-colors ${
                          idType === opt.value
                            ? 'border-[#004274] bg-[#004274]/5 text-[#004274]'
                            : 'border-gray-200 text-[#717171] hover:border-gray-300'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ID Front */}
                <UploadBox
                  label="Foto del frente de tu ID *"
                  description="Asegúrate de que se vea completa y legible"
                  icon={<FileText className="w-6 h-6 text-[#004274]" />}
                  file={idFront}
                  preview={idFrontPreview}
                  inputRef={idFrontRef}
                  onSelect={(e) => handleFileSelect(e, setIdFront, setIdFrontPreview)}
                  onClear={() => clearFile(setIdFront, setIdFrontPreview, idFrontPreview)}
                  required
                />

                {/* ID Back (optional for passport) */}
                {idType !== 'passport' && (
                  <UploadBox
                    label="Foto del reverso de tu ID"
                    description="Opcional pero recomendado"
                    icon={<FileText className="w-6 h-6 text-[#717171]" />}
                    file={idBack}
                    preview={idBackPreview}
                    inputRef={idBackRef}
                    onSelect={(e) => handleFileSelect(e, setIdBack, setIdBackPreview)}
                    onClear={() => clearFile(setIdBack, setIdBackPreview, idBackPreview)}
                  />
                )}

                {/* Selfie */}
                <UploadBox
                  label="Selfie sosteniendo tu ID *"
                  description="Tómate una foto sosteniendo tu identificación junto a tu rostro"
                  icon={<Camera className="w-6 h-6 text-[#004274]" />}
                  file={selfie}
                  preview={selfiePreview}
                  inputRef={selfieRef}
                  onSelect={(e) => handleFileSelect(e, setSelfie, setSelfiePreview)}
                  onClear={() => clearFile(setSelfie, setSelfiePreview, selfiePreview)}
                  required
                />

                {/* Submit */}
                <button
                  onClick={handleSubmit}
                  disabled={uploading || !idFront || !selfie}
                  className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-bold text-[15px] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: '#004274', boxShadow: '0 4px 14px rgba(0,66,116,0.2)' }}
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Subiendo documentos...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5" />
                      Enviar para Verificación
                    </>
                  )}
                </button>
              </div>

              {/* How it works */}
              <div className="p-6 border-t border-gray-100">
                <h3 className="font-bold text-[14px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>¿Cómo funciona?</h3>
                <div className="space-y-2.5">
                  {[
                    { icon: FileText, title: 'Sube tu identificación', desc: 'Foto clara del frente (y reverso si no es pasaporte)' },
                    { icon: Camera, title: 'Tómate una selfie con tu ID', desc: 'Sostén tu identificación junto a tu rostro' },
                    { icon: User, title: 'Nuestro equipo la revisa', desc: 'Verificamos que el documento sea legítimo y coincida contigo' },
                    { icon: CheckCircle, title: '¡Listo!', desc: 'Te notificamos cuando tu identidad esté verificada' },
                  ].map((step, i) => (
                    <div key={i} className="flex items-start gap-3 p-2.5 bg-gray-50 rounded-lg">
                      <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <step.icon className="w-3.5 h-3.5 text-[#004274]" />
                      </div>
                      <div>
                        <h4 className="font-semibold text-[13px] text-[#222]">{step.title}</h4>
                        <p className="text-[12px] text-[#717171]">{step.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Security note */}
              <div className="px-6 pb-6">
                <div className="bg-green-50 rounded-xl p-4 flex items-start gap-3">
                  <ShieldCheck className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-[12px] text-green-800">Seguro y confidencial</p>
                    <p className="text-[11px] text-green-700">
                      Tus documentos están almacenados de forma segura y encriptada. Solo el equipo de Maninos Capital puede verlos para verificar tu identidad.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ═══════════ ERROR ═══════════ */}
          {kycStatus === 'error' && (
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


/* ─── Reusable Upload Box Component ─── */
function UploadBox({
  label,
  description,
  icon,
  file,
  preview,
  inputRef,
  onSelect,
  onClear,
  required,
}: {
  label: string
  description: string
  icon: React.ReactNode
  file: File | null
  preview: string | null
  inputRef: React.RefObject<HTMLInputElement | null>
  onSelect: (e: React.ChangeEvent<HTMLInputElement>) => void
  onClear: () => void
  required?: boolean
}) {
  return (
    <div>
      <label className="block text-[13px] font-semibold text-[#222] mb-2">
        {label}
      </label>
      <p className="text-[12px] text-[#717171] mb-2">{description}</p>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
        onChange={onSelect}
        className="hidden"
      />

      {preview ? (
        <div className="relative group">
          <div className="relative w-full h-48 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
            <Image
              src={preview}
              alt={label}
              fill
              className="object-contain"
            />
          </div>
          <div className="absolute top-2 right-2 flex gap-1.5">
            <button
              onClick={() => inputRef.current?.click()}
              className="p-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 text-[#717171] hover:text-[#222] transition-colors"
              title="Cambiar"
            >
              <Upload className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={onClear}
              className="p-1.5 rounded-lg bg-white/90 backdrop-blur-sm border border-gray-200 text-red-500 hover:text-red-700 transition-colors"
              title="Eliminar"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-[11px] text-green-600 mt-1.5 flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            {file?.name}
          </p>
        </div>
      ) : (
        <button
          onClick={() => inputRef.current?.click()}
          className={`w-full flex flex-col items-center justify-center gap-2 p-6 rounded-xl border-2 border-dashed transition-colors hover:border-[#004274]/40 hover:bg-[#004274]/5 ${
            required ? 'border-gray-300' : 'border-gray-200'
          }`}
        >
          {icon}
          <span className="text-[13px] font-medium text-[#717171]">
            Haz clic para seleccionar una foto
          </span>
          <span className="text-[11px] text-[#aaa]">JPG, PNG o WebP · Máx 10MB</span>
        </button>
      )}
    </div>
  )
}
