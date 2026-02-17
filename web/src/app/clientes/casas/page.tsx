'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useInView } from '@/hooks/useInView'
import {
  Search, MapPin, Bed, Bath, Square, X,
  SlidersHorizontal, ChevronDown, Home, ArrowRight, Tag
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

      {/* ── HERO ── Clean, minimal header */}
      <section className="relative py-14 sm:py-20" style={{ background: '#00233d' }}>
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(160deg, rgba(0,35,61,1) 0%, rgba(0,66,116,0.95) 60%, rgba(0,90,158,0.85) 100%)' }}
        />
        <div className="relative max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
          <p
            className="text-xs font-semibold tracking-[0.15em] uppercase mb-3 opacity-0 animate-fade-in-up"
            style={{ color: 'var(--mn-gold-light)', fontFamily: "'Montserrat', sans-serif", animationDelay: '0.1s', animationFillMode: 'forwards' }}
          >
            Catálogo de propiedades
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-extrabold text-white leading-tight opacity-0 animate-fade-in-up"
            style={{ fontFamily: "'Montserrat', sans-serif", animationDelay: '0.2s', animationFillMode: 'forwards' }}
          >
            Casas Disponibles
          </h1>
          <p
            className="text-base sm:text-lg text-white/50 mt-3 max-w-lg opacity-0 animate-fade-in-up"
            style={{ fontFamily: "'Mulish', sans-serif", animationDelay: '0.3s', animationFillMode: 'forwards' }}
          >
            Casas móviles renovadas en Texas, listas para mudarte.
          </p>
        </div>
        {/* Clean bottom edge */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 32" fill="none" className="w-full block">
            <path d="M0 32h1440V16c-180 10-360 16-720 16S180 26 0 16v16z" fill="white" />
          </svg>
        </div>
      </section>

      {/* ── FILTER BAR ── */}
      <div className="sticky top-16 sm:top-20 z-40 bg-white border-b" style={{ borderColor: '#eef0f3' }}>
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-3">
          <div className="flex items-center gap-3">

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
                showFilters || hasActiveFilters ? 'text-white' : 'border text-gray-600 hover:bg-gray-50'
              }`}
              style={
                showFilters || hasActiveFilters
                  ? { background: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }
                  : { borderColor: '#d5dae1', fontFamily: "'Montserrat', sans-serif" }
              }
            >
              <SlidersHorizontal className="w-4 h-4" />
              Filtros
              {hasActiveFilters && (
                <span className="ml-1 w-5 h-5 rounded-full bg-white/25 flex items-center justify-center text-[10px]">
                  {[filters.city, filters.minPrice, filters.maxPrice].filter(Boolean).length}
                </span>
              )}
            </button>

            {/* Active pills */}
            <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar">
              {filters.city && (
                <FilterPill
                  label={filters.city}
                  icon={<MapPin className="w-3 h-3" />}
                  onRemove={() => setFilters({ ...filters, city: '' })}
                />
              )}
              {filters.minPrice && (
                <FilterPill
                  label={`Min: $${Number(filters.minPrice).toLocaleString()}`}
                  onRemove={() => setFilters({ ...filters, minPrice: '' })}
                />
              )}
              {filters.maxPrice && (
                <FilterPill
                  label={`Max: $${Number(filters.maxPrice).toLocaleString()}`}
                  onRemove={() => setFilters({ ...filters, maxPrice: '' })}
                />
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-semibold hover:underline whitespace-nowrap"
                  style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Limpiar
                </button>
              )}
            </div>

            <span className="text-sm whitespace-nowrap hidden sm:inline text-gray-400" style={{ fontFamily: "'Mulish', sans-serif" }}>
              <strong className="text-gray-700">{properties.length}</strong> casas
            </span>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t animate-fade-in-up" style={{ borderColor: '#eef0f3' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    Ciudad
                  </label>
                  <div className="relative">
                    <select
                      value={filters.city}
                      onChange={e => setFilters({ ...filters, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-lg border bg-white text-sm appearance-none pr-10"
                      style={{ borderColor: '#d5dae1', fontFamily: "'Mulish', sans-serif" }}
                    >
                      <option value="">Todas las ciudades</option>
                      {cities.map(city => <option key={city} value={city}>{city}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    Precio mínimo
                  </label>
                  <input
                    type="number" placeholder="$0"
                    value={filters.minPrice}
                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border bg-white text-sm"
                    style={{ borderColor: '#d5dae1', fontFamily: "'Mulish', sans-serif" }}
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2 text-gray-500" style={{ fontFamily: "'Montserrat', sans-serif" }}>
                    Precio máximo
                  </label>
                  <input
                    type="number" placeholder="Sin límite"
                    value={filters.maxPrice}
                    onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border bg-white text-sm"
                    style={{ borderColor: '#d5dae1', fontFamily: "'Mulish', sans-serif" }}
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setShowFilters(false)}
                    className="w-full px-6 py-3 rounded-lg text-white font-bold text-sm transition-all hover:brightness-110"
                    style={{ background: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
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
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12 py-8 sm:py-12">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
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
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
      style={{ background: '#e6f0f8', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
    >
      {icon}{label}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70"><X className="w-3 h-3" /></button>
    </span>
  )
}

function SkeletonCard() {
  return (
    <div className="rounded-xl overflow-hidden bg-white border border-gray-100">
      <div className="aspect-[16/10] bg-gray-100 animate-pulse" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-gray-100 rounded w-3/4 animate-pulse" />
        <div className="h-3 bg-gray-50 rounded w-1/2 animate-pulse" />
        <div className="flex gap-4 pt-3 border-t border-gray-50">
          <div className="h-3 bg-gray-50 rounded w-12 animate-pulse" />
          <div className="h-3 bg-gray-50 rounded w-12 animate-pulse" />
          <div className="h-3 bg-gray-50 rounded w-16 animate-pulse" />
        </div>
      </div>
    </div>
  )
}

function EmptyState({ hasActiveFilters, onClear }: { hasActiveFilters: boolean; onClear: () => void }) {
  return (
    <div className="text-center py-20">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5" style={{ background: '#e6f0f8' }}>
        <Home className="w-8 h-8" style={{ color: 'var(--mn-blue)' }} />
      </div>
      <h3 className="text-xl font-bold mb-2" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
        No hay casas disponibles
      </h3>
      <p className="text-gray-500 mb-6 max-w-md mx-auto" style={{ fontFamily: "'Mulish', sans-serif" }}>
        Intenta con otros filtros o vuelve pronto.
      </p>
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="px-6 py-3 rounded-lg font-semibold text-sm border-2 transition-all hover:bg-gray-50"
          style={{ color: 'var(--mn-blue)', borderColor: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
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
    <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
      {properties.map((property, i) => (
        <div
          key={property.id}
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'none' : 'translateY(20px)',
            transition: `all 0.5s ease ${(i % 6) * 0.06}s`,
          }}
        >
          <PropertyCard property={property} />
        </div>
      ))}
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const mainPhoto = property.photos?.[0] || '/placeholder-house.jpg'
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Link
      href={`/clientes/casas/${property.id}`}
      className="group block rounded-xl overflow-hidden bg-white border border-gray-100 transition-all duration-300 hover:shadow-lg hover:border-gray-200"
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        {property.photos?.length > 0 ? (
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
          <div className="w-full h-full flex items-center justify-center bg-gray-50">
            <Home className="w-10 h-10 text-gray-300" />
          </div>
        )}

        {/* Renovated badge */}
        {property.is_renovated && (
          <div className="absolute top-3 left-3">
            <span
              className="px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider text-white"
              style={{ background: '#16a34a', fontFamily: "'Montserrat', sans-serif" }}
            >
              Renovada
            </span>
          </div>
        )}

        {/* Price */}
        <div className="absolute bottom-3 left-3">
          <span
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-white font-extrabold text-base"
            style={{
              background: 'rgba(0,35,61,0.88)',
              backdropFilter: 'blur(8px)',
              fontFamily: "'Montserrat', sans-serif",
            }}
          >
            ${property.sale_price?.toLocaleString()}
          </span>
        </div>

        {/* Photo count */}
        {property.photos?.length > 1 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md text-white text-[11px] font-medium" style={{ background: 'rgba(0,0,0,0.5)' }}>
            {property.photos.length} fotos
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3
              className="font-bold text-[0.95rem] mb-1 truncate"
              style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
            >
              {property.address}
            </h3>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0 text-gray-400" />
              <span className="text-sm text-gray-500" style={{ fontFamily: "'Mulish', sans-serif" }}>
                {property.city || 'Texas'}, {property.state || 'TX'}
              </span>
            </div>
          </div>
          {/* Hover arrow */}
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all duration-200"
            style={{ background: 'var(--mn-blue)', color: 'white' }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm pt-3.5 mt-3.5 border-t border-gray-100">
          {property.bedrooms > 0 && (
            <div className="flex items-center gap-1.5">
              <Bed className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span className="text-gray-600">{property.bedrooms}</span>
            </div>
          )}
          {property.bathrooms > 0 && (
            <div className="flex items-center gap-1.5">
              <Bath className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span className="text-gray-600">{property.bathrooms}</span>
            </div>
          )}
          {property.square_feet > 0 && (
            <div className="flex items-center gap-1.5">
              <Square className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span className="text-gray-600">{property.square_feet} sqft</span>
            </div>
          )}
          {property.year > 0 && (
            <span className="text-xs text-gray-400 ml-auto">{property.year}</span>
          )}
        </div>
      </div>
    </Link>
  )
}
