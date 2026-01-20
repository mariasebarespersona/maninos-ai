'use client'

import React, { useState, useEffect } from 'react'

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

// Icons
const Icons = {
  x: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>,
  building: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>,
  refresh: <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>,
  home: <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>,
  map: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>,
  dollar: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>,
  bed: <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>, // Simplified bed icon
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

  const getStatusBadge = (status?: string) => {
    switch (status) {
      case 'available': return <span className="badge badge-success">Disponible</span>
      case 'under_contract': return <span className="badge badge-gold">En Contrato</span>
      case 'sold': return <span className="badge badge-blue">Vendido</span>
      case 'pending_acquisition': return <span className="badge badge-purple">Pendiente</span>
      default: return <span className="badge bg-white/10 text-zinc-400">{status || 'Sin estado'}</span>
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
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                {Icons.building}
              </div>
              <div>
                <h2 className="text-white font-bold text-lg">Propiedades</h2>
                <p className="text-zinc-500 text-xs">{properties.length} en inventario</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={fetchProperties} className="btn-ghost p-2 text-zinc-400 hover:text-white">
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
          {loading && properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
              <div className="w-8 h-8 border-2 border-amber-500/20 border-t-amber-500 rounded-full animate-spin mb-3" />
              <p className="text-sm">Cargando inventario...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
              {error}
            </div>
          ) : properties.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-full bg-zinc-900 flex items-center justify-center mb-4 text-zinc-600">
                {Icons.home}
              </div>
              <h3 className="text-white font-medium mb-1">Sin propiedades</h3>
              <p className="text-zinc-500 text-sm max-w-[200px]">
                Usa el chat para buscar y agregar nuevas propiedades
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {properties.map((property, index) => (
                <div
                  key={property.id}
                  onClick={() => onSelectProperty?.(property)}
                  className={`card card-hover p-4 cursor-pointer group animate-fade-in delay-${Math.min(index + 1, 6)}`}
                >
                  <div className="flex justify-between items-start mb-3">
                    {getStatusBadge(property.inventory_status)}
                    {property.listing_active && (
                      <span className="text-[10px] text-emerald-400 font-medium tracking-wide uppercase">
                        Active Listing
                      </span>
                    )}
                  </div>

                  <h3 className="text-white font-semibold text-lg mb-1 group-hover:text-amber-400 transition-colors truncate">
                    {property.address || 'Dirección pendiente'}
                  </h3>
                  
                  <div className="flex items-center gap-2 text-zinc-500 text-sm mb-4">
                    <span className="text-zinc-600">{Icons.map}</span>
                    <span>{property.park_name || `${property.city || ''}, ${property.state || 'TX'}`}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Precio</div>
                      <div className="text-emerald-400 font-medium font-mono">
                        ${(property.market_value || property.purchase_price || 0).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-zinc-500 mb-1">Distribución</div>
                      <div className="text-white text-sm">
                        {property.bedrooms || 0}bd / {property.bathrooms || 0}ba
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
