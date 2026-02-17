'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Search, MapPin, Bed, Bath, Square, Filter, Loader2, X, SlidersHorizontal, ChevronDown, Home } from 'lucide-react'

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
      if (data.ok) {
        setCities(data.cities)
      }
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
      
      if (data.ok) {
        setProperties(data.properties)
      }
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

      {/* ═══════════ HERO BANNER ═══════════ */}
      <section
        className="relative py-16 sm:py-24 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #00233d 0%, #004274 50%, #005a9e 100%)' }}
      >
        {/* Decorative */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-20 -right-20 w-80 h-80 rounded-full" style={{ background: 'radial-gradient(circle, rgba(163,141,72,0.15) 0%, transparent 70%)' }} />
          <div className="absolute bottom-0 left-0 w-full h-32" style={{ background: 'linear-gradient(0deg, rgba(0,35,61,0.4) 0%, transparent 100%)' }} />
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '32px 32px'
          }} />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p
            className="text-sm font-bold uppercase tracking-widest mb-4"
            style={{ color: '#c4af6a', fontFamily: "'Montserrat', sans-serif" }}
          >
            Catálogo de Propiedades
          </p>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black text-white mb-4"
            style={{ fontFamily: "'Montserrat', sans-serif" }}
          >
            Casas Disponibles
          </h1>
          <p
            className="text-lg text-white/60 max-w-xl mx-auto"
            style={{ fontFamily: "'Mulish', sans-serif" }}
          >
            Casas móviles renovadas en Texas, listas para que te mudes.
          </p>
        </div>

        {/* Wave */}
        <div className="absolute bottom-0 left-0 right-0">
          <svg viewBox="0 0 1440 60" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full">
            <path d="M0 60H1440V15C1440 15 1320 45 1140 38C960 30 720 0 540 15C360 30 120 45 0 30V60Z" fill="var(--mn-light, #f7f8f9)"/>
          </svg>
        </div>
      </section>

      {/* ═══════════ FILTER BAR ═══════════ */}
      <div className="sticky top-16 sm:top-20 z-40 border-b mn-glass" style={{ borderColor: 'var(--mn-light-200)' }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 sm:py-4">
          <div className="flex items-center gap-3 sm:gap-4">

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                showFilters || hasActiveFilters
                  ? 'text-white shadow-md'
                  : 'border text-gray-600 hover:bg-gray-50'
              }`}
              style={
                showFilters || hasActiveFilters
                  ? { background: 'var(--mn-blue)', borderColor: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }
                  : { borderColor: 'var(--mn-light-300)', fontFamily: "'Montserrat', sans-serif" }
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
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  <MapPin className="w-3 h-3" />
                  {filters.city}
                  <button onClick={() => setFilters({ ...filters, city: '' })} className="ml-0.5 hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filters.minPrice && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Min: ${Number(filters.minPrice).toLocaleString()}
                  <button onClick={() => setFilters({ ...filters, minPrice: '' })} className="ml-0.5 hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {filters.maxPrice && (
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap"
                  style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Max: ${Number(filters.maxPrice).toLocaleString()}
                  <button onClick={() => setFilters({ ...filters, maxPrice: '' })} className="ml-0.5 hover:opacity-70">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
              {hasActiveFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs font-medium hover:underline whitespace-nowrap"
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
                  <label
                    className="block text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}
                  >
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
                  <label
                    className="block text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}
                  >
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
                  <label
                    className="block text-xs font-bold uppercase tracking-wider mb-2"
                    style={{ color: 'var(--mn-dark-600)', fontFamily: "'Montserrat', sans-serif" }}
                  >
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
                    className="w-full btn-brand btn-brand-primary"
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">

        {/* Mobile count */}
        <div className="flex items-center justify-between mb-6 sm:hidden">
          <p className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
            <strong style={{ color: 'var(--mn-dark)' }}>{properties.length}</strong> casas encontradas
          </p>
        </div>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--mn-blue)' }} />
            <p className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
              Cargando propiedades…
            </p>
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20">
            <div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
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
                onClick={clearFilters}
                className="btn-brand btn-brand-outline"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
            {properties.map((property, i) => (
              <PropertyCard key={property.id} property={property} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ─── PROPERTY CARD ─── */
function PropertyCard({ property, index }: { property: Property; index: number }) {
  const mainPhoto = property.photos?.[0] || '/placeholder-house.jpg'

  return (
    <Link
      href={`/clientes/casas/${property.id}`}
      className={`card-property block group mn-animate-fade-up mn-stagger-${Math.min(index % 6 + 1, 6)}`}
    >
      {/* Image */}
      <div className="relative aspect-[16/10] overflow-hidden bg-gray-100">
        {property.photos?.length > 0 ? (
          <img
            src={mainPhoto}
            alt={property.address}
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--mn-light-200)' }}>
            <Home className="w-12 h-12" style={{ color: 'var(--mn-gray-light)' }} />
          </div>
        )}

        {/* Badges */}
        <div className="absolute top-3 left-3 flex gap-2">
          {property.is_renovated && (
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold uppercase tracking-wider text-white shadow-sm"
              style={{ background: '#16a34a', fontFamily: "'Montserrat', sans-serif" }}
            >
              Renovada
            </span>
          )}
        </div>

        {/* Price overlay */}
        <div className="absolute bottom-3 left-3">
          <span
            className="inline-block px-3 py-1.5 rounded-lg text-white text-lg font-black shadow-lg"
            style={{ background: 'rgba(0,35,61,0.85)', backdropFilter: 'blur(8px)', fontFamily: "'Montserrat', sans-serif" }}
          >
            ${property.sale_price?.toLocaleString()}
          </span>
        </div>

        {/* Photo count */}
        {property.photos?.length > 1 && (
          <div className="absolute bottom-3 right-3 px-2 py-1 rounded-md text-white text-[11px] font-semibold" style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}>
            📷 {property.photos.length}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5">
        <h3
          className="font-bold text-base mb-1 line-clamp-1 group-hover:text-[color:var(--mn-blue)] transition-colors"
          style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
        >
          {property.address}
        </h3>

        <div className="flex items-center gap-1.5 mb-4">
          <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--mn-gray)' }} />
          <span className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
            {property.city || 'Texas'}, {property.state || 'TX'}
          </span>
        </div>

        <div className="flex items-center gap-4 text-sm pt-4 border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
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
        </div>
      </div>
    </Link>
  )
}
