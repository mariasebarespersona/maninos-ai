'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useInView } from '@/hooks/useInView'
import {
  Search, MapPin, Bed, Bath, Square, Filter, Loader2, X,
  SlidersHorizontal, ChevronDown, Home, ArrowRight, Sparkles, Tag
} from 'lucide-react'

/* ═══════════════════════════════════════════════════════════════════
   CASAS CATALOG — Editorial grid with scroll reveals
   
   Skill principles applied:
   - Grain texture on hero
   - Skeleton loading states (not a spinner)
   - Scroll-triggered card reveals with stagger
   - Bold typography hierarchy
   - Gold accent details
   - Hover micro-interactions
   ═══════════════════════════════════════════════════════════════════ */

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

  useEffect(() => {
    fetchCities()
  }, [])

  useEffect(() => {
    fetchProperties()
  }, [filters])

  const fetchCities = async () => {
    try {
      const res = await fetch('/api/public/properties/cities/list')
      const data = await res.json()
      if (data.ok) setCities(data.cities)
    } catch (error) {
      console.error('Error fetching cities:', error)
    }
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
    } catch (error) {
      console.error('Error fetching properties:', error)
    } finally {
      setLoading(false)
    }
  }

  const clearFilters = () => {
    setFilters({ city: '', minPrice: '', maxPrice: '' })
  }

  const hasActiveFilters = filters.city || filters.minPrice || filters.maxPrice

  return (
    <div className="min-h-screen">

      {/* ═══════════ HERO — Compact, editorial, grain ═══════════ */}
      <section
        className="relative py-16 sm:py-20 overflow-hidden mn-grain"
        style={{ background: 'linear-gradient(145deg, #00172b 0%, #00233d 40%, #004274 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(163,141,72,0.12) 0%, transparent 65%)' }} />
          <div className="absolute inset-0 mn-dots text-white/[0.03]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <div className="flex items-center gap-3 mb-4 mn-animate-fade-up mn-stagger-1">
              <div className="h-px w-8" style={{ background: 'var(--mn-gold)' }} />
              <p className="text-xs font-bold uppercase tracking-[0.2em]" style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}>
                Catálogo de Propiedades
              </p>
            </div>
            <h1
              className="text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-[1.1] mn-animate-fade-up mn-stagger-2"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              Casas <span style={{ color: '#c4af6a' }}>Disponibles</span>
            </h1>
            <p
              className="text-lg text-white/50 mt-4 max-w-lg mn-animate-fade-up mn-stagger-3"
              style={{ fontFamily: "'Mulish', sans-serif" }}
            >
              Casas móviles renovadas en Texas, listas para que te mudes.
            </p>
          </div>
        </div>

        {/* Angled separator */}
        <div className="absolute bottom-0 left-0 right-0 h-16">
          <div className="absolute inset-0" style={{ background: 'var(--mn-light, #f7f8f9)', clipPath: 'polygon(0 55%, 40% 35%, 70% 60%, 100% 40%, 100% 100%, 0 100%)' }} />
        </div>
      </section>

      {/* ═══════════ FILTER BAR — Sticky, glass ═══════════ */}
      <div className="sticky top-16 sm:top-20 z-40 mn-glass" style={{ borderBottom: '1px solid var(--mn-light-200)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                showFilters || hasActiveFilters
                  ? 'text-white shadow-md'
                  : 'border hover:bg-gray-50'
              }`}
              style={
                showFilters || hasActiveFilters
                  ? { background: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }
                  : { borderColor: 'var(--mn-light-300)', color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }
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

            {/* Active filter pills */}
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
                  className="text-xs font-semibold hover:underline whitespace-nowrap transition-colors"
                  style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Limpiar todo
                </button>
              )}
            </div>

            {/* Count */}
            <span
              className="text-sm whitespace-nowrap hidden sm:inline"
              style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}
            >
              <strong style={{ color: 'var(--mn-dark)' }}>{properties.length}</strong> casas
            </span>
          </div>

          {/* Expanded Filters Panel */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t mn-animate-fade-up" style={{ borderColor: 'var(--mn-light-200)' }}>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}>
                    Ciudad
                  </label>
                  <div className="relative">
                    <select
                      value={filters.city}
                      onChange={e => setFilters({ ...filters, city: e.target.value })}
                      className="input-brand w-full appearance-none pr-10"
                    >
                      <option value="">Todas las ciudades</option>
                      {cities.map(city => (
                        <option key={city} value={city}>{city}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: 'var(--mn-gray)' }} />
                  </div>
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}>
                    Precio mínimo
                  </label>
                  <input
                    type="number"
                    placeholder="$0"
                    value={filters.minPrice}
                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                    className="input-brand w-full"
                  />
                </div>
                
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}>
                    Precio máximo
                  </label>
                  <input
                    type="number"
                    placeholder="Sin límite"
                    value={filters.maxPrice}
                    onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                    className="input-brand w-full"
                  />
                </div>
                
                <div className="flex items-end">
                  <button
                    onClick={() => setShowFilters(false)}
                    className="w-full px-6 py-3 rounded-xl text-white font-bold text-sm transition-all duration-200 hover:translate-y-[-1px] hover:shadow-lg"
                    style={{ background: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    Aplicar filtros
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ PROPERTY GRID ═══════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12" style={{ background: 'var(--mn-light)' }}>

        {/* Mobile count */}
        <div className="flex items-center justify-between mb-6 sm:hidden">
          <p className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
            <strong style={{ color: 'var(--mn-dark)' }}>{properties.length}</strong> casas encontradas
          </p>
        </div>

        {loading ? (
          /* ─── SKELETON GRID ─── */
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {Array.from({ length: 6 }).map((_, i) => (
              <SkeletonCard key={i} delay={i * 0.1} />
            ))}
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

/* ─── FILTER PILL ─── */
function FilterPill({ label, icon, onRemove }: { label: string; icon?: React.ReactNode; onRemove: () => void }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 hover:shadow-sm"
      style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
    >
      {icon}
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:opacity-70 transition-opacity">
        <X className="w-3 h-3" />
      </button>
    </span>
  )
}

/* ─── SKELETON CARD ─── */
function SkeletonCard({ delay }: { delay: number }) {
  return (
    <div
      className="rounded-2xl overflow-hidden bg-white shadow-sm animate-pulse"
      style={{ animationDelay: `${delay}s`, border: '1px solid var(--mn-light-200)' }}
    >
      <div className="aspect-[16/10] bg-gray-200" />
      <div className="p-5 space-y-3">
        <div className="h-4 bg-gray-200 rounded w-3/4" />
        <div className="h-3 bg-gray-100 rounded w-1/2" />
        <div className="flex gap-4 pt-3 border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
          <div className="h-3 bg-gray-100 rounded w-12" />
          <div className="h-3 bg-gray-100 rounded w-12" />
          <div className="h-3 bg-gray-100 rounded w-16" />
        </div>
      </div>
    </div>
  )
}

/* ─── EMPTY STATE ─── */
function EmptyState({ hasActiveFilters, onClear }: { hasActiveFilters: boolean; onClear: () => void }) {
  return (
    <div className="text-center py-20">
      <div
        className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 rotate-3"
        style={{ background: 'var(--mn-blue-50)' }}
      >
        <Home className="w-10 h-10" style={{ color: 'var(--mn-blue)' }} />
      </div>
      <h3
        className="text-xl font-bold mb-2"
        style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
      >
        No hay casas disponibles
      </h3>
      <p className="mb-6 max-w-md mx-auto" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
        Intenta con otros filtros o vuelve pronto para ver nuevas propiedades.
      </p>
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-200 hover:translate-y-[-1px]"
          style={{ color: 'var(--mn-blue)', border: '2px solid var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

/* ─── PROPERTY GRID with scroll reveals ─── */
function PropertyGrid({ properties }: { properties: Property[] }) {
  const { ref, isInView } = useInView({ rootMargin: '0px 0px -50px 0px' })

  return (
    <div ref={ref} className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
      {properties.map((property, i) => (
        <div
          key={property.id}
          style={{
            opacity: isInView ? 1 : 0,
            transform: isInView ? 'translateY(0)' : 'translateY(30px)',
            transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${(i % 6) * 0.07}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${(i % 6) * 0.07}s`,
          }}
        >
          <PropertyCard property={property} />
        </div>
      ))}
    </div>
  )
}

