'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useInView } from '@/hooks/useInView'
import {
  Search, MapPin, Bed, Bath, Square, X,
  SlidersHorizontal, ChevronDown, Home, Heart
} from 'lucide-react'

interface Property {
  id: string
  address: string
  city: string
  state: string
  sale_price: number
  bedrooms: number
  bathrooms: number
  square_feet: number
  year: number
  photos: string[]
  is_renovated: boolean
}

export default function HouseCatalog() {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)
  const [cities, setCities] = useState<string[]>([])
  const [filters, setFilters] = useState({
    city: '',
    minPrice: '',
    maxPrice: ''
  })
  const [showFilters, setShowFilters] = useState(false)

  useEffect(() => { fetchCities() }, [])
  useEffect(() => { fetchProperties() }, [filters])

  const fetchCities = async () => {
    try {
      const res = await fetch('/api/public/properties/cities/list')
      const data = await res.json()
      if (data.ok) setCities(data.cities)
    } catch (error) { console.error('Error fetching cities:', error) }
  }

  const fetchProperties = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.city) params.set('city', filters.city)
      if (filters.minPrice) params.set('min_price', filters.minPrice)
      if (filters.maxPrice) params.set('max_price', filters.maxPrice)
      const res = await fetch(`/api/public/properties?${params}`)
      const data = await res.json()
      if (data.ok) setProperties(data.properties)
    } catch (error) { console.error('Error fetching properties:', error) }
    finally { setLoading(false) }
  }

  const clearFilters = () => setFilters({ city: '', minPrice: '', maxPrice: '' })
  const hasActiveFilters = filters.city || filters.minPrice || filters.maxPrice

  return (
    <div className="min-h-screen bg-white">

      {/* ── FILTER BAR ── Sticky, clean, Airbnb-style */}
      <div className="sticky top-16 sm:top-20 z-40 bg-white border-b border-gray-200">
        <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10 py-3">
          <div className="flex items-center gap-3">

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium border transition-all ${
                showFilters || hasActiveFilters
                  ? 'bg-[#222] text-white border-[#222]'
                  : 'border-gray-300 text-[#222] hover:border-[#222]'
              }`}
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-0.5 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px]">
                  {[filters.city, filters.minPrice, filters.maxPrice].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Active pills */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {filters.city && (
                <FilterPill label={filters.city} icon={<MapPin className="w-3 h-3" />} onRemove={() => setFilters({ ...filters, city: '' })} />
              )}
              {filters.minPrice && (
                <FilterPill label={`Desde $${Number(filters.minPrice).toLocaleString()}`} onRemove={() => setFilters({ ...filters, minPrice: '' })} />
              )}
              {filters.maxPrice && (
                <FilterPill label={`Hasta $${Number(filters.maxPrice).toLocaleString()}`} onRemove={() => setFilters({ ...filters, maxPrice: '' })} />
              )}
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs font-semibold text-[#222] underline whitespace-nowrap">
                  Limpiar
                </button>
              )}
            </div>

            <span className="text-sm whitespace-nowrap hidden sm:inline text-gray-500">
              <strong className="text-[#222]">{properties.length}</strong> casas
            </span>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in-up pb-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Ciudad</label>
                  <div className="relative">
                    <select
                      value={filters.city}
                      onChange={e => setFilters({ ...filters, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-sm appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                    >
                      <option value="">Todas</option>
                      {cities.map(city => <option key={city} value={city}>{city}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Precio mínimo</label>
                  <input
                    type="number" placeholder="$0"
                    value={filters.minPrice}
                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Precio máximo</label>
                  <input
                    type="number" placeholder="Sin límite"
                    value={filters.maxPrice}
                    onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setShowFilters(false)}
                    className="w-full px-6 py-3 rounded-xl text-white font-semibold text-sm bg-[#222] hover:bg-black transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── GRID ── */}
      <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10 py-8 sm:py-10">
        {!loading && properties.length > 0 && (
          <h1 className="text-2xl font-bold text-[#222] mb-6">
            {hasActiveFilters ? 'Resultados' : 'Casas disponibles'}
          </h1>
        )}

        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {Array.from({ length: 8 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : properties.length === 0 ? (
          <EmptyState hasActiveFilters={!!hasActiveFilters} onClear={clearFilters} />
        ) : (
          <PropertyGrid properties={properties} />
        )}
      </div>
    </div>
  )
}

function FilterPill({ label, icon, onRemove }: { label: string; icon?: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap bg-gray-100 text-[#222]">
      {icon}{label}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="animate-pulse">
      <div className="aspect-[4/3] rounded-xl bg-gray-100 mb-3" />
      <div className="h-4 bg-gray-100 rounded w-3/4 mb-2" />
      <div className="h-3 bg-gray-50 rounded w-1/2 mb-2" />
      <div className="h-4 bg-gray-100 rounded w-1/3" />
    </div>
  )
}

function EmptyState({ hasActiveFilters, onClear }: { hasActiveFilters: boolean; onClear: () => void }) {
  return (
    <div className="text-center py-20">
      <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-[#222] mb-1">No hay casas disponibles</h3>
      <p className="text-gray-500 mb-6">Intenta con otros filtros o vuelve pronto.</p>
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="px-6 py-3 rounded-xl font-semibold text-sm text-[#222] border border-[#222] hover:bg-gray-50 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

function PropertyGrid({ properties }: { properties: Property[] }) {
  const { ref, isInView } = useInView({ rootMargin: '0px 0px -40px 0px' })
  return (
    <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
      {properties.map((property, i) => (
        <div
          key={property.id}
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'none' : 'translateY(16px)',
            transition: `all 0.4s ease ${(i % 8) * 0.04}s`,
          }}
        >
          <PropertyCard property={property} />
        </div>
      ))}
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const mainPhoto = property.photos?.[0]
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Link href={`/clientes/casas/${property.id}`} className="group block">
      {/* Image — Airbnb rounded corners, no border */}
      <div className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 mb-3">
        {mainPhoto ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-100 animate-pulse" />}
            <img
              src={mainPhoto}
              alt={property.address}
              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Home className="w-10 h-10 text-gray-300" />
          </div>
        )}

        {/* Renovated badge */}
        {property.is_renovated && (
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[#222] text-[11px] font-semibold uppercase tracking-wide px-2.5 py-1 rounded-md shadow-sm">
            Renovada
          </span>
        )}

        {/* Photo count */}
        {property.photos?.length > 1 && (
          <span className="absolute bottom-3 right-3 bg-black/50 text-white text-[11px] font-medium px-2 py-0.5 rounded-md backdrop-blur-sm">
            1/{property.photos.length}
          </span>
        )}
      </div>

      {/* Content — Airbnb-style, tight spacing */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[15px] text-[#222] leading-snug">
            {property.city || 'Texas'}, {property.state || 'TX'}
          </h3>
        </div>
        <p className="text-sm text-gray-500 leading-snug">{property.address}</p>

        {/* Features inline */}
        <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
          {property.bedrooms > 0 && <span>{property.bedrooms} hab</span>}
          {property.bedrooms > 0 && property.bathrooms > 0 && <span>·</span>}
          {property.bathrooms > 0 && <span>{property.bathrooms} baños</span>}
          {(property.bedrooms > 0 || property.bathrooms > 0) && property.square_feet > 0 && <span>·</span>}
          {property.square_feet > 0 && <span>{property.square_feet} sqft</span>}
        </div>

        <p className="font-bold text-[15px] text-[#222] mt-1">
          ${property.sale_price?.toLocaleString()}
        </p>
      </div>
    </Link>
  )
}
