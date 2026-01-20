'use client'

import React, { useState, useEffect } from 'react'
import { X, Building2, MapPin, DollarSign, Bed, Bath, Calendar, ExternalLink, RefreshCw, ChevronRight, Home } from 'lucide-react'

interface Property {
  id: string
  address: string
  park_name?: string
  city?: string
  state?: string
  zip_code?: string
  purchase_price?: number
  estimated_value?: number
  market_value?: number
  bedrooms?: number
  bathrooms?: number
  year_built?: number
  square_feet?: number
  inventory_status?: string
  listing_active?: boolean
  created_at?: string
}

interface PropertiesDrawerProps {
  isOpen: boolean
  onClose: () => void
  onSelectProperty?: (property: Property) => void
}

export default function PropertiesDrawer({ isOpen, onClose, onSelectProperty }: PropertiesDrawerProps) {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8080'

  const fetchProperties = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${BACKEND_URL}/api/properties`)
      const data = await res.json()
      if (data.ok) {
        setProperties(data.properties || [])
      } else {
        setError(data.error || 'Error loading properties')
      }
    } catch (e) {
      setError('Error connecting to server')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (isOpen) {
      fetchProperties()
    }
  }, [isOpen])

  const getStatusConfig = (status?: string) => {
    switch (status) {
      case 'available': return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', label: 'Disponible' }
      case 'under_contract': return { bg: 'bg-amber-500/20', text: 'text-amber-400', label: 'En Contrato' }
      case 'sold': return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Vendido' }
      case 'pending_acquisition': return { bg: 'bg-purple-500/20', text: 'text-purple-400', label: 'Pendiente' }
      default: return { bg: 'bg-slate-500/20', text: 'text-slate-400', label: status || 'Sin estado' }
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
                <div className="absolute -inset-1 bg-gradient-to-br from-amber-400/30 to-orange-500/30 rounded-xl blur" />
                <div className="relative w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg">
                  <Building2 size={22} className="text-white" />
                </div>
              </div>
              <div>
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'var(--font-display)' }}>
                  Propiedades
                </h2>
                <p className="text-slate-400 text-sm">{properties.length} en inventario</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={fetchProperties}
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
          {loading && properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-2 border-amber-400/30 border-t-amber-400 rounded-full animate-spin mb-4" />
              <p className="text-slate-400">Cargando propiedades...</p>
            </div>
          ) : error ? (
            <div className="card p-4 bg-red-500/10 border-red-500/20">
              <p className="text-red-400 text-sm">{error}</p>
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                <Home size={36} className="text-slate-600" />
              </div>
              <h3 className="text-white font-medium mb-1">Sin propiedades</h3>
              <p className="text-slate-500 text-sm max-w-[250px]">
                Usa el chat para buscar y agregar nuevas propiedades al inventario
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map((property, index) => {
                const status = getStatusConfig(property.inventory_status)
                return (
                  <div
                    key={property.id}
                    onClick={() => onSelectProperty?.(property)}
                    className={`
                      card-elevated p-4 cursor-pointer group
                      animate-fade-in stagger-${Math.min(index + 1, 6)}
                    `}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <span className={`badge ${status.bg} ${status.text}`}>
                        {status.label}
                      </span>
                      {property.listing_active && (
                        <span className="badge badge-success">
                          <ExternalLink size={12} />
                          Activo
                        </span>
                      )}
                    </div>

                    {/* Address */}
                    <h3 className="text-white font-semibold mb-1 group-hover:text-amber-400 transition-colors">
                      {property.address || 'Sin dirección'}
                    </h3>
                    
                    {/* Location */}
                    <div className="flex items-center gap-1.5 text-slate-400 text-sm mb-4">
                      <MapPin size={14} className="text-slate-500" />
                      <span>{property.park_name || `${property.city || ''}, ${property.state || 'TX'}`}</span>
                    </div>

                    {/* Details Grid */}
                    <div className="grid grid-cols-2 gap-3">
                      {(property.purchase_price || property.market_value) && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/10">
                          <DollarSign size={16} className="text-emerald-400" />
                          <div>
                            <p className="text-emerald-400 font-semibold text-sm">
                              ${(property.market_value || property.purchase_price || 0).toLocaleString()}
                            </p>
                            <p className="text-slate-500 text-[10px]">Valor</p>
                          </div>
                        </div>
                      )}
                      {property.bedrooms && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-blue-500/10">
                          <Bed size={16} className="text-blue-400" />
                          <div>
                            <p className="text-blue-400 font-semibold text-sm">{property.bedrooms}</p>
                            <p className="text-slate-500 text-[10px]">Recámaras</p>
                          </div>
                        </div>
                      )}
                      {property.bathrooms && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-cyan-500/10">
                          <Bath size={16} className="text-cyan-400" />
                          <div>
                            <p className="text-cyan-400 font-semibold text-sm">{property.bathrooms}</p>
                            <p className="text-slate-500 text-[10px]">Baños</p>
                          </div>
                        </div>
                      )}
                      {property.year_built && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10">
                          <Calendar size={16} className="text-amber-400" />
                          <div>
                            <p className="text-amber-400 font-semibold text-sm">{property.year_built}</p>
                            <p className="text-slate-500 text-[10px]">Año</p>
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
