'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Landmark, Plus, User, DollarSign, Briefcase, Phone, Mail,
  TrendingUp, ArrowRight, FileText, Search, AlertTriangle,
  Clock, Bell, ChevronDown, ChevronUp, Pause, XCircle, Trash2
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Investor {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  total_invested: number
  available_capital: number
  status: string
  notes: string | null
  created_at: string
}

interface PropertyLite {
  id: string
  property_code: string
  address: string
  city: string
  status: string
}

interface Allocation {
  property_id: string
  property_code: string   // manual code (e.g. "H13") when `manual` is true
  manual: boolean
  amount: string
}

interface InvestmentsSummary {
  total_captado: number
  total_invertido: number
  total_disponible: number
  total_retornado_capital: number
  total_retornado_interes: number
  total_pagado_a_hoy: number
  total_obligacion: number
  total_restante_por_pagar: number
  tasa_fondeo: number
  active_investments: number
  total_investments: number
  period: string
}

interface AlertNote {
  id: string
  loan_amount: number
  total_due: number
  maturity_date: string
  annual_rate: number
  term_months: number
  status: string
  days_until_maturity: number
  investors?: {
    id: string
    name: string
    email: string | null
    phone: string | null
  }
}

interface Alerts {
  overdue: AlertNote[]
  this_week: AlertNote[]
  this_month: AlertNote[]
  total_alerts: number
}

