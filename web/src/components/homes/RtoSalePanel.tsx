'use client'

/**
 * Panel RTO de una venta en Homes (pedido de Sebastian, 2026-10-12):
 *  - Aprobar la solicitud RTO también desde Homes. Usa EXACTAMENTE el mismo
 *    endpoint que Capital (/api/capital/applications/{id}/review), así que la
 *    regla de capacidad de pago, la creación del contrato y todo lo demás es
 *    idéntico se apruebe donde se apruebe.
 *  - Descargar e imprimir el contrato RTO (documento de cierre) en cuanto existe.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Landmark, Loader2, FileDown, CheckCircle2, Clock, XCircle, ExternalLink, AlertTriangle } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'

interface RtoStatus {
  sale: {
    id: string; status: string; client_name: string | null; sale_price: number | null
    down_payment: number | null; monthly_payment: number | null; term_months: number | null; property_id: string | null
  }
  application: { id: string; status: string; reviewed_at: string | null; reviewed_by: string | null; review_notes: string | null } | null
  contract: {
    id: string; status: string; monthly_rent: number; down_payment: number; term_months: number
    purchase_price: number; contract_pdf_url: string | null; signed_at: string | null
  } | null
  affordability: { has_income_data: boolean; cap: number } | null
}

const APP_STATUS: Record<string, { label: string; cls: string; Icon: any }> = {
  submitted: { label: 'Pendiente de aprobar', cls: 'bg-amber-100 text-amber-800', Icon: Clock },
  under_review: { label: 'En revisión', cls: 'bg-amber-100 text-amber-800', Icon: Clock },
  needs_info: { label: 'Falta información', cls: 'bg-amber-100 text-amber-800', Icon: Clock },
  approved: { label: 'Aprobada', cls: 'bg-emerald-100 text-emerald-700', Icon: CheckCircle2 },
  rejected: { label: 'Rechazada', cls: 'bg-red-100 text-red-700', Icon: XCircle },
}

const CONTRACT_STATUS: Record<string, string> = {
  draft: 'Borrador', pending_signature: 'Pendiente de firma', active: 'Activo',
  completed: 'Liquidado', cancelled: 'Cancelado', defaulted: 'En mora',
}

export default function RtoSalePanel({ saleId, onChanged }: { saleId: string; onChanged?: () => void }) {
  const { teamUser } = useAuth()
  const toast = useToast()
  const canApprove = (teamUser?.role || 'admin') === 'admin'
  const [data, setData] = useState<RtoStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [down, setDown] = useState('')
  const [monthly, setMonthly] = useState('')
  const [term, setTerm] = useState('')
  const [confirming, setConfirming] = useState(false)
  const [approving, setApproving] = useState(false)
  const [overrideMsg, setOverrideMsg] = useState('')
  const [overrideReason, setOverrideReason] = useState('')
  const [downloading, setDownloading] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/sales/${saleId}/rto-status`, { cache: 'no-store' })).json()
      if (d.ok) {
        setData(d)
        setDown(String(d.sale.down_payment ?? ''))
        setMonthly(String(d.sale.monthly_payment ?? ''))
        setTerm(String(d.sale.term_months ?? ''))
      }
    } finally {
      setLoading(false)
    }
  }, [saleId])

  useEffect(() => { load() }, [load])

  const approve = async (override = false) => {
    if (!data?.application) return
    const m = parseFloat(monthly), t = parseInt(term), dp = parseFloat(down || '0')
    if (!m || m <= 0 || !t || t <= 0) { toast.error('Mensualidad y plazo son obligatorios'); return }
    if (override && !overrideReason.trim()) { toast.error('Escribe el motivo para aprobar por encima de la capacidad de pago'); return }
    setApproving(true)
    try {
      const body: Record<string, unknown> = {
        status: 'approved',
        monthly_rent: m, term_months: t, down_payment: dp,
        reviewed_by: teamUser?.email || 'homes',
        review_notes: 'Aprobada desde Homes',
      }
      if (override) { body.override_affordability = true; body.override_reason = overrideReason.trim() }
      const res = await fetch(`/api/capital/applications/${data.application.id}/review`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.ok) {
        toast.success('Solicitud RTO aprobada: el contrato ya está creado')
        setConfirming(false); setOverrideMsg(''); setOverrideReason('')
        await load()
        onChanged?.()
        return
      }
      const detail = typeof d.detail === 'string' ? d.detail : (d.error || 'Error al aprobar')
      if (!override && detail.includes('capacidad de pago')) setOverrideMsg(detail)
      else toast.error(detail)
    } catch {
      toast.error('Error de conexión al aprobar')
    } finally {
      setApproving(false)
    }
  }

  const downloadContract = async () => {
    if (!data?.contract) return
    setDownloading(true)
    try {
      const res = await fetch(`/api/capital/contracts/${data.contract.id}/pdf`)
      if (!res.ok) throw new Error()
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Contrato_RTO_${(data.sale.client_name || data.contract.id.slice(0, 8)).replace(/\s+/g, '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('No se pudo generar el contrato')
    } finally {
      setDownloading(false)
    }
  }

  if (loading) {
    return <div className="p-4 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-purple-500" /></div>
  }
  if (!data) return <p className="text-sm text-red-600 p-4">No se pudo cargar el estado RTO.</p>

  const app = data.application
  const st = app ? (APP_STATUS[app.status] || APP_STATUS.submitted) : null
  const pending = app && !['approved', 'rejected'].includes(app.status)
  const cap = data.affordability?.has_income_data && data.affordability.cap > 0 ? data.affordability.cap : null

  return (
    <div className="p-4 bg-purple-50 rounded-xl border border-purple-200 space-y-4" data-testid="rto-panel">
      <h4 className="font-semibold text-purple-800 flex items-center gap-2">
        <Landmark className="w-4 h-4" /> Solicitud y contrato RTO
      </h4>

      {/* Solicitud */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-sm text-purple-900">Solicitud RTO</span>
        {st ? (
          <span className={`text-xs px-2 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${st.cls}`} data-testid="rto-app-status">
            <st.Icon className="w-3 h-3" /> {st.label}
          </span>
        ) : <span className="text-xs text-purple-500">Sin solicitud</span>}
      </div>
      {app?.status === 'approved' && app.reviewed_by && (
        <p className="text-xs text-purple-600 -mt-2">
          Aprobada por {app.reviewed_by}{app.reviewed_at ? ` el ${new Date(app.reviewed_at).toLocaleDateString('es-MX')}` : ''}
        </p>
      )}

      {/* Aprobar desde Homes */}
      {pending && (
        canApprove ? (
          <div className="bg-white rounded-lg p-3 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs text-purple-700 mb-1">Enganche</label>
                <input className="input w-full text-sm" type="number" value={down} onChange={e => setDown(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-purple-700 mb-1">Mensualidad *</label>
                <input className="input w-full text-sm" type="number" value={monthly} onChange={e => setMonthly(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-purple-700 mb-1">Plazo (meses) *</label>
                <input className="input w-full text-sm" type="number" value={term} onChange={e => setTerm(e.target.value)} />
              </div>
            </div>
            {cap != null && (
              <p className={`text-xs ${parseFloat(monthly) > cap ? 'text-red-600' : 'text-purple-600'}`}>
                Capacidad de pago del cliente: {formatMoney(cap)}/mes
                {parseFloat(monthly) > cap && ' — la mensualidad la supera'}
              </p>
            )}
            {overrideMsg ? (
              <div className="space-y-2">
                <p className="text-xs text-red-700 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 flex-none mt-0.5" />{overrideMsg}</p>
                <input className="input w-full text-sm" placeholder="Motivo para aprobar de todos modos (obligatorio)"
                  value={overrideReason} onChange={e => setOverrideReason(e.target.value)} />
                <div className="flex gap-2">
                  <button onClick={() => approve(true)} disabled={approving} className="btn-primary btn-sm">
                    {approving && <Loader2 className="w-4 h-4 animate-spin" />} Aprobar de todos modos
                  </button>
                  <button onClick={() => { setOverrideMsg(''); setOverrideReason('') }} className="btn-ghost btn-sm">Cancelar</button>
                </div>
              </div>
            ) : confirming ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-purple-800">
                  ¿Aprobar con {formatMoney(parseFloat(monthly) || 0)}/mes × {term} meses? Se creará el contrato.
                </span>
                <button onClick={() => approve(false)} disabled={approving} className="btn-primary btn-sm">
                  {approving && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar aprobación
                </button>
                <button onClick={() => setConfirming(false)} disabled={approving} className="btn-ghost btn-sm">Cancelar</button>
              </div>
            ) : (
              <button onClick={() => setConfirming(true)} className="btn-primary btn-sm">
                <CheckCircle2 className="w-4 h-4" /> Aprobar solicitud RTO
              </button>
            )}
            <p className="text-[11px] text-purple-500">
              Es la misma aprobación que en Capital: al aprobar se crea el contrato y queda visible en los dos portales.
            </p>
          </div>
        ) : (
          <p className="text-xs text-purple-600">Pendiente de que un administrador la apruebe (aquí o en Capital).</p>
        )
      )}

      {/* Contrato: documentos de cierre */}
      {data.contract ? (
        <div className="bg-white rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-medium text-purple-900">Contrato RTO</span>
            <span className="text-xs px-2 py-0.5 rounded-full bg-purple-100 text-purple-700" data-testid="rto-contract-status">
              {CONTRACT_STATUS[data.contract.status] || data.contract.status}
            </span>
          </div>
          <p className="text-xs text-purple-600">
            {formatMoney(data.contract.monthly_rent)}/mes × {data.contract.term_months} meses · enganche {formatMoney(data.contract.down_payment)}
          </p>
          <div className="flex flex-wrap gap-2">
            <button onClick={downloadContract} disabled={downloading} className="btn-primary btn-sm" data-testid="rto-download-contract">
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              Descargar contrato para imprimir
            </button>
            {data.contract.contract_pdf_url && (
              <a href={data.contract.contract_pdf_url} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm">
                <ExternalLink className="w-4 h-4" /> Contrato firmado
              </a>
            )}
          </div>
          {data.sale.property_id && (
            <Link href={`/homes/properties/${data.sale.property_id}`} className="text-xs text-purple-700 hover:underline block">
              Bill of Sale y Cambio de Título de la venta → en la ficha de la casa
            </Link>
          )}
        </div>
      ) : app?.status !== 'rejected' && (
        <p className="text-xs text-purple-600">El contrato se crea al aprobar la solicitud; entonces podrás descargarlo aquí para imprimirlo.</p>
      )}
    </div>
  )
}
