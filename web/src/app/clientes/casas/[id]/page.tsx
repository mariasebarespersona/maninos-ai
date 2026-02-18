'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, MapPin, Bed, Bath, Square, Calendar,
  CheckCircle, Shield, FileText, ChevronLeft, ChevronRight,
  Loader2, DollarSign, Clock, SlidersHorizontal, ArrowRight,
  Phone, MessageCircle, Home, X, Maximize2, LayoutGrid,
  Paintbrush, Wrench, Zap, Hammer, Sparkles, HardHat, ShieldCheck, ChevronDown
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
        <SlidersHorizontal className="w-4 h-4 text-[#717171]" />
        <h3 className="font-bold text-[14px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>Simulador Rent-to-Own</h3>
      </div>

      {/* Monthly display */}
      <div className="bg-gray-50 rounded-xl p-5 text-center">
        <p className="text-[12px] text-[#717171] font-medium mb-1 uppercase tracking-wide">Pago mensual estimado</p>
        <p className="text-[32px] font-bold text-[#222]" style={{ letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          ${rto.monthlyPayment.toLocaleString()}
          <span className="text-[16px] font-normal text-[#717171]">/mes</span>
        </p>
        <p className="text-[12px] text-[#b0b0b0] mt-0.5">por {termMonths} meses</p>
      </div>

      {/* Down payment slider */}
      <div>
        <div className="flex justify-between text-[14px] mb-2">
          <span className="text-[#484848]">Enganche</span>
          <span className="font-semibold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>${downPaymentAmount.toLocaleString()} ({downPaymentPct}%)</span>
        </div>
        <input
          type="range" min={0} max={40} step={1}
          value={downPaymentPct}
          onChange={(e) => setDownPaymentPct(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200"
          style={{ accentColor: '#222' }}
        />
        <div className="flex justify-between text-[11px] text-[#b0b0b0] mt-1">
          <span>0%</span><span>40%</span>
        </div>
      </div>

      {/* Term slider */}
      <div>
        <div className="flex justify-between text-[14px] mb-2">
          <span className="text-[#484848]">Plazo</span>
          <span className="font-semibold text-[#222]" style={{ fontVariantNumeric: 'tabular-nums' }}>{termMonths} meses</span>
        </div>
        <input
          type="range" min={12} max={60} step={6}
          value={termMonths}
          onChange={(e) => setTermMonths(Number(e.target.value))}
          className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-200"
          style={{ accentColor: '#222' }}
        />
        <div className="flex justify-between text-[11px] text-[#b0b0b0] mt-1">
          <span>12 meses</span><span>60 meses</span>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-[14px]">
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
        className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-white font-semibold text-[15px] transition-colors"
        style={{ background: '#0068b7', letterSpacing: '-0.01em' }}
      >
        Solicitar Rent-to-Own
        <ArrowRight className="w-4 h-4" />
      </button>

      <p className="text-[11px] text-center text-[#b0b0b0]">
        *Cifras estimadas. El pago final depende de la aprobación.
      </p>
    </div>
  )
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-[#484848]">{label}</span>
      <span className="font-semibold" style={{ color: color || '#222', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
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
   JUGAR CON CASA — Renovation Cost Simulator
   ──────────────────────────────────────────────────────────────── */

interface RenovationItem {
  id: string
  partida: number
  concepto: string
  precio: number
  notas: string
  category: string
  icon: string
}

const RENOVATION_CATEGORIES = [
  {
    id: 'exterior',
    label: 'Exterior y Estructura',
    icon: HardHat,
    color: '#e67e22',
    bgColor: '#fef3e2',
    items: ['demolicion', 'limpieza', 'techos_ext', 'siding', 'pintura_ext'],
  },
  {
    id: 'interior',
    label: 'Paredes e Interior',
    icon: Paintbrush,
    color: '#3498db',
    bgColor: '#ebf5fb',
    items: ['muros', 'cielos_int', 'textura_muros', 'pintura_int'],
  },
  {
    id: 'pisos',
    label: 'Pisos',
    icon: Square,
    color: '#8e44ad',
    bgColor: '#f4ecf7',
    items: ['pisos'],
  },
  {
    id: 'cocina_banos',
    label: 'Cocina y Baños',
    icon: Wrench,
    color: '#27ae60',
    bgColor: '#eafaf1',
    items: ['gabinetes', 'pintura_gab', 'banos', 'cocina'],
  },
  {
    id: 'instalaciones',
    label: 'Electricidad y Plomería',
    icon: Zap,
    color: '#f39c12',
    bgColor: '#fef9e7',
    items: ['electricidad', 'plomeria', 'finishing'],
  },
  {
    id: 'acabados',
    label: 'Acabados y Seguridad',
    icon: Sparkles,
    color: '#e74c3c',
    bgColor: '#fdedec',
    items: ['acabados', 'cerraduras'],
  },
]

const ALL_RENOVATION_ITEMS: RenovationItem[] = [
  { id: 'demolicion', partida: 1, concepto: 'Demolición y desmantelamiento', precio: 250, notas: 'Retirar materiales dañados', category: 'exterior', icon: '🔨' },
  { id: 'limpieza', partida: 2, concepto: 'Limpieza general de obra', precio: 200, notas: 'Limpieza profunda completa', category: 'exterior', icon: '🧹' },
  { id: 'muros', partida: 3, concepto: 'Reparación de muros', precio: 390, notas: 'Sheetrock, trim, coqueo, floteo', category: 'interior', icon: '🧱' },
  { id: 'electricidad', partida: 4, concepto: 'Electricidad y cableado', precio: 200, notas: 'Revisión y reparación eléctrica', category: 'instalaciones', icon: '⚡' },
  { id: 'techos_ext', partida: 5, concepto: 'Reparación de techos exteriores', precio: 390, notas: 'Conglomerado, shingles', category: 'exterior', icon: '🏠' },
  { id: 'cielos_int', partida: 6, concepto: 'Reparación de cielos interiores', precio: 390, notas: 'Tablaroca, resanes, popcorn', category: 'interior', icon: '🔝' },
  { id: 'textura_muros', partida: 7, concepto: 'Textura muros', precio: 390, notas: 'Texturizado de paredes', category: 'interior', icon: '🎨' },
  { id: 'siding', partida: 8, concepto: 'Siding exterior', precio: 0, notas: 'Lámina, vynil o madera', category: 'exterior', icon: '🪵' },
  { id: 'pisos', partida: 9, concepto: 'Pisos (plywood y acabados)', precio: 1500, notas: 'Plywood base + acabados de piso', category: 'pisos', icon: '🪵' },
  { id: 'gabinetes', partida: 10, concepto: 'Gabinetes (cocina y baños)', precio: 1000, notas: 'Reparación de carpintería', category: 'cocina_banos', icon: '🚪' },
  { id: 'pintura_ext', partida: 11, concepto: 'Pintura exterior', precio: 1300, notas: 'Lámina y plástico', category: 'exterior', icon: '🖌️' },
  { id: 'pintura_int', partida: 12, concepto: 'Pintura interior y cielos', precio: 390, notas: 'Pintura completa interior', category: 'interior', icon: '🎨' },
  { id: 'pintura_gab', partida: 13, concepto: 'Pintura de gabinetes', precio: 800, notas: 'Pintura especial gabinetes', category: 'cocina_banos', icon: '🎨' },
  { id: 'banos', partida: 14, concepto: 'Baños completos', precio: 200, notas: 'Sanitarios, lavamanos, plomería', category: 'cocina_banos', icon: '🚿' },
  { id: 'cocina', partida: 15, concepto: 'Cocina', precio: 200, notas: 'Formica, tarja, plomería', category: 'cocina_banos', icon: '🍳' },
  { id: 'finishing', partida: 16, concepto: 'Lámparas, apagadores, contactos', precio: 200, notas: 'Instalación de finishing', category: 'instalaciones', icon: '💡' },
  { id: 'plomeria', partida: 17, concepto: 'Plomería', precio: 200, notas: 'Líneas de agua, desagüe, cespol', category: 'instalaciones', icon: '🔧' },
  { id: 'acabados', partida: 18, concepto: 'Acabados finales', precio: 200, notas: 'Retoques, limpieza fina, staging', category: 'acabados', icon: '✨' },
  { id: 'cerraduras', partida: 19, concepto: 'Cerraduras y herrajes', precio: 200, notas: 'Chapas y herrajes nuevos', category: 'acabados', icon: '🔐' },
]

function RenovationSimulator({ salePrice, isRenovated }: { salePrice: number; isRenovated: boolean }) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [expandedCat, setExpandedCat] = useState<string | null>(null)
  // Start expanded by default so users can see it immediately
  const [showSimulator, setShowSimulator] = useState(true)

  const totalReno = useMemo(() => {
    let total = 0
    selected.forEach(id => {
      const item = ALL_RENOVATION_ITEMS.find(i => i.id === id)
      if (item) total += item.precio
    })
    return total
  }, [selected])

  const totalInvestment = salePrice + totalReno

  const toggleItem = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleCategory = (catId: string) => {
    const cat = RENOVATION_CATEGORIES.find(c => c.id === catId)
    if (!cat) return
    const allSelected = cat.items.every(id => selected.has(id))
    setSelected(prev => {
      const next = new Set(prev)
      cat.items.forEach(id => {
        if (allSelected) next.delete(id)
        else next.add(id)
      })
      return next
    })
  }

  const selectAll = () => {
    setSelected(new Set(ALL_RENOVATION_ITEMS.filter(i => i.precio > 0).map(i => i.id)))
  }

  const clearAll = () => setSelected(new Set())

  const fullRenovationCost = ALL_RENOVATION_ITEMS.reduce((s, i) => s + i.precio, 0)
  const renoPercentage = fullRenovationCost > 0 ? Math.round((totalReno / fullRenovationCost) * 100) : 0

  if (!showSimulator) {
    return (
      <div className="py-6 border-b border-gray-200">
        <button
          onClick={() => setShowSimulator(true)}
          className="w-full group flex items-center gap-4 p-5 rounded-2xl bg-gradient-to-r from-[#e6f0f8] to-[#f0f7ff] border border-[#0068b7]/20 hover:border-[#0068b7]/50 hover:shadow-lg transition-all duration-300"
        >
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#0068b7] to-[#004274] flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform shadow-md">
            <Hammer className="w-7 h-7 text-white" />
          </div>
          <div className="text-left flex-1">
            <h3 className="text-[17px] font-bold text-[#222] group-hover:text-[#004274] transition-colors" style={{ letterSpacing: '-0.02em' }}>
              🎮 Jugar con tu casa
            </h3>
            <p className="text-[13px] text-[#717171] mt-0.5">
              {isRenovated
                ? 'Esta casa ya está renovada. ¿Quieres ver cuánto costaron las mejoras?'
                : 'Simula renovaciones y visualiza cuánto costaría personalizar esta casa a tu gusto.'
              }
            </p>
          </div>
          <div className="flex items-center gap-1 text-[#0068b7] font-semibold text-[13px] whitespace-nowrap">
            <span className="hidden sm:inline">Abrir</span>
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-all" />
          </div>
        </button>
      </div>
    )
  }

  return (
    <div className="py-6 border-b border-gray-200">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0068b7] to-[#004274] flex items-center justify-center">
            <Hammer className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-[20px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>🎮 Jugar con tu casa</h2>
            <p className="text-[12px] text-[#717171]">Selecciona las renovaciones que te gustaría hacer</p>
          </div>
        </div>
        <button onClick={() => setShowSimulator(false)} className="text-[#717171] hover:text-[#222] p-1.5 rounded-lg hover:bg-gray-100 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Sticky investment summary */}
      <div className="bg-gradient-to-r from-[#004274] to-[#0068b7] rounded-2xl p-5 mb-5 text-white">
        <div className="grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Precio casa</p>
            <p className="text-[18px] font-bold mt-0.5" style={{ fontVariantNumeric: 'tabular-nums' }}>
              ${salePrice.toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Renovación</p>
            <p className="text-[18px] font-bold mt-0.5" style={{ fontVariantNumeric: 'tabular-nums', color: totalReno > 0 ? '#fcd34d' : 'white' }}>
              {totalReno > 0 ? `+$${totalReno.toLocaleString()}` : '$0'}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-white/70 font-medium uppercase tracking-wide">Total inversión</p>
            <p className="text-[22px] font-extrabold mt-0.5" style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}>
              ${totalInvestment.toLocaleString()}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3">
          <div className="flex justify-between text-[10px] text-white/60 mb-1">
            <span>{selected.size} de {ALL_RENOVATION_ITEMS.length} partidas</span>
            <span>{renoPercentage}% de renovación completa</span>
          </div>
          <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#fcd34d] rounded-full transition-all duration-500 ease-out"
              style={{ width: `${renoPercentage}%` }}
            />
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={selectAll}
          className="flex-1 text-[12px] font-semibold text-[#004274] bg-[#e6f0f8] hover:bg-[#cce0f0] rounded-lg py-2 transition-colors"
        >
          Seleccionar todo
        </button>
        <button
          onClick={clearAll}
          className="flex-1 text-[12px] font-semibold text-[#717171] bg-gray-100 hover:bg-gray-200 rounded-lg py-2 transition-colors"
        >
          Limpiar
        </button>
      </div>

      {/* Categories */}
      <div className="space-y-2">
        {RENOVATION_CATEGORIES.map(cat => {
          const CatIcon = cat.icon
          const catItems = ALL_RENOVATION_ITEMS.filter(i => cat.items.includes(i.id))
          const selectedCount = catItems.filter(i => selected.has(i.id)).length
          const catTotal = catItems.filter(i => selected.has(i.id)).reduce((s, i) => s + i.precio, 0)
          const allSelected = catItems.length > 0 && catItems.every(i => selected.has(i.id))
          const isExpanded = expandedCat === cat.id

          return (
            <div key={cat.id} className="rounded-xl border border-gray-200 overflow-hidden transition-all duration-200">
              {/* Category header */}
              <button
                onClick={() => setExpandedCat(isExpanded ? null : cat.id)}
                className="w-full flex items-center gap-3 p-3.5 hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.bgColor }}>
                  <CatIcon className="w-4.5 h-4.5" style={{ color: cat.color }} />
                </div>
                <div className="flex-1 text-left">
                  <p className="text-[14px] font-semibold text-[#222]">{cat.label}</p>
                  <p className="text-[11px] text-[#717171]">
                    {selectedCount > 0 ? `${selectedCount}/${catItems.length} seleccionados` : `${catItems.length} partidas`}
                    {catTotal > 0 && <span className="ml-1 font-semibold text-[#004274]">· +${catTotal.toLocaleString()}</span>}
                  </p>
                </div>

                {/* Category toggle */}
                <button
                  onClick={(e) => { e.stopPropagation(); toggleCategory(cat.id) }}
                  className={`w-10 h-6 rounded-full transition-colors duration-200 flex items-center px-0.5 flex-shrink-0 ${
                    allSelected ? 'bg-[#0068b7]' : selectedCount > 0 ? 'bg-[#0068b7]/40' : 'bg-gray-200'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                    allSelected ? 'translate-x-4' : 'translate-x-0'
                  }`} />
                </button>

                <ChevronDown className={`w-4 h-4 text-[#b0b0b0] transition-transform duration-200 flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`} />
              </button>

              {/* Expanded items */}
              {isExpanded && (
                <div className="border-t border-gray-100 bg-gray-50/50">
                  {catItems.map(item => {
                    const isOn = selected.has(item.id)
                    return (
                      <button
                        key={item.id}
                        onClick={() => toggleItem(item.id)}
                        className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-white/80 transition-colors text-left border-b border-gray-100 last:border-b-0 ${
                          isOn ? 'bg-white' : ''
                        }`}
                      >
                        <span className="text-[16px] flex-shrink-0">{item.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] font-medium ${isOn ? 'text-[#222]' : 'text-[#484848]'}`}>{item.concepto}</p>
                          <p className="text-[11px] text-[#b0b0b0]">{item.notas}</p>
                        </div>
                        <span className={`text-[13px] font-semibold flex-shrink-0 ${
                          item.precio === 0 ? 'text-[#b0b0b0]' : isOn ? 'text-[#004274]' : 'text-[#717171]'
                        }`} style={{ fontVariantNumeric: 'tabular-nums' }}>
                          {item.precio > 0 ? `$${item.precio.toLocaleString()}` : 'N/A'}
                        </span>
                        <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all duration-150 ${
                          isOn
                            ? 'bg-[#0068b7] border-[#0068b7]'
                            : 'border-gray-300 bg-white'
                        }`}>
                          {isOn && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Bottom note */}
      <div className="mt-5 p-4 bg-[#e6f0f8]/50 rounded-xl flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#004274] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[12px] font-semibold text-[#222]">Costos de referencia</p>
          <p className="text-[11px] text-[#717171] mt-0.5">
            Los precios son estimados basados en nuestros proveedores. El costo final puede variar según el estado de la casa. Consulta con nuestro equipo para un presupuesto personalizado.
          </p>
        </div>
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
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full bg-white shadow-md text-[13px] font-semibold text-[#222] hover:shadow-lg transition-shadow"
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
                  className="absolute bottom-4 right-4 z-10 flex items-center gap-1.5 px-4 py-2 rounded-lg bg-white text-[13px] font-bold text-[#222] shadow-md hover:shadow-lg transition-shadow"
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
                  <h1 className="text-[24px] sm:text-[28px] font-bold text-[#222] leading-tight" style={{ letterSpacing: '-0.025em' }}>
                    {property.address}
                  </h1>
                  <p className="text-[14px] text-[#717171] mt-1.5 flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    {property.city || 'Texas'}, {property.state || 'TX'} {property.zip_code}
                  </p>
                </div>
                <p className="text-[24px] sm:text-[28px] font-bold text-[#222] whitespace-nowrap" style={{ letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                  ${property.sale_price?.toLocaleString()}
                </p>
              </div>
            </div>

            {/* Features row */}
            <div className="py-6 border-b border-gray-200 flex items-center gap-6 flex-wrap">
              {property.bedrooms > 0 && (
                <div className="flex items-center gap-2 text-[15px]">
                  <Bed className="w-5 h-5 text-[#717171]" />
                  <span className="text-[#484848]"><strong className="text-[#222] font-semibold">{property.bedrooms}</strong> habitaciones</span>
                </div>
              )}
              {property.bathrooms > 0 && (
                <div className="flex items-center gap-2 text-[15px]">
                  <Bath className="w-5 h-5 text-[#717171]" />
                  <span className="text-[#484848]"><strong className="text-[#222] font-semibold">{property.bathrooms}</strong> baños</span>
                </div>
              )}
              {property.square_feet > 0 && (
                <div className="flex items-center gap-2 text-[15px]">
                  <Square className="w-5 h-5 text-[#717171]" />
                  <span className="text-[#484848]"><strong className="text-[#222] font-semibold">{property.square_feet}</strong> sqft</span>
                </div>
              )}
              {property.year > 0 && (
                <div className="flex items-center gap-2 text-[15px]">
                  <Calendar className="w-5 h-5 text-[#717171]" />
                  <span className="text-[#484848]">Año <strong className="text-[#222] font-semibold">{property.year}</strong></span>
                </div>
              )}
            </div>

            {/* What this place offers */}
            <div className="py-6 border-b border-gray-200">
              <h2 className="text-[20px] font-bold text-[#222] mb-4" style={{ letterSpacing: '-0.02em' }}>Lo que ofrece esta casa</h2>
              <div className="grid sm:grid-cols-2 gap-3">
                {[
                  { icon: <CheckCircle className="w-5 h-5" />, label: 'Casa inspeccionada y verificada' },
                  { icon: <Shield className="w-5 h-5" />, label: 'Título limpio verificado' },
                  { icon: <FileText className="w-5 h-5" />, label: 'Documentos listos para transferencia' },
                  ...(property.is_renovated ? [{ icon: <CheckCircle className="w-5 h-5" />, label: 'Renovada: plomería, electricidad, pisos, pintura' }] : []),
                  { icon: <DollarSign className="w-5 h-5" />, label: 'Compra al contado o plan dueño a dueño RTO' },
                  { icon: <Clock className="w-5 h-5" />, label: 'Proceso rápido y transparente' },
                ].map(item => (
                  <div key={item.label} className="flex items-center gap-3 py-2">
                    <span className="text-[#717171]">{item.icon}</span>
                    <span className="text-[14px] text-[#484848]">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Details */}
            <div className="py-6 border-b border-gray-200">
              <h2 className="text-[20px] font-bold text-[#222] mb-4" style={{ letterSpacing: '-0.02em' }}>Detalles de la propiedad</h2>
              <div className="grid sm:grid-cols-2 gap-x-8">
                {[
                  { label: 'Tipo', value: 'Casa Móvil' },
                  { label: 'Estado', value: 'Texas' },
                  ...(property.hud_number ? [{ label: 'HUD Number', value: property.hud_number }] : []),
                  { label: 'Condición', value: property.is_renovated ? 'Renovada ✓' : 'Original' },
                ].map(item => (
                  <div key={item.label} className="flex justify-between py-3 border-b border-gray-100">
                    <span className="text-[14px] text-[#717171]">{item.label}</span>
                    <span className="text-[14px] font-semibold text-[#222]">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Jugar con casa — Renovation Simulator */}
            <RenovationSimulator salePrice={property.sale_price} isRenovated={property.is_renovated} />
          </div>

          {/* ────── RIGHT — SIDEBAR ────── */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-lg sticky top-24 space-y-6">

              {isAvailable ? (
                <>
                  {/* Cash CTA */}
                  <Link
                    href={`/clientes/comprar/${property.id}`}
                    className="block w-full text-center px-6 py-3.5 rounded-xl font-semibold text-[15px] transition-colors"
                    style={{ background: '#0068b7', color: 'white', letterSpacing: '-0.01em' }}
                  >
                    Comprar al contado
                  </Link>

                  <div className="relative">
                    <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                    <div className="relative flex justify-center text-xs">
                      <span className="bg-white px-3 text-[#b0b0b0] text-[13px]">o simula tu plan dueño a dueño RTO</span>
                    </div>
                  </div>

                  <RTOSimulator salePrice={property.sale_price} propertyId={property.id} />
                </>
              ) : (
                <div className="text-center py-6">
                  <p className="text-[20px] font-bold text-[#222] mb-1" style={{ letterSpacing: '-0.02em' }}>
                    {property.status === 'sold' ? 'Vendida' : 'Reservada'}
                  </p>
                  <p className="text-[14px] text-[#717171] mb-4">
                    {property.status === 'sold' ? 'Esta propiedad ya ha sido vendida.' : 'Venta en proceso.'}
                  </p>
                  <Link
                    href="/clientes/casas"
                    className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#222] underline"
                  >
                    Ver otras casas
                  </Link>
                </div>
              )}

              {/* Contact */}
              <div className="pt-5 border-t border-gray-200 space-y-2">
                <p className="text-[12px] text-[#b0b0b0] font-medium text-center">¿Tienes preguntas?</p>
                <div className="flex gap-2">
                  <a
                    href="tel:9362005200"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-[#222] border border-gray-200 hover:border-gray-300 hover:shadow-sm transition-all"
                  >
                    <Phone className="w-4 h-4" />
                    Llamar
                  </a>
                  <a
                    href={`https://api.whatsapp.com/send?phone=+19362005200&text=Hola!%20Me%20interesa%20la%20casa%20en%20${encodeURIComponent(property.address)}`}
                    target="_blank" rel="noopener noreferrer"
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[13px] font-semibold text-white transition-all hover:shadow-sm"
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
