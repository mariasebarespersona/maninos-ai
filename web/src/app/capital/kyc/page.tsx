'use client'

import { useEffect, useState } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  User,
  Search,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Client {
  id: string
  name: string
  email: string
  phone?: string
  kyc_verified: boolean
  kyc_status: string
  kyc_verified_at: string | null
  kyc_type: string | null
  kyc_session_id: string | null
  failure_reason: string | null
}

export default function KYCPage() {
  const toast = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      // Get all clients
      const res = await fetch('/api/clients')
      const data = await res.json()
      const clientList = Array.isArray(data) ? data : data.clients || []
      
      // Get KYC status for each
      const enriched: Client[] = await Promise.all(
        clientList.map(async (c: any) => {
          try {
            const kycRes = await fetch(`/api/capital/kyc/status/${c.id}`)
            const kycData = await kycRes.json()
            return {
              id: c.id,
              name: c.name || 'Sin nombre',
              email: c.email || '',
              phone: c.phone || '',
              kyc_verified: kycData.kyc_verified || false,
              kyc_status: kycData.kyc_status || 'unverified',
              kyc_verified_at: kycData.kyc_verified_at,
              kyc_type: kycData.kyc_type,
              kyc_session_id: kycData.kyc_session_id,
              failure_reason: kycData.failure_reason,
            }
          } catch {
            return {
              id: c.id,
              name: c.name || 'Sin nombre',
              email: c.email || '',
              phone: c.phone || '',
              kyc_verified: false,
              kyc_status: 'unverified',
              kyc_verified_at: null,
              kyc_type: null,
              kyc_session_id: null,
              failure_reason: null,
            }
          }
        })
      )
      
      setClients(enriched)
    } catch (err) {
      toast.error('Error al cargar clientes')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestVerification = async (client: Client) => {
    setActionLoading(client.id)
    try {
      const res = await fetch('/api/capital/kyc/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      })
      const data = await res.json()
      
      if (data.ok) {
        if (data.already_verified) {
          setClients(prev => prev.map(c => 
            c.id === client.id ? { ...c, kyc_verified: true, kyc_status: 'verified' } : c
          ))
          toast.info('Este cliente ya está verificado')
        } else {
          setClients(prev => prev.map(c => 
            c.id === client.id ? { ...c, kyc_status: 'pending' } : c
          ))
          toast.success(data.message || `Solicitud enviada a ${client.name}`)
        }
      } else {
        toast.error(data.detail || 'Error al solicitar verificación')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleManualVerify = async (client: Client) => {
    setActionLoading(client.id)
    try {
      const res = await fetch('/api/capital/kyc/manual-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          verified_by: 'admin',
          id_type: 'manual',
          notes: 'Verificado manualmente desde panel KYC',
        }),
      })
      const data = await res.json()
      
      if (data.ok) {
        setClients(prev => prev.map(c => 
          c.id === client.id 
            ? { ...c, kyc_verified: true, kyc_status: 'verified', kyc_type: 'manual', failure_reason: null } 
            : c
        ))
        toast.success(`✅ ${client.name} verificado manualmente`)
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleCheckStatus = async (client: Client) => {
    setActionLoading(client.id)
    try {
      const res = await fetch(`/api/capital/kyc/check-session/${client.id}`, { method: 'POST' })
      const data = await res.json()
      
      if (data.ok) {
        if (data.verified) {
          setClients(prev => prev.map(c => 
            c.id === client.id 
              ? { ...c, kyc_verified: true, kyc_status: 'verified', failure_reason: null } 
              : c
          ))
          toast.success(`✅ ${client.name} - Verificación completada`)
        } else if (data.status === 'failed' || data.status === 'requires_input') {
          setClients(prev => prev.map(c => 
            c.id === client.id 
              ? { ...c, kyc_verified: false, kyc_status: data.status, failure_reason: data.message } 
              : c
          ))
          toast.error(`❌ ${client.name} - ${data.message}`)
        } else if (data.status === 'pending') {
          toast.info(`⏳ ${client.name} - Verificación aún en proceso`)
        } else {
          toast.info(`${client.name} - Estado: ${data.status}`)
        }
      }
    } catch (err) {
      toast.error('Error al consultar estado')
    } finally {
      setActionLoading(null)
    }
  }

  const filteredClients = clients.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)
  })

  const stats = {
    total: clients.length,
    verified: clients.filter(c => c.kyc_verified).length,
    pending: clients.filter(c => c.kyc_status === 'pending').length,
    failed: clients.filter(c => ['failed', 'requires_input'].includes(c.kyc_status)).length,
    unverified: clients.filter(c => c.kyc_status === 'unverified').length,
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
          Verificación de Identidad (KYC)
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          Gestiona la verificación de identidad de los clientes antes de aprobar contratos RTO
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{stats.total}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Verificados</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--success)' }}>{stats.verified}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>En Proceso</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--warning)' }}>{stats.pending}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Fallidos</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--error)' }}>{stats.failed}</p>
        </div>
      </div>

      {/* Flow explanation */}
      <div className="card-luxury p-5" style={{ borderLeft: '4px solid var(--gold-600)' }}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold-600)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Flujo de verificación KYC</p>
            <ol className="text-xs mt-1.5 ml-4 space-y-1 list-decimal" style={{ color: 'var(--slate)' }}>
              <li>Haz clic en &quot;Solicitar Verificación&quot; para pedirle al cliente</li>
              <li>El cliente verá un aviso en su portal para verificar su identidad</li>
              <li>El cliente completa la verificación de Stripe Identity desde su dispositivo</li>
              <li>El resultado aparece aquí automáticamente (o usa &quot;Consultar Estado&quot;)</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card-luxury p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o email..."
            className="input pl-10"
          />
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {filteredClients.length === 0 ? (
          <div className="card-luxury p-12 text-center">
            <User className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
            <p style={{ color: 'var(--slate)' }}>No se encontraron clientes</p>
          </div>
        ) : (
          filteredClients.map((client) => (
            <div key={client.id} className="card-luxury p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                {/* Client Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                       style={{ backgroundColor: client.kyc_verified ? 'var(--success-light)' : 'var(--cream)' }}>
                    {client.kyc_verified ? (
                      <ShieldCheck className="w-6 h-6" style={{ color: 'var(--success)' }} />
                    ) : client.kyc_status === 'pending' ? (
                      <Clock className="w-6 h-6" style={{ color: 'var(--warning)' }} />
                    ) : ['failed', 'requires_input'].includes(client.kyc_status) ? (
                      <XCircle className="w-6 h-6" style={{ color: 'var(--error)' }} />
                    ) : (
                      <ShieldAlert className="w-6 h-6" style={{ color: 'var(--ash)' }} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--ink)' }}>{client.name}</p>
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>{client.email}</p>
                    {client.phone && (
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{client.phone}</p>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="text-right flex-shrink-0">
                  <KYCStatusBadge status={client.kyc_status} verified={client.kyc_verified} />
                  {client.kyc_verified && client.kyc_verified_at && (
                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                      {new Date(client.kyc_verified_at).toLocaleDateString('es-MX')}
                      {client.kyc_type && ` · ${client.kyc_type}`}
                    </p>
                  )}
                  {client.failure_reason && (
                    <p className="text-xs mt-1 max-w-[200px]" style={{ color: 'var(--error)' }}>
                      {client.failure_reason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {/* Check Status - when there's a session */}
                  {client.kyc_session_id && !client.kyc_verified && (
                    <button
                      onClick={() => handleCheckStatus(client)}
                      disabled={actionLoading === client.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--info)' }}
                    >
                      {actionLoading === client.id 
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <RefreshCw className="w-3.5 h-3.5" />
                      }
                      Consultar Estado
                    </button>
                  )}

                  {/* Request Verification from Client */}
                  {!client.kyc_verified && (
                    <button
                      onClick={() => handleRequestVerification(client)}
                      disabled={actionLoading === client.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      {actionLoading === client.id 
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ShieldCheck className="w-3.5 h-3.5" />
                      }
                      {client.kyc_status === 'pending' ? 'Re-enviar Solicitud' : 'Solicitar Verificación'}
                    </button>
                  )}

                  {/* Manual Verify */}
                  {!client.kyc_verified && (
                    <button
                      onClick={() => handleManualVerify(client)}
                      disabled={actionLoading === client.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
                    >
                      {actionLoading === client.id 
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />
                      }
                      Verificar Manual
                    </button>
                  )}

                  {/* Already verified */}
                  {client.kyc_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium"
                          style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verificado
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

function KYCStatusBadge({ status, verified }: { status: string; verified: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
        <CheckCircle2 className="w-3 h-3" />
        Verificado
      </span>
    )
  }

  const configs: Record<string, { bg: string; color: string; icon: typeof Clock; label: string }> = {
    pending: { bg: 'var(--warning-light)', color: 'var(--warning)', icon: Clock, label: 'En Proceso' },
    failed: { bg: 'var(--error-light)', color: 'var(--error)', icon: XCircle, label: 'Fallido' },
    requires_input: { bg: 'var(--error-light)', color: 'var(--error)', icon: XCircle, label: 'Fallido' },
    unverified: { bg: 'var(--cream)', color: 'var(--ash)', icon: ShieldAlert, label: 'Sin Verificar' },
  }

  const config = configs[status] || configs.unverified
  const Icon = config.icon

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: config.bg, color: config.color }}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}

