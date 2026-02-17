'use client'

export const dynamic = 'force-dynamic'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  CreditCard, DollarSign, AlertTriangle, CheckCircle2, 
  Clock, Filter, Calendar, User, Shield, ChevronRight,
  Phone, XCircle, Coins, Plus
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Payment {
  id: string
  payment_number: number
  amount: number
  due_date: string
  paid_date: string | null
  paid_amount: number | null
  payment_method: string | null
  payment_reference: string | null
  status: string
  late_fee_amount: number
  days_late: number
  notes: string | null
  rto_contracts?: {
    id: string
    client_id: string
    property_id: string
    monthly_rent: number
    clients?: { name: string; email: string; phone: string }
    properties?: { address: string; city: string }
  }
  calculated_late_fee?: number
  past_grace_period?: boolean
}

interface MoraClient {
  client_id: string
  client_name: string
  client_email: string | null
  client_phone: string | null
  property_address: string
  property_city: string | null
  contract_id: string
  monthly_rent: number
  overdue_payments: number
  total_overdue: number
  total_late_fees: number
  max_days_late: number
  risk_level: string
}

interface MoraSummary {
  clients_in_mora: MoraClient[]
  total_clients: number
  total_overdue_payments: number
  total_overdue_amount: number
  total_late_fees: number
}

interface Commission {
  id: string
  rto_contract_id: string
  amount: number
  commission_type: string
  status: string
  paid_at: string | null
  notes: string | null
  created_by: string | null
  created_at: string
  client_name?: string
  property_address?: string
}

