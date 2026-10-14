'use client'

/**
 * Piezas compartidas de "Evaluar compra" (Capital): la usan el checklist de
 * cada casa financiada y la calculadora de compra para casas que aún no están
 * en la app (de Homes, de terceros o recompras a clientes).
 */

import { useState } from 'react'
import { CheckCircle2, XCircle, HelpCircle } from 'lucide-react'
import { formatMoney } from '@/lib/money'

export type Estado = 'cumple' | 'no_cumple' | 'sin_datos' | 'sin_valor' | 'sin_precio'

export interface EvaluacionCompra {
  precio: number | null
  enganche: number
  mensualidad: number | null
  plazo_meses: number | null
  inversion_neta: number | null
  rentabilidad: {
    minima: number
    anual: number | null
    total_plazo: number | null
    renta_minima: number | null
    precio_maximo: number | null
    estado: Estado
    sobre_costo_total: { anual: number; total_plazo: number } | null
  }
  renta: {
    mercado: number | null
    fuente: string | null
    mensualidad_vs_mercado: number | null
    estado: Estado
  }
  mercado: {
    valor: number | null
    fuente: 'manual' | 'cartera' | 'mercado' | null
    compra_vs_valor: number | null
    estado: Estado
    venta_rto_vs_valor: number | null
  }
  coste_homes?: { coste: number | null; margen: number | null; margen_pct: number | null; regla: null }
}

export interface Comparable { referencia: string | null; precio: number; sqft: number; year: number | null; precio_sqft: number }

export interface ValorAutomatico {
  ok: boolean
  metodo: string | null
  valor: number | null
  rango_min: number | null
  rango_max: number | null
  confianza: string | null
  n_comparables: number
  comparables: Comparable[]
  motivo: string | null
}

interface Resumen { n: number; mediana: number; p25: number; p75: number }
export interface Referencias {
  ventas_homes: Resumen | null
  compras_homes: Resumen | null
  ventas_homes_comparables: boolean
  compras_capital: Resumen | null
}

export const FUENTE_VALOR: Record<string, string> = {
  manual: 'valor manual del responsable',
  cartera: 'histórico de ventas de Maninos',
  mercado: 'anuncios del mercado',
}

