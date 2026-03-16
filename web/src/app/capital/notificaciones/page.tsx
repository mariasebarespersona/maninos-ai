'use client'

import { useState, useEffect } from 'react'
import {
  Bell, CheckCircle2, Clock, DollarSign, Phone, Loader2,
  ArrowDownCircle, ArrowUpCircle
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

const TYPE_LABELS: Record<string, string> = {
  rto_payment: 'Pago RTO',
  down_payment: 'Enganche',
  late_fee: 'Mora',
  investor_deposit: 'Depósito Inversor',
  investor_return: 'Pago a Inversor',
  commission: 'Comisión',
  acquisition: 'Adquisición',
  operating_expense: 'Gasto Operativo',
  other_income: 'Otro Ingreso',
  other_expense: 'Otro Gasto',
}

export default function CapitalNotificacionesPage() {
  const toast = useToast()
  // Client-reported flows (special confirmation)
  const [reportedPayments, setReportedPayments] = useState<any[]>([])
  const [reportedDpInstallments, setReportedDpInstallments] = useState<any[]>([])
  // All pending capital_transactions
  const [pendingTxns, setPendingTxns] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [rtRes, dpRes, txnRes] = await Promise.all([
        fetch('/api/capital/payments/client-reported'),
        fetch('/api/capital/payments/down-payment/client-reported'),
        fetch('/api/capital/payments/pending-confirmations'),
      ])
      const rtData = await rtRes.json()
      const dpData = await dpRes.json()
      const txnData = await txnRes.json()
      if (rtData.ok) setReportedPayments(rtData.reported_payments || [])
      if (dpData.ok) setReportedDpInstallments(dpData.reported_installments || [])
      if (txnData.ok) setPendingTxns(txnData.transactions || [])
    } catch (err) {
      console.error('Error loading notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmRtoPayment = async (paymentId: string, amount: number, method: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/payments/${paymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method || 'bank_transfer', paid_amount: amount, recorded_by: 'abigail' }),
      })
      const data = await res.json()
      if (data.ok) { toast.success(data.message || 'Pago RTO confirmado'); setConfirmingId(null); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al confirmar') }
    finally { setSubmitting(false) }
  }

  const handleConfirmDpInstallment = async (installmentId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/payments/down-payment/${installmentId}/confirm`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (data.ok) { toast.success(data.message || 'Enganche confirmado'); setConfirmingId(null); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al confirmar') }
    finally { setSubmitting(false) }
  }

  const handleConfirmTransaction = async (txnId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/payments/confirm-transaction/${txnId}`, { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (data.ok) { toast.success(data.message || 'Transacción confirmada'); setConfirmingId(null); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al confirmar') }
    finally { setSubmitting(false) }
  }

  const totalPending = reportedPayments.length + reportedDpInstallments.length + pendingTxns.length

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
          <Bell className="w-5 h-5 text-white" />
        </div>
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Notificaciones</h1>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>
            {totalPending > 0
              ? `${totalPending} elemento${totalPending !== 1 ? 's' : ''} pendiente${totalPending !== 1 ? 's' : ''} de confirmar`
              : 'Todos los pagos y transacciones confirmados'}
          </p>
        </div>
      </div>

      {totalPending === 0 && (
        <div className="text-center py-16 card-luxury">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--success)' }} />
          <p className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>No hay notificaciones pendientes</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            Cuando se registre un pago o transacción, aparecerá aquí para confirmar.
          </p>
        </div>
      )}

      {/* Client-Reported RTO Payments */}
      {reportedPayments.length > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid #3b82f6' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: '#eff6ff' }}>
            <DollarSign className="w-5 h-5" style={{ color: '#2563eb' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: '#1e40af' }}>
                Pagos RTO Reportados por Clientes
              </h3>
              <p className="text-xs" style={{ color: '#3b82f6' }}>
                {reportedPayments.length} pago{reportedPayments.length !== 1 ? 's' : ''} pendiente{reportedPayments.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#dbeafe' }}>
            {reportedPayments.map((rp: any) => (
              <NotificationRow
                key={`rto-${rp.payment_id}`}
                id={rp.payment_id}
                title={rp.client_name}
                badge={`Pago #${rp.payment_number}`}
                badgeColor="#1d4ed8"
                badgeBg="#dbeafe"
                method={rp.client_payment_method}
                subtitle={`${rp.property_address || ''}${rp.property_city ? `, ${rp.property_city}` : ''}`}
                phone={rp.client_phone}
                date={rp.client_reported_at}
                notes={rp.client_payment_notes}
                amount={rp.amount}
                amountSub={rp.due_date ? `Vence: ${new Date(rp.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}
                confirmLabel="Confirmar pago"
                confirmColor="#2563eb"
                confirmingId={confirmingId}
                submitting={submitting}
                onConfirm={() => handleConfirmRtoPayment(rp.payment_id, rp.amount, rp.client_payment_method)}
                onExpand={() => setConfirmingId(rp.payment_id)}
                onCancel={() => setConfirmingId(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Client-Reported Down Payment Installments */}
      {reportedDpInstallments.length > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid #8b5cf6' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: '#f5f3ff' }}>
            <DollarSign className="w-5 h-5" style={{ color: '#7c3aed' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: '#5b21b6' }}>
                Enganches Reportados por Clientes
              </h3>
              <p className="text-xs" style={{ color: '#7c3aed' }}>
                {reportedDpInstallments.length} cuota{reportedDpInstallments.length !== 1 ? 's' : ''} pendiente{reportedDpInstallments.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#ede9fe' }}>
            {reportedDpInstallments.map((inst: any) => (
              <NotificationRow
                key={`dp-${inst.installment_id}`}
                id={inst.installment_id}
                title={inst.client_name}
                badge={`Enganche #${inst.installment_number}`}
                badgeColor="#7c3aed"
                badgeBg="#f5f3ff"
                method={inst.client_payment_method}
                subtitle={`${inst.property_address || ''}${inst.property_city ? `, ${inst.property_city}` : ''}`}
                phone={inst.client_phone}
                date={inst.client_reported_at}
                notes={inst.notes}
                amount={inst.amount}
                amountSub={inst.total_down_payment ? `de $${inst.total_down_payment.toLocaleString('en-US')} total` : ''}
                confirmLabel="Confirmar enganche"
                confirmColor="#7c3aed"
                confirmingId={confirmingId}
                submitting={submitting}
                onConfirm={() => handleConfirmDpInstallment(inst.installment_id)}
                onExpand={() => setConfirmingId(inst.installment_id)}
                onCancel={() => setConfirmingId(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* All Other Pending Transactions */}
      {pendingTxns.length > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid var(--gold-400)' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: 'var(--gold-50, #fffbeb)' }}>
            <Bell className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: 'var(--ink)' }}>
                Transacciones Pendientes de Confirmar
              </h3>
              <p className="text-xs" style={{ color: 'var(--gold-700)' }}>
                {pendingTxns.length} transacción{pendingTxns.length !== 1 ? 'es' : ''} — pagos RTO, comisiones, inversores, etc.
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
            {pendingTxns.map((txn: any) => (
              <div key={txn.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {txn.is_income
                      ? <ArrowDownCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      : <ArrowUpCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
                    <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>
                      {txn.description || 'Sin descripción'}
                    </p>
                    <span className="badge text-xs" style={{ backgroundColor: txn.is_income ? '#f0fdf4' : '#fef2f2', color: txn.is_income ? '#16a34a' : '#dc2626' }}>
                      {TYPE_LABELS[txn.transaction_type] || txn.transaction_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
                    {txn.transaction_date && (
                      <span>Fecha: {new Date(txn.transaction_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    )}
                    {txn.payment_method && <span>Método: {txn.payment_method}</span>}
                    {txn.counterparty_name && <span>{txn.counterparty_name}</span>}
                  </div>
                  {txn.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--slate)' }}>{txn.notes}</p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className={`text-lg font-bold ${txn.is_income ? 'text-green-600' : 'text-red-600'}`}>
                    {txn.is_income ? '+' : '-'}${txn.amount?.toLocaleString('en-US') || '0'}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {confirmingId === txn.id ? (
                    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <p className="text-xs font-medium" style={{ color: '#166534' }}>
                        Confirmar {txn.is_income ? 'ingreso' : 'gasto'} de ${txn.amount?.toLocaleString('en-US')}?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmTransaction(txn.id)}
                          disabled={submitting}
                          className="btn-primary btn-sm text-xs"
                          style={{ backgroundColor: '#16a34a' }}
                        >
                          {submitting ? 'Confirmando...' : 'Sí, confirmar'}
                        </button>
                        <button onClick={() => setConfirmingId(null)} className="btn-ghost btn-sm text-xs">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmingId(txn.id)}
                      className="btn-primary btn-sm text-xs whitespace-nowrap"
                      style={{ backgroundColor: 'var(--gold-600)' }}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Confirmar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function NotificationRow({
  id, title, badge, badgeColor, badgeBg, method, subtitle, phone, date, notes,
  amount, amountSub, confirmLabel, confirmColor, confirmingId, submitting,
  onConfirm, onExpand, onCancel,
}: {
  id: string; title: string; badge: string; badgeColor: string; badgeBg: string
  method?: string; subtitle: string; phone?: string; date?: string; notes?: string
  amount: number; amountSub: string; confirmLabel: string; confirmColor: string
  confirmingId: string | null; submitting: boolean
  onConfirm: () => void; onExpand: () => void; onCancel: () => void
}) {
  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
          <span className="badge text-xs" style={{ backgroundColor: badgeBg, color: badgeColor }}>{badge}</span>
          {method && (
            <span className="badge text-xs" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              {method === 'bank_transfer' ? 'Transferencia' : 'Efectivo'}
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{subtitle}</p>}
        <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
          {phone && <span><Phone className="w-3 h-3 inline mr-1" />{phone}</span>}
          {date && (
            <span>
              <Clock className="w-3 h-3 inline mr-1" />
              {new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        {notes && <p className="text-xs mt-1 italic" style={{ color: 'var(--slate)' }}>Nota: &quot;{notes}&quot;</p>}
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>${amount?.toLocaleString('en-US') || '0'}</p>
        {amountSub && <p className="text-xs" style={{ color: 'var(--ash)' }}>{amountSub}</p>}
      </div>
      <div className="flex-shrink-0">
        {confirmingId === id ? (
          <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
            <p className="text-xs font-medium" style={{ color: '#166534' }}>Confirmar ${amount?.toLocaleString('en-US')}?</p>
            <div className="flex gap-2">
              <button onClick={onConfirm} disabled={submitting} className="btn-primary btn-sm text-xs" style={{ backgroundColor: '#16a34a' }}>
                {submitting ? '...' : 'Sí, confirmar'}
              </button>
              <button onClick={onCancel} className="btn-ghost btn-sm text-xs">Cancelar</button>
            </div>
          </div>
        ) : (
          <button onClick={onExpand} className="btn-primary btn-sm text-xs whitespace-nowrap" style={{ backgroundColor: confirmColor }}>
            <CheckCircle2 className="w-3 h-3 mr-1" />{confirmLabel}
          </button>
        )}
      </div>
    </div>
  )
}
