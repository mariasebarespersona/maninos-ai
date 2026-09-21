'use client'

import { useEffect, useState } from 'react'
import { Table2, Loader2, Download, Info } from 'lucide-react'

/**
 * Registro de Inversionistas — la tabla de la hoja «TABLA INVERSIONISTAS» del
 * Excel CAPITAL GENERAL, pero viva.
 *
 * Mismas 15 columnas y los mismos dos bloques (activos / liquidados). La
 * diferencia es que no se teclea: se calcula de los pagarés y del seguimiento
 * de inversionistas cada vez que se abre, así que no puede quedarse vieja.
 *
 * Las celdas que la app no puede deducir con certeza salen VACÍAS a propósito.
 * Rellenarlas con una suposición sería peor: nadie sabría luego cuáles eran de
 * fiar. Cuáles y por qué está explicado en el aviso de la propia pantalla.
 */

interface Fila {
  inversionista: string | null
  numero_inversionista: number | null
  correo: string | null
  numero_cuenta: string | null
  monto_original: number | null
  deuda_actual: number | null
  tasa_anual: number | null
  interes_mensual: number | null
  pago_fijo_mensual: number | null
  interes_anual_total: number | null
  plazo_meses: number | null
  fecha_inicio: string | null
  fecha_termino: string | null
  estatus: string | null
  notas: string | null
  note_id?: string
}

interface Registro {
  ok: boolean
  fecha: string
  activos: Fila[]
  liquidados: Fila[]
  totales: {
    activos: number; liquidados: number
    monto_original: number | null; deuda_actual: number | null
    interes_mensual: number | null; pago_fijo_mensual: number | null
  }
}

// Las 15 columnas, en el mismo orden que el Excel.
const COLUMNAS: { clave: keyof Fila; titulo: string; tipo: 'texto' | 'dinero' | 'pct' | 'num' | 'fecha' }[] = [
  { clave: 'inversionista',        titulo: 'Inversionista',                      tipo: 'texto' },
  { clave: 'numero_inversionista', titulo: 'Número de Inversionista',            tipo: 'num' },
  { clave: 'correo',               titulo: 'Correo',                             tipo: 'texto' },
  { clave: 'numero_cuenta',        titulo: 'Número de Cuenta',                   tipo: 'texto' },
  { clave: 'monto_original',       titulo: 'Monto Original ($)',                 tipo: 'dinero' },
  { clave: 'deuda_actual',         titulo: 'Deuda Actual en Capital ($)',        tipo: 'dinero' },
  { clave: 'tasa_anual',           titulo: 'Tasa de Interés Anual (%)',          tipo: 'pct' },
  { clave: 'interes_mensual',      titulo: 'Interés Mensual ($)',                tipo: 'dinero' },
  { clave: 'pago_fijo_mensual',    titulo: 'Pago Fijo Mensual de Referencia ($)', tipo: 'dinero' },
  { clave: 'interes_anual_total',  titulo: 'Interés Anual Total ($)',            tipo: 'dinero' },
  { clave: 'plazo_meses',          titulo: 'Plazo (meses)',                      tipo: 'num' },
  { clave: 'fecha_inicio',         titulo: 'Fecha de Inicio',                    tipo: 'fecha' },
  { clave: 'fecha_termino',        titulo: 'Fecha de Término',                   tipo: 'fecha' },
  { clave: 'estatus',              titulo: 'Estatus',                            tipo: 'texto' },
  { clave: 'notas',                titulo: 'Condiciones / Notas',                tipo: 'texto' },
]

const dinero = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n)

const fecha = (s: string) =>
  new Date(s + 'T00:00:00').toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })

/** Una celda vacía se deja VISIBLEMENTE vacía, no en cero: cero es un dato. */
function celda(f: Fila, col: typeof COLUMNAS[number]) {
  const v = f[col.clave]
  if (v === null || v === undefined || v === '') {
    return <span style={{ color: 'var(--stone)' }}>—</span>
  }
  if (col.tipo === 'dinero') return dinero(Number(v))
  if (col.tipo === 'pct') return `${Number(v).toFixed(2)}%`
  if (col.tipo === 'fecha') return fecha(String(v))
  if (col.tipo === 'num') return String(v)
  return String(v)
}

const alineada = (t: string) => (t === 'dinero' || t === 'pct' || t === 'num' ? 'right' : 'left')

