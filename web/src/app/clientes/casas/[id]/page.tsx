'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Bed, Bath, Square, Calendar,
  CheckCircle, Shield, FileText, ChevronLeft, ChevronRight,
  Loader2, DollarSign, Clock, SlidersHorizontal, ArrowRight,
  Phone, MessageCircle, Home, X, Maximize2, LayoutGrid
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

/* ────────────────────────────────────────────────────────────────
   RTO SIMULATOR — Clean, minimal, inside a card
   ──────────────────────────────────────────────────────────────── */
function RTOSimulator({ salePrice, propertyId }: { salePrice: number; propertyId: string }) {
  const router = useRouter()
  const [downPaymentPct, setDownPaymentPct] = useState(5)
  const [termMonths, setTermMonths] = useState(36)

  const downPaymentAmount = useMemo(() => Math.round(salePrice * (downPaymentPct / 100)), [salePrice, downPaymentPct])

  const rto = useMemo(() => calculateRTOMonthly({
    salePrice,
    downPayment: downPaymentAmount,
    termMonths,
  }), [salePrice, downPaymentAmount, termMonths])

  const handleProceedRTO = () => {
    sessionStorage.setItem('maninos_rto_sim', JSON.stringify({
      down_payment_pct: downPaymentPct,
      down_payment_amount: downPaymentAmount,
      term_months: termMonths,
      monthly_payment: rto.monthlyPayment,
      annual_rate: rto.annualRate,
      total_interest: rto.totalInterest,
      total_to_pay: rto.totalToPay,
      sale_price: salePrice,
    }))
    router.push(`/clientes/comprar/${propertyId}`)
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-sm text-[#222]">Simulador Rent-to-Own</h3>
      </div>

      {/* Monthly display */}
      <div className="bg-gray-50 rounded-xl p-5 text-center">
        <p className="text-xs text-gray-500 font-medium mb-1">Pago mensual estimado</p>
        <p className="text-3xl font-bold text-[#222]">
          ${rto.monthlyPayment.toLocaleString()}
          <span className="text-base font-normal text-gray-400">/mes</span>
        </p>
        <p className="text-xs text-gray-400 mt-0.5">por {termMonths} meses</p>
      </div>

      {/* Down payment slider */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Enganche</span>
          <span className="font-semibold text-[#222]">${downPaymentAmount.toLocaleString()} ({downPaymentPct}%)</span>
        </div>
        <input
          type="range" min={0} max={40} step={1}
          value={downPaymentPct}
          onChange={(e) => setDownPaymentPct(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200"
          style={{ accentColor: '#222' }}
        />
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span>0%</span><span>40%</span>
        </div>
      </div>

      {/* Term slider */}
      <div>
        <div className="flex justify-between text-sm mb-2">
          <span className="text-gray-500">Plazo</span>
          <span className="font-semibold text-[#222]">{termMonths} meses</span>
        </div>
        <input
          type="range" min={12} max={60} step={6}
          value={termMonths}
          onChange={(e) => setTermMonths(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200"
          style={{ accentColor: '#222' }}
        />
        <div className="flex justify-between text-[11px] text-gray-400 mt-1">
          <span>12 meses</span><span>60 meses</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
        <Row label="Precio de venta" value={`$${salePrice.toLocaleString()}`} />
        <Row label="Enganche" value={`-$${downPaymentAmount.toLocaleString()}`} color="#16a34a" />
        <Row label="A financiar" value={`$${rto.financeAmount.toLocaleString()}`} />
        <Row label={`Interés (${(rto.annualRate * 100).toFixed(0)}%)`} value={`+$${Math.round(rto.totalInterest).toLocaleString()}`} color="#b5850a" />
        <div className="border-t border-gray-200 pt-2 flex justify-between">
          <span className="font-semibold text-[#222]">Total a pagar</span>
          <span className="font-bold text-[#222]">${Math.round(rto.totalToPay).toLocaleString()}</span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleProceedRTO}
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-semibold transition-colors"
        style={{ background: '#FF385C' }}
      >
        Solicitar Rent-to-Own
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-[11px] text-center text-gray-400">
        *Cifras estimadas. El pago final depende de la aprobación.
      </p>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium" style={{ color: color || '#222' }}>{value}</span>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   FULLSCREEN LIGHTBOX
   ──────────────────────────────────────────────────────────────── */
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
    return () => { document.removeEventListener('keydown', handleKey); document.body.style.overflow = '' }
  }, [handleKey])

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 animate-fade-in">
      <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <X className="w-5 h-5" />
      </button>
      <button onClick={() => setIndex(i => i > 0 ? i - 1 : photos.length - 1)} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <button onClick={() => setIndex(i => i < photos.length - 1 ? i + 1 : 0)} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors">
        <ChevronRight className="w-5 h-5" />
      </button>
      <img src={photos[index]} alt={`Photo ${index + 1}`} className="max-h-[85vh] max-w-[90vw] object-contain rounded-lg" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-black/50 text-white text-sm font-medium backdrop-blur-sm">
        {index + 1} / {photos.length}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────
   MAIN PAGE
   ──────────────────────────────────────────────────────────────── */
export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [property, setProperty] = useState<Property | null>(null)
  const [isAvailable, setIsAvailable] = useState(true)
  const [loading, setLoading] = useState(true)
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0)
  const [lightboxOpen, setLightboxOpen] = useState(false)

  useEffect(() => { fetchProperty() }, [params.id])

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/public/properties/${params.id}`)
      const data = await res.json()
      if (data.ok) {
        setProperty(data.property)
        setIsAvailable(data.is_available !== false)
      } else { router.push('/clientes/casas') }
    } catch { router.push('/clientes/casas') }
    finally { setLoading(false) }
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
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Propiedad no encontrada</p>
      </div>
    )
  }

  const hasPhotos = property.photos && property.photos.length > 0

  return (
    <div className="min-h-screen bg-white">
      {lightboxOpen && hasPhotos && (
        <Lightbox photos={property.photos} startIndex={currentPhotoIndex} onClose={() => setLightboxOpen(false)} />
      )}

      {/* ═══════════ PHOTO GALLERY — Airbnb-style grid ═══════════ */}
      <section className="relative">
        {/* Back button */}
        <div className="absolute top-4 left-4 z-20">
          <Link
            href="/clientes/casas"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white shadow-md text-sm font-medium text-[#222] hover:shadow-lg transition-shadow"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver
          </Link>
        </div>

        {hasPhotos ? (
          <>
            {/* Desktop: Airbnb-style grid (1 big + 4 small) */}
            <div className="hidden md:grid grid-cols-4 grid-rows-2 gap-2 max-h-[60vh] overflow-hidden rounded-none md:rounded-xl md:mx-6 lg:mx-10 md:mt-6">
              {/* Main photo */}
              <div
                className="col-span-2 row-span-2 relative cursor-pointer group"
                onClick={() => { setCurrentPhotoIndex(0); setLightboxOpen(true) }}
              >
                <img src={property.photos[0]} alt={property.address} className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-90" />
              </div>
              {/* 4 small photos */}
              {property.photos.slice(1, 5).map((photo, i) => (
                <div
                  key={i}
                  className="relative cursor-pointer group"
                  onClick={() => { setCurrentPhotoIndex(i + 1); setLightboxOpen(true) }}
                >
                  <img src={photo} alt={`${i + 2}`} className="w-full h-full object-cover transition-all duration-300 group-hover:brightness-90" />
                </div>
              ))}
              {/* Show all photos button */}
              {property.photos.length > 5 && (
                <button
                  className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-sm font-semibold text-[#222] shadow-md hover:shadow-lg transition-shadow"
                  onClick={() => setLightboxOpen(true)}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Mostrar {property.photos.length} fotos
                </button>
              )}
            </div>

            {/* Mobile: Single photo carousel */}
            <div className="md:hidden relative">
              <div className="aspect-[4/3] bg-gray-100" onClick={() => setLightboxOpen(true)}>
                <img src={property.photos[currentPhotoIndex]} alt={property.address} className="w-full h-full object-cover" />
              </div>
              {property.photos.length > 1 && (
                <>
                  <button onClick={(e) => { e.stopPropagation(); prevPhoto() }} className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow">
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); nextPhoto() }} className="absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/80 flex items-center justify-center shadow">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-black/50 text-white text-xs font-medium">
                    {currentPhotoIndex + 1} / {property.photos.length}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="aspect-[21/9] bg-gray-100 flex items-center justify-center">
            <Home className="w-16 h-16 text-gray-300" />
          </div>
        )}

        {/* Not available overlay */}
        {!isAvailable && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 pointer-events-none">
            <span className="text-white font-bold text-2xl px-8 py-4 rounded-2xl bg-[#222]/80 backdrop-blur-sm">
              {property.status === 'sold' ? 'VENDIDA' : 'RESERVADA'}
            </span>
          </div>
        )}
      </section>

      {/* ═══════════ CONTENT ═══════════ */}
      <div className="max-w-[1760px] mx-auto px-6 sm:px-8 lg:px-10 py-8 sm:py-10">
        <div className="grid lg:grid-cols-3 gap-10 lg:gap-16">

          {/* ────── LEFT — Property info ────── */}
          <div className="lg:col-span-2">
            {/* Header */}
            <div className="pb-6 border-b border-gray-200">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-[#222] leading-tight">
                    {property.address}
                  </h1>
                  <p className="text-gray-500 mt-1 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {property.city || 'Texas'}, {property.state || 'TX'} {property.zip_code}
                  </p>
                </div>
                <p className="text-2xl sm:text-3xl font-bold text-[#222] whitespace-nowrap">
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Features row */}
            <div className="py-6 border-b border-gray-200 flex items-center gap-6 flex-wrap">
              {property.bedrooms > 0 && (
                <div className="flex items-center gap-2">
                  <Bed className="w-5 h-5 text-gray-400" />
                  <span className="text-[#222]"><strong>{property.bedrooms}</strong> habitaciones</span>
                </div>
              )}
              {property.bathrooms > 0 && (
                <div className="flex items-center gap-2">
                  <Bath className="w-5 h-5 text-gray-400" />
                  <span className="text-[#222]"><strong>{property.bathrooms}</strong> baños</span>
                </div>
              )}
              {property.square_feet > 0 && (
                <div className="flex items-center gap-2">
                  <Square className="w-5 h-5 text-gray-400" />
                  <span className="text-[#222]"><strong>{property.square_feet}</strong> sqft</span>
                </div>
              )}
              {property.year > 0 && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-gray-400" />
                  <span className="text-[#222]">Año <strong>{property.year}</strong></span>
                </div>
              )}
            </div>

            {/* What this place offers */}
            <div className="py-6 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-[#222] mb-4">Lo que ofrece esta casa</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: <CheckCircle className="w-5 h-5" />, label: 'Casa inspeccionada y verificada' },
                  { icon: <Shield className="w-5 h-5" />, label: 'Título limpio verificado' },
                  { icon: <FileText className="w-5 h-5" />, label: 'Documentos listos para transferencia' },
                  ...(property.is_renovated ? [{ icon: <CheckCircle className="w-5 h-5" />, label: 'Renovada: plomería, electricidad, pisos, pintura' }] : []),
                  { icon: <DollarSign className="w-5 h-5" />, label: 'Compra al contado o financiamiento RTO' },
                  { icon: <Clock className="w-5 h-5" />, label: 'Proceso rápido y transparente' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 py-2">
                    <span className="text-gray-400">{item.icon}</span>
                    <span className="text-sm text-gray-600">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="py-6">
              <h2 className="text-xl font-semibold text-[#222] mb-4">Detalles de la propiedad</h2>
              <div className="grid sm:grid-cols-2 gap-x-8">
                {[
                  { label: 'Tipo', value: 'Casa Móvil' },
                  { label: 'Estado', value: 'Texas' },
                  ...(property.hud_number ? [{ label: 'HUD Number', value: property.hud_number }] : []),
                  { label: 'Condición', value: property.is_renovated ? 'Renovada ✓' : 'Original' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between py-3 border-b border-gray-100">
                    <span className="text-sm text-gray-500">{item.label}</span>
                    <span className="text-sm font-medium text-[#222]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ────── RIGHT — SIDEBAR ────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg sticky top-24 space-y-6">

              {isAvailable ? (
                <>
                  {/* Cash CTA */}
                  <Link
                    href={`/clientes/comprar/${property.id}`}
                    className="block w-full text-center px-6 py-3.5 rounded-xl font-semibold transition-colors"
                    style={{ background: '#FF385C', color: 'white' }}
                  >
                    Comprar al contado
                  </Link>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-gray-400">o simula tu financiamiento</span>
                    </div>
                  </div>

                  <RTOSimulator salePrice={property.sale_price} propertyId={property.id} />
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-xl font-bold text-[#222] mb-1">
                    {property.status === 'sold' ? 'Vendida' : 'Reservada'}
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    {property.status === 'sold' ? 'Esta propiedad ya ha sido vendida.' : 'Venta en proceso.'}
                  </p>
                  <Link
                    href="/clientes/casas"
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[#222] underline"
                  >
                    Ver otras casas
                  </Link>
                </div>
              )}

              {/* Contact */}
              <div className="pt-5 border-t border-gray-200 space-y-2">
                <p className="text-xs text-gray-500 font-medium text-center">¿Tienes preguntas?</p>
                <div className="flex gap-2">
                  <a
                    href="tel:8327459600"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-[#222] border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    Llamar
                  </a>
                  <a
                    href={`https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Me%20interesa%20la%20casa%20en%20${encodeURIComponent(property.address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white transition-all hover:shadow-sm"
                    style={{ background: '#25d366' }}
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
