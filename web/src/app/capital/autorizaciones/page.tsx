'use client'

/**
 * Autorizar compra — Comité de Inversión + VoBo del CEO (Capital).
 *
 * Flujo de cada propuesta de compra:
 *   borrador → en comité → VoBo → aprobada
 *                ↘ ajustes ↙  (vuelve a quien propone; corrige y reenvía)
 *                ↘ rechazada
 * En cada etapa: aprobar, rechazar o pedir ajustes de precio, renta o plazo.
 * Regla: quien propone no vota ni da el VoBo de su propia propuesta.
 * Pendiente de definir: quién forma el comité, quién es el CEO y el quórum
 * (por ahora vota cualquier usuario de Capital distinto de quien propone).
 * Salida: acta de comité (PDF). KPI: tiempo de solicitud a decisión.
 */

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Gavel, Loader2, Check, X, Pencil, Send, FileDown } from 'lucide-react'
import { formatMoney } from '@/lib/money'
import { useAuth } from '@/components/Auth/AuthProvider'
import { useToast } from '@/components/ui/Toast'
import { pct } from '@/components/capital/evaluacionCompra'

type Status = 'borrador' | 'en_comite' | 'en_vobo' | 'ajustes' | 'aprobada' | 'rechazada'

interface Voto {
  id: string; etapa: 'comite' | 'vobo'; decision: 'aprobar' | 'rechazar' | 'ajustes'
  comentario: string | null; ajustes: { precio?: number; mensualidad?: number; plazo_meses?: number } | null
  voter_email: string; proposal_version: number; created_at: string
}

interface Propuesta {
  id: string; origen: string | null; casa: string | null; precio: number; enganche: number
  plazo_meses: number; mensualidad: number; margen_anual: number | null; costo_fondeo: number | null
  semaforo: string | null; status: Status; notas: string | null; version: number
  created_by: string | null; created_at: string; requested_at: string | null
  decided_by: string | null; decided_at: string | null
  votos: Voto[]; dias_hasta_decision: number | null; dias_en_espera: number | null
}

interface Kpi { pendientes: number; con_ajustes: number; decididas: number; dias_medio_decision: number | null }

const ESTADO: Record<Status, { label: string; bg: string; fg: string }> = {
  borrador: { label: 'Borrador', bg: 'var(--cream)', fg: 'var(--slate)' },
  en_comite: { label: 'En comité', bg: 'var(--info-light, #e8f0fb)', fg: 'var(--info, #2563eb)' },
  en_vobo: { label: 'Pendiente de VoBo', bg: 'var(--gold-100, #fdf6e3)', fg: 'var(--gold-700)' },
  ajustes: { label: 'Ajustes pedidos', bg: 'var(--warning-light, #fdf6e3)', fg: 'var(--warning, #b7791f)' },
  aprobada: { label: 'Aprobada', bg: 'var(--success-light)', fg: 'var(--success)' },
  rechazada: { label: 'Rechazada', bg: 'var(--danger-light, #fdecec)', fg: 'var(--danger)' },
}
const FILTROS: { value: string; label: string; match: Status[] }[] = [
  { value: 'pendientes', label: 'Por decidir', match: ['en_comite', 'en_vobo'] },
  { value: 'ajustes', label: 'Con ajustes', match: ['ajustes'] },
  { value: 'borradores', label: 'Borradores', match: ['borrador'] },
  { value: 'decididas', label: 'Decididas', match: ['aprobada', 'rechazada'] },
  { value: 'todas', label: 'Todas', match: ['borrador', 'en_comite', 'en_vobo', 'ajustes', 'aprobada', 'rechazada'] },
]
const SEM_COLOR: Record<string, string> = { verde: 'var(--success)', amarillo: 'var(--warning, #b7791f)', rojo: 'var(--danger)' }
const mismo = (a?: string | null, b?: string | null) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase()
const fecha = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('es-MX') : '—')

