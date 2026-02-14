'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileCheck, User, MapPin, DollarSign, Clock, Eye, Filter } from 'lucide-react'

interface RTOApplication {
  id: string
  status: string
  monthly_income: number | null
  employment_status: string | null
  employer_name: string | null
  time_at_job: string | null
  desired_term_months: number | null
  desired_down_payment: number | null
  review_notes: string | null
  reviewed_at: string | null
  created_at: string
  clients: { id: string; name: string; email: string; phone: string; monthly_income?: number }
  properties: { id: string; address: string; city: string; state: string; sale_price: number; photos?: string[] }
  sales: { id: string; sale_price: number; status: string }
}

export default function ApplicationsPage() {
  const [applications, setApplications] = useState<RTOApplication[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')

  useEffect(() => {
    loadApplications()
  }, [filter])

  const loadApplications = async () => {
    try {
      const params = filter ? `?status=${filter}` : ''
      const res = await fetch(`/api/capital/applications${params}`)
      const data = await res.json()
      if (data.ok) setApplications(data.applications)
    } catch (err) {
      console.error('Error loading applications:', err)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    submitted: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente' },
    under_review: { bg: 'var(--info-light)', color: 'var(--info)', label: 'En Revisión' },
    needs_info: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Info Requerida' },
    approved: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Aprobada' },
    rejected: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Rechazada' },
    cancelled: { bg: 'var(--cream)', color: 'var(--ash)', label: 'Cancelada' },
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Solicitudes RTO</h1>
          <p style={{ color: 'var(--slate)' }}>
            Revisión y aprobación de solicitudes Rent-to-Own
          </p>
        </div>
        
        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4" style={{ color: 'var(--ash)' }} />
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            className="input py-2 px-3 text-sm"
            style={{ minHeight: 'auto', width: 'auto' }}
          >
            <option value="">Todas</option>
            <option value="submitted">Pendientes</option>
            <option value="under_review">En Revisión</option>
            <option value="needs_info">Info Requerida</option>
            <option value="approved">Aprobadas</option>
            <option value="rejected">Rechazadas</option>
          </select>
        </div>
      </div>

      {/* Applications List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
        </div>
      ) : applications.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <FileCheck className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            No hay solicitudes {filter ? `con estado "${statusStyles[filter]?.label || filter}"` : ''}
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            Las solicitudes RTO del Portal Clientes aparecerán aquí
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const s = statusStyles[app.status] || statusStyles.submitted
            return (
              <Link
                key={app.id}
                href={`/capital/applications/${app.id}`}
                className="card-luxury block hover:border-gold-400 transition-colors"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    {/* Left: Client + Property Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                             style={{ backgroundColor: 'var(--gold-100)' }}>
                          <User className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
                        </div>
                        <div>
                          <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>
                            {app.clients?.name || 'Cliente'}
                          </h3>
                          <p className="text-sm" style={{ color: 'var(--slate)' }}>
                            {app.clients?.email} · {app.clients?.phone}
                          </p>
                        </div>
                      </div>
                      
                      <div className="ml-13 space-y-1 mt-3">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                          <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                            {app.properties?.address}{app.properties?.city ? `, ${app.properties.city}` : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                          <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                            Precio: {fmt(app.properties?.sale_price || 0)}
                            {app.monthly_income ? ` · Ingresos: ${fmt(app.monthly_income)}/mes` : ''}
                          </span>
                        </div>
                        {app.desired_term_months && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--ash)' }} />
                            <span className="text-sm" style={{ color: 'var(--charcoal)' }}>
                              Plazo deseado: {app.desired_term_months} meses
                              {app.desired_down_payment ? ` · Enganche: ${fmt(app.desired_down_payment)}` : ''}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Status + Date */}
                    <div className="text-right flex-shrink-0">
                      <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>
                        {s.label}
                      </span>
                      <p className="text-xs mt-2" style={{ color: 'var(--ash)' }}>
                        {new Date(app.created_at).toLocaleDateString('es-MX', { 
                          day: 'numeric', month: 'short', year: 'numeric' 
                        })}
                      </p>
                      <div className="flex items-center gap-1 mt-2 justify-end" style={{ color: 'var(--gold-600)' }}>
                        <Eye className="w-4 h-4" />
                        <span className="text-xs font-medium">Ver detalle</span>
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

