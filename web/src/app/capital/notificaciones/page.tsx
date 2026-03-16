'use client'

import { useState, useEffect } from 'react'
import {
  Bell, CheckCircle2, Clock, DollarSign, Phone, Loader2
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

export default function CapitalNotificacionesPage() {
  const toast = useToast()
  const [reportedPayments, setReportedPayments] = useState<any[]>([])
  const [reportedDpInstallments, setReportedDpInstallments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [rtRes, dpRes] = await Promise.all([
        fetch('/api/capital/payments/client-reported'),
        fetch('/api/capital/payments/down-payment/client-reported'),
      ])
      const rtData = await rtRes.json()
      const dpData = await dpRes.json()
      if (rtData.ok) setReportedPayments(rtData.reported_payments || [])
      if (dpData.ok) setReportedDpInstallments(dpData.reported_installments || [])
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
        body: JSON.stringify({
          payment_method: method || 'bank_transfer',
          paid_amount: amount,
          recorded_by: 'abigail',
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Pago RTO confirmado')
        setConfirmingId(null)
        loadAll()
      } else {
        toast.error(data.detail || 'Error al confirmar')
      }
    } catch (err) {
      toast.error('Error al confirmar pago')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmDpInstallment = async (installmentId: string) => {
    setSubmitting(true)
    try {
      const res = await fetch(`/api/capital/payments/down-payment/${installmentId}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Enganche confirmado')
        setConfirmingId(null)
        loadAll()
      } else {
        toast.error(data.detail || 'Error al confirmar')
      }
    } catch (err) {
      toast.error('Error al confirmar enganche')
    } finally {
      setSubmitting(false)
    }
  }

  const totalPending = reportedPayments.length + reportedDpInstallments.length

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
            Pagos reportados por clientes pendientes de confirmar
          </p>
        </div>
      </div>

      {totalPending === 0 && (
        <div className="text-center py-16 card-luxury">
          <CheckCircle2 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--success)' }} />
          <p className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>No hay notificaciones pendientes</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            Cuando un cliente reporte un pago, aparecerá aquí para que lo confirmes.
          </p>
        </div>
      )}

      {/* RTO Payments Reported */}
      {reportedPayments.length > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid #3b82f6' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: '#eff6ff' }}>
            <DollarSign className="w-5 h-5" style={{ color: '#2563eb' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: '#1e40af' }}>
                Pagos RTO Reportados
              </h3>
              <p className="text-xs" style={{ color: '#3b82f6' }}>
                {reportedPayments.length} pago{reportedPayments.length !== 1 ? 's' : ''} de renta pendiente{reportedPayments.length !== 1 ? 's' : ''} de confirmar
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#dbeafe' }}>
            {reportedPayments.map((rp: any) => (
              <div key={rp.payment_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{rp.client_name}</p>
                    <span className="badge text-xs" style={{ backgroundColor: '#dbeafe', color: '#1d4ed8' }}>
                      Pago #{rp.payment_number}
                    </span>
                    <span className="badge text-xs" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                      {rp.client_payment_method === 'bank_transfer' ? 'Transferencia' : 'Efectivo'}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                    {rp.property_address}{rp.property_city ? `, ${rp.property_city}` : ''}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
                    {rp.client_phone && <span><Phone className="w-3 h-3 inline mr-1" />{rp.client_phone}</span>}
                    {rp.client_reported_at && (
                      <span>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(rp.client_reported_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {rp.client_payment_notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--slate)' }}>
                      Nota: &quot;{rp.client_payment_notes}&quot;
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
                    ${rp.amount?.toLocaleString('en-US') || '0'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    Vence: {rp.due_date ? new Date(rp.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' }) : 'N/A'}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {confirmingId === rp.payment_id ? (
                    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <p className="text-xs font-medium" style={{ color: '#166534' }}>
                        Confirmar pago de ${rp.amount?.toLocaleString('en-US')}?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmRtoPayment(rp.payment_id, rp.amount, rp.client_payment_method)}
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
                      onClick={() => setConfirmingId(rp.payment_id)}
                      className="btn-primary btn-sm text-xs whitespace-nowrap"
                      style={{ backgroundColor: '#2563eb' }}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Confirmar pago
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Down Payment Installments Reported */}
      {reportedDpInstallments.length > 0 && (
        <div className="card-luxury overflow-hidden" style={{ border: '2px solid #8b5cf6' }}>
          <div className="p-4 flex items-center gap-3" style={{ backgroundColor: '#f5f3ff' }}>
            <DollarSign className="w-5 h-5" style={{ color: '#7c3aed' }} />
            <div className="flex-1">
              <h3 className="font-serif text-base font-semibold" style={{ color: '#5b21b6' }}>
                Enganches Reportados
              </h3>
              <p className="text-xs" style={{ color: '#7c3aed' }}>
                {reportedDpInstallments.length} cuota{reportedDpInstallments.length !== 1 ? 's' : ''} de enganche pendiente{reportedDpInstallments.length !== 1 ? 's' : ''} de confirmar
              </p>
            </div>
          </div>
          <div className="divide-y" style={{ borderColor: '#ede9fe' }}>
            {reportedDpInstallments.map((inst: any) => (
              <div key={inst.installment_id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{inst.client_name}</p>
                    <span className="badge text-xs" style={{ backgroundColor: '#f5f3ff', color: '#7c3aed' }}>
                      Enganche #{inst.installment_number}
                    </span>
                    <span className="badge text-xs" style={{ backgroundColor: '#f0fdf4', color: '#16a34a' }}>
                      {inst.client_payment_method === 'bank_transfer' ? 'Transferencia' : 'Efectivo'}
                    </span>
                  </div>
                  <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                    {inst.property_address}{inst.property_city ? `, ${inst.property_city}` : ''}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs" style={{ color: 'var(--ash)' }}>
                    {inst.client_phone && <span><Phone className="w-3 h-3 inline mr-1" />{inst.client_phone}</span>}
                    {inst.client_reported_at && (
                      <span>
                        <Clock className="w-3 h-3 inline mr-1" />
                        {new Date(inst.client_reported_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {inst.notes && (
                    <p className="text-xs mt-1 italic" style={{ color: 'var(--slate)' }}>
                      Nota: &quot;{inst.notes}&quot;
                    </p>
                  )}
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>
                    ${inst.amount?.toLocaleString('en-US') || '0'}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>
                    de ${inst.total_down_payment?.toLocaleString('en-US') || 'N/A'} total
                  </p>
                </div>
                <div className="flex-shrink-0">
                  {confirmingId === inst.installment_id ? (
                    <div className="flex flex-col gap-2 p-3 rounded-lg" style={{ backgroundColor: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                      <p className="text-xs font-medium" style={{ color: '#166534' }}>
                        Confirmar enganche de ${inst.amount?.toLocaleString('en-US')}?
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleConfirmDpInstallment(inst.installment_id)}
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
                      onClick={() => setConfirmingId(inst.installment_id)}
                      className="btn-primary btn-sm text-xs whitespace-nowrap"
                      style={{ backgroundColor: '#7c3aed' }}
                    >
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      Confirmar enganche
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