export const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`)

export function Veredicto({ estado, ok, ko, sinDatos, detalle, testId }: {
  estado: Estado; ok: string; ko: string; sinDatos: string; detalle?: string; testId?: string
}) {
  const v = estado === 'cumple'
    ? { Icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-light)', text: ok }
    : estado === 'no_cumple'
      ? { Icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-light, #fdecec)', text: ko }
      : { Icon: HelpCircle, color: 'var(--warning)', bg: 'var(--warning-light, #fdf6e3)', text: sinDatos }
  return (
    <div className="flex items-start gap-2 rounded-lg p-3" style={{ backgroundColor: v.bg }} data-testid={testId}>
      <v.Icon className="w-5 h-5 flex-none" style={{ color: v.color }} />
      <div className="text-sm">
        <p className="font-medium" style={{ color: 'var(--ink)' }}>{v.text}</p>
        {detalle && <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{detalle}</p>}
      </div>
    </div>
  )
}

/** Las referencias que pide Capital: ventas de Homes, compras de Homes y lo que ha pagado Capital. */
export function ReferenciasHistoricas({ refs, precio }: { refs: Referencias; precio: number | null }) {
  const filas: [string, Resumen | null][] = [
    [`Ventas de Homes${refs.ventas_homes_comparables ? ' (casas comparables)' : ''}`, refs.ventas_homes],
    [`Compras de Homes${refs.ventas_homes_comparables ? ' (casas comparables)' : ''}`, refs.compras_homes],
    ['Lo que ha pagado Capital (ventas RTO)', refs.compras_capital],
  ]
  return (
    <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--sand-50, #faf8f4)', border: '1px solid var(--sand)' }}>
      <p className="font-medium mb-2" style={{ color: 'var(--ink)' }}>Históricos de referencia</p>
      <div className="space-y-1">
        {filas.map(([label, r]) => (
          <div key={label} className="flex flex-wrap justify-between gap-x-4" style={{ color: 'var(--slate)' }}>
            <span>{label}</span>
            {r ? (
              <span>
                <strong style={{ color: 'var(--ink)' }}>{formatMoney(r.mediana)}</strong>
                <span className="text-xs" style={{ color: 'var(--ash)' }}> mediana · {formatMoney(r.p25)} – {formatMoney(r.p75)} · {r.n} casas</span>
                {precio ? <span className="text-xs"> · tu precio: {pct(precio / r.mediana)}</span> : null}
              </span>
            ) : <span>—</span>}
          </div>
        ))}
      </div>
      {!refs.ventas_homes_comparables && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--ash)' }}>
          Sin superficie de la casa no se puede filtrar a casas comparables: son medianas de todas las operaciones.
        </p>
      )}
    </div>
  )
}

export function ComparablesTable({ auto }: { auto: ValorAutomatico }) {
  const [show, setShow] = useState(false)
  return (
    <>
      <p style={{ color: 'var(--slate)' }}>
        {formatMoney(auto.valor || 0)}
        {auto.rango_min != null && auto.rango_max != null && ` (probable ${formatMoney(auto.rango_min)} – ${formatMoney(auto.rango_max)})`}
        {' · '}{auto.n_comparables} comparables de {FUENTE_VALOR[auto.metodo || ''] || auto.metodo} · confianza {auto.confianza}
      </p>
      <button onClick={() => setShow(s => !s)} className="text-xs underline mt-1" style={{ color: 'var(--gold-700)' }}>
        {show ? 'Ocultar comparables' : 'Ver comparables'}
      </button>
      {show && (
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ color: 'var(--ash)' }}>
                <th className="text-left py-1 pr-3">Referencia</th>
                <th className="text-right py-1 pr-3">Precio</th>
                <th className="text-right py-1 pr-3">sqft</th>
                <th className="text-right py-1 pr-3">Año</th>
                <th className="text-right py-1">$/sqft</th>
              </tr>
            </thead>
            <tbody>
              {auto.comparables.map((c, i) => (
                <tr key={i} className="border-t" style={{ borderColor: 'var(--sand)', color: 'var(--slate)' }}>
                  <td className="py-1 pr-3">{c.referencia || '—'}</td>
                  <td className="text-right py-1 pr-3">{formatMoney(c.precio)}</td>
                  <td className="text-right py-1 pr-3">{c.sqft}</td>
                  <td className="text-right py-1 pr-3">{c.year || '—'}</td>
                  <td className="text-right py-1">{formatMoney(c.precio_sqft)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

// ── Calcular renta y margen ─────────────────────────────────────────────────
export interface RentaMargen {
  costo_fondeo: number | null
  objetivo: number
  semaforo: 'rojo' | 'amarillo' | 'verde' | 'sin_datos'
  rentas_por_plazo: {
    plazo_meses: number; renta_sugerida: number | null; renta_minima_fondeo: number | null
    cobro_total: number | null; margen_anual: number | null
  }[]
  fondeo: { estado: 'ok' | 'insuficiente' | 'sin_datos'; necesario: number | null; disponible: number | null; despues?: number }
}

const SEMAFORO = {
  verde: { bg: 'var(--success-light)', color: 'var(--success)', txt: 'llega al objetivo' },
  amarillo: { bg: 'var(--warning-light, #fdf6e3)', color: 'var(--warning, #b7791f)', txt: 'cubre el fondeo pero no llega al objetivo' },
  rojo: { bg: 'var(--danger-light, #fdecec)', color: 'var(--danger)', txt: 'NO cubre el costo del fondeo' },
  sin_datos: { bg: 'var(--cream)', color: 'var(--slate)', txt: 'escribe una mensualidad para calcularlo' },
} as const

/** Margen anual frente al fondeo (semáforo), renta sugerida por plazo y
 *  fondeo disponible. `onElegir` permite usar una fila (plazo + renta). */
export function RentaMargenPanel({ rm, margen, onElegir, plazoActual }: {
  rm: RentaMargen; margen: number | null; onElegir?: (plazo: number, renta: number) => void; plazoActual?: number | null
}) {
  const s = SEMAFORO[rm.semaforo] || SEMAFORO.sin_datos
  return (
    <div className="space-y-3" data-testid="renta-margen">
      <div className="rounded-lg p-3 flex flex-wrap items-center gap-x-6 gap-y-1" style={{ backgroundColor: s.bg }}>
        <div>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>Margen anual</p>
          <p className="font-serif text-2xl" style={{ color: s.color }} data-testid="margen-anual">{pct(margen)}</p>
        </div>
        <p className="text-sm" style={{ color: 'var(--charcoal)' }}>
          <strong style={{ color: s.color }} data-testid="semaforo">{s.txt}</strong>
          <span className="block text-xs" style={{ color: 'var(--slate)' }}>
            Costo del fondeo {pct(rm.costo_fondeo)} (pagarés vivos) · objetivo {pct(rm.objetivo)}
          </span>
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs" style={{ color: 'var(--ash)' }}>
              <th className="text-left py-1 pr-3">Plazo</th>
              <th className="text-right py-1 pr-3">Renta sugerida ({pct(rm.objetivo)})</th>
              <th className="text-right py-1 pr-3">Mínima que cubre el fondeo</th>
              <th className="text-right py-1 pr-3">Cobro total</th>
              {onElegir && <th />}
            </tr>
          </thead>
          <tbody>
            {rm.rentas_por_plazo.map(r => (
              <tr key={r.plazo_meses} className="border-t" style={{ borderColor: 'var(--sand)', backgroundColor: plazoActual === r.plazo_meses ? 'var(--gold-100, #fdf6e3)' : undefined }}
                  data-testid={`plazo-${r.plazo_meses}`}>
                <td className="py-1.5 pr-3 font-medium" style={{ color: 'var(--ink)' }}>{r.plazo_meses} meses</td>
                <td className="text-right py-1.5 pr-3 font-semibold" style={{ color: 'var(--ink)' }}>{r.renta_sugerida != null ? formatMoney(r.renta_sugerida) : '—'}</td>
                <td className="text-right py-1.5 pr-3" style={{ color: 'var(--slate)' }}>{r.renta_minima_fondeo != null ? formatMoney(r.renta_minima_fondeo) : '—'}</td>
                <td className="text-right py-1.5 pr-3" style={{ color: 'var(--slate)' }}>{r.cobro_total != null ? formatMoney(r.cobro_total) : '—'}</td>
                {onElegir && (
                  <td className="text-right py-1.5">
                    {r.renta_sugerida != null && (
                      <button onClick={() => onElegir(r.plazo_meses, r.renta_sugerida as number)} className="text-xs underline" style={{ color: 'var(--gold-700)' }}>
                        Usar
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm" data-testid="fondeo-check" style={{ color: rm.fondeo.estado === 'insuficiente' ? 'var(--danger)' : 'var(--slate)' }}>
        {rm.fondeo.estado === 'ok' && <>Fondeo disponible: {formatMoney(rm.fondeo.disponible || 0)} de inversionistas; esta casa necesita {formatMoney(rm.fondeo.necesario || 0)}.</>}
        {rm.fondeo.estado === 'insuficiente' && <>No hay fondeo suficiente: esta casa necesita {formatMoney(rm.fondeo.necesario || 0)} y hay {formatMoney(rm.fondeo.disponible || 0)} disponibles.</>}
        {rm.fondeo.estado === 'sin_datos' && <>No se pudo comprobar el fondeo disponible.</>}
      </p>
    </div>
  )
}
