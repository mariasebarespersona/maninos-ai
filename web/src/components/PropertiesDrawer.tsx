'use client'

import React, { useState, useEffect } from 'react'
import { X, Building2, MapPin, DollarSign, Bed, Bath, Calendar, ExternalLink, RefreshCw } from 'lucide-react'

interface Property {
  id: string
  address: string
  park_name?: string
  city?: string
  state?: string
  zip_code?: string
  purchase_price?: number
  estimated_value?: number
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

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'available': return 'bg-emerald-500/20 text-emerald-400'
      case 'reserved': return 'bg-amber-500/20 text-amber-400'
      case 'sold': return 'bg-blue-500/20 text-blue-400'
      case 'pending': return 'bg-purple-500/20 text-purple-400'
      default: return 'bg-slate-500/20 text-slate-400'
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
            <div className="w-10 h-10 bg-amber-500/20 rounded-lg flex items-center justify-center">
              <Building2 size={20} className="text-amber-400" />
            </div>
            <div>
              <h2 className="text-white font-semibold">Propiedades</h2>
              <p className="text-slate-500 text-xs">{properties.length} en inventario</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchProperties}
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
          {loading && properties.length === 0 ? (
            <div className="flex items-center justify-center h-40">
              <div className="text-slate-500">Cargando propiedades...</div>
            </div>
          ) : error ? (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400 text-sm">
              {error}
            </div>
          ) : properties.length === 0 ? (
            <div className="text-center py-12">
              <Building2 size={48} className="text-slate-600 mx-auto mb-4" />
              <p className="text-slate-400">No hay propiedades en inventario</p>
              <p className="text-slate-600 text-sm mt-1">Usa el chat para buscar y agregar propiedades</p>
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map((property) => (
                <div
                  key={property.id}
                  onClick={() => onSelectProperty?.(property)}
                  className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/10 cursor-pointer transition-colors"
                >
                  {/* Status Badge */}
                  <div className="flex items-center justify-between mb-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(property.inventory_status)}`}>
                      {property.inventory_status || 'Sin estado'}
                    </span>
                    {property.listing_active && (
                      <span className="text-emerald-400 text-xs flex items-center gap-1">
                        <ExternalLink size={12} />
                        Publicado
                      </span>
                    )}
                  </div>

                  {/* Address */}
                  <h3 className="text-white font-medium mb-1 truncate">
                    {property.address || 'Sin dirección'}
                  </h3>
                  
                  {/* Location */}
                  <div className="flex items-center gap-1 text-slate-400 text-sm mb-3">
                    <MapPin size={14} />
                    <span>{property.park_name || `${property.city}, ${property.state}`}</span>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {property.purchase_price && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <DollarSign size={14} className="text-emerald-400" />
                        <span>${property.purchase_price.toLocaleString()}</span>
                      </div>
                    )}
                    {property.bedrooms && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Bed size={14} className="text-blue-400" />
                        <span>{property.bedrooms} recámaras</span>
                      </div>
                    )}
                    {property.bathrooms && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Bath size={14} className="text-cyan-400" />
                        <span>{property.bathrooms} baños</span>
                      </div>
                    )}
                    {property.year_built && (
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Calendar size={14} className="text-amber-400" />
                        <span>{property.year_built}</span>
                      </div>
                    )}
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

