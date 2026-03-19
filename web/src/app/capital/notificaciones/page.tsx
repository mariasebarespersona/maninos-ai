'use client'

import { useState, useEffect } from 'react'
import {
  Bell, CheckCircle2, Clock, DollarSign, Phone, Loader2,
  ArrowDownCircle, ArrowUpCircle, AlertCircle, AlertTriangle, ShieldCheck
} from 'lucide-react'
import Link from 'next/link'
import { useToast } from '@/components/ui/Toast'
import { useAuth } from '@/components/Auth/AuthProvider'

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
  const { teamUser } = useAuth()
  const userRole = teamUser?.role || 'admin'
  const isAdmin = userRole === 'admin'
  const isTreasury = userRole === 'treasury'

  const [reportedPayments, setReportedPayments] = useState<any[]>([])
  const [reportedDpInstallments, setReportedDpInstallments] = useState<any[]>([])
  const [pendingTxns, setPendingTxns] = useState<any[]>([])
  const [maturityAlerts, setMaturityAlerts] = useState<{ overdue: any[]; this_week: any[]; this_month: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [approvingId, setApprovingId] = useState<string | null>(null)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [rtRes, dpRes, txnRes, alertsRes] = await Promise.all([
        fetch('/api/capital/payments/client-reported'),
        fetch('/api/capital/payments/down-payment/client-reported'),
        fetch('/api/capital/payments/pending-confirmations'),
        fetch('/api/capital/promissory-notes/alerts?days=90'),
      ])
      const rtData = await rtRes.json()
      const dpData = await dpRes.json()
      const txnData = await txnRes.json()
      const alertsData = await alertsRes.json()
      if (rtData.ok) setReportedPayments(rtData.reported_payments || [])
      if (dpData.ok) setReportedDpInstallments(dpData.reported_installments || [])
      if (txnData.ok) setPendingTxns(txnData.transactions || [])
      if (alertsData.ok && alertsData.total_alerts > 0) setMaturityAlerts(alertsData)
      else setMaturityAlerts(null)
    } catch (err) {
      console.error('Error loading notifications:', err)
    } finally {
      setLoading(false)
    }
  }

  // ── Approve handlers (admin) ──────────────────────────────────────────
  const handleApproveRtoPayment = async (paymentId: string) => {
    setApprovingId(paymentId)
    try {
      const res = await fetch(`/api/capital/payments/approve-rto-payment/${paymentId}?approved_by=${teamUser?.id || ''}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) { toast.success('Pago RTO aprobado'); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al aprobar') }
    finally { setApprovingId(null) }
  }

  const handleApproveDpInstallment = async (installmentId: string) => {
    setApprovingId(installmentId)
    try {
      const res = await fetch(`/api/capital/payments/approve-dp-installment/${installmentId}?approved_by=${teamUser?.id || ''}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) { toast.success('Enganche aprobado'); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al aprobar') }
    finally { setApprovingId(null) }
  }

  const handleApproveTransaction = async (txnId: string) => {
    setApprovingId(txnId)
    try {
      const res = await fetch(`/api/capital/payments/approve-transaction/${txnId}?approved_by=${teamUser?.id || ''}`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) { toast.success('Transacción aprobada'); loadAll() }
      else toast.error(data.detail || 'Error')
    } catch { toast.error('Error al aprobar') }
    finally { setApprovingId(null) }
  }

  // ── Confirm handlers (treasury) ───────────────────────────────────────
  const handleConfirmRtoPayment = async (paymentId: string, amount: number, method: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/payments/${paymentId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method || 'bank_transfer', paid_amount: amount, recorded_by: teamUser?.name || 'treasury' }),
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

  // ── Filter data by role ───────────────────────────────────────────────
  // Admin sees unapproved items to approve
  // Treasury sees only approved items to confirm
  const unapprovedPayments = reportedPayments.filter((p: any) => !p.approved_at)
  const approvedPayments = reportedPayments.filter((p: any) => p.approved_at)
  const unapprovedDp = reportedDpInstallments.filter((i: any) => !i.approved_at)
  const approvedDp = reportedDpInstallments.filter((i: any) => i.approved_at)
  const unapprovedTxns = pendingTxns.filter((t: any) => !t.approved_at)
  const approvedTxns = pendingTxns.filter((t: any) => t.approved_at)

  const maturityCount = maturityAlerts ? (maturityAlerts.overdue.length + maturityAlerts.this_week.length + maturityAlerts.this_month.length) : 0

  const adminPending = unapprovedPayments.length + unapprovedDp.length + unapprovedTxns.length
  const treasuryPending = approvedPayments.length + approvedDp.length + approvedTxns.length
  const totalPending = (isAdmin ? adminPending : treasuryPending) + maturityCount

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
            {isAdmin
              ? `${adminPending} pago${adminPending !== 1 ? 's' : ''} por aprobar`
              : isTreasury
              ? `${treasuryPending} pago${treasuryPending !== 1 ? 's' : ''} aprobado${treasuryPending !== 1 ? 's' : ''} por confirmar`
              : `${totalPending} pendiente${totalPending !== 1 ? 's' : ''}`}
          </p>
        </div>
      </div>

      {totalPending === 0 && (
        <div className="text-center py-16 card-luxury">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--success)' }} />
          <p className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>No hay notificaciones pendientes</p>
        </div>
      )}

      {/* Promissory Note Alerts (visible to all) */}
      {maturityAlerts && maturityCount > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid #ef4444' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: '#fef2f2' }}>
            <AlertCircle className="w-5 h-5" style={{ color: '#dc2626' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: '#991b1b' }}>
                Alertas de Vencimiento — Pagarés
              </h3>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#fecaca' }}>
            {maturityAlerts.overdue.map((n: any) => (
              <Link key={n.id} href={`/capital/promissory-notes/${n.id}`} className="p-4 flex items-center gap-3 hover:bg-red-50 transition-colors">
                <AlertCircle className="w-5 h-5 flex-shrink-0" style={{ color: '#dc2626' }} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm" style={{ color: '#991b1b' }}>{n.investors?.name || 'Inversor'}</p>
                    <span className="badge text-xs" style={{ backgroundColor: '#fef2f2', color: '#dc2626' }}>VENCIDO</span>
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: '#b91c1c' }}>
                    Venció hace {Math.abs(n.days_until_maturity)} días — {new Date(n.maturity_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-lg font-bold flex-shrink-0" style={{ color: '#dc2626' }}>${Number(n.total_due || n.loan_amount).toLocaleString('en-US')}</p>
              </Link>
            ))}
            {[...maturityAlerts.this_week, ...maturityAlerts.this_month].map((n: any) => (
              <Link key={n.id} href={`/capital/promissory-notes/${n.id}`} className="p-4 flex items-center gap-3 hover:bg-amber-50 transition-colors">
                <AlertTriangle className="w-5 h-5 flex-shrink-0" style={{ color: '#d97706' }} />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{n.investors?.name || 'Inversor'}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#d97706' }}>
                    Vence en {n.days_until_maturity} días — {new Date(n.maturity_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <p className="text-lg font-bold flex-shrink-0" style={{ color: '#d97706' }}>${Number(n.total_due || n.loan_amount).toLocaleString('en-US')}</p>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ── ADMIN: Items to approve ──────────────────────────────────── */}
      {isAdmin && unapprovedPayments.length > 0 && (
        <ApprovalSection
          title="Pagos RTO por Aprobar"
          color="#3b82f6"
          bgColor="#eff6ff"
          borderColor="#dbeafe"
          count={unapprovedPayments.length}
          icon={<DollarSign className="w-5 h-5" style={{ color: '#2563eb' }} />}
        >
          {unapprovedPayments.map((rp: any) => (
            <NotificationRow
              key={`rto-${rp.payment_id}`}
              id={rp.payment_id}
              title={rp.client_name}
              badge={`Pago #${rp.payment_number}`}
              badgeColor="#1d4ed8" badgeBg="#dbeafe"
              method={rp.client_payment_method}
              subtitle={`${rp.property_address || ''}${rp.property_city ? `, ${rp.property_city}` : ''}`}
              phone={rp.client_phone}
              date={rp.client_reported_at}
              amount={rp.amount}
              amountSub={rp.due_date ? `Vence: ${new Date(rp.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}` : ''}
              actionButton={
                <button
                  onClick={() => handleApproveRtoPayment(rp.payment_id)}
                  disabled={approvingId === rp.payment_id}
                  className="btn-primary btn-sm text-xs whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: 'var(--navy-800)' }}
                >
                  {approvingId === rp.payment_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  Aprobar
                </button>
              }
            />
          ))}
        </ApprovalSection>
      )}

      {isAdmin && unapprovedDp.length > 0 && (
        <ApprovalSection
          title="Enganches por Aprobar"
          color="#8b5cf6"
          bgColor="#f5f3ff"
          borderColor="#ede9fe"
          count={unapprovedDp.length}
          icon={<DollarSign className="w-5 h-5" style={{ color: '#7c3aed' }} />}
        >
          {unapprovedDp.map((inst: any) => (
            <NotificationRow
              key={`dp-${inst.installment_id}`}
              id={inst.installment_id}
              title={inst.client_name}
              badge={`Enganche #${inst.installment_number}`}
              badgeColor="#7c3aed" badgeBg="#f5f3ff"
              method={inst.client_payment_method}
              subtitle={`${inst.property_address || ''}${inst.property_city ? `, ${inst.property_city}` : ''}`}
              phone={inst.client_phone}
              date={inst.client_reported_at}
              amount={inst.amount}
              amountSub={inst.total_down_payment ? `de $${inst.total_down_payment.toLocaleString('en-US')} total` : ''}
              actionButton={
                <button
                  onClick={() => handleApproveDpInstallment(inst.installment_id)}
                  disabled={approvingId === inst.installment_id}
                  className="btn-primary btn-sm text-xs whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: 'var(--navy-800)' }}
                >
                  {approvingId === inst.installment_id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  Aprobar
                </button>
              }
            />
          ))}
        </ApprovalSection>
      )}

      {isAdmin && unapprovedTxns.length > 0 && (
        <ApprovalSection
          title="Transacciones por Aprobar"
          color="var(--gold-700)"
          bgColor="var(--gold-50, #fffbeb)"
          borderColor="var(--gold-400)"
          count={unapprovedTxns.length}
          icon={<Bell className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />}
        >
          {unapprovedTxns.map((txn: any) => (
            <TxnRow key={txn.id} txn={txn}
              actionButton={
                <button
                  onClick={() => handleApproveTransaction(txn.id)}
                  disabled={approvingId === txn.id}
                  className="btn-primary btn-sm text-xs whitespace-nowrap flex items-center gap-1"
                  style={{ backgroundColor: 'var(--navy-800)' }}
                >
                  {approvingId === txn.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <ShieldCheck className="w-3 h-3" />}
                  Aprobar
                </button>
              }
            />
          ))}
        </ApprovalSection>
      )}

      {/* ── TREASURY: Approved items to confirm ──────────────────────── */}
      {isTreasury && approvedPayments.length > 0 && (
        <ApprovalSection
          title="Pagos RTO Aprobados — Confirmar"
          color="#16a34a"
          bgColor="#f0fdf4"
          borderColor="#bbf7d0"
          count={approvedPayments.length}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />}
        >
          {approvedPayments.map((rp: any) => (
            <NotificationRow
              key={`rto-${rp.payment_id}`}
              id={rp.payment_id}
              title={rp.client_name}
              badge={`Pago #${rp.payment_number}`}
              badgeColor="#1d4ed8" badgeBg="#dbeafe"
              method={rp.client_payment_method}
              subtitle={`${rp.property_address || ''}`}
              phone={rp.client_phone}
              date={rp.client_reported_at}
              amount={rp.amount}
              amountSub=""
              actionButton={
                confirmingId === rp.payment_id ? (
                  <ConfirmBox
                    amount={rp.amount}
                    submitting={submitting}
                    onConfirm={() => handleConfirmRtoPayment(rp.payment_id, rp.amount, rp.client_payment_method)}
                    onCancel={() => setConfirmingId(null)}
                  />
                ) : (
                  <button onClick={() => setConfirmingId(rp.payment_id)} className="btn-primary btn-sm text-xs whitespace-nowrap" style={{ backgroundColor: '#16a34a' }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />Confirmar pago
                  </button>
                )
              }
            />
          ))}
        </ApprovalSection>
      )}

      {isTreasury && approvedDp.length > 0 && (
        <ApprovalSection
          title="Enganches Aprobados — Confirmar"
          color="#16a34a"
          bgColor="#f0fdf4"
          borderColor="#bbf7d0"
          count={approvedDp.length}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />}
        >
          {approvedDp.map((inst: any) => (
            <NotificationRow
              key={`dp-${inst.installment_id}`}
              id={inst.installment_id}
              title={inst.client_name}
              badge={`Enganche #${inst.installment_number}`}
              badgeColor="#7c3aed" badgeBg="#f5f3ff"
              method={inst.client_payment_method}
              subtitle={`${inst.property_address || ''}`}
              phone={inst.client_phone}
              date={inst.client_reported_at}
              amount={inst.amount}
              amountSub=""
              actionButton={
                confirmingId === inst.installment_id ? (
                  <ConfirmBox
                    amount={inst.amount}
                    submitting={submitting}
                    onConfirm={() => handleConfirmDpInstallment(inst.installment_id)}
                    onCancel={() => setConfirmingId(null)}
                  />
                ) : (
                  <button onClick={() => setConfirmingId(inst.installment_id)} className="btn-primary btn-sm text-xs whitespace-nowrap" style={{ backgroundColor: '#16a34a' }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />Confirmar enganche
                  </button>
                )
              }
            />
          ))}
        </ApprovalSection>
      )}

      {isTreasury && approvedTxns.length > 0 && (
        <ApprovalSection
          title="Transacciones Aprobadas — Confirmar"
          color="#16a34a"
          bgColor="#f0fdf4"
          borderColor="#bbf7d0"
          count={approvedTxns.length}
          icon={<CheckCircle2 className="w-5 h-5" style={{ color: '#16a34a' }} />}
        >
          {approvedTxns.map((txn: any) => (
            <TxnRow key={txn.id} txn={txn}
              actionButton={
                confirmingId === txn.id ? (
                  <ConfirmBox
                    amount={txn.amount}
                    submitting={submitting}
                    onConfirm={() => handleConfirmTransaction(txn.id)}
                    onCancel={() => setConfirmingId(null)}
                  />
                ) : (
                  <button onClick={() => setConfirmingId(txn.id)} className="btn-primary btn-sm text-xs whitespace-nowrap" style={{ backgroundColor: '#16a34a' }}>
                    <CheckCircle2 className="w-3 h-3 mr-1" />Confirmar
                  </button>
                )
              }
            />
          ))}
        </ApprovalSection>
      )}
    </div>
  )
}

// ── Shared Components ─────────────────────────────────────────────────

function ApprovalSection({ title, color, bgColor, borderColor, count, icon, children }: {
  title: string; color: string; bgColor: string; borderColor: string; count: number; icon: React.ReactNode; children: React.ReactNode
}) {
  return (
    <div className="card-luxury overflow-hidden" style={{ border: `2px solid ${borderColor}` }}>
      <div className="p-4 flex items-center gap-3" style={{ backgroundColor: bgColor }}>
        {icon}
        <div className="flex-1">
          <h3 className="font-serif text-base font-semibold" style={{ color }}>{title}</h3>
          <p className="text-xs" style={{ color }}>{count} pendiente{count !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div className="divide-y" style={{ borderColor }}>{children}</div>
    </div>
  )
}

function ConfirmBox({ amount, submitting, onConfirm, onCancel }: {
  amount: number; submitting: boolean; onConfirm: () => void; onCancel: () => void
}) {
  return (
    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
      <p className="text-xs font-medium" style={{ color: '#166534' }}>Confirmar ${amount?.toLocaleString('en-US')}?</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} disabled={submitting} className="btn-primary btn-sm text-xs" style={{ backgroundColor: '#16a34a' }}>
          {submitting ? '...' : 'Sí, confirmar'}
        </button>
        <button onClick={onCancel} className="btn-ghost btn-sm text-xs">Cancelar</button>
      </div>
    </div>
  )
}

function NotificationRow({ id, title, badge, badgeColor, badgeBg, method, subtitle, phone, date, amount, amountSub, actionButton }: {
  id: string; title: string; badge: string; badgeColor: string; badgeBg: string
  method?: string; subtitle: string; phone?: string; date?: string
  amount: number; amountSub: string; actionButton: React.ReactNode
}) {
  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{title}</p>
          <span className="badge text-xs" style={{ backgroundColor: badgeBg, color: badgeColor }}>{badge}</span>
          {method && (
            <span className="badge text-xs" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
              {method === 'bank_transfer' ? 'Transferencia' : method === 'cash' ? 'Efectivo' : method}
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
      </div>
      <div className="text-right flex-shrink-0">
        <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>${amount?.toLocaleString('en-US') || '0'}</p>
        {amountSub && <p className="text-xs" style={{ color: 'var(--ash)' }}>{amountSub}</p>}
      </div>
      <div className="flex-shrink-0">{actionButton}</div>
    </div>
  )
}

function TxnRow({ txn, actionButton }: { txn: any; actionButton: React.ReactNode }) {
  return (
    <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          {txn.is_income
            ? <ArrowDownCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
            : <ArrowUpCircle className="w-4 h-4 text-red-500 flex-shrink-0" />}
          <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{txn.description || 'Sin descripción'}</p>
          <span className="badge text-xs" style={{ backgroundColor: txn.is_income ? '#f0fdf4' : '#fef2f2', color: txn.is_income ? '#16a34a' : '#dc2626' }}>
            {TYPE_LABELS[txn.transaction_type] || txn.transaction_type}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
          {txn.transaction_date && <span>Fecha: {new Date(txn.transaction_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          {txn.payment_method && <span>Método: {txn.payment_method}</span>}
        </div>
      </div>
      <div className="text-right flex-shrink-0">
        <p className={`text-lg font-bold ${txn.is_income ? 'text-green-600' : 'text-red-600'}`}>
          {txn.is_income ? '+' : '-'}${txn.amount?.toLocaleString('en-US') || '0'}
        </p>
      </div>
      <div className="flex-shrink-0">{actionButton}</div>
    </div>
  )
}
