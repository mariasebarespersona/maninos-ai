'use client'

import { useState, useEffect, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  MapPin, 
  Bed, 
  Bath, 
  Square, 
  Calendar,
  CheckCircle,
  Shield,
  FileText,
  ChevronLeft,
  ChevronRight,
  Loader2,
  DollarSign,
  Clock,
  Key,
  SlidersHorizontal,
  ArrowRight,
} from 'lucide-react'
import { calculateRTOMonthly, DEFAULT_ANNUAL_RATE } from '@/lib/rto-calculator'

interface Property {
  id: string
  address: string
  city: string
  state: string
  zip_code: string
  sale_price: number
  purchase_price: number
  bedrooms: number
  bathrooms: number
  square_feet: number
  year: number
  photos: string[]
  is_renovated: boolean
  hud_number: string
  status: string
}

// ============================================================================
// RTO SIMULATOR — lets clients see how down payment / months affect pricing
// ============================================================================
function RTOSimulator({ salePrice, propertyId }: { salePrice: number; propertyId: string }) {
  const router = useRouter()

  // Defaults: 5% down, 36 months
  const MIN_DOWN_PCT = 0
  const MAX_DOWN_PCT = 40
  const MIN_MONTHS = 12
  const MAX_MONTHS = 60
  const STEP_MONTHS = 6

  const [downPaymentPct, setDownPaymentPct] = useState(5)
  const [termMonths, setTermMonths] = useState(36)

  const downPaymentAmount = useMemo(() => Math.round(salePrice * (downPaymentPct / 100)), [salePrice, downPaymentPct])

  const rto = useMemo(() => calculateRTOMonthly({
    salePrice,
    downPayment: downPaymentAmount,
    termMonths,
  }), [salePrice, downPaymentAmount, termMonths])

  const financeAmount = rto.financeAmount
  const monthlyPayment = rto.monthlyPayment

  const handleProceedRTO = () => {
    // Save simulator params to sessionStorage so they carry through the purchase flow
    sessionStorage.setItem('maninos_rto_sim', JSON.stringify({
      down_payment_pct: downPaymentPct,
      down_payment_amount: downPaymentAmount,
      term_months: termMonths,
      monthly_payment: monthlyPayment,
      annual_rate: rto.annualRate,
      total_interest: rto.totalInterest,
      total_to_pay: rto.totalToPay,
      sale_price: salePrice,
    }))
    router.push(`/clientes/comprar/${propertyId}`)
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-2 mb-1">
        <SlidersHorizontal className="w-4 h-4 text-orange-600" />
        <h3 className="font-semibold text-navy-900 text-sm">Simulador Rent-to-Own</h3>
      </div>

      {/* Monthly display */}
      <div className="bg-orange-50 rounded-xl p-4 text-center border border-orange-200">
        <p className="text-xs text-orange-600 mb-0.5">Pago mensual estimado</p>
        <p className="text-3xl font-bold text-orange-700">
          ${monthlyPayment.toLocaleString()}<span className="text-base font-normal">/mes</span>
        </p>
        <p className="text-xs text-orange-500 mt-1">por {termMonths} meses</p>
      </div>

      {/* Down payment slider */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-gray-600">Enganche</span>
          <span className="font-semibold text-navy-900">${downPaymentAmount.toLocaleString()} ({downPaymentPct}%)</span>
        </div>
        <input
          type="range"
          min={MIN_DOWN_PCT}
          max={MAX_DOWN_PCT}
          step={1}
          value={downPaymentPct}
          onChange={(e) => setDownPaymentPct(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>0%</span>
          <span>40%</span>
        </div>
      </div>

      {/* Term months slider */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span className="text-gray-600">Plazo</span>
          <span className="font-semibold text-navy-900">{termMonths} meses</span>
        </div>
        <input
          type="range"
          min={MIN_MONTHS}
          max={MAX_MONTHS}
          step={STEP_MONTHS}
          value={termMonths}
          onChange={(e) => setTermMonths(Number(e.target.value))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-orange-500"
        />
        <div className="flex justify-between text-xs text-gray-400 mt-0.5">
          <span>12 meses</span>
          <span>60 meses</span>
        </div>
      </div>

      {/* Summary table */}
      <div className="bg-gray-50 rounded-lg p-3 space-y-2 text-sm">
        <div className="flex justify-between">
          <span className="text-gray-600">Precio de venta</span>
          <span className="font-medium">${salePrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Enganche</span>
          <span className="font-medium text-green-700">- ${downPaymentAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">A financiar</span>
          <span className="font-medium">${financeAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-600">Interés ({(rto.annualRate * 100).toFixed(0)}% anual × {(termMonths / 12).toFixed(1)} años)</span>
          <span className="font-medium text-orange-600">+ ${Math.round(rto.totalInterest).toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-t pt-2">
          <span className="text-gray-800 font-semibold">Total a pagar</span>
          <span className="font-bold text-navy-900">${Math.round(rto.totalToPay).toLocaleString()}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleProceedRTO}
        className="w-full bg-orange-600 text-white font-bold py-3.5 rounded-xl hover:bg-orange-700 transition-colors flex items-center justify-center gap-2"
      >
        Solicitar Rent-to-Own
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-xs text-gray-400 text-center leading-snug">
        *Cifras estimadas. El pago final depende de la aprobación de Maninos Capital.
      </p>
    </div>
  )
}

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const [availabilityMessage, setAvailabilityMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)

  useEffect(() => {
    fetchProperty()
  }, [params.id])

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/public/properties/${params.id}`)
      const data = await res.json()
      
      if (data.ok) {
        setProperty(data.property)
        setIsAvailable(data.is_available !== false)
        setAvailabilityMessage(data.availability_message || null)
      } else {
        router.push('/clientes/casas')
      }
    } catch (error) {
      console.error('Error:', error)
      router.push('/clientes/casas')
    } finally {
      setLoading(false)
    }
  }

  const nextPhoto = () => {
    if (property?.photos) {
      setCurrentPhotoIndex((prev) => 
        prev < property.photos.length - 1 ? prev + 1 : 0
      )
    }
  }

  const prevPhoto = () => {
    if (property?.photos) {
      setCurrentPhotoIndex((prev) => 
        prev > 0 ? prev - 1 : property.photos.length - 1
      )
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p>Propiedad no encontrada</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link 
            href="/clientes/casas" 
            className="flex items-center gap-2 text-gray-600 hover:text-navy-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver al catálogo
          </Link>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photo Gallery */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm">
              <div className="relative h-[400px] bg-gray-200">
                {property.photos?.length > 0 ? (
                  <>
                    <img
                      src={property.photos[currentPhotoIndex]}
                      alt={`${property.address} - Foto ${currentPhotoIndex + 1}`}
                      className="w-full h-full object-cover"
                    />
                    
                    {/* Navigation buttons */}
                    {property.photos.length > 1 && (
                      <>
                        <button
                          onClick={prevPhoto}
                          className="absolute left-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                        >
                          <ChevronLeft className="w-6 h-6" />
                        </button>
                        <button
                          onClick={nextPhoto}
                          className="absolute right-4 top-1/2 -translate-y-1/2 bg-black/50 text-white p-2 rounded-full hover:bg-black/70"
                        >
                          <ChevronRight className="w-6 h-6" />
                        </button>
                        
                        {/* Photo counter */}
                        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-black/50 text-white px-3 py-1 rounded-full text-sm">
                          {currentPhotoIndex + 1} / {property.photos.length}
                        </div>
                      </>
                    )}
                  </>
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-gray-100">
                    <span className="text-6xl">🏠</span>
                  </div>
                )}
                
                {!isAvailable && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <span className="bg-red-600 text-white font-bold text-2xl px-6 py-3 rounded-lg transform -rotate-12 shadow-lg">
                      {property.status === 'sold' ? 'VENDIDA' : 'RESERVADA'}
                    </span>
                  </div>
                )}
                
                {isAvailable && property.is_renovated && (
                  <span className="absolute top-4 left-4 bg-green-500 text-white font-bold px-3 py-1 rounded">
                    RENOVADA
                  </span>
                )}
              </div>
              
              {/* Photo thumbnails */}
              {property.photos?.length > 1 && (
                <div className="p-4 flex gap-2 overflow-x-auto">
                  {property.photos.map((photo, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentPhotoIndex(index)}
                      className={`flex-shrink-0 w-20 h-20 rounded-lg overflow-hidden border-2 ${
                        index === currentPhotoIndex ? 'border-gold-500' : 'border-transparent'
                      }`}
                    >
                      <img
                        src={photo}
                        alt={`Thumbnail ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            {/* Property Info */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-navy-900 mb-2">
                {property.address}
              </h1>
              
              <div className="flex items-center gap-2 text-gray-600 mb-6">
                <MapPin className="w-4 h-4" />
                <span>{property.city || 'Texas'}, {property.state || 'TX'} {property.zip_code}</span>
              </div>
              
              {/* Features */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-6 border-y">
                {property.bedrooms && (
                  <div className="text-center">
                    <Bed className="w-6 h-6 mx-auto text-gold-600 mb-2" />
                    <p className="font-bold text-navy-900">{property.bedrooms}</p>
                    <p className="text-sm text-gray-500">Habitaciones</p>
                  </div>
                )}
                {property.bathrooms && (
                  <div className="text-center">
                    <Bath className="w-6 h-6 mx-auto text-gold-600 mb-2" />
                    <p className="font-bold text-navy-900">{property.bathrooms}</p>
                    <p className="text-sm text-gray-500">Baños</p>
                  </div>
                )}
                {property.square_feet && (
                  <div className="text-center">
                    <Square className="w-6 h-6 mx-auto text-gold-600 mb-2" />
                    <p className="font-bold text-navy-900">{property.square_feet}</p>
                    <p className="text-sm text-gray-500">Pies cuadrados</p>
                  </div>
                )}
                {property.year && (
                  <div className="text-center">
                    <Calendar className="w-6 h-6 mx-auto text-gold-600 mb-2" />
                    <p className="font-bold text-navy-900">{property.year}</p>
                    <p className="text-sm text-gray-500">Año</p>
                  </div>
                )}
              </div>
              
              {/* Details */}
              <div className="mt-6">
                <h3 className="font-semibold text-navy-900 mb-4">Detalles de la propiedad</h3>
                <div className="grid md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Tipo</span>
                    <span className="font-medium">Casa Móvil</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Estado</span>
                    <span className="font-medium">Texas</span>
                  </div>
                  {property.hud_number && (
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-gray-600">HUD Number</span>
                      <span className="font-medium">{property.hud_number}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Condición</span>
                    <span className="font-medium text-green-600">
                      {property.is_renovated ? 'Renovada' : 'Original'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          {/* Sidebar - Purchase Card */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24 space-y-5">
              <div className="text-center">
                <p className="text-gray-500 text-sm">Precio de venta</p>
                <p className="text-4xl font-bold text-gold-600">
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>
              
              {isAvailable ? (
                <>
                  {/* Contado CTA */}
                  <Link
                    href={`/clientes/comprar/${property.id}`}
                    className="block w-full bg-gold-500 text-navy-900 text-center font-bold py-3.5 rounded-xl hover:bg-gold-400 transition-colors"
                  >
                    💵 Comprar al Contado
                  </Link>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-gray-200" />
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="bg-white px-3 text-gray-400">o simula tu Rent-to-Own</span>
                    </div>
                  </div>

                  {/* RTO Simulator */}
                  <RTOSimulator salePrice={property.sale_price} propertyId={property.id} />
                </>
              ) : (
                <>
                  {/* SOLD / RESERVED badge */}
                  <div className="bg-red-50 border-2 border-red-200 rounded-lg p-4 text-center">
                    <div className="text-3xl mb-2">
                      {property.status === 'sold' ? '🏷️' : '⏳'}
                    </div>
                    <p className="font-bold text-red-700 text-lg">
                      {property.status === 'sold' ? 'VENDIDA' : 'RESERVADA'}
                    </p>
                    <p className="text-red-600 text-sm mt-1">
                      {property.status === 'sold' 
                        ? 'Esta propiedad ya ha sido vendida.' 
                        : 'Esta propiedad tiene una venta en proceso.'}
                    </p>
                  </div>
                  
                  <Link
                    href="/clientes/casas"
                    className="block w-full bg-navy-800 text-white text-center font-bold py-4 rounded-lg hover:bg-navy-700 transition-colors"
                  >
                    Ver Otras Casas Disponibles
                  </Link>
                </>
              )}
              
              {/* Trust badges */}
              <div className="space-y-3 pt-4 border-t">
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  <span>Casa inspeccionada y verificada</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <Shield className="w-5 h-5 text-green-500" />
                  <span>Dos opciones de pago seguras</span>
                </div>
                <div className="flex items-center gap-3 text-sm text-gray-600">
                  <FileText className="w-5 h-5 text-green-500" />
                  <span>Título transferido a tu nombre</span>
                </div>
              </div>
              
              {/* Contact */}
              <div className="mt-4 pt-4 border-t text-center">
                <p className="text-sm text-gray-500 mb-2">¿Tienes preguntas?</p>
                <p className="font-semibold text-navy-900">(832) 745-9600</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

