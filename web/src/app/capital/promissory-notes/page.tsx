'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FileText, Plus, DollarSign, Calendar, Clock, AlertTriangle,
  CheckCircle2, User, Search, ArrowRight, Landmark, TrendingUp
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Investor {
  id: string
  name: string
  email: string | null
  company: string | null
}

interface PromissoryNote {
  id: string
  investor_id: string
  loan_amount: number
  annual_rate: number
  term_months: number
  total_interest: number
  total_due: number
  subscriber_name: string
  lender_name: string
  lender_company: string | null
  start_date: string
  maturity_date: string
  status: string
  paid_amount: number | null
  paid_at: string | null
  notes: string | null
  created_at: string
  investors?: Investor | null
}

interface Summary {
  total_notes: number
  active_notes: number
  overdue_notes: number
  total_issued: number
  total_due: number
  total_paid: number
  outstanding: number
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Borrador' },
  active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
  paid: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Pagada' },
  overdue: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Vencida' },
  defaulted: { bg: '#fca5a5', color: '#7f1d1d', label: 'Impago' },
  cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
}

export default function PromissoryNotesPage() {
  const router = useRouter()
  const toast = useToast()
  const [notes, setNotes] = useState<PromissoryNote[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [investors, setInvestors] = useState<Investor[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')

  // Create form state
  const [showCreate, setShowCreate] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({
    investor_id: '',
    loan_amount: '',
    annual_rate: '12',
    term_months: '12',
    start_date: new Date().toISOString().split('T')[0],
    subscriber_representative: '',
    lender_representative: '',
    notes: '',
  })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [notesRes, investorsRes] = await Promise.all([
        fetch('/api/capital/promissory-notes'),
        fetch('/api/capital/investors'),
      ])
      const notesData = await notesRes.json()
      const investorsData = await investorsRes.json()

      if (notesData.ok) {
        setNotes(notesData.notes || [])
        setSummary(notesData.summary || null)
      }
      if (investorsData.ok) setInvestors(investorsData.investors || [])
    } catch (err) {
      console.error('Error loading promissory notes:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!form.investor_id) { toast.warning('Selecciona un inversionista'); return }
    if (!form.loan_amount || parseFloat(form.loan_amount) <= 0) { toast.warning('Ingresa un monto válido'); return }

    setCreating(true)
    try {
      const res = await fetch('/api/capital/promissory-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_id: form.investor_id,
          loan_amount: parseFloat(form.loan_amount),
          annual_rate: parseFloat(form.annual_rate),
          term_months: parseInt(form.term_months),
          start_date: form.start_date,
          subscriber_representative: form.subscriber_representative || undefined,
          lender_representative: form.lender_representative || undefined,
          notes: form.notes || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Nota promisoria creada')
        setShowCreate(false)
        setForm({ investor_id: '', loan_amount: '', annual_rate: '12', term_months: '12', start_date: new Date().toISOString().split('T')[0], subscriber_representative: '', lender_representative: '', notes: '' })
        loadData()
        // Navigate to the new note
        if (data.note?.id) {
          router.push(`/capital/promissory-notes/${data.note.id}`)
        }
      } else {
        toast.error(data.detail || 'Error al crear nota')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setCreating(false)
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

  const filteredNotes = notes.filter(n => {
    const matchSearch = !search || 
      n.lender_name?.toLowerCase().includes(search.toLowerCase()) ||
      n.investors?.name?.toLowerCase().includes(search.toLowerCase()) ||
      n.investors?.company?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || n.status === statusFilter
    return matchSearch && matchStatus
  })

  // Days until maturity
  const daysUntilMaturity = (maturityDate: string) => {
    const diff = new Date(maturityDate).getTime() - new Date().getTime()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

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
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Promissory Notes</h1>
          <p style={{ color: 'var(--slate)' }}>Notas promisorias — interés simple, pagos flexibles</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" />
          Nueva Nota
        </button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Emitido', value: fmt(summary.total_issued), icon: DollarSign, color: 'var(--navy-800)' },
            { label: 'Total a Pagar', value: fmt(summary.total_due), icon: TrendingUp, color: 'var(--gold-600)' },
            { label: 'Pagado', value: fmt(summary.total_paid), icon: CheckCircle2, color: 'var(--success)' },
            { label: 'Pendiente', value: fmt(summary.outstanding), icon: Clock, color: summary.overdue_notes > 0 ? 'var(--error)' : 'var(--info)' },
          ].map(kpi => (
            <div key={kpi.label} className="card-luxury p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <kpi.icon className="w-5 h-5" style={{ color: kpi.color }} />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{kpi.label}</p>
                  <p className="font-serif font-semibold" style={{ color: 'var(--charcoal)' }}>{kpi.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Search & Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input pl-10 w-full"
            placeholder="Buscar por inversionista..."
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['', 'active', 'paid', 'overdue', 'draft'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
              style={{
                backgroundColor: statusFilter === s ? 'var(--navy-800)' : 'var(--cream)',
                color: statusFilter === s ? 'white' : 'var(--charcoal)',
              }}
            >
              {s === '' ? 'Todas' : STATUS_STYLES[s]?.label || s}
            </button>
          ))}
        </div>
      </div>

      {/* Notes List */}
      {filteredNotes.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <FileText className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            {notes.length === 0 ? 'No hay notas promisorias' : 'No hay resultados'}
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            {notes.length === 0 ? 'Crea una nota promisoria para registrar un préstamo de un inversionista' : 'Intenta con otros filtros'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredNotes.map(note => {
            const s = STATUS_STYLES[note.status] || STATUS_STYLES.active
            const days = daysUntilMaturity(note.maturity_date)
            const isNearMaturity = note.status === 'active' && days <= 30 && days > 0
            const isOverdue = note.status === 'active' && days < 0

            return (
              <div
                key={note.id}
                className="card-luxury p-5 cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/capital/promissory-notes/${note.id}`)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                         style={{ backgroundColor: 'var(--gold-100)' }}>
                      <FileText className="w-6 h-6" style={{ color: 'var(--gold-700)' }} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>
                          {fmt(note.loan_amount)}
                        </h3>
                        <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                        {isNearMaturity && (
                          <span className="badge text-xs" style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
                            <Clock className="w-3 h-3 mr-1" /> Vence en {days}d
                          </span>
                        )}
                        {isOverdue && (
                          <span className="badge text-xs" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>
                            <AlertTriangle className="w-3 h-3 mr-1" /> Vencida {Math.abs(days)}d
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1 text-sm" style={{ color: 'var(--slate)' }}>
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {note.investors?.name || note.lender_name}
                        </span>
                        {note.investors?.company && (
                          <span className="flex items-center gap-1">
                            <Landmark className="w-3.5 h-3.5" />
                            {note.investors.company}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
                        <div>
                          <p className="text-xs" style={{ color: 'var(--ash)' }}>Tasa Anual</p>
                          <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{note.annual_rate}%</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--ash)' }}>Plazo</p>
                          <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>{note.term_months} meses</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--ash)' }}>Interés Total</p>
                          <p className="font-medium text-sm" style={{ color: 'var(--gold-700)' }}>{fmt(note.total_interest)}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: 'var(--ash)' }}>Total al Vencimiento</p>
                          <p className="font-medium text-sm" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2 text-xs" style={{ color: 'var(--ash)' }}>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Inicio: {new Date(note.start_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          Vencimiento: {new Date(note.maturity_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 flex-shrink-0 mt-2" style={{ color: 'var(--ash)' }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4" onClick={() => setShowCreate(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              Nueva Nota Promisoria
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Inversionista *</label>
                <select
                  value={form.investor_id}
                  onChange={e => setForm({ ...form, investor_id: e.target.value })}
                  className="input w-full"
                >
                  <option value="">Seleccionar inversionista...</option>
                  {investors.map(inv => (
                    <option key={inv.id} value={inv.id}>
                      {inv.name} {inv.company ? `(${inv.company})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Monto del Préstamo *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)' }}>$</span>
                  <input
                    type="number"
                    value={form.loan_amount}
                    onChange={e => setForm({ ...form, loan_amount: e.target.value })}
                    className="input pl-8 w-full"
                    placeholder="100,000"
                    min="0"
                    step="1000"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Tasa Anual (%)</label>
                  <input
                    type="number"
                    value={form.annual_rate}
                    onChange={e => setForm({ ...form, annual_rate: e.target.value })}
                    className="input w-full"
                    step="0.5"
                    min="0"
                  />
                </div>
                <div>
                  <label className="label">Plazo (meses)</label>
                  <input
                    type="number"
                    value={form.term_months}
                    onChange={e => setForm({ ...form, term_months: e.target.value })}
                    className="input w-full"
                    min="1"
                  />
                </div>
              </div>
              <div>
                <label className="label">Fecha de Inicio</label>
                <input
                  type="date"
                  value={form.start_date}
                  onChange={e => setForm({ ...form, start_date: e.target.value })}
                  className="input w-full"
                />
              </div>

              {/* Preview — Simple Interest */}
              {form.loan_amount && parseFloat(form.loan_amount) > 0 && (
                <div className="p-4 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                  <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>Vista Previa (interés simple)</p>
                  {(() => {
                    const loan = parseFloat(form.loan_amount)
                    const monthlyRate = parseFloat(form.annual_rate) / 100 / 12
                    const months = parseInt(form.term_months)
                    const monthlyInterest = loan * monthlyRate
                    const totalInterest = monthlyInterest * months
                    const totalDue = loan + totalInterest
                    return (
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span style={{ color: 'var(--ash)' }}>Tasa Mensual:</span>
                          <span className="ml-1 font-medium">{(monthlyRate * 100).toFixed(2)}%</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ash)' }}>Interés/Mes:</span>
                          <span className="ml-1 font-medium" style={{ color: 'var(--gold-700)' }}>{fmt(monthlyInterest)}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ash)' }}>Interés Total:</span>
                          <span className="ml-1 font-medium" style={{ color: 'var(--gold-700)' }}>{fmt(totalInterest)}</span>
                        </div>
                        <div>
                          <span style={{ color: 'var(--ash)' }}>Total a Pagar:</span>
                          <span className="ml-1 font-serif font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(totalDue)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )}

              <div>
                <label className="label">Representante Firmante (Capital)</label>
                <input
                  type="text"
                  value={form.subscriber_representative}
                  onChange={e => setForm({ ...form, subscriber_representative: e.target.value })}
                  className="input w-full"
                  placeholder="Nombre del firmante por Capital"
                />
              </div>
              <div>
                <label className="label">Representante Inversionista</label>
                <input
                  type="text"
                  value={form.lender_representative}
                  onChange={e => setForm({ ...form, lender_representative: e.target.value })}
                  className="input w-full"
                  placeholder="Nombre del firmante por el inversionista"
                />
              </div>
              <div>
                <label className="label">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="input w-full"
                  rows={2}
                  placeholder="Notas adicionales..."
                />
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary flex-1"
              >
                {creating ? 'Creando...' : 'Crear Nota Promisoria'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