export default function PaymentsPage() {
  const searchParams = useSearchParams()
  const toast = useToast()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'all' | 'overdue' | 'mora' | 'commissions'>(
    searchParams.get('filter') === 'overdue' ? 'overdue' : 'all'
  )
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [moraSummary, setMoraSummary] = useState<MoraSummary | null>(null)
  const [commissions, setCommissions] = useState<Commission[]>([])
  const [commissionsLoading, setCommissionsLoading] = useState(false)
  
  // Record payment modal
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [expectedAmount, setExpectedAmount] = useState<number>(0) // scheduled amount for placeholder
  const [paymentMethod, setPaymentMethod] = useState('zelle')
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recording, setRecording] = useState(false)

  useEffect(() => { 
    // Auto-update statuses on page load
    fetch('/api/capital/payments/update-statuses', { method: 'POST' }).catch(() => {})
    loadPayments()
    loadMoraSummary()
    if (view === 'commissions') loadCommissions()
  }, [view, statusFilter])

  const recordId = searchParams.get('record')
  useEffect(() => {
    if (recordId) setRecordingId(recordId)
  }, [recordId])

  const loadPayments = async () => {
    setLoading(true)
    try {
      let url: string
      if (view === 'overdue') {
        url = `/api/capital/payments/overdue`
      } else if (view === 'mora') {
        // Mora view uses separate component
        setLoading(false)
        return
      } else {
        const params = statusFilter ? `?status=${statusFilter}` : ''
        url = `/api/capital/payments${params}`
      }
      
      const res = await fetch(url)
      const data = await res.json()
      
      if (view === 'overdue') {
        setPayments(data.overdue_payments || [])
      } else {
        setPayments(data.payments || [])
      }
    } catch (err) {
      console.error('Error loading payments:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadCommissions = async () => {
    setCommissionsLoading(true)
    try {
      const res = await fetch('/api/capital/payments/commissions')
      const data = await res.json()
      if (data.ok) setCommissions(data.commissions || [])
    } catch (err) {
      console.error('Error loading commissions:', err)
    } finally {
      setCommissionsLoading(false)
    }
  }

  const loadMoraSummary = async () => {
    try {
      const res = await fetch('/api/capital/payments/mora-summary')
      const data = await res.json()
      if (data.ok) setMoraSummary(data)
    } catch (err) {
      console.error('Error loading mora summary:', err)
    }
  }

  const handleRecordPayment = async () => {
    if (!recordingId) return
    const finalAmount = paidAmount ? parseFloat(paidAmount) : expectedAmount
    if (!finalAmount || finalAmount <= 0) {
      toast.warning('Ingresa el monto pagado')
      return
    }
    setRecording(true)
    try {
      const res = await fetch(`/api/capital/payments/${recordingId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payment_method: paymentMethod,
          paid_amount: finalAmount,
          payment_reference: paymentRef || undefined,
          notes: paymentNotes || undefined,
        })
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message)
        setRecordingId(null)
        setPaidAmount('')
        setPaymentRef('')
        setPaymentNotes('')
        loadPayments()
        loadMoraSummary()
        
        if (data.contract_completed) {
          toast.success('🎉 ¡Contrato completado! Proceder a transferencia de título.')
        }
      } else {
        toast.error(data.detail || 'Error al registrar pago')
      }
    } catch (err) {
      toast.error('Error al registrar pago')
    } finally {
      setRecording(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    scheduled: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Programado' },
    pending: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    paid: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Pagado' },
    late: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Atrasado' },
    partial: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Parcial' },
    waived: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Exonerado' },
    failed: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Fallido' },
  }

  const riskColors: Record<string, string> = {
    critical: '#991b1b',
    high: '#ef4444',
    medium: '#f97316',
    low: '#fbbf24',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Gestión de Pagos</h1>
          <p style={{ color: 'var(--slate)' }}>Cobros mensuales, morosidad y seguimiento</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
            <button 
              onClick={() => setView('all')}
              className={`px-4 py-2 text-sm font-medium transition-colors`}
              style={{ backgroundColor: view === 'all' ? 'var(--navy-800)' : 'var(--white)', color: view === 'all' ? 'white' : 'var(--slate)' }}
            >Todos</button>
            <button 
              onClick={() => setView('overdue')}
              className={`px-4 py-2 text-sm font-medium transition-colors`}
              style={{ backgroundColor: view === 'overdue' ? 'var(--error)' : 'var(--white)', color: view === 'overdue' ? 'white' : 'var(--slate)' }}
            >
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Atrasados
            </button>
            <button 
              onClick={() => setView('mora')}
              className={`px-4 py-2 text-sm font-medium transition-colors`}
              style={{ backgroundColor: view === 'mora' ? '#991b1b' : 'var(--white)', color: view === 'mora' ? 'white' : 'var(--slate)' }}
            >
              <Shield className="w-4 h-4 inline mr-1" />
              Mora
            </button>
            <button 
              onClick={() => setView('commissions')}
              className={`px-4 py-2 text-sm font-medium transition-colors`}
              style={{ backgroundColor: view === 'commissions' ? 'var(--gold-700)' : 'var(--white)', color: view === 'commissions' ? 'white' : 'var(--slate)' }}
            >
              <Coins className="w-4 h-4 inline mr-1" />
              Comisiones
            </button>
          </div>

          {view === 'all' && (
            <select 
              value={statusFilter} 
              onChange={(e) => setStatusFilter(e.target.value)}
              className="input py-2 px-3 text-sm"
              style={{ minHeight: 'auto', width: 'auto' }}
            >
              <option value="">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="late">Atrasados</option>
              <option value="paid">Pagados</option>
              <option value="scheduled">Programados</option>
            </select>
          )}
        </div>
      </div>

      {/* Mora Summary Banner (always visible if there's mora) */}
      {moraSummary && moraSummary.total_clients > 0 && view !== 'mora' && (
        <div className="p-4 rounded-lg flex items-center gap-3" style={{ backgroundColor: 'var(--error-light)', border: '1px solid #fca5a5' }}>
          <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: 'var(--error)' }} />
          <div className="flex-1">
            <p className="font-medium text-sm" style={{ color: 'var(--error)' }}>
              {moraSummary.total_clients} cliente{moraSummary.total_clients !== 1 ? 's' : ''} en mora — {fmt(moraSummary.total_overdue_amount)} pendiente
            </p>
            <p className="text-xs" style={{ color: '#991b1b' }}>
              {moraSummary.total_overdue_payments} pagos vencidos · {fmt(moraSummary.total_late_fees)} en late fees
            </p>
          </div>
          <button onClick={() => setView('mora')} className="text-sm font-semibold px-3 py-1 rounded" style={{ color: 'var(--error)', backgroundColor: 'white' }}>
            Ver Detalle
          </button>
        </div>
      )}

      {/* Mora Detail View */}
      {view === 'mora' && (
        <div className="space-y-4">
          {!moraSummary || moraSummary.total_clients === 0 ? (
            <div className="card-luxury p-12 text-center">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--success)' }} />
              <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>Sin Morosidad</h3>
              <p className="mt-2" style={{ color: 'var(--slate)' }}>Todos los clientes están al día con sus pagos</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Clientes</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--error)' }}>{moraSummary.total_clients}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Pagos Vencidos</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--error)' }}>{moraSummary.total_overdue_payments}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Monto Vencido</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--error)' }}>{fmt(moraSummary.total_overdue_amount)}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Late Fees</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{fmt(moraSummary.total_late_fees)}</p>
                </div>
              </div>

              {/* Client list */}
              <div className="card-luxury overflow-hidden">
                <div className="p-5 border-b" style={{ borderColor: 'var(--sand)' }}>
                  <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Detalle por Cliente</h3>
                </div>
                <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
                  {moraSummary.clients_in_mora.map((client) => (
                    <div key={client.client_id} className="p-4 flex items-center gap-4">
                      <div className="w-3 h-12 rounded-full flex-shrink-0" style={{ backgroundColor: riskColors[client.risk_level] || '#fbbf24' }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{client.client_name}</p>
                          <span className="badge text-xs" style={{ 
                            backgroundColor: `${riskColors[client.risk_level]}20`,
                            color: riskColors[client.risk_level] 
                          }}>
                            {client.risk_level === 'critical' ? '🔴 Crítico' :
                             client.risk_level === 'high' ? '🟠 Alto' :
                             client.risk_level === 'medium' ? '🟡 Medio' : '🟢 Bajo'}
                          </span>
                        </div>
                        <p className="text-sm" style={{ color: 'var(--slate)' }}>{client.property_address}</p>
                        {client.client_phone && (
                          <p className="text-xs flex items-center gap-1 mt-1" style={{ color: 'var(--ash)' }}>
                            <Phone className="w-3 h-3" /> {client.client_phone}
                          </p>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold" style={{ color: 'var(--error)' }}>{fmt(client.total_overdue)}</p>
                        <p className="text-xs" style={{ color: 'var(--error)' }}>
                          {client.overdue_payments} pagos · {client.max_days_late} días
                        </p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          Late fees: {fmt(client.total_late_fees)}
                        </p>
                      </div>
                      <Link href={`/capital/contracts/${client.contract_id}`} className="btn-ghost btn-sm text-xs">
                        Ver <ChevronRight className="w-3 h-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Payments List (all/overdue views) */}
      {view !== 'mora' && (
        <>
          {loading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
            </div>
          ) : payments.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <CreditCard className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
              <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
                No hay pagos {view === 'overdue' ? 'atrasados' : ''}
              </h3>
              <p className="mt-2" style={{ color: 'var(--slate)' }}>
                Los pagos se generan al activar un contrato RTO
              </p>
            </div>
          ) : (
            <div className="card-luxury overflow-hidden">
              <div className="overflow-x-auto">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Cliente</th>
                      <th>Propiedad</th>
                      <th>#</th>
                      <th>Vencimiento</th>
                      <th>Monto</th>
                      <th>Estado</th>
                      {view === 'overdue' && <th>Días Atraso</th>}
                      {view === 'overdue' && <th>Late Fee</th>}
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => {
                      const ps = statusStyles[p.status] || statusStyles.scheduled
                      const client = p.rto_contracts?.clients
                      const prop = p.rto_contracts?.properties
                      return (
                        <tr key={p.id}>
                          <td className="font-medium">{client?.name || 'N/A'}</td>
                          <td className="text-sm" style={{ color: 'var(--slate)' }}>
                            {prop?.address || 'N/A'}
                          </td>
                          <td>{p.payment_number}</td>
                          <td>{new Date(p.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}</td>
                          <td className="font-medium">{fmt(p.amount)}</td>
                          <td>
                            <span className="badge text-xs" style={{ backgroundColor: ps.bg, color: ps.color }}>
                              {ps.label}
                            </span>
                          </td>
                          {view === 'overdue' && (
                            <>
                              <td>
                                <span className="font-medium" style={{ color: 'var(--error)' }}>
                                  {p.days_late || (p as any).days_late || 0} días
                                </span>
                              </td>
                              <td>
                                <span style={{ color: 'var(--error)' }}>
                                  {fmt(p.calculated_late_fee || 0)}
                                </span>
                              </td>
                            </>
                          )}
                          <td>
                            {['pending', 'late', 'scheduled'].includes(p.status) && (
                              <button 
                                onClick={() => {
                                  setRecordingId(p.id)
                                  setExpectedAmount(p.amount)
                                  setPaidAmount('')
                                }}
                                className="btn-primary btn-sm text-xs"
                              >
                                <DollarSign className="w-3 h-3" />
                                Registrar
                              </button>
                            )}
                            {p.status === 'paid' && (
                              <span className="text-xs" style={{ color: 'var(--success)' }}>
                                ✓ {p.payment_method}
                              </span>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {/* Commissions View */}
      {view === 'commissions' && (
        <div className="space-y-4">
          {commissionsLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
            </div>
          ) : commissions.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <Coins className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
              <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>Sin Comisiones</h3>
              <p className="mt-2" style={{ color: 'var(--slate)' }}>
                Las comisiones se generan al activar contratos RTO ($1,000 por venta)
              </p>
            </div>
          ) : (
            <>
              {/* Commission Summary */}
              <div className="grid grid-cols-3 gap-4">
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total Comisiones</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>{fmt(commissions.reduce((s, c) => s + c.amount, 0))}</p>
                </div>
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Pagadas</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--success)' }}>
                    {fmt(commissions.filter(c => c.status === 'paid').reduce((s, c) => s + c.amount, 0))}
                  </p>
                </div>
                <div className="stat-card">
                  <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Pendientes</p>
                  <p className="text-2xl font-bold mt-1" style={{ color: 'var(--warning)' }}>
                    {fmt(commissions.filter(c => c.status === 'pending').reduce((s, c) => s + c.amount, 0))}
                  </p>
                </div>
              </div>

              {/* Commission List */}
              <div className="card-luxury overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Contrato</th>
                        <th>Cliente / Propiedad</th>
                        <th>Monto</th>
                        <th>Tipo</th>
                        <th>Estado</th>
                        <th>Creado</th>
                        <th>Notas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions.map(c => {
                        const isPaid = c.status === 'paid'
                        return (
                          <tr key={c.id}>
                            <td>
                              <Link href={`/capital/contracts/${c.rto_contract_id}`} className="text-navy-600 hover:underline text-sm">
                                {c.rto_contract_id.slice(0, 8)}...
                              </Link>
                            </td>
                            <td>
                              <p className="font-medium text-sm">{c.client_name || 'N/A'}</p>
                              <p className="text-xs" style={{ color: 'var(--ash)' }}>{c.property_address || ''}</p>
                            </td>
                            <td className="font-bold">{fmt(c.amount)}</td>
                            <td className="text-xs">
                              {c.commission_type === 'rto_sale' ? 'Venta RTO' :
                               c.commission_type === 'referral' ? 'Referido' : 'Otro'}
                            </td>
                            <td>
                              <span className="badge text-xs" style={{
                                backgroundColor: isPaid ? 'var(--success-light)' : 'var(--warning-light)',
                                color: isPaid ? 'var(--success)' : 'var(--warning)'
                              }}>
                                {isPaid ? '✓ Pagada' : '⏳ Pendiente'}
                              </span>
                            </td>
                            <td className="text-xs" style={{ color: 'var(--ash)' }}>
                              {new Date(c.created_at).toLocaleDateString('es-MX')}
                            </td>
                            <td className="text-xs" style={{ color: 'var(--slate)' }}>
                              {c.notes || '-'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Record Payment Modal */}
      {recordingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg" style={{ boxShadow: 'var(--shadow-lg)' }}>
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              Registrar Pago
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="label">Método de Pago</label>
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className="input">
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
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    placeholder={expectedAmount ? `${expectedAmount.toLocaleString('en-US')} (programado)` : '0'}
                    className="input pl-8"
                  />
                </div>
                {expectedAmount > 0 && (
                  <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                    Monto programado: ${expectedAmount.toLocaleString('en-US')}. Déjalo vacío para usar ese monto.
                  </p>
                )}
              </div>
              <div>
                <label className="label">Referencia (opcional)</label>
                <input type="text" value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} placeholder="Número de referencia" className="input" />
              </div>
              <div>
                <label className="label">Notas (opcional)</label>
                <input type="text" value={paymentNotes} onChange={(e) => setPaymentNotes(e.target.value)} placeholder="Notas adicionales" className="input" />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button onClick={handleRecordPayment} disabled={recording} className="btn-primary flex-1">
                {recording ? 'Registrando...' : 'Confirmar Pago'}
              </button>
              <button onClick={() => setRecordingId(null)} className="btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
