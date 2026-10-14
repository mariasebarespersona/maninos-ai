'use client'

/**
 * Checklist de la casa — "Evaluar compra" (Responsable de Adquisiciones).
 *
 * Criterio de Capital: mínimo 30% ANUAL sobre lo que pone Capital (precio −
 * enganche), sumado sin capitalizar (3 años = 90%); ese 30% fija la renta. Y la
 * compra no puede estar por encima del valor de mercado. El valor sale del
 * valor manual del responsable (prevalece), del histórico de ventas de Maninos
 * o de los anuncios scrapeados. En casas de Homes se enseña además el precio
 * frente a su coste, sin veredicto: esa regla de Homes está pendiente.
 */

import { useCallback, useEffect, useState } from 'react'
import { Scale, Pencil, Trash2, Loader2, Info } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/components/Auth/AuthProvider'
import {
  EvaluacionCompra, Referencias, ValorAutomatico, Veredicto, ReferenciasHistoricas, ComparablesTable,
  FUENTE_VALOR, pct, RentaMargen,
} from '@/components/capital/evaluacionCompra'

interface PriceEvaluation {
  evaluacion: EvaluacionCompra & { casa_de_homes: boolean }
  automatico: ValorAutomatico
  referencias: Referencias
  renta_margen?: RentaMargen
  manual: {
    market_value: number | null; source: string | null; market_rent: number | null; rent_source: string | null
    notes: string | null; evaluated_by: string | null; evaluated_at: string
  } | null
  sqft_registrado: boolean
  falta_migracion: boolean
}

