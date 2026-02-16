'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Landmark, User, Mail, Phone, Briefcase,
  DollarSign, TrendingUp, Calendar, MapPin, FileText,
  PieChart, BarChart3, Edit2, Save, X, Clock, AlertTriangle,
  ArrowRight, CheckCircle2, Plus, Activity, ArrowUpRight,
  ArrowDownLeft, Pause, Play, Ban, RefreshCw
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

interface Investment {
  id: string
  amount: number
  expected_return_rate: number | null
  return_amount: number | null
  status: string
  notes: string | null
  invested_at: string
  returned_at: string | null
  promissory_note_id?: string | null
  properties?: { address: string; city: string } | null
  rto_contracts?: { client_id: string; clients?: { name: string } } | null
  promissory_notes?: { id: string; loan_amount: number; status: string; maturity_date: string } | null
}

interface PromissoryNote {
  id: string
  loan_amount: number
  annual_rate: number
  term_months: number
  total_interest: number
  total_due: number
  lender_name: string
  start_date: string
  maturity_date: string
  status: string
  paid_amount: number | null
  created_at: string
}

interface Metrics {
  total_invested: number
  total_returned: number
  net_outstanding: number
  active_investments: number
  expected_returns: number
  roi_pct: number
  notes_total_lent: number
  notes_total_due: number
  notes_total_paid: number
  notes_outstanding: number
  active_notes: number
}

interface CycleData {
  total_invested: number
  total_returned: number
  net_outstanding: number
  active_investments: number
  expected_future_returns: number
  roi_to_date: number
}

interface FlowRecord {
  id: string
  flow_type: string
  amount: number
  description: string | null
  flow_date: string
  created_at: string
  properties?: { address: string } | null
}

const NOTE_STATUS: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Borrador' },
  active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
  paid: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Pagada' },
  overdue: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Vencida' },
  defaulted: { bg: '#fca5a5', color: '#7f1d1d', label: 'Impago' },
  cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
}

const FLOW_LABELS: Record<string, { label: string; color: string }> = {
  investment_in: { label: 'Inversión entrante', color: 'var(--success)' },
  acquisition_out: { label: 'Adquisición', color: 'var(--error)' },
  rent_income: { label: 'Ingreso renta', color: 'var(--success)' },
  return_out: { label: 'Retorno a inversor', color: 'var(--error)' },
  late_fee_income: { label: 'Mora', color: 'var(--warning)' },
  operating_expense: { label: 'Gasto operativo', color: 'var(--error)' },
}

