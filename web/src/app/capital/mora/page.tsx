'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AlertTriangle, Clock, DollarSign, Users, TrendingUp, RefreshCw, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface MoraClient {
  client_id: string
  client_name: string
  client_email: string | null
  contract_id: string
  property_address: string | null
  monthly_payment: number
  overdue_count: number
  total_overdue_amount: number
  last_payment_date: string | null
  days_since_last_payment: number | null
  risk_level: string // 'low', 'medium', 'high', 'critical'
}

interface MoraSummary {
  total_clients_in_mora: number
  total_overdue_amount: number
  avg_overdue_payments: number
  clients: MoraClient[]
}

const RISK_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  low: { label: 'Bajo', color: 'var(--warning)', bg: 'var(--warning-light)', icon: '🟡' },
  medium: { label: 'Medio', color: 'var(--warning)', bg: '#FFF3E0', icon: '🟠' },
  high: { label: 'Alto', color: 'var(--error)', bg: '#FFE0E0', icon: '🔴' },
  critical: { label: 'Crítico', color: '#7B1818', bg: '#FECACA', icon: '⚫' },
}

export default function MoraPage() {
  const toast = useToast()
  const [summary, setSummary] = useState<MoraSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [updatingStatuses, setUpdatingStatuses] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => { loadMora() }, [])

  const loadMora = async () => {
    try {
      const res = await fetch('/api/capital/payments/mora-summary')
      const data = await res.json()
      if (data.ok) setSummary(data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStatuses = async () => {
    setUpdatingStatuses(true)
    try {
      const res = await fetch('/api/capital/payments/update-statuses', { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success(`${data.updated || 0} pagos actualizados a vencido`)
        loadMora()
      } else {
        toast.error('Error al actualizar estados')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setUpdatingStatuses(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
    </div>
  )

  const filteredClients = summary?.clients.filter(c =>
    c.client_name.toLowerCase().includes(search.toLowerCase()) ||
    (c.property_address && c.property_address.toLowerCase().includes(search.toLowerCase()))
  ) || []

  const riskCounts = {
    low: filteredClients.filter(c => c.risk_level === 'low').length,
    medium: filteredClients.filter(c => c.risk_level === 'medium').length,
    high: filteredClients.filter(c => c.risk_level === 'high').length,
    critical: filteredClients.filter(c => c.risk_level === 'critical').length,
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/capital/payments" className="p-2 rounded-md hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5" style={{ color: 'var(--slate)' }} />
        </Link>
        <div className="flex-1">
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Gestión de Mora</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Clientes con pagos vencidos y seguimiento de impagos</p>
        </div>
        <button onClick={handleUpdateStatuses} disabled={updatingStatuses}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium border transition-all"
          style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)', opacity: updatingStatuses ? 0.6 : 1 }}>
          <RefreshCw className={`w-4 h-4 ${updatingStatuses ? 'animate-spin' : ''}`} />
          Actualizar Estados
        </button>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card-luxury p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--error-light)' }}>
              <Users className="w-5 h-5" style={{ color: 'var(--error)' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Clientes en Mora</p>
              <p className="text-xl font-bold" style={{ color: 'var(--error)' }}>{summary?.total_clients_in_mora || 0}</p>
            </div>
          </div>
        </div>
        <div className="card-luxury p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--warning-light)' }}>
              <DollarSign className="w-5 h-5" style={{ color: 'var(--warning)' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Monto Vencido Total</p>
              <p className="text-xl font-bold" style={{ color: 'var(--warning)' }}>{fmt(summary?.total_overdue_amount || 0)}</p>
            </div>
          </div>
        </div>
        <div className="card-luxury p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--cream)' }}>
              <Clock className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
            </div>
            <div>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Prom. Pagos Vencidos</p>
              <p className="text-xl font-bold" style={{ color: 'var(--charcoal)' }}>{(summary?.avg_overdue_payments || 0).toFixed(1)}</p>
            </div>
          </div>
        </div>
        <div className="card-luxury p-4">
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(riskCounts).map(([risk, count]) => (
              <div key={risk} className="flex items-center gap-1">
                <span>{RISK_CONFIG[risk]?.icon}</span>
                <span style={{ color: 'var(--ash)' }}>{RISK_CONFIG[risk]?.label}:</span>
                <span className="font-bold" style={{ color: 'var(--charcoal)' }}>{count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
        <input type="text" placeholder="Buscar por nombre o dirección..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 rounded-md border text-sm"
          style={{ borderColor: 'var(--stone)' }}
        />
      </div>

      {/* Client List */}
      {filteredClients.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
          <p style={{ color: 'var(--slate)' }}>
            {search ? 'No se encontraron clientes' : 'No hay clientes en mora 🎉'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredClients
            .sort((a, b) => {
              const riskOrder = { critical: 0, high: 1, medium: 2, low: 3 }
              return (riskOrder[a.risk_level as keyof typeof riskOrder] ?? 4) - (riskOrder[b.risk_level as keyof typeof riskOrder] ?? 4)
            })
            .map(client => {
              const risk = RISK_CONFIG[client.risk_level] || RISK_CONFIG.low
              return (
                <div key={client.contract_id} className="card-luxury p-5 transition-all hover:shadow-md">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center text-lg"
                        style={{ backgroundColor: risk.bg }}>
                        {risk.icon}
                      </div>
                      <div>
                        <h3 className="font-semibold" style={{ color: 'var(--charcoal)' }}>{client.client_name}</h3>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          {client.property_address || 'Sin dirección'}
                        </p>
                      </div>
                    </div>
                    <span className="px-2 py-1 rounded text-xs font-medium"
                      style={{ backgroundColor: risk.bg, color: risk.color }}>
                      {risk.label}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4 pt-3" style={{ borderTop: '1px solid var(--sand)' }}>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Pagos Vencidos</p>
                      <p className="font-bold text-lg" style={{ color: 'var(--error)' }}>{client.overdue_count}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Monto Vencido</p>
                      <p className="font-bold" style={{ color: 'var(--charcoal)' }}>{fmt(client.total_overdue_amount)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Pago Mensual</p>
                      <p className="font-medium" style={{ color: 'var(--charcoal)' }}>{fmt(client.monthly_payment)}</p>
                    </div>
                    <div>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>Último Pago</p>
                      <p className="font-medium" style={{ color: 'var(--charcoal)' }}>
                        {client.last_payment_date
                          ? new Date(client.last_payment_date).toLocaleDateString('es-MX')
                          : 'Sin pagos'}
                      </p>
                      {client.days_since_last_payment && (
                        <p className="text-xs" style={{ color: 'var(--error)' }}>
                          Hace {client.days_since_last_payment} días
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex gap-2 mt-3 pt-3" style={{ borderTop: '1px solid var(--sand)' }}>
                    <Link href={`/capital/contracts/${client.contract_id}`}
                      className="btn-ghost btn-sm text-xs">
                      Ver Contrato
                    </Link>
                    <Link href={`/capital/payments?contract=${client.contract_id}`}
                      className="btn-ghost btn-sm text-xs">
                      Ver Pagos
                    </Link>
                  </div>
                </div>
              )
            })}
        </div>
      )}
    </div>
  )
}

