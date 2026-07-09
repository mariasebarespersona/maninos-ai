'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Bell, CheckCircle2, Clock, DollarSign, Phone, Loader2,
  ArrowDownCircle, ArrowUpCircle, AlertCircle, AlertTriangle, ShieldCheck,
  Plus, CircleDollarSign, X, ArrowDownRight, ArrowUpRight
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

// ── Payment-Orders types & constants (ported from Contabilidad) ──────────
interface PaymentOrder {
  id: string; order_number?: string; payee_name: string; amount: number
  method?: string; concept: string; direction: 'outbound' | 'inbound'
  status: string; notes?: string; reference?: string; payment_date?: string
  bank_name?: string; created_at: string; approved_by?: string; completed_by?: string
}

interface PoBankAccount {
  id: string; name: string; bank_name?: string; account_type?: string
  current_balance?: number
}

const fmtFull = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)

const PAYMENT_LABELS: Record<string, string> = {
  bank_transfer: 'Transferencia', zelle: 'Zelle', cash: 'Efectivo',
  check: 'Cheque', stripe: 'Stripe', wire: 'Wire',
}

const PO_CONCEPTS_OUTBOUND: Record<string, string> = {
  retorno_inversionista: 'Retorno Inversionista', pago_nota: 'Pago de Nota',
  gasto_operativo: 'Gasto Operativo', comision: 'Comisión', seguro: 'Seguro',
  impuesto: 'Impuesto', adquisicion: 'Adquisición', otro: 'Otro',
}

const PO_CONCEPTS_INBOUND: Record<string, string> = {
  pago_rto: 'Pago RTO', enganche: 'Enganche',
  deposito_inversionista: 'Depósito Inversionista', otro_ingreso: 'Otro Ingreso',
}

const PO_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente', color: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Aprobada', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', color: 'bg-stone-100 text-stone-500' },
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

      {/* ── Órdenes de Pago (gestión de tesorería) ─────────────────────── */}
      <PaymentOrdersSection />
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

