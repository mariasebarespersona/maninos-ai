'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Users, Search, ShieldCheck, DollarSign, Home,
  Clock, CheckCircle2, XCircle, ArrowRight, Loader2,
  AlertTriangle, Filter,
} from 'lucide-react'

interface Application {
  id: string
  status: string
  desired_term_months: number | null
  desired_down_payment: number | null
  monthly_income: number | null
  created_at: string
  clients: {
    id: string
    name: string
    email: string
    phone: string
    kyc_verified: boolean
    kyc_status: string
  }
  properties: {
    id: string
    address: string
    city: string
    state: string
    sale_price: number
    photos: string[]
  }
  sales: {
    id: string
    sale_price: number
    status: string
  }
}

type StatusFilter = 'all' | 'submitted' | 'under_review' | 'approved' | 'rejected' | 'needs_info'

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; icon: typeof Clock }> = {
  submitted: { label: 'Nuevo', bg: 'var(--warning-light)', color: 'var(--warning)', icon: Clock },
  under_review: { label: 'En Revisión', bg: 'var(--info-light)', color: 'var(--info)', icon: Search },
  needs_info: { label: 'Info Pendiente', bg: '#fff3cd', color: '#856404', icon: AlertTriangle },
  approved: { label: 'Aprobado', bg: 'var(--success-light)', color: 'var(--success)', icon: CheckCircle2 },
  rejected: { label: 'Rechazado', bg: 'var(--error-light)', color: 'var(--error)', icon: XCircle },
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<Application[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    loadApplications()
  }, [])

  const loadApplications = async () => {
    try {
      const res = await fetch('/api/capital/applications')
      const data = await res.json()
      if (data.ok) setApplications(data.applications || [])
    } catch (err) {
      console.error('Error loading applications:', err)
    } finally {
      setLoading(false)
    }
  }

  const filtered = applications.filter((app) => {
    if (filter !== 'all' && app.status !== filter) return false
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      const name = app.clients?.name?.toLowerCase() || ''
      const email = app.clients?.email?.toLowerCase() || ''
      const addr = app.properties?.address?.toLowerCase() || ''
      if (!name.includes(q) && !email.includes(q) && !addr.includes(q)) return false
    }
    return true
  })

  const stats = {
    total: applications.length,
    submitted: applications.filter(a => a.status === 'submitted').length,
    under_review: applications.filter(a => a.status === 'under_review').length,
    approved: applications.filter(a => a.status === 'approved').length,
    rejected: applications.filter(a => a.status === 'rejected').length,
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
          Clientes RTO
        </h1>
        <p className="mt-1" style={{ color: 'var(--slate)' }}>
          Solicitudes, verificación de identidad y capacidad de pago
        </p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {[
          { label: 'Total', value: stats.total, color: 'var(--charcoal)' },
          { label: 'Nuevos', value: stats.submitted, color: 'var(--warning)' },
          { label: 'En Revisión', value: stats.under_review, color: 'var(--info)' },
          { label: 'Aprobados', value: stats.approved, color: 'var(--success)' },
          { label: 'Rechazados', value: stats.rejected, color: 'var(--error)' },
        ].map((s) => (
          <div key={s.label} className="card-luxury p-3 text-center">
            <p className="text-2xl font-bold" style={{ color: s.color }}>{s.value}</p>
            <p className="text-xs" style={{ color: 'var(--ash)' }}>{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            placeholder="Buscar por nombre, email o dirección..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border text-sm"
            style={{ borderColor: 'var(--stone)', backgroundColor: 'white' }}
          />
        </div>

        {/* Status filter */}
        <div className="flex gap-1.5 flex-wrap">
          {(['all', 'submitted', 'under_review', 'approved', 'rejected'] as StatusFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                filter === f ? 'text-white' : ''
              }`}
              style={{
                backgroundColor: filter === f ? 'var(--gold-700)' : 'var(--cream)',
                color: filter === f ? 'white' : 'var(--slate)',
              }}
            >
              {f === 'all' ? 'Todos' : STATUS_CONFIG[f]?.label || f}
            </button>
          ))}
        </div>
      </div>

      {/* Client cards */}
      {filtered.length === 0 ? (
        <div className="card-luxury p-10 text-center">
          <Users className="w-10 h-10 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
          <p style={{ color: 'var(--slate)' }}>
            {applications.length === 0 ? 'No hay solicitudes RTO todavía' : 'No hay resultados con los filtros aplicados'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((app) => {
            const statusCfg = STATUS_CONFIG[app.status] || STATUS_CONFIG.submitted
            const StatusIcon = statusCfg.icon
            const kycOk = app.clients?.kyc_verified
            const hasIncome = !!app.monthly_income

            return (
              <Link
                key={app.id}
                href={`/capital/applications/${app.id}`}
                className="card-luxury p-4 flex items-center gap-4 hover:border-gold-400 transition-colors group"
              >
                {/* Photo */}
                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                  {app.properties?.photos?.[0] ? (
                    <img src={app.properties.photos[0]} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-6 h-6" style={{ color: 'var(--ash)' }} />
                    </div>
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <p className="font-semibold truncate" style={{ color: 'var(--charcoal)' }}>
                      {app.clients?.name || 'Sin nombre'}
                    </p>
                    <span className="badge text-[10px]" style={{ backgroundColor: statusCfg.bg, color: statusCfg.color }}>
                      {statusCfg.label}
                    </span>
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--slate)' }}>
                    {app.properties?.address}, {app.properties?.city}
                  </p>
                  <div className="flex items-center gap-4 mt-1.5 text-xs" style={{ color: 'var(--ash)' }}>
                    <span className="font-medium" style={{ color: 'var(--gold-700)' }}>
                      {fmt(app.properties?.sale_price || 0)}
                    </span>
                    {app.desired_down_payment != null && (
                      <span>Enganche: {fmt(app.desired_down_payment)}</span>
                    )}
                    {app.desired_term_months != null && (
                      <span>{app.desired_term_months} meses</span>
                    )}
                  </div>
                </div>

                {/* Verification badges */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: kycOk ? 'var(--success-light)' : 'var(--cream)' }}
                    title={kycOk ? 'Identidad verificada' : 'Identidad pendiente'}
                  >
                    <ShieldCheck className="w-4 h-4" style={{ color: kycOk ? 'var(--success)' : 'var(--ash)' }} />
                  </div>
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: hasIncome ? 'var(--success-light)' : 'var(--cream)' }}
                    title={hasIncome ? 'Info financiera disponible' : 'Capacidad de pago pendiente'}
                  >
                    <DollarSign className="w-4 h-4" style={{ color: hasIncome ? 'var(--success)' : 'var(--ash)' }} />
                  </div>
                  <ArrowRight className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--slate)' }} />
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
