'use client'

/**
 * Autorización de compra de una casa (Comité + VoBo), visible donde se trabaja
 * la casa: ficha de Casas Financiadas y Cálculo RTO de Clientes RTO.
 * Muestra la propuesta más relevante (la aprobada si la hay, si no la última),
 * sus términos y el acta, y avisa si los términos de la venta/contrato no
 * coinciden con lo autorizado.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Gavel, AlertTriangle, FileDown } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { pct } from '@/components/capital/evaluacionCompra'

interface Prop {
  id: string; status: string; precio: number; enganche: number; plazo_meses: number; mensualidad: number
  margen_anual: number | null; semaforo: string | null; version: number; requested_at: string | null
  decided_by: string | null; decided_at: string | null; created_by: string | null
}

const ESTADO: Record<string, { label: string; color: string }> = {
  borrador: { label: 'Borrador (sin enviar al comité)', color: 'var(--slate)' },
  en_comite: { label: 'En comité', color: 'var(--info, #2563eb)' },
  en_vobo: { label: 'Pendiente de VoBo', color: 'var(--gold-700)' },
  ajustes: { label: 'Ajustes pedidos', color: 'var(--warning, #b7791f)' },
  aprobada: { label: 'Aprobada', color: 'var(--success)' },
  rechazada: { label: 'Rechazada', color: 'var(--danger)' },
}

export default function AutorizacionCasa({ propertyId, terminos }: {
  propertyId: string | null | undefined
  /** Términos con los que se está vendiendo/contratando, para compararlos. */
  terminos?: { precio?: number | null; enganche?: number | null; mensualidad?: number | null; plazo_meses?: number | null }
}) {
  const [prop, setProp] = useState<Prop | null>(null)
  const [cargado, setCargado] = useState(false)

  useEffect(() => {
    if (!propertyId) { setCargado(true); return }
    fetch(`/api/capital/purchase-proposals?property_id=${propertyId}&limit=20`, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        const lista: Prop[] = d.proposals || []
        setProp(lista.find(p => p.status === 'aprobada') || lista[0] || null)
      })
      .catch(() => {})
      .finally(() => setCargado(true))
  }, [propertyId])

  if (!cargado || !propertyId) return null

  const dif: string[] = []
  if (prop && prop.status === 'aprobada' && terminos) {
    const cmp = (a: number | null | undefined, b: number) => a != null && Math.abs(Number(a) - Number(b)) > 0.5
    if (cmp(terminos.mensualidad, prop.mensualidad)) dif.push(`renta ${formatMoney(Number(terminos.mensualidad))} (autorizada ${formatMoney(prop.mensualidad)})`)
    if (cmp(terminos.plazo_meses, prop.plazo_meses)) dif.push(`plazo ${terminos.plazo_meses} meses (autorizado ${prop.plazo_meses})`)
    if (cmp(terminos.precio, prop.precio)) dif.push(`precio ${formatMoney(Number(terminos.precio))} (autorizado ${formatMoney(prop.precio)})`)
    if (cmp(terminos.enganche, prop.enganche)) dif.push(`enganche ${formatMoney(Number(terminos.enganche))} (autorizado ${formatMoney(prop.enganche)})`)
  }

  return (
    <div className="card-luxury p-5" data-testid="autorizacion-casa">
      <h2 className="font-serif text-lg mb-2 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <Gavel className="w-4 h-4" style={{ color: 'var(--gold-700)' }} /> Autorización de compra
      </h2>
      {!prop ? (
        <p className="text-sm" style={{ color: 'var(--slate)' }} data-testid="sin-autorizacion">
          Esta casa no tiene una propuesta de compra en el comité.{' '}
          <Link href="/capital/evaluar-compra" className="underline" style={{ color: 'var(--gold-700)' }}>Crear propuesta</Link>
        </p>
      ) : (
        <div className="space-y-2 text-sm">
          <p>
            <strong style={{ color: (ESTADO[prop.status] || ESTADO.borrador).color }} data-testid="autorizacion-estado">
              {(ESTADO[prop.status] || ESTADO.borrador).label}
            </strong>
            <span style={{ color: 'var(--ash)' }}>
              {prop.decided_at ? ` · ${prop.decided_by || ''} el ${new Date(prop.decided_at).toLocaleDateString('es-MX')}` : ''}
              {prop.version > 1 ? ` · versión ${prop.version}` : ''}
            </span>
          </p>
          <p style={{ color: 'var(--slate)' }}>
            {prop.status === 'aprobada' ? 'Autorizado: ' : 'Propuesto: '}
            precio {formatMoney(prop.precio)} · enganche {formatMoney(prop.enganche)} · renta {formatMoney(prop.mensualidad)} × {prop.plazo_meses} meses · margen {pct(prop.margen_anual)}
          </p>
          {dif.length > 0 && (
            <p className="flex items-start gap-1.5 text-sm" style={{ color: 'var(--danger)' }} data-testid="autorizacion-difiere">
              <AlertTriangle className="w-4 h-4 flex-none mt-0.5" />
              No coincide con lo autorizado: {dif.join('; ')}.
            </p>
          )}
          <div className="flex flex-wrap gap-3 pt-1">
            <Link href="/capital/autorizaciones" className="text-xs underline" style={{ color: 'var(--gold-700)' }}>Ver en Autorizar compra</Link>
            {prop.requested_at && (
              <a href={`/api/capital/purchase-proposals/${prop.id}/acta`} className="text-xs underline inline-flex items-center gap-1" style={{ color: 'var(--gold-700)' }}>
                <FileDown className="w-3 h-3" /> Acta de comité
              </a>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