// ════════════════════════════════════════════════════════════════════════
//  ÓRDENES DE PAGO (movido desde Contabilidad — gestión de tesorería)
// ════════════════════════════════════════════════════════════════════════
function PaymentOrdersSection() {
  const toast = useToast()
  const [orders, setOrders] = useState<PaymentOrder[]>([])
  const [bankAccounts, setBankAccounts] = useState<PoBankAccount[]>([])
  const [stats, setStats] = useState<{ pending: number; approved: number; completed: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<'' | 'pending' | 'approved' | 'completed' | 'cancelled'>('pending')
  const [showNewOrder, setShowNewOrder] = useState(false)
  const [approvingOrder, setApprovingOrder] = useState<PaymentOrder | null>(null)
  const [completingOrder, setCompletingOrder] = useState<PaymentOrder | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const fetchBankAccounts = useCallback(async () => {
    try {
      const res = await fetch('/api/capital/accounting/bank-accounts')
      if (res.ok) {
        const d = await res.json()
        setBankAccounts(d.bank_accounts || d.data || (Array.isArray(d) ? d : []))
      }
    } catch (e) { console.error(e) }
  }, [])

  const fetchOrders = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (statusFilter) params.set('status', statusFilter)
      const [res, statsRes] = await Promise.all([
        fetch(`/api/capital/payment-orders?${params}`),
        fetch('/api/capital/payment-orders/stats'),
      ])
      if (res.ok) {
        const d = await res.json()
        setOrders(d.orders || d.data || (Array.isArray(d) ? d : []))
      }
      if (statsRes.ok) {
        const s = await statsRes.json()
        setStats(s.data || null)
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [statusFilter])

  useEffect(() => { fetchOrders() }, [fetchOrders])
  useEffect(() => { fetchBankAccounts() }, [fetchBankAccounts])

  const handleApprove = async (order: PaymentOrder, bankAccountId?: string) => {
    if (order.direction === 'inbound' && !bankAccountId) { setApprovingOrder(order); return }
    setBusyId(order.id)
    try {
      const params = new URLSearchParams({ approved_by: 'Capital' })
      if (bankAccountId) params.set('bank_account_id', bankAccountId)
      const res = await fetch(`/api/capital/payment-orders/${order.id}/approve?${params}`, { method: 'PATCH' })
      if (res.ok) {
        toast.success('Orden aprobada')
        setApprovingOrder(null)
        fetchOrders()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al aprobar')
      }
    } catch { toast.error('Error de conexión') }
    finally { setBusyId(null) }
  }

  const handleCancel = async (order: PaymentOrder) => {
    if (!confirm(`¿Cancelar la orden de ${order.payee_name} por ${fmtFull(order.amount)}?`)) return
    setBusyId(order.id)
    try {
      const res = await fetch(`/api/capital/payment-orders/${order.id}/cancel`, { method: 'PATCH' })
      if (res.ok) {
        toast.success('Orden cancelada')
        fetchOrders()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al cancelar')
      }
    } catch { toast.error('Error de conexión') }
    finally { setBusyId(null) }
  }

  const conceptLabel = (o: PaymentOrder) =>
    (o.direction === 'outbound' ? PO_CONCEPTS_OUTBOUND[o.concept] : PO_CONCEPTS_INBOUND[o.concept]) || o.concept

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-800)' }}>
          <CircleDollarSign className="w-4 h-4 text-white" />
        </div>
        <div>
          <h2 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>Órdenes de Pago</h2>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>Crea, aprueba y completa órdenes de tesorería</p>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          <div className="card-luxury p-4">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Pendientes</p>
            <p className="text-2xl font-bold mt-1 text-amber-600">{stats.pending}</p>
          </div>
          <div className="card-luxury p-4">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Aprobadas</p>
            <p className="text-2xl font-bold mt-1 text-blue-600">{stats.approved}</p>
          </div>
          <div className="card-luxury p-4">
            <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Completadas</p>
            <p className="text-2xl font-bold mt-1 text-emerald-600">{stats.completed}</p>
          </div>
        </div>
      )}

      {/* Filter chips + New */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex rounded-lg border overflow-hidden" style={{ borderColor: 'var(--stone)' }}>
          {([['pending', 'Pendientes'], ['approved', 'Aprobadas'], ['completed', 'Completadas'], ['cancelled', 'Canceladas'], ['', 'Todas']] as const).map(([val, label]) => (
            <button key={val} onClick={() => setStatusFilter(val as any)}
              className="px-3 py-2 text-xs font-medium transition-colors"
              style={statusFilter === val ? { backgroundColor: 'var(--gold-600)', color: 'white' } : { color: 'var(--charcoal)' }}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setShowNewOrder(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white rounded-lg"
          style={{ backgroundColor: 'var(--gold-600)' }}>
          <Plus className="w-4 h-4" /> Nueva Orden
        </button>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : orders.length === 0 ? (
        <div className="text-center py-12 card-luxury">
          <CircleDollarSign className="w-10 h-10 mx-auto mb-2" style={{ color: 'var(--ash)' }} />
          <p className="text-sm" style={{ color: 'var(--ash)' }}>No hay órdenes de pago{statusFilter ? ' con este estado' : ''}</p>
        </div>
      ) : (
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b" style={{ borderColor: 'var(--sand)', backgroundColor: 'var(--pearl)' }}>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Fecha</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Beneficiario</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Concepto</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ash)' }}>Dirección</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Monto</th>
                <th className="px-4 py-3 text-left font-medium" style={{ color: 'var(--ash)' }}>Método</th>
                <th className="px-4 py-3 text-center font-medium" style={{ color: 'var(--ash)' }}>Estado</th>
                <th className="px-4 py-3 text-right font-medium" style={{ color: 'var(--ash)' }}>Acciones</th>
              </tr></thead>
              <tbody>
                {orders.map(o => {
                  const st = PO_STATUS_LABELS[o.status] || { label: o.status, color: 'bg-gray-100 text-gray-600' }
                  return (
                    <tr key={o.id} className="border-t hover:bg-sand/20" style={{ borderColor: 'var(--sand)' }}>
                      <td className="px-4 py-3 whitespace-nowrap" style={{ color: 'var(--charcoal)' }}>{(o.created_at || '').slice(0, 10)}</td>
                      <td className="px-4 py-3">
                        <p style={{ color: 'var(--charcoal)' }}>{o.payee_name}</p>
                        {o.notes && <p className="text-xs truncate max-w-[200px]" style={{ color: 'var(--ash)' }}>{o.notes}</p>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100" style={{ color: 'var(--slate)' }}>{conceptLabel(o)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${o.direction === 'inbound' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                          {o.direction === 'inbound' ? '↑ Entrada' : '↓ Salida'}
                        </span>
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${o.direction === 'inbound' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {o.direction === 'inbound' ? '+' : '-'}{fmtFull(o.amount)}
                      </td>
                      <td className="px-4 py-3 text-xs" style={{ color: 'var(--slate)' }}>{PAYMENT_LABELS[o.method || ''] || o.method || '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${st.color}`}>{st.label}</span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {o.status === 'pending' && (
                            <>
                              <button onClick={() => handleApprove(o)} disabled={busyId === o.id} title="Aprobar"
                                className="px-2 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors disabled:opacity-50">
                                {busyId === o.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Aprobar'}
                              </button>
                              <button onClick={() => handleCancel(o)} disabled={busyId === o.id} title="Cancelar"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-50">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {o.status === 'approved' && (
                            <>
                              <button onClick={() => setCompletingOrder(o)} title="Completar"
                                className="px-2 py-1 text-xs font-medium rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors">
                                Completar
                              </button>
                              <button onClick={() => handleCancel(o)} disabled={busyId === o.id} title="Cancelar"
                                className="p-1.5 rounded-lg hover:bg-red-50 text-red-500 transition-colors disabled:opacity-50">
                                <X className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {o.status === 'completed' && o.reference && (
                            <span className="text-[10px]" style={{ color: 'var(--ash)' }}>Ref: {o.reference}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewOrder && <NewPaymentOrderModal onClose={() => setShowNewOrder(false)} onCreated={() => { setShowNewOrder(false); fetchOrders() }} />}
      {approvingOrder && (
        <ApproveInboundOrderModal order={approvingOrder} bankAccounts={bankAccounts}
          onClose={() => setApprovingOrder(null)}
          onApprove={(bankId) => handleApprove(approvingOrder, bankId)} />
      )}
      {completingOrder && (
        <CompletePaymentOrderModal order={completingOrder} bankAccounts={bankAccounts}
          onClose={() => setCompletingOrder(null)}
          onCompleted={() => { setCompletingOrder(null); fetchOrders() }} />
      )}
    </div>
  )
}

function NewPaymentOrderModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const toast = useToast()
  const [form, setForm] = useState({
    direction: 'outbound' as 'outbound' | 'inbound',
    concept: 'gasto_operativo',
    payee_name: '', amount: '', method: 'bank_transfer', notes: '',
    bank_name: '', routing_number: '', account_number: '',
  })
  const [saving, setSaving] = useState(false)

  const concepts = form.direction === 'outbound' ? PO_CONCEPTS_OUTBOUND : PO_CONCEPTS_INBOUND

  const handleDirectionChange = (dir: 'outbound' | 'inbound') => {
    setForm(f => ({ ...f, direction: dir, concept: dir === 'outbound' ? 'gasto_operativo' : 'pago_rto' }))
  }

  const handleSubmit = async () => {
    if (!form.payee_name || !form.amount) { toast.warning('Beneficiario y monto son requeridos'); return }
    setSaving(true)
    try {
      const body: any = { ...form, amount: parseFloat(form.amount), created_by: 'Capital' }
      Object.keys(body).forEach(k => { if (body[k] === '') delete body[k] })
      const res = await fetch('/api/capital/payment-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (res.ok) {
        toast.success('Orden de pago creada')
        onCreated()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al crear orden')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Nueva Orden de Pago</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>

        <div className="space-y-3">
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--stone)' }}>
            <button onClick={() => handleDirectionChange('outbound')}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'outbound' ? 'bg-red-500 text-white' : ''}`}
              style={form.direction !== 'outbound' ? { color: 'var(--charcoal)' } : undefined}>
              <ArrowDownRight className="w-4 h-4" /> Salida (Pago)
            </button>
            <button onClick={() => handleDirectionChange('inbound')}
              className={`flex-1 py-2.5 text-sm font-medium flex items-center justify-center gap-2 ${form.direction === 'inbound' ? 'bg-emerald-500 text-white' : ''}`}
              style={form.direction !== 'inbound' ? { color: 'var(--charcoal)' } : undefined}>
              <ArrowUpRight className="w-4 h-4" /> Entrada (Cobro)
            </button>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Concepto</label>
            <select value={form.concept} onChange={e => setForm(f => ({ ...f, concept: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
              {Object.entries(concepts).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>{form.direction === 'outbound' ? 'Beneficiario' : 'Pagador'} <span className="text-red-500">*</span></label>
            <input type="text" value={form.payee_name} onChange={e => setForm(f => ({ ...f, payee_name: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Monto ($) <span className="text-red-500">*</span></label>
              <input type="number" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Método</label>
              <select value={form.method} onChange={e => setForm(f => ({ ...f, method: e.target.value }))}
                className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }}>
                {Object.entries(PAYMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
          </div>

          {form.direction === 'outbound' && (
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Banco destino</label>
                <input type="text" value={form.bank_name} onChange={e => setForm(f => ({ ...f, bank_name: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="Chase" />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Routing</label>
                <input type="text" value={form.routing_number} onChange={e => setForm(f => ({ ...f, routing_number: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
              </div>
              <div>
                <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta</label>
                <input type="text" value={form.account_number} onChange={e => setForm(f => ({ ...f, account_number: e.target.value }))}
                  className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
              </div>
            </div>
          )}

          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            {saving ? 'Creando...' : 'Crear Orden'}
          </button>
        </div>
      </div>
    </div>
  )
}

function ApproveInboundOrderModal({ order, bankAccounts, onClose, onApprove }: {
  order: PaymentOrder; bankAccounts: PoBankAccount[]; onClose: () => void; onApprove: (bankId: string) => void
}) {
  const [bankId, setBankId] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Aprobar Cobro</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>
          {order.payee_name} · <strong>{fmtFull(order.amount)}</strong>
        </p>
        <div>
          <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta bancaria receptora <span className="text-red-500">*</span></label>
          <select value={bankId} onChange={e => setBankId(e.target.value)}
            className="w-full px-3 py-2 text-sm rounded-lg border mt-1"
            style={{ borderColor: bankId ? 'var(--stone)' : '#f59e0b' }}>
            <option value="">Seleccionar cuenta...</option>
            {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_type})</option>)}
          </select>
        </div>
        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={() => bankId && onApprove(bankId)} disabled={!bankId}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: 'var(--gold-600)' }}>
            Aprobar
          </button>
        </div>
      </div>
    </div>
  )
}

function CompletePaymentOrderModal({ order, bankAccounts, onClose, onCompleted }: {
  order: PaymentOrder; bankAccounts: PoBankAccount[]; onClose: () => void; onCompleted: () => void
}) {
  const toast = useToast()
  const [form, setForm] = useState({
    reference: '',
    payment_date: new Date().toISOString().split('T')[0],
    bank_account_id: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const handleSubmit = async () => {
    if (!form.reference) { toast.warning('La referencia es requerida'); return }
    if (!form.bank_account_id) { toast.warning('Selecciona la cuenta bancaria'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/payment-orders/${order.id}/complete`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference: form.reference,
          payment_date: form.payment_date,
          bank_account_id: form.bank_account_id,
          completed_by: 'Capital',
          notes: form.notes || undefined,
        }),
      })
      if (res.ok) {
        toast.success('Orden completada')
        onCompleted()
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.detail || 'Error al completar orden')
      }
    } catch { toast.error('Error de conexión') }
    finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Completar Orden</h2>
          <button onClick={onClose}><X className="w-5 h-5" style={{ color: 'var(--ash)' }} /></button>
        </div>
        <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>
          {order.payee_name} · <strong>{fmtFull(order.amount)}</strong> · {order.direction === 'inbound' ? 'Entrada' : 'Salida'}
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Referencia <span className="text-red-500">*</span></label>
            <input type="text" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} placeholder="# confirmación / cheque" />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Fecha de pago</label>
            <input type="date" value={form.payment_date} onChange={e => setForm(f => ({ ...f, payment_date: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} />
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Cuenta Bancaria <span className="text-red-500">*</span></label>
            <select value={form.bank_account_id} onChange={e => setForm(f => ({ ...f, bank_account_id: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1"
              style={{ borderColor: form.bank_account_id ? 'var(--stone)' : '#f59e0b' }}>
              <option value="">Seleccionar cuenta...</option>
              {bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name} ({b.bank_name || b.account_type})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Notas</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              className="w-full px-3 py-2 text-sm rounded-lg border mt-1" style={{ borderColor: 'var(--stone)' }} rows={2} />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button onClick={onClose} className="flex-1 px-4 py-2 text-sm rounded-lg border" style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}>Cancelar</button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 px-4 py-2 text-sm font-medium text-white rounded-lg disabled:opacity-50"
            style={{ backgroundColor: '#059669' }}>
            {saving ? 'Completando...' : 'Completar Pago'}
          </button>
        </div>
      </div>
    </div>
  )
}