export default function PriceVsMarketCard({ saleId }: { saleId: string }) {
  const { user } = useAuth()
  const [data, setData] = useState<PriceEvaluation | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [source, setSource] = useState('')
  const [rent, setRent] = useState('')
  const [rentSource, setRentSource] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/capital/financed-houses/${saleId}/price-evaluation`, { cache: 'no-store' })).json()
      if (d.ok) setData(d)
    } catch { /* la tarjeta simplemente no aparece */ }
  }, [saleId])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    setValue(data?.manual?.market_value ? String(data.manual.market_value) : '')
    setSource(data?.manual?.source || '')
    setRent(data?.manual?.market_rent ? String(data.manual.market_rent) : '')
    setRentSource(data?.manual?.rent_source || '')
    setNotes(data?.manual?.notes || '')
    setError('')
    setEditing(true)
  }

  const save = async () => {
    setError('')
    const v = parseFloat(value.replace(/[$,\s]/g, '')) || null
    const rr = parseFloat(rent.replace(/[$,\s]/g, '')) || null
    if (!v && !rr) { setError('Escribe el valor de mercado, la renta de mercado o los dos'); return }
    if (v && !source.trim()) { setError('Indica de dónde sale el valor (comparables, tasación…)'); return }
    if (rr && !rentSource.trim()) { setError('Indica de dónde sale la renta de mercado (anuncios de renta, comparables…)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/price-evaluation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          market_value: v, source: source.trim() || null,
          market_rent: rr, rent_source: rentSource.trim() || null,
          notes: notes.trim() || null, evaluated_by: user?.email || null,
        }),
      })
      const d = await res.json()
      if (!res.ok || !d.ok) { setError(d.detail || 'No se pudo guardar'); return }
      setData(d)
      setEditing(false)
    } catch {
      setError('No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  const clear = async () => {
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/price-evaluation`, { method: 'DELETE' })
      const d = await res.json()
      if (res.ok && d.ok) setData(d)
    } finally {
      setSaving(false)
    }
  }

  if (!data) return null
  const ev = data.evaluacion
  const r = ev.rentabilidad
  const m = ev.mercado
  const rt = ev.renta

  return (
    <div className="card-luxury p-5" data-testid="price-vs-market">
      <h2 className="font-serif text-lg mb-1 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <Scale className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />
        Checklist · Evaluar compra
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
        Responsable de Adquisiciones. Mínimo {pct(r.minima)} anual sobre lo que pone Capital (precio − enganche),
        la compra por debajo del valor de mercado y la renta del cliente no por encima de la de mercado.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <Veredicto
          testId="eval-rentabilidad"
          estado={r.estado}
          ok={`Rentabilidad ${pct(r.anual)} anual: llega al ${pct(r.minima)}`}
          ko={`Rentabilidad ${pct(r.anual)} anual: no llega al ${pct(r.minima)}`}
          sinDatos="Faltan mensualidad o plazo para calcular la rentabilidad"
          detalle={r.anual != null ? `${pct(r.total_plazo)} en ${ev.plazo_meses} meses` : undefined}
        />
        <Veredicto
          testId="eval-mercado"
          estado={m.estado}
          ok="Compra por debajo del valor de mercado"
          ko="Compra no queda por debajo del valor de mercado"
          sinDatos={m.estado === 'sin_precio' ? 'La venta no tiene precio registrado' : 'Sin valor de mercado: no se puede comparar todavía'}
          detalle={m.valor && m.fuente ? `Valor según ${FUENTE_VALOR[m.fuente]}` : undefined}
        />
        <Veredicto
          testId="eval-renta"
          estado={rt.estado}
          ok={`Renta dentro de mercado (${pct(rt.mensualidad_vs_mercado)} de la de mercado)`}
          ko={`Renta por encima de mercado (${pct(rt.mensualidad_vs_mercado)} de la de mercado)`}
          sinDatos={rt.estado === 'sin_datos' ? 'Falta la mensualidad del cliente' : 'Sin renta de mercado: escríbela a mano abajo'}
          detalle={rt.mercado ? `Renta de mercado ${formatMoney(rt.mercado)}${rt.fuente ? ` · ${rt.fuente}` : ''}` : undefined}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
        <Dato label="Precio de compra" value={ev.precio ? formatMoney(ev.precio) : '—'} />
        <Dato label="Enganche" value={formatMoney(ev.enganche)} />
        <Dato label="Pone Capital" value={ev.inversion_neta ? formatMoney(ev.inversion_neta) : '—'} />
        <Dato label="Mensualidad · plazo" value={ev.mensualidad ? `${formatMoney(ev.mensualidad)} × ${ev.plazo_meses ?? '—'}` : '—'} />
        <Dato label={`Renta mínima (${pct(r.minima)})`} value={r.renta_minima ? formatMoney(r.renta_minima) : '—'} strong />
        <Dato label="Precio máximo con esta renta" value={r.precio_maximo ? formatMoney(r.precio_maximo) : '—'} strong />
        <Dato label="Margen s/ costo total (anual)" value={r.sobre_costo_total ? pct(r.sobre_costo_total.anual) : '—'} strong />
        <Dato label="Margen s/ costo total (plazo)" value={r.sobre_costo_total ? pct(r.sobre_costo_total.total_plazo) : '—'} />
        <Dato label="Valor de mercado" value={m.valor ? formatMoney(m.valor) : '—'} />
        <Dato label="Compra / valor" value={pct(m.compra_vs_valor)} />
      </div>

      {data.renta_margen && (
        <p className="text-sm mb-4" data-testid="eval-fondeo" style={{
          color: data.renta_margen.semaforo === 'rojo' ? 'var(--danger)' : data.renta_margen.semaforo === 'verde' ? 'var(--success)' : 'var(--warning, #b7791f)',
        }}>
          {data.renta_margen.semaforo === 'rojo' && <>Margen {pct(r.anual)}: no cubre el costo del fondeo ({pct(data.renta_margen.costo_fondeo)}).</>}
          {data.renta_margen.semaforo === 'amarillo' && <>Margen {pct(r.anual)}: cubre el costo del fondeo ({pct(data.renta_margen.costo_fondeo)}) pero no llega al {pct(data.renta_margen.objetivo)}.</>}
          {data.renta_margen.semaforo === 'verde' && <>Margen {pct(r.anual)}: por encima del fondeo ({pct(data.renta_margen.costo_fondeo)}) y del objetivo.</>}
        </p>
      )}

      {m.venta_rto_vs_valor != null && (
        <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>
          Precio de venta RTO al cliente: {pct(m.venta_rto_vs_valor)} del valor de mercado (informativo).
        </p>
      )}

      {/* Casas de Homes: precio vs. su coste, sin veredicto */}
      {ev.coste_homes && (
        <div className="rounded-lg p-3 mb-4 text-sm" style={{ backgroundColor: 'var(--cream)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Casa de Homes · precio vs. su coste</p>
          {ev.coste_homes.coste ? (
            <p style={{ color: 'var(--slate)' }}>
              Coste (compra + renovaciones) {formatMoney(ev.coste_homes.coste)} · margen de Homes{' '}
              <strong style={{ color: 'var(--ink)' }}>{formatMoney(ev.coste_homes.margen ?? 0)}</strong>
              {ev.coste_homes.margen_pct != null && ` (${ev.coste_homes.margen_pct > 0 ? '+' : ''}${ev.coste_homes.margen_pct}%)`}
            </p>
          ) : (
            <p style={{ color: 'var(--slate)' }}>Homes no tiene registrado el coste de esta casa.</p>
          )}
          <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>Regla de precio de Homes pendiente de definir: de momento es solo informativo.</p>
        </div>
      )}

      <ReferenciasHistoricas refs={data.referencias} precio={ev.precio} />

      {/* Comparador: valor automático y sus comparables */}
      <div className="text-sm mb-4">
        <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Valor automático</p>
        {data.automatico.ok && data.automatico.valor ? (
          <ComparablesTable auto={data.automatico} />
        ) : (
          <p className="flex items-start gap-1.5" style={{ color: 'var(--slate)' }}>
            <Info className="w-3.5 h-3.5 flex-none mt-0.5" />
            {!data.sqft_registrado
              ? 'La casa no tiene superficie (sqft) registrada, así que no se puede comparar con otras. Escribe el valor a mano.'
              : (data.automatico.motivo || 'No hay comparables suficientes. Escribe el valor a mano.')}
          </p>
        )}
      </div>

      {/* Valor manual del responsable */}
      <div className="pt-4 border-t" style={{ borderColor: 'var(--sand)' }}>
        {data.falta_migracion ? (
          <p className="text-xs" style={{ color: 'var(--warning)' }}>
            Para guardar un valor manual falta ejecutar la migración 115 en Supabase.
          </p>
        ) : editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Valor de mercado</label>
                <input className="input w-full" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="45000" />
              </div>
              <div>
                <label className="label">Fuente del valor</label>
                <input className="input w-full" value={source} onChange={e => setSource(e.target.value)} placeholder="3 comparables en MHVillage, tasación…" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label">Renta de mercado (mensual)</label>
                <input className="input w-full" inputMode="decimal" value={rent} onChange={e => setRent(e.target.value)} placeholder="1100" />
              </div>
              <div>
                <label className="label">Fuente de la renta</label>
                <input className="input w-full" value={rentSource} onChange={e => setRentSource(e.target.value)} placeholder="anuncios de renta en la zona…" />
              </div>
            </div>
            <div>
              <label className="label">Notas</label>
              <input className="input w-full" value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            {error && <p className="text-xs" style={{ color: 'var(--danger)' }}>{error}</p>}
            <div className="flex gap-2">
              <button onClick={save} disabled={saving} className="btn-primary btn-sm">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} Guardar valor
              </button>
              <button onClick={() => setEditing(false)} disabled={saving} className="btn-ghost btn-sm">Cancelar</button>
            </div>
          </div>
        ) : data.manual ? (
          <div className="flex items-start justify-between gap-3 text-sm">
            <div style={{ color: 'var(--slate)' }}>
              {data.manual.market_value != null && (
                <p>
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>Valor manual: {formatMoney(data.manual.market_value)}</span>
                  {' · '}{data.manual.source}
                </p>
              )}
              {data.manual.market_rent != null && (
                <p>
                  <span className="font-medium" style={{ color: 'var(--ink)' }}>Renta de mercado: {formatMoney(data.manual.market_rent)}</span>
                  {' · '}{data.manual.rent_source}
                </p>
              )}
              {data.manual.notes && <p className="text-xs mt-0.5">{data.manual.notes}</p>}
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--ash)' }}>
                {data.manual.evaluated_by || 'Sin autor'} · {new Date(data.manual.evaluated_at).toLocaleDateString('es-MX')} · prevalece sobre el automático
              </p>
            </div>
            <div className="flex gap-1 flex-none">
              <button onClick={startEdit} className="btn-ghost btn-sm" title="Editar"><Pencil className="w-4 h-4" /></button>
              <button onClick={clear} disabled={saving} className="btn-ghost btn-sm" title="Quitar valor manual"><Trash2 className="w-4 h-4" /></button>
            </div>
          </div>
        ) : (
          <button onClick={startEdit} className="btn-secondary btn-sm">
            <Pencil className="w-4 h-4" /> Escribir valor / renta de mercado a mano
          </button>
        )}
      </div>
    </div>
  )
}

function Dato({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>{label}</p>
      <p className={strong ? 'font-semibold' : 'font-medium'} style={{ color: 'var(--ink)' }}>{value}</p>
    </div>
  )
}
