'use client'

import React, { useState, useEffect } from 'react'
import { X, Users, Mail, Phone, CheckCircle, Clock, AlertCircle, RefreshCw, DollarSign, ChevronRight, UserPlus, Shield, TrendingUp } from 'lucide-react'

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

  const getKycConfig = (status?: string) => {
    switch (status) {
      case 'verified': return { icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/20', label: 'Verificado' }
      case 'pending': return { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-500/20', label: 'Pendiente' }
      case 'rejected': return { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/20', label: 'Rechazado' }
      case 'processing': return { icon: RefreshCw, color: 'text-blue-400', bg: 'bg-blue-500/20', label: 'Procesando' }
      default: return { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-500/20', label: status || 'Sin KYC' }
    }
  }

  const getStageConfig = (stage?: string) => {
    switch (stage) {
      case 'datos_basicos': return { bg: 'bg-slate-500/20', text: 'text-slate-400', label: 'Datos Básicos' }
      case 'kyc_pending': return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'KYC Pendiente' }
      case 'kyc_verified': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'KYC Verificado' }
      case 'dti_calculated': return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'DTI Calculado' }
      case 'prequalified': return { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Precalificado' }
      case 'contract_pending': return { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'Contrato Pendiente' }
      case 'active': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Activo' }
      default: return { bg: 'bg-slate-500/20', text: 'text-slate-400', label: stage || 'Sin etapa' }
    }
  }

  const getDtiColor = (dti?: number) => {
    if (!dti) return 'text-slate-400'
    if (dti <= 30) return 'text-emerald-400'
    if (dti <= 36) return 'text-blue-400'
    if (dti <= 43) return 'text-amber-400'
    return 'text-red-400'
  }

  const getRiskLabel = (risk?: string) => {
    switch (risk?.toLowerCase()) {
      case 'bajo': return { color: 'text-emerald-400', bg: 'bg-emerald-500/10' }
      case 'medio': return { color: 'text-amber-400', bg: 'bg-amber-500/10' }
      case 'alto': return { color: 'text-red-400', bg: 'bg-red-500/10' }
      default: return { color: 'text-slate-400', bg: 'bg-slate-500/10' }
    }
  }

  if (!isOpen) return null

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-fade-in"
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full sm:w-[420px] bg-[color:var(--bg-surface-glass)] backdrop-blur-xl border-l border-white/10 shadow-2xl z-50 flex flex-col animate-slide-in">
        {/* Header */}
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="absolute -inset-1 bg-gradient-to-br from-blue-400/30 to-indigo-500/30 rounded-xl blur" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Users size={22} className="text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>
                  Clientes
                </h2>
                <p className="text-slate-400 text-sm">{clients.length} registrados</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchClients}
                disabled={loading}
                className="btn-icon"
              >
                <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
              </button>
              <button onClick={onClose} className="btn-icon">
                <X size={18} />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
          {loading && clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-2 border-blue-400/30 border-t-blue-400 rounded-full animate-spin mb-4" />
              <p className="text-slate-400">Cargando clientes...</p>
            </div>
          ) : error ? (
            <div className="card p-4 bg-red-500/10 border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : clients.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <UserPlus size={36} className="text-slate-600" />
              </div>
              <h3 className="text-white font-medium mb-1">Sin clientes</h3>
              <p className="text-slate-500 text-sm max-w-[250px]">
                Usa el chat para registrar nuevos clientes en el sistema
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {clients.map((client, index) => {
                const stage = getStageConfig(client.process_stage)
                const kyc = getKycConfig(client.kyc_status)
                const KycIcon = kyc.icon
                const riskStyle = getRiskLabel(client.risk_profile)
                
                return (
                  <div
                    key={client.id}
                    onClick={() => onSelectClient?.(client)}
                    className={`
                      card-elevated p-4 cursor-pointer group
                      animate-fade-in stagger-${Math.min(index + 1, 6)}
                    `}
                  >
                    {/* Header with badges */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`badge ${stage.bg} ${stage.text}`}>
                        {stage.label}
                      </span>
                      <div className={`badge ${kyc.bg} ${kyc.color}`}>
                        <KycIcon size={12} />
                        {kyc.label}
                      </div>
                    </div>

                    {/* Name */}
                    <h3 className="text-white font-semibold text-lg mb-1 group-hover:text-amber-400 transition-colors">
                      {client.full_name}
                    </h3>
                    
                    {/* Contact Info */}
                    <div className="space-y-1.5 mb-4">
                      {client.email && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Mail size={14} className="text-slate-500" />
                          <span className="truncate">{client.email}</span>
                        </div>
                      )}
                      {client.phone && (
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Phone size={14} className="text-slate-500" />
                          <span>{client.phone}</span>
                        </div>
                      )}
                    </div>

                    {/* Financial Info Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {client.monthly_income && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10">
                          <DollarSign size={16} className="text-emerald-400" />
                          <div>
                            <p className="text-emerald-400 font-semibold text-sm">
                              ${client.monthly_income.toLocaleString()}
                            </p>
                            <p className="text-slate-500 text-[10px]">Ingreso/mes</p>
                          </div>
                        </div>
                      )}
                      {client.dti_score !== undefined && client.dti_score !== null && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10">
                          <TrendingUp size={16} className={getDtiColor(client.dti_score)} />
                          <div>
                            <p className={`font-semibold text-sm ${getDtiColor(client.dti_score)}`}>
                              {client.dti_score.toFixed(1)}%
                            </p>
                            <p className="text-slate-500 text-[10px]">DTI</p>
                          </div>
                        </div>
                      )}
                      {client.risk_profile && (
                        <div className={`flex items-center gap-2 p-2 rounded-lg ${riskStyle.bg}`}>
                          <Shield size={16} className={riskStyle.color} />
                          <div>
                            <p className={`font-semibold text-sm capitalize ${riskStyle.color}`}>
                              {client.risk_profile}
                            </p>
                            <p className="text-slate-500 text-[10px]">Riesgo</p>
                          </div>
                        </div>
                      )}
                      {client.referral_code && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-purple-500/10">
                          <span className="text-purple-400 text-lg">🎁</span>
                          <div>
                            <p className="text-purple-400 font-mono text-xs">
                              {client.referral_code}
                            </p>
                            <p className="text-slate-500 text-[10px]">Código</p>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Action hint */}
                    <div className="mt-4 flex items-center justify-end text-slate-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      <span>Ver detalles</span>
                      <ChevronRight size={14} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
