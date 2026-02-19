'use client'

export const dynamic = 'force-dynamic'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  Plus, 
  Search, 
  Building2,
  MapPin,
  DollarSign,
  ArrowRight,
  Loader2
} from 'lucide-react'

interface Property {
  id: string
  address: string
  city?: string
  state?: string
  status: 'purchased' | 'published' | 'reserved' | 'renovating' | 'sold'
  is_renovated: boolean
  purchase_price?: number
  sale_price?: number
  bedrooms?: number
  bathrooms?: number
  photos: string[]
  property_code?: string
  created_at: string
}

const statusConfig: Record<string, { label: string; color: string }> = {
  purchased: { label: 'Comprada', color: 'badge-default' },
  published: { label: 'Publicada', color: 'badge-success' },
  reserved: { label: 'Reservada', color: 'badge-warning' },
  renovating: { label: 'En Renovación', color: 'badge-warning' },
  sold: { label: 'Vendida', color: 'badge-navy' },
}

export default function PropertiesPage() {
  const searchParams = useSearchParams()
  const statusFilter = searchParams.get('status')
  
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  useEffect(() => {
    const fetchProperties = async () => {
      try {
        const res = await fetch('/api/properties')
        const data = await res.json()
        setProperties(data)
      } catch (error) {
        console.error('Error fetching properties:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchProperties()
  }, [])

  const filteredProperties = properties.filter(p => {
    const matchesStatus = !statusFilter || p.status === statusFilter
    const matchesSearch = !search || 
      p.address.toLowerCase().includes(search.toLowerCase()) ||
      p.city?.toLowerCase().includes(search.toLowerCase()) ||
      p.property_code?.toLowerCase().includes(search.toLowerCase())
    return matchesStatus && matchesSearch
  })

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
            Propiedades
          </h1>
          <p style={{ color: 'var(--slate)' }}>
            {statusFilter 
              ? `Filtrando: ${statusConfig[statusFilter as keyof typeof statusConfig]?.label}`
              : 'Todas las propiedades'
            }
          </p>
        </div>
        <Link href="/homes/properties/new" className="btn-primary">
          <Plus className="w-5 h-5" />
          Nueva Propiedad
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" 
                  style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            placeholder="Buscar por dirección o ciudad..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-10"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link 
            href="/homes/properties"
            className={`btn-sm ${!statusFilter ? 'btn-primary' : 'btn-secondary'}`}
          >
            Todas
          </Link>
          {Object.entries(statusConfig).map(([key, config]) => (
            <Link
              key={key}
              href={`/homes/properties?status=${key}`}
              className={`btn-sm ${statusFilter === key ? 'btn-primary' : 'btn-secondary'}`}
            >
              {config.label}
            </Link>
          ))}
        </div>
      </div>

      {/* Properties List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--ash)' }} />
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="card p-12 text-center">
          <Building2 className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-xl mb-2" style={{ color: 'var(--ink)' }}>
            No hay propiedades
          </h3>
          <p className="mb-6" style={{ color: 'var(--slate)' }}>
            {statusFilter 
              ? `No hay propiedades con estado "${statusConfig[statusFilter as keyof typeof statusConfig]?.label}"`
              : 'Comienza agregando tu primera propiedad'
            }
          </p>
          <Link href="/homes/properties/new" className="btn-primary">
            <Plus className="w-5 h-5" />
            Agregar Propiedad
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProperties.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      )}
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const status = statusConfig[property.status] || { label: property.status, color: 'badge-default' }

  return (
    <Link 
      href={`/homes/properties/${property.id}`}
      className="card group overflow-hidden"
    >
      {/* Image */}
      <div className="relative h-44" style={{ backgroundColor: 'var(--cream)' }}>
        {property.photos.length > 0 ? (
          <img 
            src={property.photos[0]} 
            alt={property.address}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Building2 className="w-12 h-12" style={{ color: 'var(--stone)' }} />
          </div>
        )}
        
        {/* Status Badge */}
        <div className={`absolute top-3 left-3 badge ${status.color}`}>
          {status.label}
        </div>

        {/* Renovated Badge */}
        {property.is_renovated && (
          <div className="absolute top-3 right-3 badge badge-gold">
            Renovada
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-medium group-hover:text-navy-600 transition-colors line-clamp-1"
            style={{ color: 'var(--charcoal)' }}>
          {property.property_code && (
            <span className="inline-flex items-center justify-center px-1.5 py-0.5 mr-1.5 text-xs font-bold rounded bg-gold-100 text-gold-700 border border-gold-200">
              {property.property_code}
            </span>
          )}
          {property.address}
        </h3>
        
        {property.city && (
          <div className="flex items-center gap-1 text-sm mt-1" style={{ color: 'var(--slate)' }}>
            <MapPin className="w-3.5 h-3.5" />
            {property.city}, {property.state || 'TX'}
          </div>
        )}

        <div className="flex items-center justify-between mt-4 pt-4 border-t" 
             style={{ borderColor: 'var(--sand)' }}>
          {property.sale_price ? (
            <div className="flex items-center gap-1 font-semibold" style={{ color: 'var(--navy-700)' }}>
              <DollarSign className="w-4 h-4" />
              {property.sale_price.toLocaleString()}
            </div>
          ) : property.purchase_price ? (
            <div className="text-sm" style={{ color: 'var(--slate)' }}>
              Compra: ${property.purchase_price.toLocaleString()}
            </div>
          ) : (
            <span className="text-sm" style={{ color: 'var(--ash)' }}>Sin precio</span>
          )}

          <ArrowRight 
            className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" 
            style={{ color: 'var(--ash)' }} 
          />
        </div>
      </div>
    </Link>
  )
}
