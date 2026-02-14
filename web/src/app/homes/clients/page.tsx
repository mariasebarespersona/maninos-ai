'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  Users, 
  Search, 
  Plus,
  Phone,
  Mail,
  Building2,
  CheckCircle2,
  Clock,
  UserPlus,
  FileSignature,
  Home,
  XCircle,
  ArrowRight,
  Loader2
} from 'lucide-react'

/**
 * Client Dashboard - Portal Homes
 * "Institutional Warmth" Design
 * Clear, warm, accessible for 40+ users
 */

interface ClientWithSale {
  id: string
  name: string
  email?: string
  phone?: string
  terreno?: string
  status: 'lead' | 'active' | 'completed'
  property_address?: string
  sale_status?: string
  sale_date?: string
  created_at: string
  updated_at: string
}

const statusConfig: Record<string, { label: string; color: string; cardColor: string; icon: any; description: string }> = {
  lead: { 
    label: 'Lead', 
    color: 'bg-blue-50 text-blue-700 border-blue-300',
    cardColor: 'from-blue-50 to-blue-100/50 border-blue-200',
    icon: UserPlus,
    description: 'Cliente potencial'
  },
  active: { 
    label: 'Activo', 
    color: 'bg-amber-50 text-amber-700 border-amber-300',
    cardColor: 'from-amber-50 to-amber-100/50 border-amber-200',
    icon: Clock,
    description: 'Venta en proceso'
  },
  completed: { 
    label: 'Completado', 
    color: 'bg-emerald-50 text-emerald-700 border-emerald-300',
    cardColor: 'from-emerald-50 to-emerald-100/50 border-emerald-200',
    icon: CheckCircle2,
    description: 'Compra finalizada'
  },
  rto_applicant: {
    label: 'Solicitante RTO',
    color: 'bg-purple-50 text-purple-700 border-purple-300',
    cardColor: 'from-purple-50 to-purple-100/50 border-purple-200',
    icon: FileSignature,
    description: 'Solicitud Rent-to-Own'
  },
  rto_active: {
    label: 'RTO Activo',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-300',
    cardColor: 'from-indigo-50 to-indigo-100/50 border-indigo-200',
    icon: Home,
    description: 'Contrato RTO activo'
  },
  inactive: {
    label: 'Inactivo',
    color: 'bg-gray-50 text-gray-700 border-gray-300',
    cardColor: 'from-gray-50 to-gray-100/50 border-gray-200',
    icon: XCircle,
    description: 'Cliente inactivo'
  },
}

