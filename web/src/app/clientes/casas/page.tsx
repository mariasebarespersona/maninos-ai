'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  Search, MapPin, Bed, Bath, Square, X,
  SlidersHorizontal, ChevronDown, Home, Heart, RefreshCw
} from 'lucide-react'

const AUTO_REFRESH_MS = 2 * 60 * 1000  // Poll every 2 minutes

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
  is_partner?: boolean
  partner_name?: string
  source_url?: string
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
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [newCount, setNewCount] = useState(0)          // Number of new listings detected
  const [isRefreshing, setIsRefreshing] = useState(false)
  const prevIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => { fetchCities() }, [])
  useEffect(() => { fetchProperties() }, [filters])

  // ── Auto-refresh: poll every 2 minutes for new listings ──
  useEffect(() => {
    const interval = setInterval(() => {
      silentRefresh()
    }, AUTO_REFRESH_MS)
    return () => clearInterval(interval)
  }, [filters])

  const fetchCities = async () => {
    try {
      const res = await fetch('/api/public/properties/cities/list')
      const data = await res.json()
      if (data.ok) setCities(data.cities)
    } catch (error) { console.error('Error fetching cities:', error) }
  }

  const doFetch = useCallback(async (): Promise<Property[]> => {
    const params = new URLSearchParams()
    if (filters.city) params.set('city', filters.city)
    if (filters.minPrice) params.set('min_price', filters.minPrice)
    if (filters.maxPrice) params.set('max_price', filters.maxPrice)

    const [ownRes, partnerRes] = await Promise.all([
      fetch(`/api/public/properties?${params}`),
      fetch(`/api/public/properties/partners?${params}`),
    ])
    const ownData = await ownRes.json()
    const partnerData = await partnerRes.json()

    const all: Property[] = []
    if (ownData.ok) all.push(...(ownData.properties || []))
    if (partnerData.ok) all.push(...(partnerData.properties || []))
    all.sort((a, b) => (a.sale_price || 0) - (b.sale_price || 0))
    return all
  }, [filters])

  const fetchProperties = async () => {
    setLoading(true)
    try {
      const all = await doFetch()
      prevIdsRef.current = new Set(all.map(p => p.id))
      setProperties(all)
      setLastUpdated(new Date())
      setNewCount(0)
    } catch (error) { console.error('Error fetching properties:', error) }
    finally { setLoading(false) }
  }

  /** Silent background refresh — doesn't show loading skeleton */
  const silentRefresh = async () => {
    try {
      const all = await doFetch()
      const newIds = all.filter(p => !prevIdsRef.current.has(p.id))
      if (newIds.length > 0) {
        setNewCount(newIds.length)
      }
      // Always update the list silently
      prevIdsRef.current = new Set(all.map(p => p.id))
      setProperties(all)
      setLastUpdated(new Date())
    } catch { /* silent fail */ }
  }

  /** Manual refresh triggered by user */
  const manualRefresh = async () => {
    setIsRefreshing(true)
    setNewCount(0)
    try {
      const all = await doFetch()
      prevIdsRef.current = new Set(all.map(p => p.id))
      setProperties(all)
      setLastUpdated(new Date())
    } catch (error) { console.error('Error refreshing:', error) }
    finally { setTimeout(() => setIsRefreshing(false), 600) }
  }

  const clearFilters = () => setFilters({ city: '', minPrice: '', maxPrice: '' })
  const hasActiveFilters = filters.city || filters.minPrice || filters.maxPrice

  const timeAgo = lastUpdated ? formatTimeAgo(lastUpdated) : null

  return (
    <div className="min-h-screen bg-white">

      {/* ── NEW LISTINGS BANNER ── */}
      {newCount > 0 && (
        <div
          className="sticky top-16 sm:top-20 z-50 bg-[#004274] text-white text-center py-2.5 cursor-pointer hover:bg-[#00233d] transition-colors"
          onClick={() => { manualRefresh() }}
        >
          <span className="text-[13px] font-medium">
            {newCount === 1 ? '1 casa nueva disponible' : `${newCount} casas nuevas disponibles`} — Toca para actualizar
          </span>
        </div>
      )}

      {/* ── FILTER BAR ── Sticky, clean, Airbnb-style */}
      <div className={`sticky ${newCount > 0 ? 'top-[104px] sm:top-[120px]' : 'top-16 sm:top-20'} z-40 bg-white border-b border-gray-200`}>
        <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10 py-3">
          <div className="flex items-center gap-3">

            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-[13px] font-semibold border transition-all ${
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
                <button onClick={clearFilters} className="text-[12px] font-semibold text-[#222] underline whitespace-nowrap">
                  Limpiar
                </button>
              )}
            </div>

            {/* Count + refresh */}
            <div className="flex items-center gap-2.5 shrink-0">
              <button
                onClick={manualRefresh}
                disabled={isRefreshing}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors text-[#717171] hover:text-[#222] disabled:opacity-50"
                title="Actualizar"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
              <div className="text-right hidden sm:block">
                <span className="text-[13px] whitespace-nowrap text-[#717171] block leading-tight">
                  <strong className="text-[#222] font-semibold">{properties.length}</strong> casas
                </span>
                {timeAgo && (
                  <span className="text-[11px] text-[#b0b0b0] whitespace-nowrap block leading-tight">
                    Actualizado {timeAgo}
                  </span>
                )}
              </div>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in-up pb-1">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-[12px] font-semibold text-[#717171] mb-1.5 uppercase tracking-wide">Ciudad</label>
                  <div className="relative">
                    <select
                      value={filters.city}
                      onChange={e => setFilters({ ...filters, city: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-[14px] appearance-none pr-10 focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                    >
                      <option value="">Todas</option>
                      {cities.map(city => <option key={city} value={city}>{city}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#717171] mb-1.5 uppercase tracking-wide">Precio mínimo</label>
                  <input
                    type="number" placeholder="$0"
                    value={filters.minPrice}
                    onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-[12px] font-semibold text-[#717171] mb-1.5 uppercase tracking-wide">Precio máximo</label>
                  <input
                    type="number" placeholder="Sin límite"
                    value={filters.maxPrice}
                    onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-gray-300 bg-white text-[14px] focus:outline-none focus:ring-2 focus:ring-[#222] focus:border-transparent"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={() => setShowFilters(false)}
                    className="w-full px-6 py-3 rounded-xl text-white font-semibold text-[14px] bg-[#222] hover:bg-black transition-colors"
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
          <h1 className="text-[24px] sm:text-[28px] font-bold text-[#222] mb-6" style={{ letterSpacing: '-0.025em' }}>
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

/** Format a Date to relative "hace X min/seg" string */
function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000)
  if (seconds < 10) return 'ahora'
  if (seconds < 60) return `hace ${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `hace ${minutes} min`
  const hours = Math.floor(minutes / 60)
  return `hace ${hours}h`
}

function FilterPill({ label, icon, onRemove }: { label: string; icon?: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap bg-gray-100 text-[#222]">
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
      <h3 className="text-[18px] font-semibold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>No hay casas disponibles</h3>
      <p className="text-[15px] text-[#717171] mb-6">Intenta con otros filtros o vuelve pronto.</p>
      {hasActiveFilters && (
        <button
          onClick={onClear}
          className="px-6 py-3 rounded-xl font-semibold text-[14px] text-[#222] border border-[#222] hover:bg-gray-50 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>
  )
}

function PropertyGrid({ properties }: { properties: Property[] }) {
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-x-6 gap-y-10">
      {properties.map((property) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const mainPhoto = property.photos?.[0]
  const [imgLoaded, setImgLoaded] = useState(false)

  // Partner properties link to their external source, Maninos properties go to detail page
  const href = property.is_partner && property.source_url
    ? property.source_url
    : `/clientes/casas/${property.id}`
  const linkProps = property.is_partner && property.source_url
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {}

  return (
    <Link href={href} {...linkProps} className="group block">
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
          <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[#222] text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm">
            Renovada
          </span>
        )}

        {/* Partner badge */}
        {property.is_partner && property.partner_name && (
          <span className="absolute top-3 left-3 bg-[#004274]/90 backdrop-blur-sm text-white text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md shadow-sm">
            {property.partner_name}
          </span>
        )}

        {/* Photo count */}
        {property.photos?.length > 1 && (
          <span className="absolute bottom-3 right-3 bg-black/50 text-white text-[11px] font-medium px-2 py-0.5 rounded-md backdrop-blur-sm" style={{ fontVariantNumeric: 'tabular-nums' }}>
            1/{property.photos.length}
          </span>
        )}
      </div>

      {/* Content — Airbnb-style, tight spacing */}
      <div>
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[15px] text-[#222] leading-snug" style={{ letterSpacing: '-0.01em' }}>
            {property.city || 'Texas'}, {property.state || 'TX'}
          </h3>
        </div>
        <p className="text-[13px] text-[#717171] leading-snug">{property.address}</p>

        {/* Features inline */}
        <div className="flex items-center gap-2 text-[13px] text-[#717171] mt-0.5">
          {property.bedrooms > 0 && <span>{property.bedrooms} hab</span>}
          {property.bedrooms > 0 && property.bathrooms > 0 && <span>·</span>}
          {property.bathrooms > 0 && <span>{property.bathrooms} baños</span>}
          {(property.bedrooms > 0 || property.bathrooms > 0) && property.square_feet > 0 && <span>·</span>}
          {property.square_feet > 0 && <span>{property.square_feet} sqft</span>}
        </div>

        <p className="font-bold text-[15px] text-[#222] mt-1" style={{ letterSpacing: '-0.01em', fontVariantNumeric: 'tabular-nums' }}>
          ${property.sale_price?.toLocaleString()}
        </p>
      </div>
    </Link>
  )
}
