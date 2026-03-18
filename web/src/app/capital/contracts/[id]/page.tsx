'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, FileSignature, User, MapPin, DollarSign,
  Calendar, Clock, CheckCircle2, AlertTriangle,
  Percent, TrendingUp, Play, Gift, Award, Download, Shield,
  Scissors, Check, X, Plus, Home, ArrowUpRight, Heart, Star
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface ContractDetail {
  id: string
  sale_id: string
  property_id: string
  client_id: string
  monthly_rent: number
  purchase_price: number
  down_payment: number
  term_months: number
  start_date: string
  end_date: string
  payment_due_day: number
  late_fee_per_day: number
  grace_period_days: number
  nsf_fee: number
  holdover_monthly: number
  status: string
  signed_at: string | null
  contract_pdf_url: string | null
  notes: string | null
  created_at: string
  clients: Record<string, any>
  properties: Record<string, any>
  sales: Record<string, any>
  // Insurance & Tax
  insurance_required: boolean
  insurance_status: string
  insurance_provider: string | null
  insurance_policy_number: string | null
  insurance_expiry: string | null
  tax_responsibility: string
  annual_tax_amount: number | null
  tax_paid_through: string | null
  tax_status: string
}

interface Payment {
  id: string
  payment_number: number
  amount: number
  due_date: string
  paid_date: string | null
  paid_amount: number | null
  payment_method: string | null
  status: string
  late_fee_amount: number
  days_late: number
}

interface Progress {
  payments_made: number
  total_payments: number
  total_paid: number
  total_expected: number
  remaining_balance: number
  percentage: number
}

// Uses Next.js proxy routes (/api/capital/...)

