'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useInView } from '@/hooks/useInView'
import { 
  ArrowLeft, MapPin, Bed, Bath, Square, Calendar,
  CheckCircle, Shield, FileText, ChevronLeft, ChevronRight,
  Loader2, DollarSign, Clock, SlidersHorizontal, ArrowRight,
  Phone, MessageCircle, Home, X, Maximize2, Sparkles
} from 'lucide-react'
import { calculateRTOMonthly, DEFAULT_ANNUAL_RATE } from '@/lib/rto-calculator'

/* Property Detail — Clean gallery + professional layout */

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

// ────────────────────────────────────────────────────────────────
// RTO SIMULATOR
// ────────────────────────────────────────────────────────────────
function RTOSimulator({ salePrice, propertyId }: { salePrice: number; propertyId: string }) {
  const router = useRouter()
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
        <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--mn-gold)' }} />
        <h3 className="font-bold text-sm" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
          Simulador Rent-to-Own
        </h3>
      </div>

      {/* Monthly display — gradient accent */}
      <div
        className="rounded-xl p-5 text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--mn-blue-50) 0%, #e0ecf7 100%)', border: '1px solid var(--mn-blue-100)' }}
      >
        <div className="absolute top-0 right-0 w-20 h-20 pointer-events-none" style={{ background: 'radial-gradient(circle at 100% 0%, rgba(163,141,72,0.1), transparent 70%)' }} />
        <p className="text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
          Pago mensual estimado
        </p>
        <p className="text-3xl font-black relative z-10" style={{ color: 'var(--mn-blue-dark)', fontFamily: "'Montserrat', sans-serif" }}>
          ${monthlyPayment.toLocaleString()}
          <span className="text-base font-normal" style={{ color: 'var(--mn-gray)' }}>/mes</span>
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--mn-gray)' }}>
          por {termMonths} meses
        </p>
      </div>

      {/* Down payment slider */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>Enganche</span>
          <span className="font-bold" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            ${downPaymentAmount.toLocaleString()} ({downPaymentPct}%)
          </span>
        </div>
        <input
          type="range"
          min={MIN_DOWN_PCT}
          max={MAX_DOWN_PCT}
          step={1}
          value={downPaymentPct}
          onChange={(e) => setDownPaymentPct(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: 'var(--mn-blue)' }}
        />
        <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--mn-gray-light)' }}>
          <span>0%</span><span>40%</span>
        </div>
      </div>

      {/* Term months slider */}
      <div>
        <div className="flex justify-between text-sm mb-1.5">
          <span style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>Plazo</span>
          <span className="font-bold" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>
            {termMonths} meses
          </span>
        </div>
        <input
          type="range"
          min={MIN_MONTHS}
          max={MAX_MONTHS}
          step={STEP_MONTHS}
          value={termMonths}
          onChange={(e) => setTermMonths(Number(e.target.value))}
          className="w-full h-2 rounded-lg appearance-none cursor-pointer"
          style={{ accentColor: 'var(--mn-blue)' }}
        />
        <div className="flex justify-between text-xs mt-0.5" style={{ color: 'var(--mn-gray-light)' }}>
          <span>12 meses</span><span>60 meses</span>
        </div>
      </div>

      {/* Summary table */}
      <div className="rounded-xl p-4 space-y-2.5 text-sm" style={{ background: 'var(--mn-light)' }}>
        <div className="flex justify-between">
          <span style={{ color: 'var(--mn-gray)' }}>Precio de venta</span>
          <span className="font-semibold" style={{ color: 'var(--mn-dark)' }}>${salePrice.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--mn-gray)' }}>Enganche</span>
          <span className="font-semibold" style={{ color: '#16a34a' }}>- ${downPaymentAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--mn-gray)' }}>A financiar</span>
          <span className="font-semibold" style={{ color: 'var(--mn-dark)' }}>${financeAmount.toLocaleString()}</span>
        </div>
        <div className="flex justify-between">
          <span style={{ color: 'var(--mn-gray)' }}>Interés ({(rto.annualRate * 100).toFixed(0)}% × {(termMonths / 12).toFixed(1)} años)</span>
          <span className="font-semibold" style={{ color: 'var(--mn-gold-dark)' }}>+ ${Math.round(rto.totalInterest).toLocaleString()}</span>
        </div>
        <div className="flex justify-between border-t pt-2.5" style={{ borderColor: 'var(--mn-light-300)' }}>
          <span className="font-bold" style={{ color: 'var(--mn-dark)' }}>Total a pagar</span>
          <span className="font-black" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
            ${Math.round(rto.totalToPay).toLocaleString()}
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleProceedRTO}
        className="group w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-bold text-base transition-all duration-300 hover:shadow-lg hover:translate-y-[-1px]"
        style={{ background: 'linear-gradient(135deg, var(--mn-blue) 0%, var(--mn-blue-dark) 100%)', fontFamily: "'Montserrat', sans-serif" }}
      >
        Solicitar Rent-to-Own
        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
      </button>

      <p className="text-xs text-center leading-snug" style={{ color: 'var(--mn-gray)' }}>
        *Cifras estimadas. El pago final depende de la aprobación de Maninos Capital.
      </p>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// FULLSCREEN LIGHTBOX
