'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  User, MapPin, DollarSign, Briefcase, Clock, 
  CheckCircle2, XCircle, HelpCircle, ArrowLeft,
  FileSignature, Calculator, ShieldCheck, ShieldAlert, Loader2,
  Home, Mail, Phone, AlertTriangle, ChevronDown, ChevronUp,
  CreditCard, FileText, Upload, Download, ExternalLink, Eye,
  Calendar, Hash,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { calculateRTOMonthly, DEFAULT_ANNUAL_RATE, getDefaultRate } from '@/lib/rto-calculator'
import AmortizationTable from '@/components/capital/AmortizationTable'

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

interface PaymentCapacity {
  monthly_net_income: number
  monthly_fixed_expenses: number
  payment_capacity: number
  proposed_monthly: number
  qualifies: boolean
  ratio: number
  dti_ratio: number // debt-to-income ratio (payment / gross income)
  disposable_ratio: number // payment / disposable income
  risk_level: 'low' | 'medium' | 'high' | 'critical'
  warnings: string[]
}

export default function ApplicationDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const [app, setApp] = useState<ApplicationDetail | null>(null)
  const [client, setClient] = useState<ClientInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [reviewing, setReviewing] = useState(false)

  // Active section
  const [activeTab, setActiveTab] = useState<'identity' | 'capacity' | 'terms' | 'payments' | 'documents'>('identity')
  
  // KYC
  const [kycStatus, setKycStatus] = useState<string>('unverified')
  const [kycVerified, setKycVerified] = useState(false)
  const [kycLoading, setKycLoading] = useState(false)
  const [kycFailReason, setKycFailReason] = useState<string | null>(null)
  const [kycRequested, setKycRequested] = useState(false)

  // Review form
  const [reviewNotes, setReviewNotes] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [termMonths, setTermMonths] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [annualRatePct, setAnnualRatePct] = useState(DEFAULT_ANNUAL_RATE * 100) // editable %

  // Credit form (expanded)
  const [showCreditForm, setShowCreditForm] = useState(false)
  const [savingCredit, setSavingCredit] = useState(false)
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

  // Payment capacity
  const [monthlyIncome, setMonthlyIncome] = useState(0)
  const [otherIncome, setOtherIncome] = useState(0)
  const [monthlyExpenses, setMonthlyExpenses] = useState(0)
  const [capacityResult, setCapacityResult] = useState<PaymentCapacity | null>(null)

  // Payments tab
  const [contractId, setContractId] = useState<string | null>(null)
  const [rtoPayments, setRtoPayments] = useState<any[]>([])
  const [paymentsSummary, setPaymentsSummary] = useState<any>(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [recordingPaymentId, setRecordingPaymentId] = useState<string | null>(null)
  const [expectedPaymentAmount, setExpectedPaymentAmount] = useState<number>(0)
  const [paymentForm, setPaymentForm] = useState({
    payment_method: 'zelle',
    paid_amount: '',
    payment_reference: '',
    notes: '',
  })
  const [recordingPayment, setRecordingPayment] = useState(false)

  // Documents tab
  const [transferData, setTransferData] = useState<any>(null)
  const [docsLoading, setDocsLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)

  useEffect(() => {
    loadApplication()
  }, [id])

  // ========== Data Loading ==========

  const loadApplication = async () => {
    try {
      const res = await fetch(`/api/capital/applications/${id}`)
      const data = await res.json()
      if (data.ok) {
        setApp(data.application)
        // Pre-fill contract terms from desired params
        if (data.application.desired_term_months) {
          setTermMonths(String(data.application.desired_term_months))
        }
        if (data.application.desired_down_payment) {
          setDownPayment(String(data.application.desired_down_payment))
        }
        // Load KYC status + full client data
        if (data.application.clients?.id) {
          loadKycStatus(data.application.clients.id)
          loadClientFull(data.application.clients.id)
        }
        // Load contract → payments
        const saleData = data.application.sales
        if (saleData?.rto_contract_id) {
          setContractId(saleData.rto_contract_id)
          loadPayments(saleData.rto_contract_id)
        }
        // Load documents for property
        if (data.application.properties?.id) {
          loadDocuments(data.application.properties.id)
        }
      }
    } catch (err) {
      console.error('Error loading application:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadClientFull = async (clientId: string) => {
    try {
      const res = await fetch(`/api/clients/${clientId}`)
      const data = await res.json()
      const c = data.client || data
      if (c?.id) {
        setClient(c)
        // Pre-fill credit form
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
    } catch (err) {
      console.error('Error loading client:', err)
    }
  }

  // ========== Payments ==========

  const loadPayments = async (cId: string) => {
    setPaymentsLoading(true)
    try {
      const res = await fetch(`/api/capital/payments/schedule/${cId}`)
      const data = await res.json()
      if (data.ok) {
        setRtoPayments(data.payments || [])
        setPaymentsSummary(data.summary || null)
      }
    } catch (err) {
      console.error('Error loading payments:', err)
    } finally {
      setPaymentsLoading(false)
    }
  }

  const handleRecordPayment = async () => {
    if (!recordingPaymentId) return
    const finalAmount = paymentForm.paid_amount ? parseFloat(paymentForm.paid_amount) : expectedPaymentAmount
    if (!finalAmount || finalAmount <= 0) {
      toast.warning('Ingresa el monto pagado')
      return
    }
    setRecordingPayment(true)
    try {
      const res = await fetch(`/api/capital/payments/${recordingPaymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentForm.payment_method,
          paid_amount: finalAmount,
          payment_reference: paymentForm.payment_reference || undefined,
          notes: paymentForm.notes || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Pago registrado')
        setRecordingPaymentId(null)
        setPaymentForm({ payment_method: 'zelle', paid_amount: '', payment_reference: '', notes: '' })
        if (contractId) loadPayments(contractId)
        if (data.contract_completed) {
          toast.success('🎉 ¡Contrato completado! Proceder a transferencia de título.')
        }
      } else {
        toast.error(data.detail || 'Error al registrar pago')
      }
    } catch (err) {
      toast.error('Error al registrar pago')
    } finally {
      setRecordingPayment(false)
    }
  }

  // ========== Documents ==========

  const loadDocuments = async (propertyId: string) => {
    setDocsLoading(true)
    try {
      const res = await fetch(`/api/transfers/property/${propertyId}`)
      const data = await res.json()
      setTransferData(data)
    } catch (err) {
      console.error('Error loading documents:', err)
    } finally {
      setDocsLoading(false)
    }
  }

  const handleDocUpload = async (transferId: string, docKey: string, file: File) => {
    setUploadingDoc(docKey)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch(`/api/transfers/${transferId}/document/${docKey}/upload`, {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (data.file_url || data.ok) {
        toast.success(`Documento "${docKey}" subido correctamente`)
        // Reload documents
        if (app?.properties?.id) loadDocuments(app.properties.id)
      } else {
        toast.error(data.detail || 'Error al subir documento')
      }
    } catch (err) {
      toast.error('Error al subir documento')
    } finally {
      setUploadingDoc(null)
    }
  }

  // ========== KYC ==========

  const loadKycStatus = async (clientId: string) => {
    try {
      const res = await fetch(`/api/capital/kyc/status/${clientId}`)
      const data = await res.json()
      if (data.ok) {
        setKycStatus(data.kyc_status || 'unverified')
        setKycVerified(data.kyc_verified || false)
        setKycFailReason(data.failure_reason || null)
        setKycRequested(data.kyc_requested || false)
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

  const handleRequestKyc = async () => {
    if (!app) return
    setKycLoading(true)
    try {
      const res = await fetch('/api/capital/kyc/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: app.clients.id })
      })
      const data = await res.json()
      if (data.ok) {
        if (data.already_verified) {
          toast.success('Cliente ya verificado')
          setKycVerified(true)
          setKycStatus('verified')
        } else {
          toast.success(data.message || 'Solicitud enviada al cliente')
          setKycRequested(true)
          setKycStatus('pending')
        }
      } else {
        toast.error(data.detail || 'Error al solicitar verificación')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setKycLoading(false)
    }
  }

  const handleManualVerify = async () => {
    if (!app) return
    setKycLoading(true)
    try {
      const res = await fetch('/api/capital/kyc/manual-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: app.clients.id,
          verified_by: 'admin',
          id_type: 'manual',
          notes: 'Verificado manualmente desde portal Capital',
        })
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
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setKycLoading(false)
    }
  }

  // ========== Credit Form ==========

  const saveCreditInfo = async () => {
    if (!app?.clients?.id) return
    setSavingCredit(true)
    try {
      const refs = []
      if (creditForm.ref1_name) refs.push({ name: creditForm.ref1_name, phone: creditForm.ref1_phone, relationship: creditForm.ref1_relationship })
      if (creditForm.ref2_name) refs.push({ name: creditForm.ref2_name, phone: creditForm.ref2_phone, relationship: creditForm.ref2_relationship })

      const res = await fetch(`/api/clients/${app.clients.id}`, {
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
        loadClientFull(app.clients.id)
      } else {
        toast.error(data.detail || 'Error al guardar')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setSavingCredit(false)
    }
  }

  // ========== Payment Capacity ==========

  const calculateCapacity = () => {
    const totalIncome = monthlyIncome + otherIncome
    const disposable = totalIncome - monthlyExpenses
    const capacity = disposable * 0.40 // max 40% of disposable

    const salePrice = app?.properties?.sale_price || 0
    const dp = app?.desired_down_payment || 0
    const tm = app?.desired_term_months || 36

    // Use the real RTO formula with interest
    const rtoCalc = calculateRTOMonthly({
      salePrice,
      downPayment: dp,
      termMonths: tm,
      annualRate: annualRatePct / 100,
    })

    const proposedMonthly = rtoCalc.monthlyPayment
    const dtiRatio = totalIncome > 0 ? (proposedMonthly / totalIncome) * 100 : 100
    const disposableRatio = disposable > 0 ? (proposedMonthly / disposable) * 100 : 100
    
    // Build warnings
    const warnings: string[] = []
    if (dtiRatio > 50) warnings.push('DTI > 50%: La cuota supera la mitad del ingreso bruto')
    else if (dtiRatio > 35) warnings.push('DTI entre 35-50%: Riesgo moderado')
    if (disposableRatio > 60) warnings.push('Cuota > 60% del ingreso disponible: Alto riesgo')
    if (totalIncome < 2000) warnings.push('Ingreso mensual bajo (<$2,000)')
    if (dp < salePrice * 0.10) warnings.push('Down payment < 10% del precio')
    if ((client?.time_at_job_years ?? 0) < 1 && (client?.time_at_job_months ?? 0) < 6)
      warnings.push('Menos de 6 meses en empleo actual')
    if (!client?.employer_name) warnings.push('Sin información de empleador')
    
    // Risk level
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low'
    if (dtiRatio > 50 || disposableRatio > 70) riskLevel = 'critical'
    else if (dtiRatio > 40 || disposableRatio > 55) riskLevel = 'high'
    else if (dtiRatio > 30 || disposableRatio > 40) riskLevel = 'medium'

    const qualifies = capacity >= proposedMonthly && dtiRatio <= 50

    setCapacityResult({
      monthly_net_income: totalIncome,
      monthly_fixed_expenses: monthlyExpenses,
      payment_capacity: capacity,
      proposed_monthly: proposedMonthly,
      qualifies,
      ratio: dtiRatio,
      dti_ratio: dtiRatio,
      disposable_ratio: disposableRatio,
      risk_level: riskLevel,
      warnings,
    })
  }

  // ========== Review ==========

  const handleReview = async (status: 'approved' | 'rejected' | 'needs_info' | 'under_review') => {
    setReviewing(true)
    try {
      const body: Record<string, any> = {
        status,
        review_notes: reviewNotes || undefined,
        reviewed_by: 'admin',
      }
      if (status === 'approved') {
        const sp = app?.properties?.sale_price || 0
        const dp = downPayment ? parseFloat(downPayment) : (app?.desired_down_payment || 0)
        const tm = termMonths ? parseInt(termMonths) : (app?.desired_term_months || 36)

        if (monthlyRent) {
          // Capital overrode the monthly rent manually
        body.monthly_rent = parseFloat(monthlyRent)
        } else {
          // Auto-calculate using the RTO formula with interest
          const rtoCalc = calculateRTOMonthly({
            salePrice: sp,
            downPayment: dp,
            termMonths: tm,
            annualRate: annualRatePct / 100,
          })
          body.monthly_rent = rtoCalc.monthlyPayment
        }
        body.term_months = tm
        body.down_payment = dp
        body.annual_rate = annualRatePct / 100
      }
      
      const res = await fetch(`/api/capital/applications/${id}/review`, {
        method: 'POST',
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
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!app) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Solicitud no encontrada</div>
  }

  const canReview = ['submitted', 'under_review', 'needs_info'].includes(app.status)
  const prop = app.properties
  const salePrice = prop?.sale_price || 0
  const desiredDP = app.desired_down_payment || 0
  const desiredTM = app.desired_term_months || 36

  // Real RTO formula for the header display
  const headerRTO = calculateRTOMonthly({
    salePrice,
    downPayment: desiredDP,
    termMonths: desiredTM,
    annualRate: annualRatePct / 100,
  })
  const estimatedMonthly = headerRTO.monthlyPayment

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Back button */}
      <button 
        onClick={() => router.push('/capital/applications')}
        className="btn-ghost btn-sm"
      >
        <ArrowLeft className="w-4 h-4" />
        Volver a Clientes
      </button>

      {/* Client header with property */}
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
              {app.clients?.name || 'Cliente'}
            </h1>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm" style={{ color: 'var(--slate)' }}>
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{app.clients?.email}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{app.clients?.phone}</span>
      </div>

            {/* Property + RTO params */}
            {prop && (
              <div className="mt-3 flex flex-wrap gap-3">
                <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                  <span style={{ color: 'var(--ash)' }}>Casa:</span>{' '}
                  <span className="font-medium" style={{ color: 'var(--charcoal)' }}>{prop.address}{prop.city ? `, ${prop.city}` : ''}</span>
          </div>
                <div className="bg-gray-50 rounded-lg px-3 py-1.5 text-sm">
                  <span style={{ color: 'var(--ash)' }}>Precio:</span>{' '}
                  <span className="font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(salePrice)}</span>
        </div>
                {desiredDP > 0 && (
                  <div className="bg-green-50 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-green-700">Enganche: {fmt(desiredDP)}</span>
          </div>
                )}
                <div className="bg-orange-50 rounded-lg px-3 py-1.5 text-sm">
                  <span className="text-orange-700">{desiredTM} meses · ~{fmt(estimatedMonthly)}/mes</span>
                </div>
            </div>
          )}
          </div>

          {/* Status */}
          <div className="flex-shrink-0">
            <StatusBadge status={app.status} />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--sand)' }}>
        {([
          { key: 'identity' as const, label: 'Identidad', icon: ShieldCheck, done: kycVerified },
          { key: 'capacity' as const, label: 'Capacidad de Pago', icon: DollarSign, done: capacityResult?.qualifies ?? false },
          { key: 'terms' as const, label: 'Términos', icon: FileSignature, done: app.status === 'approved' },
          { key: 'payments' as const, label: 'Pagos', icon: CreditCard, done: paymentsSummary?.payments_remaining === 0 && (paymentsSummary?.total_payments || 0) > 0 },
          { key: 'documents' as const, label: 'Documentos', icon: FileText, done: false },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-5 py-3 text-sm font-medium border-b-2 transition-colors"
            style={{
              color: activeTab === tab.key ? 'var(--gold-700)' : 'var(--slate)',
              borderColor: activeTab === tab.key ? 'var(--gold-700)' : 'transparent',
            }}
          >
            <span className="flex items-center gap-2">
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.done && <CheckCircle2 className="w-4 h-4 text-green-500" />}
            </span>
          </button>
        ))}
      </div>

      {/* =================== TAB: IDENTITY =================== */}
      {activeTab === 'identity' && (
        <div className="card-luxury p-6 space-y-5">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
          Verificación de Identidad (KYC)
          </h2>

          {/* Current status */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            {kycVerified ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-light)' }}>
                  <ShieldCheck className="w-5 h-5" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="font-semibold text-sm" style={{ color: 'var(--success)' }}>Identidad Verificada ✅</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      {client?.kyc_verified_at ? `Verificado el ${new Date(client.kyc_verified_at).toLocaleDateString('es-MX')}` : 'Verificado correctamente'}
                      {client?.kyc_type ? ` — Tipo: ${client.kyc_type}` : ''}
                    </p>
                </div>
              </>
            ) : kycStatus === 'failed' || kycStatus === 'requires_input' ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--error-light)' }}>
                  <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                </div>
                <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--error)' }}>Verificación Fallida ❌</p>
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
                    <p className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>Esperando al Cliente ⏳</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Se le solicitó al cliente que verifique su identidad desde su portal</p>
                </div>
              </>
            ) : kycRequested ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--info-light)' }}>
                  <Mail className="w-5 h-5" style={{ color: 'var(--info)' }} />
                </div>
                <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--info)' }}>Solicitud Enviada 📩</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>El cliente debe verificar su identidad desde el portal de clientes</p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--cream)' }}>
                  <ShieldAlert className="w-5 h-5" style={{ color: 'var(--slate)' }} />
                </div>
                <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--slate)' }}>No Verificado</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Solicita al cliente que verifique su identidad</p>
                </div>
              </>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            {!kycVerified && ['pending', 'requires_input'].includes(kycStatus) && (
              <button onClick={handleCheckKycStatus} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--info)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                Consultar Estado
              </button>
            )}
            {!kycVerified && !kycRequested && kycStatus !== 'pending' && (
              <button onClick={handleRequestKyc} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--navy-800)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Solicitar Verificación al Cliente
              </button>
            )}
            {!kycVerified && kycRequested && kycStatus !== 'pending' && (
              <button onClick={handleRequestKyc} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--warning)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                Re-enviar Solicitud
              </button>
            )}
            {!kycVerified && (
              <button onClick={handleManualVerify} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border text-xs font-medium"
                style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)', opacity: kycLoading ? 0.6 : 1 }}>
                Verificar Manual
              </button>
            )}
          </div>
        </div>

          {/* Client details */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-4">
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <User className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                Datos del Cliente
              </h3>
              <div className="space-y-2">
                <InfoRow label="Nombre" value={app.clients?.name} />
                <InfoRow label="Email" value={app.clients?.email} />
                <InfoRow label="Teléfono" value={app.clients?.phone} />
                <InfoRow label="Estado Civil" value={client?.marital_status || 'No proporcionado'} />
                <InfoRow label="Tipo Residencia" value={client?.residence_type || 'No proporcionado'} />
      </div>
            </div>
            <div>
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--charcoal)' }}>
                <MapPin className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                Datos de la Propiedad
              </h3>
              <div className="space-y-2">
                <InfoRow label="Dirección" value={prop?.address} />
                <InfoRow label="Ciudad" value={`${prop?.city || 'N/A'}, ${prop?.state || 'TX'}`} />
                <InfoRow label="Precio de Venta" value={fmt(salePrice)} highlight />
                <InfoRow label="Año" value={prop?.year || 'N/A'} />
                <InfoRow label="Cuartos" value={`${prop?.bedrooms || '?'} hab / ${prop?.bathrooms || '?'} baños`} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== TAB: CAPACITY =================== */}
      {activeTab === 'capacity' && (
        <div className="space-y-5">
          {/* Credit Application Form */}
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
              {showCreditForm
                ? <ChevronUp className="w-5 h-5" style={{ color: 'var(--slate)' }} />
                : <ChevronDown className="w-5 h-5" style={{ color: 'var(--slate)' }} />
              }
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
                        <input type="text" placeholder={`Referencia ${refNum} - Nombre`}
                          value={refNum === 1 ? creditForm.ref1_name : creditForm.ref2_name}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_name`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                        />
                        <input type="text" placeholder="Teléfono"
                          value={refNum === 1 ? creditForm.ref1_phone : creditForm.ref2_phone}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_phone`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                        />
                        <input type="text" placeholder="Relación"
                          value={refNum === 1 ? creditForm.ref1_relationship : creditForm.ref2_relationship}
                          onChange={(e) => setCreditForm(p => ({ ...p, [`ref${refNum}_relationship`]: e.target.value }))}
                          className="px-3 py-2 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                />
              </div>
                    ))}
            </div>
                </div>

                <button
                  onClick={saveCreditInfo}
                  disabled={savingCredit}
                  className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--gold-700)' }}
                >
                  {savingCredit ? 'Guardando...' : 'Guardar Información Crediticia'}
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
                <input type="number" value={monthlyIncome} onChange={(e) => setMonthlyIncome(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Otros ingresos ($)</label>
                <input type="number" value={otherIncome} onChange={(e) => setOtherIncome(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                />
              </div>
              <div>
                <label className="text-xs mb-1 block" style={{ color: 'var(--ash)' }}>Gastos fijos mensuales ($)</label>
                <input type="number" value={monthlyExpenses} onChange={(e) => setMonthlyExpenses(Number(e.target.value))}
                  className="w-full px-3 py-2.5 rounded-lg border text-sm" style={{ borderColor: 'var(--stone)' }}
                  placeholder="Renta, servicios, préstamos..."
                />
              </div>
            </div>

            <button onClick={calculateCapacity}
              className="px-6 py-2.5 rounded-lg text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: 'var(--gold-700)' }}
            >
              Calcular Capacidad
            </button>

            {/* Result */}
            {capacityResult && (
              <div className="space-y-4">
                {/* Main verdict */}
                <div className={`p-4 rounded-lg border ${capacityResult.qualifies ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                  <div className="flex items-center gap-3 mb-3">
                    {capacityResult.qualifies ? (
                      <CheckCircle2 className="w-6 h-6 text-green-600" />
                    ) : (
                      <XCircle className="w-6 h-6 text-red-600" />
                    )}
                    <div>
                      <p className={`font-semibold text-lg ${capacityResult.qualifies ? 'text-green-800' : 'text-red-800'}`}>
                        {capacityResult.qualifies ? '✅ Cliente califica' : '❌ No califica'}
                      </p>
                      <p className="text-sm" style={{ color: 'var(--slate)' }}>
                        Nivel de riesgo: <span className="font-semibold" style={{ color: 
                          capacityResult.risk_level === 'critical' ? '#991b1b' :
                          capacityResult.risk_level === 'high' ? 'var(--error)' :
                          capacityResult.risk_level === 'medium' ? 'var(--warning)' : 'var(--success)'
                        }}>
                          {capacityResult.risk_level === 'critical' ? '⚫ Crítico' :
                           capacityResult.risk_level === 'high' ? '🔴 Alto' :
                           capacityResult.risk_level === 'medium' ? '🟡 Medio' : '🟢 Bajo'}
                        </span>
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Ingreso total</p>
                      <p className="font-semibold">{fmt(capacityResult.monthly_net_income)}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Gastos fijos</p>
                      <p className="font-semibold">{fmt(capacityResult.monthly_fixed_expenses)}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Ingreso disponible</p>
                      <p className="font-bold" style={{ color: 'var(--gold-700)' }}>
                        {fmt(capacityResult.monthly_net_income - capacityResult.monthly_fixed_expenses)}
                      </p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Capacidad de pago (40%)</p>
                      <p className="font-bold" style={{ color: 'var(--gold-700)' }}>{fmt(capacityResult.payment_capacity)}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Pago mensual propuesto</p>
                      <p className="font-semibold">{fmt(capacityResult.proposed_monthly)}</p>
                    </div>
                    <div>
                      <p style={{ color: 'var(--ash)' }}>Margen</p>
                      <p className="font-semibold" style={{ color: capacityResult.payment_capacity >= capacityResult.proposed_monthly ? 'var(--success)' : 'var(--error)' }}>
                        {fmt(capacityResult.payment_capacity - capacityResult.proposed_monthly)}
                      </p>
                    </div>
                  </div>

                  {/* Ratios */}
                  <div className="grid grid-cols-2 gap-4 pt-3" style={{ borderTop: '1px solid rgba(0,0,0,0.1)' }}>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--ash)' }}>DTI (pago / ingreso bruto)</span>
                        <span className="font-bold" style={{ color: capacityResult.dti_ratio > 40 ? 'var(--error)' : capacityResult.dti_ratio > 30 ? 'var(--warning)' : 'var(--success)' }}>
                          {capacityResult.dti_ratio.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" 
                          style={{ 
                            width: `${Math.min(capacityResult.dti_ratio, 100)}%`,
                            backgroundColor: capacityResult.dti_ratio > 40 ? 'var(--error)' : capacityResult.dti_ratio > 30 ? 'var(--warning)' : 'var(--success)'
                          }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Máx recomendado: 40%</p>
                    </div>
                    <div>
                      <div className="flex justify-between text-xs mb-1">
                        <span style={{ color: 'var(--ash)' }}>Pago / Disponible</span>
                        <span className="font-bold" style={{ color: capacityResult.disposable_ratio > 55 ? 'var(--error)' : capacityResult.disposable_ratio > 40 ? 'var(--warning)' : 'var(--success)' }}>
                          {capacityResult.disposable_ratio.toFixed(1)}%
                        </span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div className="h-2 rounded-full transition-all" 
                          style={{ 
                            width: `${Math.min(capacityResult.disposable_ratio, 100)}%`,
                            backgroundColor: capacityResult.disposable_ratio > 55 ? 'var(--error)' : capacityResult.disposable_ratio > 40 ? 'var(--warning)' : 'var(--success)'
                          }} />
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>Máx recomendado: 55%</p>
                    </div>
                  </div>
                </div>

                {/* Warnings */}
                {capacityResult.warnings.length > 0 && (
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--warning-light)', border: '1px solid #fcd34d' }}>
                    <p className="text-xs font-semibold mb-2" style={{ color: 'var(--warning)' }}>⚠️ Alertas</p>
                    <ul className="space-y-1">
                      {capacityResult.warnings.map((w, i) => (
                        <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: '#92400e' }}>
                          <span className="mt-0.5">•</span> {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== TAB: TERMS & DECISION =================== */}
      {activeTab === 'terms' && (() => {
        // Live RTO calculation based on the editable fields
        const liveDP = downPayment ? parseFloat(downPayment) : desiredDP
        const liveTM = termMonths ? parseInt(termMonths) : desiredTM
        const liveRTO = calculateRTOMonthly({
          salePrice,
          downPayment: liveDP,
          termMonths: liveTM,
          annualRate: annualRatePct / 100,
        })
        const liveMonthly = monthlyRent ? parseFloat(monthlyRent) : liveRTO.monthlyPayment
        const totalRTOIncome = liveMonthly * liveTM + liveDP
        const margin = totalRTOIncome - salePrice
        const roi = salePrice > 0 ? ((totalRTOIncome / salePrice) * 100 - 100) : 0

        return (
        <div className="space-y-6">
          {/* Contract Terms */}
          {canReview && (
            <div className="card-luxury p-6">
              <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <Calculator className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
                Términos del Contrato
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="label">Plazo (meses) *</label>
                  <select value={termMonths} onChange={(e) => setTermMonths(e.target.value)} className="input">
                <option value="">Seleccionar</option>
                <option value="12">12 meses (1 año)</option>
                    <option value="18">18 meses</option>
                <option value="24">24 meses (2 años)</option>
                    <option value="30">30 meses</option>
                <option value="36">36 meses (3 años)</option>
                    <option value="42">42 meses</option>
                <option value="48">48 meses (4 años)</option>
                    <option value="54">54 meses</option>
                <option value="60">60 meses (5 años)</option>
              </select>
            </div>
                <div>
                  <label className="label">Tasa Anual (%)</label>
                  <div className="relative">
                    <input type="number" step="0.5" min="0" max="100"
                      value={annualRatePct}
                      onChange={(e) => setAnnualRatePct(Number(e.target.value))}
                      className="input pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate text-sm">%</span>
                  </div>
            </div>
            <div>
              <label className="label">Enganche</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                    <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)}
                      placeholder={desiredDP ? String(desiredDP) : '0'}
                  className="input pl-8"
                />
              </div>
            </div>
                <div>
                  <label className="label">Renta Mensual (override)</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                    <input type="number" value={monthlyRent} onChange={(e) => setMonthlyRent(e.target.value)}
                      placeholder={String(liveRTO.monthlyPayment)}
                      className="input pl-8"
                    />
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                    Calculado: {fmt(liveRTO.monthlyPayment)}/mes — dejar vacío para usar cálculo automático
                  </p>
            </div>
          </div>

              {/* Interest breakdown */}
              <div className="card-flat p-4 mb-6">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-center text-sm">
                <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>A Financiar</p>
                    <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(liveRTO.financeAmount)}</p>
                </div>
                <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Interés Total</p>
                    <p className="font-semibold" style={{ color: 'var(--warning)' }}>{fmt(Math.round(liveRTO.totalInterest))}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total a Pagar</p>
                    <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(Math.round(liveRTO.totalToPay))}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Ingreso Total</p>
                    <p className="font-serif font-semibold" style={{ color: 'var(--success)' }}>{fmt(Math.round(totalRTOIncome))}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Margen</p>
                    <p className="font-serif font-semibold" style={{ color: margin >= 0 ? 'var(--success)' : 'var(--error)' }}>{fmt(Math.round(margin))}</p>
                </div>
                <div>
                  <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>ROI</p>
                    <p className="font-serif font-semibold" style={{ color: 'var(--info)' }}>{roi.toFixed(1)}%</p>
                </div>
              </div>
                <p className="text-xs mt-3 text-center" style={{ color: 'var(--ash)' }}>
                  Fórmula: ({fmt(liveRTO.financeAmount)} × {annualRatePct}% × {(liveTM / 12).toFixed(1)} años) = {fmt(Math.round(liveRTO.totalInterest))} interés
                  &nbsp;→&nbsp; ({fmt(Math.round(liveRTO.totalToPay))} ÷ {liveTM} meses) = {fmt(liveRTO.monthlyPayment)}/mes (redondeado ↑$5)
                </p>
            </div>

              {/* Amortization Table */}
              {liveRTO.financeAmount > 0 && liveTM > 0 && liveMonthly > 0 && (
                <div className="mb-6">
                  <AmortizationTable
                    principal={liveRTO.financeAmount}
                    monthlyPayment={liveMonthly}
                    termMonths={liveTM}
                    title={`${app.clients?.name || 'Cliente'} — ${prop?.address || 'Propiedad'}`}
                  />
              </div>
            )}

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

              {/* Readiness indicator */}
              <div className="mb-4 flex flex-wrap gap-2 text-xs">
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${kycVerified ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                  {kycVerified ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {kycVerified ? 'Identidad verificada' : 'Identidad pendiente'}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${capacityResult?.qualifies ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                  {capacityResult?.qualifies ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {capacityResult?.qualifies ? 'Capacidad de pago OK' : 'Capacidad de pago pendiente'}
                </span>
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

          {/* Approved — link to generate contract */}
          {app.status === 'approved' && (
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
      })()}

      {/* =================== TAB: PAYMENTS =================== */}
      {activeTab === 'payments' && (
        <div className="space-y-6">
          {!contractId ? (
            <div className="card-luxury p-8 text-center">
              <CreditCard className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
              <h3 className="font-serif text-lg mb-2" style={{ color: 'var(--charcoal)' }}>Sin contrato activo</h3>
              <p className="text-sm" style={{ color: 'var(--slate)' }}>
                Los pagos aparecerán una vez que el contrato RTO sea aprobado y activado.
              </p>
            </div>
          ) : paymentsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} />
            </div>
          ) : (
            <>
              {/* Payment Summary */}
              {paymentsSummary && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="card-luxury p-4 text-center">
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Pagos Hechos</p>
                    <p className="font-serif text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {paymentsSummary.payments_made}/{paymentsSummary.total_payments}
                    </p>
                  </div>
                  <div className="card-luxury p-4 text-center">
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Total Pagado</p>
                    <p className="font-serif text-2xl font-bold" style={{ color: 'var(--success)' }}>
                      {fmt(paymentsSummary.total_paid)}
                    </p>
                  </div>
                  <div className="card-luxury p-4 text-center">
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Restante</p>
                    <p className="font-serif text-2xl font-bold" style={{ color: 'var(--charcoal)' }}>
                      {fmt(paymentsSummary.remaining_balance)}
                    </p>
                  </div>
                  <div className="card-luxury p-4 text-center">
                    <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Progreso</p>
                    <p className="font-serif text-2xl font-bold" style={{ color: 'var(--gold-700)' }}>
                      {paymentsSummary.completion_percentage}%
                    </p>
                  </div>
                </div>
              )}

              {/* Progress bar */}
              {paymentsSummary && (
                <div className="card-luxury p-4">
                  <div className="flex justify-between text-xs mb-2">
                    <span style={{ color: 'var(--slate)' }}>Progreso de pagos</span>
                    <span style={{ color: 'var(--gold-700)' }}>{paymentsSummary.completion_percentage}%</span>
                  </div>
                  <div className="w-full h-3 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                    <div
                      className="h-3 rounded-full transition-all"
                      style={{
                        width: `${paymentsSummary.completion_percentage}%`,
                        backgroundColor: paymentsSummary.completion_percentage >= 100 ? 'var(--success)' : 'var(--gold-600)',
                      }}
                    />
                  </div>
                  {paymentsSummary.total_late_fees > 0 && (
                    <p className="text-xs mt-2" style={{ color: 'var(--error)' }}>
                      ⚠️ Late fees acumulados: {fmt(paymentsSummary.total_late_fees)}
                    </p>
                  )}
                </div>
              )}

              {/* Payment table */}
              <div className="card-luxury overflow-hidden">
                <div className="p-4 border-b" style={{ borderColor: 'var(--sand)' }}>
                  <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                    Calendario de Pagos
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y" style={{ borderColor: 'var(--sand)' }}>
                    <thead style={{ backgroundColor: 'var(--cream)' }}>
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>#</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Fecha Vence</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Monto</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Estado</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Pagado</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Método</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Late Fee</th>
                        <th className="px-4 py-2 text-left text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Acción</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                      {rtoPayments.map((p: any) => {
                        const pStyles: Record<string, { bg: string; color: string; label: string }> = {
                          scheduled: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Programado' },
                          pending: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
                          paid: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Pagado' },
                          late: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Atrasado' },
                          partial: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Parcial' },
                          waived: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Exonerado' },
                        }
                        const ps = pStyles[p.status] || pStyles.scheduled
                        return (
                          <tr key={p.id} className={p.status === 'paid' ? 'opacity-70' : ''}>
                            <td className="px-4 py-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{p.payment_number}</td>
                            <td className="px-4 py-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                              {new Date(p.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </td>
                            <td className="px-4 py-2 text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{fmt(p.amount)}</td>
                            <td className="px-4 py-2">
                              <span className="badge text-xs" style={{ backgroundColor: ps.bg, color: ps.color }}>{ps.label}</span>
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {p.paid_amount ? (
                                <span style={{ color: 'var(--success)' }}>{fmt(p.paid_amount)}</span>
                              ) : (
                                <span style={{ color: 'var(--ash)' }}>—</span>
                              )}
                            </td>
                            <td className="px-4 py-2 text-sm capitalize" style={{ color: 'var(--slate)' }}>
                              {p.payment_method || '—'}
                            </td>
                            <td className="px-4 py-2 text-sm">
                              {p.late_fee_amount > 0 ? (
                                <span style={{ color: 'var(--error)' }}>{fmt(p.late_fee_amount)}</span>
                              ) : (
                                <span style={{ color: 'var(--ash)' }}>—</span>
                              )}
                            </td>
                            <td className="px-4 py-2">
                              {['pending', 'late', 'scheduled'].includes(p.status) && (
                                <button
                                  onClick={() => {
                                    setRecordingPaymentId(p.id)
                                    setExpectedPaymentAmount(p.amount)
                                    setPaymentForm(prev => ({ ...prev, paid_amount: '' }))
                                  }}
                                  className="btn-ghost btn-sm text-xs"
                                >
                                  Registrar
                                </button>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
                {rtoPayments.length === 0 && (
                  <div className="p-8 text-center text-sm" style={{ color: 'var(--ash)' }}>
                    No hay pagos programados. El contrato debe estar activado.
                  </div>
                )}
              </div>

              {/* Record Payment Modal */}
              {recordingPaymentId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                  <div className="card-luxury p-6 w-full max-w-md mx-4 space-y-4">
                    <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Registrar Pago</h3>
                    <div>
                      <label className="label">Método de Pago</label>
                      <select
                        value={paymentForm.payment_method}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_method: e.target.value }))}
                        className="input"
                        style={{ minHeight: 'auto' }}
                      >
                        <option value="zelle">Zelle</option>
                        <option value="transfer">Transferencia</option>
                        <option value="cash">Efectivo</option>
                        <option value="check">Cheque</option>
                        <option value="stripe">Stripe</option>
                      </select>
                    </div>
                    <div>
                      <label className="label">Monto Pagado</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                        <input
                          type="number"
                          value={paymentForm.paid_amount}
                          onChange={(e) => setPaymentForm(prev => ({ ...prev, paid_amount: e.target.value }))}
                          placeholder={expectedPaymentAmount ? `${expectedPaymentAmount.toLocaleString('en-US')} (programado)` : '0'}
                          className="input pl-8"
                        />
                      </div>
                      {expectedPaymentAmount > 0 && (
                        <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                          Monto programado: ${expectedPaymentAmount.toLocaleString('en-US')}. Déjalo vacío para usar ese monto.
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="label">Referencia (opcional)</label>
                      <input
                        type="text"
                        value={paymentForm.payment_reference}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, payment_reference: e.target.value }))}
                        placeholder="# de confirmación"
                        className="input"
                      />
                    </div>
                    <div>
                      <label className="label">Notas (opcional)</label>
                      <input
                        type="text"
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm(prev => ({ ...prev, notes: e.target.value }))}
                        className="input"
                      />
                    </div>
                    <div className="flex gap-3 pt-2">
                      <button
                        onClick={handleRecordPayment}
                        disabled={recordingPayment}
                        className="btn btn-sm flex-1 text-white"
                        style={{ backgroundColor: 'var(--success)' }}
                      >
                        {recordingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Confirmar Pago
                      </button>
                      <button
                        onClick={() => setRecordingPaymentId(null)}
                        className="btn-ghost btn-sm flex-1"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* =================== TAB: DOCUMENTS =================== */}
      {activeTab === 'documents' && (
        <div className="space-y-6">
          {docsLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} />
            </div>
          ) : (() => {
            const allTransfers: any[] = transferData?.all || []
            const clientName = app.clients?.name || ''

            // Phase 1: Homes → Capital (Capital's own documents for the property)
            const capitalTransfer = allTransfers.find(
              (t: any) => t.to_name?.includes('Capital') && t.from_name?.includes('Homes')
            ) || null

            // Phase 2: Capital → Client (title transfer to client after RTO completion)
            const clientTransfer = allTransfers.find(
              (t: any) => t.from_name?.includes('Capital') && !t.to_name?.includes('Capital') && !t.to_name?.includes('Homes')
            ) || null

            const DOC_LABELS: Record<string, { label: string; description: string }> = {
              bill_of_sale: { label: 'Bill of Sale', description: 'Factura de compra-venta' },
              titulo: { label: 'Título (TDHCA)', description: 'Título de propiedad manufacturada' },
              title_application: { label: 'Aplicación Cambio de Título', description: 'Solicitud de transferencia de título' },
            }
            const PRIMARY_DOCS = ['bill_of_sale', 'titulo', 'title_application']

            const getDocInfo = (checklist: any, key: string) => {
              if (!checklist || !checklist[key]) return { checked: false, fileUrl: null }
              const val = checklist[key]
              if (typeof val === 'boolean') return { checked: val, fileUrl: null }
              if (typeof val === 'object') return { checked: val.checked || !!val.file_url, fileUrl: val.file_url || null }
              return { checked: false, fileUrl: null }
            }

            // Reusable doc row renderer
            const renderDocRow = (transfer: any, docKey: string, uploadPrefix: string) => {
              const info = getDocInfo(transfer?.documents_checklist, docKey)
              const label = DOC_LABELS[docKey] || { label: docKey.replace(/_/g, ' '), description: '' }
              const upKey = `${uploadPrefix}_${docKey}`
              return (
                <div key={docKey} className="p-4 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${info.checked ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {info.checked ? (
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      ) : (
                        <FileText className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--charcoal)' }}>{label.label}</p>
                      <p className="text-xs truncate" style={{ color: 'var(--ash)' }}>{label.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {info.fileUrl && (
                      <a href={info.fileUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm text-xs inline-flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5" /> Ver
                      </a>
                    )}
                    {info.fileUrl && (
                      <a href={info.fileUrl} download className="btn-ghost btn-sm text-xs inline-flex items-center gap-1">
                        <Download className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {transfer && (
                      <label className={`btn-ghost btn-sm text-xs inline-flex items-center gap-1 cursor-pointer ${uploadingDoc === upKey ? 'opacity-50 pointer-events-none' : ''}`}>
                        {uploadingDoc === upKey ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                        Subir
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) {
                              setUploadingDoc(upKey)
                              handleDocUpload(transfer.id, docKey, file)
                            }
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )
            }

            const transferStatusLabel: Record<string, { label: string; color: string }> = {
              pending: { label: 'Pendiente', color: 'var(--warning)' },
              in_progress: { label: 'En Proceso', color: 'var(--info)' },
              completed: { label: 'Completada', color: 'var(--success)' },
              cancelled: { label: 'Cancelada', color: 'var(--error)' },
            }

            return (
              <>
                {/* ===== Explainer banner ===== */}
                <div className="card-luxury p-4" style={{ backgroundColor: 'var(--cream)' }}>
                  <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
                    <strong>Flujo de documentos RTO:</strong> Capital adquiere la propiedad de Homes (los documentos salen a nombre de Capital). 
                    Al completar los pagos, Capital transfiere el título y documentos al cliente.
                  </p>
                </div>

                {/* ===== PHASE 1: Capital's Documents (Homes → Capital) ===== */}
                <div className="card-luxury overflow-hidden">
                  <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                    <div>
                      <h3 className="font-serif text-lg flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                        <Home className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
                        Documentos de Capital
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                        Maninos Homes → Maninos Capital • Propiedad a nombre de Capital
                      </p>
                    </div>
                    {capitalTransfer && (
                      <span className="badge text-xs" style={{
                        backgroundColor: transferStatusLabel[capitalTransfer.status]?.color === 'var(--success)' ? 'var(--success-light)' : 'var(--warning-light)',
                        color: transferStatusLabel[capitalTransfer.status]?.color || 'var(--slate)',
                      }}>
                        {transferStatusLabel[capitalTransfer.status]?.label || capitalTransfer.status}
                      </span>
                    )}
                  </div>

                  {capitalTransfer ? (
                    <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                      {PRIMARY_DOCS.map((docKey) => renderDocRow(capitalTransfer, docKey, 'cap'))}
                    </div>
                  ) : (
                    <div className="p-6 text-center">
                      <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        {app.status === 'approved' || app.status === 'under_review'
                          ? 'La transferencia de documentos se creará cuando la solicitud sea aprobada.'
                          : app.status === 'submitted'
                          ? 'Pendiente de aprobación de la solicitud RTO.'
                          : 'No hay transferencia registrada.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* ===== PHASE 2: Client's Documents (Capital → Client) ===== */}
                <div className="card-luxury overflow-hidden">
                  <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                    <div>
                      <h3 className="font-serif text-lg flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                        <User className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
                        Transferencia al Cliente
                      </h3>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                        Maninos Capital → {clientName || 'Cliente'} • Se ejecuta al completar pagos RTO
                      </p>
                    </div>
                    {clientTransfer ? (
                      <span className="badge text-xs" style={{
                        backgroundColor: clientTransfer.status === 'completed' ? 'var(--success-light)' : 'var(--info-light)',
                        color: clientTransfer.status === 'completed' ? 'var(--success)' : 'var(--info)',
                      }}>
                        {transferStatusLabel[clientTransfer.status]?.label || clientTransfer.status}
                      </span>
                    ) : (
                      <span className="badge text-xs" style={{ backgroundColor: 'var(--cream)', color: 'var(--ash)' }}>
                        Pendiente de pagos
                      </span>
                    )}
                  </div>

                  {clientTransfer ? (
                    <>
                      <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                        {PRIMARY_DOCS.map((docKey) => renderDocRow(clientTransfer, docKey, 'cli'))}
                      </div>
                      {clientTransfer.completed_at && (
                        <div className="p-3 text-center text-xs border-t" style={{ borderColor: 'var(--sand)', color: 'var(--success)' }}>
                          ✅ Transferencia completada el {new Date(clientTransfer.completed_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="p-6 text-center space-y-2">
                      <FileSignature className="w-10 h-10 mx-auto" style={{ color: 'var(--sand)' }} />
                      <p className="text-sm" style={{ color: 'var(--ash)' }}>
                        La transferencia al cliente se genera automáticamente cuando se completan todos los pagos del contrato RTO y se ejecuta la entrega del título.
                      </p>
                      {paymentsSummary && paymentsSummary.total_payments > 0 && (
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>
                          Progreso: {paymentsSummary.payments_made}/{paymentsSummary.total_payments} pagos ({paymentsSummary.completion_percentage}%)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ===== Additional Documents (from any transfer) ===== */}
                {(() => {
                  const mainTransfer = capitalTransfer || clientTransfer
                  if (!mainTransfer) return null
                  const otherDocs = Object.keys(mainTransfer.documents_checklist || {}).filter(
                    (k) => !PRIMARY_DOCS.includes(k)
                  )
                  if (otherDocs.length === 0) return null
                  const EXTRA_LABELS: Record<string, string> = {
                    tax_receipt: 'Recibo de Impuestos',
                    id_copies: 'Copias de Identificación',
                    lien_release: 'Liberación de Gravamen',
                    notarized_forms: 'Formularios Notarizados',
                  }
                  return (
                    <div className="card-luxury overflow-hidden">
                      <div className="p-4 border-b" style={{ borderColor: 'var(--sand)' }}>
                        <h3 className="font-serif text-base" style={{ color: 'var(--ink)' }}>
                          Documentos Adicionales
                        </h3>
                      </div>
                      <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                        {otherDocs.map((docKey) => {
                          const info = getDocInfo(mainTransfer.documents_checklist, docKey)
                          return (
                            <div key={docKey} className="p-4 flex items-center justify-between gap-4">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${info.checked ? 'bg-green-100' : 'bg-gray-100'}`}>
                                  {info.checked ? <CheckCircle2 className="w-3 h-3 text-green-600" /> : <Hash className="w-3 h-3 text-gray-400" />}
                                </div>
                                <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
                                  {EXTRA_LABELS[docKey] || docKey.replace(/_/g, ' ')}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {info.fileUrl && (
                                  <a href={info.fileUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm text-xs inline-flex items-center gap-1">
                                    <Eye className="w-3.5 h-3.5" /> Ver
                                  </a>
                                )}
                                <label className={`btn-ghost btn-sm text-xs inline-flex items-center gap-1 cursor-pointer ${uploadingDoc === `extra_${docKey}` ? 'opacity-50 pointer-events-none' : ''}`}>
                                  {uploadingDoc === `extra_${docKey}` ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                                  Subir
                                  <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png,.webp"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) {
                                        setUploadingDoc(`extra_${docKey}`)
                                        handleDocUpload(mainTransfer.id, docKey, file)
                                      }
                                      e.target.value = ''
                                    }}
                                  />
                                </label>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </>
            )
          })()}
        </div>
      )}

    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string | number | undefined; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: 'var(--sand)' }}>
      <span className="text-sm" style={{ color: 'var(--slate)' }}>{label}</span>
      <span className="text-sm font-medium"
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
