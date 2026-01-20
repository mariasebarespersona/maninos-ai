'use client'

import React, { useState, useEffect } from 'react'
import { X, Users, Mail, Phone, CheckCircle, Clock, AlertCircle, RefreshCw, DollarSign } from 'lucide-react'

interface Client {
  id: string
  full_name: string
  email?: string
  phone?: string
  kyc_status?: string
  process_stage?: string
  monthly_income?: number
  dti_score?: number
  referral_code?: string
  created_at?: string
}

interface ClientsDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSelectClient?: (client: Client) => void
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

  const getKycStatusIcon = (status?: string) => {
    switch (status) {
      case 'verified': return <CheckCircle size={14} className="text-emerald-400" />
      case 'pending': return <Clock size={14} className="text-amber-400" />
      case 'rejected': return <AlertCircle size={14} className="text-red-400" />
      default: return <Clock size={14} className="text-slate-400" />
    }
  }

  const getKycStatusLabel = (status?: string) => {
    switch (status) {
      case 'verified': return 'Verificado'
      case 'pending': return 'Pendiente'
      case 'rejected': return 'Rechazado'
      case 'processing': return 'Procesando'
      default: return status || 'Sin KYC'
    }
  }

  const getStageColor = (stage?: string) => {
    switch (stage) {
      case 'datos_basicos': return 'bg-slate-500/20 text-slate-400'
      case 'kyc_pending': return 'bg-amber-500/20 text-amber-400'
      case 'kyc_verified': return 'bg-emerald-500/20 text-emerald-400'
      case 'dti_calculated': return 'bg-blue-500/20 text-blue-400'
      case 'contract_pending': return 'bg-purple-500/20 text-purple-400'
      case 'active': return 'bg-emerald-500/20 text-emerald-400'
      default: return 'bg-slate-500/20 text-slate-400'
    }
  }

  const getStageLabel = (stage?: string) => {
    switch (stage) {
      case 'datos_basicos': return 'Datos Básicos'
      case 'kyc_pending': return 'KYC Pendiente'
      case 'kyc_verified': return 'KYC Verificado'
      case 'dti_calculated': return 'DTI Calculado'
      case 'prequalified': return 'Precalificado'
      case 'contract_pending': return 'Contrato Pendiente'
      case 'active': return 'Activo'
      default: return stage || 'Sin etapa'
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-96 bg-slate-900 border-l border-white/10 shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/20 rounded-lg flex items-center justify-center">
              <Users size={20} className="text-blue-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Clientes</h2>
              <p className="text-slate-500 text-xs">{clients.length} registrados</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchClients}
              disabled={loading}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading && clients.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-slate-500">Cargando clientes...</div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
              {error}
            </div>
          ) : clients.length === 0 ? (
            <div className="text-center py-12">
              <Users size={48} className="text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No hay clientes registrados</p>
              <p className="text-slate-600 text-sm mt-1">Usa el chat para registrar un nuevo cliente</p>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client) => (
                <div
                  key={client.id}
                  onClick={() => onSelectClient?.(client)}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 cursor-pointer transition-colors"
                >
                  {/* Stage Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStageColor(client.process_stage)}`}>
                      {getStageLabel(client.process_stage)}
                    </span>
                    <div className="flex items-center gap-1 text-xs">
                      {getKycStatusIcon(client.kyc_status)}
                      <span className="text-slate-400">{getKycStatusLabel(client.kyc_status)}</span>
                    </div>
                  </div>

                  {/* Name */}
                  <h3 className="text-white font-medium mb-2 truncate">
                    {client.full_name}
                  </h3>
                  
                  {/* Contact Info */}
                  <div className="space-y-1 mb-3">
                    {client.email && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Mail size={14} />
                        <span className="truncate">{client.email}</span>
                      </div>
                    )}
                    {client.phone && (
                      <div className="flex items-center gap-2 text-slate-400 text-sm">
                        <Phone size={14} />
                        <span>{client.phone}</span>
                      </div>
                    )}
                  </div>

                  {/* Financial Info */}
                  <div className="flex items-center gap-4 text-sm">
                    {client.monthly_income && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <DollarSign size={14} className="text-emerald-400" />
                        <span>${client.monthly_income.toLocaleString()}/mes</span>
                      </div>
                    )}
                    {client.dti_score && (
                      <div className="text-slate-300">
                        DTI: <span className={client.dti_score < 36 ? 'text-emerald-400' : client.dti_score < 43 ? 'text-amber-400' : 'text-red-400'}>
                          {client.dti_score.toFixed(1)}%
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Referral Code */}
                  {client.referral_code && (
                    <div className="mt-2 text-xs text-slate-500">
                      Código: {client.referral_code}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

