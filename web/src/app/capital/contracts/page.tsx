'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { FileSignature, User, MapPin, DollarSign, Clock, Calendar, Plus, Eye, Filter } from 'lucide-react'

interface RTOContract {
  id: string
  monthly_rent: number
  purchase_price: number
  down_payment: number
  term_months: number
  start_date: string
  end_date: string
  status: string
  created_at: string
  clients: { id: string; name: string; email: string; phone: string }
  properties: { id: string; address: string; city: string; state: string; photos?: string[] }
}

// Uses Next.js proxy routes (/api/capital/...)

export default function ContractsPage() {
  const [contracts, setContracts] = useState<RTOContract[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  useEffect(() => { loadContracts() }, [filter])

  const loadContracts = async () => {
    try {
      const params = filter ? `?status=${filter}` : ''
      const res = await fetch(`/api/capital/contracts${params}`)
      const data = await res.json()
      if (data.ok) setContracts(data.contracts)
    } catch (err) {
      console.error('Error loading contracts:', err)
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
    draft: { bg: 'var(--cream)', color: 'var(--slate)', label: 'Borrador' },
    pending_signature: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Pendiente Firma' },
    active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activo' },
    completed: { bg: 'var(--info-light)', color: 'var(--info)', label: 'Pagos Completados' },
    delivered: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: '✅ Entregado' },
    defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Incumplimiento' },
    terminated: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Terminado' },
    holdover: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Holdover' },
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Contratos RTO</h1>
          <p style={{ color: 'var(--slate)' }}>
            Gestión de contratos Rent-to-Own activos y en proceso
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4" style={{ color: 'var(--ash)' }} />
            <select 
              value={filter} 
              onChange={(e) => setFilter(e.target.value)}
              className="input py-2 px-3 text-sm"
              style={{ minHeight: 'auto', width: 'auto' }}
            >
              <option value="">Todos</option>
              <option value="draft">Borrador</option>
              <option value="pending_signature">Pendiente Firma</option>
              <option value="active">Activos</option>
              <option value="completed">Completados</option>
              <option value="defaulted">Incumplimiento</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contracts List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
        </div>
      ) : contracts.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <FileSignature className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            No hay contratos {filter ? `con estado "${statusStyles[filter]?.label || filter}"` : ''}
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            Los contratos se crean después de aprobar una solicitud RTO
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {contracts.map((contract) => {
            const s = statusStyles[contract.status] || statusStyles.draft
            return (
              <Link
                key={contract.id}
                href={`/capital/contracts/${contract.id}`}
                className="card-luxury block hover:border-gold-400 transition-colors"
              >
                <div className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                             style={{ backgroundColor: 'var(--gold-100)' }}>
                          <FileSignature className="w-5 h-5" style={{ color: 'var(--gold-700)' }} />
                        </div>
                        <div>
                          <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>
                            {contract.clients?.name}
                          </h3>
                          <p className="text-sm" style={{ color: 'var(--slate)' }}>
                            {contract.properties?.address}
                          </p>
                        </div>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-4 mt-3 ml-13">
                        <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--charcoal)' }}>
                          <DollarSign className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                          {fmt(contract.monthly_rent)}/mes
                        </span>
                        <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--charcoal)' }}>
                          <Clock className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                          {contract.term_months} meses
                        </span>
                        <span className="flex items-center gap-1 text-sm" style={{ color: 'var(--charcoal)' }}>
                          <Calendar className="w-4 h-4" style={{ color: 'var(--ash)' }} />
                          {new Date(contract.start_date).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}
                          {' → '}
                          {new Date(contract.end_date).toLocaleDateString('es-MX', { month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span className="badge" style={{ backgroundColor: s.bg, color: s.color }}>
                        {s.label}
                      </span>
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

