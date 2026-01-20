'use client'

import React, { useState, useEffect } from 'react'

interface Client {
  id: string
  full_name: string
  email?: string
  phone?: string
  kyc_status?: string
  process_stage?: string
  monthly_income?: number
  dti_score?: number
  risk_profile?: string
  referral_code?: string
  created_at?: string
}

interface ClientsDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSelectClient?: (client: Client) => void
}

// Icons
const Icons = {
  x: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  users: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" /></svg>,
  refresh: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  userPlus: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" /></svg>,
  mail: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>,
  phone: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>,
  check: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>,
  clock: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  alert: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>,
  shield: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
}

export default function ClientsDrawer({ isOpen, onClose, onSelectClient }: ClientsDrawerProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'

  const fetchClients = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/clients`)
      const data = await res.json()
      if (data.ok) {
        setClients(data.clients || [])
      } else {
        setError(data.error || 'Error loading clients')
      }
    } catch (e) {
      setError('Error connecting to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchClients()
    }
  }, [isOpen])

  const getKycBadge = (status?: string) => {
    switch (status) {
      case 'verified': return <span className="badge badge-success">{Icons.check} KYC OK</span>
      case 'pending': return <span className="badge badge-gold">{Icons.clock} KYC Pendiente</span>
      case 'rejected': return <span className="badge bg-red-500/10 text-red-400">{Icons.alert} KYC Rechazado</span>
      case 'processing': return <span className="badge badge-blue">{Icons.refresh} KYC Procesando</span>
      default: return <span className="badge bg-white/10 text-zinc-500">Sin KYC</span>
    }
  }

  const getRiskLabel = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'bajo': return 'text-emerald-400'
      case 'medio': return 'text-amber-400'
      case 'alto': return 'text-red-400'
      default: return 'text-zinc-500'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[450px] bg-[#0a0a0b]/95 border-l border-white/5 shadow-2xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-6 border-b border-white/5 bg-white/[0.02]">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
                {Icons.users}
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Clientes</h2>
                <p className="text-zinc-500 text-xs">{clients.length} registrados</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchClients} className="btn-ghost p-2 text-zinc-400 hover:text-white">
                <span className={loading ? 'animate-spin block' : ''}>{Icons.refresh}</span>
              </button>
              <button onClick={onClose} className="btn-ghost p-2 text-zinc-400 hover:text-white">
                {Icons.x}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {loading && clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <div className="w-8 h-8 border-2 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando clientes...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 text-zinc-600">
                {Icons.userPlus}
              </div>
              <h3 className="text-white font-medium mb-1">Sin clientes</h3>
              <p className="text-zinc-500 text-sm max-w-[200px]">
                Usa el chat para registrar nuevos prospectos
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client, index) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient?.(client)}
                  className={`card card-hover p-4 cursor-pointer group animate-fade-in delay-${Math.min(index + 1, 6)}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    <span className="badge bg-white/5 text-zinc-400 uppercase tracking-wider text-[10px]">
                      {client.process_stage?.replace('_', ' ') || 'Nuevo'}
                    </span>
                    {getKycBadge(client.kyc_status)}
                  </div>

                  <h3 className="text-white font-semibold text-lg mb-2 group-hover:text-amber-400 transition-colors truncate">
                    {client.full_name}
                  </h3>
                  
                  <div className="space-y-1.5 mb-4">
                    {client.email && (
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <span>{Icons.mail}</span>
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        <span>{Icons.phone}</span>
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Ingreso Mensual</div>
                      <div className="text-white font-medium font-mono">
                        ${(client.monthly_income || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Perfil de Riesgo</div>
                      <div className={`text-sm font-medium flex items-center gap-1 ${getRiskLabel(client.risk_profile)}`}>
                        {Icons.shield}
                        <span className="capitalize">{client.risk_profile || 'N/A'}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
