'use client'

/**
 * Propuesta de compra — Responsable de Adquisiciones (Capital).
 * Pasos del proceso "Evaluar precio vs. mercado" + "Calcular renta y margen":
 * renta sugerida por plazo (24/36/48), margen anual frente al costo del
 * fondeo (semáforo), fondeo disponible, y la propuesta se guarda para
 * aprobarla o rechazarla. Mismo motor que el Cálculo RTO de Clientes RTO.
 *
 * (Antes "Evaluar compra".)
 *
 * Para decidir a cuánto comprar una casa, venga de Homes, de un tercero o de
 * un cliente que terminó su plazo: renta mínima para sacar el 30% anual sobre
 * lo que pone Capital, precio máximo con una renta dada, y la compra frente al
 * valor de mercado y a los históricos de Homes y de Capital. No guarda nada.
 */

import { useCallback, useEffect, useState } from 'react'
import { Calculator, Loader2, Info, Save, Check, X, Trash2 } from 'lucide-react'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'
import { formatMoney } from '@/lib/money'
import {
  EvaluacionCompra, Referencias, ValorAutomatico, Veredicto, ReferenciasHistoricas, ComparablesTable,
  FUENTE_VALOR, pct, RentaMargen, RentaMargenPanel,
} from '@/components/capital/evaluacionCompra'

interface Resultado {
  evaluacion: EvaluacionCompra
  automatico: ValorAutomatico
  referencias: Referencias
  renta_margen: RentaMargen
}

interface Propuesta {
  id: string; origen: string | null; casa: string | null; precio: number; enganche: number
  plazo_meses: number; mensualidad: number; margen_anual: number | null; costo_fondeo: number | null
  semaforo: string | null; status: 'borrador' | 'aprobada' | 'rechazada'; notas: string | null
  created_by: string | null; created_at: string; decided_by: string | null
}

const COLOR_SEMAFORO: Record<string, string> = { verde: 'var(--success)', amarillo: 'var(--warning, #b7791f)', rojo: 'var(--danger)' }

const ORIGENES = [
  { value: 'homes', label: 'Maninos Homes' },
  { value: 'mercado', label: 'Tercero (mercado)' },
  { value: 'recompra', label: 'Recompra a cliente que terminó su plazo' },
]

const num = (v: string) => {
  const n = parseFloat(v.replace(/[$,\s]/g, ''))
  return Number.isFinite(n) ? n : null
}