export default function AutorizacionesPage() {
  const { user } = useAuth()
  const [props, setProps] = useState<Propuesta[]>([])
  const [kpi, setKpi] = useState<Kpi | null>(null)
  const [loading, setLoading] = useState(true)
  const [filtro, setFiltro] = useState('pendientes')

  const cargar = useCallback(async () => {
    try {
      const d = await (await fetch('/api/capital/purchase-proposals?limit=200', { cache: 'no-store' })).json()
      if (d.ok) { setProps(d.proposals || []); setKpi(d.kpi || null) }
    } finally { setLoading(false) }
  }, [])
  useEffect(() => { cargar() }, [cargar])

  const visibles = props.filter(p => (FILTROS.find(f => f.value === filtro)?.match || []).includes(p.status))

  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl flex items-center gap-2" style={{ color: 'var(--ink)' }}>
            <Gavel className="w-6 h-6" style={{ color: 'var(--gold-700)' }} /> Autorizar compra
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'var(--slate)' }}>
            El Comité de Inversión revisa cada propuesta y el CEO da el VoBo final: aprobar, rechazar o pedir ajustes de
            precio, renta o plazo. Quien propone no vota su propia propuesta.
          </p>
        </div>
        <Link href="/capital/evaluar-compra" className="btn-secondary btn-sm">Nueva propuesta de compra</Link>
      </div>

      {kpi && (
        <div className="card-luxury p-4 flex flex-wrap gap-x-8 gap-y-2" data-testid="kpi-autorizacion">
          <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Por decidir</p><p className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>{kpi.pendientes}</p></div>
          <div><p className="text-xs" style={{ color: 'var(--ash)' }}>Con ajustes pedidos</p><p className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>{kpi.con_ajustes}</p></div>
          <div>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Tiempo de solicitud a decisión</p>
            <p className="font-serif text-2xl" style={{ color: 'var(--ink)' }} data-testid="kpi-dias">
              {kpi.dias_medio_decision != null ? `${kpi.dias_medio_decision} días` : '—'}
              <span className="text-sm ml-2" style={{ color: 'var(--ash)' }}>media de {kpi.decididas} decididas</span>
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {FILTROS.map(f => (
          <button key={f.value} onClick={() => setFiltro(f.value)} className="px-3 py-1.5 rounded-full text-sm font-medium"
            style={{ backgroundColor: filtro === f.value ? 'var(--navy-800)' : 'var(--cream)', color: filtro === f.value ? 'white' : 'var(--slate)' }}>
            {f.label} ({props.filter(p => f.match.includes(p.status)).length})
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--gold-600)' }} /></div>
      ) : visibles.length === 0 ? (
        <div className="card-luxury p-10 text-center text-sm" style={{ color: 'var(--slate)' }}>No hay propuestas en esta lista.</div>
      ) : (
        <div className="space-y-4">
          {visibles.map(p => <TarjetaPropuesta key={p.id} p={p} yo={user?.email || ''} onCambio={cargar} />)}
        </div>
      )}
    </div>
  )
}