export default function InvestorsPage() {
  const router = useRouter()
  const toast = useToast()
  const [investors, setInvestors] = useState<Investor[]>([])
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null)
  const [alerts, setAlerts] = useState<Alerts | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  const [showAlerts, setShowAlerts] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [period, setPeriod] = useState<string>('all')
  const [deleteTarget, setDeleteTarget] = useState<Investor | null>(null)
  const [deleting, setDeleting] = useState(false)

  const handleDeleteInvestor = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/capital/investors/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.ok) { toast.success('Inversionista eliminado'); setDeleteTarget(null); loadData() }
      else toast.error(data.detail || 'Error al eliminar')
    } catch { toast.error('Error al eliminar') } finally { setDeleting(false) }
  }

  // Create form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [capital, setCapital] = useState('')
  const [creating, setCreating] = useState(false)

  // House allocations (assign capital to specific houses on creation)
  const [properties, setProperties] = useState<PropertyLite[]>([])
  const [allocations, setAllocations] = useState<Allocation[]>([])

  const openCreate = async () => {
    setShowCreate(true)
    if (properties.length === 0) {
      try {
        const res = await fetch('/api/properties?limit=100')
        const data = await res.json()
        const list: PropertyLite[] = Array.isArray(data) ? data : (data.properties || [])
        setProperties(list.filter(p => p.property_code))
      } catch (err) {
        console.error('Error loading properties:', err)
      }
    }
  }

  const addAllocation = () => setAllocations(prev => [...prev, { property_id: '', property_code: '', manual: false, amount: '' }])
  const removeAllocation = (idx: number) => setAllocations(prev => prev.filter((_, i) => i !== idx))
  const updateAllocation = (idx: number, patch: Partial<Allocation>) =>
    setAllocations(prev => prev.map((a, i) => (i === idx ? { ...a, ...patch } : a)))

  const allocatedTotal = allocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
  const capitalNum = parseFloat(capital) || 0

  useEffect(() => { loadData() }, [period])

  const loadData = async () => {
    try {
      const [investorsRes, summaryRes, alertsRes] = await Promise.all([
        fetch(`/api/capital/investors`),
        fetch(`/api/capital/investors/investments/summary${period !== 'all' ? `?period=${period}` : ''}`),
        fetch(`/api/capital/promissory-notes/alerts?days=30`),
      ])

      const investorsData = await investorsRes.json()
      const summaryData = await summaryRes.json()
      const alertsData = await alertsRes.json()

      if (investorsData.ok) setInvestors(investorsData.investors)
      if (summaryData.ok) setSummary(summaryData.summary)
      if (alertsData.ok) setAlerts(alertsData)
    } catch (err) {
      console.error('Error loading investors:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!name) { toast.warning('Ingresa el nombre del inversionista'); return }

    // Validate house allocations (a house is either picked from the list or typed manually)
    const houseRef = (a: Allocation) => a.manual ? a.property_code.trim() : a.property_id
    const validAllocations = allocations.filter(a => houseRef(a) && parseFloat(a.amount) > 0)
    const partial = allocations.some(a => (houseRef(a) && !(parseFloat(a.amount) > 0)) || (!houseRef(a) && parseFloat(a.amount) > 0))
    if (partial) { toast.warning('Completa la casa y el monto en cada asignación'); return }
    if (allocatedTotal > capitalNum) {
      toast.warning('Lo asignado a casas supera el capital disponible')
      return
    }

    setCreating(true)
    try {
      const res = await fetch(`/api/capital/investors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: email || undefined,
          phone: phone || undefined,
          company: company || undefined,
          available_capital: capital ? parseFloat(capital) : 0,
        })
      })
      const data = await res.json()
      if (!data.ok) {
        toast.error('Error al crear inversionista')
        return
      }

      // Create one investment per house allocation (reuses the existing flow:
      // decrements available capital, posts the deposit to the ledger)
      const investorId = data.investor.id
      let failed = 0
      for (const a of validAllocations) {
        try {
          const invRes = await fetch(`/api/capital/investors/investments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              investor_id: investorId,
              ...(a.manual ? { property_code: a.property_code.trim() } : { property_id: a.property_id }),
              amount: parseFloat(a.amount),
            }),
          })
          const invData = await invRes.json()
          if (!invData.ok) failed++
        } catch {
          failed++
        }
      }

      if (failed > 0) {
        toast.warning(`Inversionista creado, pero ${failed} asignación(es) a casas fallaron`)
      } else if (validAllocations.length > 0) {
        toast.success(`Inversionista registrado con ${validAllocations.length} inversión(es)`)
      } else {
        toast.success('Inversionista registrado')
      }

      setShowCreate(false)
      setName(''); setEmail(''); setPhone(''); setCompany(''); setCapital('')
      setAllocations([])
      loadData()
    } catch (err) {
      toast.error('Error al crear inversionista')
    } finally {
      setCreating(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  const filteredInvestors = investors.filter(inv => {
    if (!searchTerm) return true
    const q = searchTerm.toLowerCase()
    return inv.name.toLowerCase().includes(q)
      || inv.company?.toLowerCase().includes(q)
      || inv.email?.toLowerCase().includes(q)
  })

  const totalAlerts = alerts ? alerts.overdue.length + alerts.this_week.length + alerts.this_month.length : 0

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Seguimiento de Inversionistas</h1>
          <p style={{ color: 'var(--slate)' }}>Perfiles, inversiones y notas promisorias</p>
        </div>
        <button onClick={openCreate} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" />
          Nuevo Inversionista
        </button>
      </div>

      {/* Maturity Alerts */}
      {totalAlerts > 0 && (
        <div className="card-luxury overflow-hidden" style={{ borderLeft: '4px solid var(--warning)' }}>
          <button
            onClick={() => setShowAlerts(!showAlerts)}
            className="w-full p-4 flex items-center justify-between hover:bg-cream/30 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--warning-light)' }}>
                <Bell className="w-5 h-5" style={{ color: 'var(--warning)' }} />
              </div>
              <div className="text-left">
                <h3 className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>
                  {totalAlerts} alerta{totalAlerts !== 1 ? 's' : ''} de vencimiento
                </h3>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>
                  {alerts!.overdue.length > 0 && <span className="text-error font-semibold">{alerts!.overdue.length} vencida{alerts!.overdue.length !== 1 ? 's' : ''}</span>}
                  {alerts!.overdue.length > 0 && (alerts!.this_week.length > 0 || alerts!.this_month.length > 0) && ' · '}
                  {alerts!.this_week.length > 0 && <span style={{ color: 'var(--warning)' }}>{alerts!.this_week.length} esta semana</span>}
                  {alerts!.this_week.length > 0 && alerts!.this_month.length > 0 && ' · '}
                  {alerts!.this_month.length > 0 && <span>{alerts!.this_month.length} este mes</span>}
                </p>
              </div>
            </div>
            {showAlerts ? <ChevronUp className="w-4 h-4" style={{ color: 'var(--slate)' }} /> : <ChevronDown className="w-4 h-4" style={{ color: 'var(--slate)' }} />}
          </button>

          {showAlerts && (
            <div className="border-t divide-y" style={{ borderColor: 'var(--sand)' }}>
              {/* Overdue */}
              {alerts!.overdue.map(note => (
                <Link key={note.id} href={`/capital/promissory-notes/${note.id}`}
                  className="flex items-center justify-between p-3 px-5 hover:bg-cream/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--error)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--error)' }}>
                        {note.investors?.name} — {fmt(note.total_due)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        Vencida hace {Math.abs(note.days_until_maturity)} días · {note.annual_rate}% · {note.term_months}m
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                </Link>
              ))}
              {/* This week */}
              {alerts!.this_week.map(note => (
                <Link key={note.id} href={`/capital/promissory-notes/${note.id}`}
                  className="flex items-center justify-between p-3 px-5 hover:bg-cream/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--warning)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--warning)' }}>
                        {note.investors?.name} — {fmt(note.total_due)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        Vence en {note.days_until_maturity} día{note.days_until_maturity !== 1 ? 's' : ''} · {note.annual_rate}% · {note.term_months}m
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                </Link>
              ))}
              {/* This month */}
              {alerts!.this_month.map(note => (
                <Link key={note.id} href={`/capital/promissory-notes/${note.id}`}
                  className="flex items-center justify-between p-3 px-5 hover:bg-cream/30 transition-colors">
                  <div className="flex items-center gap-3">
                    <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--slate)' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                        {note.investors?.name} — {fmt(note.total_due)}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        Vence en {note.days_until_maturity} días · {note.annual_rate}% · {note.term_months}m
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary KPIs */}
      {summary && (
        <div className="space-y-3">
          {/* Period filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Periodo:</span>
            {[
              { key: 'all', label: 'Todo' },
              { key: 'month', label: 'Este Mes' },
              { key: 'quarter', label: 'Trimestre' },
              { key: 'year', label: 'Este Ano' },
            ].map(p => (
              <button
                key={p.key}
                onClick={() => setPeriod(p.key)}
                className="px-3 py-1 text-xs font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: period === p.key ? 'var(--gold-100)' : 'transparent',
                  color: period === p.key ? 'var(--gold-700)' : 'var(--slate)',
                  border: `1px solid ${period === p.key ? 'var(--gold-400)' : 'var(--stone)'}`,
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Briefcase className="w-4 h-4" style={{ color: 'var(--navy-700)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Total Invertido</span>
              </div>
              <div className="stat-value text-xl">{fmt(summary.total_invertido)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4" style={{ color: 'var(--info)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Total Disponible</span>
              </div>
              <div className="stat-value text-xl">{fmt(summary.total_disponible)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Pagado a hoy</span>
              </div>
              <div className="stat-value text-xl" style={{ color: 'var(--success)' }}>{fmt(summary.total_pagado_a_hoy)}</div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>Calculado al día de hoy</p>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-4 h-4" style={{ color: 'var(--warning)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Queda por pagar</span>
              </div>
              <div className="stat-value text-xl" style={{ color: 'var(--warning)' }}>{fmt(summary.total_restante_por_pagar)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--success)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Capital devuelto (a hoy)</span>
              </div>
              <div className="stat-value text-xl" style={{ color: 'var(--success)' }}>{fmt(summary.total_retornado_capital)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Interés pagado (a hoy)</span>
              </div>
              <div className="stat-value text-xl" style={{ color: 'var(--gold-700)' }}>{fmt(summary.total_retornado_interes)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Obligación total</span>
              </div>
              <div className="stat-value text-xl">{fmt(summary.total_obligacion)}</div>
            </div>
            <div className="stat-card">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-4 h-4" style={{ color: 'var(--charcoal)' }} />
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Tasa Fondeo</span>
              </div>
              <div className="stat-value text-xl">{summary.tasa_fondeo}%</div>
            </div>
          </div>
        </div>
      )}

      {/* Search */}
      {investors.length > 3 && (
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="input pl-10 w-full"
            placeholder="Buscar inversionista..."
          />
        </div>
      )}

      {/* Investors List */}
      {filteredInvestors.length === 0 && !searchTerm ? (
        <div className="card-luxury p-12 text-center">
          <Landmark className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            No hay inversionistas registrados
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            Registra inversionistas para gestionar el fondeo de propiedades
          </p>
        </div>
      ) : filteredInvestors.length === 0 ? (
        <div className="card-luxury p-8 text-center">
          <Search className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
          <p style={{ color: 'var(--slate)' }}>No se encontraron resultados para "{searchTerm}"</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredInvestors.map((inv) => (
            <div key={inv.id} className="card-luxury p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                     style={{ backgroundColor: 'var(--gold-100)' }}>
                  <User className="w-6 h-6" style={{ color: 'var(--gold-700)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>{inv.name}</h3>
                    <span className="badge text-xs" style={{
                      backgroundColor: inv.status === 'active' ? 'var(--success-light)' : inv.status === 'paused' ? 'var(--warning-light)' : 'var(--cream)',
                      color: inv.status === 'active' ? 'var(--success)' : inv.status === 'paused' ? 'var(--warning)' : 'var(--slate)',
                    }}>
                      {inv.status === 'active' ? 'Activo' : inv.status === 'paused' ? 'Pausado' : 'Inactivo'}
                    </span>
                  </div>
                  {inv.company && (
                    <p className="text-sm flex items-center gap-1" style={{ color: 'var(--slate)' }}>
                      <Briefcase className="w-3 h-3" /> {inv.company}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2 text-sm" style={{ color: 'var(--ash)' }}>
                    {inv.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {inv.email}
                      </span>
                    )}
                    {inv.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {inv.phone}
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-3 gap-2 mt-4">
                    <div className="card-flat py-2 px-3 text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total Captado</p>
                      <p className="font-serif font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>
                        {fmt(inv.total_invested)}
                      </p>
                    </div>
                    <div className="card-flat py-2 px-3 text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Tasa Interes</p>
                      <p className="font-serif font-semibold text-sm" style={{ color: 'var(--gold-700)' }}>
                        {(inv as any).tasa_fondeo || 0}%
                      </p>
                    </div>
                    <div className="card-flat py-2 px-3 text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Plazo</p>
                      <p className="font-serif font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>
                        {(inv as any).avg_term || 0}m
                      </p>
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => router.push(`/capital/investors/${inv.id}`)}
                      className="btn-ghost btn-sm flex-1 justify-center"
                    >
                      Ver Detalle <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeleteTarget(inv)}
                      className="btn-ghost btn-sm px-2"
                      title="Eliminar inversionista"
                      aria-label="Eliminar inversionista"
                    >
                      <Trash2 className="w-4 h-4" style={{ color: 'var(--error)' }} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              Nuevo Inversionista
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="label">Empresa</label>
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="Empresa o grupo" />
              </div>
              <div>
                <label className="label">Capital Disponible</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                  <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} className="input pl-8" placeholder="0" />
                </div>
              </div>

              {/* House allocations */}
              <div className="pt-2" style={{ borderTop: '1px solid var(--sand)' }}>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">
                    Asignar a casa(s) <span className="text-xs font-normal" style={{ color: 'var(--ash)' }}>(opcional)</span>
                  </label>
                  <button type="button" onClick={addAllocation} className="btn-ghost btn-sm">
                    <Plus className="w-3.5 h-3.5" /> Añadir casa
                  </button>
                </div>

                {allocations.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    Indica en qué casa(s) va el dinero y cuánto del capital disponible.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {allocations.map((a, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <div className="flex-1">
                          {a.manual ? (
                            <input
                              type="text"
                              value={a.property_code}
                              onChange={(e) => updateAllocation(idx, { property_code: e.target.value })}
                              className="input w-full text-sm"
                              placeholder="Código de casa (ej. H13)"
                            />
                          ) : (
                            <select
                              value={a.property_id}
                              onChange={(e) => updateAllocation(idx, { property_id: e.target.value })}
                              className="input w-full text-sm"
                            >
                              <option value="">Selecciona casa…</option>
                              {properties.map(p => (
                                <option key={p.id} value={p.id}>
                                  {p.property_code} — {p.address}{p.city ? `, ${p.city}` : ''}
                                </option>
                              ))}
                            </select>
                          )}
                          <button
                            type="button"
                            onClick={() => updateAllocation(idx, { manual: !a.manual, property_id: '', property_code: '' })}
                            className="text-[11px] mt-0.5 hover:underline"
                            style={{ color: 'var(--gold-700)' }}
                          >
                            {a.manual ? '← Elegir de la lista' : 'Escribir código manual (casa antigua)'}
                          </button>
                        </div>
                        <div className="relative w-32">
                          <span className="absolute left-2.5 top-2.5 text-slate text-sm">$</span>
                          <input
                            type="number"
                            value={a.amount}
                            onChange={(e) => updateAllocation(idx, { amount: e.target.value })}
                            className="input pl-6 text-sm"
                            placeholder="0"
                          />
                        </div>
                        <button type="button" onClick={() => removeAllocation(idx)} className="p-1 mt-1.5" title="Quitar">
                          <XCircle className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                        </button>
                      </div>
                    ))}

                    <div className="flex items-center justify-between text-xs pt-1" style={{ color: allocatedTotal > capitalNum ? 'var(--error)' : 'var(--ash)' }}>
                      <span>Asignado: {fmt(allocatedTotal)} de {fmt(capitalNum)}</span>
                      <span>{allocatedTotal > capitalNum ? 'Supera el capital disponible' : `Restante: ${fmt(Math.max(0, capitalNum - allocatedTotal))}`}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1">
                {creating ? 'Creando...' : 'Registrar'}
              </button>
              <button onClick={() => { setShowCreate(false); setAllocations([]) }} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--error-light)' }}>
                <Trash2 className="w-5 h-5" style={{ color: 'var(--error)' }} />
              </div>
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Eliminar inversionista</h3>
            </div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>
              ¿Eliminar a <b>{deleteTarget.name}</b>? Se borrarán también sus inversiones y notas promisorias.
              Esta acción no se puede deshacer.
            </p>
            <div className="flex gap-3 mt-6">
              <button onClick={handleDeleteInvestor} disabled={deleting} className="btn flex-1 text-white" style={{ backgroundColor: 'var(--error)' }}>
                {deleting ? 'Eliminando...' : 'Sí, eliminar'}
              </button>
              <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
