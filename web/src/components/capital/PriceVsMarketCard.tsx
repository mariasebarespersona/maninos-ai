'use client'

/**
 * Checklist de la casa — "Evaluar precio vs. mercado" (Responsable de Adquisiciones).
 *
 * Regla: el precio que paga Capital (precio de venta RTO) ≤ 70% del valor de
 * mercado. El valor sale del histórico de ventas de Maninos, luego de los
 * anuncios scrapeados, y si no hay base lo escribe el responsable con su fuente
 * (el manual prevalece). En casas de Homes se enseña además el precio frente a
 * su coste, sin veredicto: esa regla de Homes está pendiente.
 */

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, XCircle, HelpCircle, Scale, Pencil, Trash2, Loader2, Info } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/components/Auth/AuthProvider'

interface Comparable { referencia: string | null; precio: number; sqft: number; year: number | null; precio_sqft: number }

interface PriceEvaluation {
  evaluacion: {
    precio: number | null
    valor_mercado: number | null
    fuente_valor: 'manual' | 'cartera' | 'mercado' | null
    regla: number
    precio_maximo: number | null
    ratio: number | null
    estado: 'cumple' | 'no_cumple' | 'sin_valor' | 'sin_precio'
    casa_de_homes: boolean
    coste_homes?: { coste: number | null; margen: number | null; margen_pct: number | null; regla: null }
  }
  automatico: {
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
  manual: { market_value: number; source: string; notes: string | null; evaluated_by: string | null; evaluated_at: string } | null
  sqft_registrado: boolean
  falta_migracion: boolean
}

const FUENTE: Record<string, string> = {
  manual: 'valor manual del responsable',
  cartera: 'histórico de ventas de Maninos',
  mercado: 'anuncios del mercado',
}

const pct = (r: number | null | undefined) => (r == null ? '—' : `${Math.round(r * 1000) / 10}%`)

export default function PriceVsMarketCard({ saleId }: { saleId: string }) {
  const { user } = useAuth()
  const [data, setData] = useState<PriceEvaluation | null>(null)
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState('')
  const [source, setSource] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showComps, setShowComps] = useState(false)

  const load = useCallback(async () => {
    try {
      const d = await (await fetch(`/api/capital/financed-houses/${saleId}/price-evaluation`, { cache: 'no-store' })).json()
      if (d.ok) setData(d)
    } catch { /* la tarjeta simplemente no aparece */ }
  }, [saleId])

  useEffect(() => { load() }, [load])

  const startEdit = () => {
    setValue(data?.manual ? String(data.manual.market_value) : '')
    setSource(data?.manual?.source || '')
    setNotes(data?.manual?.notes || '')
    setError('')
    setEditing(true)
  }

  const save = async () => {
    setError('')
    const v = parseFloat(value.replace(/[$,\s]/g, ''))
    if (!v || v <= 0) { setError('Escribe un valor de mercado mayor que 0'); return }
    if (!source.trim()) { setError('Indica de dónde sale el valor (comparables, tasación…)'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/capital/financed-houses/${saleId}/price-evaluation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market_value: v, source: source.trim(), notes: notes.trim() || null, evaluated_by: user?.email || null }),
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
  const auto = data.automatico

  const estado = {
    cumple: { icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-light)', label: `Cumple: precio ≤ ${pct(ev.regla)} del valor de mercado` },
    no_cumple: { icon: XCircle, color: 'var(--danger)', bg: 'var(--danger-light, #fdecec)', label: `No cumple: el precio supera el ${pct(ev.regla)} del valor de mercado` },
    sin_valor: { icon: HelpCircle, color: 'var(--warning)', bg: 'var(--warning-light, #fdf6e3)', label: 'Sin valor de mercado: no se puede evaluar todavía' },
    sin_precio: { icon: HelpCircle, color: 'var(--warning)', bg: 'var(--warning-light, #fdf6e3)', label: 'La venta no tiene precio registrado' },
  }[ev.estado]
  const Icon = estado.icon

  return (
    <div className="card-luxury p-5" data-testid="price-vs-market">
      <h2 className="font-serif text-lg mb-1 flex items-center gap-2" style={{ color: 'var(--ink)' }}>
        <Scale className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />
        Checklist · Precio vs. mercado
      </h2>
      <p className="text-xs mb-4" style={{ color: 'var(--ash)' }}>
        Responsable de Adquisiciones. Precio que paga Capital frente al valor de mercado de la casa (regla ≤ {pct(ev.regla)}).
      </p>

      {/* Veredicto */}
      <div className="flex items-start gap-2 rounded-lg p-3 mb-4" style={{ backgroundColor: estado.bg }}>
        <Icon className="w-5 h-5 flex-none" style={{ color: estado.color }} />
        <div className="text-sm">
          <p className="font-medium" style={{ color: 'var(--ink)' }} data-testid="price-vs-market-estado">{estado.label}</p>
          {ev.valor_mercado && ev.fuente_valor && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Valor según {FUENTE[ev.fuente_valor]}.</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 text-sm">
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>Precio Capital</p>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{ev.precio ? formatMoney(ev.precio) : '—'}</p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>Valor de mercado</p>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{ev.valor_mercado ? formatMoney(ev.valor_mercado) : '—'}</p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>Precio / valor</p>
          <p className="font-semibold" style={{ color: ev.estado === 'cumple' ? 'var(--success)' : ev.estado === 'no_cumple' ? 'var(--danger)' : 'var(--ink)' }}>
            {pct(ev.ratio)}
          </p>
        </div>
        <div>
          <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>Precio máximo ({pct(ev.regla)})</p>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{ev.precio_maximo ? formatMoney(ev.precio_maximo) : '—'}</p>
        </div>
      </div>

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

      {/* Comparador: valor automático y sus comparables */}
      <div className="text-sm mb-4">
        <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Valor automático</p>
        {auto.ok && auto.valor ? (
          <>
            <p style={{ color: 'var(--slate)' }}>
              {formatMoney(auto.valor)}
              {auto.rango_min != null && auto.rango_max != null && ` (probable ${formatMoney(auto.rango_min)} – ${formatMoney(auto.rango_max)})`}
              {' · '}{auto.n_comparables} comparables de {FUENTE[auto.metodo || ''] || auto.metodo} · confianza {auto.confianza}
            </p>
            <button onClick={() => setShowComps(s => !s)} className="text-xs underline mt-1" style={{ color: 'var(--gold-700)' }}>
              {showComps ? 'Ocultar comparables' : 'Ver comparables'}
            </button>
            {showComps && (
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
        ) : (
          <p className="flex items-start gap-1.5" style={{ color: 'var(--slate)' }}>
            <Info className="w-3.5 h-3.5 flex-none mt-0.5" />
            {!data.sqft_registrado
              ? 'La casa no tiene superficie (sqft) registrada, así que no se puede comparar con otras. Escribe el valor a mano.'
              : (auto.motivo || 'No hay comparables suficientes. Escribe el valor a mano.')}
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
                <label className="label">Valor de mercado *</label>
                <input className="input w-full" inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="45000" />
              </div>
              <div>
                <label className="label">Fuente *</label>
                <input className="input w-full" value={source} onChange={e => setSource(e.target.value)} placeholder="3 comparables en MHVillage, tasación…" />
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
              <p>
                <span className="font-medium" style={{ color: 'var(--ink)' }}>Valor manual: {formatMoney(data.manual.market_value)}</span>
                {' · '}{data.manual.source}
              </p>
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
            <Pencil className="w-4 h-4" /> Escribir valor de mercado a mano
          </button>
        )}
      </div>
    </div>
  )
}
