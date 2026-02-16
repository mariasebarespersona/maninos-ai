'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ShieldCheck, DollarSign, Home, User,
  Phone, Mail, MapPin, Calendar, CheckCircle2,
  XCircle, Loader2, AlertTriangle, FileSignature,
  Briefcase, CreditCard, Clock, ChevronDown, ChevronUp,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'

interface ClientInfo {
  id: string
  name: string
  email: string
  phone: string
  terreno: string
  status: string
  address: string
  city: string
  state: string
  date_of_birth: string | null
  marital_status: string | null
  employer_name: string | null
  occupation: string | null
  employer_phone: string | null
  monthly_income: number | null
  time_at_job_years: number | null
  time_at_job_months: number | null
  other_income_source: boolean
  other_income_amount: number | null
  personal_references: Array<{ name: string; phone: string; relationship: string }>
  kyc_verified: boolean
  kyc_status: string
  kyc_verified_at: string | null
  kyc_type: string | null
  kyc_failure_reason: string | null
  residence_type: string | null
}

interface ApplicationInfo {
  id: string
  status: string
  desired_term_months: number | null
  desired_down_payment: number | null
  monthly_income: number | null
  employment_status: string | null
  employer_name: string | null
  review_notes: string | null
  created_at: string
  properties: {
    id: string
    address: string
    city: string
    state: string
    sale_price: number
    photos: string[]
  }
  sales: {
    id: string
    sale_price: number
    status: string
  }
}

interface PaymentCapacity {
  monthly_net_income: number
  monthly_fixed_expenses: number
  payment_capacity: number
  proposed_monthly: number
  qualifies: boolean
  ratio: number
}

