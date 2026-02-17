'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Search, MapPin, Bed, Bath, Square, Filter, Loader2 } from 'lucide-react'

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

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-900 text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl md:text-4xl font-bold mb-2">Casas Disponibles</h1>
          <p className="text-gray-300">
            Encuentra tu casa móvil perfecta en Texas
          </p>
        </div>
      </div>
      
      {/* Filters */}
      <div className="bg-white shadow-sm sticky top-16 z-40">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              <Filter className="w-4 h-4" />
              Filtros
            </button>
            
            <div className="flex-1 flex items-center gap-4 overflow-x-auto">
              {filters.city && (
                <span className="bg-gold-100 text-gold-800 px-3 py-1 rounded-full text-sm whitespace-nowrap">
                  {filters.city}
                </span>
              )}
              {filters.minPrice && (
                <span className="bg-gold-100 text-gold-800 px-3 py-1 rounded-full text-sm whitespace-nowrap">
                  Min: ${Number(filters.minPrice).toLocaleString()}
                </span>
              )}
              {filters.maxPrice && (
                <span className="bg-gold-100 text-gold-800 px-3 py-1 rounded-full text-sm whitespace-nowrap">
                  Max: ${Number(filters.maxPrice).toLocaleString()}
                </span>
              )}
              {(filters.city || filters.minPrice || filters.maxPrice) && (
                <button
                  onClick={clearFilters}
                  className="text-red-600 text-sm hover:underline whitespace-nowrap"
                >
                  Limpiar filtros
                </button>
              )}
            </div>
            
            <span className="text-gray-500 text-sm whitespace-nowrap">
              {properties.length} casas encontradas
            </span>
          </div>
          
          {/* Expanded Filters */}
          {showFilters && (
            <div className="mt-4 pt-4 border-t grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Ciudad</label>
                <select
                  value={filters.city}
                  onChange={e => setFilters({ ...filters, city: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="">Todas las ciudades</option>
                  {cities.map(city => (
                    <option key={city} value={city}>{city}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio mínimo</label>
                <input
                  type="number"
                  placeholder="$0"
                  value={filters.minPrice}
                  onChange={e => setFilters({ ...filters, minPrice: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Precio máximo</label>
                <input
                  type="number"
                  placeholder="Sin límite"
                  value={filters.maxPrice}
                  onChange={e => setFilters({ ...filters, maxPrice: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              
              <div className="flex items-end">
                <button
                  onClick={() => setShowFilters(false)}
                  className="w-full bg-navy-900 text-white py-2 rounded-lg hover:bg-navy-800"
                >
                  Aplicar filtros
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Properties Grid */}
      <div className="container mx-auto px-4 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
          </div>
        ) : properties.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-6xl mb-4">🏠</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">
              No hay casas disponibles
            </h3>
            <p className="text-gray-600 mb-4">
              Intenta con otros filtros o vuelve pronto para ver nuevas propiedades.
            </p>
            <button
              onClick={clearFilters}
              className="text-gold-600 hover:underline"
            >
              Limpiar filtros
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {properties.map(property => (
              <PropertyCard key={property.id} property={property} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function PropertyCard({ property }: { property: Property }) {
  const mainPhoto = property.photos?.[0] || '/placeholder-house.jpg'
  
  return (
    <Link href={`/clientes/casas/${property.id}`}>
      <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all hover:-translate-y-1 cursor-pointer">
        {/* Image */}
        <div className="relative h-48 bg-gray-200">
          {property.photos?.length > 0 ? (
            <img
              src={mainPhoto}
              alt={property.address}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gray-100">
              <span className="text-4xl">🏠</span>
            </div>
          )}
          
          {property.is_renovated && (
            <span className="absolute top-3 left-3 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded">
              RENOVADA
            </span>
          )}
        </div>
        
        {/* Content */}
        <div className="p-5">
          <div className="flex items-start justify-between mb-2">
            <div>
              <p className="text-2xl font-bold text-gold-600">
                ${property.sale_price?.toLocaleString()}
              </p>
            </div>
          </div>
          
          <h3 className="font-semibold text-navy-900 mb-1 line-clamp-1">
            {property.address}
          </h3>
          
          <div className="flex items-center gap-1 text-gray-500 text-sm mb-4">
            <MapPin className="w-3 h-3" />
            <span>{property.city || 'Texas'}, {property.state || 'TX'}</span>
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-600 pt-4 border-t">
            {property.bedrooms && (
              <div className="flex items-center gap-1">
                <Bed className="w-4 h-4" />
                <span>{property.bedrooms} hab</span>
              </div>
            )}
            {property.bathrooms && (
              <div className="flex items-center gap-1">
                <Bath className="w-4 h-4" />
                <span>{property.bathrooms} baños</span>
              </div>
            )}
            {property.square_feet && (
              <div className="flex items-center gap-1">
                <Square className="w-4 h-4" />
                <span>{property.square_feet} sqft</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  )
}