export default function EvaluarCompraPage() {
  const { user } = useAuth()
  const toast = useToast()
  const [origen, setOrigen] = useState('homes')
  const [casa, setCasa] = useState('')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [propuestas, setPropuestas] = useState<Propuesta[]>([])
  const [faltaMigracion, setFaltaMigracion] = useState(false)

  const cargarPropuestas = useCallback(async () => {
    try {
      const d = await (await fetch('/api/capital/purchase-proposals', { cache: 'no-store' })).json()
      if (d.ok) { setPropuestas(d.proposals || []); setFaltaMigracion(!!d.falta_migracion) }
    } catch { /* la lista simplemente no aparece */ }
  }, [])
  useEffect(() => { cargarPropuestas() }, [cargarPropuestas])
  const [precio, setPrecio] = useState('')
  const [enganche, setEnganche] = useState('')
  const [plazo, setPlazo] = useState('36')
  const [mensualidad, setMensualidad] = useState('')
  const [sqft, setSqft] = useState('')
  const [beds, setBeds] = useState('')
  const [year, setYear] = useState('')
  const [city, setCity] = useState('')
  const [valorManual, setValorManual] = useState('')
  const [fuenteManual, setFuenteManual] = useState('')
  const [rentaMdo, setRentaMdo] = useState('')
  const [fuenteRenta, setFuenteRenta] = useState('')
  const [res, setRes] = useState<Resultado | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const calcular = async (over?: { plazo?: number; mensualidad?: number }) => {
    setError('')
    const p = num(precio)
    if (!p || p <= 0) { setError('Escribe el precio de compra'); return }
    setLoading(true)
    try {
      const r = await fetch('/api/capital/financed-houses/purchase-calculator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          origen,
          precio: p,
          enganche: num(enganche) || 0,
          plazo_meses: over?.plazo ?? (parseInt(plazo) || 36),
          mensualidad: over?.mensualidad ?? num(mensualidad),
          sqft: num(sqft),
          bedrooms: beds ? parseInt(beds) : null,
          year: year ? parseInt(year) : null,
          city: city.trim() || null,
          valor_mercado_manual: num(valorManual),
          fuente_valor_manual: fuenteManual.trim() || null,
          renta_mercado_manual: num(rentaMdo),
          fuente_renta_manual: fuenteRenta.trim() || null,
        }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) { setError(d.detail || 'No se pudo calcular'); return }
      setRes(d)
    } catch {
      setError('No se pudo calcular')
    } finally {
      setLoading(false)
    }
  }

  const payload = () => ({
    origen, casa: casa.trim() || null, precio: num(precio), enganche: num(enganche) || 0,
    plazo_meses: parseInt(plazo) || 36, mensualidad: num(mensualidad),
    sqft: num(sqft), bedrooms: beds ? parseInt(beds) : null, year: year ? parseInt(year) : null, city: city.trim() || null,
    valor_mercado_manual: num(valorManual), fuente_valor_manual: fuenteManual.trim() || null,
    renta_mercado_manual: num(rentaMdo), fuente_renta_manual: fuenteRenta.trim() || null,
  })

  const elegirPlazo = (pl: number, renta: number) => {
    setPlazo(String(pl))
    setMensualidad(String(renta))
    calcular({ plazo: pl, mensualidad: renta })
  }

  const guardar = async () => {
    if (!casa.trim()) { toast.error('Escribe qué casa es (código o dirección) para guardar la propuesta'); return }
    if (!num(mensualidad)) { toast.error('La propuesta necesita una mensualidad: escríbela o usa una de la tabla'); return }
    setSaving(true)
    try {
      const r = await fetch('/api/capital/purchase-proposals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload(), notas: notas.trim() || null, created_by: user?.email || null }),
      })
      const d = await r.json()
      if (!r.ok || !d.ok) { toast.error(d.detail || 'No se pudo guardar'); return }
      toast.success('Propuesta de compra guardada')
      setNotas('')
      cargarPropuestas()
    } catch { toast.error('No se pudo guardar') } finally { setSaving(false) }
  }

  const decidir = async (id: string, status: 'aprobada' | 'rechazada') => {
    const r = await fetch(`/api/capital/purchase-proposals/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, decided_by: user?.email || null }),
    })
    const d = await r.json()
    if (!r.ok || !d.ok) { toast.error(d.detail || 'No se pudo actualizar'); return }
    cargarPropuestas()
  }

  const borrar = async (id: string) => {
    const r = await fetch(`/api/capital/purchase-proposals/${id}`, { method: 'DELETE' })
    if (r.ok) cargarPropuestas()
  }

  const ev = res?.evaluacion
  const field = (label: string, value: string, set: (v: string) => void, placeholder = '') => (
    <div>
      <label className="label">{label}</label>
      <input className="input w-full" inputMode="decimal" value={value} onChange={e => set(e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="font-serif text-2xl flex items-center gap-2" style={{ color: 'var(--ink)' }}>
          <Calculator className="w-6 h-6" style={{ color: 'var(--gold-700)' }} /> Propuesta de compra
        </h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--slate)' }}>
          A cuánto comprar una casa para sacarle mínimo un 30% anual sobre lo que pone Capital (precio − enganche),
          comprando por debajo del mercado y sin cobrar una renta por encima de la de mercado. Solo calcula: no guarda nada.
        </p>
      </div>

      <div className="card-luxury p-6 space-y-5">
        <div>
          <label className="label">¿A quién se le compra?</label>
          <div className="flex flex-wrap gap-2">
            {ORIGENES.map(o => (
              <button key={o.value} onClick={() => setOrigen(o.value)} className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ backgroundColor: origen === o.value ? 'var(--navy-800)' : 'var(--cream)', color: origen === o.value ? 'white' : 'var(--slate)' }}>
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Casa (código o dirección)</label>
          <input className="input w-full" value={casa} onChange={e => setCasa(e.target.value)} placeholder="H61, 123 Main St…" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {field('Precio de compra *', precio, setPrecio, '30000')}
          {field('Enganche del cliente', enganche, setEnganche, '3000')}
          <div>
            <label className="label">Plazo</label>
            <select className="input w-full" value={plazo} onChange={e => setPlazo(e.target.value)}>
              {['24', '36', '48', '60'].map(m => <option key={m} value={m}>{m} meses</option>)}
            </select>
          </div>
          {field('Mensualidad (opcional)', mensualidad, setMensualidad, 'para ver el precio máximo')}
        </div>

        <details>
          <summary className="text-sm cursor-pointer" style={{ color: 'var(--gold-700)' }}>Datos de la casa para estimar su valor de mercado</summary>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
            {field('Superficie (sqft)', sqft, setSqft, '1200')}
            {field('Recámaras', beds, setBeds, '3')}
            {field('Año', year, setYear, '2010')}
            <div>
              <label className="label">Ciudad</label>
              <input className="input w-full" value={city} onChange={e => setCity(e.target.value)} placeholder="Houston" />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-3">
            {field('Valor de mercado conocido (opcional)', valorManual, setValorManual, 'si ya lo tienes')}
            <div>
              <label className="label">Fuente de ese valor</label>
              <input className="input w-full" value={fuenteManual} onChange={e => setFuenteManual(e.target.value)} placeholder="comparables, tasación…" />
            </div>
            {field('Renta de mercado mensual (opcional)', rentaMdo, setRentaMdo, 'renta de casas parecidas')}
            <div>
              <label className="label">Fuente de esa renta</label>
              <input className="input w-full" value={fuenteRenta} onChange={e => setFuenteRenta(e.target.value)} placeholder="anuncios de renta en la zona…" />
            </div>
          </div>
        </details>

        {error && <p className="text-sm" style={{ color: 'var(--danger)' }}>{error}</p>}
        <button onClick={() => calcular()} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular
        </button>
      </div>

      {ev && res && (
        <div className="card-luxury p-6 space-y-5" data-testid="resultado-compra">
          <div>
            <h2 className="font-serif text-lg mb-3" style={{ color: 'var(--ink)' }}>Renta y margen</h2>
            <RentaMargenPanel rm={res.renta_margen} margen={ev.rentabilidad.anual} onElegir={elegirPlazo} plazoActual={ev.plazo_meses} />
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Grande label={`Renta mínima (${pct(ev.rentabilidad.minima)} anual)`} value={ev.rentabilidad.renta_minima ? formatMoney(ev.rentabilidad.renta_minima) : '—'} testId="renta-minima" />
            <Grande label="Pone Capital" value={ev.inversion_neta ? formatMoney(ev.inversion_neta) : '—'} />
            <Grande label={`Cobro total en ${ev.plazo_meses} meses`} value={ev.rentabilidad.renta_minima && ev.plazo_meses ? formatMoney(ev.rentabilidad.renta_minima * ev.plazo_meses) : '—'} />
            <Grande label="Precio máximo con tu mensualidad" value={ev.rentabilidad.precio_maximo ? formatMoney(ev.rentabilidad.precio_maximo) : '—'} testId="precio-maximo" />
          </div>

          <p className="text-sm" style={{ color: 'var(--slate)' }} data-testid="calc-costo-total">
            Margen sobre el costo total de la casa (con enganche):{' '}
            <strong style={{ color: 'var(--ink)' }}>
              {ev.rentabilidad.sobre_costo_total ? `${pct(ev.rentabilidad.sobre_costo_total.anual)} anual · ${pct(ev.rentabilidad.sobre_costo_total.total_plazo)} en el plazo` : 'escribe una mensualidad'}
            </strong>
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Veredicto
              testId="calc-rentabilidad"
              estado={ev.rentabilidad.estado}
              ok={`Con ${formatMoney(ev.mensualidad || 0)}/mes: ${pct(ev.rentabilidad.anual)} anual, llega al ${pct(ev.rentabilidad.minima)}`}
              ko={`Con ${formatMoney(ev.mensualidad || 0)}/mes: ${pct(ev.rentabilidad.anual)} anual, no llega al ${pct(ev.rentabilidad.minima)}`}
              sinDatos="Escribe una mensualidad para ver qué rentabilidad sale"
              detalle={ev.rentabilidad.anual != null ? `${pct(ev.rentabilidad.total_plazo)} en todo el plazo` : undefined}
            />
            <Veredicto
              testId="calc-mercado"
              estado={ev.mercado.estado}
              ok={`Compra por debajo del mercado (${pct(ev.mercado.compra_vs_valor)} del valor)`}
              ko={`Compra no queda por debajo del mercado (${pct(ev.mercado.compra_vs_valor)} del valor)`}
              sinDatos="Sin valor de mercado: añade superficie y ciudad, o un valor conocido"
              detalle={ev.mercado.valor && ev.mercado.fuente ? `Valor ${formatMoney(ev.mercado.valor)} según ${FUENTE_VALOR[ev.mercado.fuente]}` : undefined}
            />
            <Veredicto
              testId="calc-renta"
              estado={ev.renta.estado}
              ok={`Renta dentro de mercado (${pct(ev.renta.mensualidad_vs_mercado)} de la de mercado)`}
              ko={`Renta por encima de mercado (${pct(ev.renta.mensualidad_vs_mercado)} de la de mercado)`}
              sinDatos={ev.renta.estado === 'sin_datos' ? 'Escribe una mensualidad para compararla' : 'Añade la renta de mercado para comparar'}
              detalle={ev.renta.mercado ? `Renta de mercado ${formatMoney(ev.renta.mercado)}` : undefined}
            />
          </div>

          <ReferenciasHistoricas refs={res.referencias} precio={ev.precio} />

          {/* Guardar la propuesta: foto de los números de hoy, para aprobarla o rechazarla */}
          <div className="pt-4 border-t space-y-2" style={{ borderColor: 'var(--sand)' }}>
            <label className="label">Notas de la propuesta</label>
            <input className="input w-full" value={notas} onChange={e => setNotas(e.target.value)} placeholder="Opcional" />
            {faltaMigracion ? (
              <p className="text-xs" style={{ color: 'var(--warning)' }}>Para guardar propuestas falta ejecutar la migración 120 en Supabase.</p>
            ) : (
              <button onClick={guardar} disabled={saving} className="btn-primary btn-sm" data-testid="guardar-propuesta">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Guardar propuesta de compra
              </button>
            )}
          </div>

          <div className="text-sm">
            <p className="font-medium mb-1" style={{ color: 'var(--ink)' }}>Valor automático</p>
            {res.automatico.ok && res.automatico.valor ? (
              <ComparablesTable auto={res.automatico} />
            ) : (
              <p className="flex items-start gap-1.5" style={{ color: 'var(--slate)' }}>
                <Info className="w-3.5 h-3.5 flex-none mt-0.5" />
                {res.automatico.motivo || 'No hay comparables suficientes.'}
              </p>
            )}
          </div>
        </div>
      )}

      {propuestas.length > 0 && (
        <div className="card-luxury p-6" data-testid="propuestas">
          <h2 className="font-serif text-lg mb-3" style={{ color: 'var(--ink)' }}>Propuestas guardadas</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs" style={{ color: 'var(--ash)' }}>
                  <th className="text-left py-1 pr-3">Casa</th>
                  <th className="text-right py-1 pr-3">Precio</th>
                  <th className="text-right py-1 pr-3">Renta × plazo</th>
                  <th className="text-right py-1 pr-3">Margen</th>
                  <th className="text-left py-1 pr-3">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {propuestas.map(p => (
                  <tr key={p.id} className="border-t" style={{ borderColor: 'var(--sand)' }} data-testid={`propuesta-${p.id}`}>
                    <td className="py-1.5 pr-3" style={{ color: 'var(--ink)' }}>
                      {p.casa || '—'}
                      <span className="block text-[11px]" style={{ color: 'var(--ash)' }}>{new Date(p.created_at).toLocaleDateString('es-MX')}{p.created_by ? ` · ${p.created_by}` : ''}</span>
                    </td>
                    <td className="text-right py-1.5 pr-3">{formatMoney(p.precio)}</td>
                    <td className="text-right py-1.5 pr-3">{formatMoney(p.mensualidad)} × {p.plazo_meses}</td>
                    <td className="text-right py-1.5 pr-3 font-semibold" style={{ color: COLOR_SEMAFORO[p.semaforo || ''] || 'var(--ink)' }}>{pct(p.margen_anual)}</td>
                    <td className="py-1.5 pr-3 capitalize">{p.status}</td>
                    <td className="py-1.5 text-right whitespace-nowrap">
                      {p.status === 'borrador' ? (
                        <>
                          <button onClick={() => decidir(p.id, 'aprobada')} className="btn-ghost btn-sm" title="Aprobar"><Check className="w-4 h-4" /></button>
                          <button onClick={() => decidir(p.id, 'rechazada')} className="btn-ghost btn-sm" title="Rechazar"><X className="w-4 h-4" /></button>
                        </>
                      ) : null}
                      <button onClick={() => borrar(p.id)} className="btn-ghost btn-sm" title="Borrar"><Trash2 className="w-4 h-4" /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function Grande({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div>
      <p className="text-xs mb-1" style={{ color: 'var(--ash)' }}>{label}</p>
      <p className="font-serif text-xl" style={{ color: 'var(--ink)' }} data-testid={testId}>{value}</p>
    </div>
  )
}
