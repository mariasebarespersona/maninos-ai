'use client'

/**
 * Comisiones por pagar (lista de Abby, 2026-10-13).
 *
 * Desde julio las comisiones no crean orden en Notificaciones: se devengan
 * como factura por pagar [COMM:] al crear la venta. No había ningún sitio
 * visible para pagarlas, así que se acababan registrando como gasto nuevo
 * (duplicado en el P&L) y luego borrando la factura. Esta lista las muestra y
 * las paga con el endpoint de siempre, que LIQUIDA la factura (A/P → banco)
 * en la fecha y la cuenta reales.
 */

import { useCallback, useEffect, useState } from 'react'
import { Award, Loader2 } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'

interface CommissionRow {
  id: string
  amount: number
  status: string
  role?: string
  employee_name?: string
  property_address?: string
  property_code?: string | null
  sale_type?: string
  sale_created_at?: string
}

interface Bank { id: string; name: string; bank_name?: string }

const today = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function CommissionPayModal({ commission, onClose, onPaid }: {
  commission: CommissionRow; onClose: () => void; onPaid: () => void
}) {
  const { teamUser } = useAuth()
  const toast = useToast()
  const [banks, setBanks] = useState<Bank[]>([])
  const [bankId, setBankId] = useState('')
  const [fecha, setFecha] = useState(today())
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/accounting/bank-accounts').then(r => r.json())
      .then(d => setBanks(d.bank_accounts || [])).catch(() => {})
  }, [])

  const pay = async () => {
    if (!bankId || !fecha) return
    setSaving(true)
    try {
      const qs = new URLSearchParams({ paid_by: teamUser?.id || '', bank_account_id: bankId, payment_date: fecha })
      const res = await fetch(`/api/sales/commission-payments/${commission.id}/pay?${qs}`, { method: 'PATCH' })
      const d = await res.json()
      if (!res.ok || !d.ok) { toast.error(d.detail || 'No se pudo registrar el pago'); return }
      toast.success(`Comisión de ${commission.employee_name || 'comisionista'} pagada`)
      onPaid()
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4" data-testid="commission-pay-modal">
        <h3 className="font-serif text-lg font-semibold" style={{ color: 'var(--ink)' }}>Pagar comisión</h3>
        <div className="rounded-lg p-3 text-sm space-y-1" style={{ backgroundColor: 'var(--sand-50)' }}>
          <div className="flex justify-between"><span style={{ color: 'var(--slate)' }}>Comisionista</span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>{commission.employee_name || '—'}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--slate)' }}>Casa</span>
            <span className="font-medium" style={{ color: 'var(--ink)' }}>{[commission.property_code, commission.property_address].filter(Boolean).join(' · ') || '—'}</span></div>
          <div className="flex justify-between"><span style={{ color: 'var(--slate)' }}>Monto</span>
            <span className="font-bold text-lg" style={{ color: 'var(--ink)' }}>{formatMoney(commission.amount)}</span></div>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>¿De qué cuenta salió el pago? *</label>
          <select value={bankId} onChange={e => setBankId(e.target.value)} className="w-full p-3 border rounded-lg text-sm bg-white" style={{ borderColor: 'var(--stone)' }}>
            <option value="">Seleccionar cuenta...</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}{b.bank_name ? ` - ${b.bank_name}` : ''}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--charcoal)' }}>Fecha del pago *</label>
          <input type="date" value={fecha} max={today()} onChange={e => setFecha(e.target.value)}
            className="w-full p-3 border rounded-lg text-sm" style={{ borderColor: 'var(--stone)' }} />
        </div>
        <p className="text-xs" style={{ color: 'var(--slate)' }}>
          La comisión ya está registrada como gasto de la venta: esto solo salda su factura y descuenta el banco. No la registres también como gasto aparte.
        </p>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium hover:bg-gray-50"
            style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>Cancelar</button>
          <button onClick={pay} disabled={!bankId || !fecha || saving}
            className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-white disabled:opacity-50" style={{ backgroundColor: 'var(--navy-800)' }}>
            {saving ? <span className="flex items-center justify-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Procesando...</span> : 'Registrar pago'}
          </button>
        </div>
      </div>
    </div>
  )
}

/** Lista de comisiones pendientes con su botón Pagar (Notificaciones → Aprobadas). */
export default function CommissionsToPay() {
  const [rows, setRows] = useState<CommissionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [target, setTarget] = useState<CommissionRow | null>(null)

  const load = useCallback(async () => {
    try {
      const d = await (await fetch('/api/sales/commission-payments?status=pending', { cache: 'no-store' })).json()
      setRows(d.payments || [])
    } catch { /* la sección simplemente no aparece */ } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading || rows.length === 0) return null

  return (
    <div className="bg-white rounded-xl border p-5 mb-4" style={{ borderColor: 'var(--sand)' }} data-testid="commissions-to-pay">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <Award className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />
        Comisiones por pagar ({rows.length})
      </h3>
      <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
        {rows.map(r => (
          <div key={r.id} className="flex items-center justify-between gap-3 py-2.5" data-testid={`commission-row-${r.id}`}>
            <div className="min-w-0">
              <p className="text-sm font-medium truncate" style={{ color: 'var(--ink)' }}>
                {r.employee_name || 'Comisionista'}
                {r.property_code && <span className="ml-2 text-[10px] bg-navy-100 text-navy-600 px-1 py-0.5 rounded font-bold">{r.property_code}</span>}
              </p>
              <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>
                {r.property_address || '—'}{r.sale_type ? ` · ${r.sale_type === 'rto' ? 'RTO' : 'Contado'}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-3 flex-shrink-0">
              <span className="font-bold" style={{ color: 'var(--ink)' }}>{formatMoney(r.amount)}</span>
              <button onClick={() => setTarget(r)} className="px-3 py-1.5 rounded-lg text-sm font-medium text-white" style={{ backgroundColor: 'var(--navy-800)' }}>
                Pagar
              </button>
            </div>
          </div>
        ))}
      </div>
      {target && (
        <CommissionPayModal commission={target} onClose={() => setTarget(null)} onPaid={() => { setTarget(null); load() }} />
      )}
    </div>
  )
}
