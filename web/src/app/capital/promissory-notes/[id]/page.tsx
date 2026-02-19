'use client'

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileText, DollarSign, Calendar, Clock, User, Landmark,
  CheckCircle2, AlertTriangle, Edit2, Save, X, Download, Printer,
  TrendingUp, CreditCard, Hash, Banknote, Receipt
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Investor {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
}

interface PromissoryNote {
  id: string
  investor_id: string
  loan_amount: number
  annual_rate: number
  monthly_rate: number
  term_months: number
  total_interest: number
  total_due: number
  subscriber_name: string
  subscriber_representative: string | null
  subscriber_address: string | null
  lender_name: string
  lender_company: string | null
  lender_representative: string | null
  start_date: string
  maturity_date: string
  signed_at: string | null
  signed_city: string | null
  signed_state: string | null
  status: string
  paid_amount: number | null
  paid_at: string | null
  default_interest_rate: number
  notes: string | null
  document_url: string | null
  created_at: string
  investors?: Investor | null
}

interface ScheduleRow {
  term: number
  interest: number
  accrued_interest: number
  payment: number
  principal: number
  pending: number
}

interface PaymentRecord {
  id: string
  promissory_note_id: string
  amount: number
  payment_method: string
  reference: string | null
  notes: string | null
  paid_at: string
  recorded_by: string | null
  created_at: string
}

const STATUS_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  draft: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Borrador' },
  active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
  paid: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Pagada' },
  overdue: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Vencida' },
  defaulted: { bg: '#fca5a5', color: '#7f1d1d', label: 'Impago' },
  cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
}

const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'Transferencia Bancaria',
  check: 'Cheque',
  cash: 'Efectivo',
  zelle: 'Zelle',
  wire: 'Wire Transfer',
}

/* ── Months-to-Payoff Calculator ────────────────────────────────────────── */
function PayoffCalculator({ loanAmount, totalInterest, totalDue, paidAmount }: {
  loanAmount: number; totalInterest: number; totalDue: number; paidAmount: number
}) {
  const [monthlyPayment, setMonthlyPayment] = useState('')
  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

  const payment = parseFloat(monthlyPayment) || 0
  const remainingTotal = Math.max(0, totalDue - paidAmount)

  // The total to pay is FIXED (capital + interest already calculated).
  // The question is simply: total ÷ monthly payment = how many months?
  let monthsToPayoff: number | null = null
  let lastMonthPayment = 0
  let message = ''

  if (payment > 0) {
    if (remainingTotal <= 0) {
      message = 'La nota ya está completamente pagada.'
    } else {
      const exactMonths = remainingTotal / payment
      monthsToPayoff = Math.ceil(exactMonths)

      // Last month is partial if it doesn't divide evenly
      const fullMonths = monthsToPayoff - 1
      lastMonthPayment = Math.round((remainingTotal - (fullMonths * payment)) * 100) / 100

      message = `Con ${fmt(payment)}/mes, se liquida en ${monthsToPayoff} meses (${(monthsToPayoff / 12).toFixed(1)} años).`
    }
  }

  return (
    <div className="card-luxury p-6">
      <h3 className="font-serif text-lg mb-1" style={{ color: 'var(--ink)' }}>
        <TrendingUp className="w-4 h-4 inline mr-2" />
        ¿En cuántos meses se paga?
      </h3>
      <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
        El interés y el total a pagar no cambian — solo varía el número de meses.
      </p>

      <div className="flex items-end gap-4 flex-wrap">
        <div className="flex-1 min-w-[200px]">
          <label className="label">Pago Mensual</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)' }}>$</span>
            <input
              type="number"
              value={monthlyPayment}
              onChange={e => setMonthlyPayment(e.target.value)}
              className="input pl-8 w-full"
              placeholder="Ej: 5,000"
              min="0"
              step="100"
            />
          </div>
        </div>

        <div className="text-sm p-3 rounded-lg flex-1 min-w-[200px]" style={{ backgroundColor: 'var(--cream)' }}>
          <div className="flex justify-between">
            <span style={{ color: 'var(--ash)' }}>Capital:</span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>{fmt(loanAmount)}</span>
          </div>
          <div className="flex justify-between mt-1">
            <span style={{ color: 'var(--ash)' }}>Interés (fijo):</span>
            <span className="font-medium" style={{ color: 'var(--gold-700)' }}>{fmt(totalInterest)}</span>
          </div>
          <div className="flex justify-between mt-1 pt-1" style={{ borderTop: '1px solid var(--sand)' }}>
            <span style={{ color: 'var(--ash)' }}>Total a pagar:</span>
            <span className="font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(remainingTotal)}</span>
          </div>
        </div>
      </div>

      {payment > 0 && monthsToPayoff && (
        <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--success-light)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
            {message}
          </p>
          <div className="grid grid-cols-3 gap-4 mt-3 text-sm">
            <div>
              <span style={{ color: 'var(--ash)' }}>Meses:</span>
              <p className="font-serif font-semibold text-lg" style={{ color: 'var(--ink)' }}>{monthsToPayoff}</p>
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>Pago meses 1-{monthsToPayoff - 1}:</span>
              <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{fmt(payment)}</p>
            </div>
            <div>
              <span style={{ color: 'var(--ash)' }}>Último mes:</span>
              <p className="font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(lastMonthPayment)}</p>
            </div>
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--ash)' }}>
            Total pagado = {fmt(remainingTotal)} (el interés y total no cambian, solo el número de meses)
          </p>
        </div>
      )}

      {payment > 0 && remainingTotal <= 0 && (
        <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--success-light)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>{message}</p>
        </div>
      )}
    </div>
  )
}

