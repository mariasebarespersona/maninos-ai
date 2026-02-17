'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  FileCheck, FileSignature, CreditCard, Landmark,
  TrendingUp, AlertTriangle, Clock, CheckCircle2,
  ArrowRight, DollarSign, Users, Building2,
  BarChart3, ArrowRightLeft, Shield,
  AlertCircle, ChevronRight, Phone
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

interface CarteraHealth {
  active_contracts: number
  portfolio_value: number
  monthly_expected: number
  paid_this_month: number
  collection_rate: number
  delinquency_rate: number
  total_overdue_payments: number
  total_overdue_amount: number
  total_late_fees_accrued: number
  aging: {
    '0_30_days': { count: number; amount: number }
    '31_60_days': { count: number; amount: number }
    '61_90_days': { count: number; amount: number }
    '90_plus_days': { count: number; amount: number }
  }
  at_risk_clients: Array<{
    client_id: string
    client_name: string
    client_phone: string | null
    property_address: string
    overdue_payments: number
    overdue_amount: number
    max_days_late: number
    risk_level: string
    contract_id: string
  }>
  clients_in_mora: number
}

export default function CapitalDashboardPage() {
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null)
  const [activities, setActivities] = useState<Activity[]>([])
  const [cartera, setCartera] = useState<CarteraHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDashboard()
    // Trigger payment status updates on dashboard load
    fetch('/api/capital/payments/update-statuses', { method: 'POST' }).catch(() => {})
  }, [])

  const loadDashboard = async () => {
    try {
      const [summaryRes, activityRes, carteraRes] = await Promise.all([
        fetch(`/api/capital/dashboard/summary`),
        fetch(`/api/capital/dashboard/recent-activity`),
        fetch(`/api/capital/dashboard/cartera-health`),
      ])
      
      const summaryData = await summaryRes.json()
      const activityData = await activityRes.json()
      const carteraData = await carteraRes.json()
      
      if (summaryData.ok) setKpis(summaryData.kpis)
      if (activityData.ok) setActivities(activityData.activities)
      if (carteraData.ok) setCartera(carteraData.cartera)
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

      {/* Cartera Health Section */}
      {cartera && (
        <div className="card-luxury">
          <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: 'var(--navy-700)' }} />
              <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Salud de Cartera</h3>
            </div>
            <Link href="/capital/payments" className="text-sm font-medium flex items-center gap-1" style={{ color: 'var(--gold-600)' }}>
              Ver todo <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <div className="p-5">
            {/* Top metrics row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Tasa Cobro</p>
                <p className="text-xl font-bold mt-1" style={{ 
                  color: cartera.collection_rate >= 90 ? 'var(--success)' : 
                         cartera.collection_rate >= 70 ? 'var(--warning)' : 'var(--error)' 
                }}>
                  {cartera.collection_rate}%
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Tasa Morosidad</p>
                <p className="text-xl font-bold mt-1" style={{ 
                  color: cartera.delinquency_rate <= 5 ? 'var(--success)' : 
                         cartera.delinquency_rate <= 15 ? 'var(--warning)' : 'var(--error)' 
                }}>
                  {cartera.delinquency_rate}%
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Monto en Riesgo</p>
                <p className="text-xl font-bold mt-1" style={{ color: cartera.total_overdue_amount > 0 ? 'var(--error)' : 'var(--charcoal)' }}>
                  {fmt(cartera.total_overdue_amount)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Late Fees Acumulados</p>
                <p className="text-xl font-bold mt-1" style={{ color: 'var(--charcoal)' }}>
                  {fmt(cartera.total_late_fees_accrued)}
                </p>
              </div>
            </div>

            {/* Aging Analysis */}
            {cartera.total_overdue_payments > 0 && (
              <div className="mb-5">
                <p className="text-sm font-semibold mb-3" style={{ color: 'var(--charcoal)' }}>
                  Aging de Cartera — {cartera.total_overdue_payments} pagos vencidos
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {[
                    { key: '0_30_days' as const, label: '0-30 días', color: '#fbbf24' },
                    { key: '31_60_days' as const, label: '31-60 días', color: '#f97316' },
                    { key: '61_90_days' as const, label: '61-90 días', color: '#ef4444' },
                    { key: '90_plus_days' as const, label: '90+ días', color: '#991b1b' },
                  ].map(({ key, label, color }) => {
                    const bucket = cartera.aging[key]
                    return (
                      <div key={key} className="text-center p-3 rounded-lg" style={{ backgroundColor: `${color}10` }}>
                        <div className="w-3 h-3 rounded-full mx-auto mb-1" style={{ backgroundColor: color }} />
                        <p className="text-xs font-medium" style={{ color: 'var(--slate)' }}>{label}</p>
                        <p className="text-lg font-bold" style={{ color }}>{bucket.count}</p>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>{fmt(bucket.amount)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* At-Risk Clients */}
            {cartera.at_risk_clients.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--charcoal)' }}>
                  Clientes en Riesgo ({cartera.clients_in_mora})
                </p>
                <div className="space-y-2">
                  {cartera.at_risk_clients.slice(0, 5).map((client) => (
                    <Link
                      key={client.client_id}
                      href={`/capital/contracts/${client.contract_id}`}
                      className="flex items-center gap-3 p-3 rounded-lg hover:bg-sand/40 transition-colors"
                      style={{ backgroundColor: 'var(--cream)' }}
                    >
                      <div className="w-2 h-8 rounded-full" style={{ 
                        backgroundColor: client.risk_level === 'critical' ? '#991b1b' :
                                         client.risk_level === 'high' ? '#ef4444' :
                                         client.risk_level === 'medium' ? '#f97316' : '#fbbf24'
                      }} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm" style={{ color: 'var(--charcoal)' }}>
                          {client.client_name}
                        </p>
                        <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>
                          {client.property_address}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-sm" style={{ color: 'var(--error)' }}>
                          {fmt(client.overdue_amount)}
                        </p>
                        <p className="text-xs" style={{ color: 'var(--error)' }}>
                          {client.max_days_late}d · {client.overdue_payments} pagos
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {cartera.total_overdue_payments === 0 && (
              <div className="text-center py-4">
                <CheckCircle2 className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--success)' }} />
                <p className="font-medium" style={{ color: 'var(--success)' }}>Cartera al día</p>
                <p className="text-sm" style={{ color: 'var(--slate)' }}>No hay pagos vencidos</p>
              </div>
            )}
          </div>
        </div>
      )}

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

      {/* Quick Links */}
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
        <Link href="/capital/accounting" className="card-luxury p-4 flex items-center gap-3 hover:border-gold-400 transition-colors group">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--gold-100)' }}>
            <DollarSign className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>Contabilidad</p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>Transacciones y cuentas bancarias</p>
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