// ────────────────────────────────────────────────────────────────
function Lightbox({ photos, startIndex, onClose }: { photos: string[]; startIndex: number; onClose: () => void }) {
  const [index, setIndex] = useState(startIndex)

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    if (e.key === 'ArrowRight') setIndex(i => i < photos.length - 1 ? i + 1 : 0)
    if (e.key === 'ArrowLeft') setIndex(i => i > 0 ? i - 1 : photos.length - 1)
  }, [photos.length, onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [handleKey])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center mn-animate-fade-up" style={{ background: 'rgba(0,15,30,0.95)' }}>
      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <X className="w-6 h-6" />
      </button>

      <button
        onClick={() => setIndex(i => i > 0 ? i - 1 : photos.length - 1)}
        className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <ChevronLeft className="w-6 h-6" />
      </button>
      
      <button
        onClick={() => setIndex(i => i < photos.length - 1 ? i + 1 : 0)}
        className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full flex items-center justify-center text-white/70 hover:text-white transition-colors"
        style={{ background: 'rgba(255,255,255,0.1)' }}
      >
        <ChevronRight className="w-6 h-6" />
      </button>

      <img
        src={photos[index]}
        alt={`Photo ${index + 1}`}
        className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
      />

      <div
        className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full text-white text-sm font-semibold"
        style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)' }}
      >
        {index + 1} / {photos.length}
      </div>
    </div>
  )
}