/* ─── PROPERTY CARD — editorial hover, gold line accent ─── */
function PropertyCard({ property }: { property: Property }) {
  const mainPhoto = property.photos?.[0] || '/placeholder-house.jpg'
  const [imgLoaded, setImgLoaded] = useState(false)

  return (
    <Link
      href={`/clientes/casas/${property.id}`}
      className="group block rounded-2xl overflow-hidden bg-white transition-all duration-300 mn-hover-lift mn-hover-gold-line"
      style={{ border: '1px solid var(--mn-light-200)' }}
    >
      {/* Image container */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        {property.photos?.length > 0 ? (
          <>
            {!imgLoaded && <div className="absolute inset-0 bg-gray-200 animate-pulse" />}
            <img
              src={mainPhoto}
              alt={property.address}
              className={`w-full h-full object-cover transition-all duration-700 group-hover:scale-[1.04] ${imgLoaded ? 'opacity-100' : 'opacity-0'}`}
              onLoad={() => setImgLoaded(true)}
            />
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--mn-light-200)' }}>
            <Home className="w-12 h-12" style={{ color: 'var(--mn-gray-light)' }} />
          </div>
        )}

        {/* Gradient overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

        {/* Badges — top left */}
        <div className="absolute top-3 left-3 flex gap-2">
          {property.is_renovated && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white shadow-sm"
              style={{ background: '#16a34a', fontFamily: "'Montserrat', sans-serif" }}
            >
              ✓ Renovada
            </span>
          )}
        </div>

        {/* Price overlay — bottom left, glass effect */}
        <div className="absolute bottom-3 left-3">
          <span
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-white font-black shadow-lg"
            style={{
              background: 'rgba(0,23,43,0.85)',
              backdropFilter: 'blur(10px)',
              fontFamily: "'Montserrat', sans-serif",
              fontSize: '1.125rem',
              letterSpacing: '-0.02em',
              border: '1px solid rgba(255,255,255,0.08)',
            }}
          >
            <Tag className="w-3.5 h-3.5 opacity-60" />
            ${property.sale_price?.toLocaleString()}
          </span>
        </div>

        {/* Photo count — bottom right */}
        {property.photos?.length > 1 && (
          <div
            className="absolute bottom-3 right-3 px-2.5 py-1 rounded-lg text-white text-[11px] font-semibold"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
          >
            📷 {property.photos.length}
          </div>
        )}
      </div>

      {/* Content — tight spacing, gold arrow on hover */}
      <div className="p-5 relative">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3
              className="font-bold text-[0.95rem] mb-1 line-clamp-1 transition-colors duration-200"
              style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
            >
              {property.address}
            </h3>
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--mn-gray)' }} />
              <span className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                {property.city || 'Texas'}, {property.state || 'TX'}
              </span>
            </div>
          </div>
          {/* Arrow — appears on hover */}
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 opacity-0 group-hover:opacity-100 translate-x-2 group-hover:translate-x-0 transition-all duration-300"
            style={{ background: 'var(--mn-gold)', color: 'white' }}
          >
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm pt-4 mt-4 border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
          {property.bedrooms > 0 && (
            <div className="flex items-center gap-1.5">
              <Bed className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                {property.bedrooms} <span className="hidden sm:inline">hab</span>
              </span>
            </div>
          )}
          {property.bathrooms > 0 && (
            <div className="flex items-center gap-1.5">
              <Bath className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                {property.bathrooms} <span className="hidden sm:inline">baños</span>
              </span>
            </div>
          )}
          {property.square_feet > 0 && (
            <div className="flex items-center gap-1.5">
              <Square className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
              <span style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                {property.square_feet} sqft
              </span>
            </div>
          )}
          {property.year > 0 && (
            <div className="flex items-center gap-1.5 ml-auto">
              <span className="text-xs" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish'" }}>
                {property.year}
              </span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}
