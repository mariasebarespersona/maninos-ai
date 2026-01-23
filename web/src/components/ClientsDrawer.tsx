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
  shield: <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>,
  trash: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>,
}

export default function ClientsDrawer({ isOpen, onClose, onSelectClient }: ClientsDrawerProps) {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

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

  const deleteClient = async (e: React.MouseEvent, clientId: string, clientName: string) => {
    e.stopPropagation() // Prevent card click
    
    if (!confirm(`¿Estás seguro de eliminar a "${clientName}"?\n\nEsta acción eliminará también sus contratos y documentos asociados.`)) {
      return
    }
    
    setDeletingId(clientId)
    try {
      const res = await fetch(`${BACKEND_URL}/api/clients/${clientId}`, {
        method: 'DELETE'
      })
      const data = await res.json()
      
      if (data.ok) {
        // Remove from local state
        setClients(prev => prev.filter(c => c.id !== clientId))
      } else {
        alert(`Error: ${data.error || 'No se pudo eliminar el cliente'}`)
      }
    } catch (e) {
      alert('Error de conexión al servidor')
    } finally {
      setDeletingId(null)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchClients()
    }
  }, [isOpen])

  const getKycBadge = (status?: string) => {
    switch (status) {
      case 'verified': return <span className="badge badge-success">{Icons.check} Verificado</span>
      case 'pending': return <span className="badge badge-gold">{Icons.clock} Pendiente</span>
      case 'rejected': return <span className="badge bg-red-50 text-red-600 border-red-100">Rechazado</span>
      default: return <span className="badge bg-slate-100 text-slate-500">Sin KYC</span>
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-navy-900/20 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[450px] bg-white border-l border-navy-50 shadow-2xl z-50 flex flex-col animate-slide-up">
        {/* Header */}
        <div className="p-6 border-b border-navy-50 bg-slate-50">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-white border border-navy-50 text-navy-600 shadow-sm">
                {Icons.users}
              </div>
              <div>
                <h2 className="font-serif font-bold text-lg text-navy-900">Clientes</h2>
                <p className="text-navy-500 text-xs">{clients.length} registrados</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchClients} className="btn-ghost p-2">
                <span className={loading ? 'animate-spin block' : ''}>{Icons.refresh}</span>
              </button>
              <button onClick={onClose} className="btn-ghost p-2">
                {Icons.x}
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-6 bg-white">
          {loading && clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-navy-400">
              <div className="w-8 h-8 border-2 border-navy-100 border-t-navy-500 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando clientes...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-50 text-red-600 text-sm border border-red-100">
              {error}
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 text-navy-300">
                {Icons.userPlus}
              </div>
              <h3 className="font-bold text-navy-900 mb-1">Sin clientes</h3>
              <p className="text-navy-500 text-sm max-w-[200px]">
                Usa el chat para registrar nuevos prospectos
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {clients.map((client, index) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient?.(client)}
                  className="card-luxury p-5 cursor-pointer group relative"
                >
                  {/* Delete button */}
                  <button
                    onClick={(e) => deleteClient(e, client.id, client.full_name)}
                    disabled={deletingId === client.id}
                    className="absolute top-3 right-3 p-2 rounded-lg opacity-0 group-hover:opacity-100 transition-all duration-200 hover:bg-red-50 text-navy-400 hover:text-red-500 disabled:opacity-50"
                    title="Eliminar cliente"
                  >
                    {deletingId === client.id ? (
                      <div className="w-4 h-4 border-2 border-red-300 border-t-red-500 rounded-full animate-spin" />
                    ) : (
                      Icons.trash
                    )}
                  </button>
                  
                  <div className="flex justify-between items-start mb-3 pr-8">
                    <span className="text-[10px] font-bold tracking-wider text-navy-400 uppercase bg-navy-50 px-2 py-1 rounded">
                      {client.process_stage?.replace('_', ' ') || 'Nuevo'}
                    </span>
                    {getKycBadge(client.kyc_status)}
                  </div>

                  <h3 className="font-serif font-bold text-lg text-navy-900 mb-2 group-hover:text-gold-600 transition-colors truncate">
                    {client.full_name}
                  </h3>
                  
                  <div className="space-y-2 mb-4">
                    {client.email && (
                      <div className="flex items-center gap-2 text-navy-500 text-sm">
                        <span>{Icons.mail}</span>
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-navy-500 text-sm">
                        <span>{Icons.phone}</span>
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4 pt-4 border-t border-navy-50">
                    <div>
                      <div className="text-[10px] font-bold text-navy-400 uppercase tracking-wider mb-1">Ingreso Mensual</div>
                      <div className="text-navy-900 font-medium font-mono">
                        ${(client.monthly_income || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-navy-400 uppercase tracking-wider mb-1">Riesgo</div>
                      <div className="flex items-center gap-1 text-sm font-medium text-navy-700 capitalize">
                        {Icons.shield}
                        <span>{client.risk_profile || 'N/A'}</span>
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