export default function ClientsPage() {
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status')
  
  const [clients, setClients] = useState<ClientWithSale[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stats, setStats] = useState({ lead: 0, active: 0, completed: 0, total: 0 })

  useEffect(() => {
    fetchClients()
    fetchStats()
  }, [statusFilter])

  const fetchClients = async () => {
    setLoading(true)
    try {
      const url = new URL('/api/clients', window.location.origin)
      if (statusFilter) url.searchParams.set('status', statusFilter)
      
      const res = await fetch(url)
      if (res.ok) {
        const data = await res.json()
        setClients(data)
      }
    } catch (error) {
      console.error('Error fetching clients:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/clients/stats/summary')
      if (res.ok) {
        const data = await res.json()
        setStats(data)
      }
    } catch (error) {
      console.error('Error fetching stats:', error)
    }
  }

  const filteredClients = clients.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  )

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-5">
        <div>
          <h1 className="font-serif text-3xl text-navy-900 flex items-center gap-3">
            <div className="p-2 bg-gold-50 rounded-xl">
              <Users className="w-7 h-7 text-gold-600" />
            </div>
            Clientes
          </h1>
          <p className="text-navy-500 text-base mt-2">
            Seguimiento de compradores y potenciales clientes
          </p>
        </div>
        <Link href="/homes/sales/new" className="btn-gold text-lg">
          <Plus className="w-6 h-6" />
          Nueva Venta
        </Link>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
        <StatCard 
          label="Total Clientes" 
          value={stats.total} 
          href="/homes/clients"
          active={!statusFilter}
          icon={Users}
          color="navy"
        />
        {Object.entries(statusConfig).map(([key, config]) => (
          <StatCard
            key={key}
            label={config.label}
            description={config.description}
            value={stats[key as keyof typeof stats] || 0}
            href={`/homes/clients?status=${key}`}
            active={statusFilter === key}
            icon={config.icon}
            color={key}
          />
        ))}
      </div>

      {/* Search */}
      <div className="card-luxury p-5">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, email o teléfono..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-12"
          />
        </div>
      </div>

      {/* Clients List */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <Loader2 className="w-12 h-12 animate-spin text-gold-500 mx-auto mb-4" />
            <p className="text-navy-500 text-lg">Cargando clientes...</p>
          </div>
        </div>
      ) : filteredClients.length === 0 ? (
        <div className="card-luxury p-16 text-center">
          <div className="w-20 h-20 bg-navy-50 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Users className="w-10 h-10 text-navy-300" />
          </div>
          <h3 className="font-serif text-2xl text-navy-900 mb-3">No hay clientes</h3>
          <p className="text-navy-500 text-lg mb-8 max-w-md mx-auto">
            {statusFilter 
              ? `No hay clientes con estado "${statusConfig[statusFilter as keyof typeof statusConfig]?.label}"`
              : 'Los clientes aparecerán aquí cuando inicies ventas'
            }
          </p>
          <Link href="/homes/sales/new" className="btn-gold text-lg">
            <Plus className="w-5 h-5" />
            Iniciar Venta
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredClients.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatCard({ 
  label, 
  description,
  value, 
  href, 
  active,
  icon: Icon,
  color
}: { 
  label: string
  description?: string
  value: number
  href: string
  active?: boolean
  icon: React.ElementType
  color: string
}) {
  const colors: Record<string, { bg: string; border: string; icon: string; value: string }> = {
    navy: {
      bg: 'bg-gradient-to-br from-navy-50 to-navy-100/50',
      border: active ? 'border-gold-400 ring-2 ring-gold-200' : 'border-navy-200',
      icon: 'bg-navy-600 text-white',
      value: 'text-navy-900'
    },
    lead: {
      bg: 'bg-gradient-to-br from-blue-50 to-blue-100/50',
      border: active ? 'border-blue-400 ring-2 ring-blue-200' : 'border-blue-200',
      icon: 'bg-blue-500 text-white',
      value: 'text-blue-700'
    },
    active: {
      bg: 'bg-gradient-to-br from-amber-50 to-amber-100/50',
      border: active ? 'border-amber-400 ring-2 ring-amber-200' : 'border-amber-200',
      icon: 'bg-amber-500 text-white',
      value: 'text-amber-700'
    },
    completed: {
      bg: 'bg-gradient-to-br from-emerald-50 to-emerald-100/50',
      border: active ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-emerald-200',
      icon: 'bg-emerald-500 text-white',
      value: 'text-emerald-700'
    },
    rto_applicant: {
      bg: 'bg-gradient-to-br from-purple-50 to-purple-100/50',
      border: active ? 'border-purple-400 ring-2 ring-purple-200' : 'border-purple-200',
      icon: 'bg-purple-500 text-white',
      value: 'text-purple-700'
    },
    rto_active: {
      bg: 'bg-gradient-to-br from-indigo-50 to-indigo-100/50',
      border: active ? 'border-indigo-400 ring-2 ring-indigo-200' : 'border-indigo-200',
      icon: 'bg-indigo-500 text-white',
      value: 'text-indigo-700'
    },
    inactive: {
      bg: 'bg-gradient-to-br from-gray-50 to-gray-100/50',
      border: active ? 'border-gray-400 ring-2 ring-gray-200' : 'border-gray-200',
      icon: 'bg-gray-500 text-white',
      value: 'text-gray-700'
    },
  }

  const c = colors[color] || colors.navy

  return (
    <Link 
      href={href}
      className={`
        block p-5 rounded-2xl border-2 transition-all hover:shadow-card hover:-translate-y-1
        ${c.bg} ${c.border}
      `}
    >
      <div className={`w-12 h-12 rounded-xl ${c.icon} flex items-center justify-center mb-4`}>
        <Icon className="w-6 h-6" />
      </div>
      <p className={`text-3xl font-bold ${c.value}`}>{value}</p>
      <p className="text-base font-semibold text-navy-700 mt-2">{label}</p>
      {description && (
        <p className="text-sm text-navy-400 mt-1">{description}</p>
      )}
    </Link>
  )
}

function ClientCard({ client }: { client: ClientWithSale }) {
  const status = statusConfig[client.status] || statusConfig.lead
  const StatusIcon = status.icon

  return (
    <Link 
      href={`/homes/clients/${client.id}`}
      className="card-luxury p-5 flex items-center gap-5 group"
    >
      {/* Avatar */}
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center flex-shrink-0 shadow-card">
        <span className="text-white font-bold text-2xl">
          {client.name.charAt(0).toUpperCase()}
        </span>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 flex-wrap">
          <h3 className="font-semibold text-lg text-navy-900 group-hover:text-gold-600 transition-colors">
            {client.name}
          </h3>
          <div className={`badge text-sm ${status.color}`}>
            <StatusIcon className="w-4 h-4" />
            {status.label}
          </div>
        </div>
        
        <div className="flex items-center gap-5 mt-2 text-base text-navy-500">
          {client.phone && (
            <span className="flex items-center gap-2">
              <Phone className="w-4 h-4" />
              {client.phone}
            </span>
          )}
          {client.email && (
            <span className="flex items-center gap-2 truncate">
              <Mail className="w-4 h-4" />
              {client.email}
            </span>
          )}
        </div>
      </div>

      {/* Property info */}
      {client.property_address && (
        <div className="hidden lg:flex items-center gap-3 text-base text-navy-500 px-5 border-l-2 border-navy-100">
          <Building2 className="w-5 h-5" />
          <span className="truncate max-w-[200px]">{client.property_address}</span>
        </div>
      )}

      {/* Arrow */}
      <div className="flex items-center gap-2 text-gold-600 font-semibold group-hover:gap-3 transition-all">
        <span className="hidden sm:inline">Ver</span>
        <ArrowRight className="w-5 h-5" />
      </div>
    </Link>
  )
}
