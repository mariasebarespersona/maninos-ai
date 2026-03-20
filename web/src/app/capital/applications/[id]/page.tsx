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
  Calendar, Hash, AlertCircle,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { calculateRTOMonthly, DEFAULT_ANNUAL_RATE, getDefaultRate } from '@/lib/rto-calculator'


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

  // Client credit application (filled by client)
  const [clientCreditApp, setClientCreditApp] = useState<any>(null)
  const [loadingCreditApp, setLoadingCreditApp] = useState(true)
  const [showTemplate, setShowTemplate] = useState(false)

  // RTO Calculation (auto-computed from backend)
  const [rtoAnalysis, setRtoAnalysis] = useState<any>(null)
  const [rtoAnalysisLoading, setRtoAnalysisLoading] = useState(false)

  // Credit form (expanded) — manual fallback
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

  // Account statement (for RTO approval decisions)
  const [accountHealth, setAccountHealth] = useState<{
    on_time_rate: number
    health_score: string
    total_overdue: number
    total_paid: number
    remaining_balance: number
    late_payments: number
    on_time_payments: number
  } | null>(null)

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
        // Load KYC status + full client data + account history
        if (data.application.clients?.id) {
          loadKycStatus(data.application.clients.id)
          loadClientFull(data.application.clients.id)
          loadAccountHealth(data.application.clients.id)
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
        // Load client credit application + RTO calculation
        loadCreditApplication()
        loadRtoAnalysis()
      }
    } catch (err) {
      console.error('Error loading application:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCreditApplication = async () => {
    setLoadingCreditApp(true)
    try {
      const res = await fetch(`/api/capital/applications/${id}/credit-application`)
      const data = await res.json()
      if (data.ok && data.credit_application) {
        setClientCreditApp(data.credit_application)
        // Auto-populate capacity calculator
        if (data.credit_application.monthly_income) {
          setMonthlyIncome(parseFloat(data.credit_application.monthly_income) || 0)
        }
        const otherSources = data.credit_application.other_income_sources || []
        const totalOther = otherSources.reduce((s: number, src: any) => s + (parseFloat(src.monthly_amount) || 0), 0)
        if (totalOther > 0) setOtherIncome(totalOther)
        // Auto-populate expenses
        const debts = data.credit_application.debts || []
        const totalDebts = debts.reduce((s: number, d: any) => s + (parseFloat(d.monthly_payment) || 0), 0)
        const totalExpenses = totalDebts
          + (parseFloat(data.credit_application.monthly_rent) || 0)
          + (parseFloat(data.credit_application.monthly_utilities) || 0)
          + (parseFloat(data.credit_application.monthly_child_support_paid) || 0)
          + (parseFloat(data.credit_application.monthly_other_expenses) || 0)
        if (totalExpenses > 0) setMonthlyExpenses(totalExpenses)
      }
    } catch (err) {
      console.error('Error loading credit application:', err)
    } finally {
      setLoadingCreditApp(false)
    }
  }

  const loadRtoAnalysis = async () => {
    setRtoAnalysisLoading(true)
    try {
      const res = await fetch(`/api/capital/applications/${id}/rto-calculation`)
      if (res.ok) {
        const data = await res.json()
        if (data.ok) setRtoAnalysis(data.calculation)
      }
    } catch (err) {
      console.error('Error loading RTO calculation:', err)
    } finally {
      setRtoAnalysisLoading(false)
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

  // ========== Account Health (for RTO decisions) ==========

  const loadAccountHealth = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/account-statement`)
      const data = await res.json()
      if (data.ok) {
        setAccountHealth({
          on_time_rate: data.payment_health?.on_time_rate ?? 100,
          health_score: data.payment_health?.health_score ?? 'excellent',
          total_overdue: data.summary?.total_overdue ?? 0,
          total_paid: data.summary?.total_paid ?? 0,
          remaining_balance: data.summary?.remaining_balance ?? 0,
          late_payments: data.payment_health?.late_payments ?? 0,
          on_time_payments: data.payment_health?.on_time_payments ?? 0,
        })
      }
    } catch (err) { console.error('Error loading account health:', err) }
  }

  // ========== KYC ==========

  const loadKycStatus = async (clientId: string) => {
    try {
      const res = await fetch(`/api/capital/kyc/status/${clientId}`)
      const data = await res.json()
      if (data.ok) {
        setKycStatus(data.kyc_status || 'unverified')
        setKycVerified(data.kyc_verified || false)
        setKycFailReason(data.failure_reason || data.kyc_failure_reason || null)
        setKycRequested(data.kyc_requested || false)
      }
    } catch (err) {
      console.error('Error loading KYC status:', err)
    }
  }

  const handleCheckKycStatus = async () => {
    if (!app?.clients?.id) return
    setKycLoading(true)
    try {
      await loadKycStatus(app.clients.id)
      toast.info('Estado de KYC actualizado')
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
    if (dp < salePrice * 0.30) warnings.push('Enganche < 30% del precio de venta (mínimo requerido)')
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

  const handleDeny = async (reason: 'identity' | 'capacity' | 'other', notes?: string) => {
    if (!confirm('¿Estás seguro de que quieres DENEGAR esta solicitud? La propiedad volverá a estar disponible.')) return
    setReviewing(true)
    try {
      const body: Record<string, any> = {
        status: 'rejected',
        rejection_reason: reason,
        review_notes: notes || reviewNotes || undefined,
        reviewed_by: 'admin',
      }
      const res = await fetch(`/api/capital/applications/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('❌ Solicitud denegada. La propiedad vuelve a estar disponible.')
        loadApplication()
      } else {
        toast.error(data.detail || 'Error al denegar')
      }
    } catch (err) {
      toast.error('Error al procesar')
    } finally {
      setReviewing(false)
    }
  }

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

        // Validate minimum 30% down payment
        const minDP = sp * 0.30
        if (dp < minDP) {
          toast.error(`El enganche mínimo es 30% del precio de venta ($${Math.ceil(minDP).toLocaleString()})`)
          setReviewing(false)
          return
        }

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

      {/* Account Health Banner (for RTO approval decisions) */}
      {accountHealth && (accountHealth.on_time_payments > 0 || accountHealth.late_payments > 0) && (
        <div className="p-4 flex flex-wrap items-center gap-4 border-b" style={{ borderColor: 'var(--sand)', backgroundColor: accountHealth.total_overdue > 0 ? 'var(--error-light, #fef2f2)' : 'var(--sand-light, #fafaf5)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" style={{ color: accountHealth.total_overdue > 0 ? 'var(--error)' : 'var(--gold-600)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--charcoal)' }}>Historial del Cliente:</span>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <span style={{ color: 'var(--slate)' }}>Puntualidad: <strong style={{ color: accountHealth.on_time_rate >= 80 ? 'var(--success)' : 'var(--error)' }}>{accountHealth.on_time_rate}%</strong></span>
            <span style={{ color: 'var(--slate)' }}>A tiempo: <strong>{accountHealth.on_time_payments}</strong></span>
            <span style={{ color: 'var(--slate)' }}>Con retraso: <strong style={{ color: accountHealth.late_payments > 0 ? 'var(--error)' : 'inherit' }}>{accountHealth.late_payments}</strong></span>
            {accountHealth.total_overdue > 0 && (
              <span style={{ color: 'var(--error)' }}>Vencido: <strong>${accountHealth.total_overdue.toLocaleString()}</strong></span>
            )}
            <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{
              backgroundColor: accountHealth.health_score === 'excellent' ? '#dcfce7' : accountHealth.health_score === 'good' ? '#dbeafe' : accountHealth.health_score === 'fair' ? '#fef3c7' : '#fecaca',
              color: accountHealth.health_score === 'excellent' ? '#166534' : accountHealth.health_score === 'good' ? '#1d4ed8' : accountHealth.health_score === 'fair' ? '#92400e' : '#dc2626',
            }}>
              {accountHealth.health_score === 'excellent' ? 'Excelente' : accountHealth.health_score === 'good' ? 'Bueno' : accountHealth.health_score === 'fair' ? 'Regular' : 'En riesgo'}
            </span>
          </div>
        </div>
      )}

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
            ) : kycStatus === 'pending_review' ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--warning-light)' }}>
                  <Clock className="w-5 h-5" style={{ color: 'var(--warning)' }} />
                </div>
                <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--warning)' }}>Documentos por Revisar 📄</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>El cliente subió sus documentos. Revísalos desde la página de KYC.</p>
                </div>
              </>
            ) : kycStatus === 'pending' || kycRequested ? (
              <>
                <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--info-light)' }}>
                  <Mail className="w-5 h-5" style={{ color: 'var(--info)' }} />
                </div>
                <div>
                    <p className="font-semibold text-sm" style={{ color: 'var(--info)' }}>Esperando Documentos 📩</p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Se le solicitó al cliente que suba fotos de su ID + selfie</p>
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
            {!kycVerified && (
              <button onClick={handleCheckKycStatus} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--info)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Clock className="w-3 h-3" />}
                Actualizar Estado
              </button>
            )}
            {!kycVerified && kycStatus !== 'pending_review' && (
              <button onClick={handleRequestKyc} disabled={kycLoading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: 'var(--navy-800)', opacity: kycLoading ? 0.6 : 1 }}>
                {kycLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Mail className="w-3 h-3" />}
                {kycRequested ? 'Re-solicitar Documentos' : 'Solicitar Verificación'}
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

          {/* Decision section for Identity */}
          {canReview && (
            <div className="mt-6 pt-5" style={{ borderTop: '2px solid var(--sand)' }}>
              <h3 className="font-semibold text-sm mb-3" style={{ color: 'var(--charcoal)' }}>Decisión sobre Identidad</h3>
              {kycVerified ? (
                <div className="flex items-center gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--success-light)' }}>
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />
                  <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                    Identidad verificada — puede pasar a Capacidad de Pago
                  </p>
                </div>
              ) : (kycStatus === 'failed' || kycStatus === 'requires_input') ? (
                <div className="p-4 rounded-lg space-y-3" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
                  <p className="text-sm" style={{ color: '#991b1b' }}>
                    La verificación de identidad falló. Puedes reintentar o denegar la solicitud.
                  </p>
                  <div className="flex gap-3">
                    <button onClick={handleRequestKyc} disabled={kycLoading || reviewing}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white"
                      style={{ backgroundColor: 'var(--navy-800)' }}>
                      <Mail className="w-4 h-4" /> Reintentar Verificación
                    </button>
                    <button onClick={() => handleDeny('identity', 'Verificación de identidad fallida')} disabled={reviewing}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white"
                      style={{ backgroundColor: 'var(--error)' }}>
                      {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Denegar Solicitud
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                  <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>
                    {kycRequested || kycStatus === 'pending'
                      ? 'Esperando verificación del cliente. Puedes denegar si no responde o reintentar.'
                      : 'Solicita al cliente que verifique su identidad o deniega la solicitud.'
                    }
                  </p>
                  <button onClick={() => handleDeny('identity', 'No se verificó la identidad del cliente')} disabled={reviewing}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--error)' }}>
                    {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                    Denegar Solicitud por Identidad
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Already rejected */}
          {app.status === 'rejected' && (
            <div className="mt-6 p-4 rounded-lg" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                <p className="font-semibold text-sm" style={{ color: 'var(--error)' }}>Solicitud Denegada</p>
              </div>
              <p className="text-sm" style={{ color: '#991b1b' }}>{app.review_notes || 'Sin notas'}</p>
              {app.reviewed_at && (
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                  {new Date(app.reviewed_at).toLocaleDateString('es-MX')} por {app.reviewed_by || 'Admin'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================== TAB: CAPACITY =================== */}
      {activeTab === 'capacity' && (
        <div className="space-y-5">

          {/* Client Credit Application (read-only viewer) */}
          {loadingCreditApp ? (
            <div className="card-luxury p-8 flex items-center justify-center">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--slate)' }} />
              <span className="ml-2 text-sm" style={{ color: 'var(--slate)' }}>Cargando solicitud...</span>
            </div>
          ) : clientCreditApp && clientCreditApp.status === 'submitted' ? (
            <div className="card-luxury">
              <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                <div>
                  <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                    Solicitud de Crédito — Completada por el Cliente
                  </h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
                    Enviada el {clientCreditApp.submitted_at ? new Date(clientCreditApp.submitted_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700">Recibida</span>
              </div>
              <div className="p-5 space-y-6">
                {/* S1: Personal */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>1. Información Personal</h3>
                  <div className="grid md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Nombre</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.full_name || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Fecha nacimiento</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.date_of_birth || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>SSN (últimos 4)</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.ssn_last4 ? `****${clientCreditApp.ssn_last4}` : '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Estado civil</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.marital_status || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Dependientes</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.dependents_count || 0} {clientCreditApp.dependents_ages ? `(${clientCreditApp.dependents_ages})` : ''}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>ID / Licencia</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.id_number || '—'} {clientCreditApp.id_state ? `(${clientCreditApp.id_state})` : ''}</p></div>
                  </div>
                </div>

                {/* S2: Residence */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>2. Historial de Vivienda</h3>
                  {(clientCreditApp.residence_history || []).length > 0 ? (clientCreditApp.residence_history || []).map((r: any, i: number) => (
                    <div key={i} className="mb-3 p-3 rounded-lg bg-gray-50">
                      <div className="grid md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                        <div className="md:col-span-2"><span className="text-xs" style={{ color: 'var(--ash)' }}>Dirección</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{r.address}, {r.city}, {r.state} {r.zip}</p></div>
                        <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Tipo</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{r.type || '—'}</p></div>
                        <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Pago mensual</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${r.monthly_payment?.toLocaleString() || '0'}</p></div>
                        <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Tiempo</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{r.duration_years || 0} años, {r.duration_months || 0} meses</p></div>
                        {r.landlord_name && <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Arrendador</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{r.landlord_name} {r.landlord_phone ? `(${r.landlord_phone})` : ''}</p></div>}
                      </div>
                    </div>
                  )) : <p className="text-sm italic" style={{ color: 'var(--ash)' }}>Sin historial</p>}
                </div>

                {/* S3: Employment */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>3. Empleo e Ingresos</h3>
                  <div className="grid md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Empleador</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.employer_name || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ocupación</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.occupation || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Tipo empleo</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.employment_type || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso mensual</span><p className="font-semibold text-base" style={{ color: 'var(--gold-700)' }}>${parseFloat(clientCreditApp.monthly_income || 0).toLocaleString()}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Tiempo en empleo</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.time_at_job_years || 0} años, {clientCreditApp.time_at_job_months || 0} meses</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Tel. empleador</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.employer_phone || '—'}</p></div>
                  </div>
                  {clientCreditApp.previous_employer && (
                    <div className="mt-2 p-2 bg-gray-50 rounded text-sm">
                      <span className="text-xs" style={{ color: 'var(--ash)' }}>Empleo anterior:</span> {clientCreditApp.previous_employer} ({clientCreditApp.previous_employer_duration || '—'})
                    </div>
                  )}
                </div>

                {/* S4: Other Income */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>4. Otras Fuentes de Ingreso</h3>
                  {(clientCreditApp.other_income_sources || []).length > 0 ? (
                    <div className="space-y-1">
                      {(clientCreditApp.other_income_sources || []).map((s: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm p-2 rounded bg-gray-50">
                          <span style={{ color: 'var(--charcoal)' }}>{s.source}</span>
                          <span className="font-semibold" style={{ color: 'var(--gold-700)' }}>${parseFloat(s.monthly_amount || 0).toLocaleString()}/mes</span>
                        </div>
                      ))}
                      <div className="flex justify-between text-sm font-semibold pt-1 border-t" style={{ borderColor: 'var(--sand)' }}>
                        <span>Total otros ingresos</span>
                        <span style={{ color: 'var(--gold-700)' }}>${(clientCreditApp.other_income_sources || []).reduce((s: number, x: any) => s + (parseFloat(x.monthly_amount) || 0), 0).toLocaleString()}/mes</span>
                      </div>
                    </div>
                  ) : <p className="text-sm italic" style={{ color: 'var(--ash)' }}>No reportó otras fuentes de ingreso</p>}
                </div>

                {/* S5: Properties — KEY */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>5. Propiedades</h3>
                  {clientCreditApp.owns_properties ? (
                    <div>
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-700 mb-2">Sí, es propietario</span>
                      {(clientCreditApp.properties_owned || []).map((p: any, i: number) => (
                        <div key={i} className="mb-2 p-3 rounded-lg bg-blue-50 border border-blue-100">
                          <div className="grid md:grid-cols-3 gap-x-6 gap-y-1 text-sm">
                            <div className="md:col-span-2"><span className="text-xs" style={{ color: 'var(--ash)' }}>Dirección</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{p.address || '—'}</p></div>
                            <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Valor estimado</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(p.estimated_value || 0).toLocaleString()}</p></div>
                            <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Saldo hipoteca</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(p.mortgage_balance || 0).toLocaleString()}</p></div>
                            <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Pago mensual</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(p.monthly_payment || 0).toLocaleString()}</p></div>
                            {p.rental_income > 0 && <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso de renta</span><p className="font-medium text-green-700">${parseFloat(p.rental_income || 0).toLocaleString()}/mes</p></div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-600">No es propietario de otras propiedades</span>}
                </div>

                {/* S6: Debts */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>6. Deudas y Gastos Mensuales</h3>
                  <div className="grid md:grid-cols-3 gap-x-6 gap-y-2 text-sm mb-2">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Renta/hipoteca</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(clientCreditApp.monthly_rent || 0).toLocaleString()}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Servicios</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(clientCreditApp.monthly_utilities || 0).toLocaleString()}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Child support pagado</span><p className="font-medium" style={{ color: 'var(--ink)' }}>${parseFloat(clientCreditApp.monthly_child_support_paid || 0).toLocaleString()}</p></div>
                  </div>
                  {(clientCreditApp.debts || []).length > 0 && (
                    <div className="space-y-1">
                      {(clientCreditApp.debts || []).map((d: any, i: number) => (
                        <div key={i} className="flex justify-between text-sm p-2 rounded bg-red-50">
                          <span style={{ color: 'var(--charcoal)' }}>{d.type}: {d.creditor || '—'} (saldo: ${parseFloat(d.balance || 0).toLocaleString()})</span>
                          <span className="font-semibold text-red-700">${parseFloat(d.monthly_payment || 0).toLocaleString()}/mes</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* S7: References */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>7. Referencias Personales</h3>
                  <div className="grid md:grid-cols-3 gap-3">
                    {(clientCreditApp.personal_references || []).map((ref: any, i: number) => (
                      <div key={i} className="p-3 rounded-lg bg-gray-50 text-sm">
                        <p className="font-medium" style={{ color: 'var(--ink)' }}>{ref.name || '—'}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>{ref.relationship} · {ref.years_known || '?'} años · {ref.phone || '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* S8: Legal */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>8. Historial Legal</h3>
                  <div className="grid md:grid-cols-3 gap-2 text-sm">
                    {[
                      { key: 'has_bankruptcy', label: 'Bancarrota' },
                      { key: 'has_foreclosure', label: 'Embargo/Recuperación' },
                      { key: 'has_eviction', label: 'Desalojo' },
                      { key: 'has_judgments', label: 'Juicios pendientes' },
                      { key: 'has_federal_debt', label: 'Deuda federal' },
                    ].map(({ key, label }) => (
                      <div key={key} className={`p-2 rounded flex items-center gap-2 ${clientCreditApp[key] ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {clientCreditApp[key] ? <AlertCircle className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span className="text-xs font-medium">{label}: {clientCreditApp[key] ? 'SÍ' : 'No'}</span>
                      </div>
                    ))}
                  </div>
                  {clientCreditApp.legal_details && (
                    <div className="mt-2 p-2 bg-red-50 rounded text-sm text-red-700">
                      <span className="font-medium">Detalles:</span> {clientCreditApp.legal_details}
                    </div>
                  )}
                </div>

                {/* S9: Emergency */}
                <div>
                  <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>9. Contacto de Emergencia</h3>
                  <div className="grid md:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Nombre</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.emergency_name || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Teléfono</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.emergency_phone || '—'}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Relación</span><p className="font-medium" style={{ color: 'var(--ink)' }}>{clientCreditApp.emergency_relationship || '—'}</p></div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card-luxury">
              <div className="p-5 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5" style={{ color: 'var(--ash)' }} />
                  <div>
                    <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>El cliente aún no ha completado la solicitud de crédito</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>La solicitud se envía al cliente después de verificar su identidad (KYC).</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowTemplate(!showTemplate)}
                  className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors hover:bg-gray-50"
                  style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}
                >
                  {showTemplate ? 'Ocultar plantilla' : 'Ver plantilla vacía'}
                </button>
              </div>
              {showTemplate && (
                <div className="px-5 pb-5 border-t space-y-5" style={{ borderColor: 'var(--sand)' }}>
                  <p className="text-xs italic pt-3" style={{ color: 'var(--ash)' }}>
                    Este es el formato que el cliente rellena desde su portal. Se muestra vacío como referencia.
                  </p>

                  {/* S1 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>1. Información Personal</h3>
                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      {['Nombre completo', 'Fecha de nacimiento', 'SSN (últimos 4 dígitos)', 'Estado civil', 'Núm. dependientes + edades', 'Número de licencia / ID + estado emisor'].map(f => (
                        <div key={f} className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                          <span className="text-xs" style={{ color: 'var(--ash)' }}>{f}</span>
                          <p className="text-xs mt-0.5 italic text-gray-300">Campo del cliente</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* S2 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>2. Historial de Vivienda</h3>
                    <div className="p-3 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-sm">
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Dirección actual y anteriores (hasta 3)</p>
                      <div className="grid md:grid-cols-3 gap-2 mt-2">
                        {['Dirección completa', '¿Propia / Rentada / Con familia?', 'Pago mensual', 'Tiempo en la dirección', 'Nombre del arrendador', 'Teléfono del arrendador'].map(f => (
                          <span key={f} className="text-xs px-2 py-1 rounded bg-white border border-gray-100" style={{ color: 'var(--slate)' }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* S3 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>3. Empleo e Ingresos</h3>
                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      {['Empleador actual', 'Dirección del empleador', 'Teléfono del empleador', 'Ocupación / Cargo', 'Tipo de empleo (W-2 / 1099 / Self-employed)', 'Ingreso mensual bruto ($)', 'Tiempo en el empleo', 'Empleo anterior (si < 2 años)'].map(f => (
                        <div key={f} className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                          <span className="text-xs" style={{ color: 'var(--ash)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* S4 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>
                      4. Otras Fuentes de Ingreso
                      <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">CLAVE</span>
                    </h3>
                    <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm">
                      <p className="text-xs mb-2" style={{ color: 'var(--charcoal)' }}>El cliente selecciona categorías con monto mensual:</p>
                      <div className="grid md:grid-cols-2 gap-1.5">
                        {['Segundo trabajo / tiempo parcial', 'Beneficios gobierno (SSI, SSDI, TANF)', 'Beneficios VA (veteranos)', 'Child support / pensión recibida', 'Ingreso de renta (propiedades)', 'Negocio propio / freelance', 'Pensión / retiro', 'Otro'].map(s => (
                          <div key={s} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded bg-white border border-amber-100">
                            <div className="w-3 h-3 rounded border border-amber-300 flex-shrink-0" />
                            <span style={{ color: 'var(--charcoal)' }}>{s}</span>
                            <span className="ml-auto text-amber-400 italic">$___/mes</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* S5 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>
                      5. Propiedades
                      <span className="ml-2 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">CLAVE</span>
                    </h3>
                    <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-sm">
                      <p className="text-xs mb-2" style={{ color: 'var(--charcoal)' }}>¿Es propietario de otras propiedades? (hasta 3)</p>
                      <div className="grid md:grid-cols-3 gap-2">
                        {['Dirección de la propiedad', 'Valor estimado', 'Saldo de hipoteca', 'Pago mensual', 'Ingreso de renta'].map(f => (
                          <span key={f} className="text-xs px-2 py-1.5 rounded bg-white border border-blue-100" style={{ color: 'var(--charcoal)' }}>{f}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* S6 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>6. Deudas y Gastos Mensuales</h3>
                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      {['Renta / hipoteca actual ($)', 'Servicios / utilities ($)', 'Child support pagado ($)', 'Otros gastos ($)'].map(f => (
                        <div key={f} className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                          <span className="text-xs" style={{ color: 'var(--ash)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs mt-2 italic" style={{ color: 'var(--ash)' }}>+ deudas individuales: tipo (auto, tarjeta, préstamo), acreedor, saldo, pago mensual</p>
                  </div>

                  {/* S7 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>7. Referencias Personales (3 mínimo)</h3>
                    <div className="grid md:grid-cols-3 gap-3">
                      {[1, 2, 3].map(n => (
                        <div key={n} className="p-3 rounded-lg bg-gray-50 border border-dashed border-gray-200 text-sm">
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Referencia {n}</p>
                          <div className="space-y-0.5 text-xs" style={{ color: 'var(--ash)' }}>
                            <p>Nombre</p><p>Teléfono</p><p>Relación</p><p>Años de conocerlo</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--ash)' }}>Al menos 1 referencia debe ser no-familiar</p>
                  </div>

                  {/* S8 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>8. Historial Legal (Sí/No)</h3>
                    <div className="grid md:grid-cols-2 gap-2">
                      {[
                        '¿Bancarrota en los últimos 7 años?',
                        '¿Propiedad embargada o recuperada?',
                        '¿Ha sido desalojado?',
                        '¿Juicios pendientes en su contra?',
                        '¿Deuda federal pendiente?',
                      ].map(q => (
                        <div key={q} className="flex items-center gap-2 p-2 rounded bg-gray-50 border border-dashed border-gray-200 text-xs" style={{ color: 'var(--charcoal)' }}>
                          <div className="w-3 h-3 rounded border border-gray-300 flex-shrink-0" />
                          {q}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* S9 */}
                  <div>
                    <h3 className="font-semibold text-sm mb-2 pb-1 border-b" style={{ color: 'var(--charcoal)', borderColor: 'var(--sand)' }}>9. Contacto de Emergencia</h3>
                    <div className="grid md:grid-cols-3 gap-3 text-sm">
                      {['Nombre', 'Teléfono', 'Relación', 'Dirección'].map(f => (
                        <div key={f} className="p-2.5 rounded-lg bg-gray-50 border border-dashed border-gray-200">
                          <span className="text-xs" style={{ color: 'var(--ash)' }}>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}


          {/* RTO Calculation — Auto-computed from backend */}
          {rtoAnalysisLoading ? (
            <div className="card-luxury p-10 flex items-center justify-center gap-3">
              <Loader2 className="w-5 h-5 animate-spin" style={{ color: 'var(--slate)' }} />
              <span className="text-sm" style={{ color: 'var(--slate)' }}>Calculando escenarios RTO...</span>
            </div>
          ) : rtoAnalysis ? (() => { const rtoCalc = rtoAnalysis; return (
            <div className="space-y-5">
              {/* A: Property + Client side by side */}
              <div className="grid md:grid-cols-2 gap-4">
                <div className="card-luxury p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ash)' }}>Propiedad</h3>
                  <p className="font-semibold text-sm mb-2" style={{ color: 'var(--ink)' }}>{rtoCalc.property.address}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Precio venta</span><p className="font-bold" style={{ color: 'var(--ink)' }}>{fmt(rtoCalc.property.sale_price)}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Inversión Maninos</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(rtoCalc.property.total_investment)}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Compra</span><p style={{ color: 'var(--charcoal)' }}>{fmt(rtoCalc.property.purchase_price)}</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Renovación</span><p style={{ color: 'var(--charcoal)' }}>{fmt(rtoCalc.property.renovation_cost)}</p></div>
                  </div>
                </div>
                <div className="card-luxury p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: 'var(--ash)' }}>Cliente</h3>
                  <p className="font-semibold text-sm mb-2" style={{ color: 'var(--ink)' }}>{rtoCalc.client.name}</p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso total</span><p className="font-bold" style={{ color: 'var(--ink)' }}>{fmt(rtoCalc.client.total_income)}/mes</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Renta actual</span><p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(rtoCalc.client.current_rent)}/mes</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso disponible</span><p className="font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(rtoCalc.client.disposable_income)}/mes</p></div>
                    <div><span className="text-xs" style={{ color: 'var(--ash)' }}>Capacidad pago (40%)</span><p className="font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(rtoCalc.client.payment_capacity_40pct)}/mes</p></div>
                  </div>
                </div>
              </div>

              {/* B: Recommended Deal — HIGHLIGHTED */}
              {rtoCalc.recommended && (
                <div className="card-luxury p-5" style={{ borderLeft: '4px solid var(--gold-600)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    <Calculator className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
                    <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Pago Mensual Recomendado</h2>
                  </div>
                  <div className="flex flex-wrap items-end gap-6 mb-4">
                    <div>
                      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Mensualidad</p>
                      <p className="font-serif text-4xl font-bold" style={{ color: 'var(--gold-700)' }}>{fmt(rtoCalc.recommended.monthly_payment)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Plazo</p>
                      <p className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>{rtoCalc.recommended.term_months} meses</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wider" style={{ color: 'var(--ash)' }}>Enganche</p>
                      <p className="text-xl font-semibold" style={{ color: 'var(--ink)' }}>{fmt(rtoCalc.recommended.down_payment)} ({rtoCalc.recommended.down_payment_pct}%)</p>
                    </div>
                  </div>
                  {/* Rent comparison */}
                  {rtoCalc.client.current_rent > 0 && (
                    <div className="p-3 rounded-lg bg-gray-50 flex items-center gap-3 text-sm">
                      <span style={{ color: 'var(--ash)' }}>Renta actual:</span>
                      <span className="font-semibold">{fmt(rtoCalc.client.current_rent)}</span>
                      <span style={{ color: 'var(--ash)' }}>→</span>
                      <span className="font-semibold">{fmt(rtoCalc.recommended.monthly_payment)}</span>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                        rtoCalc.recommended.monthly_payment <= rtoCalc.client.current_rent * 1.3
                          ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        {rtoCalc.recommended.monthly_payment > rtoCalc.client.current_rent
                          ? `+${fmt(rtoCalc.recommended.monthly_payment - rtoCalc.client.current_rent)}/mes`
                          : `${fmt(rtoCalc.recommended.monthly_payment - rtoCalc.client.current_rent)}/mes`
                        }
                      </span>
                    </div>
                  )}
                  <p className="text-xs mt-2 italic" style={{ color: 'var(--ash)' }}>{rtoCalc.recommended.reason}</p>
                </div>
              )}

              {/* C: Scenario Comparison Table */}
              <div className="card-luxury p-5">
                <h3 className="font-serif text-base mb-4" style={{ color: 'var(--ink)' }}>Comparación de Escenarios</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="pb-2 text-xs font-medium" style={{ color: 'var(--ash)' }}>Concepto</th>
                        {rtoCalc.scenarios.map((s: any) => (
                          <th key={s.term_months} className={`pb-2 text-center text-xs font-medium ${
                            rtoCalc.recommended?.term_months === s.term_months ? 'text-white rounded-t-lg' : ''
                          }`} style={rtoCalc.recommended?.term_months === s.term_months ? { backgroundColor: 'var(--gold-700)', color: 'white', padding: '4px 8px' } : { color: 'var(--ash)' }}>
                            {s.term_months} meses
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>Pago Mensual</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className={`py-2 text-center font-bold ${rtoCalc.recommended?.term_months === s.term_months ? 'text-amber-700' : ''}`} style={{ color: rtoCalc.recommended?.term_months === s.term_months ? 'var(--gold-700)' : 'var(--ink)' }}>
                            {fmt(s.monthly_payment)}
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>Total Cliente Paga</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center text-sm" style={{ color: 'var(--charcoal)' }}>{fmt(s.total_client_pays)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>ROI Maninos</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center text-sm font-semibold" style={{ color: 'var(--success)' }}>{s.roi_maninos_pct.toFixed(1)}%</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>Valor Casa al Final</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center text-sm" style={{ color: 'var(--charcoal)' }}>{fmt(s.future_value_at_end)}</td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>vs Renta Actual</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center text-xs">
                            <span className={s.vs_current_rent.difference > 0 ? 'text-amber-600' : 'text-green-600'}>
                              {s.vs_current_rent.difference > 0 ? '+' : ''}{fmt(s.vs_current_rent.difference)}
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>DTI</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center text-xs">
                            <span className={`font-semibold ${s.dti_ratio > 40 ? 'text-red-600' : s.dti_ratio > 30 ? 'text-amber-600' : 'text-green-600'}`}>
                              {s.dti_ratio}%
                            </span>
                          </td>
                        ))}
                      </tr>
                      <tr>
                        <td className="py-2 text-xs" style={{ color: 'var(--charcoal)' }}>Asequible</td>
                        {rtoCalc.scenarios.map((s: any) => (
                          <td key={s.term_months} className="py-2 text-center">
                            {s.affordable
                              ? <CheckCircle2 className="w-4 h-4 text-green-500 mx-auto" />
                              : <XCircle className="w-4 h-4 text-red-400 mx-auto" />
                            }
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              {/* D: ROI Breakdown for Maninos */}
              <div className="card-luxury p-5">
                <h3 className="font-serif text-base mb-3" style={{ color: 'var(--ink)' }}>Retorno para Maninos</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Inversión Total</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{fmt(rtoCalc.maninos_summary.total_investment)}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-green-50">
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso Total</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--success)' }}>{fmt(rtoCalc.maninos_summary.total_income_recommended)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--gold-50, #fef9e7)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Ganancia Neta</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--gold-700)' }}>{fmt(rtoCalc.maninos_summary.net_profit)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--gold-50, #fef9e7)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>ROI</p>
                    <p className="font-bold text-2xl" style={{ color: 'var(--gold-700)' }}>{rtoCalc.maninos_summary.roi_pct}%</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                  <div className="flex justify-between p-2 rounded bg-gray-50">
                    <span style={{ color: 'var(--ash)' }}>Ganancia por financiamiento</span>
                    <span className="font-semibold" style={{ color: 'var(--success)' }}>{fmt(rtoCalc.maninos_summary.financing_return)}</span>
                  </div>
                  <div className="flex justify-between p-2 rounded bg-gray-50">
                    <span style={{ color: 'var(--ash)' }}>Ganancia por activo (venta vs inversión)</span>
                    <span className="font-semibold" style={{ color: rtoCalc.maninos_summary.asset_return >= 0 ? 'var(--success)' : 'var(--error)' }}>{fmt(rtoCalc.maninos_summary.asset_return)}</span>
                  </div>
                </div>
              </div>

              {/* E: Risk Assessment */}
              <div className={`card-luxury p-5 ${
                rtoCalc.risk.level === 'high' ? 'border-l-4 border-red-500' :
                rtoCalc.risk.level === 'medium' ? 'border-l-4 border-amber-500' :
                'border-l-4 border-green-500'
              }`}>
                <div className="flex items-center gap-3 mb-3">
                  {rtoCalc.risk.level === 'high' ? <XCircle className="w-5 h-5 text-red-500" /> :
                   rtoCalc.risk.level === 'medium' ? <AlertTriangle className="w-5 h-5 text-amber-500" /> :
                   <CheckCircle2 className="w-5 h-5 text-green-500" />}
                  <div>
                    <h3 className="font-serif text-base" style={{ color: 'var(--ink)' }}>Evaluación de Riesgo</h3>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      rtoCalc.risk.level === 'high' ? 'bg-red-100 text-red-700' :
                      rtoCalc.risk.level === 'medium' ? 'bg-amber-100 text-amber-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {rtoCalc.risk.level === 'high' ? 'RIESGO ALTO' : rtoCalc.risk.level === 'medium' ? 'RIESGO MEDIO' : 'RIESGO BAJO'}
                    </span>
                  </div>
                </div>
                {/* DTI bar */}
                <div className="mb-3">
                  <div className="flex justify-between text-xs mb-1">
                    <span style={{ color: 'var(--ash)' }}>DTI (pago / ingreso)</span>
                    <span className="font-bold" style={{ color: rtoCalc.risk.dti_ratio > 40 ? 'var(--error)' : rtoCalc.risk.dti_ratio > 30 ? 'var(--warning)' : 'var(--success)' }}>
                      {rtoCalc.risk.dti_ratio}%
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="h-2 rounded-full" style={{
                      width: `${Math.min(rtoCalc.risk.dti_ratio, 100)}%`,
                      backgroundColor: rtoCalc.risk.dti_ratio > 40 ? 'var(--error)' : rtoCalc.risk.dti_ratio > 30 ? 'var(--warning)' : 'var(--success)'
                    }} />
                  </div>
                </div>
                {rtoCalc.risk.factors.length > 0 && (
                  <ul className="space-y-1">
                    {rtoCalc.risk.factors.map((f: string, i: number) => (
                      <li key={i} className="text-xs flex items-start gap-1.5" style={{ color: rtoCalc.risk.level === 'high' ? '#991b1b' : '#92400e' }}>
                        <span>•</span> {f}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* F: Future Value */}
              <div className="card-luxury p-5">
                <h3 className="font-serif text-base mb-3" style={{ color: 'var(--ink)' }}>Predicción de Valor Futuro</h3>
                <div className="flex items-center gap-4 mb-3">
                  <div className="text-center">
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Valor hoy</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{fmt(rtoCalc.future_value.current_market_value)}</p>
                  </div>
                  <div className="text-2xl" style={{ color: 'var(--ash)' }}>→</div>
                  <div className="text-center">
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>En {rtoCalc.recommended?.term_months || 36} meses</p>
                    <p className="font-bold text-lg" style={{ color: 'var(--charcoal)' }}>{fmt(rtoCalc.future_value.at_end_of_recommended_term)}</p>
                  </div>
                  <div>
                    <span className="text-xs font-semibold px-2 py-1 rounded-full bg-gray-100" style={{ color: 'var(--slate)' }}>
                      -{rtoCalc.future_value.total_depreciation_pct}% depreciación
                    </span>
                  </div>
                </div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  Tasa de depreciación: {(rtoCalc.future_value.depreciation_rate_annual * 100).toFixed(1)}% anual |
                  Confianza: <span className={`font-semibold ${rtoCalc.future_value.confidence === 'alta' ? 'text-green-600' : rtoCalc.future_value.confidence === 'media' ? 'text-amber-600' : 'text-red-600'}`}>
                    {rtoCalc.future_value.confidence}
                  </span>
                  {rtoCalc.future_value.similar_houses?.length > 0 && ` (basado en ${rtoCalc.future_value.similar_houses.length} casas similares)`}
                </p>
              </div>
            </div>
          ) })() : (
            <div className="card-luxury p-5 text-center" style={{ color: 'var(--ash)' }}>
              <p className="text-sm">No se pudo calcular. Verifica que la propiedad tenga precio de venta y que exista una solicitud de crédito.</p>
            </div>
          )}

          {/* Already rejected */}
          {app.status === 'rejected' && (
            <div className="card-luxury p-4" style={{ backgroundColor: '#fef2f2', border: '1px solid #fecaca' }}>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />
                <p className="font-semibold text-sm" style={{ color: 'var(--error)' }}>Solicitud Denegada</p>
              </div>
              <p className="text-sm" style={{ color: '#991b1b' }}>{app.review_notes || 'Sin notas'}</p>
            </div>
          )}
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
              <label className="label">Enganche (mín. 30%)</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                    <input type="number" value={downPayment} onChange={(e) => setDownPayment(e.target.value)}
                      placeholder={desiredDP ? String(desiredDP) : String(Math.ceil(salePrice * 0.30))}
                  className="input pl-8"
                />
              </div>
              <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                Mínimo: {fmt(Math.ceil(salePrice * 0.30))} (30%)
              </p>
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
                <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full ${rtoAnalysis ? 'bg-green-50 text-green-700' : 'bg-yellow-50 text-yellow-700'}`}>
                  {rtoAnalysis ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                  {rtoAnalysis ? 'Cálculo RTO completado' : 'Cálculo RTO pendiente'}
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
                        Maninos Homes → Maninos Homes • Propiedad a nombre de Capital
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
                        Maninos Homes → {clientName || 'Cliente'} • Se ejecuta al completar pagos RTO
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
    rejected: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Denegada' },
    cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
  }
  const s = styles[status] || styles.submitted
  return <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
}