export default function PromissoryNoteDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const printRef = useRef<HTMLDivElement>(null)

  const [note, setNote] = useState<PromissoryNote | null>(null)
  const [schedule, setSchedule] = useState<ScheduleRow[]>([])
  const [payments, setPayments] = useState<PaymentRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'document' | 'schedule' | 'payments'>('document')

  // Payment
  const [showPayModal, setShowPayModal] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payMethod, setPayMethod] = useState('bank_transfer')
  const [payReference, setPayReference] = useState('')
  const [payNotes, setPayNotes] = useState('')
  const [paying, setPaying] = useState(false)

  // Edit
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({
    annual_rate: '',
    term_months: '',
    notes: '',
    subscriber_representative: '',
    lender_representative: '',
  })

  useEffect(() => { loadNote() }, [id])

  const loadNote = async () => {
    try {
      const res = await fetch(`/api/capital/promissory-notes/${id}`)
      const data = await res.json()
      if (data.ok) {
        setNote(data.note)
        setSchedule(data.schedule || [])
        setPayments(data.payments || [])
        setEditData({
          annual_rate: String(data.note.annual_rate),
          term_months: String(data.note.term_months),
          notes: data.note.notes || '',
          subscriber_representative: data.note.subscriber_representative || '',
          lender_representative: data.note.lender_representative || '',
        })
        // Pre-fill pay amount with remaining
        const paid = Number(data.note.paid_amount || 0)
        setPayAmount(String(Math.max(0, data.note.total_due - paid)))
      }
    } catch (err) {
      console.error('Error loading note:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/capital/promissory-notes/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annual_rate: parseFloat(editData.annual_rate),
          term_months: parseInt(editData.term_months),
          notes: editData.notes || null,
          subscriber_representative: editData.subscriber_representative || null,
          lender_representative: editData.lender_representative || null,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Nota actualizada')
        setEditing(false)
        loadNote()
      } else {
        toast.error(data.detail || 'Error al actualizar')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handlePay = async () => {
    if (!payAmount || parseFloat(payAmount) <= 0) {
      toast.warning('Ingresa un monto válido')
      return
    }
    setPaying(true)
    try {
      const res = await fetch(`/api/capital/promissory-notes/${id}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: parseFloat(payAmount),
          payment_method: payMethod,
          reference: payReference || undefined,
          notes: payNotes || undefined,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message)
        setShowPayModal(false)
        setPayAmount('')
        setPayReference('')
        setPayNotes('')
        setPayMethod('bank_transfer')
        loadNote()
      } else {
        toast.error(data.detail || 'Error al registrar pago')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setPaying(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleExportCSV = () => {
    if (!schedule.length || !note) return
    const headers = ['Month', 'Monthly Interest', 'Accrued Interest', 'Principal', 'Total Owed']
    const rows = schedule.map(r => [r.term, r.interest.toFixed(2), r.accrued_interest.toFixed(2), r.principal.toFixed(2), r.pending.toFixed(2)])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `promissory-note-${note.lender_name.replace(/\s+/g, '-')}-${note.loan_amount}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleExportPaymentsCSV = () => {
    if (!payments.length || !note) return
    const headers = ['Fecha', 'Monto', 'Método', 'Referencia', 'Notas']
    const rows = payments.map(p => [
      new Date(p.paid_at).toLocaleDateString('es-MX'),
      p.amount.toFixed(2),
      PAYMENT_METHODS[p.payment_method] || p.payment_method,
      p.reference || '',
      p.notes || '',
    ])
    const csv = [headers.join(','), ...rows.map(r => r.map(c => `"${c}"`).join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagos-nota-${note.lender_name.replace(/\s+/g, '-')}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

  const fmtDate = (d: string, full = false) =>
    new Date(d).toLocaleDateString('en-US', {
      day: 'numeric',
      month: full ? 'long' : 'short',
      year: 'numeric',
    })

  const numberToWords = (n: number): string => {
    const intPart = Math.floor(n)
    return new Intl.NumberFormat('en-US', { style: 'decimal', maximumFractionDigits: 0 }).format(intPart)
      .replace(/,/g, ',') + ' 00/100 UNITED STATES DOLLARS'
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!note) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Nota promisoria no encontrada</div>
  }

  const s = STATUS_STYLES[note.status] || STATUS_STYLES.active
  const paidAmount = Number(note.paid_amount || 0)
  const remaining = Math.max(0, note.total_due - paidAmount)
  const paidPct = note.total_due > 0 ? (paidAmount / note.total_due * 100) : 0
  const daysToMaturity = Math.ceil((new Date(note.maturity_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Back */}
      <button onClick={() => router.push('/capital/promissory-notes')} className="btn-ghost btn-sm print:hidden">
        <ArrowLeft className="w-4 h-4" /> Volver a Notas Promisorias
      </button>

      {/* Header */}
      <div className="card-luxury p-6 print:hidden">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-100)' }}>
              <FileText className="w-7 h-7" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div>
              <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
                {fmt(note.loan_amount)}
              </h1>
              <div className="flex items-center gap-3 mt-1 text-sm" style={{ color: 'var(--slate)' }}>
                <span className="flex items-center gap-1">
                  <User className="w-3.5 h-3.5" /> {note.investors?.name || note.lender_name}
                </span>
                {note.investors?.company && (
                  <span className="flex items-center gap-1">
                    <Landmark className="w-3.5 h-3.5" /> {note.investors.company}
                  </span>
                )}
                <span>{note.annual_rate}% · {note.term_months} meses</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
            {daysToMaturity > 0 && note.status === 'active' && (
              <span className="badge text-xs" style={{
                backgroundColor: daysToMaturity <= 30 ? 'var(--warning-light)' : 'var(--cream)',
                color: daysToMaturity <= 30 ? 'var(--warning)' : 'var(--slate)',
              }}>
                <Clock className="w-3 h-3 mr-1" /> {daysToMaturity}d para vencimiento
              </span>
            )}
            {daysToMaturity < 0 && note.status === 'active' && (
              <span className="badge text-xs" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>
                <AlertTriangle className="w-3 h-3 mr-1" /> Vencida hace {Math.abs(daysToMaturity)}d
              </span>
            )}
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-5 pt-5" style={{ borderTop: '1px solid var(--sand)' }}>
          {[
            { label: 'Préstamo', value: fmt(note.loan_amount), color: 'var(--ink)' },
            { label: 'Interés Total', value: fmt(note.total_interest), color: 'var(--gold-700)' },
            { label: 'Total al Vencimiento', value: fmt(note.total_due), color: 'var(--navy-800)' },
            { label: 'Pagado', value: fmt(paidAmount), color: 'var(--success)' },
            { label: 'Pendiente', value: fmt(remaining), color: remaining > 0 ? 'var(--error)' : 'var(--success)' },
          ].map(kpi => (
            <div key={kpi.label}>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>{kpi.label}</p>
              <p className="font-serif font-semibold" style={{ color: kpi.color }}>{kpi.value}</p>
            </div>
          ))}
        </div>

        {/* Progress */}
        {note.status !== 'draft' && (
          <div className="mt-4">
            <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--ash)' }}>
              <span>Pagado: {paidPct.toFixed(1)}%</span>
              <span>{fmt(paidAmount)} / {fmt(note.total_due)}</span>
            </div>
            <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(100, paidPct)}%`,
                  backgroundColor: paidPct >= 100 ? 'var(--success)' : 'var(--gold-600)',
                }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-4 flex-wrap">
          {note.status === 'active' && remaining > 0 && (
            <button onClick={() => setShowPayModal(true)} className="btn-primary btn-sm">
              <CreditCard className="w-4 h-4" /> Registrar Pago
            </button>
          )}
          <button onClick={handlePrint} className="btn-ghost btn-sm">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
          <button onClick={handleExportCSV} className="btn-ghost btn-sm">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
          {!editing && note.status !== 'paid' && (
            <button onClick={() => setEditing(true)} className="btn-ghost btn-sm">
              <Edit2 className="w-4 h-4" /> Editar
            </button>
          )}
        </div>
      </div>

      {/* Edit Panel */}
      {editing && (
        <div className="card-luxury p-6 print:hidden">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Editar Nota</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Tasa Anual (%)</label>
              <input type="number" value={editData.annual_rate} onChange={e => setEditData({ ...editData, annual_rate: e.target.value })} className="input w-full" step="0.5" />
            </div>
            <div>
              <label className="label">Plazo (meses)</label>
              <input type="number" value={editData.term_months} onChange={e => setEditData({ ...editData, term_months: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label className="label">Representante Capital</label>
              <input type="text" value={editData.subscriber_representative} onChange={e => setEditData({ ...editData, subscriber_representative: e.target.value })} className="input w-full" />
            </div>
            <div>
              <label className="label">Representante Inversionista</label>
              <input type="text" value={editData.lender_representative} onChange={e => setEditData({ ...editData, lender_representative: e.target.value })} className="input w-full" />
            </div>
            <div className="col-span-2">
              <label className="label">Notas</label>
              <textarea value={editData.notes} onChange={e => setEditData({ ...editData, notes: e.target.value })} className="input w-full" rows={2} />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={handleSave} className="btn-primary btn-sm">
              <Save className="w-4 h-4" /> Guardar
            </button>
            <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">
              <X className="w-4 h-4" /> Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 print:hidden" style={{ borderBottom: '1px solid var(--sand)' }}>
        {[
          { key: 'document' as const, label: 'Documento', icon: FileText },
          { key: 'schedule' as const, label: 'Tabla de Intereses', icon: Hash },
          { key: 'payments' as const, label: `Pagos (${payments.length})`, icon: CreditCard },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className="px-4 py-2.5 text-sm font-medium flex items-center gap-2 border-b-2 transition-colors"
            style={{
              borderColor: activeTab === tab.key ? 'var(--gold-600)' : 'transparent',
              color: activeTab === tab.key ? 'var(--gold-700)' : 'var(--slate)',
            }}
          >
            <tab.icon className="w-4 h-4" /> {tab.label}
          </button>
        ))}
      </div>

      {/* TAB: Document View */}
      {activeTab === 'document' && (
        <div ref={printRef} className="card-luxury p-8 print:shadow-none print:border-none" style={{ maxWidth: 800, margin: '0 auto' }}>
          {/* Header — Maninos Capital + Phoenician Boat */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-3 mb-2">
              {/* Phoenician Boat SVG */}
              <svg width="44" height="32" viewBox="0 0 60 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <polygon points="5,12 15,4 45,4 55,12 50,16 10,16" fill="#1a2744" />
                <polygon points="30,16 30,38 48,20" fill="#d4a853" stroke="#1a2744" strokeWidth="0.5" />
                <line x1="30" y1="16" x2="30" y2="38" stroke="#1a2744" strokeWidth="1.5" />
              </svg>
              <span className="font-serif text-lg" style={{ color: 'var(--navy-800)' }}>maninos capital</span>
            </div>
            <h2 className="font-serif text-xl font-bold tracking-wide" style={{ color: 'var(--ink)' }}>
              PROMISSORY NOTE
            </h2>
          </div>

          {/* Value */}
          <div className="text-right mb-4">
            <span className="text-sm" style={{ color: 'var(--slate)' }}>Value: </span>
            <span className="font-serif text-xl font-bold" style={{ color: 'var(--ink)' }}>{fmt(note.loan_amount)} USD</span>
          </div>

          {/* Preamble */}
          <div className="text-sm leading-relaxed mb-6" style={{ color: 'var(--charcoal)' }}>
            <p>
              In {note.signed_city || 'Conroe'}, {note.signed_state || 'Texas'} on{' '}
              <strong>{note.signed_at ? fmtDate(note.signed_at, true) : fmtDate(note.start_date, true)}</strong>.
            </p>
            <p className="mt-2">
              As {note.subscriber_name} representative,{' '}
              <strong>{note.subscriber_representative || 'BENJAMIN SEBASTIAN GONZALEZ ZAMBRANO'}</strong>{' '}
              (the Subscriber) I unconditionally bind myself to pay{' '}
              <strong>{note.lender_name}</strong>, the amount of {fmt(note.loan_amount)} (
              {numberToWords(note.loan_amount)}), plus simple (non-accumulative) interest, which will be paid as follows:
            </p>
          </div>

          {/* Terms Box */}
          <div className="mb-6 inline-block">
            <table className="text-sm" style={{ borderCollapse: 'collapse' }}>
              <tbody>
                {[
                  ['Loan', fmt(note.loan_amount)],
                  ['Annual rate (simple)', `${note.annual_rate}%`],
                  ['Monthly rate', `${(note.monthly_rate * 100).toFixed(2)}%`],
                  ['Monthly interest', fmt(note.loan_amount * note.monthly_rate)],
                  ['Months', String(note.term_months)],
                  ['Total interest', fmt(note.total_interest)],
                  ['Total due', fmt(note.total_due)],
                ].map(([label, value]) => (
                  <tr key={label}>
                    <td className="py-1 pr-6 font-medium" style={{ color: 'var(--charcoal)', borderBottom: '1px solid var(--sand)' }}>{label}</td>
                    <td className="py-1 pl-4 text-right font-semibold" style={{ color: 'var(--ink)', borderBottom: '1px solid var(--sand)' }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Schedule Table — Simple Interest */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--cream)' }}>
                  {['Month', 'Monthly Interest', 'Accrued Interest', 'Principal', 'Total Owed'].map(h => (
                    <th key={h} className="py-2 px-3 text-center font-semibold text-xs" style={{ color: 'var(--charcoal)', borderBottom: '2px solid var(--sand)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {schedule.map(row => (
                  <tr key={row.term} style={{ borderBottom: '1px solid var(--sand)' }}>
                    <td className="py-1.5 px-3 text-center font-medium" style={{ color: 'var(--charcoal)' }}>{row.term}</td>
                    <td className="py-1.5 px-3 text-right" style={{ color: row.interest > 0 ? 'var(--gold-700)' : 'var(--ash)' }}>
                      {row.interest > 0 ? `$ ${row.interest.toLocaleString('en-US', { minimumFractionDigits: 2 })}` : '$ -'}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--charcoal)' }}>
                      $ {row.accrued_interest.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 px-3 text-right" style={{ color: 'var(--charcoal)' }}>
                      $ {row.principal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="py-1.5 px-3 text-right font-medium" style={{ color: 'var(--navy-800)' }}>
                      $ {row.pending.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Simple interest note */}
          <div className="text-xs mb-6 px-2" style={{ color: 'var(--ash)' }}>
            <p><em>
              Simple interest: {fmt(note.loan_amount)} × {(note.monthly_rate * 100).toFixed(2)}%/month = {fmt(note.loan_amount * note.monthly_rate)}/month.
              Interest does not compound — it is always calculated on the original principal.
              Payments are flexible and may be made at any time.
            </em></p>
          </div>

          {/* Legal Text */}
          <div className="text-xs leading-relaxed space-y-3 mb-8" style={{ color: 'var(--charcoal)' }}>
            <p>
              The Subscriber unconditionally agrees to pay, if applicable, default interest in accordance with the following:
            </p>
            <p>
              <strong>1. Default interest.</strong> The Subscriber expressly and irrevocably acknowledges that in the event of default
              in the timely and total payment of the amounts established in this Promissory Note, the unpaid amount will cause
              default interest from the due date and until the day it is fully paid, payable to sight, at the annual rate of{' '}
              <strong>{note.default_interest_rate}%</strong> ({note.default_interest_rate === 12 ? 'twelve' : note.default_interest_rate}) percent.
            </p>
            <p>
              Default interest will be calculated on unpaid balances and based on a year of three hundred and sixty five days
              and days elapsed. If the payment date corresponds to a day that is not a business day, the Subscriber may make
              payment free of charge immediately following business day. This promissory note shall be construed in accordance
              with the laws of the United States of America. The Subscriber submits to the jurisdiction and competence of the
              Courts of the city of The Woodlands, Texas, expressly waiving any other jurisdiction to which he is entitled or
              may have it in the future, by virtue of his domicile or for any other reason. The Subscriber designates the
              following as his address to be required for payment:
            </p>
            <p className="font-bold">{note.subscriber_address || '15891 Old Houston Rd, Conroe, Tx. Zip Code 77302'}</p>
            <p>
              This promissory note is signed and delivered in the city of {note.signed_city || 'Conroe'},{' '}
              {note.signed_state || 'Texas'} on{' '}
              <strong>{note.signed_at ? fmtDate(note.signed_at, true) : fmtDate(note.start_date, true)}</strong>.
            </p>
          </div>

          {/* Signatures */}
          <div className="grid grid-cols-2 gap-8 mt-12 pt-8" style={{ borderTop: '1px solid var(--sand)' }}>
            <div className="text-center">
              <div className="border-b pb-2 mb-2" style={{ borderColor: 'var(--charcoal)' }}>
                <span className="text-sm" style={{ color: 'var(--slate)' }}>Signature</span>
              </div>
              <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
                {note.subscriber_representative || 'BENJAMIN SEBASTIAN GONZALEZ ZAMBRANO'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{note.subscriber_name} Representative</p>
            </div>
            <div className="text-center">
              <div className="border-b pb-2 mb-2" style={{ borderColor: 'var(--charcoal)' }}>
                <span className="text-sm" style={{ color: 'var(--slate)' }}>Signature</span>
              </div>
              <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>
                {note.lender_representative || note.lender_name}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                {note.lender_company || ''} {note.lender_company ? 'Representative' : ''}
              </p>
              <p className="text-xs font-semibold mt-1" style={{ color: 'var(--ink)' }}>Joint and Several Obligor</p>
            </div>
          </div>
        </div>
      )}

      {/* TAB: Schedule — Simple Interest */}
      {activeTab === 'schedule' && (() => {
        const monthlyInt = note.loan_amount * note.monthly_rate

        // ── Payment-status helpers ──────────────────────────────────
        // Cumulative obligation at month M:
        //   • M = 0 → 0 (no payment due yet, just disbursement)
        //   • 1 ≤ M < term_months → M × monthlyInterest (interest-only)
        //   • M = term_months → total_due (principal + all interest)
        const cumulativeObligation = (m: number) => {
          if (m <= 0) return 0
          if (m < note.term_months) return m * monthlyInt
          return note.total_due // final month: everything due
        }

        type RowStatus = 'paid' | 'partial' | 'pending' | 'neutral'
        const rowStatus = (m: number): RowStatus => {
          if (m === 0) return 'neutral'
          const obligation = cumulativeObligation(m)
          const prevObligation = cumulativeObligation(m - 1)
          if (paidAmount >= obligation) return 'paid'
          if (paidAmount > prevObligation) return 'partial'
          return 'pending'
        }

        const statusStyle = (st: RowStatus) => {
          switch (st) {
            case 'paid':    return { bg: 'var(--sand)', color: 'var(--ash)', opacity: 0.75, icon: '✓' }
            case 'partial': return { bg: 'var(--warning-light)', color: 'var(--charcoal)', opacity: 1, icon: '◐' }
            case 'pending': return { bg: 'transparent', color: 'var(--error)', opacity: 1, icon: '○' }
            default:        return { bg: 'transparent', color: 'var(--charcoal)', opacity: 1, icon: '' }
          }
        }

        // How many months fully covered
        const monthsPaid = monthlyInt > 0
          ? Math.min(note.term_months, Math.floor(paidAmount / monthlyInt))
          : 0
        const monthsRemaining = note.term_months - monthsPaid

        return (
        <div className="space-y-6">
          <div className="card-luxury overflow-hidden">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                Tabla de Interés Simple
              </h3>
              <button onClick={handleExportCSV} className="btn-ghost btn-sm">
                <Download className="w-4 h-4" /> CSV
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4 p-5" style={{ borderBottom: '1px solid var(--sand)' }}>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Préstamo</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--ink)' }}>{fmt(note.loan_amount)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Tasa Anual (simple)</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--charcoal)' }}>{note.annual_rate}%</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Interés Mensual</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(monthlyInt)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Interés Total</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--gold-700)' }}>{fmt(note.total_interest)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Total a Pagar</p>
                <p className="font-serif font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</p>
              </div>
              <div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>Meses Pagados</p>
                <p className="font-serif font-semibold" style={{ color: monthsPaid >= note.term_months ? 'var(--success)' : 'var(--charcoal)' }}>
                  {monthsPaid} / {note.term_months}
                </p>
              </div>
            </div>

            {/* Payment-status legend */}
            <div className="flex items-center gap-5 px-5 py-3" style={{ borderBottom: '1px solid var(--sand)', backgroundColor: 'var(--cream)' }}>
              <span className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Estado:</span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--sand)' }} />
                <span style={{ color: 'var(--ash)' }}>Pagado</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: 'var(--warning-light)', border: '1px solid var(--warning)' }} />
                <span style={{ color: 'var(--charcoal)' }}>Pago parcial</span>
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span className="inline-block w-3 h-3 rounded-sm" style={{ border: '1px solid var(--error)' }} />
                <span style={{ color: 'var(--error)' }}>Pendiente</span>
              </span>
            </div>

            {/* Overpayment / ahead banner */}
            {monthsPaid > 0 && monthsRemaining > 0 && (
              <div className="px-5 py-3 text-sm flex items-center gap-2" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                <CheckCircle2 className="w-4 h-4" />
                <span>
                  <strong>{monthsPaid} {monthsPaid === 1 ? 'mes' : 'meses'}</strong> de interés cubiertos.
                  {monthsRemaining > 0 && <> Faltan <strong>{monthsRemaining} {monthsRemaining === 1 ? 'mes' : 'meses'}</strong> + principal.</>}
                </span>
              </div>
            )}
            {paidAmount >= note.total_due && (
              <div className="px-5 py-3 text-sm flex items-center gap-2" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                <CheckCircle2 className="w-4 h-4" />
                <strong>Nota completamente pagada</strong>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="table w-full">
                <thead>
                  <tr>
                    <th className="text-center" style={{ width: 50 }}></th>
                    <th className="text-center">Mes</th>
                    <th className="text-right">Interés Mensual</th>
                    <th className="text-right">Interés Acumulado</th>
                    <th className="text-right">Principal</th>
                    <th className="text-right">Total Adeudado</th>
                  </tr>
                </thead>
                <tbody>
                  {schedule.map(row => {
                    const st = rowStatus(row.term)
                    const sty = statusStyle(st)
                    return (
                    <tr
                      key={row.term}
                      className={row.term === note.term_months ? 'font-semibold' : ''}
                      style={{
                        backgroundColor: sty.bg,
                        opacity: sty.opacity,
                        transition: 'background-color 0.2s',
                      }}
                    >
                      <td className="text-center text-sm" style={{ color: sty.color }}>
                        {sty.icon}
                      </td>
                      <td className="text-center" style={{ color: st === 'paid' ? 'var(--ash)' : 'var(--charcoal)' }}>
                        {row.term}
                      </td>
                      <td className="text-right" style={{ color: st === 'paid' ? 'var(--ash)' : row.interest > 0 ? 'var(--gold-700)' : 'var(--ash)' }}>
                        {row.interest > 0 ? fmt(row.interest) : '—'}
                      </td>
                      <td className="text-right" style={{ color: st === 'paid' ? 'var(--ash)' : 'var(--charcoal)' }}>
                        {fmt(row.accrued_interest)}
                      </td>
                      <td className="text-right" style={{ color: st === 'paid' ? 'var(--ash)' : 'var(--charcoal)' }}>
                        {fmt(row.principal)}
                      </td>
                      <td className="text-right" style={{ color: st === 'paid' ? 'var(--ash)' : st === 'pending' ? 'var(--error)' : 'var(--navy-800)' }}>
                        {fmt(row.pending)}
                      </td>
                    </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Formula explanation */}
            <div className="p-5" style={{ borderTop: '1px solid var(--sand)', backgroundColor: 'var(--cream)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--slate)' }}>Fórmula (interés simple):</p>
              <p className="text-xs font-mono" style={{ color: 'var(--charcoal)' }}>
                Interés mensual = Principal × Tasa mensual = {fmt(note.loan_amount)} × {(note.monthly_rate * 100).toFixed(4)}% = {fmt(monthlyInt)}
              </p>
              <p className="text-xs font-mono mt-1" style={{ color: 'var(--charcoal)' }}>
                Total = Principal + (Interés mensual × meses) = {fmt(note.loan_amount)} + ({fmt(monthlyInt)} × {note.term_months}) = {fmt(note.total_due)}
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>
                Interés simple no acumulativo — el interés siempre se calcula sobre el principal original.
                Los pagos son flexibles: mensuales, parciales, o de golpe.
                <br />
                <strong>Colores:</strong> Gris = pagado · Rojo = pendiente. Si se paga más de lo acordado mensualmente, los meses cubiertos se actualizan automáticamente.
              </p>
            </div>
          </div>

          {/* Months-to-Payoff Calculator */}
          <PayoffCalculator loanAmount={note.loan_amount} totalInterest={note.total_interest} totalDue={note.total_due} paidAmount={paidAmount} />
        </div>
        )
      })()}

      {/* TAB: Payments (#4 - Individual payment history) */}
      {activeTab === 'payments' && (() => {
        const monthlyInt = note.loan_amount * note.monthly_rate
        const monthsPaidInterest = monthlyInt > 0 ? Math.min(note.term_months, Math.floor(paidAmount / monthlyInt)) : 0
        const monthsRemainInterest = note.term_months - monthsPaidInterest

        return (
        <div className="space-y-6">
          {/* Payment Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="card-luxury p-4 text-center">
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Total a Pagar</p>
              <p className="font-serif text-lg font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</p>
            </div>
            <div className="card-luxury p-4 text-center">
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Pagado</p>
              <p className="font-serif text-lg font-semibold" style={{ color: 'var(--success)' }}>{fmt(paidAmount)}</p>
            </div>
            <div className="card-luxury p-4 text-center">
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Pendiente</p>
              <p className="font-serif text-lg font-semibold" style={{ color: remaining > 0 ? 'var(--error)' : 'var(--success)' }}>{fmt(remaining)}</p>
            </div>
            <div className="card-luxury p-4 text-center">
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Meses Cubiertos</p>
              <p className="font-serif text-lg font-semibold" style={{ color: monthsPaidInterest >= note.term_months ? 'var(--success)' : 'var(--charcoal)' }}>
                {monthsPaidInterest} / {note.term_months}
              </p>
              {monthsRemainInterest > 0 && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--error)' }}>Faltan {monthsRemainInterest}</p>
              )}
            </div>
          </div>

          {/* Status timeline */}
          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Línea de Tiempo</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-light)' }}>
                  <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--success)' }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Nota creada</p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmtDate(note.start_date, true)}</p>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center"
                     style={{ backgroundColor: note.status === 'paid' ? 'var(--success-light)' : daysToMaturity < 0 ? 'var(--error-light)' : 'var(--cream)' }}>
                  <Calendar className="w-4 h-4" style={{
                    color: note.status === 'paid' ? 'var(--success)' : daysToMaturity < 0 ? 'var(--error)' : 'var(--slate)',
                  }} />
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                    Vencimiento: {fmtDate(note.maturity_date, true)}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    {daysToMaturity > 0 ? `En ${daysToMaturity} días` : daysToMaturity < 0 ? `Hace ${Math.abs(daysToMaturity)} días` : 'Hoy'}
                  </p>
                </div>
              </div>

              {note.paid_at && (
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: 'var(--success-light)' }}>
                    <DollarSign className="w-4 h-4" style={{ color: 'var(--success)' }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--success)' }}>
                      Pagada completamente: {fmt(paidAmount)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      {fmtDate(note.paid_at, true)}
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Individual Payment Records */}
          <div className="card-luxury">
            <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                <Receipt className="w-4 h-4 inline mr-2" />
                Historial de Pagos ({payments.length})
              </h3>
              <div className="flex gap-2">
                {payments.length > 0 && (
                  <button onClick={handleExportPaymentsCSV} className="btn-ghost btn-sm">
                    <Download className="w-4 h-4" /> CSV
                  </button>
                )}
                {note.status === 'active' && remaining > 0 && (
                  <button onClick={() => setShowPayModal(true)} className="btn-primary btn-sm">
                    <CreditCard className="w-4 h-4" /> Registrar Pago
                  </button>
                )}
              </div>
            </div>

            {payments.length === 0 ? (
              <div className="p-8 text-center" style={{ color: 'var(--ash)' }}>
                <Banknote className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>No hay pagos registrados</p>
                {note.status === 'active' && remaining > 0 && (
                  <button onClick={() => setShowPayModal(true)} className="btn-ghost btn-sm mt-3">
                    <CreditCard className="w-4 h-4" /> Registrar primer pago
                  </button>
                )}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table w-full">
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th className="text-right">Monto</th>
                      <th>Método</th>
                      <th>Referencia</th>
                      <th>Notas</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map(p => (
                      <tr key={p.id}>
                        <td className="text-sm">
                          {new Date(p.paid_at).toLocaleDateString('es-MX', {
                            day: 'numeric', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit',
                          })}
                        </td>
                        <td className="text-right font-semibold" style={{ color: 'var(--success)' }}>
                          {fmt(p.amount)}
                        </td>
                        <td>
                          <span className="badge text-xs" style={{ backgroundColor: 'var(--cream)', color: 'var(--charcoal)' }}>
                            {PAYMENT_METHODS[p.payment_method] || p.payment_method}
                          </span>
                        </td>
                        <td className="text-sm" style={{ color: 'var(--slate)' }}>
                          {p.reference || '—'}
                        </td>
                        <td className="text-xs max-w-[200px] truncate" style={{ color: 'var(--ash)' }}>
                          {p.notes || '—'}
                        </td>
                      </tr>
                    ))}
                    {/* Total row */}
                    <tr style={{ borderTop: '2px solid var(--sand)' }}>
                      <td className="font-semibold" style={{ color: 'var(--ink)' }}>Total</td>
                      <td className="text-right font-serif font-semibold" style={{ color: 'var(--success)' }}>
                        {fmt(payments.reduce((s, p) => s + p.amount, 0))}
                      </td>
                      <td colSpan={3}></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
        )
      })()}

      {/* Notes */}
      {note.notes && (
        <div className="card-luxury p-5 print:hidden">
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--slate)' }}>Notas</h3>
          <p className="text-sm" style={{ color: 'var(--charcoal)' }}>{note.notes}</p>
        </div>
      )}

      {/* Pay Modal — Flexible payments */}
      {showPayModal && (() => {
        const monthlyInt = note.loan_amount * note.monthly_rate
        // Calculate months of interest already covered
        const monthsAlreadyPaid = monthlyInt > 0 ? Math.floor(paidAmount / monthlyInt) : 0
        const monthsLeft = Math.max(0, note.term_months - monthsAlreadyPaid)

        // Build smart presets
        const presets: { label: string; amount: number }[] = []
        if (monthlyInt > 0 && remaining > monthlyInt) {
          presets.push({ label: '1 mes de interés', amount: monthlyInt })
        }
        if (monthlyInt > 0 && remaining > monthlyInt * 3 && monthsLeft >= 3) {
          presets.push({ label: '3 meses de interés', amount: monthlyInt * 3 })
        }
        if (monthlyInt > 0 && remaining > monthlyInt * 6 && monthsLeft >= 6) {
          presets.push({ label: '6 meses de interés', amount: monthlyInt * 6 })
        }
        if (monthlyInt > 0 && monthsLeft > 0) {
          const allRemainingInterest = monthlyInt * monthsLeft
          if (allRemainingInterest < remaining && allRemainingInterest > 0) {
            presets.push({ label: `Todo interés restante (${monthsLeft}m)`, amount: allRemainingInterest })
          }
        }
        presets.push({ label: 'Liquidar todo', amount: remaining })
        const paymentPresets = presets

        return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20 p-4" onClick={() => setShowPayModal(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Registrar Pago</h3>
            <div className="space-y-4">
              <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: 'var(--slate)' }}>Total adeudado:</span>
                  <span className="font-semibold" style={{ color: 'var(--navy-800)' }}>{fmt(note.total_due)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span style={{ color: 'var(--slate)' }}>Ya pagado:</span>
                  <span className="font-semibold" style={{ color: 'var(--success)' }}>{fmt(paidAmount)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1 pt-1" style={{ borderTop: '1px solid var(--sand)' }}>
                  <span style={{ color: 'var(--slate)' }}>Pendiente:</span>
                  <span className="font-semibold" style={{ color: 'var(--error)' }}>{fmt(remaining)}</span>
                </div>
                <div className="flex justify-between text-sm mt-1">
                  <span style={{ color: 'var(--slate)' }}>Interés mensual:</span>
                  <span className="font-medium" style={{ color: 'var(--gold-700)' }}>{fmt(monthlyInt)}</span>
                </div>
              </div>

              {/* Quick presets */}
              <div>
                <label className="label mb-2">Opciones rápidas</label>
                <div className="flex flex-wrap gap-2">
                  {paymentPresets.map(preset => (
                    <button
                      key={preset.label}
                      onClick={() => setPayAmount(String(Math.round(preset.amount * 100) / 100))}
                      className="px-3 py-1.5 rounded-full text-xs font-medium transition-colors"
                      style={{
                        backgroundColor: parseFloat(payAmount) === Math.round(preset.amount * 100) / 100 ? 'var(--navy-800)' : 'var(--cream)',
                        color: parseFloat(payAmount) === Math.round(preset.amount * 100) / 100 ? 'white' : 'var(--charcoal)',
                      }}
                    >
                      {preset.label}: {fmt(preset.amount)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="label">Monto del Pago *</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--slate)' }}>$</span>
                  <input
                    type="number"
                    value={payAmount}
                    onChange={e => setPayAmount(e.target.value)}
                    className="input pl-8 w-full"
                    min="0"
                    step="0.01"
                  />
                </div>
                <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                  Puedes pagar cualquier monto: solo interés, abono parcial, o liquidar todo.
                </p>
              </div>
              <div>
                <label className="label">Método de Pago</label>
                <select
                  value={payMethod}
                  onChange={e => setPayMethod(e.target.value)}
                  className="input w-full"
                >
                  <option value="bank_transfer">Transferencia Bancaria</option>
                  <option value="zelle">Zelle</option>
                  <option value="wire">Wire Transfer</option>
                  <option value="check">Cheque</option>
                  <option value="cash">Efectivo</option>
                </select>
              </div>
              <div>
                <label className="label">Referencia / # Transacción</label>
                <input
                  type="text"
                  value={payReference}
                  onChange={e => setPayReference(e.target.value)}
                  className="input w-full"
                  placeholder="Número de referencia bancaria..."
                />
              </div>
              <div>
                <label className="label">Notas</label>
                <input
                  type="text"
                  value={payNotes}
                  onChange={e => setPayNotes(e.target.value)}
                  className="input w-full"
                  placeholder="Ej: Pago mensual febrero, Liquidación total, etc."
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={handlePay} disabled={paying} className="btn-primary flex-1">
                  {paying ? 'Registrando...' : 'Confirmar Pago'}
                </button>
                <button onClick={() => setShowPayModal(false)} className="btn-secondary">Cancelar</button>
              </div>
            </div>
          </div>
        </div>
        )
      })()}

      {/* Metadata */}
      <div className="text-xs text-center py-2 print:hidden" style={{ color: 'var(--ash)' }}>
        Nota creada el {fmtDate(note.created_at, true)}
        {note.signed_at && ` · Firmada: ${fmtDate(note.signed_at, true)}`}
      </div>
    </div>
  )
}
