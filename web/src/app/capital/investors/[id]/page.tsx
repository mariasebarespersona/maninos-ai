'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Landmark, User, Mail, Phone, Briefcase,
  DollarSign, TrendingUp, Calendar, MapPin, FileText,
  PieChart, BarChart3, Edit2, Save, X, Clock, AlertTriangle,
  ArrowRight, CheckCircle2, Plus, Activity, ArrowUpRight,
  ArrowDownLeft, Pause, Play, Ban, RefreshCw, Scale
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
  // Ticket lineage (renegotiation / debt transfer)
  ticket_type?: string | null
  parent_investment_id?: string | null
  previous_rate?: number | null
  transferred_from_investor_id?: string | null
  transferred_from_name?: string | null
  purchase_price?: number | null
  closed_at?: string | null
  property_code?: string | null   // manual house code (old houses not linked to a property record)
  properties?: { address: string; city: string; property_code?: string } | null
  rto_contracts?: { client_id: string; clients?: { name: string } } | null
  promissory_notes?: { id: string; loan_amount: number; status: string; maturity_date: string; paid_amount?: number | null; annual_rate?: number | null; total_due?: number | null; total_interest?: number | null; paid_to_date?: { paid_to_date: number } | null } | null
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
  paid_to_date?: { paid_to_date: number; pct_paid: number; capital_to_date: number; interest_to_date: number; remaining: number; elapsed_periods: number; term: number } | null
}

interface Metrics {
  total_captado: number
  total_invertido: number
  total_disponible: number
  total_retornado_capital: number
  total_retornado_interes: number
  total_pagado_a_hoy: number
  total_obligacion: number
  total_restante_por_pagar: number
  tasa_fondeo: number
  avg_term_months: number
  // Legacy
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
  const [activeTab, setActiveTab] = useState<'overview' | 'investments' | 'notes' | 'estado_cuenta'>('overview')
  const [statement, setStatement] = useState<any>(null)
  const [activeInvestmentId, setActiveInvestmentId] = useState<string>('all')
  const [savingStatus, setSavingStatus] = useState(false)

