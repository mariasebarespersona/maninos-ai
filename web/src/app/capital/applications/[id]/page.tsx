'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { 
  User, MapPin, DollarSign, Briefcase, Clock, 
  CheckCircle2, XCircle, HelpCircle, ArrowLeft,
  FileSignature, Calculator, ShieldCheck, ShieldAlert, Loader2
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface ApplicationDetail {
  id: string
  status: string
  monthly_income: number | null
  employment_status: string | null
  employer_name: string | null
  time_at_job: string | null
  desired_term_months: number | null
  desired_down_payment: number | null
  review_notes: string | null
  reviewed_at: string | null
  reviewed_by: string | null
  created_at: string
  clients: Record<string, any>
  properties: Record<string, any>
  sales: Record<string, any>
}

interface DTIResult {
  dti: number | null
  qualifies: boolean
  message: string
  details: Record<string, number>
}

// Uses Next.js proxy routes (/api/capital/...)

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [app, setApp] = useState<ApplicationDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)
  const [dti, setDti] = useState<DTIResult | null>(null)
  
  // KYC
  const [kycStatus, setKycStatus] = useState<string>('unverified')
  const [kycVerified, setKycVerified] = useState(false)
  const [kycLoading, setKycLoading] = useState(false)

  // Review form
  const [reviewNotes, setReviewNotes] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [termMonths, setTermMonths] = useState('')
  const [downPayment, setDownPayment] = useState('')

  useEffect(() => {
    loadApplication()
  }, [id])

  const [kycFailReason, setKycFailReason] = useState<string | null>(null)

  const loadKycStatus = async (clientId: string) => {
    try {
      const res = await fetch(`/api/capital/kyc/status/${clientId}`)
      const data = await res.json()
      if (data.ok) {
        setKycStatus(data.kyc_status || 'unverified')
        setKycVerified(data.kyc_verified || false)
        setKycFailReason(data.failure_reason || null)
        
        // If session exists and status is pending, auto-check with Stripe
        if (data.kyc_session_id && !data.kyc_verified && 
            ['pending', 'requires_input'].includes(data.kyc_status || '')) {
          checkKycSession(clientId)
        }
      }
    } catch (err) {
      console.error('Error loading KYC status:', err)
    }
  }

  const checkKycSession = async (clientId: string) => {
    try {
      const res = await fetch(`/api/capital/kyc/check-session/${clientId}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        if (data.verified) {
          setKycVerified(true)
          setKycStatus('verified')
          setKycFailReason(null)
          toast.success('✅ Verificación de identidad completada')
        } else if (data.status === 'failed' || data.stripe_status === 'canceled') {
          setKycVerified(false)
          setKycStatus('failed')
          setKycFailReason(data.message || 'La verificación fue rechazada')
          toast.error('❌ Verificación fallida')
        } else if (data.status === 'requires_input') {
          setKycVerified(false)
          setKycStatus('requires_input')
          setKycFailReason('El cliente necesita reintentar la verificación')
        } else if (data.status === 'pending') {
          setKycStatus('pending')
          toast.info('⏳ Verificación aún en proceso...')
        } else if (data.status === 'no_session') {
          setKycStatus('unverified')
        }
      }
    } catch (err) {
      console.error('Error checking KYC session:', err)
    }
  }

  const handleCheckKycStatus = async () => {
    if (!app?.clients?.id) return
    setKycLoading(true)
    try {
      await checkKycSession(app.clients.id)
    } finally {
      setKycLoading(false)
    }
  }

  const handleKycVerify = async (method: 'stripe' | 'manual') => {
    if (!app) return
    setKycLoading(true)
    try {
      if (method === 'stripe') {
        const res = await fetch('/api/capital/kyc/create-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: app.clients.id })
        })
        const data = await res.json()
        if (data.ok && data.url) {
          window.open(data.url, '_blank')
          setKycStatus('pending')
          toast.success('Sesión de verificación creada. Se abrió en nueva pestaña.')
        } else if (data.already_verified) {
          toast.success('Cliente ya verificado')
          setKycVerified(true)
          setKycStatus('verified')
        } else {
          toast.error(data.detail || 'Error al crear sesión')
        }
      } else {
        const res = await fetch('/api/capital/kyc/manual-verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: app.clients.id, verified_by: 'admin' })
        })
        const data = await res.json()
        if (data.ok) {
          toast.success('Cliente verificado manualmente')
          setKycVerified(true)
          setKycStatus('verified')
          setKycFailReason(null)
        } else {
          toast.error(data.detail || 'Error')
        }
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setKycLoading(false)
    }
  }

  const loadApplication = async () => {
    try {
      const res = await fetch(`/api/capital/applications/${id}`)
      const data = await res.json()
      if (data.ok) {
        setApp(data.application)
        // Pre-fill from desired terms
        if (data.application.desired_term_months) {
          setTermMonths(String(data.application.desired_term_months))
        }
        if (data.application.desired_down_payment) {
          setDownPayment(String(data.application.desired_down_payment))
        }
        // Load KYC status
        if (data.application.clients?.id) {
          loadKycStatus(data.application.clients.id)
        }
      }
    } catch (err) {
      console.error('Error loading application:', err)
    } finally {
      setLoading(false)
    }
  }

  const calculateDTI = async () => {
    if (!app || !monthlyRent) {
      toast.warning('Ingresa la renta mensual propuesta para calcular DTI')
      return
    }
    try {
      const res = await fetch(`/api/capital/contracts/calculate-dti`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: app.clients.id,
          monthly_rent: parseFloat(monthlyRent),
          other_monthly_debts: 0,
        })
      })
      const data = await res.json()
      if (data.ok) setDti(data)
    } catch (err) {
      toast.error('Error al calcular DTI')
    }
  }

  const handleReview = async (status: 'approved' | 'rejected' | 'needs_info' | 'under_review') => {
    setReviewing(true)
    try {
      const body: Record<string, any> = {
        status,
        review_notes: reviewNotes || undefined,
      }
      if (status === 'approved') {
        if (!monthlyRent || !termMonths) {
          toast.warning('Completa la renta mensual y el plazo antes de aprobar')
          setReviewing(false)
          return
        }
        body.monthly_rent = parseFloat(monthlyRent)
        body.term_months = parseInt(termMonths)
        body.down_payment = downPayment ? parseFloat(downPayment) : 0
      }
      
      const res = await fetch(`/api/capital/applications/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      
      if (data.ok) {
        const messages: Record<string, string> = {
          approved: '✅ Solicitud aprobada. Procede a crear el contrato.',
          rejected: '❌ Solicitud rechazada. La propiedad vuelve a publicarse.',
          needs_info: '📋 Se ha solicitado más información al cliente.',
          under_review: '🔍 Solicitud marcada en revisión.',
        }
        toast.success(messages[status] || 'Solicitud actualizada')
        
        if (status === 'approved') {
          router.push('/capital/contracts')
        } else {
          loadApplication()
        }
      } else {
        toast.error(data.detail || 'Error al procesar la solicitud')
      }
    } catch (err) {
      toast.error('Error al procesar la solicitud')
    } finally {
      setReviewing(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!app) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Solicitud no encontrada</div>
  }

  const canReview = ['submitted', 'under_review', 'needs_info'].includes(app.status)

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Back button */}
      <button 
        onClick={() => router.push('/capital/applications')}
        className="btn-ghost btn-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Solicitudes
      </button>

      {/* Header */}
      <div className="card-luxury p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
              Solicitud RTO - {app.clients?.name}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
              {app.properties?.address}{app.properties?.city ? `, ${app.properties.city}` : ''}
            </p>
          </div>
          <StatusBadge status={app.status} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Client Info */}
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <User className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
            Información del Cliente
          </h3>
          <div className="space-y-3">
            <InfoRow label="Nombre" value={app.clients?.name} />
            <InfoRow label="Email" value={app.clients?.email} />
            <InfoRow label="Teléfono" value={app.clients?.phone} />
            <InfoRow label="Empleador" value={app.employer_name || app.clients?.employer_name || 'No proporcionado'} />
            <InfoRow label="Estado Laboral" value={app.employment_status || 'No proporcionado'} />
            <InfoRow label="Tiempo en Trabajo" value={app.time_at_job || 'No proporcionado'} />
            <InfoRow 
              label="Ingreso Mensual" 
              value={app.monthly_income ? fmt(app.monthly_income) : (app.clients?.monthly_income ? fmt(app.clients.monthly_income) : 'No proporcionado')} 
              highlight={!!app.monthly_income}
            />
          </div>
        </div>

        {/* Property Info */}
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <MapPin className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
            Información de la Propiedad
          </h3>
          <div className="space-y-3">
            <InfoRow label="Dirección" value={app.properties?.address} />
            <InfoRow label="Ciudad" value={`${app.properties?.city || 'N/A'}, ${app.properties?.state || 'TX'}`} />
            <InfoRow label="Precio de Venta" value={fmt(app.properties?.sale_price || 0)} highlight />
            <InfoRow label="Año" value={app.properties?.year || 'N/A'} />
            <InfoRow label="Tamaño" value={app.properties?.square_feet ? `${app.properties.square_feet} sqft` : 'N/A'} />
            <InfoRow label="Cuartos" value={`${app.properties?.bedrooms || '?'} hab / ${app.properties?.bathrooms || '?'} baños`} />
          </div>
          {app.properties?.photos?.[0] && (
            <div className="mt-4">
              <img 
                src={app.properties.photos[0]} 
                alt="Propiedad" 
                className="w-full h-40 object-cover rounded-md"
              />
            </div>
          )}
        </div>
      </div>

      {/* KYC Verification */}
      <div className="card-luxury p-6">
        <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <ShieldCheck className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
          Verificación de Identidad (KYC)
        </h3>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {kycVerified ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-light)' }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Identidad Verificada ✅</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>El cliente ha sido verificado correctamente</p>
                </div>
              </>
            ) : kycStatus === 'failed' || kycStatus === 'requires_input' ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--error-light)' }}>
                  <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--error)' }}>
                    Verificación Fallida ❌
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    {kycFailReason || 'La verificación de identidad no fue exitosa. Se puede reintentar.'}
                  </p>
                </div>
              </>
            ) : kycStatus === 'pending' ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--warning-light)' }}>
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>
                    Verificación en Proceso ⏳
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    El cliente está completando la verificación en Stripe
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--cream)' }}>
                  <ShieldAlert className="w-5 h-5" style={{ color: 'var(--slate)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--slate)' }}>
                    No Verificado
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    Se requiere verificación de identidad antes de aprobar
                  </p>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {/* Refresh / Check status button - show when pending or failed */}
            {!kycVerified && ['pending', 'requires_input'].includes(kycStatus) && (
              <button onClick={handleCheckKycStatus} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--info)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                Consultar Estado
              </button>
            )}
            {/* Verify buttons - show when not verified */}
            {!kycVerified && (
              <>
                <button onClick={() => handleKycVerify('stripe')} disabled={kycLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                  style={{ backgroundColor: 'var(--navy-800)', opacity: kycLoading ? 0.6 : 1 }}>
                  {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  {kycStatus === 'failed' || kycStatus === 'requires_input' ? 'Reintentar Stripe' : 'Stripe Identity'}
                </button>
                <button onClick={() => handleKycVerify('manual')} disabled={kycLoading}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium"
                  style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)', opacity: kycLoading ? 0.6 : 1 }}>
                  Verificar Manual
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Financial Analysis + Review */}
      {canReview && (
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Calculator className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
            Análisis y Términos del Contrato
          </h3>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <div>
              <label className="label">Renta Mensual *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                <input 
                  type="number" 
                  value={monthlyRent} 
                  onChange={(e) => setMonthlyRent(e.target.value)}
                  placeholder="695"
                  className="input pl-8"
                />
              </div>
            </div>
            <div>
              <label className="label">Plazo (meses) *</label>
              <select 
                value={termMonths} 
                onChange={(e) => setTermMonths(e.target.value)}
                className="input"
              >
                <option value="">Seleccionar</option>
                <option value="12">12 meses (1 año)</option>
                <option value="24">24 meses (2 años)</option>
                <option value="36">36 meses (3 años)</option>
                <option value="48">48 meses (4 años)</option>
                <option value="60">60 meses (5 años)</option>
              </select>
            </div>
            <div>
              <label className="label">Enganche</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                <input 
                  type="number" 
                  value={downPayment} 
                  onChange={(e) => setDownPayment(e.target.value)}
                  placeholder="0"
                  className="input pl-8"
                />
              </div>
            </div>
          </div>

          {/* Quick Financial Preview */}
          {monthlyRent && termMonths && (
            <div className="card-flat mb-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Ingreso Total RTO</p>
                  <p className="font-serif text-lg font-semibold" style={{ color: 'var(--success)' }}>
                    {fmt(parseFloat(monthlyRent) * parseInt(termMonths) + (downPayment ? parseFloat(downPayment) : 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Precio Venta</p>
                  <p className="font-serif text-lg font-semibold" style={{ color: 'var(--charcoal)' }}>
                    {fmt(app.properties?.sale_price || 0)}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Margen</p>
                  <p className="font-serif text-lg font-semibold" style={{ color: 'var(--success)' }}>
                    {fmt((parseFloat(monthlyRent) * parseInt(termMonths) + (downPayment ? parseFloat(downPayment) : 0)) - (app.properties?.sale_price || 0))}
                  </p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>ROI</p>
                  <p className="font-serif text-lg font-semibold" style={{ color: 'var(--info)' }}>
                    {app.properties?.sale_price ? (
                      ((parseFloat(monthlyRent) * parseInt(termMonths) + (downPayment ? parseFloat(downPayment) : 0)) / app.properties.sale_price * 100 - 100).toFixed(1)
                    ) : '0'}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* DTI Calculator */}
          <div className="flex items-center gap-3 mb-6">
            <button onClick={calculateDTI} className="btn-secondary btn-sm">
              <Calculator className="w-4 h-4" />
              Calcular DTI
            </button>
            {dti && (
              <div className={`badge ${dti.qualifies ? 'badge-success' : 'badge-error'}`}>
                DTI: {dti.dti !== null ? `${dti.dti}%` : 'N/A'} {dti.qualifies ? '✅' : '❌'}
              </div>
            )}
          </div>

          {/* Review Notes */}
          <div className="mb-6">
            <label className="label">Notas de Revisión</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Notas sobre la decisión..."
              className="input"
              rows={3}
              style={{ minHeight: 'auto' }}
            />
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap gap-3">
            <button 
              onClick={() => handleReview('approved')}
              disabled={reviewing}
              className="btn btn-sm text-white"
              style={{ backgroundColor: 'var(--success)' }}
            >
              <CheckCircle2 className="w-4 h-4" />
              Aprobar
            </button>
            <button 
              onClick={() => handleReview('rejected')}
              disabled={reviewing}
              className="btn-danger btn-sm"
            >
              <XCircle className="w-4 h-4" />
              Rechazar
            </button>
            <button 
              onClick={() => handleReview('needs_info')}
              disabled={reviewing}
              className="btn-secondary btn-sm"
            >
              <HelpCircle className="w-4 h-4" />
              Solicitar Más Info
            </button>
            <button 
              onClick={() => handleReview('under_review')}
              disabled={reviewing}
              className="btn-ghost btn-sm"
            >
              En Revisión
            </button>
          </div>
        </div>
      )}

      {/* Review Result (if already reviewed) */}
      {app.review_notes && !canReview && (
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-3" style={{ color: 'var(--ink)' }}>Resultado de Revisión</h3>
          <p style={{ color: 'var(--charcoal)' }}>{app.review_notes}</p>
          {app.reviewed_at && (
            <p className="text-sm mt-2" style={{ color: 'var(--ash)' }}>
              Revisado por {app.reviewed_by || 'Admin'} el {new Date(app.reviewed_at).toLocaleDateString('es-MX')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string | number | undefined; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: 'var(--sand)' }}>
      <span className="text-sm" style={{ color: 'var(--slate)' }}>{label}</span>
      <span className={`text-sm font-medium ${highlight ? '' : ''}`} 
            style={{ color: highlight ? 'var(--gold-700)' : 'var(--charcoal)' }}>
        {value || 'N/A'}
      </span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    submitted: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    under_review: { bg: 'var(--info-light)', color: 'var(--info)', label: 'En Revisión' },
    needs_info: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Info Requerida' },
    approved: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Aprobada' },
    rejected: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Rechazada' },
    cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
  }
  const s = styles[status] || styles.submitted
  return <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
}

