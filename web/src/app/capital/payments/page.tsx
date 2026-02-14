'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { 
  CreditCard, DollarSign, AlertTriangle, CheckCircle2, 
  Clock, Filter, Calendar, User
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
  // For overdue
  calculated_late_fee?: number
  past_grace_period?: boolean
}

// Uses Next.js proxy routes (/api/capital/...)

export default function PaymentsPage() {
  const searchParams = useSearchParams()
  const toast = useToast()
  const [payments, setPayments] = useState<Payment[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'all' | 'overdue'>(
    searchParams.get('filter') === 'overdue' ? 'overdue' : 'all'
  )
  const [statusFilter, setStatusFilter] = useState<string>('')
  
  // Record payment modal
  const [recordingId, setRecordingId] = useState<string | null>(null)
  const [paymentMethod, setPaymentMethod] = useState('zelle')
  const [paidAmount, setPaidAmount] = useState('')
  const [paymentRef, setPaymentRef] = useState('')
  const [paymentNotes, setPaymentNotes] = useState('')
  const [recording, setRecording] = useState(false)

  useEffect(() => { loadPayments() }, [view, statusFilter])

  // Check for ?record=paymentId from URL
  useEffect(() => {
    const recordId = searchParams.get('record')
    if (recordId) setRecordingId(recordId)
  }, [searchParams])

  const loadPayments = async () => {
    setLoading(true)
    try {
      let url: string
      if (view === 'overdue') {
        url = `/api/capital/payments/overdue`
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

  const handleRecordPayment = async () => {
    if (!recordingId || !paidAmount) {
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
          paid_amount: parseFloat(paidAmount),
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
        
        if (data.contract_completed) {
          toast.success('🎉 ¡Contrato completado! Proceder a transferencia de título.', 5000)
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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Gestión de Pagos</h1>
          <p style={{ color: 'var(--slate)' }}>Cobros mensuales y seguimiento de morosidad</p>
        </div>

        <div className="flex items-center gap-3">
          {/* View Toggle */}
          <div className="flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
            <button 
              onClick={() => setView('all')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'all' ? 'text-white' : 'text-slate'
              }`}
              style={{ backgroundColor: view === 'all' ? 'var(--navy-800)' : 'var(--white)' }}
            >
              Todos
            </button>
            <button 
              onClick={() => setView('overdue')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'overdue' ? 'text-white' : 'text-slate'
              }`}
              style={{ backgroundColor: view === 'overdue' ? 'var(--error)' : 'var(--white)' }}
            >
              <AlertTriangle className="w-4 h-4 inline mr-1" />
              Atrasados
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

      {/* Payments List */}
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
                              setPaidAmount(String(p.amount))
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
                <select 
                  value={paymentMethod} 
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="input"
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
                    value={paidAmount}
                    onChange={(e) => setPaidAmount(e.target.value)}
                    className="input pl-8"
                  />
                </div>
              </div>
              
              <div>
                <label className="label">Referencia (opcional)</label>
                <input 
                  type="text" 
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Número de referencia"
                  className="input"
                />
              </div>
              
              <div>
                <label className="label">Notas (opcional)</label>
                <input 
                  type="text" 
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Notas adicionales"
                  className="input"
                />
              </div>
            </div>
            
            <div className="flex gap-3 mt-6">
              <button 
                onClick={handleRecordPayment}
                disabled={recording}
                className="btn-primary flex-1"
              >
                {recording ? 'Registrando...' : 'Confirmar Pago'}
              </button>
              <button 
                onClick={() => setRecordingId(null)}
                className="btn-secondary"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

