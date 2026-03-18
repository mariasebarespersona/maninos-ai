'use client'

import { useEffect, useState } from 'react'
import {
  Users, Landmark, Building2, ShoppingCart,
  Target, TrendingUp, TrendingDown, CheckCircle2,
  AlertTriangle, XCircle, ArrowLeft, BarChart3,
} from 'lucide-react'

interface KPIMetric {
  key: string
  label: string
  description: string
  value: number | null
  target: number
  unit: string
  direction: 'higher_is_better' | 'lower_is_better'
  status: 'on_target' | 'warning' | 'off_target'
  extra?: Record<string, any>
}

interface KPICategory {
  title: string
  metrics: KPIMetric[]
}

interface KPIsData {
  client: KPICategory
  investor: KPICategory
  portfolio: KPICategory
  purchase: KPICategory
}

const categoryConfig: Record<string, { icon: any; color: string; bg: string }> = {
  client: { icon: Users, color: 'var(--info)', bg: 'var(--info-light)' },
  investor: { icon: Landmark, color: 'var(--gold-700)', bg: 'var(--gold-100)' },
  portfolio: { icon: Building2, color: 'var(--success)', bg: 'var(--success-light)' },
  purchase: { icon: ShoppingCart, color: 'var(--navy-700)', bg: 'var(--navy-100, #e0e7ff)' },
}

export default function KPIsPage() {
  const [kpis, setKpis] = useState<KPIsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadKPIs()
  }, [])

  const loadKPIs = async () => {
    try {
      const res = await fetch('/api/capital/dashboard/kpis')
      const data = await res.json()
      if (data.ok) setKpis(data.kpis)
    } catch (err) {
      console.error('Error loading KPIs:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!kpis) {
    return (
      <div className="text-center py-12" style={{ color: 'var(--slate)' }}>
        Error al cargar KPIs
      </div>
    )
  }

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
          KPIs Estrategicos
        </h1>
        <p className="mt-1" style={{ color: 'var(--slate)' }}>
          Indicadores clave de rendimiento — Clientes, Inversores, Portfolio y Compra
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {(Object.keys(categoryConfig) as Array<keyof typeof categoryConfig>).map((catKey) => {
          const cat = kpis[catKey as keyof KPIsData]
          const cfg = categoryConfig[catKey]
          if (!cat) return null
          const onTarget = cat.metrics.filter(m => m.status === 'on_target').length
          const total = cat.metrics.length
          const Icon = cfg.icon
          return (
            <a key={catKey} href={`#${catKey}`} className="stat-card hover:border-gold-400 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.bg }}>
                  <Icon className="w-5 h-5" style={{ color: cfg.color }} />
                </div>
              </div>
              <div className="stat-value" style={{ color: onTarget === total ? 'var(--success)' : 'var(--charcoal)' }}>
                {onTarget}/{total}
              </div>
              <div className="stat-label">{cat.title} - En Meta</div>
            </a>
          )
        })}
      </div>

      {/* KPI Categories */}
      {(Object.entries(kpis) as Array<[string, KPICategory]>).map(([catKey, category]) => {
        const cfg = categoryConfig[catKey] || categoryConfig.client
        const Icon = cfg.icon
        return (
          <div key={catKey} id={catKey} className="card-luxury">
            <div className="p-5 border-b flex items-center gap-3" style={{ borderColor: 'var(--sand)' }}>
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: cfg.bg }}>
                <Icon className="w-5 h-5" style={{ color: cfg.color }} />
              </div>
              <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{category.title}</h2>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {category.metrics.map((metric) => (
                  <KPICard key={metric.key} metric={metric} />
                ))}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function KPICard({ metric }: { metric: KPIMetric }) {
  const value = metric.value
  const hasValue = value !== null && value !== undefined
  const displayValue = hasValue ? `${value}${metric.unit === '%' ? '%' : ''}` : 'N/A'
  const displayUnit = metric.unit !== '%' ? ` ${metric.unit}` : ''

  const statusConfig = {
    on_target: { icon: CheckCircle2, color: 'var(--success)', bg: 'var(--success-light)', label: 'En meta' },
    warning: { icon: AlertTriangle, color: 'var(--warning)', bg: 'var(--warning-light)', label: 'Atencion' },
    off_target: { icon: XCircle, color: 'var(--error)', bg: 'var(--error-light)', label: 'Fuera de meta' },
  }

  const status = statusConfig[metric.status] || statusConfig.warning
  const StatusIcon = status.icon

  // Progress calculation
  let progressPct = 0
  if (hasValue && metric.target > 0) {
    if (metric.direction === 'higher_is_better') {
      progressPct = Math.min(100, (value! / metric.target) * 100)
    } else {
      // Lower is better: 100% when at or below target, decreasing as value exceeds target
      progressPct = value! <= metric.target ? 100 : Math.max(0, 100 - ((value! - metric.target) / metric.target) * 100)
    }
  }

  const directionSymbol = metric.direction === 'higher_is_better' ? '>=' : '<='
  const targetDisplay = `${directionSymbol} ${metric.target}${metric.unit === '%' ? '%' : ` ${metric.unit}`}`

  return (
    <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--stone)' }}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h4 className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {metric.label}
          </h4>
          <p className="text-xs mt-0.5" style={{ color: 'var(--ash)' }}>
            {metric.description}
          </p>
        </div>
        <div className="flex items-center gap-1 px-2 py-1 rounded-md" style={{ backgroundColor: status.bg }}>
          <StatusIcon className="w-3.5 h-3.5" style={{ color: status.color }} />
          <span className="text-xs font-medium" style={{ color: status.color }}>{status.label}</span>
        </div>
      </div>

      {/* Value & Target */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <span className="text-2xl font-bold" style={{ color: status.color }}>
            {displayValue}
          </span>
          {metric.unit !== '%' && hasValue && (
            <span className="text-sm ml-1" style={{ color: 'var(--slate)' }}>{displayUnit}</span>
          )}
        </div>
        <div className="text-right">
          <span className="text-xs" style={{ color: 'var(--ash)' }}>Meta: </span>
          <span className="text-sm font-semibold" style={{ color: 'var(--charcoal)' }}>
            {targetDisplay}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="w-full h-2 rounded-full" style={{ backgroundColor: 'var(--sand)' }}>
        <div
          className="h-2 rounded-full transition-all duration-500"
          style={{
            width: `${progressPct}%`,
            backgroundColor: metric.status === 'on_target' ? 'var(--success)' :
              metric.status === 'warning' ? 'var(--warning)' : 'var(--error)',
          }}
        />
      </div>

      {/* Extra info */}
      {metric.extra && metric.extra.raised !== undefined && (
        <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
          Fondeo este mes: ${metric.extra.raised?.toLocaleString()} / ${metric.extra.target_amount?.toLocaleString()}
        </p>
      )}
    </div>
  )
}
