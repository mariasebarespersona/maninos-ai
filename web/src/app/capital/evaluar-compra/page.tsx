'use client'

/**
 * Evaluar compra — calculadora del Responsable de Adquisiciones (Capital).
 *
 * Para decidir a cuánto comprar una casa, venga de Homes, de un tercero o de
 * un cliente que terminó su plazo: renta mínima para sacar el 30% anual sobre
 * lo que pone Capital, precio máximo con una renta dada, y la compra frente al
 * valor de mercado y a los históricos de Homes y de Capital. No guarda nada.
 */

import { useState } from 'react'
import { Calculator, Loader2, Info } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import {
  EvaluacionCompra, Referencias, ValorAutomatico, Veredicto, ReferenciasHistoricas, ComparablesTable,
  FUENTE_VALOR, pct,
} from '@/components/capital/evaluacionCompra'

interface Resultado {
  evaluacion: EvaluacionCompra
  automatico: ValorAutomatico
  referencias: Referencias
}

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
  const [origen, setOrigen] = useState('homes')
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

  const calcular = async () => {
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
          plazo_meses: parseInt(plazo) || 36,
          mensualidad: num(mensualidad),
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
          <Calculator className="w-6 h-6" style={{ color: 'var(--gold-700)' }} /> Evaluar compra
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
        <button onClick={calcular} disabled={loading} className="btn-primary">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calculator className="w-4 h-4" />} Calcular
        </button>
      </div>

      {ev && res && (
        <div className="card-luxury p-6 space-y-5" data-testid="resultado-compra">
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