export default function InvestorDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [investor, setInvestor] = useState<Investor | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [promissoryNotes, setPromissoryNotes] = useState<PromissoryNote[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ notes: '', available_capital: 0, name: '', email: '', phone: '', company: '' })
  const [activeTab, setActiveTab] = useState<'overview' | 'investments' | 'notes' | 'cycle'>('overview')
  const [savingStatus, setSavingStatus] = useState(false)

  // Capital cycle
  const [cycleData, setCycleData] = useState<CycleData | null>(null)
  const [cycleFlows, setCycleFlows] = useState<FlowRecord[]>([])
  const [cycleInvestments, setCycleInvestments] = useState<Investment[]>([])
  const [cycleLoading, setCycleLoading] = useState(false)

  useEffect(() => { loadInvestor() }, [id])

  const loadInvestor = async () => {
    try {
      const res = await fetch(`/api/capital/investors/${id}`)
      const investorData = await res.json()

      if (investorData.ok) {
        setInvestor(investorData.investor)
        setInvestments(investorData.investments || [])
        setPromissoryNotes(investorData.promissory_notes || [])
        setMetrics(investorData.metrics || null)
        setEditData({
          notes: investorData.investor.notes || '',
          available_capital: investorData.investor.available_capital || 0,
          name: investorData.investor.name || '',
          email: investorData.investor.email || '',
          phone: investorData.investor.phone || '',
          company: investorData.investor.company || '',
        })
      }
    } catch (err) {
      console.error('Error loading investor:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCycle = async () => {
    if (cycleData) return // already loaded
    setCycleLoading(true)
    try {
      const res = await fetch(`/api/capital/flows/investor-cycle/${id}`)
      const data = await res.json()
      if (data.ok) {
        setCycleData(data.cycle)
        setCycleFlows(data.flows || [])
        setCycleInvestments(data.investments || [])
      }
    } catch (err) {
      console.error('Error loading capital cycle:', err)
    } finally {
      setCycleLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/capital/investors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Inversionista actualizado')
        setEditing(false)
        loadInvestor()
      } else {
        toast.error(data.detail || 'Error al actualizar')
      }
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const handleStatusChange = async (newStatus: string) => {
    setSavingStatus(true)
    try {
      const res = await fetch(`/api/capital/investors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Estado cambiado a ${newStatus === 'active' ? 'Activo' : newStatus === 'paused' ? 'Pausado' : 'Inactivo'}`)
        loadInvestor()
      } else {
        toast.error(data.detail || 'Error al cambiar estado')
      }
    } catch {
      toast.error('Error al cambiar estado')
    } finally {
      setSavingStatus(false)
    }
  }

  const handleTabChange = (tab: typeof activeTab) => {
    setActiveTab(tab)
    if (tab === 'cycle') loadCycle()
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!investor) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Inversionista no encontrado</div>
  }

  const daysUntilMaturity = (d: string) => Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  // Rendimiento real vs esperado (#7)
  const totalInvested = metrics?.total_invested || 0
  const totalReturned = metrics?.total_returned || 0
  const expectedReturns = metrics?.expected_returns || 0
  const realRoi = totalInvested > 0 ? ((totalReturned / totalInvested) * 100 - 100) : 0
  const expectedRoiAvg = investments.length > 0
    ? investments.reduce((s, i) => s + Number(i.expected_return_rate || 0), 0) / investments.length
    : 0

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Back */}
      <button onClick={() => router.push('/capital/investors')} className="btn-ghost btn-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a Seguimiento
      </button>

      {/* Header Card */}
      <div className="card-luxury p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-100)' }}>
              <Landmark className="w-8 h-8" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div>
              <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
                {investor.name}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm" style={{ color: 'var(--slate)' }}>
                {investor.company && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" /> {investor.company}
                  </span>
                )}
                {investor.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> {investor.email}
                  </span>
                )}
                {investor.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" /> {investor.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Status Badge + Controls (#6) */}
            <div className="flex items-center gap-1">
              <span className="badge" style={{
                backgroundColor: investor.status === 'active' ? 'var(--success-light)' : investor.status === 'paused' ? 'var(--warning-light)' : 'var(--cream)',
                color: investor.status === 'active' ? 'var(--success)' : investor.status === 'paused' ? 'var(--warning)' : 'var(--slate)',
              }}>
                {investor.status === 'active' ? 'Activo' : investor.status === 'paused' ? 'Pausado' : 'Inactivo'}
              </span>
              {/* Status change buttons */}
              {investor.status !== 'active' && (
                <button
                  onClick={() => handleStatusChange('active')}
                  disabled={savingStatus}
                  className="btn-ghost btn-sm"
                  title="Activar"
                >
                  <Play className="w-3.5 h-3.5" style={{ color: 'var(--success)' }} />
                </button>
              )}
              {investor.status !== 'paused' && (
                <button
                  onClick={() => handleStatusChange('paused')}
                  disabled={savingStatus}
                  className="btn-ghost btn-sm"
                  title="Pausar"
                >
                  <Pause className="w-3.5 h-3.5" style={{ color: 'var(--warning)' }} />
                </button>
              )}
              {investor.status !== 'inactive' && (
                <button
                  onClick={() => handleStatusChange('inactive')}
                  disabled={savingStatus}
                  className="btn-ghost btn-sm"
                  title="Desactivar"
                >
                  <Ban className="w-3.5 h-3.5" style={{ color: 'var(--slate)' }} />
                </button>
              )}
            </div>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-ghost btn-sm">
                <Edit2 className="w-4 h-4" /> Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn btn-sm text-white" style={{ backgroundColor: 'var(--success)' }}>
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[
          { label: 'Total Invertido', value: fmt(totalInvested), icon: DollarSign, color: 'var(--navy-800)' },
          { label: 'Capital Disponible', value: fmt(investor.available_capital), icon: Landmark, color: 'var(--gold-600)' },
          { label: 'Retornos', value: fmt(totalReturned), icon: TrendingUp, color: 'var(--success)' },
          { label: 'Inversiones Activas', value: String(metrics?.active_investments || 0), icon: PieChart, color: 'var(--info)' },
          { label: 'Notas Activas', value: String(metrics?.active_notes || 0), icon: FileText, color: 'var(--gold-700)' },
        ].map((kpi) => (
          <div key={kpi.label} className="card-luxury p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              <span className="text-xs" style={{ color: 'var(--slate)' }}>{kpi.label}</span>
            </div>
            <p className="font-serif text-xl font-semibold" style={{ color: 'var(--ink)' }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--sand)' }}>
        {[
          { key: 'overview' as const, label: 'Resumen', icon: BarChart3 },
          { key: 'investments' as const, label: `Inversiones (${investments.length})`, icon: DollarSign },
          { key: 'notes' as const, label: `Promissory Notes (${promissoryNotes.length})`, icon: FileText },
          { key: 'cycle' as const, label: 'Ciclo de Capital', icon: Activity },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => handleTabChange(tab.key)}
            className="px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors whitespace-nowrap"
            style={{
              borderColor: activeTab === tab.key ? 'var(--gold-600)' : 'transparent',
              color: activeTab === tab.key ? 'var(--gold-700)' : 'var(--slate)',
            }}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Edit form */}
          {editing && (
            <div className="card-luxury p-6">
              <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Editar Inversionista</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Nombre</label>
                  <input type="text" value={editData.name} onChange={e => setEditData({...editData, name: e.target.value})} className="input w-full" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input type="email" value={editData.email} onChange={e => setEditData({...editData, email: e.target.value})} className="input w-full" />
                </div>
                <div>
                  <label className="label">Teléfono</label>
                  <input type="tel" value={editData.phone} onChange={e => setEditData({...editData, phone: e.target.value})} className="input w-full" />
                </div>
                <div>
                  <label className="label">Empresa</label>
                  <input type="text" value={editData.company} onChange={e => setEditData({...editData, company: e.target.value})} className="input w-full" />
                </div>
                <div>
                  <label className="label">Capital Disponible</label>
                  <input type="number" value={editData.available_capital} onChange={e => setEditData({...editData, available_capital: Number(e.target.value)})} className="input w-full" />
                </div>
                <div className="col-span-2">
                  <label className="label">Notas</label>
                  <textarea value={editData.notes} onChange={e => setEditData({...editData, notes: e.target.value})} className="input w-full" rows={3} placeholder="Notas sobre el inversionista..." />
                </div>
              </div>
            </div>
          )}

          {/* Notes (non-edit) */}
          {!editing && investor.notes && (
            <div className="card-luxury p-6">
              <h3 className="font-serif text-lg mb-3" style={{ color: 'var(--ink)' }}>
                <FileText className="w-4 h-4 inline mr-2" />
                Notas
              </h3>
              <p style={{ color: 'var(--charcoal)' }}>{investor.notes}</p>
            </div>
          )}

          {/* Rendimiento Real vs Esperado (#7) */}
          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Rendimiento Real vs Esperado
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>ROI Real</span>
                <p className="font-serif text-xl font-semibold" style={{
                  color: realRoi >= 0 ? 'var(--success)' : 'var(--error)'
                }}>
                  {realRoi > 0 ? '+' : ''}{realRoi.toFixed(1)}%
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  Retornado: {fmt(totalReturned)}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Tasa Esperada Prom.</span>
                <p className="font-serif text-xl font-semibold" style={{ color: 'var(--gold-700)' }}>
                  {expectedRoiAvg.toFixed(1)}%
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  Esperado: {fmt(expectedReturns)}
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Capital Pendiente</span>
                <p className="font-serif text-xl font-semibold" style={{ color: 'var(--navy-800)' }}>
                  {fmt(metrics?.net_outstanding || 0)}
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  En inversiones activas
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Notas por Cobrar</span>
                <p className="font-serif text-xl font-semibold" style={{
                  color: (metrics?.notes_outstanding || 0) > 0 ? 'var(--warning)' : 'var(--success)'
                }}>
                  {fmt(metrics?.notes_outstanding || 0)}
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  Pagado: {fmt(metrics?.notes_total_paid || 0)} / {fmt(metrics?.notes_total_due || 0)}
                </p>
              </div>
            </div>

            {/* ROI visual bar */}
            {totalInvested > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ash)' }}>
                      <span>Retorno real: {fmt(totalReturned)}</span>
                      <span>de {fmt(totalInvested)} invertido</span>
                    </div>
                    <div className="w-full h-3 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min(100, totalInvested > 0 ? (totalReturned / totalInvested) * 100 : 0)}%`,
                        backgroundColor: totalReturned >= totalInvested ? 'var(--success)' : 'var(--gold-600)',
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Promissory Notes Quick View */}
          {promissoryNotes.length > 0 && (
            <div className="card-luxury">
              <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                  <FileText className="w-4 h-4 inline mr-2" />
                  Promissory Notes Recientes
                </h3>
                <button onClick={() => handleTabChange('notes')} className="btn-ghost btn-sm">
                  Ver Todas <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                {promissoryNotes.slice(0, 3).map(note => {
                  const ns = NOTE_STATUS[note.status] || NOTE_STATUS.active
                  const days = daysUntilMaturity(note.maturity_date)
                  return (
                    <Link key={note.id} href={`/capital/promissory-notes/${note.id}`}
                      className="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center"
                             style={{ backgroundColor: 'var(--gold-100)' }}>
                          <FileText className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
                        </div>
                        <div>
                          <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{fmt(note.loan_amount)}</p>
                          <p className="text-xs" style={{ color: 'var(--ash)' }}>
                            {note.annual_rate}% · {note.term_months}m ·
                            Vence: {new Date(note.maturity_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {note.status === 'active' && days <= 30 && days > 0 && (
                          <span className="text-xs" style={{ color: 'var(--warning)' }}>
                            <Clock className="w-3 h-3 inline mr-1" />{days}d
                          </span>
                        )}
                        <span className="badge text-xs" style={{ backgroundColor: ns.bg, color: ns.color }}>
                          {ns.label}
                        </span>
                        <span className="font-semibold text-sm" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {/* Recent Investments Quick View */}
          {investments.length > 0 && (
            <div className="card-luxury">
              <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                  <DollarSign className="w-4 h-4 inline mr-2" />
                  Inversiones Recientes
                </h3>
                <button onClick={() => handleTabChange('investments')} className="btn-ghost btn-sm">
                  Ver Todas <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                {investments.slice(0, 3).map(inv => {
                  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                    active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
                    returned: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Retornada' },
                    partial_return: { bg: 'var(--info-light, var(--cream))', color: 'var(--info)', label: 'Parcial' },
                    defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Perdida' },
                  }
                  const s = statusStyles[inv.status] || statusStyles.active
                  return (
                    <div key={inv.id} className="flex items-center justify-between p-4">
                      <div>
                        <p className="font-semibold text-sm" style={{ color: 'var(--ink)' }}>{fmt(inv.amount)}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          {inv.properties?.address || inv.rto_contracts?.clients?.name || '—'} ·{' '}
                          {new Date(inv.invested_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          {inv.promissory_notes && (
                            <span style={{ color: 'var(--gold-700)' }}> · Nota: {fmt(inv.promissory_notes.loan_amount)}</span>
                          )}
                        </p>
                      </div>
                      <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Investments */}
      {activeTab === 'investments' && (
        <div className="card-luxury">
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
            <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
              <BarChart3 className="w-4 h-4 inline mr-2" />
              Historial de Inversiones ({investments.length})
            </h3>
          </div>

          {investments.length === 0 ? (
            <div className="p-8 text-center" style={{ color: 'var(--ash)' }}>
              <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No hay inversiones registradas</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Propiedad / Contrato</th>
                    <th>Monto</th>
                    <th>Tasa Esperada</th>
                    <th>Retorno</th>
                    <th>Nota Vinculada</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {investments.map((inv) => {
                    const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                      active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
                      returned: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Retornada' },
                      partial_return: { bg: 'var(--cream)', color: 'var(--info)', label: 'Parcial' },
                      defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Perdida' },
                    }
                    const s = statusStyles[inv.status] || statusStyles.active

                    return (
                      <tr key={inv.id}>
                        <td className="text-sm">
                          {new Date(inv.invested_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', year: 'numeric'
                          })}
                        </td>
                        <td>
                          {inv.properties ? (
                            <div>
                              <span className="flex items-center gap-1 text-sm">
                                <MapPin className="w-3 h-3" style={{ color: 'var(--gold-600)' }} />
                                {inv.properties.address}
                              </span>
                              <span className="text-xs" style={{ color: 'var(--slate)' }}>{inv.properties.city}</span>
                            </div>
                          ) : inv.rto_contracts?.clients?.name ? (
                            <span className="flex items-center gap-1 text-sm">
                              <User className="w-3 h-3" />
                              {inv.rto_contracts.clients.name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ash)' }}>—</span>
                          )}
                        </td>
                        <td className="font-medium">{fmt(inv.amount)}</td>
                        <td>
                          {inv.expected_return_rate ? (
                            <span style={{ color: 'var(--gold-700)' }}>{inv.expected_return_rate}%</span>
                          ) : (
                            <span style={{ color: 'var(--ash)' }}>—</span>
                          )}
                        </td>
                        <td>
                          {inv.return_amount ? (
                            <span style={{ color: 'var(--success)' }}>{fmt(inv.return_amount)}</span>
                          ) : (
                            <span style={{ color: 'var(--ash)' }}>Pendiente</span>
                          )}
                        </td>
                        <td>
                          {inv.promissory_notes ? (
                            <Link href={`/capital/promissory-notes/${inv.promissory_notes.id}`}
                              className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--gold-700)' }}>
                              <FileText className="w-3 h-3" />
                              {fmt(inv.promissory_notes.loan_amount)}
                            </Link>
                          ) : (
                            <span style={{ color: 'var(--ash)' }}>—</span>
                          )}
                        </td>
                        <td>
                          <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>
                            {s.label}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB: Promissory Notes */}
      {activeTab === 'notes' && (
        <div className="space-y-4">
          {promissoryNotes.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="card-flat p-4 text-center">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Total Emitido</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(metrics?.notes_total_lent || 0)}</p>
              </div>
              <div className="card-flat p-4 text-center">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Total Adeudado</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(metrics?.notes_total_due || 0)}</p>
              </div>
              <div className="card-flat p-4 text-center">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Pagado</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--success)' }}>{fmt(metrics?.notes_total_paid || 0)}</p>
              </div>
              <div className="card-flat p-4 text-center">
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Notas Activas</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--info)' }}>{metrics?.active_notes || 0}</p>
              </div>
            </div>
          )}

          <div className="card-luxury">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                <FileText className="w-4 h-4 inline mr-2" />
                Promissory Notes ({promissoryNotes.length})
              </h3>
              <Link href="/capital/promissory-notes" className="btn-ghost btn-sm">
                <Plus className="w-4 h-4" /> Nueva Nota
              </Link>
            </div>

            {promissoryNotes.length === 0 ? (
              <div className="p-8 text-center" style={{ color: 'var(--ash)' }}>
                <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No hay notas promisorias para este inversionista</p>
                <Link href="/capital/promissory-notes" className="btn-ghost btn-sm mt-3 inline-flex">
                  Crear Nota
                </Link>
              </div>
            ) : (
              <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                {promissoryNotes.map(note => {
                  const ns = NOTE_STATUS[note.status] || NOTE_STATUS.active
                  const days = daysUntilMaturity(note.maturity_date)
                  const paid = Number(note.paid_amount || 0)
                  const pctPaid = note.total_due > 0 ? (paid / note.total_due * 100) : 0
                  return (
                    <Link
                      key={note.id}
                      href={`/capital/promissory-notes/${note.id}`}
                      className="flex items-center justify-between p-4 hover:bg-cream/50 transition-colors"
                    >
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-serif font-semibold" style={{ color: 'var(--ink)' }}>{fmt(note.loan_amount)}</p>
                          <span className="badge text-xs" style={{ backgroundColor: ns.bg, color: ns.color }}>
                            {ns.label}
                          </span>
                          {note.status === 'active' && days <= 30 && days > 0 && (
                            <span className="badge text-xs" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
                              <Clock className="w-3 h-3 mr-1" /> {days}d
                            </span>
                          )}
                          {note.status === 'active' && days < 0 && (
                            <span className="badge text-xs" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>
                              <AlertTriangle className="w-3 h-3 mr-1" /> Vencida
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
                          <span>{note.annual_rate}% anual · {note.term_months} meses</span>
                          <span>
                            {new Date(note.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                            {' → '}
                            {new Date(note.maturity_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        </div>
                        {note.status !== 'draft' && (
                          <div className="mt-2 w-full max-w-xs">
                            <div className="flex justify-between text-xs mb-0.5" style={{ color: 'var(--ash)' }}>
                              <span>{pctPaid.toFixed(0)}% pagado</span>
                              <span>{fmt(paid)} / {fmt(note.total_due)}</span>
                            </div>
                            <div className="w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                              <div className="h-full rounded-full" style={{
                                width: `${Math.min(100, pctPaid)}%`,
                                backgroundColor: pctPaid >= 100 ? 'var(--success)' : 'var(--gold-600)',
                              }} />
                            </div>
                          </div>
                        )}
                      </div>
                      <div className="text-right ml-4 flex-shrink-0">
                        <p className="font-serif font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>al vencimiento</p>
                      </div>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Ciclo de Capital (#1) */}
      {activeTab === 'cycle' && (
        <div className="space-y-6">
          {cycleLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
            </div>
          ) : !cycleData ? (
            <div className="card-luxury p-8 text-center" style={{ color: 'var(--ash)' }}>
              <Activity className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No se pudo cargar el ciclo de capital</p>
              <button onClick={loadCycle} className="btn-ghost btn-sm mt-2">
                <RefreshCw className="w-4 h-4" /> Reintentar
              </button>
            </div>
          ) : (
            <>
              {/* Cycle KPIs */}
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: 'Total Invertido', value: fmt(cycleData.total_invested), color: 'var(--navy-800)', sub: `${cycleData.active_investments} inversión(es) activa(s)` },
                  { label: 'Total Retornado', value: fmt(cycleData.total_returned), color: 'var(--success)', sub: `ROI: ${cycleData.roi_to_date > 0 ? '+' : ''}${cycleData.roi_to_date.toFixed(1)}%` },
                  { label: 'Pendiente Neto', value: fmt(cycleData.net_outstanding), color: 'var(--gold-700)', sub: `Retorno esperado: ${fmt(cycleData.expected_future_returns)}` },
                ].map(kpi => (
                  <div key={kpi.label} className="card-luxury p-5">
                    <p className="text-xs mb-1" style={{ color: 'var(--slate)' }}>{kpi.label}</p>
                    <p className="font-serif text-2xl font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>{kpi.sub}</p>
                  </div>
                ))}
              </div>

              {/* Visual cycle flow */}
              <div className="card-luxury p-6">
                <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
                  Flujo: Inversión → Propiedad → RTO → Retorno
                </h3>
                <div className="space-y-3">
                  {cycleInvestments.map((inv: any) => {
                    const prop = inv.properties
                    const contract = inv.rto_contracts
                    const client = contract?.clients
                    const returnAmt = Number(inv.return_amount || 0)
                    const invAmt = Number(inv.amount || 0)
                    const progress = invAmt > 0 ? Math.min(100, (returnAmt / invAmt) * 100) : 0

                    return (
                      <div key={inv.id} className="card-flat p-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          {/* Investment */}
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                               style={{ backgroundColor: 'var(--navy-800)', color: 'white' }}>
                            <DollarSign className="w-3 h-3" />
                            {fmt(invAmt)}
                          </div>
                          <ArrowRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                          {/* Property */}
                          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                               style={{ backgroundColor: 'var(--gold-100)', color: 'var(--gold-700)' }}>
                            <MapPin className="w-3 h-3" />
                            {prop?.address || 'Sin propiedad'}
                          </div>
                          {contract && (
                            <>
                              <ArrowRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                              {/* RTO Contract */}
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                                   style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                                <User className="w-3 h-3" />
                                {client?.name || 'RTO'}
                              </div>
                            </>
                          )}
                          {returnAmt > 0 && (
                            <>
                              <ArrowRight className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium"
                                   style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                                <TrendingUp className="w-3 h-3" />
                                {fmt(returnAmt)}
                              </div>
                            </>
                          )}
                        </div>
                        {/* Progress bar */}
                        <div className="mt-2">
                          <div className="flex justify-between text-xs" style={{ color: 'var(--ash)' }}>
                            <span>Retorno: {progress.toFixed(0)}%</span>
                            <span>{inv.status}</span>
                          </div>
                          <div className="w-full h-1.5 rounded-full mt-1" style={{ backgroundColor: 'var(--sand)' }}>
                            <div className="h-full rounded-full" style={{
                              width: `${progress}%`,
                              backgroundColor: progress >= 100 ? 'var(--success)' : 'var(--gold-600)',
                            }} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                  {cycleInvestments.length === 0 && (
                    <p className="text-sm text-center py-4" style={{ color: 'var(--ash)' }}>
                      No hay inversiones vinculadas a propiedades o contratos
                    </p>
                  )}
                </div>
              </div>

              {/* Recent Flows */}
              {cycleFlows.length > 0 && (
                <div className="card-luxury">
                  <div className="p-5 border-b" style={{ borderColor: 'var(--sand)' }}>
                    <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                      Movimientos de Capital Recientes
                    </h3>
                  </div>
                  <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                    {cycleFlows.map(flow => {
                      const fl = FLOW_LABELS[flow.flow_type] || { label: flow.flow_type, color: 'var(--slate)' }
                      const isPositive = flow.amount > 0
                      return (
                        <div key={flow.id} className="flex items-center justify-between p-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full flex items-center justify-center"
                                 style={{ backgroundColor: isPositive ? 'var(--success-light)' : 'var(--error-light)' }}>
                              {isPositive ? (
                                <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--success)' }} />
                              ) : (
                                <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--error)' }} />
                              )}
                            </div>
                            <div>
                              <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{fl.label}</p>
                              <p className="text-xs" style={{ color: 'var(--ash)' }}>
                                {flow.description || '—'} · {new Date(flow.flow_date || flow.created_at).toLocaleDateString('es-MX', {
                                  day: 'numeric', month: 'short', year: 'numeric'
                                })}
                              </p>
                            </div>
                          </div>
                          <span className="font-serif font-semibold" style={{ color: fl.color }}>
                            {isPositive ? '+' : ''}{fmt(flow.amount)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-center py-2" style={{ color: 'var(--ash)' }}>
        Inversionista registrado el {new Date(investor.created_at).toLocaleDateString('es-MX', {
          day: 'numeric', month: 'long', year: 'numeric'
        })}
      </div>
    </div>
  )
}
