'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, XCircle, RefreshCw, Clock, PlayCircle, Loader2, AlertCircle } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Run {
  id: string
  job_name: string
  started_at: string
  finished_at: string | null
  ok: boolean | null
  duration_ms: number | null
  summary: any
  error: string | null
  created_at: string
}

function relTime(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 60) return 'hace segundos'
  if (diffSec < 3600) return `hace ${Math.round(diffSec / 60)} min`
  if (diffSec < 86400) return `hace ${Math.round(diffSec / 3600)} h`
  const days = Math.round(diffSec / 86400)
  return `hace ${days} día${days !== 1 ? 's' : ''}`
}

function absTime(iso: string): string {
  return new Date(iso).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function SchedulerRunsWidget() {
  const toast = useToast()
  const [runs, setRuns] = useState<Run[]>([])
  const [loading, setLoading] = useState(true)
  const [triggering, setTriggering] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const fetchRuns = async () => {
    try {
      const res = await fetch('/api/transfers/title-monitor/runs?limit=10')
      const data = await res.json()
      setRuns(data?.runs || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const triggerNow = async () => {
    setTriggering(true)
    try {
      const res = await fetch('/api/transfers/title-monitor/trigger', { method: 'POST' })
      const data = await res.json()
      if (res.ok && data?.ok) {
        const summary = data?.result || {}
        toast.success(
          `Scheduler ejecutado — checked ${summary.checked ?? 0}, matched ${summary.matched ?? 0}, populated ${summary.populated ?? 0}`
        )
        fetchRuns()
      } else {
        toast.error(data?.detail || 'Error al disparar scheduler')
      }
    } catch (err: any) {
      toast.error(`Error: ${err?.message || err}`)
    } finally {
      setTriggering(false)
    }
  }

  useEffect(() => {
    fetchRuns()
  }, [])

  const lastRun = runs[0]
  const hasRuns = runs.length > 0

  return (
    <div className="card-luxury p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`p-2 rounded-lg flex-shrink-0 ${
            !hasRuns
              ? 'bg-gray-100'
              : lastRun.ok
                ? 'bg-emerald-100'
                : 'bg-red-100'
          }`}>
            {!hasRuns ? (
              <Clock className="w-5 h-5 text-gray-500" />
            ) : lastRun.ok ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-sm text-navy-900">Scheduler de Títulos</h3>
            <p className="text-xs text-navy-500 mt-0.5">
              Corre automáticamente todos los días a las 10:00 AM US Central Time
            </p>
            {loading ? (
              <p className="text-xs text-navy-400 mt-2">Cargando…</p>
            ) : !hasRuns ? (
              <p className="text-xs text-amber-700 mt-2 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" />
                Sin corridas registradas aún. Probá disparar uno manualmente.
              </p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-xs text-charcoal">
                  <strong>Última corrida:</strong>{' '}
                  <span title={absTime(lastRun.started_at)}>
                    {relTime(lastRun.started_at)}
                  </span>
                  {' · '}
                  <span className={lastRun.ok ? 'text-emerald-700' : 'text-red-600'}>
                    {lastRun.ok ? 'OK' : 'FAILED'}
                  </span>
                  {lastRun.duration_ms != null && (
                    <span className="text-navy-400"> · {lastRun.duration_ms}ms</span>
                  )}
                </p>
                {lastRun.summary && (
                  <p className="text-xs text-navy-500">
                    {typeof lastRun.summary.checked === 'number' && (
                      <span>checked: <strong>{lastRun.summary.checked}</strong></span>
                    )}
                    {typeof lastRun.summary.matched === 'number' && (
                      <span className="ml-3">matched: <strong className="text-emerald-600">{lastRun.summary.matched}</strong></span>
                    )}
                    {typeof lastRun.summary.populated === 'number' && lastRun.summary.populated > 0 && (
                      <span className="ml-3">populated: <strong>{lastRun.summary.populated}</strong></span>
                    )}
                  </p>
                )}
                {lastRun.error && (
                  <p className="text-xs text-red-600 font-mono truncate" title={lastRun.error}>
                    {lastRun.error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={fetchRuns}
            className="p-1.5 rounded-lg border border-stone hover:bg-sand/40 text-slate transition-colors"
            title="Refrescar"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={triggerNow}
            disabled={triggering}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-navy-200 bg-navy-50 text-navy-700 hover:bg-navy-100 transition-colors disabled:opacity-50"
            title="Ejecutar scheduler ahora (sin esperar a las 10am)"
          >
            {triggering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            {triggering ? 'Ejecutando…' : 'Ejecutar ahora'}
          </button>
        </div>
      </div>

      {/* Expandable history */}
      {hasRuns && runs.length > 1 && (
        <div className="mt-3 pt-3 border-t border-sand">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-navy-600 hover:text-navy-800 flex items-center gap-1"
          >
            {expanded ? '▼' : '▶'} Ver historial ({runs.length} corridas)
          </button>
          {expanded && (
            <div className="mt-3 space-y-1.5 max-h-64 overflow-y-auto">
              {runs.map(r => (
                <div
                  key={r.id}
                  className="flex items-center gap-2 text-xs py-1.5 px-2 rounded bg-ivory border border-sand"
                >
                  {r.ok === null ? (
                    <Loader2 className="w-3 h-3 animate-spin text-amber-500 flex-shrink-0" />
                  ) : r.ok ? (
                    <CheckCircle2 className="w-3 h-3 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-600 flex-shrink-0" />
                  )}
                  <span className="text-charcoal font-mono text-[11px]">
                    {absTime(r.started_at)}
                  </span>
                  {r.duration_ms != null && (
                    <span className="text-navy-400">{r.duration_ms}ms</span>
                  )}
                  {r.summary && typeof r.summary.checked === 'number' && (
                    <span className="text-navy-500">
                      ch:{r.summary.checked} m:{r.summary.matched ?? 0}
                    </span>
                  )}
                  {r.error && (
                    <span className="text-red-500 truncate" title={r.error}>
                      {r.error}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
