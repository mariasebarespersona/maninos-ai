'use client'

/**
 * Modal de confirmación para eliminar una operación RTO completa (cliente RTO /
 * casa financiada). Muestra el PREVIEW real de lo que se borrará (conteos +
 * impacto contable) y exige escribir ELIMINAR para ejecutar. Compartido entre
 * Clientes RTO y Casas Financiadas.
 */

import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n || 0)

const COUNT_LABELS: Record<string, string> = {
  solicitudes: 'Solicitudes RTO',
  contratos: 'Contratos',
  pagos_cronograma: 'Mensualidades del cronograma',
  pagos_cobrados: '· de las cuales ya cobradas',
  cuotas_enganche: 'Cuotas de enganche',
  facturas_capital: 'Facturas Capital',
  asientos_capital: 'Asientos contables Capital',
  flujos_capital: 'Flujos de capital',
  ordenes_capital: 'Órdenes de pago Capital',
  facturas_homes: 'Facturas Homes',
  asientos_homes: 'Asientos contables Homes',
  comisiones: 'Pagos de comisión',
  pagos_venta: 'Pagos de venta',
  ordenes_homes: 'Órdenes de pago Homes',
  traspasos_titulo: 'Traspasos de título',
  inversionistas_a_desasignar: 'Inversionistas a DESASIGNAR (no se borran)',
}

export default function DeleteChainModal({
  saleId,
  onClose,
  onDeleted,
}: {
  saleId: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [preview, setPreview] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    fetch(`/api/capital/rto-chain/${saleId}/preview`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setPreview(d); else setError(d.detail || d.error || 'Error cargando el preview') })
      .catch(() => setError('No se pudo cargar el preview'))
      .finally(() => setLoading(false))
  }, [saleId])

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/capital/rto-chain/${saleId}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Error eliminando')
      onDeleted()
    } catch (e: any) {
      setError(e.message || 'Error eliminando la operación')
      setDeleting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
      <div className="card-luxury p-6 w-full max-w-lg space-y-4 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: 'white' }}>
        <h3 className="font-serif text-lg flex items-center gap-2" style={{ color: 'var(--error)' }}>
          <Trash2 className="w-5 h-5" /> Eliminar operación RTO completa
        </h3>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
        ) : error ? (
          <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>{error}</div>
        ) : preview && (
          <>
            <div className="rounded-lg p-3 text-sm" style={{ backgroundColor: 'var(--cream)' }}>
              <p style={{ color: 'var(--ink)' }}>
                <strong>{preview.client_name || 'Cliente'}</strong> — {preview.property_address || 'sin dirección'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                La casa se va a <strong>{preview.property_action}</strong>. El cliente se conserva.
              </p>
            </div>

            <div className="rounded-lg p-3 flex items-start gap-2 text-xs"
                 style={{ backgroundColor: 'var(--error-light)', color: 'var(--charcoal)' }}>
              <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--error)' }} />
              <span>
                Se elimina TODO lo ligado a esta operación en ambos portales, contabilidad incluida
                {(preview.accounting_impact?.capital_confirmado > 0 || preview.accounting_impact?.homes_confirmado > 0) && (
                  <> — asientos CONFIRMADOS afectados: Capital {fmt(preview.accounting_impact.capital_confirmado)},
                  Homes {fmt(preview.accounting_impact.homes_confirmado)} (los saldos bancarios derivados cambiarán)</>
                )}. Se guarda un backup completo antes de borrar. El dinero de inversionistas nunca se toca (solo se desasigna de la casa).
              </span>
            </div>

            <div className="divide-y rounded-lg border text-sm" style={{ borderColor: 'var(--sand)' }}>
              {Object.entries(preview.counts as Record<string, number>)
                .filter(([, v]) => v > 0)
                .map(([k, v]) => (
                  <div key={k} className="flex justify-between px-3 py-1.5">
                    <span style={{ color: 'var(--slate)' }}>{COUNT_LABELS[k] || k}</span>
                    <span className="font-semibold" style={{ color: 'var(--charcoal)' }}>{v}</span>
                  </div>
                ))}
            </div>

            <div>
              <label className="label">Escribe <strong>ELIMINAR</strong> para confirmar</label>
              <input className="input w-full" value={confirmText} onChange={e => setConfirmText(e.target.value)}
                     placeholder="ELIMINAR" autoFocus />
            </div>

            <div className="flex justify-end gap-2">
              <button className="btn-ghost btn-sm" onClick={onClose} disabled={deleting}>Cancelar</button>
              <button
                className="btn-sm px-4 py-2 rounded-md text-sm font-semibold text-white"
                style={{ backgroundColor: 'var(--error)', opacity: confirmText === 'ELIMINAR' && !deleting ? 1 : 0.5 }}
                disabled={confirmText !== 'ELIMINAR' || deleting}
                onClick={handleDelete}
              >
                {deleting ? 'Eliminando…' : 'Eliminar Definitivamente'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