export default function RegistroInversionistasPage() {
  const [data, setData] = useState<Registro | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/capital/investors/registro', { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { if (d.ok) setData(d); else setError(d.detail || d.error || 'No se pudo cargar') })
      .catch(() => setError('No se pudo cargar el registro'))
      .finally(() => setCargando(false))
  }, [])

  const descargarCSV = () => {
    if (!data) return
    const filas = [...data.activos, ...data.liquidados]
    const esc = (v: any) => {
      const s = v === null || v === undefined ? '' : String(v)
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [
      COLUMNAS.map(c => esc(c.titulo)).join(','),
      ...filas.map(f => COLUMNAS.map(c => esc(f[c.clave])).join(',')),
    ].join('\n')
    // BOM para que Excel abra bien los acentos.
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registro_inversionistas_${data.fecha}.csv`
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  if (cargando) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  const bloques = data
    ? ([
        { titulo: 'Inversionistas activos', filas: data.activos },
        { titulo: 'Liquidados (saldo en $0)', filas: data.liquidados },
      ] as const)
    : []

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Registro de Inversionistas</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            <Table2 className="w-4 h-4 inline mr-1" style={{ color: 'var(--gold-700)' }} />
            Se arma solo con los pagarés y el seguimiento de inversionistas
            {data ? ` · al ${fecha(data.fecha)}` : ''}
          </p>
        </div>
        {data && (
          <button onClick={descargarCSV} className="btn-ghost btn-sm">
            <Download className="w-4 h-4" /> Exportar CSV
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-lg p-4 text-sm"
             style={{ backgroundColor: 'var(--error-light)', color: 'var(--error)' }}>{error}</div>
      )}

      {/* Qué columnas van vacías y por qué. Se dice aquí para que nadie dé por
          bueno un hueco creyendo que el dato es cero. */}
      <div className="rounded-lg p-4 flex items-start gap-3"
           style={{ backgroundColor: 'var(--info-light)', border: '1px solid var(--info)' }}>
        <Info className="w-5 h-5 flex-none mt-0.5" style={{ color: 'var(--info)' }} />
        <div className="text-sm" style={{ color: 'var(--charcoal)' }}>
          <p className="font-medium" style={{ color: 'var(--ink)' }}>Tres columnas salen vacías a propósito</p>
          <ul className="mt-1 space-y-0.5">
            <li><strong>Número de Inversionista</strong> — la app no numera a los inversionistas.</li>
            <li><strong>Número de Cuenta</strong> — no se guarda la cuenta bancaria del inversionista.</li>
            <li><strong>Interés Anual Total</strong> — el nombre admite dos lecturas (el interés de un
              año o el de todo el plazo) y no se puede deducir cuál es. Pendiente de confirmar.</li>
          </ul>
          <p className="mt-1.5" style={{ color: 'var(--slate)' }}>
            Un guion (—) significa «sin dato», nunca cero.
          </p>
        </div>
      </div>

      {data && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { l: 'Pagarés activos', v: String(data.totales.activos) },
              { l: 'Monto original', v: data.totales.monto_original != null ? dinero(data.totales.monto_original) : '—' },
              { l: 'Deuda actual', v: data.totales.deuda_actual != null ? dinero(data.totales.deuda_actual) : '—' },
              { l: 'Interés mensual', v: data.totales.interes_mensual != null ? dinero(data.totales.interes_mensual) : '—' },
            ].map(k => (
              <div key={k.l} className="card-luxury p-4">
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{k.l}</p>
                <p className="font-serif text-xl font-semibold mt-1" style={{ color: 'var(--ink)' }}>{k.v}</p>
              </div>
            ))}
          </div>

          {bloques.map(b => (
            <div key={b.titulo} className="card-luxury overflow-hidden">
              <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sand)', backgroundColor: 'var(--cream)' }}>
                <h2 className="text-sm font-semibold uppercase tracking-wide" style={{ color: 'var(--navy-800)' }}>
                  {b.titulo} <span style={{ color: 'var(--ash)' }}>({b.filas.length})</span>
                </h2>
              </div>
              {b.filas.length === 0 ? (
                <p className="px-4 py-6 text-sm" style={{ color: 'var(--slate)' }}>Ninguno.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="text-sm" style={{ minWidth: '110rem' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--sand)' }}>
                        {COLUMNAS.map(c => (
                          <th key={c.clave}
                              className="px-3 py-2.5 text-xs font-medium uppercase tracking-wide whitespace-nowrap"
                              style={{ color: 'var(--ash)', textAlign: alineada(c.tipo) }}>
                            {c.titulo}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {b.filas.map((f, i) => (
                        <tr key={f.note_id || i} style={{ borderBottom: '1px solid var(--sand)' }}>
                          {COLUMNAS.map(c => (
                            <td key={c.clave}
                                className="px-3 py-2 whitespace-nowrap tabular-nums"
                                style={{ textAlign: alineada(c.tipo), color: 'var(--charcoal)' }}>
                              {celda(f, c)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