function TarjetaPropuesta({ p, yo, onCambio }: { p: Propuesta; yo: string; onCambio: () => void }) {
  const toast = useToast()
  const [modo, setModo] = useState<'' | 'editar' | 'ajustes' | 'rechazar' | 'aprobar'>('')
  const [comentario, setComentario] = useState('')
  const [precio, setPrecio] = useState(String(p.precio))
  const [enganche, setEnganche] = useState(String(p.enganche))
  const [plazo, setPlazo] = useState(String(p.plazo_meses))
  const [renta, setRenta] = useState(String(p.mensualidad))
  const [busy, setBusy] = useState(false)
  const e = ESTADO[p.status]
  const esMia = mismo(p.created_by, yo)
  const votable = p.status === 'en_comite' || p.status === 'en_vobo'
  const ultimoAjuste = [...p.votos].reverse().find(v => v.decision === 'ajustes')
  const n = (v: string) => { const x = parseFloat(v.replace(/[$,\s]/g, '')); return Number.isFinite(x) ? x : undefined }

  const call = async (url: string, method: string, body: unknown, ok: string) => {
    setBusy(true)
    try {
      const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok || !d.ok) { toast.error(d.detail || 'No se pudo completar'); return }
      toast.success(ok)
      setModo(''); setComentario('')
      onCambio()
    } catch { toast.error('Error de conexión') } finally { setBusy(false) }
  }

  const votar = (decision: 'aprobar' | 'rechazar' | 'ajustes') => call(`/api/capital/purchase-proposals/${p.id}/vote`, 'POST', {
    decision, voter_email: yo, comentario: comentario.trim() || null,
    ...(decision === 'ajustes' ? {
      precio: n(precio) !== p.precio ? n(precio) : undefined,
      mensualidad: n(renta) !== p.mensualidad ? n(renta) : undefined,
      plazo_meses: parseInt(plazo) !== p.plazo_meses ? parseInt(plazo) : undefined,
    } : {}),
  }, decision === 'aprobar' ? (p.status === 'en_comite' ? 'Aprobada por el comité: pasa al VoBo' : 'Compra autorizada') : decision === 'rechazar' ? 'Propuesta rechazada' : 'Ajustes pedidos: vuelve a quien la propuso')

  return (
    <div className="card-luxury p-5 space-y-3" data-testid={`autorizacion-${p.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>{p.casa || 'Casa sin nombre'}</p>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>
            Propuesta por {p.created_by || '—'} · {fecha(p.created_at)}{p.version > 1 ? ` · versión ${p.version}` : ''}
            {p.requested_at ? ` · enviada al comité ${fecha(p.requested_at)}` : ''}
          </p>
        </div>
        <span className="px-2.5 py-1 rounded-full text-xs font-medium" style={{ backgroundColor: e.bg, color: e.fg }} data-testid="estado">{e.label}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <Dato l="Precio" v={formatMoney(p.precio)} />
        <Dato l="Enganche" v={formatMoney(p.enganche)} />
        <Dato l="Renta × plazo" v={`${formatMoney(p.mensualidad)} × ${p.plazo_meses}`} />
        <div>
          <p className="text-xs" style={{ color: 'var(--ash)' }}>Margen anual</p>
          <p className="font-semibold" style={{ color: SEM_COLOR[p.semaforo || ''] || 'var(--ink)' }}>{pct(p.margen_anual)}</p>
          <p className="text-[11px]" style={{ color: 'var(--ash)' }}>fondeo {pct(p.costo_fondeo)}</p>
        </div>
        <Dato l={p.dias_hasta_decision != null ? 'Días hasta la decisión' : 'Días esperando'}
          v={p.dias_hasta_decision != null ? `${p.dias_hasta_decision}` : p.dias_en_espera != null ? `${p.dias_en_espera}` : '—'} />
      </div>

      {p.votos.length > 0 && (
        <div className="rounded-lg p-3 text-xs space-y-1" style={{ backgroundColor: 'var(--sand-50, #faf8f4)' }} data-testid="votos">
          {p.votos.map(v => (
            <p key={v.id} style={{ color: 'var(--slate)' }}>
              <strong style={{ color: 'var(--ink)' }}>{v.etapa === 'comite' ? 'Comité' : 'VoBo'}</strong> · {v.voter_email} ·{' '}
              <strong style={{ color: v.decision === 'aprobar' ? 'var(--success)' : v.decision === 'rechazar' ? 'var(--danger)' : 'var(--warning, #b7791f)' }}>
                {v.decision === 'aprobar' ? 'aprueba' : v.decision === 'rechazar' ? 'rechaza' : 'pide ajustes'}
              </strong>
              {v.ajustes && Object.keys(v.ajustes).length > 0 && (
                <> ({[v.ajustes.precio != null && `precio ${formatMoney(v.ajustes.precio)}`,
                  v.ajustes.mensualidad != null && `renta ${formatMoney(v.ajustes.mensualidad)}`,
                  v.ajustes.plazo_meses != null && `plazo ${v.ajustes.plazo_meses} meses`].filter(Boolean).join(', ')})</>
              )}
              {v.comentario ? ` — ${v.comentario}` : ''} · {fecha(v.created_at)}{v.proposal_version > 1 ? ` · v${v.proposal_version}` : ''}
            </p>
          ))}
        </div>
      )}

      {/* Acciones */}
      <div className="flex flex-wrap items-center gap-2">
        {(p.status === 'borrador' || p.status === 'ajustes') && esMia && modo !== 'editar' && (
          <>
            <button onClick={() => {
              if (ultimoAjuste?.ajustes) {
                if (ultimoAjuste.ajustes.precio != null) setPrecio(String(ultimoAjuste.ajustes.precio))
                if (ultimoAjuste.ajustes.mensualidad != null) setRenta(String(ultimoAjuste.ajustes.mensualidad))
                if (ultimoAjuste.ajustes.plazo_meses != null) setPlazo(String(ultimoAjuste.ajustes.plazo_meses))
              }
              setModo('editar')
            }} className="btn-ghost btn-sm"><Pencil className="w-4 h-4" /> Corregir</button>
            <button disabled={busy} onClick={() => call(`/api/capital/purchase-proposals/${p.id}/submit`, 'POST', { submitted_by: yo }, 'Enviada al Comité de Inversión')}
              className="btn-primary btn-sm" data-testid="enviar-comite"><Send className="w-4 h-4" /> {p.status === 'ajustes' ? 'Reenviar al comité' : 'Enviar al comité'}</button>
          </>
        )}
        {(p.status === 'borrador' || p.status === 'ajustes') && !esMia && (
          <span className="text-xs" style={{ color: 'var(--ash)' }}>Esperando a que {p.created_by || 'quien la propuso'} la {p.status === 'ajustes' ? 'corrija y reenvíe' : 'envíe al comité'}.</span>
        )}
        {votable && !esMia && !modo && (
          <>
            <button onClick={() => setModo('aprobar')} className="btn-primary btn-sm" data-testid="btn-aprobar"><Check className="w-4 h-4" /> {p.status === 'en_comite' ? 'Aprobar (comité)' : 'Dar VoBo'}</button>
            <button onClick={() => setModo('ajustes')} className="btn-secondary btn-sm" data-testid="btn-ajustes"><Pencil className="w-4 h-4" /> Pedir ajustes</button>
            <button onClick={() => setModo('rechazar')} className="btn-ghost btn-sm" data-testid="btn-rechazar"><X className="w-4 h-4" /> Rechazar</button>
          </>
        )}
        {votable && esMia && (
          <span className="text-xs" style={{ color: 'var(--ash)' }} data-testid="no-puedes-votar">La propusiste tú: la vota otra persona del comité.</span>
        )}
        {p.requested_at && (
          <a href={`/api/capital/purchase-proposals/${p.id}/acta`} className="btn-ghost btn-sm ml-auto" data-testid="descargar-acta"><FileDown className="w-4 h-4" /> Acta de comité</a>
        )}
      </div>

      {(modo === 'aprobar' || modo === 'rechazar') && (
        <div className="space-y-2">
          <input className="input w-full" placeholder="Comentario (opcional)" value={comentario} onChange={ev => setComentario(ev.target.value)} />
          <div className="flex gap-2">
            <button disabled={busy} onClick={() => votar(modo)} className="btn-primary btn-sm" data-testid="confirmar-voto">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />} Confirmar {modo === 'aprobar' ? (p.status === 'en_comite' ? 'aprobación' : 'VoBo') : 'rechazo'}
            </button>
            <button onClick={() => setModo('')} className="btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}

      {(modo === 'ajustes' || modo === 'editar') && (
        <div className="space-y-2 rounded-lg p-3" style={{ border: '1px solid var(--sand)' }}>
          <p className="text-xs" style={{ color: 'var(--slate)' }}>
            {modo === 'ajustes' ? 'Cambia lo que quieres que se ajuste (precio, renta o plazo) y explica el motivo.' : 'Corrige la propuesta; el margen y el fondeo se recalculan al guardar.'}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <Campo l="Precio" v={precio} set={setPrecio} />
            {modo === 'editar' && <Campo l="Enganche" v={enganche} set={setEnganche} />}
            <Campo l="Renta mensual" v={renta} set={setRenta} />
            <Campo l="Plazo (meses)" v={plazo} set={setPlazo} />
          </div>
          {modo === 'ajustes' && (
            <input className="input w-full" placeholder="Motivo del ajuste" value={comentario} onChange={ev => setComentario(ev.target.value)} data-testid="motivo-ajuste" />
          )}
          <div className="flex gap-2">
            {modo === 'ajustes' ? (
              <button disabled={busy} onClick={() => votar('ajustes')} className="btn-primary btn-sm" data-testid="confirmar-ajustes">Pedir ajustes</button>
            ) : (
              <button disabled={busy} onClick={() => call(`/api/capital/purchase-proposals/${p.id}`, 'PUT', {
                precio: n(precio), enganche: n(enganche), mensualidad: n(renta), plazo_meses: parseInt(plazo) || undefined, edited_by: yo,
              }, 'Propuesta corregida')} className="btn-primary btn-sm" data-testid="guardar-correccion">Guardar corrección</button>
            )}
            <button onClick={() => setModo('')} className="btn-ghost btn-sm">Cancelar</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Dato({ l, v }: { l: string; v: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'var(--ash)' }}>{l}</p>
      <p className="font-semibold" style={{ color: 'var(--ink)' }}>{v}</p>
    </div>
  )
}

function Campo({ l, v, set }: { l: string; v: string; set: (s: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] mb-0.5" style={{ color: 'var(--ash)' }}>{l}</label>
      <input className="input w-full text-sm" inputMode="decimal" value={v} onChange={e => set(e.target.value)} />
    </div>
  )
}
