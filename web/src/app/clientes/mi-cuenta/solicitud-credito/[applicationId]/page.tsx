'use client'

import React, { useState, useEffect, useCallback, useRef, forwardRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Save,
  Send,
  CheckCircle,
  User,
  Home,
  Briefcase,
  DollarSign,
  Building2,
  CreditCard,
  Users,
  Scale,
  Phone,
  Plus,
  Trash2,
  AlertCircle,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

/* ─── Types ─── */

interface Residence {
  address: string
  city: string
  state: string
  zip: string
  type: string
  monthly_payment: number | ''
  duration_years: number | ''
  duration_months: number | ''
  landlord_name: string
  landlord_phone: string
}

interface IncomeSource {
  category: string
  monthly_amount: number | ''
}

interface OwnedProperty {
  address: string
  estimated_value: number | ''
  mortgage_balance: number | ''
  monthly_payment: number | ''
  rental_income: number | ''
}

interface Debt {
  type: string
  creditor: string
  balance: number | ''
  monthly_payment: number | ''
}

interface Reference {
  name: string
  phone: string
  relationship: string
  years_known: number | ''
}

interface FormData {
  // Section 1: Personal Info
  full_name: string
  date_of_birth: string
  ssn_last4: string
  marital_status: string
  dependents_count: number | ''
  dependents_ages: string
  id_number: string
  id_state: string

  // Section 2: Housing History
  residences: Residence[]

  // Section 3: Employment
  employer_name: string
  employer_address: string
  employer_phone: string
  occupation: string
  employment_type: string
  monthly_income: number | ''
  time_at_job_years: number | ''
  time_at_job_months: number | ''
  previous_employer: string
  previous_employer_duration: string

  // Section 4: Other Income
  other_income_sources: IncomeSource[]

  // Section 5: Properties
  owns_properties: boolean
  owned_properties: OwnedProperty[]

  // Section 6: Debts
  monthly_rent: number | ''
  debts: Debt[]
  monthly_child_support_paid: number | ''
  monthly_utilities: number | ''
  monthly_other_expenses: number | ''

  // Section 7: References
  references: Reference[]

  // Section 8: Legal
  has_bankruptcy: boolean
  has_foreclosure: boolean
  has_eviction: boolean
  has_judgments: boolean
  has_federal_debt: boolean
  legal_details: string

  // Section 9: Emergency Contact
  emergency_name: string
  emergency_phone: string
  emergency_relationship: string
  emergency_address: string
}

const EMPTY_RESIDENCE: Residence = {
  address: '', city: '', state: '', zip: '', type: '',
  monthly_payment: '', duration_years: '', duration_months: '',
  landlord_name: '', landlord_phone: '',
}

const EMPTY_PROPERTY: OwnedProperty = {
  address: '', estimated_value: '', mortgage_balance: '',
  monthly_payment: '', rental_income: '',
}

const EMPTY_DEBT: Debt = {
  type: '', creditor: '', balance: '', monthly_payment: '',
}

const EMPTY_REFERENCE: Reference = {
  name: '', phone: '', relationship: '', years_known: '',
}

const INITIAL_FORM: FormData = {
  full_name: '',
  date_of_birth: '',
  ssn_last4: '',
  marital_status: '',
  dependents_count: '',
  dependents_ages: '',
  id_number: '',
  id_state: '',
  residences: [{ ...EMPTY_RESIDENCE }],
  employer_name: '',
  employer_address: '',
  employer_phone: '',
  occupation: '',
  employment_type: '',
  monthly_income: '',
  time_at_job_years: '',
  time_at_job_months: '',
  previous_employer: '',
  previous_employer_duration: '',
  other_income_sources: [],
  owns_properties: false,
  owned_properties: [],
  monthly_rent: '',
  debts: [],
  monthly_child_support_paid: '',
  monthly_utilities: '',
  monthly_other_expenses: '',
  references: [{ ...EMPTY_REFERENCE }, { ...EMPTY_REFERENCE }, { ...EMPTY_REFERENCE }],
  has_bankruptcy: false,
  has_foreclosure: false,
  has_eviction: false,
  has_judgments: false,
  has_federal_debt: false,
  legal_details: '',
  emergency_name: '',
  emergency_phone: '',
  emergency_relationship: '',
  emergency_address: '',
}

const SECTIONS = [
  { id: 1, label: 'Información Personal', icon: User },
  { id: 2, label: 'Historial de Vivienda', icon: Home },
  { id: 3, label: 'Empleo e Ingresos', icon: Briefcase },
  { id: 4, label: 'Otras Fuentes de Ingreso', icon: DollarSign },
  { id: 5, label: 'Propiedades', icon: Building2 },
  { id: 6, label: 'Deudas y Gastos', icon: CreditCard },
  { id: 7, label: 'Referencias Personales', icon: Users },
  { id: 8, label: 'Historial Legal', icon: Scale },
  { id: 9, label: 'Contacto de Emergencia', icon: Phone },
]

const INCOME_CATEGORIES = [
  'Segundo trabajo / tiempo parcial',
  'Beneficios gobierno (SSI, SSDI, TANF)',
  'Beneficios VA (veteranos)',
  'Child support / pensión recibida',
  'Ingreso de renta (propiedades)',
  'Negocio propio / freelance',
  'Pensión / retiro',
  'Otro',
]

const MARITAL_OPTIONS = ['Soltero/a', 'Casado/a', 'Separado/a', 'Unión libre', 'Viudo/a']
const RESIDENCE_TYPES = ['Propia', 'Rentada', 'Con familia', 'Otra']
const EMPLOYMENT_TYPES = ['Tiempo completo', 'Medio tiempo', 'Auto-empleado', '1099/Contratista', 'Trabajo en efectivo']
const DEBT_TYPES = ['Auto', 'Tarjeta de crédito', 'Préstamo personal', 'Préstamo estudiantil', 'Otro']
const RELATIONSHIP_TYPES = ['Amigo/a', 'Compañero de trabajo', 'Familiar', 'Pastor/líder', 'Vecino', 'Otro']

/* ─── Main Component ─── */

export default function CreditApplicationPage() {
  const { client, loading: authLoading } = useClientAuth()
  const params = useParams()
  const router = useRouter()
  const applicationId = params.applicationId as string

  const [formData, setFormData] = useState<FormData>({ ...INITIAL_FORM })
  const [activeSection, setActiveSection] = useState(1)
  const [status, setStatus] = useState<'draft' | 'submitted' | 'loading'>('loading')
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [dataLoaded, setDataLoaded] = useState(false)

  const sectionRefs = useRef<Record<number, HTMLDivElement | null>>({})
  const lastSavedSection = useRef<number>(0)

  /* ─── Load existing data ─── */
  const loadApplication = useCallback(async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/credit-application/${clientId}/${applicationId}`)
      const data = await res.json()
      if (data.ok && data.application) {
        const app = data.application
        setFormData(prev => ({
          ...prev,
          ...app.form_data,
          full_name: app.form_data?.full_name || client?.name || '',
        }))
        setStatus(app.status === 'submitted' ? 'submitted' : 'draft')
      } else {
        // New application, pre-fill name
        setFormData(prev => ({ ...prev, full_name: client?.name || '' }))
        setStatus('draft')
      }
    } catch {
      toast.error('Error al cargar la solicitud')
      setStatus('draft')
      setFormData(prev => ({ ...prev, full_name: client?.name || '' }))
    } finally {
      setDataLoaded(true)
    }
  }, [applicationId, client?.name])

  useEffect(() => {
    if (client && !dataLoaded) loadApplication(client.id)
  }, [client, dataLoaded, loadApplication])

  /* ─── Save draft ─── */
  const saveDraft = useCallback(async (silent = false) => {
    if (!client || status === 'submitted') return
    if (!silent) setSaving(true)
    try {
      const res = await fetch(`/api/public/credit-application/${client.id}/${applicationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      const data = await res.json()
      if (!data.ok && !silent) {
        toast.error('Error al guardar borrador')
      } else if (!silent) {
        toast.success('Borrador guardado')
      }
    } catch {
      if (!silent) toast.error('Error de conexión al guardar')
    } finally {
      if (!silent) setSaving(false)
    }
  }, [client, applicationId, formData, status])

  /* ─── Auto-save when leaving a section ─── */
  useEffect(() => {
    if (lastSavedSection.current !== 0 && lastSavedSection.current !== activeSection && dataLoaded) {
      saveDraft(true)
    }
    lastSavedSection.current = activeSection
  }, [activeSection, saveDraft, dataLoaded])

  /* ─── Submit ─── */
  const handleSubmit = async () => {
    if (!client) return

    // Basic validation
    if (!formData.full_name.trim()) { toast.error('El nombre completo es requerido'); return }
    if (!formData.date_of_birth) { toast.error('La fecha de nacimiento es requerida'); return }
    if (!formData.ssn_last4 || formData.ssn_last4.length !== 4) { toast.error('Los últimos 4 dígitos del SSN son requeridos'); return }
    if (!formData.marital_status) { toast.error('El estado civil es requerido'); return }
    if (!formData.id_number.trim()) { toast.error('El número de identificación es requerido'); return }
    if (!formData.residences[0]?.address.trim()) { toast.error('La dirección actual es requerida'); return }
    if (!formData.employer_name.trim()) { toast.error('El nombre del empleador es requerido'); return }
    if (!formData.monthly_income) { toast.error('El ingreso mensual es requerido'); return }
    if (formData.references.some(r => !r.name.trim() || !r.phone.trim())) { toast.error('Las 3 referencias personales son requeridas'); return }
    if (!formData.emergency_name.trim() || !formData.emergency_phone.trim()) { toast.error('El contacto de emergencia es requerido'); return }

    setSubmitting(true)
    try {
      // Save first
      await fetch(`/api/public/credit-application/${client.id}/${applicationId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })
      // Then submit
      const res = await fetch(`/api/public/credit-application/${client.id}/${applicationId}/submit`, {
        method: 'POST',
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Solicitud enviada exitosamente')
        router.push('/clientes/mi-cuenta')
      } else {
        toast.error(data.error || 'Error al enviar la solicitud')
      }
    } catch {
      toast.error('Error de conexión al enviar')
    } finally {
      setSubmitting(false)
    }
  }

  /* ─── Scroll to section ─── */
  const scrollToSection = (id: number) => {
    setActiveSection(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  /* ─── Track active section on scroll ─── */
  useEffect(() => {
    const handleScroll = () => {
      const offsets = SECTIONS.map(s => {
        const el = sectionRefs.current[s.id]
        if (!el) return { id: s.id, top: Infinity }
        return { id: s.id, top: Math.abs(el.getBoundingClientRect().top - 120) }
      })
      const closest = offsets.reduce((a, b) => a.top < b.top ? a : b)
      setActiveSection(closest.id)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  /* ─── Helpers ─── */
  const updateField = <K extends keyof FormData>(key: K, value: FormData[K]) => {
    setFormData(prev => ({ ...prev, [key]: value }))
  }

  const updateResidence = (index: number, field: keyof Residence, value: string | number) => {
    setFormData(prev => {
      const residences = [...prev.residences]
      residences[index] = { ...residences[index], [field]: value }
      return { ...prev, residences }
    })
  }

  const addResidence = () => {
    if (formData.residences.length >= 3) return
    setFormData(prev => ({ ...prev, residences: [...prev.residences, { ...EMPTY_RESIDENCE }] }))
  }

  const removeResidence = (index: number) => {
    if (formData.residences.length <= 1) return
    setFormData(prev => ({ ...prev, residences: prev.residences.filter((_, i) => i !== index) }))
  }

  const toggleIncomeCategory = (category: string) => {
    setFormData(prev => {
      const exists = prev.other_income_sources.find(s => s.category === category)
      if (exists) {
        return { ...prev, other_income_sources: prev.other_income_sources.filter(s => s.category !== category) }
      }
      return { ...prev, other_income_sources: [...prev.other_income_sources, { category, monthly_amount: '' }] }
    })
  }

  const updateIncomeAmount = (category: string, amount: number | '') => {
    setFormData(prev => ({
      ...prev,
      other_income_sources: prev.other_income_sources.map(s =>
        s.category === category ? { ...s, monthly_amount: amount } : s
      ),
    }))
  }

  const addProperty = () => {
    if (formData.owned_properties.length >= 3) return
    setFormData(prev => ({ ...prev, owned_properties: [...prev.owned_properties, { ...EMPTY_PROPERTY }] }))
  }

  const removeProperty = (index: number) => {
    setFormData(prev => ({ ...prev, owned_properties: prev.owned_properties.filter((_, i) => i !== index) }))
  }

  const updateProperty = (index: number, field: keyof OwnedProperty, value: string | number) => {
    setFormData(prev => {
      const owned_properties = [...prev.owned_properties]
      owned_properties[index] = { ...owned_properties[index], [field]: value }
      return { ...prev, owned_properties }
    })
  }

  const addDebt = () => {
    setFormData(prev => ({ ...prev, debts: [...prev.debts, { ...EMPTY_DEBT }] }))
  }

  const removeDebt = (index: number) => {
    setFormData(prev => ({ ...prev, debts: prev.debts.filter((_, i) => i !== index) }))
  }

  const updateDebt = (index: number, field: keyof Debt, value: string | number) => {
    setFormData(prev => {
      const debts = [...prev.debts]
      debts[index] = { ...debts[index], [field]: value }
      return { ...prev, debts }
    })
  }

  const updateReference = (index: number, field: keyof Reference, value: string | number) => {
    setFormData(prev => {
      const references = [...prev.references]
      references[index] = { ...references[index], [field]: value }
      return { ...prev, references }
    })
  }

  const sectionHasData = (id: number): boolean => {
    switch (id) {
      case 1: return !!(formData.full_name && formData.date_of_birth && formData.ssn_last4)
      case 2: return !!(formData.residences[0]?.address)
      case 3: return !!(formData.employer_name && formData.monthly_income)
      case 4: return formData.other_income_sources.length > 0
      case 5: return formData.owns_properties ? formData.owned_properties.length > 0 : true
      case 6: return !!(formData.monthly_rent || formData.debts.length > 0)
      case 7: return formData.references.every(r => r.name && r.phone)
      case 8: return true // always "complete" since defaults are false
      case 9: return !!(formData.emergency_name && formData.emergency_phone)
      default: return false
    }
  }

  const totalOtherIncome = formData.other_income_sources.reduce(
    (sum, s) => sum + (typeof s.monthly_amount === 'number' ? s.monthly_amount : 0), 0
  )

  const totalMonthlyObligations =
    (typeof formData.monthly_rent === 'number' ? formData.monthly_rent : 0) +
    formData.debts.reduce((sum, d) => sum + (typeof d.monthly_payment === 'number' ? d.monthly_payment : 0), 0) +
    (typeof formData.monthly_child_support_paid === 'number' ? formData.monthly_child_support_paid : 0) +
    (typeof formData.monthly_utilities === 'number' ? formData.monthly_utilities : 0) +
    (typeof formData.monthly_other_expenses === 'number' ? formData.monthly_other_expenses : 0)

  const timeAtJob = (typeof formData.time_at_job_years === 'number' ? formData.time_at_job_years : 0) * 12 +
    (typeof formData.time_at_job_months === 'number' ? formData.time_at_job_months : 0)
  const showPreviousEmployer = timeAtJob > 0 && timeAtJob < 24

  const anyLegalYes = formData.has_bankruptcy || formData.has_foreclosure ||
    formData.has_eviction || formData.has_judgments || formData.has_federal_debt

  const isReadonly = status === 'submitted'

  /* ─── Loading ─── */
  if (authLoading || status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!client) return null

  /* ─── Render ─── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <Link
                href="/clientes/mi-cuenta"
                className="inline-flex items-center gap-1.5 text-[13px] text-[#717171] hover:text-[#222] transition-colors mb-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Mi Cuenta
              </Link>
              <div className="flex items-center gap-3">
                <h1 className="text-[18px] sm:text-[22px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>
                  Solicitud de Crédito RTO
                </h1>
                {status === 'submitted' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-green-100 text-green-700">
                    <CheckCircle className="w-3 h-3" /> Enviada
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
                    Borrador
                  </span>
                )}
              </div>
            </div>
            {!isReadonly && (
              <button
                onClick={() => saveDraft(false)}
                disabled={saving}
                className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-200 text-[13px] font-semibold text-[#222] hover:bg-gray-50 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                Guardar
              </button>
            )}
          </div>

          {/* Mobile stepper */}
          <div className="flex gap-1 mt-3 sm:hidden overflow-x-auto pb-1">
            {SECTIONS.map(s => (
              <button
                key={s.id}
                onClick={() => scrollToSection(s.id)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                  activeSection === s.id
                    ? 'bg-[#004274] text-white'
                    : sectionHasData(s.id)
                      ? 'bg-green-50 text-green-700 border border-green-200'
                      : 'bg-white text-[#717171] border border-gray-200'
                }`}
              >
                {sectionHasData(s.id) && activeSection !== s.id && <CheckCircle className="w-3 h-3" />}
                {s.id}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6">
        <div className="flex gap-8">
          {/* Desktop sidebar */}
          <div className="hidden sm:block w-56 flex-shrink-0">
            <div className="sticky top-28">
              <nav className="space-y-0.5">
                {SECTIONS.map(s => {
                  const Icon = s.icon
                  const complete = sectionHasData(s.id)
                  return (
                    <button
                      key={s.id}
                      onClick={() => scrollToSection(s.id)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-left transition-colors ${
                        activeSection === s.id
                          ? 'bg-[#004274]/10 text-[#004274]'
                          : 'text-[#717171] hover:bg-gray-100'
                      }`}
                    >
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                        complete ? 'bg-green-100' : activeSection === s.id ? 'bg-[#004274]/10' : 'bg-gray-100'
                      }`}>
                        {complete ? (
                          <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                        ) : (
                          <Icon className={`w-3.5 h-3.5 ${activeSection === s.id ? 'text-[#004274]' : 'text-[#aaa]'}`} />
                        )}
                      </div>
                      <span className="text-[13px] font-medium truncate">{s.label}</span>
                    </button>
                  )
                })}
              </nav>

              <div className="mt-6 p-3 bg-blue-50 rounded-xl">
                <p className="text-[11px] text-[#004274] font-medium">
                  Progreso: {SECTIONS.filter(s => sectionHasData(s.id)).length} de {SECTIONS.length} secciones
                </p>
                <div className="mt-2 h-1.5 bg-blue-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#004274] rounded-full transition-all"
                    style={{ width: `${(SECTIONS.filter(s => sectionHasData(s.id)).length / SECTIONS.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Form content */}
          <div className="flex-1 min-w-0 space-y-6">

            {isReadonly && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-[14px] font-semibold text-green-800">Solicitud enviada</p>
                  <p className="text-[13px] text-green-600">
                    Tu solicitud ha sido enviada y está siendo revisada por nuestro equipo.
                    Te contactaremos pronto con los siguientes pasos.
                  </p>
                </div>
              </div>
            )}

            {/* ═══════ SECTION 1: Personal Info ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[1] = el }}
              number={1}
              title="Información Personal"
              icon={User}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nombre completo *</Label>
                  <Input value={formData.full_name} onChange={v => updateField('full_name', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Fecha de nacimiento *</Label>
                  <Input type="date" value={formData.date_of_birth} onChange={v => updateField('date_of_birth', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>SSN (últimos 4 dígitos) *</Label>
                  <Input
                    value={formData.ssn_last4}
                    onChange={v => updateField('ssn_last4', v.replace(/\D/g, '').slice(0, 4))}
                    placeholder="Últimos 4 dígitos"
                    maxLength={4}
                    disabled={isReadonly}
                  />
                </div>
                <div>
                  <Label>Estado civil *</Label>
                  <Select value={formData.marital_status} onChange={v => updateField('marital_status', v)} options={MARITAL_OPTIONS} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Número de dependientes</Label>
                  <Input
                    type="number"
                    value={formData.dependents_count}
                    onChange={v => updateField('dependents_count', v === '' ? '' : Number(v))}
                    disabled={isReadonly}
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label>Edades de dependientes</Label>
                  <Input value={formData.dependents_ages} onChange={v => updateField('dependents_ages', v)} placeholder="Ej: 5, 8, 12" disabled={isReadonly} />
                </div>
                <div>
                  <Label>Número de licencia o ID *</Label>
                  <Input value={formData.id_number} onChange={v => updateField('id_number', v)} placeholder="Número de licencia o ID" disabled={isReadonly} />
                </div>
                <div>
                  <Label>Estado emisor</Label>
                  <Input value={formData.id_state} onChange={v => updateField('id_state', v)} placeholder="Estado emisor" disabled={isReadonly} />
                </div>
              </div>
            </SectionCard>

            {/* ═══════ SECTION 2: Housing History ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[2] = el }}
              number={2}
              title="Historial de Vivienda"
              icon={Home}
            >
              {formData.residences.map((res, i) => (
                <div key={i} className={`${i > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}`}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-[14px] font-semibold text-[#222]">
                      {i === 0 ? 'Dirección actual' : `Dirección anterior ${i}`}
                    </p>
                    {i > 0 && !isReadonly && (
                      <button onClick={() => removeResidence(i)} className="text-red-400 hover:text-red-600 transition-colors">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                      <Label>Dirección *</Label>
                      <Input value={res.address} onChange={v => updateResidence(i, 'address', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Ciudad</Label>
                      <Input value={res.city} onChange={v => updateResidence(i, 'city', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Estado</Label>
                      <Input value={res.state} onChange={v => updateResidence(i, 'state', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Código postal</Label>
                      <Input value={res.zip} onChange={v => updateResidence(i, 'zip', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Tipo</Label>
                      <Select value={res.type} onChange={v => updateResidence(i, 'type', v)} options={RESIDENCE_TYPES} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Pago mensual</Label>
                      <InputMoney value={res.monthly_payment} onChange={v => updateResidence(i, 'monthly_payment', v)} disabled={isReadonly} />
                    </div>
                    <div className="flex gap-3">
                      <div className="flex-1">
                        <Label>Años</Label>
                        <Input
                          type="number"
                          value={res.duration_years}
                          onChange={v => updateResidence(i, 'duration_years', v === '' ? '' : Number(v))}
                          disabled={isReadonly}
                        />
                      </div>
                      <div className="flex-1">
                        <Label>Meses</Label>
                        <Input
                          type="number"
                          value={res.duration_months}
                          onChange={v => updateResidence(i, 'duration_months', v === '' ? '' : Number(v))}
                          disabled={isReadonly}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Nombre del arrendador</Label>
                      <Input value={res.landlord_name} onChange={v => updateResidence(i, 'landlord_name', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Teléfono del arrendador</Label>
                      <Input value={res.landlord_phone} onChange={v => updateResidence(i, 'landlord_phone', v)} disabled={isReadonly} />
                    </div>
                  </div>
                </div>
              ))}
              {formData.residences.length < 3 && !isReadonly && (
                <button
                  onClick={addResidence}
                  className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#004274] hover:text-[#00233d] transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Agregar dirección anterior
                </button>
              )}
            </SectionCard>

            {/* ═══════ SECTION 3: Employment ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[3] = el }}
              number={3}
              title="Empleo e Ingresos"
              icon={Briefcase}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Nombre del empleador *</Label>
                  <Input value={formData.employer_name} onChange={v => updateField('employer_name', v)} disabled={isReadonly} />
                </div>
                <div className="sm:col-span-2">
                  <Label>Dirección del empleador</Label>
                  <Input value={formData.employer_address} onChange={v => updateField('employer_address', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Teléfono del empleador</Label>
                  <Input value={formData.employer_phone} onChange={v => updateField('employer_phone', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Ocupación / Puesto</Label>
                  <Input value={formData.occupation} onChange={v => updateField('occupation', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Tipo de empleo</Label>
                  <Select value={formData.employment_type} onChange={v => updateField('employment_type', v)} options={EMPLOYMENT_TYPES} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Ingreso mensual *</Label>
                  <InputMoney
                    value={formData.monthly_income}
                    onChange={v => updateField('monthly_income', v)}
                    disabled={isReadonly}
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <Label>Tiempo en empleo (años)</Label>
                    <Input
                      type="number"
                      value={formData.time_at_job_years}
                      onChange={v => updateField('time_at_job_years', v === '' ? '' : Number(v))}
                      disabled={isReadonly}
                    />
                  </div>
                  <div className="flex-1">
                    <Label>Meses</Label>
                    <Input
                      type="number"
                      value={formData.time_at_job_months}
                      onChange={v => updateField('time_at_job_months', v === '' ? '' : Number(v))}
                      disabled={isReadonly}
                    />
                  </div>
                </div>
              </div>

              {showPreviousEmployer && (
                <div className="mt-6 pt-6 border-t border-gray-100">
                  <p className="text-[13px] text-[#717171] mb-3">
                    Como llevas menos de 2 años en tu empleo actual, indícanos tu empleador anterior:
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Empleador anterior</Label>
                      <Input value={formData.previous_employer} onChange={v => updateField('previous_employer', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Duración en empleo anterior</Label>
                      <Input value={formData.previous_employer_duration} onChange={v => updateField('previous_employer_duration', v)} placeholder="Ej: 3 años" disabled={isReadonly} />
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>

            {/* ═══════ SECTION 4: Other Income ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[4] = el }}
              number={4}
              title="Otras Fuentes de Ingreso"
              icon={DollarSign}
            >
              <p className="text-[13px] text-[#717171] mb-4">
                Selecciona las fuentes de ingreso adicionales que apliquen:
              </p>
              <div className="space-y-2">
                {INCOME_CATEGORIES.map(cat => {
                  const active = formData.other_income_sources.some(s => s.category === cat)
                  const source = formData.other_income_sources.find(s => s.category === cat)
                  return (
                    <div key={cat}>
                      <button
                        onClick={() => !isReadonly && toggleIncomeCategory(cat)}
                        disabled={isReadonly}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg border text-left transition-colors ${
                          active
                            ? 'border-[#004274] bg-[#004274]/5'
                            : 'border-gray-200 hover:border-gray-300'
                        } ${isReadonly ? 'cursor-default' : ''}`}
                      >
                        <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          active ? 'border-[#004274] bg-[#004274]' : 'border-gray-300'
                        }`}>
                          {active && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                        <span className="text-[14px] text-[#222]">{cat}</span>
                      </button>
                      {active && source && (
                        <div className="ml-8 mt-2 mb-1 max-w-xs">
                          <Label>Monto mensual</Label>
                          <InputMoney
                            value={source.monthly_amount}
                            onChange={v => updateIncomeAmount(cat, v)}
                            disabled={isReadonly}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>

              {formData.other_income_sources.length > 0 && (
                <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
                  <span className="text-[13px] font-medium text-[#004274]">Total ingresos adicionales:</span>
                  <span className="text-[15px] font-bold text-[#004274]">${totalOtherIncome.toLocaleString()}/mes</span>
                </div>
              )}

              <div className="mt-4 p-3 bg-gray-50 rounded-lg">
                <p className="text-[11px] text-[#717171] italic">
                  Aviso ECOA: No está obligado a revelar ingresos por pensión alimenticia, manutención de menores o ingresos de mantenimiento separado, a menos que desee que se consideren como base para pagar esta obligación.
                </p>
              </div>
            </SectionCard>

            {/* ═══════ SECTION 5: Properties ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[5] = el }}
              number={5}
              title="Propiedades"
              icon={Building2}
            >
              <div className="flex items-center justify-between mb-4">
                <Label className="mb-0">¿Es propietario de otras propiedades?</Label>
                <ToggleSwitch
                  checked={formData.owns_properties}
                  onChange={v => {
                    updateField('owns_properties', v)
                    if (v && formData.owned_properties.length === 0) addProperty()
                  }}
                  disabled={isReadonly}
                />
              </div>

              {formData.owns_properties && (
                <>
                  {formData.owned_properties.map((prop, i) => (
                    <div key={i} className={`${i > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}`}>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-[14px] font-semibold text-[#222]">Propiedad {i + 1}</p>
                        {!isReadonly && (
                          <button onClick={() => removeProperty(i)} className="text-red-400 hover:text-red-600 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                          <Label>Dirección</Label>
                          <Input value={prop.address} onChange={v => updateProperty(i, 'address', v)} disabled={isReadonly} />
                        </div>
                        <div>
                          <Label>Valor estimado</Label>
                          <InputMoney value={prop.estimated_value} onChange={v => updateProperty(i, 'estimated_value', v)} disabled={isReadonly} />
                        </div>
                        <div>
                          <Label>Balance de hipoteca</Label>
                          <InputMoney value={prop.mortgage_balance} onChange={v => updateProperty(i, 'mortgage_balance', v)} disabled={isReadonly} />
                        </div>
                        <div>
                          <Label>Pago mensual</Label>
                          <InputMoney value={prop.monthly_payment} onChange={v => updateProperty(i, 'monthly_payment', v)} disabled={isReadonly} />
                        </div>
                        <div>
                          <Label>Ingreso de renta</Label>
                          <InputMoney value={prop.rental_income} onChange={v => updateProperty(i, 'rental_income', v)} disabled={isReadonly} />
                        </div>
                      </div>
                    </div>
                  ))}
                  {formData.owned_properties.length < 3 && !isReadonly && (
                    <button
                      onClick={addProperty}
                      className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#004274] hover:text-[#00233d] transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar otra propiedad
                    </button>
                  )}
                </>
              )}
            </SectionCard>

            {/* ═══════ SECTION 6: Debts & Expenses ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[6] = el }}
              number={6}
              title="Deudas y Gastos Mensuales"
              icon={CreditCard}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <Label>Renta o hipoteca actual</Label>
                  <InputMoney value={formData.monthly_rent} onChange={v => updateField('monthly_rent', v)} disabled={isReadonly} />
                </div>
              </div>

              <div className="mt-6">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[14px] font-semibold text-[#222]">Deudas</p>
                  {!isReadonly && (
                    <button
                      onClick={addDebt}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-[#004274] hover:text-[#00233d] transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Agregar
                    </button>
                  )}
                </div>

                {formData.debts.length === 0 && (
                  <p className="text-[13px] text-[#aaa] py-3">Sin deudas registradas</p>
                )}

                {formData.debts.map((debt, i) => (
                  <div key={i} className={`${i > 0 ? 'mt-4 pt-4 border-t border-gray-100' : ''}`}>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-[13px] font-medium text-[#717171]">Deuda {i + 1}</p>
                      {!isReadonly && (
                        <button onClick={() => removeDebt(i)} className="text-red-400 hover:text-red-600 transition-colors">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <Label>Tipo</Label>
                        <Select value={debt.type} onChange={v => updateDebt(i, 'type', v)} options={DEBT_TYPES} disabled={isReadonly} />
                      </div>
                      <div>
                        <Label>Acreedor</Label>
                        <Input value={debt.creditor} onChange={v => updateDebt(i, 'creditor', v)} disabled={isReadonly} />
                      </div>
                      <div>
                        <Label>Balance</Label>
                        <InputMoney value={debt.balance} onChange={v => updateDebt(i, 'balance', v)} disabled={isReadonly} />
                      </div>
                      <div>
                        <Label>Pago mensual</Label>
                        <InputMoney value={debt.monthly_payment} onChange={v => updateDebt(i, 'monthly_payment', v)} disabled={isReadonly} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <p className="text-[14px] font-semibold text-[#222] mb-3">Otros gastos mensuales</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <Label>Child support pagado</Label>
                    <InputMoney value={formData.monthly_child_support_paid} onChange={v => updateField('monthly_child_support_paid', v)} disabled={isReadonly} />
                  </div>
                  <div>
                    <Label>Servicios (agua, luz, etc.)</Label>
                    <InputMoney value={formData.monthly_utilities} onChange={v => updateField('monthly_utilities', v)} disabled={isReadonly} />
                  </div>
                  <div>
                    <Label>Otros gastos</Label>
                    <InputMoney value={formData.monthly_other_expenses} onChange={v => updateField('monthly_other_expenses', v)} disabled={isReadonly} />
                  </div>
                </div>
              </div>

              <div className="mt-4 p-3 bg-red-50 rounded-lg flex items-center justify-between">
                <span className="text-[13px] font-medium text-red-700">Total obligaciones mensuales:</span>
                <span className="text-[15px] font-bold text-red-700">${totalMonthlyObligations.toLocaleString()}/mes</span>
              </div>
            </SectionCard>

            {/* ═══════ SECTION 7: References ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[7] = el }}
              number={7}
              title="Referencias Personales"
              icon={Users}
            >
              <p className="text-[13px] text-[#717171] mb-4">
                Proporciona 3 referencias personales. Al menos 1 referencia debe ser no-familiar.
              </p>
              {formData.references.map((ref, i) => (
                <div key={i} className={`${i > 0 ? 'mt-6 pt-6 border-t border-gray-100' : ''}`}>
                  <p className="text-[14px] font-semibold text-[#222] mb-3">Referencia {i + 1} *</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Nombre completo</Label>
                      <Input value={ref.name} onChange={v => updateReference(i, 'name', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Teléfono</Label>
                      <Input value={ref.phone} onChange={v => updateReference(i, 'phone', v)} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Relación</Label>
                      <Select value={ref.relationship} onChange={v => updateReference(i, 'relationship', v)} options={RELATIONSHIP_TYPES} disabled={isReadonly} />
                    </div>
                    <div>
                      <Label>Años de conocerse</Label>
                      <Input
                        type="number"
                        value={ref.years_known}
                        onChange={v => updateReference(i, 'years_known', v === '' ? '' : Number(v))}
                        disabled={isReadonly}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </SectionCard>

            {/* ═══════ SECTION 8: Legal History ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[8] = el }}
              number={8}
              title="Historial Legal"
              icon={Scale}
            >
              <div className="space-y-3">
                <LegalToggle
                  label="¿Ha sido declarado en bancarrota en los últimos 7 años?"
                  checked={formData.has_bankruptcy}
                  onChange={v => updateField('has_bankruptcy', v)}
                  disabled={isReadonly}
                />
                <LegalToggle
                  label="¿Ha tenido propiedad embargada o recuperada?"
                  checked={formData.has_foreclosure}
                  onChange={v => updateField('has_foreclosure', v)}
                  disabled={isReadonly}
                />
                <LegalToggle
                  label="¿Ha sido desalojado?"
                  checked={formData.has_eviction}
                  onChange={v => updateField('has_eviction', v)}
                  disabled={isReadonly}
                />
                <LegalToggle
                  label="¿Tiene juicios pendientes en su contra?"
                  checked={formData.has_judgments}
                  onChange={v => updateField('has_judgments', v)}
                  disabled={isReadonly}
                />
                <LegalToggle
                  label="¿Tiene deuda federal pendiente?"
                  checked={formData.has_federal_debt}
                  onChange={v => updateField('has_federal_debt', v)}
                  disabled={isReadonly}
                />
              </div>

              {anyLegalYes && (
                <div className="mt-4">
                  <Label>Por favor proporcione detalles:</Label>
                  <textarea
                    value={formData.legal_details}
                    onChange={e => updateField('legal_details', e.target.value)}
                    disabled={isReadonly}
                    rows={4}
                    className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[14px] text-[#222] placeholder-[#aaa] focus:outline-none focus:border-[#004274] focus:ring-1 focus:ring-[#004274]/20 transition-colors resize-none disabled:bg-gray-50 disabled:text-[#717171]"
                    placeholder="Describa las circunstancias..."
                  />
                </div>
              )}
            </SectionCard>

            {/* ═══════ SECTION 9: Emergency Contact ═══════ */}
            <SectionCard
              ref={(el) => { sectionRefs.current[9] = el }}
              number={9}
              title="Contacto de Emergencia"
              icon={Phone}
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Nombre completo *</Label>
                  <Input value={formData.emergency_name} onChange={v => updateField('emergency_name', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Teléfono *</Label>
                  <Input value={formData.emergency_phone} onChange={v => updateField('emergency_phone', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Relación</Label>
                  <Input value={formData.emergency_relationship} onChange={v => updateField('emergency_relationship', v)} disabled={isReadonly} />
                </div>
                <div>
                  <Label>Dirección</Label>
                  <Input value={formData.emergency_address} onChange={v => updateField('emergency_address', v)} disabled={isReadonly} />
                </div>
              </div>
            </SectionCard>

            {/* ═══════ Actions ═══════ */}
            {!isReadonly && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => saveDraft(false)}
                    disabled={saving}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl border border-gray-200 text-[14px] font-semibold text-[#222] hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Guardar borrador
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={submitting}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-bold text-[15px] transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: '#004274', boxShadow: '0 4px 14px rgba(0,66,116,0.2)' }}
                  >
                    {submitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Enviando...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Enviar solicitud
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-3 flex items-start gap-2 p-3 bg-amber-50 rounded-lg">
                  <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-[12px] text-amber-700">
                    Una vez enviada, no podrás modificar la solicitud. Asegúrate de que toda la información sea correcta antes de enviar.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}


/* ═══════════════════════════════════════════════
   Sub-components (self-contained in this file)
   ═══════════════════════════════════════════════ */

/* ─── Section Card ─── */
const SectionCard = forwardRef<
  HTMLDivElement,
  { number: number; title: string; icon: React.ElementType; children: React.ReactNode }
>(({ number, title, icon: Icon, children }, ref) => (
  <div ref={ref} className="bg-white rounded-xl border border-gray-200 overflow-hidden scroll-mt-28">
    <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
      <div className="w-7 h-7 rounded-full bg-[#004274]/10 flex items-center justify-center flex-shrink-0">
        <Icon className="w-3.5 h-3.5 text-[#004274]" />
      </div>
      <h2 className="text-[16px] font-bold text-[#222]" style={{ letterSpacing: '-0.015em' }}>
        {number}. {title}
      </h2>
    </div>
    <div className="px-6 py-5">{children}</div>
  </div>
))
SectionCard.displayName = 'SectionCard'

/* ─── Label ─── */
function Label({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <label className={`block text-[13px] font-medium text-[#717171] mb-1 ${className}`}>
      {children}
    </label>
  )
}

/* ─── Input ─── */
function Input({
  value,
  onChange,
  type = 'text',
  placeholder,
  maxLength,
  disabled,
}: {
  value: string | number | ''
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  maxLength?: number
  disabled?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      maxLength={maxLength}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[14px] text-[#222] placeholder-[#aaa] focus:outline-none focus:border-[#004274] focus:ring-1 focus:ring-[#004274]/20 transition-colors disabled:bg-gray-50 disabled:text-[#717171]"
    />
  )
}

/* ─── InputMoney ─── */
function InputMoney({
  value,
  onChange,
  disabled,
}: {
  value: number | ''
  onChange: (v: number | '') => void
  disabled?: boolean
}) {
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[14px] text-[#aaa]">$</span>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value === '' ? '' : Number(e.target.value))}
        disabled={disabled}
        min={0}
        className="w-full pl-7 pr-3 py-2.5 rounded-lg border border-gray-200 text-[14px] text-[#222] placeholder-[#aaa] focus:outline-none focus:border-[#004274] focus:ring-1 focus:ring-[#004274]/20 transition-colors disabled:bg-gray-50 disabled:text-[#717171]"
        placeholder="0"
      />
    </div>
  )
}

/* ─── Select ─── */
function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  options: string[]
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={disabled}
      className="w-full px-3 py-2.5 rounded-lg border border-gray-200 text-[14px] text-[#222] focus:outline-none focus:border-[#004274] focus:ring-1 focus:ring-[#004274]/20 transition-colors appearance-none bg-white bg-[url('data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%23717171%22%20d%3D%22M3%204.5L6%208l3-3.5H3z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_12px_center] disabled:bg-gray-50 disabled:text-[#717171]"
    >
      <option value="">Seleccionar...</option>
      {options.map(opt => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  )
}

/* ─── Toggle Switch ─── */
function ToggleSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
        checked ? 'bg-[#004274]' : 'bg-gray-300'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

/* ─── Legal Toggle ─── */
function LegalToggle({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}) {
  return (
    <div className={`flex items-center justify-between gap-4 px-4 py-3.5 rounded-lg border transition-colors ${
      checked ? 'border-red-200 bg-red-50' : 'border-gray-200'
    }`}>
      <span className="text-[14px] text-[#222]">{label}</span>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => !disabled && onChange(true)}
          disabled={disabled}
          className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
            checked ? 'bg-red-100 text-red-700' : 'text-[#aaa] hover:text-[#717171]'
          } ${disabled ? 'cursor-default' : ''}`}
        >
          Sí
        </button>
        <button
          onClick={() => !disabled && onChange(false)}
          disabled={disabled}
          className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
            !checked ? 'bg-green-100 text-green-700' : 'text-[#aaa] hover:text-[#717171]'
          } ${disabled ? 'cursor-default' : ''}`}
        >
          No
        </button>
      </div>
    </div>
  )
}