export default function ContractDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [contract, setContract] = useState<ContractDetail | null>(null)
  const [payments, setPayments] = useState<Payment[]>([])
  const [progress, setProgress] = useState<Progress | null>(null)
  const [loading, setLoading] = useState(true)
  const [activating, setActivating] = useState(false)
  const [delivering, setDelivering] = useState(false)
  const [downloadingPdf, setDownloadingPdf] = useState(false)
  // Down payment split
  const [dpInstallments, setDpInstallments] = useState<any[]>([])
  const [dpPaidTotal, setDpPaidTotal] = useState(0)
  const [showDpSplit, setShowDpSplit] = useState(false)
  const [dpParts, setDpParts] = useState<{ amount: string; due_date: string }[]>([
    { amount: '', due_date: '' }, { amount: '', due_date: '' }
  ])
  const [savingDp, setSavingDp] = useState(false)
  // Customer Options
  const [customerOptions, setCustomerOptions] = useState<any>(null)

  useEffect(() => { loadContract() }, [id])

  const loadContract = async () => {
    try {
      const res = await fetch(`/api/capital/contracts/${id}`)
      const data = await res.json()
      if (data.ok) {
        setContract(data.contract)
        setPayments(data.payments)
        setProgress(data.progress)
        loadDownPayment()
        // Load customer options for completed/delivered contracts
        if (['completed', 'delivered'].includes(data.contract?.status)) {
          loadCustomerOptions()
        }
      }
    } catch (err) {
      console.error('Error loading contract:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDownPayment = async () => {
    try {
      const res = await fetch(`/api/capital/contracts/${id}/down-payment`)
      const data = await res.json()
      if (data.ok !== false) {
        setDpInstallments(data.installments || [])
        setDpPaidTotal(data.paid_total || 0)
      }
    } catch (err) {
      console.error('Error loading down payment:', err)
    }
  }

  const loadCustomerOptions = async () => {
    try {
      const res = await fetch(`/api/capital/contracts/${id}/customer-options`)
      const data = await res.json()
      if (data.ok) setCustomerOptions(data)
    } catch (err) {
      console.error('Error loading customer options:', err)
    }
  }

  const handleSaveDpSplit = async () => {
    if (!contract) return
    const installments = dpParts
      .filter(p => p.amount && parseFloat(p.amount) > 0 && p.due_date)
      .map(p => ({ amount: parseFloat(p.amount), due_date: p.due_date }))
    if (installments.length < 2) {
      toast.error('Necesitas al menos 2 parcialidades con monto y fecha')
      return
    }
    const total = installments.reduce((s, p) => s + p.amount, 0)
    if (Math.abs(total - contract.down_payment) > 0.01) {
      toast.error(`Las parcialidades suman $${total.toFixed(2)} pero el enganche es $${contract.down_payment.toFixed(2)}`)
      return
    }
    setSavingDp(true)
    try {
      const res = await fetch(`/api/capital/contracts/${id}/down-payment/split`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installments }),
      })
      const data = await res.json()
      if (data.ok !== false && !data.detail) {
        toast.success('Enganche dividido correctamente')
        setShowDpSplit(false)
        loadDownPayment()
      } else {
        toast.error(data.detail || 'Error al dividir enganche')
      }
    } catch (err) {
      toast.error('Error al dividir enganche')
    } finally {
      setSavingDp(false)
    }
  }

  const handlePayInstallment = async (installmentId: string) => {
    const method = window.prompt('Método de pago (cash, check, transfer, zelle, cashapp):')
    if (!method) return
    try {
      const res = await fetch(`/api/capital/contracts/${id}/down-payment/installments/${installmentId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payment_method: method }),
      })
      const data = await res.json()
      if (data.ok !== false && !data.detail) {
        toast.success('Pago registrado')
        loadDownPayment()
      } else {
        toast.error(data.detail || 'Error al registrar pago')
      }
    } catch (err) {
      toast.error('Error al registrar pago')
    }
  }

  const handleActivate = async () => {
    if (!contract) return
    setActivating(true)
    try {
      const res = await fetch(`/api/capital/contracts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'activate',
          signed_by_client: contract.clients?.name || 'Cliente',
          signed_by_company: 'Maninos Homes LLC'
        })
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`✅ ${data.message}`)
        loadContract()
      } else {
        toast.error(data.detail || 'Error al activar contrato')
      }
    } catch (err) {
      toast.error('Error al activar contrato')
    } finally {
      setActivating(false)
    }
  }

  const handleDeliver = async () => {
    if (!contract) return
    const confirmed = window.confirm(
      '¿Confirmar entrega de título?\n\nEsto transferirá el título al cliente, generará los documentos y le enviará una notificación por email.'
    )
    if (!confirmed) return

    setDelivering(true)
    try {
      const res = await fetch(`/api/capital/contracts/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _action: 'deliver' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message, 5000)
        loadContract()
      } else {
        toast.error(data.detail || 'Error al entregar título')
      }
    } catch (err) {
      toast.error('Error al entregar título')
    } finally {
      setDelivering(false)
    }
  }

  const handleDownloadPdf = async () => {
    setDownloadingPdf(true)
    try {
      const res = await fetch(`/api/capital/contracts/${id}/pdf`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Error' }))
        toast.error(err.error || 'Error al descargar contrato')
        return
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `RTO_Contract_${id?.toString().slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Contrato descargado')
    } catch (err) {
      toast.error('Error al descargar contrato')
    } finally {
      setDownloadingPdf(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!contract) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Contrato no encontrado</div>
  }

  const paymentStatusStyles: Record<string, { bg: string; color: string; label: string }> = {
    scheduled: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Programado' },
    pending: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    paid: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Pagado' },
    late: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Atrasado' },
    partial: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Parcial' },
    client_reported: { bg: '#dbeafe', color: '#1d4ed8', label: 'Reportado por cliente' },
    waived: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Exonerado' },
    failed: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Fallido' },
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Back */}
      <button onClick={() => router.push('/capital/contracts')} className="btn-ghost btn-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a Contratos
      </button>

      {/* Header Card */}
      <div className="card-luxury p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
              Contrato RTO - {contract.clients?.name}
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
              {contract.properties?.address}
            </p>
          </div>
          <ContractStatusBadge status={contract.status} />
        </div>

        {/* Action Buttons Row */}
        <div className="flex items-center gap-3 flex-wrap mt-4 pt-4" style={{ borderTop: '1px solid var(--stone)' }}>
          {/* Download PDF — available for all statuses */}
          <button 
            onClick={handleDownloadPdf}
            disabled={downloadingPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
            style={{ 
              backgroundColor: 'var(--navy-800)',
              opacity: downloadingPdf ? 0.6 : 1 
            }}
          >
            <Download className="w-4 h-4" />
            {downloadingPdf ? 'Generando...' : 'Descargar Contrato PDF'}
          </button>

          {/* View stored PDF if available */}
          {contract.contract_pdf_url && (
            <a
              href={contract.contract_pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold transition-all"
              style={{ color: 'var(--navy-800)', border: '1px solid var(--stone)' }}
            >
              <FileSignature className="w-4 h-4" />
              Ver PDF Guardado
            </a>
          )}

          {contract.status === 'draft' && (
            <button 
              onClick={handleActivate}
              disabled={activating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--success)' }}
            >
              <Play className="w-4 h-4" />
              {activating ? 'Activando...' : 'Activar Contrato'}
            </button>
          )}
          {contract.status === 'completed' && (
            <button 
              onClick={handleDeliver}
              disabled={delivering}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--gold-600)' }}
            >
              <Gift className="w-4 h-4" />
              {delivering ? 'Entregando...' : 'Entregar Título al Cliente'}
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar (for active contracts) */}
      {progress && contract.status === 'active' && (
        <div className="card-luxury p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Progreso</h3>
            <span className="font-serif text-xl font-semibold" style={{ color: 'var(--gold-700)' }}>
              {progress.percentage}%
            </span>
          </div>
          <div className="w-full h-3 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
            <div 
              className="h-3 rounded-full transition-all duration-500"
              style={{ 
                width: `${progress.percentage}%`,
                backgroundColor: progress.percentage >= 100 ? 'var(--success)' : 'var(--gold-500)'
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-sm" style={{ color: 'var(--slate)' }}>
            <span>{progress.payments_made} de {progress.total_payments} pagos</span>
            <span>{fmt(progress.total_paid)} de {fmt(progress.total_expected)}</span>
          </div>
          {progress.remaining_balance > 0 && (
            <div className="mt-4 p-4 rounded-lg" style={{ backgroundColor: 'var(--gold-50, #fffbeb)', border: '1px solid var(--gold-200, #fde68a)' }}>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>Saldo Pendiente</span>
                <span className="text-xl font-bold" style={{ color: 'var(--gold-700)' }}>{fmt(progress.remaining_balance)}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Contract Terms */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Términos del Contrato</h3>
          <div className="space-y-3">
            <InfoRow label="Renta Mensual" value={fmt(contract.monthly_rent)} highlight />
            <InfoRow label="Precio de Compra" value={fmt(contract.purchase_price)} />
            <InfoRow label="Enganche" value={fmt(contract.down_payment)} />
            <InfoRow label="Plazo" value={`${contract.term_months} meses`} />
            <InfoRow label="Inicio" value={new Date(contract.start_date).toLocaleDateString('es-MX')} />
            <InfoRow label="Fin" value={new Date(contract.end_date).toLocaleDateString('es-MX')} />
            <InfoRow label="Día de Pago" value={`Día ${contract.payment_due_day} de cada mes`} />
            <InfoRow label="Periodo de Gracia" value={`${contract.grace_period_days} días`} />
            <InfoRow label="Late Fee" value={`$${contract.late_fee_per_day}/día después de gracia`} />
            <InfoRow label="NSF Fee" value={fmt(contract.nsf_fee)} />
          </div>
        </div>

        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Análisis Financiero</h3>
          <div className="space-y-3">
            <InfoRow label="Ingreso Total (Rentas)" value={fmt(contract.monthly_rent * contract.term_months)} />
            <InfoRow label="+ Enganche" value={fmt(contract.down_payment)} />
            <InfoRow 
              label="= Ingreso Total" 
              value={fmt(contract.monthly_rent * contract.term_months + contract.down_payment)} 
              highlight 
            />
            <div className="my-2 border-t" style={{ borderColor: 'var(--sand)' }} />
            <InfoRow label="Precio Compra (a Homes)" value={fmt(contract.purchase_price)} />
            <InfoRow 
              label="Ganancia" 
              value={fmt(contract.monthly_rent * contract.term_months + contract.down_payment - contract.purchase_price)} 
              highlight 
            />
            <InfoRow 
              label="ROI" 
              value={`${((contract.monthly_rent * contract.term_months + contract.down_payment) / contract.purchase_price * 100 - 100).toFixed(1)}%`}
            />
          </div>
        </div>
      </div>

      {/* Down Payment Split */}
      <div className="card-luxury p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
            <DollarSign className="w-5 h-5 inline mr-1" />
            Enganche: {fmt(contract.down_payment)}
          </h3>
          {dpInstallments.length === 0 && (
            <button
              onClick={() => setShowDpSplit(!showDpSplit)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded text-sm font-semibold text-white transition-all"
              style={{ backgroundColor: 'var(--gold-600)' }}
            >
              <Scissors className="w-4 h-4" />
              Dividir Enganche
            </button>
          )}
        </div>

        {/* Split form */}
        {showDpSplit && dpInstallments.length === 0 && (
          <div className="p-4 rounded-lg mb-4" style={{ backgroundColor: 'var(--cream)' }}>
            <p className="text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
              Dividir ${contract.down_payment.toFixed(2)} en parcialidades
            </p>
            {dpParts.map((part, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-6 text-center" style={{ color: 'var(--slate)' }}>{i + 1}</span>
                <input
                  type="number"
                  placeholder="Monto"
                  value={part.amount}
                  onChange={e => { const p = [...dpParts]; p[i].amount = e.target.value; setDpParts(p) }}
                  className="input text-sm w-32"
                  step="0.01"
                />
                <input
                  type="date"
                  value={part.due_date}
                  onChange={e => { const p = [...dpParts]; p[i].due_date = e.target.value; setDpParts(p) }}
                  className="input text-sm"
                />
                {dpParts.length > 2 && (
                  <button onClick={() => setDpParts(dpParts.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600">
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3">
              <button
                onClick={() => setDpParts([...dpParts, { amount: '', due_date: '' }])}
                className="text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-stone-200 transition-colors"
                style={{ color: 'var(--slate)' }}
              >
                <Plus className="w-3 h-3" /> Agregar parcialidad
              </button>
              <div className="flex-1" />
              <span className="text-xs" style={{ color: 'var(--slate)' }}>
                Total: ${dpParts.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0).toFixed(2)}
              </span>
              <button
                onClick={handleSaveDpSplit}
                disabled={savingDp}
                className="text-xs px-3 py-1.5 rounded text-white font-semibold"
                style={{ backgroundColor: 'var(--gold-600)' }}
              >
                {savingDp ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        )}

        {/* Existing installments */}
        {dpInstallments.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-sm" style={{ color: 'var(--slate)' }}>
                Pagado: {fmt(dpPaidTotal)} de {fmt(contract.down_payment)}
              </span>
              <div className="flex-1 h-2 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
                <div
                  className="h-2 rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, (dpPaidTotal / contract.down_payment) * 100)}%`,
                    backgroundColor: dpPaidTotal >= contract.down_payment ? 'var(--success)' : 'var(--gold-500)',
                  }}
                />
              </div>
            </div>
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Monto</th>
                  <th>Fecha Límite</th>
                  <th>Estado</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {dpInstallments.map((inst: any) => (
                  <tr key={inst.id}>
                    <td>{inst.installment_number}</td>
                    <td>{fmt(inst.amount)}</td>
                    <td>{new Date(inst.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td>
                      <span className="badge text-xs" style={{
                        backgroundColor: inst.status === 'paid' ? 'var(--success-light)' :
                          inst.status === 'client_reported' ? '#dbeafe' : 'var(--warning-light)',
                        color: inst.status === 'paid' ? 'var(--success)' :
                          inst.status === 'client_reported' ? '#1d4ed8' : 'var(--warning)',
                      }}>
                        {inst.status === 'paid' ? 'Pagado' :
                         inst.status === 'client_reported' ? 'Reportado por cliente' : 'Pendiente'}
                      </span>
                    </td>
                    <td>
                      {inst.status === 'scheduled' && (
                        <button
                          onClick={() => handlePayInstallment(inst.id)}
                          className="btn-ghost btn-sm text-xs"
                        >
                          <Check className="w-3 h-3 inline mr-1" />
                          Registrar Pago
                        </button>
                      )}
                      {inst.status === 'client_reported' && (
                        <span className="text-xs font-medium" style={{ color: '#1d4ed8' }}>
                          Confirmar en Pagos
                        </span>
                      )}
                      {inst.status === 'paid' && inst.paid_date && (
                        <span className="text-xs" style={{ color: 'var(--slate)' }}>
                          {new Date(inst.paid_date).toLocaleDateString('es-MX')}
                          {inst.payment_method && ` · ${inst.payment_method}`}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dpInstallments.length === 0 && !showDpSplit && (
          <p className="text-sm" style={{ color: 'var(--slate)' }}>
            El enganche no ha sido dividido en parcialidades.
          </p>
        )}
      </div>

      {/* Delivery Status */}
      {contract.status === 'delivered' && (
        <div className="card-luxury p-6" style={{ borderColor: 'var(--gold-400)', borderWidth: '2px' }}>
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-full flex items-center justify-center flex-shrink-0"
                 style={{ backgroundColor: 'var(--gold-100)' }}>
              <Award className="w-7 h-7" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div className="flex-1">
              <h3 className="font-serif text-xl" style={{ color: 'var(--gold-700)' }}>
                ✅ Título Entregado
              </h3>
              <p style={{ color: 'var(--charcoal)' }}>
                El título de la propiedad ha sido transferido a <strong>{contract.clients?.name}</strong>.
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                Los documentos (Bill of Sale y Título) están disponibles en el portal del cliente.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Customer Options — for completed/delivered contracts */}
      {customerOptions && customerOptions.is_eligible && (
        <div className="card-luxury">
          <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--sand)' }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--gold-100)' }}>
              <Star className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div>
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Opciones Post-Compra</h3>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>Opciones disponibles para el cliente tras completar el contrato</p>
            </div>
          </div>
          <div className="p-5 space-y-4">
            {/* Financial Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Precio Compra</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--charcoal)' }}>
                  {fmt(customerOptions.financial_summary?.purchase_price || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total Pagado</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--success)' }}>
                  {fmt(customerOptions.financial_summary?.total_paid || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Enganche</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--charcoal)' }}>
                  {fmt(customerOptions.financial_summary?.down_payment || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Rentas Pagadas</p>
                <p className="text-lg font-bold mt-1" style={{ color: 'var(--charcoal)' }}>
                  {fmt(customerOptions.financial_summary?.total_rent_paid || 0)}
                </p>
              </div>
            </div>

            {/* Options */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {customerOptions.options?.map((option: any) => (
                <div key={option.key} className="p-4 rounded-xl border" style={{ borderColor: 'var(--stone)' }}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{
                      backgroundColor: option.key === 'repurchase' ? 'var(--info-light)' : 'var(--success-light)',
                    }}>
                      {option.key === 'repurchase' ? (
                        <Home className="w-4.5 h-4.5" style={{ color: 'var(--info)' }} />
                      ) : (
                        <ArrowUpRight className="w-4.5 h-4.5" style={{ color: 'var(--success)' }} />
                      )}
                    </div>
                    <h4 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{option.title}</h4>
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>{option.description}</p>
                  <ul className="space-y-2">
                    {option.details?.map((detail: string, i: number) => (
                      <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                        <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--success)' }} />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                  {option.estimated_discount && (
                    <div className="mt-3 p-2 rounded-md text-sm font-medium text-center" style={{ backgroundColor: 'var(--info-light)', color: 'var(--info)' }}>
                      Descuento estimado: {fmt(option.estimated_discount)}
                    </div>
                  )}
                  {option.credit_amount && (
                    <div className="mt-3 p-2 rounded-md text-sm font-medium text-center" style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                      Credito estimado: {fmt(option.credit_amount)}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Loyalty Programs */}
            {customerOptions.loyalty_programs && (
              <div className="mt-2">
                <h4 className="text-sm font-semibold mb-3 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  <Heart className="w-4 h-4" style={{ color: 'var(--error)' }} />
                  {customerOptions.loyalty_programs.title}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {customerOptions.loyalty_programs.programs?.map((program: any) => (
                    <div key={program.key} className="p-3 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>{program.title}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{program.description}</p>
                      {program.min_bonus && (
                        <p className="text-xs font-semibold mt-2" style={{ color: 'var(--gold-700)' }}>
                          ${program.min_bonus.toLocaleString()} - ${program.max_bonus.toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Workflow Progress */}
      <div className="card-luxury p-6">
        <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Flujo del Contrato</h3>
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          {[
            { key: 'draft', label: 'Borrador', icon: '📝' },
            { key: 'active', label: 'Activo', icon: '✅' },
            { key: 'completed', label: 'Pagos Completados', icon: '💰' },
            { key: 'delivered', label: 'Título Entregado', icon: '🏠' },
          ].map((step, i, arr) => {
            const steps = ['draft', 'pending_signature', 'active', 'completed', 'delivered']
            const currentIdx = steps.indexOf(contract.status)
            const stepIdx = steps.indexOf(step.key)
            const isComplete = stepIdx <= currentIdx
            const isCurrent = step.key === contract.status || 
              (contract.status === 'pending_signature' && step.key === 'draft')
            
            return (
              <div key={step.key} className="flex items-center gap-2 flex-shrink-0">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
                  isCurrent ? 'ring-2 ring-gold-400' : ''
                }`} style={{ 
                  backgroundColor: isComplete ? 'var(--success-light)' : 'var(--cream)',
                  color: isComplete ? 'var(--success)' : 'var(--slate)',
                }}>
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                </div>
                {i < arr.length - 1 && (
                  <div className="w-8 h-0.5 flex-shrink-0" style={{ 
                    backgroundColor: isComplete ? 'var(--success)' : 'var(--stone)' 
                  }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Insurance & Tax Tracking */}
      {contract.status === 'active' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <Shield className="w-5 h-5" /> Seguro
            </h3>
            <div className="space-y-3">
              <InfoRow label="Requerido" value={contract.insurance_required ? 'Sí' : 'No'} />
              <InfoRow label="Estado" value={
                contract.insurance_status === 'active' ? '✅ Activo' :
                contract.insurance_status === 'expired' ? '🔴 Vencido' :
                contract.insurance_status === 'waived' ? '⚪ Exonerado' : '🟡 Pendiente'
              } highlight={contract.insurance_status === 'expired'} />
              {contract.insurance_provider && (
                <InfoRow label="Proveedor" value={contract.insurance_provider} />
              )}
              {contract.insurance_policy_number && (
                <InfoRow label="Póliza #" value={contract.insurance_policy_number} />
              )}
              {contract.insurance_expiry && (
                <InfoRow label="Vencimiento" value={new Date(contract.insurance_expiry).toLocaleDateString('es-MX')} />
              )}
            </div>
          </div>

          <div className="card-luxury p-6">
            <h3 className="font-serif text-lg mb-4 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
              <DollarSign className="w-5 h-5" /> Impuestos
            </h3>
            <div className="space-y-3">
              <InfoRow label="Responsable" value={
                contract.tax_responsibility === 'tenant' ? 'Inquilino' :
                contract.tax_responsibility === 'landlord' ? 'Propietario' : 'Compartido'
              } />
              <InfoRow label="Estado" value={
                contract.tax_status === 'current' ? '✅ Al día' :
                contract.tax_status === 'overdue' ? '🔴 Vencido' : '🟢 Adelantado'
              } highlight={contract.tax_status === 'overdue'} />
              {contract.annual_tax_amount && (
                <InfoRow label="Monto Anual" value={fmt(contract.annual_tax_amount)} />
              )}
              {contract.tax_paid_through && (
                <InfoRow label="Pagado hasta" value={new Date(contract.tax_paid_through).toLocaleDateString('es-MX')} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Payment Schedule */}
      {payments.length > 0 && (
        <div className="card-luxury">
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
            <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
              Calendario de Pagos ({payments.length})
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Vencimiento</th>
                  <th>Monto</th>
                  <th>Estado</th>
                  <th>Pagado</th>
                  <th>Late Fee</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => {
                  const ps = paymentStatusStyles[p.status] || paymentStatusStyles.scheduled
                  return (
                    <tr key={p.id}>
                      <td className="font-medium">{p.payment_number}</td>
                      <td>{new Date(p.due_date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td>{fmt(p.amount)}</td>
                      <td>
                        <span className="badge text-xs" style={{ backgroundColor: ps.bg, color: ps.color }}>
                          {ps.label}
                        </span>
                      </td>
                      <td>
                        {p.paid_amount ? (
                          <span style={{ color: 'var(--success)' }}>{fmt(p.paid_amount)}</span>
                        ) : (
                          <span style={{ color: 'var(--ash)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {p.late_fee_amount > 0 ? (
                          <span style={{ color: 'var(--error)' }}>{fmt(p.late_fee_amount)}</span>
                        ) : (
                          <span style={{ color: 'var(--ash)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {['pending', 'late', 'scheduled', 'client_reported'].includes(p.status) && (
                          <button 
                            onClick={() => router.push(`/capital/payments?record=${p.id}`)}
                            className="btn-ghost btn-sm text-xs"
                          >
                            {p.status === 'client_reported' ? 'Confirmar Pago' : 'Registrar Pago'}
                          </button>
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
    </div>
  )
}

function InfoRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5 border-b" style={{ borderColor: 'var(--sand)' }}>
      <span className="text-sm" style={{ color: 'var(--slate)' }}>{label}</span>
      <span className="text-sm font-medium" style={{ color: highlight ? 'var(--gold-700)' : 'var(--charcoal)' }}>
        {value}
      </span>
    </div>
  )
}

function ContractStatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Borrador' },
    pending_signature: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente Firma' },
    active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activo' },
    completed: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Pagos Completados' },
    delivered: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: '✅ Entregado' },
    defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Incumplimiento' },
    terminated: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Terminado' },
  }
  const s = styles[status] || styles.draft
  return <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>{s.label}</span>
}