  // Ticket actions: renegotiate rate / sell (transfer) debt
  const [otherInvestors, setOtherInvestors] = useState<{ id: string; name: string }[]>([])
  const [banks, setBanks] = useState<{ id: string; name: string }[]>([])
  const [renegFor, setRenegFor] = useState<Investment | null>(null)
  const [renegRate, setRenegRate] = useState('')
  const [transferFor, setTransferFor] = useState<Investment | null>(null)
  const [transferBuyer, setTransferBuyer] = useState('')
  const [transferPrice, setTransferPrice] = useState('')
  const [transferBank, setTransferBank] = useState('')
  const [ticketSaving, setTicketSaving] = useState(false)

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
        // Load the capital-flow data for the "Flujo de Capital" section in Resumen
        loadCycle()
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
    if (tab === 'estado_cuenta' && !statement) {
      fetch(`/api/capital/investors/${id}/account-statement`)
        .then(r => r.json())
        .then(d => { if (d.ok) setStatement(d) })
        .catch(() => {})
    }
  }

  // Load refs used by the ticket actions (other investors to sell debt to, Capital banks)
  const loadTicketRefs = async () => {
    try {
      const [invRes, bankRes] = await Promise.all([
        fetch('/api/capital/investors'),
        fetch('/api/capital/accounting/bank-accounts'),
      ])
      const invData = await invRes.json()
      const bankData = await bankRes.json()
      if (invData.ok) setOtherInvestors((invData.investors || []).filter((i: any) => i.id !== id).map((i: any) => ({ id: i.id, name: i.name })))
      const bankList = bankData.ok ? (bankData.bank_accounts || bankData.banks || []) : (Array.isArray(bankData) ? bankData : [])
      setBanks(bankList.map((b: any) => ({ id: b.id, name: b.name })))
    } catch (err) {
      console.error('Error loading ticket refs:', err)
    }
  }

  const openReneg = (inv: Investment) => { setRenegFor(inv); setRenegRate(String(inv.expected_return_rate ?? '')) }
  const openTransfer = (inv: Investment) => { setTransferFor(inv); setTransferBuyer(''); setTransferPrice(String(inv.amount)); setTransferBank(''); if (!otherInvestors.length || !banks.length) loadTicketRefs() }

  const handleRenegotiate = async () => {
    if (!renegFor) return
    const rate = parseFloat(renegRate)
    if (!(rate >= 0)) { toast.warning('Ingresa una tasa válida'); return }
    setTicketSaving(true)
    try {
      const res = await fetch(`/api/capital/investors/investments/${renegFor.id}/renegotiate`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ new_rate: rate }),
      })
      const data = await res.json()
      if (data.ok) { toast.success('Ticket renegociado'); setRenegFor(null); loadInvestor() }
      else toast.error(data.detail || 'Error al renegociar')
    } catch { toast.error('Error al renegociar') } finally { setTicketSaving(false) }
  }

  const handleTransfer = async () => {
    if (!transferFor) return
    if (!transferBuyer) { toast.warning('Elige el inversionista comprador'); return }
    if (!transferBank) { toast.warning('Elige el banco por el que pasa el dinero'); return }
    setTicketSaving(true)
    try {
      const res = await fetch(`/api/capital/investors/investments/${transferFor.id}/transfer`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to_investor_id: transferBuyer, bank_account_id: transferBank, purchase_price: transferPrice ? parseFloat(transferPrice) : undefined }),
      })
      const data = await res.json()
      if (data.ok) { toast.success('Deuda transferida al comprador'); setTransferFor(null); loadInvestor() }
      else toast.error(data.detail || 'Error al transferir')
    } catch { toast.error('Error al transferir') } finally { setTicketSaving(false) }
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

  const INV_STATUS: Record<string, { bg: string; color: string; label: string }> = {
    active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
    returned: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Retornada' },
    partial_return: { bg: 'var(--cream)', color: 'var(--info)', label: 'Parcial' },
    defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Perdida' },
    renegotiated: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Renegociada' },
    transferred: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Vendida' },
  }
  const investmentLabel = (inv: Investment, idx: number) =>
    inv.properties?.property_code || inv.property_code || inv.rto_contracts?.clients?.name || `Inversión ${idx + 1}`
  // The investor's return comes from the linked promissory note's payments (not RTO rent).
  // Use the unified schedule-based "pagado a hoy"; fall back to raw only if absent.
  const ticketReturn = (inv: Investment) =>
    inv.promissory_notes
      ? Number(inv.promissory_notes.paid_to_date?.paid_to_date ?? inv.promissory_notes.paid_amount ?? 0)
      : Number(inv.return_amount || 0)
  const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })

  // Rendimiento real vs esperado — driven by the promissory-note figures (the old
  // ticket-based return_amount/expected_rate are empty for note investors, which
  // showed a misleading −100% ROI / $0). All values come from the unified metrics.
  const totalInvested = metrics?.total_invested || 0
  const interestEarnedToDate = metrics?.total_retornado_interes || 0        // yield real a hoy
  const principalReturnedToDate = metrics?.total_retornado_capital || 0
  const paidToDateTotal = metrics?.total_pagado_a_hoy || 0
  const expectedInterestTotal = Math.max(0, (metrics?.notes_total_due || 0) - (metrics?.notes_total_lent || 0))
  const tasaEsperada = metrics?.tasa_fondeo || 0
  const principalPending = Math.max(0, totalInvested - principalReturnedToDate)
  const totalToRepay = metrics?.notes_total_due || 0

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
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Invertido', value: fmt(metrics?.total_invertido || totalInvested), icon: Briefcase, color: 'var(--navy-800)' },
          { label: 'Total Disponible', value: fmt(metrics?.total_disponible || 0), icon: Landmark, color: 'var(--info)' },
          { label: 'Pagado a hoy', value: fmt(metrics?.total_pagado_a_hoy || 0), icon: TrendingUp, color: 'var(--success)', hint: 'Calculado al día de hoy' },
          { label: 'Queda por pagar', value: fmt(metrics?.total_restante_por_pagar || 0), icon: Clock, color: 'var(--warning)', hint: 'Obligación − pagado a hoy' },
          { label: 'Capital devuelto (a hoy)', value: fmt(metrics?.total_retornado_capital || 0), icon: TrendingUp, color: 'var(--success)' },
          { label: 'Interés pagado (a hoy)', value: fmt(metrics?.total_retornado_interes || 0), icon: TrendingUp, color: 'var(--gold-700)' },
          { label: 'Obligación total', value: fmt(metrics?.total_obligacion || 0), icon: DollarSign, color: 'var(--gold-600)' },
          { label: 'Tasa Fondeo', value: `${metrics?.tasa_fondeo || 0}%`, icon: PieChart, color: 'var(--charcoal)' },
        ].map((kpi) => (
          <div key={kpi.label} className="card-luxury p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              <span className="text-xs" style={{ color: 'var(--slate)' }}>{kpi.label}</span>
            </div>
            <p className="font-serif text-xl font-semibold" style={{ color: 'var(--ink)' }}>{kpi.value}</p>
            {kpi.hint && <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>{kpi.hint}</p>}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--sand)' }}>
        {[
          { key: 'overview' as const, label: 'Resumen', icon: BarChart3 },
          { key: 'investments' as const, label: `Inversiones (${investments.length})`, icon: DollarSign },
          { key: 'notes' as const, label: `Promissory Notes (${promissoryNotes.length})`, icon: FileText },
          { key: 'estado_cuenta' as const, label: 'Estado de Cuenta', icon: Scale },
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

          {/* Flujo de Capital (diagrama) */}
          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>
              <Activity className="w-4 h-4 inline mr-2" />
              Flujo de Capital
            </h3>
            <p className="text-xs mb-5" style={{ color: 'var(--ash)' }}>
              El capital de {investor.name} se ramifica en cada casa; el retorno se paga vía sus promissory notes.
            </p>

            {(() => {
              const aportado = metrics?.total_captado || 0
              const invertido = metrics?.total_invertido || 0
              const disponible = metrics?.total_disponible ?? (investor.available_capital || 0)
              const retCap = metrics?.total_retornado_capital || 0
              const retInt = metrics?.total_retornado_interes || 0
              const retTotal = retCap + retInt
              const pctDeployed = aportado > 0 ? Math.min(100, (invertido / aportado) * 100) : 0
              // Only live tickets are branches (closed renegotiated/transferred ones live in the history).
              const liveTickets = investments.filter(i => i.status !== 'renegotiated' && i.status !== 'transferred')

              return (
                <div className="space-y-3">
                  {/* SOURCE — trunk */}
                  <div className="rounded-lg p-4" style={{ background: 'linear-gradient(135deg, var(--gold-100), var(--cream))', border: '1px solid var(--gold-200, var(--sand))' }}>
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--gold-600)' }}>
                          <DollarSign className="w-5 h-5" style={{ color: 'white' }} />
                        </div>
                        <div>
                          <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--slate)' }}>Capital Aportado</p>
                          <p className="font-serif text-2xl font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(aportado)}</p>
                        </div>
                      </div>
                      <div className="flex gap-4 text-right">
                        <div>
                          <p className="text-[11px]" style={{ color: 'var(--slate)' }}>Desplegado</p>
                          <p className="font-serif font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(invertido)}</p>
                        </div>
                        <div>
                          <p className="text-[11px]" style={{ color: 'var(--slate)' }}>Disponible</p>
                          <p className="font-serif font-semibold" style={{ color: 'var(--info)' }}>{fmt(disponible)}</p>
                        </div>
                      </div>
                    </div>
                    {/* deployment bar */}
                    <div className="mt-3 w-full h-1.5 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                      <div className="h-full rounded-full" style={{ width: `${pctDeployed}%`, backgroundColor: 'var(--gold-600)' }} />
                    </div>
                    <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>{pctDeployed.toFixed(0)}% del capital desplegado en casas</p>
                  </div>

                  {/* BRANCHES — one per house */}
                  {liveTickets.length === 0 ? (
                    <div className="rounded-lg p-6 text-center" style={{ border: '1px dashed var(--stone)', color: 'var(--ash)' }}>
                      <Landmark className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">Aún no hay capital asignado a casas.</p>
                    </div>
                  ) : (
                    <div className="pl-3 space-y-2" style={{ borderLeft: '2px solid var(--gold-300, var(--gold-200))' }}>
                      {liveTickets.map((inv, idx) => {
                        const code = inv.properties?.property_code || inv.property_code
                        const addr = inv.properties?.address
                        const client = inv.rto_contracts?.clients?.name
                        const invAmt = Number(inv.amount || 0)
                        const retAmt = ticketReturn(inv)
                        const progress = invAmt > 0 ? Math.min(100, (retAmt / invAmt) * 100) : 0
                        const st = INV_STATUS[inv.status] || INV_STATUS.active
                        return (
                          <div key={inv.id} className="relative card-flat p-3">
                            {/* connector dot to the rail */}
                            <span className="absolute -left-[19px] top-6 w-3 h-3 rounded-full" style={{ backgroundColor: 'var(--gold-500, var(--gold-600))', border: '2px solid white' }} />
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* house node */}
                              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: 'var(--gold-100)' }}>
                                <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--gold-700)' }} />
                                <div className="leading-tight">
                                  <p className="text-xs font-semibold" style={{ color: 'var(--gold-700)' }}>
                                    {code || investmentLabel(inv, idx)} <span className="font-serif" style={{ color: 'var(--navy-800)' }}>· {fmt(invAmt)}</span>
                                  </p>
                                  {addr && <p className="text-[10px]" style={{ color: 'var(--ash)' }}>{addr}</p>}
                                </div>
                              </div>
                              <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                              {/* RTO node */}
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                                   style={{ backgroundColor: client ? 'var(--success-light)' : 'var(--cream)', color: client ? 'var(--success)' : 'var(--ash)' }}>
                                <User className="w-3.5 h-3.5" />
                                {client || 'Sin contrato RTO'}
                              </div>
                              <ArrowRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                              {/* return node */}
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs"
                                   style={{ backgroundColor: retAmt > 0 ? 'var(--gold-100)' : 'var(--cream)', color: retAmt > 0 ? 'var(--gold-700)' : 'var(--ash)' }}>
                                <TrendingUp className="w-3.5 h-3.5" />
                                {retAmt > 0 ? fmt(retAmt) : 'Sin retorno aún'}
                              </div>
                              <span className="badge text-xs ml-auto" style={{ backgroundColor: st.bg, color: st.color }}>{st.label}</span>
                            </div>
                            {/* per-house return progress */}
                            <div className="mt-2 w-full h-1 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                              <div className="h-full rounded-full" style={{ width: `${progress}%`, backgroundColor: progress >= 100 ? 'var(--success)' : 'var(--gold-600)' }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* COLLECTOR — total return */}
                  <div className="rounded-lg p-4 flex items-center justify-between gap-3 flex-wrap" style={{ background: 'linear-gradient(135deg, var(--success-light), var(--cream))', border: '1px solid var(--success-light)' }}>
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success)' }}>
                        <ArrowDownLeft className="w-5 h-5" style={{ color: 'white' }} />
                      </div>
                      <div>
                        <p className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--slate)' }}>Retorno total al inversor</p>
                        <p className="font-serif text-2xl font-semibold" style={{ color: 'var(--success)' }}>{fmt(retTotal)}</p>
                      </div>
                    </div>
                    <div className="flex gap-4 text-right">
                      <div>
                        <p className="text-[11px]" style={{ color: 'var(--slate)' }}>Capital</p>
                        <p className="font-serif font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(retCap)}</p>
                      </div>
                      <div>
                        <p className="text-[11px]" style={{ color: 'var(--slate)' }}>Interés</p>
                        <p className="font-serif font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(retInt)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* Movimientos de Capital */}
            {cycleFlows.length > 0 && (
              <div className="mt-6 pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
                <h4 className="font-medium text-sm mb-3" style={{ color: 'var(--ink)' }}>Movimientos de Capital Recientes</h4>
                <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                  {cycleFlows.map(flow => {
                    const fl = FLOW_LABELS[flow.flow_type] || { label: flow.flow_type, color: 'var(--slate)' }
                    const isPositive = flow.amount > 0
                    return (
                      <div key={flow.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: isPositive ? 'var(--success-light)' : 'var(--error-light)' }}>
                            {isPositive ? (
                              <ArrowDownLeft className="w-4 h-4" style={{ color: 'var(--success)' }} />
                            ) : (
                              <ArrowUpRight className="w-4 h-4" style={{ color: 'var(--error)' }} />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{fl.label}</p>
                            <p className="text-xs" style={{ color: 'var(--ash)' }}>
                              {flow.description || '—'} · {new Date(flow.flow_date || flow.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
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
          </div>

          {/* Rendimiento Real vs Esperado (#7) */}
          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Rendimiento Real vs Esperado
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Interés Ganado a Hoy</span>
                <p className="font-serif text-xl font-semibold" style={{ color: 'var(--success)' }}>
                  {fmt(interestEarnedToDate)}
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  de {fmt(expectedInterestTotal)} esperado
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Tasa Esperada Prom.</span>
                <p className="font-serif text-xl font-semibold" style={{ color: 'var(--gold-700)' }}>
                  {tasaEsperada.toFixed(1)}%
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  anual (pagarés)
                </p>
              </div>
              <div>
                <span className="text-xs" style={{ color: 'var(--slate)' }}>Capital sin Devolver</span>
                <p className="font-serif text-xl font-semibold" style={{ color: 'var(--navy-800)' }}>
                  {fmt(principalPending)}
                </p>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  de {fmt(totalInvested)} prestado
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

            {/* Progreso de repago (pagado a hoy sobre el total a devolver) */}
            {totalToRepay > 0 && (
              <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ash)' }}>
                      <span>Retornado a hoy: {fmt(paidToDateTotal)}</span>
                      <span>de {fmt(totalToRepay)} total</span>
                    </div>
                    <div className="w-full h-3 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${Math.min(100, totalToRepay > 0 ? (paidToDateTotal / totalToRepay) * 100 : 0)}%`,
                        backgroundColor: paidToDateTotal >= totalToRepay ? 'var(--success)' : 'var(--gold-600)',
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
      <div className="space-y-4">
        {investments.length === 0 ? (
          <div className="card-luxury p-8 text-center" style={{ color: 'var(--ash)' }}>
            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No hay inversiones registradas</p>
          </div>
        ) : (
          <>
            {/* Sub-tabs: one per investment */}
            <div className="flex gap-1 flex-wrap">
              <button
                onClick={() => setActiveInvestmentId('all')}
                className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors"
                style={{
                  backgroundColor: activeInvestmentId === 'all' ? 'var(--gold-100)' : 'transparent',
                  color: activeInvestmentId === 'all' ? 'var(--gold-700)' : 'var(--slate)',
                  border: `1px solid ${activeInvestmentId === 'all' ? 'var(--gold-400)' : 'var(--stone)'}`,
                }}
              >
                Todas ({investments.length})
              </button>
              {investments.map((inv, idx) => {
                const isActive = activeInvestmentId === inv.id
                return (
                  <button
                    key={inv.id}
                    onClick={() => setActiveInvestmentId(inv.id)}
                    className="px-3 py-1.5 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5"
                    style={{
                      backgroundColor: isActive ? 'var(--gold-100)' : 'transparent',
                      color: isActive ? 'var(--gold-700)' : 'var(--slate)',
                      border: `1px solid ${isActive ? 'var(--gold-400)' : 'var(--stone)'}`,
                    }}
                  >
                    {inv.properties?.property_code ? <MapPin className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {investmentLabel(inv, idx)}
                    <span style={{ color: 'var(--ash)' }}>· {fmt(inv.amount)}</span>
                  </button>
                )
              })}
            </div>

            {/* "Todas" — summary table */}
            {activeInvestmentId === 'all' && (
              <div className="card-luxury">
                <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
                  <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                    <BarChart3 className="w-4 h-4 inline mr-2" />
                    Historial de Inversiones ({investments.length})
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Fecha</th>
                        <th>Casa / Contrato</th>
                        <th>Monto</th>
                        <th>Tasa Esperada</th>
                        <th>Retorno</th>
                        <th>Nota Vinculada</th>
                        <th>Estado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {investments.map((inv) => {
                        const s = INV_STATUS[inv.status] || INV_STATUS.active
                        return (
                          <tr key={inv.id} className="cursor-pointer hover:bg-cream/40" onClick={() => setActiveInvestmentId(inv.id)}>
                            <td className="text-sm">{fmtDate(inv.invested_at)}</td>
                            <td>
                              {inv.properties ? (
                                <div>
                                  <span className="flex items-center gap-1 text-sm">
                                    <MapPin className="w-3 h-3" style={{ color: 'var(--gold-600)' }} />
                                    {inv.properties.property_code ? `${inv.properties.property_code} · ` : ''}{inv.properties.address}
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
                              {ticketReturn(inv) > 0 ? (
                                <span style={{ color: 'var(--success)' }}>{fmt(ticketReturn(inv))}</span>
                              ) : (
                                <span style={{ color: 'var(--ash)' }}>Pendiente</span>
                              )}
                            </td>
                            <td>
                              {inv.promissory_notes ? (
                                <Link href={`/capital/promissory-notes/${inv.promissory_notes.id}`} onClick={e => e.stopPropagation()}
                                  className="text-xs flex items-center gap-1 hover:underline" style={{ color: 'var(--gold-700)' }}>
                                  <FileText className="w-3 h-3" />
                                  {fmt(inv.promissory_notes.loan_amount)}
                                </Link>
                              ) : (
                                <span style={{ color: 'var(--ash)' }}>—</span>
                              )}
                            </td>
                            <td>
                              <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Per-investment detail */}
            {activeInvestmentId !== 'all' && (() => {
              const idx = investments.findIndex(i => i.id === activeInvestmentId)
              const inv = investments[idx]
              if (!inv) return null
              const s = INV_STATUS[inv.status] || INV_STATUS.active
              const invAmt = Number(inv.amount || 0)
              const retAmt = ticketReturn(inv)
              const progress = invAmt > 0 ? Math.min(100, (retAmt / invAmt) * 100) : 0
              const isLive = inv.status !== 'renegotiated' && inv.status !== 'transferred'
              return (
                <div className="card-luxury p-6 space-y-6">
                  {/* Header */}
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--gold-100)' }}>
                        {inv.properties?.property_code ? <MapPin className="w-6 h-6" style={{ color: 'var(--gold-700)' }} /> : <DollarSign className="w-6 h-6" style={{ color: 'var(--gold-700)' }} />}
                      </div>
                      <div>
                        <h3 className="font-serif text-xl" style={{ color: 'var(--ink)' }}>{investmentLabel(inv, idx)}</h3>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Invertida el {fmtDate(inv.invested_at)}</p>
                      </div>
                    </div>
                    <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
                  </div>

                  {/* Lineage banner (renegotiation / debt transfer) */}
                  {(inv.ticket_type === 'renegotiation' || inv.ticket_type === 'transfer' || inv.status === 'renegotiated' || inv.status === 'transferred') && (
                    <div className="rounded-lg p-3 text-sm flex items-start gap-2" style={{ backgroundColor: 'var(--cream)', border: '1px solid var(--sand)', color: 'var(--charcoal)' }}>
                      <RefreshCw className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold-600)' }} />
                      <div className="space-y-0.5">
                        {inv.ticket_type === 'renegotiation' && <p>Ticket renegociado: tasa <b>{inv.previous_rate ?? '—'}%</b> → <b>{inv.expected_return_rate ?? '—'}%</b></p>}
                        {inv.ticket_type === 'transfer' && <p>Deuda comprada a <b>{inv.transferred_from_name || 'otro inversionista'}</b>{inv.purchase_price ? <> por <b>{fmt(inv.purchase_price)}</b></> : null}</p>}
                        {inv.status === 'renegotiated' && <p style={{ color: 'var(--ash)' }}>Este ticket fue renegociado — reemplazado por uno nuevo con otra tasa.</p>}
                        {inv.status === 'transferred' && <p style={{ color: 'var(--ash)' }}>Esta deuda fue vendida a otro inversionista.</p>}
                      </div>
                    </div>
                  )}

                  {/* Key figures */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Monto Invertido</p>
                      <p className="font-serif text-xl font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(invAmt)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Tasa Esperada</p>
                      <p className="font-serif text-xl font-semibold" style={{ color: 'var(--gold-700)' }}>
                        {inv.expected_return_rate ? `${inv.expected_return_rate}%` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Retorno</p>
                      <p className="font-serif text-xl font-semibold" style={{ color: retAmt > 0 ? 'var(--success)' : 'var(--ash)' }}>
                        {retAmt > 0 ? fmt(retAmt) : 'Pendiente'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Fecha Retorno</p>
                      <p className="font-serif text-xl font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {inv.returned_at ? fmtDate(inv.returned_at) : '—'}
                      </p>
                    </div>
                  </div>

                  {/* Return progress */}
                  <div>
                    <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ash)' }}>
                      <span>Retorno: {progress.toFixed(0)}%</span>
                      <span>{fmt(retAmt)} de {fmt(invAmt)}</span>
                    </div>
                    <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                      <div className="h-full rounded-full transition-all" style={{
                        width: `${progress}%`,
                        backgroundColor: progress >= 100 ? 'var(--success)' : 'var(--gold-600)',
                      }} />
                    </div>
                  </div>

                  {/* Links / details */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2" style={{ borderTop: '1px solid var(--sand)' }}>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--slate)' }}>Casa</p>
                      {inv.properties ? (
                        <p className="text-sm flex items-center gap-1" style={{ color: 'var(--charcoal)' }}>
                          <MapPin className="w-3.5 h-3.5" style={{ color: 'var(--gold-600)' }} />
                          {inv.properties.property_code ? `${inv.properties.property_code} · ` : ''}{inv.properties.address}{inv.properties.city ? `, ${inv.properties.city}` : ''}
                        </p>
                      ) : <p className="text-sm" style={{ color: 'var(--ash)' }}>Sin casa vinculada</p>}
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--slate)' }}>Contrato RTO</p>
                      {inv.rto_contracts?.clients?.name ? (
                        <p className="text-sm flex items-center gap-1" style={{ color: 'var(--charcoal)' }}>
                          <User className="w-3.5 h-3.5" /> {inv.rto_contracts.clients.name}
                        </p>
                      ) : <p className="text-sm" style={{ color: 'var(--ash)' }}>Sin contrato vinculado</p>}
                    </div>
                    <div>
                      <p className="text-xs mb-1" style={{ color: 'var(--slate)' }}>Nota Vinculada</p>
                      {inv.promissory_notes ? (
                        <Link href={`/capital/promissory-notes/${inv.promissory_notes.id}`}
                          className="text-sm flex items-center gap-1 hover:underline" style={{ color: 'var(--gold-700)' }}>
                          <FileText className="w-3.5 h-3.5" /> {fmt(inv.promissory_notes.loan_amount)}
                        </Link>
                      ) : <p className="text-sm" style={{ color: 'var(--ash)' }}>—</p>}
                    </div>
                    {inv.notes && (
                      <div className="sm:col-span-2">
                        <p className="text-xs mb-1" style={{ color: 'var(--slate)' }}>Notas</p>
                        <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{inv.notes}</p>
                      </div>
                    )}
                  </div>

                  {/* Ticket actions */}
                  {isLive && (
                    <div className="flex flex-wrap gap-2 pt-3" style={{ borderTop: '1px solid var(--sand)' }}>
                      <button onClick={() => openReneg(inv)} className="btn-secondary btn-sm">
                        <RefreshCw className="w-3.5 h-3.5" /> Renegociar tasa
                      </button>
                      <button onClick={() => openTransfer(inv)} className="btn-secondary btn-sm">
                        <ArrowUpRight className="w-3.5 h-3.5" /> Vender deuda
                      </button>
                    </div>
                  )}
                </div>
              )
            })()}
          </>
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
                  // Schedule-derived "pagado a hoy" (consistent with the note detail
                  // and summary); falls back to raw paid_amount only if missing.
                  const paid = note.paid_to_date ? Number(note.paid_to_date.paid_to_date || 0) : Number(note.paid_amount || 0)
                  const pctPaid = note.paid_to_date ? Number(note.paid_to_date.pct_paid || 0) : (note.total_due > 0 ? (paid / note.total_due * 100) : 0)
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

      {/* TAB: Estado de Cuenta (accounting statement, straight from the ledger) */}
      {activeTab === 'estado_cuenta' && (
        <div className="space-y-6">
          {!statement ? (
            <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Cargando estado de cuenta…</div>
          ) : (
            <>
              {/* Aviso: la vista contable solo cuenta lo confirmado en el libro mayor.
                  Si hay pagarés cuyo depósito aún no se confirma, esta vista sale en $0
                  aunque el "pagado a hoy" operativo (cronograma) sí exista. */}
              {(() => {
                const invested = metrics?.total_invertido || 0
                const confirmed = statement.principal?.deposited || 0
                const unconfirmed = Math.round((invested - confirmed) * 100) / 100
                if (unconfirmed <= 1) return null
                return (
                  <div className="rounded-lg p-4 flex items-start gap-3" style={{ backgroundColor: 'var(--warning-light)', border: '1px solid var(--warning)' }}>
                    <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
                    <div className="text-sm" style={{ color: 'var(--charcoal)' }}>
                      <p className="font-semibold" style={{ color: 'var(--ink)' }}>Contabilidad pendiente de confirmar</p>
                      <p className="mt-0.5">
                        Esta vista muestra <strong>solo lo confirmado en el libro mayor</strong>. Hay {fmt(unconfirmed)} en
                        pagarés cuyo depósito todavía no está confirmado en contabilidad, por eso aparece en $0.
                        El <strong>pagado a hoy</strong> del cronograma sí se ve en las pestañas «Resumen» y «Notas».
                      </p>
                    </div>
                  </div>
                )
              })()}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card-luxury p-5">
                  <h3 className="font-serif text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                    <Landmark className="w-4 h-4" /> Capital (Principal)
                  </h3>
                  {[
                    ['Depositado por el inversor', statement.principal.deposited],
                    ['Devuelto', statement.principal.repaid],
                  ].map(([l, v]: any) => (
                    <div key={l} className="flex justify-between py-1.5 text-sm border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--slate)' }}>{l}</span><span style={{ color: 'var(--charcoal)' }}>{fmt(v)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between pt-3 mt-1 font-semibold text-sm">
                    <span style={{ color: 'var(--ink)' }}>Principal pendiente</span>
                    <span style={{ color: 'var(--gold-700)' }}>{fmt(statement.principal.outstanding)}</span>
                  </div>
                </div>

                <div className="card-luxury p-5">
                  <h3 className="font-serif text-base mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                    <TrendingUp className="w-4 h-4" /> Interés
                  </h3>
                  {[
                    ['Reconocido (gasto)', statement.interest.recognized],
                    ['Pagado al inversor', statement.interest.paid],
                    ['Devengado sin pagar', statement.interest.accrued_unpaid],
                  ].map(([l, v]: any) => (
                    <div key={l} className="flex justify-between py-1.5 text-sm border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
                      <span style={{ color: 'var(--slate)' }}>{l}</span><span style={{ color: 'var(--charcoal)' }}>{fmt(v)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="card-luxury p-5 text-center">
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Pendiente por pagar al inversor</p>
                  <p className="text-2xl font-bold" style={{ color: 'var(--error)' }}>{fmt(statement.totals.owed_to_investor)}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Principal pendiente + interés devengado</p>
                </div>
                <div className="card-luxury p-5 text-center">
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: 'var(--ash)' }}>Pagado al inversor a la fecha</p>
                  <p className="text-2xl font-bold" style={{ color: '#059669' }}>{fmt(statement.totals.paid_to_investor)}</p>
                  <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Principal devuelto + interés pagado</p>
                </div>
              </div>

              <p className="text-[11px] text-center" style={{ color: 'var(--ash)' }}>
                Calculado directamente del libro contable de Capital (cuentas 23900 principal · 71400 interés · 23950 interés devengado).
              </p>
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

      {/* Renegotiate modal */}
      {renegFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>Renegociar tasa</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
              {investmentLabel(renegFor, 0)} · {fmt(Number(renegFor.amount))}. Se cierra este ticket y se crea uno nuevo con la nueva tasa (el original queda en el historial).
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Tasa actual</label>
                <input className="input w-full" disabled value={renegFor.expected_return_rate != null ? `${renegFor.expected_return_rate}%` : '—'} />
              </div>
              <div>
                <label className="label">Nueva tasa (%) *</label>
                <input type="number" step="0.1" className="input w-full" value={renegRate} onChange={e => setRenegRate(e.target.value)} placeholder="0" />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleRenegotiate} disabled={ticketSaving} className="btn-primary flex-1">{ticketSaving ? 'Guardando...' : 'Renegociar'}</button>
              <button onClick={() => setRenegFor(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer (sell debt) modal */}
      {transferFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>Vender / transferir deuda</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
              {investmentLabel(transferFor, 0)} · {fmt(Number(transferFor.amount))}. El comprador paga a través de un banco de Capital; la deuda pasa a su nombre.
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Comprador *</label>
                <select className="input w-full" value={transferBuyer} onChange={e => setTransferBuyer(e.target.value)}>
                  <option value="">Selecciona inversionista…</option>
                  {otherInvestors.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Precio de compra</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                  <input type="number" className="input w-full pl-8" value={transferPrice} onChange={e => setTransferPrice(e.target.value)} placeholder={String(transferFor.amount)} />
                </div>
                <p className="text-[10px] mt-1" style={{ color: 'var(--ash)' }}>Por defecto el valor nominal ({fmt(Number(transferFor.amount))}).</p>
              </div>
              <div>
                <label className="label">Banco (pasa por Capital) *</label>
                <select className="input w-full" value={transferBank} onChange={e => setTransferBank(e.target.value)}>
                  <option value="">Selecciona banco…</option>
                  {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleTransfer} disabled={ticketSaving} className="btn-primary flex-1">{ticketSaving ? 'Transfiriendo...' : 'Transferir deuda'}</button>
              <button onClick={() => setTransferFor(null)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
