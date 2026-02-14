'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  FileCheck, FileSignature, CreditCard, Landmark,
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ArrowRight, DollarSign, Users, Building2,
  BarChart3, ArrowRightLeft, Calculator
} from 'lucide-react'

interface DashboardKPIs {
  active_contracts: number
  total_contracts: number
  pending_applications: number
  monthly_expected_revenue: number
  portfolio_value: number
  paid_this_month: number
  pending_this_month: number
  late_payments: number
  active_investors: number
  total_invested: number
  available_capital: number
}

interface Activity {
  type: string
  id: string
  title: string
  description: string
  status: string
  date: string
}

// Uses Next.js proxy routes (/api/capital/...)

export default function CapitalDashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
  }, [])

  const loadDashboard = async () => {
    try {
      const [summaryRes, activityRes] = await Promise.all([
        fetch(`/api/capital/dashboard/summary`),
        fetch(`/api/capital/dashboard/recent-activity`),
      ])
      
      const summaryData = await summaryRes.json()
      const activityData = await activityRes.json()
      
      if (summaryData.ok) setKpis(summaryData.kpis)
      if (activityData.ok) setActivities(activityData.activities)
    } catch (err) {
      console.error('Error loading dashboard:', err)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
          Panel Maninos Capital
        </h1>
        <p className="mt-1" style={{ color: 'var(--slate)' }}>
          Gestión de contratos Rent-to-Own y cartera de pagos
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Applications */}
        <Link href="/capital/applications" className="stat-card hover:border-gold-400 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--warning-light)' }}>
              <FileCheck className="w-5 h-5" style={{ color: 'var(--warning)' }} />
            </div>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
          </div>
          <div className="stat-value">{kpis?.pending_applications || 0}</div>
          <div className="stat-label">Solicitudes Pendientes</div>
        </Link>

        {/* Active Contracts */}
        <Link href="/capital/contracts" className="stat-card hover:border-gold-400 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--info-light)' }}>
              <FileSignature className="w-5 h-5" style={{ color: 'var(--info)' }} />
            </div>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
          </div>
          <div className="stat-value">{kpis?.active_contracts || 0}</div>
          <div className="stat-label">Contratos Activos</div>
        </Link>

        {/* Monthly Revenue */}
        <div className="stat-card">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: 'var(--success-light)' }}>
              <DollarSign className="w-5 h-5" style={{ color: 'var(--success)' }} />
            </div>
          </div>
          <div className="stat-value">{fmt(kpis?.monthly_expected_revenue || 0)}</div>
          <div className="stat-label">Ingreso Mensual Esperado</div>
        </div>

        {/* Late Payments */}
        <Link href="/capital/payments?filter=overdue" className="stat-card hover:border-gold-400 transition-colors group">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" 
                 style={{ backgroundColor: kpis?.late_payments ? 'var(--error-light)' : 'var(--success-light)' }}>
              <AlertTriangle className="w-5 h-5" style={{ color: kpis?.late_payments ? 'var(--error)' : 'var(--success)' }} />
            </div>
            <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
          </div>
          <div className="stat-value" style={{ color: kpis?.late_payments ? 'var(--error)' : 'var(--success)' }}>
            {kpis?.late_payments || 0}
          </div>
          <div className="stat-label">Pagos Atrasados</div>
        </Link>
      </div>

      {/* Second Row KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <Building2 className="w-5 h-5" style={{ color: 'var(--navy-500)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Valor del Portafolio</span>
          </div>
          <div className="stat-value text-2xl">{fmt(kpis?.portfolio_value || 0)}</div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <TrendingUp className="w-5 h-5" style={{ color: 'var(--success)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Cobrado Este Mes</span>
          </div>
          <div className="stat-value text-2xl" style={{ color: 'var(--success)' }}>
            {fmt(kpis?.paid_this_month || 0)}
          </div>
        </div>

        <div className="stat-card">
          <div className="flex items-center gap-3 mb-2">
            <Landmark className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
            <span className="stat-label" style={{ margin: 0 }}>Capital Disponible</span>
          </div>
          <div className="stat-value text-2xl">{fmt(kpis?.available_capital || 0)}</div>
        </div>
      </div>

      {/* Quick Links to New Sections */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Link href="/capital/flows" className="card-luxury p-4 flex items-center gap-3 hover:border-gold-400 transition-colors group">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-100)' }}>
            <ArrowRightLeft className="w-5 h-5" style={{ color: 'var(--navy-700)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Flujo de Capital</p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Fondear → Adquirir → Cobrar</p>
          </div>
          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
        </Link>
        <Link href="/capital/analysis" className="card-luxury p-4 flex items-center gap-3 hover:border-gold-400 transition-colors group">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--gold-100)' }}>
            <Calculator className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Análisis Financiero</p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Evaluación de adquisiciones</p>
          </div>
          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
        </Link>
        <Link href="/capital/reports" className="card-luxury p-4 flex items-center gap-3 hover:border-gold-400 transition-colors group">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--success-light)' }}>
            <BarChart3 className="w-5 h-5" style={{ color: 'var(--success)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Reportes Mensuales</p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>PDF con métricas del portafolio</p>
          </div>
          <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
        </Link>
      </div>

      {/* Recent Activity */}
      <div className="card-luxury">
        <div className="p-5 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Actividad Reciente</h3>
        </div>
        <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
          {activities.length === 0 ? (
            <div className="p-8 text-center">
              <Clock className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
              <p style={{ color: 'var(--slate)' }}>No hay actividad reciente</p>
              <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>
                Las solicitudes RTO y pagos aparecerán aquí
              </p>
            </div>
          ) : (
            activities.map((activity) => (
              <div key={activity.id} className="px-5 py-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" 
                     style={{ 
                       backgroundColor: activity.type === 'payment' ? 'var(--success-light)' : 'var(--warning-light)' 
                     }}>
                  {activity.type === 'payment' ? (
                    <DollarSign className="w-5 h-5" style={{ color: 'var(--success)' }} />
                  ) : (
                    <FileCheck className="w-5 h-5" style={{ color: 'var(--warning)' }} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium" style={{ color: 'var(--charcoal)' }}>{activity.title}</p>
                  <p className="text-sm truncate" style={{ color: 'var(--slate)' }}>{activity.description}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <StatusBadge status={activity.status} />
                  <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                    {new Date(activity.date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, { bg: string; color: string; label: string }> = {
    submitted: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    under_review: { bg: 'var(--info-light)', color: 'var(--info)', label: 'En Revisión' },
    approved: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Aprobado' },
    rejected: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Rechazado' },
    paid: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Pagado' },
    late: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Atrasado' },
    pending: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    active: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Activo' },
    completed: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Completado' },
    delivered: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Entregado' },
  }

  const s = styles[status] || styles.pending
  
  return (
    <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>
      {s.label}
    </span>
  )
}