export default function QualifyClientDetailPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  // toast imported from @/components/ui/Toast
  const clientId = params.clientId as string
  const appId = searchParams.get('app')

  const [client, setClient] = useState<ClientInfo | null>(null)
  const [application, setApplication] = useState<ApplicationInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'identity' | 'capacity'>('identity')

  // Payment capacity form
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [otherIncome, setOtherIncome] = useState(0)
  const [monthlyExpenses, setMonthlyExpenses] = useState(0)
  const [capacityResult, setCapacityResult] = useState<PaymentCapacity | null>(null)
  const [calculating, setCalculating] = useState(false)

  // Review action
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject' | null>(null)
  const [reviewNotes, setReviewNotes] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)

  // KYC manual
  const [verifyingKYC, setVerifyingKYC] = useState(false)

  // Credit form expanded
  const [showCreditForm, setShowCreditForm] = useState(false)
  const [creditForm, setCreditForm] = useState({
    employer_name: '',
    occupation: '',
    employer_phone: '',
    monthly_income: '',
    time_at_job_years: '',
    time_at_job_months: '',
    other_income_amount: '',
    residence_type: '',
    marital_status: '',
    ref1_name: '',
    ref1_phone: '',
    ref1_relationship: '',
    ref2_name: '',
    ref2_phone: '',
    ref2_relationship: '',
  })

  useEffect(() => {
    loadData()
  }, [clientId, appId])

  const loadData = async () => {
    try {
      const [clientRes, appRes] = await Promise.all([
        fetch(`/api/clients/${clientId}`),
        appId ? fetch(`/api/capital/applications/${appId}`) : Promise.resolve(null),
      ])

      const clientData = await clientRes.json()
      if (clientData.ok || clientData.client) {
        const c = clientData.client || clientData
        setClient(c)
        // Pre-fill form with existing data
        setMonthlyIncome(c.monthly_income || 0)
        setOtherIncome(c.other_income_amount || 0)
        setCreditForm(prev => ({
          ...prev,
          employer_name: c.employer_name || '',
          occupation: c.occupation || '',
          employer_phone: c.employer_phone || '',
          monthly_income: c.monthly_income?.toString() || '',
          time_at_job_years: c.time_at_job_years?.toString() || '',
          time_at_job_months: c.time_at_job_months?.toString() || '',
          other_income_amount: c.other_income_amount?.toString() || '',
          residence_type: c.residence_type || '',
          marital_status: c.marital_status || '',
        }))
        if (c.personal_references?.length >= 1) {
          setCreditForm(prev => ({
            ...prev,
            ref1_name: c.personal_references[0]?.name || '',
            ref1_phone: c.personal_references[0]?.phone || '',
            ref1_relationship: c.personal_references[0]?.relationship || '',
          }))
        }
        if (c.personal_references?.length >= 2) {
          setCreditForm(prev => ({
            ...prev,
            ref2_name: c.personal_references[1]?.name || '',
            ref2_phone: c.personal_references[1]?.phone || '',
            ref2_relationship: c.personal_references[1]?.relationship || '',
          }))
        }
      }

      if (appRes) {
        const appData = await appRes.json()
        if (appData.ok) setApplication(appData.application)
      }
    } catch (err) {
      console.error('Error loading data:', err)
    } finally {
      setLoading(false)
    }
  }

  // ========== Capacidad de Pago (Credit Manual formula) ==========
  const calculateCapacity = () => {
    const totalIncome = monthlyIncome + otherIncome
    const capacity = (totalIncome - monthlyExpenses) * 0.40

    const salePrice = application?.properties?.sale_price || 0
    const downPayment = application?.desired_down_payment || 0
    const termMonths = application?.desired_term_months || 36
    const financeAmount = salePrice - downPayment
    const proposedMonthly = termMonths > 0 ? financeAmount / termMonths : 0

    setCapacityResult({
      monthly_net_income: totalIncome,
      monthly_fixed_expenses: monthlyExpenses,
      payment_capacity: capacity,
      proposed_monthly: proposedMonthly,
      qualifies: capacity >= proposedMonthly,
      ratio: totalIncome > 0 ? (proposedMonthly / totalIncome) * 100 : 0,
    })
  }

  // ========== Save credit info to client ==========
  const saveCreditInfo = async () => {
    setCalculating(true)
    try {
      const refs = []
      if (creditForm.ref1_name) refs.push({ name: creditForm.ref1_name, phone: creditForm.ref1_phone, relationship: creditForm.ref1_relationship })
      if (creditForm.ref2_name) refs.push({ name: creditForm.ref2_name, phone: creditForm.ref2_phone, relationship: creditForm.ref2_relationship })

      const res = await fetch(`/api/clients/${clientId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employer_name: creditForm.employer_name || null,
          occupation: creditForm.occupation || null,
          employer_phone: creditForm.employer_phone || null,
          monthly_income: creditForm.monthly_income ? parseFloat(creditForm.monthly_income) : null,
          time_at_job_years: creditForm.time_at_job_years ? parseInt(creditForm.time_at_job_years) : null,
          time_at_job_months: creditForm.time_at_job_months ? parseInt(creditForm.time_at_job_months) : null,
          other_income_amount: creditForm.other_income_amount ? parseFloat(creditForm.other_income_amount) : null,
          other_income_source: !!creditForm.other_income_amount,
          residence_type: creditForm.residence_type || null,
          marital_status: creditForm.marital_status || null,
          personal_references: refs.length > 0 ? refs : null,
        }),
      })
      const data = await res.json()
      if (data.ok !== false) {
        toast.success('Información crediticia guardada')
        setMonthlyIncome(parseFloat(creditForm.monthly_income) || 0)
        setOtherIncome(parseFloat(creditForm.other_income_amount) || 0)
        loadData()
      } else {
        toast.error(data.detail || 'Error al guardar')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setCalculating(false)
    }
  }

  // ========== KYC Manual Verify ==========
  const handleManualKYC = async () => {
    setVerifyingKYC(true)
    try {
      const res = await fetch('/api/capital/kyc/manual-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, verified_by: 'admin', id_type: 'manual', notes: 'Verificado manualmente desde portal Capital' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Identidad verificada manualmente')
        loadData()
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setVerifyingKYC(false)
    }
  }

  // ========== Stripe KYC ==========
  const handleStripeKYC = async () => {
    setVerifyingKYC(true)
    try {
      const res = await fetch('/api/capital/kyc/create-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          return_url: window.location.href,
        }),
      })
      const data = await res.json()
      if (data.ok && data.verification_url) {
        window.open(data.verification_url, '_blank')
        toast.success('Sesión de verificación creada. Se abrió en nueva pestaña.')
      } else {
        toast.error(data.detail || 'Error al crear sesión KYC')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setVerifyingKYC(false)
    }
  }

  // ========== Review (Approve / Reject) ==========
  const handleReview = async (action: 'approved' | 'rejected') => {
    if (!appId) return
    setSubmittingReview(true)
    try {
      const body: Record<string, unknown> = {
        status: action,
        review_notes: reviewNotes || undefined,
        reviewed_by: 'admin',
      }

      // If approving, pass the RTO terms
      if (action === 'approved' && application) {
        const salePrice = application.properties?.sale_price || 0
        const downPayment = application.desired_down_payment || 0
        const termMonths = application.desired_term_months || 36
        const financeAmount = salePrice - downPayment
        body.monthly_rent = termMonths > 0 ? Math.round(financeAmount / termMonths) : 0
        body.term_months = termMonths
        body.down_payment = downPayment
      }

      const res = await fetch(`/api/capital/applications/${appId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(action === 'approved' ? 'Cliente aprobado para RTO' : 'Solicitud rechazada')
        if (action === 'approved') {
          // Redirect to contracts page to generate the contract
          router.push('/capital/contracts')
        } else {
          loadData()
        }
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSubmittingReview(false)
      setReviewAction(null)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="text-center py-16">
        <p style={{ color: 'var(--slate)' }}>Cliente no encontrado</p>
      </div>
    )
  }

  const kycOk = client.kyc_verified
  const prop = application?.properties
  const salePrice = prop?.sale_price || 0
  const downPayment = application?.desired_down_payment || 0
  const termMonths = application?.desired_term_months || 36
  const financeAmount = salePrice - downPayment
  const estimatedMonthly = termMonths > 0 ? Math.round(financeAmount / termMonths) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back */}
      <Link href="/capital/qualify" className="inline-flex items-center gap-2 text-sm" style={{ color: 'var(--slate)' }}>
        <ArrowLeft className="w-4 h-4" />
        Volver a Filtrar Clientes
      </Link>

      {/* Client header */}
      <div className="card-luxury p-5">
        <div className="flex flex-col md:flex-row gap-5">
          {/* Property photo */}
          {prop && (
            <div className="w-full md:w-48 h-32 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
              {prop.photos?.[0] ? (
                <img src={prop.photos[0]} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Home className="w-8 h-8" style={{ color: 'var(--ash)' }} />
                </div>
              )}
            </div>
          )}

          {/* Client info */}
          <div className="flex-1">
            <h1 className="font-serif text-xl mb-1" style={{ color: 'var(--ink)' }}>
              {client.name}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'var(--slate)' }}>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{client.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{client.phone}</span>
              {client.terreno && <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{client.terreno}</span>}
            </div>

            {/* Property + RTO params */}
            {prop && (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                  <span style={{ color: 'var(--ash)' }}>Casa:</span>{' '}
                  <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{prop.address}, {prop.city}</span>
                </div>
                <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                  <span style={{ color: 'var(--ash)' }}>Precio:</span>{' '}
                  <span className="font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(salePrice)}</span>
                </div>
                {downPayment > 0 && (
                  <div className="bg-green-50 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-green-700">Enganche: {fmt(downPayment)}</span>
                  </div>
                )}
                <div className="bg-orange-50 rounded-lg px-3 py-1.5 text-sm">
                  <span className="text-orange-700">{termMonths} meses · ~{fmt(estimatedMonthly)}/mes</span>
                </div>
              </div>
            )}
          </div>

          {/* Status badge */}
          {application && (
            <div className="flex-shrink-0">
              <span
                className="badge text-xs px-3 py-1"
                style={{
                  backgroundColor: application.status === 'approved' ? 'var(--success-light)' : application.status === 'rejected' ? 'var(--error-light)' : 'var(--warning-light)',
                  color: application.status === 'approved' ? 'var(--success)' : application.status === 'rejected' ? 'var(--error)' : 'var(--warning)',
                }}
              >
                {application.status === 'submitted' ? 'Nuevo' : application.status === 'approved' ? 'Aprobado' : application.status === 'rejected' ? 'Rechazado' : application.status}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Tabs: Identidad + Capacidad de Pago */}
      <div className="flex gap-1 border-b" style={{ borderColor: 'var(--sand)' }}>
        {(['identity', 'capacity'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab ? 'border-gold-700' : 'border-transparent'
            }`}
            style={{
              color: activeTab === tab ? 'var(--gold-700)' : 'var(--slate)',
              borderColor: activeTab === tab ? 'var(--gold-700)' : 'transparent',
            }}
          >
            {tab === 'identity' ? (
              <span className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4" />
                Identidad
                {kycOk && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" />
                Capacidad de Pago
                {capacityResult?.qualifies && <CheckCircle2 className="w-4 h-4 text-green-500" />}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content: IDENTITY */}
      {activeTab === 'identity' && (
        <div className="card-luxury p-6 space-y-5">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
            Verificación de Identidad (KYC)
          </h2>

          {/* Current status */}
          <div className={`p-4 rounded-lg flex items-center gap-3 ${kycOk ? 'bg-green-50 border border-green-200' : 'bg-yellow-50 border border-yellow-200'}`}>
            {kycOk ? (
              <>
                <CheckCircle2 className="w-6 h-6 text-green-600" />
                <div>
                  <p className="font-semibold text-green-800">Identidad Verificada</p>
                  <p className="text-sm text-green-600">
                    Verificado {client.kyc_verified_at ? `el ${new Date(client.kyc_verified_at).toLocaleDateString('es-MX')}` : ''} — Tipo: {client.kyc_type || 'N/A'}
                  </p>
                </div>
              </>
            ) : (
              <>
                <AlertTriangle className="w-6 h-6 text-yellow-600" />
                <div>
                  <p className="font-semibold text-yellow-800">Identidad No Verificada</p>
                  <p className="text-sm text-yellow-600">
                    Estado: {client.kyc_status || 'unverified'}
                    {client.kyc_failure_reason && ` — Razón: ${client.kyc_failure_reason}`}
                  </p>
                </div>
              </>
            )}
          </div>

          {/* Verification actions */}
          {!kycOk && (
            <div className="grid md:grid-cols-2 gap-4">
              {/* Stripe Identity */}
              <div className="border rounded-lg p-4" style={{ borderColor: 'var(--stone)' }}>
                <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--charcoal)' }}>Stripe Identity (Automático)</h3>
                <p className="text-xs mb-3" style={{ color: 'var(--ash)' }}>
                  El cliente verifica su ID a través de Stripe. Proceso automático y seguro.
                </p>
                <button
                  onClick={handleStripeKYC}
                  disabled={verifyingKYC}
                  className="w-full py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--info)' }}
                >
                  {verifyingKYC ? 'Creando sesión...' : 'Iniciar Verificación Stripe'}
                </button>
              </div>

              {/* Manual verification */}
              <div className="border rounded-lg p-4" style={{ borderColor: 'var(--stone)' }}>
                <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--charcoal)' }}>Verificación Manual</h3>
                <p className="text-xs mb-3" style={{ color: 'var(--ash)' }}>
                  Si ya revisaste la identificación del cliente en persona (licencia, pasaporte, etc.)
                </p>
                <button
                  onClick={handleManualKYC}
                  disabled={verifyingKYC}
                  className="w-full py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50"
                  style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
                >
                  {verifyingKYC ? 'Verificando...' : 'Marcar como Verificado'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab content: PAYMENT CAPACITY */}
      {activeTab === 'capacity' && (
        <div className="space-y-5">
          {/* Credit Application Form (Solicitud de Crédito) */}
          <div className="card-luxury">
            <button
              onClick={() => setShowCreditForm(!showCreditForm)}
              className="w-full p-5 flex items-center justify-between text-left"
            >
              <div>
                <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                  Solicitud de Crédito
                </h2>
                <p className="text-sm mt-0.5" style={{ color: 'var(--ash)' }}>
                  Información laboral, ingresos y referencias del cliente
                </p>
              </div>
              {showCreditForm ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--slate)' }} /> : <ChevronDown className="w-5 h-5" style={{ color: 'var(--slate)' }} />}
            </button>

            {showCreditForm && (
              <div className="px-5 pb-5 border-t space-y-5" style={{ borderColor: 'var(--sand)' }}>
                {/* Información Laboral */}
                <div className="pt-4">
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                    <Briefcase className="w-4 h-4" />
                    Información Laboral
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Empleador actual</label>
                      <input type="text" value={creditForm.employer_name} onChange={(e) => setCreditForm(p => ({ ...p, employer_name: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Ocupación / Cargo</label>
                      <input type="text" value={creditForm.occupation} onChange={(e) => setCreditForm(p => ({ ...p, occupation: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Teléfono del empleador</label>
                      <input type="text" value={creditForm.employer_phone} onChange={(e) => setCreditForm(p => ({ ...p, employer_phone: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Ingreso mensual ($)</label>
                      <input type="number" value={creditForm.monthly_income} onChange={(e) => setCreditForm(p => ({ ...p, monthly_income: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Tiempo en empleo (años)</label>
                        <input type="number" value={creditForm.time_at_job_years} onChange={(e) => setCreditForm(p => ({ ...p, time_at_job_years: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                      </div>
                      <div className="flex-1">
                        <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Meses</label>
                        <input type="number" value={creditForm.time_at_job_months} onChange={(e) => setCreditForm(p => ({ ...p, time_at_job_months: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Otra fuente de ingresos ($)</label>
                      <input type="number" value={creditForm.other_income_amount} onChange={(e) => setCreditForm(p => ({ ...p, other_income_amount: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }} />
                    </div>
                  </div>
                </div>

                {/* Personal info */}
                <div>
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                    <User className="w-4 h-4" />
                    Información Personal
                  </h3>
                  <div className="grid md:grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Estado civil</label>
                      <select value={creditForm.marital_status} onChange={(e) => setCreditForm(p => ({ ...p, marital_status: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                        <option value="">Seleccionar</option>
                        <option value="soltero">Soltero(a)</option>
                        <option value="casado">Casado(a)</option>
                        <option value="otro">Otro</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Tipo de residencia</label>
                      <select value={creditForm.residence_type} onChange={(e) => setCreditForm(p => ({ ...p, residence_type: e.target.value }))} className="w-full px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}>
                        <option value="">Seleccionar</option>
                        <option value="propia">Propia</option>
                        <option value="rentada">Rentada</option>
                        <option value="otra">Otra</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* References */}
                <div>
                  <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                    <User className="w-4 h-4" />
                    Referencias Personales
                  </h3>
                  <div className="space-y-3">
                    {[1, 2].map((refNum) => (
                      <div key={refNum} className="grid grid-cols-3 gap-2">
                        <input
                          type="text"
                          placeholder={`Referencia ${refNum} - Nombre`}
                          value={refNum === 1 ? creditForm.ref1_name : creditForm.ref2_name}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_name`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: 'var(--stone)' }}
                        />
                        <input
                          type="text"
                          placeholder="Teléfono"
                          value={refNum === 1 ? creditForm.ref1_phone : creditForm.ref2_phone}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_phone`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: 'var(--stone)' }}
                        />
                        <input
                          type="text"
                          placeholder="Relación"
                          value={refNum === 1 ? creditForm.ref1_relationship : creditForm.ref2_relationship}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_relationship`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm"
                          style={{ borderColor: 'var(--stone)' }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={saveCreditInfo}
                  disabled={calculating}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--gold-700)' }}
                >
                  {calculating ? 'Guardando...' : 'Guardar Información Crediticia'}
                </button>
              </div>
            )}
          </div>

          {/* Payment Capacity Calculator */}
          <div className="card-luxury p-5 space-y-4">
            <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
              Cálculo de Capacidad de Pago
            </h2>
            <p className="text-sm" style={{ color: 'var(--ash)' }}>
              Fórmula: <strong>Capacidad = (Ingresos Netos - Gastos Fijos) × 40%</strong>
            </p>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Ingresos mensuales netos ($)</label>
                <input
                  type="number"
                  value={monthlyIncome}
                  onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Otros ingresos ($)</label>
                <input
                  type="number"
                  value={otherIncome}
                  onChange={(e) => setOtherIncome(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Gastos fijos mensuales ($)</label>
                <input
                  type="number"
                  value={monthlyExpenses}
                  onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm"
                  style={{ borderColor: 'var(--stone)' }}
                  placeholder="Renta, servicios, préstamos..."
                />
              </div>
            </div>

            <button
              onClick={calculateCapacity}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--gold-700)' }}
            >
              Calcular Capacidad
            </button>

            {/* Result */}
            {capacityResult && (
              <div className={`p-4 rounded-lg border ${capacityResult.qualifies ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-3 mb-3">
                  {capacityResult.qualifies ? (
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                  ) : (
                    <XCircle className="w-6 h-6 text-red-600" />
                  )}
                  <p className={`font-semibold text-lg ${capacityResult.qualifies ? 'text-green-800' : 'text-red-800'}`}>
                    {capacityResult.qualifies ? '✅ Cliente califica' : '❌ No califica'}
                  </p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div>
                    <p style={{ color: 'var(--ash)' }}>Ingreso total</p>
                    <p className="font-semibold">{fmt(capacityResult.monthly_net_income)}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--ash)' }}>Gastos fijos</p>
                    <p className="font-semibold">{fmt(capacityResult.monthly_fixed_expenses)}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--ash)' }}>Capacidad de pago (40%)</p>
                    <p className="font-bold" style={{ color: 'var(--gold-700)' }}>{fmt(capacityResult.payment_capacity)}</p>
                  </div>
                  <div>
                    <p style={{ color: 'var(--ash)' }}>Pago mensual propuesto</p>
                    <p className="font-semibold">{fmt(capacityResult.proposed_monthly)}</p>
                  </div>
                </div>

                <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>
                  Relación ingreso-deuda: {capacityResult.ratio.toFixed(1)}% (máx recomendado: 40%)
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Decision section — only if application is pending */}
      {application && ['submitted', 'under_review', 'needs_info'].includes(application.status) && (
        <div className="card-luxury p-5 space-y-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
            Decisión
          </h2>

          <div>
            <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Notas de revisión (opcional)</label>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 rounded-lg border text-sm"
              style={{ borderColor: 'var(--stone)' }}
              placeholder="Observaciones..."
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => handleReview('approved')}
              disabled={submittingReview}
              className="flex-1 py-3 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--success)' }}
            >
              {submittingReview ? 'Procesando...' : '✅ Aprobar para RTO'}
            </button>
            <button
              onClick={() => handleReview('rejected')}
              disabled={submittingReview}
              className="flex-1 py-3 rounded-lg text-sm font-bold text-white transition-colors disabled:opacity-50"
              style={{ backgroundColor: 'var(--error)' }}
            >
              {submittingReview ? 'Procesando...' : '❌ Rechazar'}
            </button>
          </div>

          {kycOk && capacityResult?.qualifies && (
            <p className="text-xs text-center" style={{ color: 'var(--success)' }}>
              ✅ Identidad verificada + Capacidad de pago confirmada — Listo para aprobar
            </p>
          )}
        </div>
      )}

      {/* If approved, show link to create contract */}
      {application?.status === 'approved' && (
        <div className="card-luxury p-5 text-center space-y-3" style={{ backgroundColor: 'var(--success-light)' }}>
          <CheckCircle2 className="w-8 h-8 mx-auto" style={{ color: 'var(--success)' }} />
          <p className="font-semibold" style={{ color: 'var(--success)' }}>
            Cliente aprobado para Rent-to-Own
          </p>
          <Link
            href="/capital/contracts"
            className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
            style={{ backgroundColor: 'var(--gold-700)' }}
          >
            <FileSignature className="w-4 h-4" />
            Ir a Generar Contrato
          </Link>
        </div>
      )}
    </div>
  )
}