// ────────────────────────────────────────────────────────────────
// MAIN PAGE
// ────────────────────────────────────────────────────────────────
export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  const { ref: infoRef, isInView: infoVisible } = useInView({ rootMargin: '0px 0px -80px 0px' })

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
    if (property?.photos) setCurrentPhotoIndex(prev => prev < property.photos.length - 1 ? prev + 1 : 0)
  }
  const prevPhoto = () => {
    if (property?.photos) setCurrentPhotoIndex(prev => prev > 0 ? prev - 1 : property.photos.length - 1)
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--mn-blue)' }} />
        <p className="text-sm" style={{ color: 'var(--mn-gray)' }}>Cargando propiedad…</p>
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p style={{ color: 'var(--mn-gray)' }}>Propiedad no encontrada</p>
      </div>
    )
  }

  const hasPhotos = property.photos && property.photos.length > 0

  return (
    <div className="min-h-screen" style={{ background: 'var(--mn-light)' }}>

      {/* Lightbox */}
      {lightboxOpen && hasPhotos && (
        <Lightbox
          photos={property.photos}
          startIndex={currentPhotoIndex}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {/* ═══════════ IMMERSIVE GALLERY — Full-bleed ═══════════ */}
      <section className="relative bg-black">
        {/* Breadcrumb overlay */}
        <div className="absolute top-0 left-0 right-0 z-20 p-4 sm:p-6">
          <Link
            href="/clientes/casas"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-semibold transition-all hover:scale-[1.02]"
            style={{ background: 'rgba(0,35,61,0.5)', backdropFilter: 'blur(8px)', fontFamily: "'Montserrat', sans-serif" }}
          >
            <ArrowLeft className="w-4 h-4" />
            Catálogo
          </Link>
        </div>

        {/* Main photo */}
        <div
          className="relative w-full aspect-[16/9] sm:aspect-[21/9] overflow-hidden cursor-pointer group"
          onClick={() => { if (hasPhotos) setLightboxOpen(true) }}
        >
          {hasPhotos ? (
            <>
              <img
                src={property.photos[currentPhotoIndex]}
                alt={`${property.address} - Foto ${currentPhotoIndex + 1}`}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.02]"
              />
              {/* Hover fullscreen hint */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors duration-300 flex items-center justify-center">
                <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-white/90 rounded-full p-3 shadow-lg">
                  <Maximize2 className="w-5 h-5" style={{ color: 'var(--mn-dark)' }} />
                </div>
              </div>
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center" style={{ background: 'var(--mn-light-200)' }}>
              <Home className="w-20 h-20" style={{ color: 'var(--mn-gray-light)' }} />
            </div>
          )}

          {/* Gallery nav arrows */}
          {hasPhotos && property.photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto() }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 z-10"
                style={{ background: 'rgba(0,35,61,0.5)', backdropFilter: 'blur(4px)' }}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto() }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full flex items-center justify-center text-white transition-all hover:scale-110 z-10"
                style={{ background: 'rgba(0,35,61,0.5)', backdropFilter: 'blur(4px)' }}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </>
          )}

          {/* Photo counter */}
          {hasPhotos && property.photos.length > 1 && (
            <div
              className="absolute bottom-4 right-4 px-3 py-1.5 rounded-lg text-white text-xs font-semibold z-10"
              style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}
            >
              📷 {currentPhotoIndex + 1} / {property.photos.length}
            </div>
          )}

          {/* Not available overlay */}
          {!isAvailable && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
              <span
                className="text-white font-black text-2xl sm:text-3xl px-8 py-4 rounded-2xl shadow-2xl transform -rotate-3"
                style={{ background: 'var(--mn-blue-dark)', fontFamily: "'Montserrat', sans-serif" }}
              >
                {property.status === 'sold' ? 'VENDIDA' : 'RESERVADA'}
              </span>
            </div>
          )}

          {/* Renovated badge */}
          {isAvailable && property.is_renovated && (
            <span
              className="absolute top-20 sm:top-6 left-4 sm:left-6 text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg shadow-lg z-10"
              style={{ background: '#16a34a', fontFamily: "'Montserrat', sans-serif" }}
            >
              ✓ Renovada
            </span>
          )}

          {/* Bottom gradient */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
        </div>

        {/* Thumbnail strip — horizontal scroll with surprising hover */}
        {hasPhotos && property.photos.length > 1 && (
          <div className="bg-black/50 px-4 py-3 flex gap-2 overflow-x-auto no-scrollbar">
            {property.photos.map((photo, index) => (
              <button
                key={index}
                onClick={() => setCurrentPhotoIndex(index)}
                className={`flex-shrink-0 w-16 h-12 sm:w-20 sm:h-14 rounded-lg overflow-hidden transition-all duration-300 ${
                  index === currentPhotoIndex
                    ? 'ring-2 ring-offset-1 ring-offset-black ring-[#c4af6a] scale-95'
                    : 'opacity-50 hover:opacity-100 hover:scale-105'
                }`}
              >
                <img src={photo} alt={`Thumb ${index + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ═══════════ OVERLAPPING PRICE STRIP ═══════════ */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-8">
        <div
          className="inline-flex items-center gap-4 px-6 py-4 rounded-2xl shadow-xl mn-animate-fade-up"
          style={{
            background: 'white',
            border: '1px solid var(--mn-light-200)',
          }}
        >
          <div>
            <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--mn-gray)', fontFamily: "'Montserrat', sans-serif" }}>
              Precio de venta
            </p>
            <p className="text-3xl sm:text-4xl font-black" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
              ${property.sale_price?.toLocaleString()}
            </p>
          </div>
          {property.is_renovated && (
            <div className="h-12 w-px" style={{ background: 'var(--mn-light-300)' }} />
          )}
          {property.is_renovated && (
            <div className="flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" style={{ color: 'var(--mn-gold)' }} />
              <span className="text-sm font-semibold" style={{ color: 'var(--mn-gold-dark)', fontFamily: "'Montserrat'" }}>
                Renovada
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ═══════════ CONTENT GRID ═══════════ */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
        <div className="grid lg:grid-cols-3 gap-8">

          {/* ────── LEFT — Property info ────── */}
          <div
            ref={infoRef}
            className="lg:col-span-2 space-y-6"
            style={{
              opacity: infoVisible ? 1 : 0,
              transform: infoVisible ? 'translateY(0)' : 'translateY(30px)',
              transition: 'all 0.7s cubic-bezier(0.16,1,0.3,1)',
            }}
          >
            {/* Address + Location */}
            <div className="bg-white rounded-2xl p-6 sm:p-8 shadow-sm" style={{ border: '1px solid var(--mn-light-200)' }}>
              <h1
                className="text-2xl sm:text-3xl font-black mb-2 leading-tight"
                style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
              >
                {property.address}
              </h1>
              <div className="flex items-center gap-2 mb-8">
                <MapPin className="w-4 h-4" style={{ color: 'var(--mn-gray)' }} />
                <span style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                  {property.city || 'Texas'}, {property.state || 'TX'} {property.zip_code}
                </span>
              </div>

              {/* Feature boxes — icon boxes with blue accent */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 py-6 border-y" style={{ borderColor: 'var(--mn-light-200)' }}>
                {property.bedrooms > 0 && (
                  <FeatureBox icon={<Bed className="w-6 h-6" />} value={property.bedrooms} label="Habitaciones" />
                )}
                {property.bathrooms > 0 && (
                  <FeatureBox icon={<Bath className="w-6 h-6" />} value={property.bathrooms} label="Baños" />
                )}
                {property.square_feet > 0 && (
                  <FeatureBox icon={<Square className="w-6 h-6" />} value={property.square_feet} label="Pies²" />
                )}
                {property.year > 0 && (
                  <FeatureBox icon={<Calendar className="w-6 h-6" />} value={property.year} label="Año" />
                )}
              </div>

              {/* Details Table */}
              <div className="mt-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="h-px w-6" style={{ background: 'var(--mn-gold)' }} />
                  <h3
                    className="font-bold text-sm uppercase tracking-wider"
                    style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    Detalles
                  </h3>
                </div>
                <div className="grid sm:grid-cols-2 gap-x-8 gap-y-0">
                  {[
                    { label: 'Tipo', value: 'Casa Móvil' },
                    { label: 'Estado', value: 'Texas' },
                    ...(property.hud_number ? [{ label: 'HUD Number', value: property.hud_number }] : []),
                    { label: 'Condición', value: property.is_renovated ? 'Renovada' : 'Original', color: property.is_renovated ? '#16a34a' : undefined },
                  ].map((item) => (
                    <div key={item.label} className="flex justify-between py-3 border-b" style={{ borderColor: 'var(--mn-light-200)' }}>
                      <span className="text-sm" style={{ color: 'var(--mn-gray)' }}>{item.label}</span>
                      <span className="text-sm font-semibold" style={{ color: item.color || 'var(--mn-dark)', fontFamily: "'Mulish', sans-serif" }}>
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ────── RIGHT — SIDEBAR ────── */}
          <div className="lg:col-span-1">
            <div
              className="bg-white rounded-2xl p-6 shadow-sm sticky top-24 space-y-6 overflow-hidden"
              style={{ border: '1px solid var(--mn-light-200)' }}
            >
              {/* Price (mobile — hidden on desktop since overlapping strip shows it) */}
              <div className="text-center pb-5 border-b lg:hidden" style={{ borderColor: 'var(--mn-light-200)' }}>
                <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: 'var(--mn-gray)', fontFamily: "'Montserrat', sans-serif" }}>
                  Precio de venta
                </p>
                <p className="text-4xl font-black" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>

              {isAvailable ? (
                <>
                  {/* Contado CTA */}
                  <Link
                    href={`/clientes/comprar/${property.id}`}
                    className="group block w-full text-center px-6 py-3.5 rounded-xl text-white font-bold text-base transition-all duration-300 hover:shadow-lg hover:translate-y-[-1px]"
                    style={{ background: 'linear-gradient(135deg, var(--mn-gold) 0%, var(--mn-gold-dark) 100%)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    💵 Comprar al Contado
                  </Link>

                  {/* Divider */}
                  <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t" style={{ borderColor: 'var(--mn-light-300)' }} />
                    </div>
                    <div className="relative flex justify-center text-xs">
                      <span className="px-3" style={{ background: 'white', color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                        o simula tu Rent-to-Own
                      </span>
                    </div>
                  </div>

                  {/* RTO Simulator */}
                  <RTOSimulator salePrice={property.sale_price} propertyId={property.id} />
                </>
              ) : (
                <>
                  <div className="rounded-xl p-5 text-center" style={{ background: 'var(--mn-light)', border: '1.5px solid var(--mn-light-300)' }}>
                    <div className="text-3xl mb-2">
                      {property.status === 'sold' ? '🏷️' : '⏳'}
                    </div>
                    <p className="font-black text-lg" style={{ color: 'var(--mn-blue-dark)', fontFamily: "'Montserrat', sans-serif" }}>
                      {property.status === 'sold' ? 'VENDIDA' : 'RESERVADA'}
                    </p>
                    <p className="text-sm mt-1" style={{ color: 'var(--mn-gray)' }}>
                      {property.status === 'sold'
                        ? 'Esta propiedad ya ha sido vendida.'
                        : 'Esta propiedad tiene una venta en proceso.'}
                    </p>
                  </div>
                  <Link
                    href="/clientes/casas"
                    className="block w-full text-center px-6 py-3.5 rounded-xl text-white font-bold transition-all duration-200 hover:shadow-lg"
                    style={{ background: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    Ver Otras Casas Disponibles
                  </Link>
                </>
              )}

              {/* Trust badges */}
              <div className="space-y-3 pt-5 border-t" style={{ borderColor: 'var(--mn-light-200)' }}>
                {[
                  { icon: CheckCircle, text: 'Casa inspeccionada y verificada' },
                  { icon: Shield, text: 'Dos opciones de pago seguras' },
                  { icon: FileText, text: 'Título transferido a tu nombre' },
                ].map((item) => (
                  <div key={item.text} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 flex-shrink-0" style={{ color: '#16a34a' }} />
                    <span className="text-sm" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>{item.text}</span>
                  </div>
                ))}
              </div>

              {/* Contact */}
              <div className="pt-5 border-t text-center space-y-3" style={{ borderColor: 'var(--mn-light-200)' }}>
                <p className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--mn-gray)', fontFamily: "'Montserrat', sans-serif" }}>
                  ¿Tienes preguntas?
                </p>
                <div className="flex gap-2">
                  <a
                    href="tel:8327459600"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 hover:shadow-md"
                    style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    <Phone className="w-4 h-4" />
                    Llamar
                  </a>
                  <a
                    href={`https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20la%20casa%20en%20${encodeURIComponent(property.address)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold text-white transition-all duration-200 hover:shadow-md"
                    style={{ background: '#25d366', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    <MessageCircle className="w-4 h-4" />
                    WhatsApp
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ─── Feature Box Component ─── */
function FeatureBox({ icon, value, label }: { icon: React.ReactNode; value: string | number; label: string }) {
  return (
    <div className="text-center group">
      <div
        className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-2 transition-transform duration-200 group-hover:scale-105"
        style={{ background: 'var(--mn-blue-50)', color: 'var(--mn-blue)' }}
      >
        {icon}
      </div>
      <p className="font-black text-lg" style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}>{value}</p>
      <p className="text-xs" style={{ color: 'var(--mn-gray)' }}>{label}</p>
    </div>
  )
}
