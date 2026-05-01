'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  Building2, 
  MapPin, 
  DollarSign,
  Calendar,
  Home,
  Edit,
  Trash2,
  Image,
  Paintbrush,
  Tag,
  Package,
  CheckCircle2,
  Loader2,
  ClipboardCheck,
  FileText,
  Clock,
  AlertTriangle,
  XCircle,
  Sparkles,
  StickyNote,
  Camera,
  Truck,
  Plus,
  Phone,
  X,
  ChevronDown,
  ChevronUp,
  Landmark,
  Pencil,
  Check,
  MessageCircle,
  Copy,
  Send,
  ExternalLink,
  CheckCircle,
  Upload,
} from 'lucide-react'
import { InputModal, ConfirmModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import TitleTransferCard from '@/components/TitleTransferCard'
import BillOfSaleTemplate, { type BillOfSaleData } from '@/components/BillOfSaleTemplate'
import TitleApplicationTemplate, { type TitleApplicationData } from '@/components/TitleApplicationTemplate'
import DesktopEvaluatorPanel from '@/components/DesktopEvaluatorPanel'

interface Property {
  id: string
  address: string
  city?: string
  state?: string
  zip_code?: string
  hud_number?: string
  year?: number
  status: 'purchased' | 'published' | 'reserved' | 'renovating' | 'sold'
  is_renovated: boolean
  purchase_price?: number
  sale_price?: number
  bedrooms?: number
  bathrooms?: number
  square_feet?: number
  property_code?: string
  length_ft?: number
  width_ft?: number
  photos: string[]
  checklist_completed: boolean
  checklist_data: Record<string, boolean>
  document_data: Record<string, any>
  notes?: string | null
  // evaluation_report_id is stored on evaluation_reports.property_id, not here
  created_at: string
  updated_at: string
}

interface EvaluationReport {
  id: string
  report_number: string
  checklist: Array<{
    id: string
    label: string
    status: string
    note?: string
    confidence?: number
  }>
  score?: number
  recommendation?: string
  recommendation_reason?: string
  extra_notes?: string[]
  ai_summary?: string
  status: string
  created_at: string
  updated_at: string
}

const statusConfig: Record<string, { label: string; color: string; icon: typeof Package }> = {
  purchased: { 
    label: 'Comprada', 
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Package
  },
  published: { 
    label: 'Publicada', 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle2
  },
  reserved: {
    label: 'Reservada (Venta en proceso)',
    color: 'bg-orange-100 text-orange-700 border-orange-200',
    icon: Clock
  },
  renovating: { 
    label: 'En Renovación', 
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Paintbrush
  },
  sold: { 
    label: 'Vendida', 
    color: 'bg-gold-100 text-gold-700 border-gold-200',
    icon: Tag
  },
}

const fallbackStatusConfig = { label: 'Desconocido', color: 'bg-gray-100 text-gray-700 border-gray-200', icon: Package }

export default function PropertyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [transfers, setTransfers] = useState<{ purchase?: any; sale?: any }>({})
  
  // Modal states
  const [showPublishModal, setShowPublishModal] = useState(false)
  const [showRenovationPriceModal, setShowRenovationPriceModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showBosTemplate, setShowBosTemplate] = useState<'purchase' | 'sale' | null>(null)
  const [showTitleAppTemplate, setShowTitleAppTemplate] = useState<'purchase' | 'sale' | null>(null)

  // E-sign state (send documents for signature post-purchase)
  const [esignEmailFor, setEsignEmailFor] = useState<'bos' | 'title_app' | 'bos_sale' | 'title_app_sale' | null>(null)
  const [esignEmail, setEsignEmail] = useState('')
  const [esignSending, setEsignSending] = useState(false)
  const [sellerSignatures, setSellerSignatures] = useState<{
    bos: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string } | null;
    title_app: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string } | null;
    bos_sale: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string } | null;
    title_app_sale: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string } | null;
  }>({ bos: null, title_app: null, bos_sale: null, title_app_sale: null })
  const [signRefreshKey, setSignRefreshKey] = useState(0)

  // Evaluation report
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null)

  // Moves (movida)
  const [moves, setMoves] = useState<any[]>([])
  const [showNewMoveModal, setShowNewMoveModal] = useState(false)
  const [showWhatsAppModal, setShowWhatsAppModal] = useState(false)
  const [whatsAppMessage, setWhatsAppMessage] = useState('')
  const [moverProviders, setMoverProviders] = useState<any[]>([])
  const [requestingPayment, setRequestingPayment] = useState<string | null>(null)
  const [requestingRenoPayment, setRequestingRenoPayment] = useState(false)
  const [newMove, setNewMove] = useState({
    move_type: 'purchase' as string,
    origin_address: '',
    origin_city: '',
    destination_address: '',
    destination_city: '',
    destination_yard: '' as string,
    moving_company: '',
    driver_name: '',
    driver_phone: '',
    estimated_distance_miles: '',
    requires_escort: false,
    requires_wide_load_permit: false,
    scheduled_date: '',
    quoted_cost: '',
    notes: '',
    special_instructions: 'INCLUDE A/C UNIT FOR DELIVERY',
    // Delivery Request Sheet fields
    customer_name: '',
    customer_phone: '',
    delivery_date: '',
    hud_label: '',
    serial_number: '',
    manufacturer: '',
    home_size: '',
    home_year: '',
    has_hitch: true,   // default YES per template
    tires_axles: false, // default NO per template
  })
  const [savingMove, setSavingMove] = useState(false)
  const [expandedMove, setExpandedMove] = useState<string | null>(null)
  
  // Editable property code
  const [editingCode, setEditingCode] = useState(false)
  const [codeInput, setCodeInput] = useState('')

  // Editable address
  const [editingAddress, setEditingAddress] = useState(false)
  const [addressInput, setAddressInput] = useState('')

  // 80% rule recommended price
  const [recommendedPrice, setRecommendedPrice] = useState<{
    market_value?: number | null
    max_sell_price_80?: number | null
    recommended_price?: number | null
    warning?: string | null
  } | null>(null)

  // Post-renovation price breakdown
  const [postRenoPrice, setPostRenoPrice] = useState<{
    margin: number
    purchase_price: number
    commission: number
    renovation_cost: number
    move_cost: number
    recommended_sale_price: number
  } | null>(null)

  // Helper: save document data to property's document_data JSONB
  // Returns true if save succeeded, false otherwise
  const saveDocumentData = async (key: string, docFormData: BillOfSaleData | TitleApplicationData): Promise<boolean> => {
    if (!property) return false
    try {
      const existingDocData = property.document_data || {}
      const updatedDocData = { ...existingDocData, [key]: docFormData }
      console.log(`[saveDocumentData] Saving key="${key}" to property ${property.id}`, { keys: Object.keys(updatedDocData) })
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_data: updatedDocData }),
      })
      if (res.ok) {
        const updated = await res.json()
        // Verify the document_data was actually saved
        if (updated?.document_data?.[key]) {
          setProperty(updated)
          console.log(`[saveDocumentData] ✓ Saved successfully. Keys in document_data:`, Object.keys(updated.document_data))
          return true
        } else {
          console.warn(`[saveDocumentData] ⚠ PATCH succeeded but document_data["${key}"] is missing in response. Migration 047 may not have been run.`)
          toast.error(`Error: Los datos del documento no se guardaron. Ejecuta la migración 047 en Supabase.`)
          return false
        }
      } else {
        const errData = await res.json().catch(() => ({}))
        console.error(`[saveDocumentData] PATCH failed with status ${res.status}:`, errData)
        toast.error(errData?.detail || `Error al guardar datos del documento (${res.status})`)
        return false
      }
    } catch (err) {
      console.error(`[saveDocumentData] Network error saving ${key}:`, err)
      toast.error('Error de conexión al guardar datos del documento')
      return false
    }
  }

  // ── E-sign: fetch signature status from envelopes ──
  // Track known signed IDs to detect new signatures without circular deps
  const knownSignedRef = React.useRef<Set<string>>(new Set())

  const fetchSellerSignatures = useCallback(async () => {
    if (!property?.id) return
    try {
      const res = await fetch(`/api/esign/property/${property.id}/envelopes`)
      if (!res.ok) return
      const { envelopes } = await res.json()
      const sigs: typeof sellerSignatures = { bos: null, title_app: null, bos_sale: null, title_app_sale: null }
      let hasNewSignature = false
      for (const env of (envelopes || [])) {
        const sellerSig = (env.document_signatures || []).find((s: any) => s.signer_role === 'seller')
        if (!sellerSig) continue
        const signed = !!sellerSig.signed_at
        const sigData = sellerSig.signature_data || {}
        const entry = {
          signed,
          signature_type: sigData.type,
          signature_value: sigData.value,
          signer_name: sellerSig.signer_name,
        }
        if (signed && !knownSignedRef.current.has(sellerSig.id)) {
          knownSignedRef.current.add(sellerSig.id)
          hasNewSignature = true
        }
        // Map document_type + transaction_type to our keys
        const txType = env.transaction_type || 'purchase'
        if (env.document_type === 'bill_of_sale' && txType === 'purchase') sigs.bos = entry
        if (env.document_type === 'title_application' && txType === 'purchase') sigs.title_app = entry
        if (env.document_type === 'bill_of_sale' && txType === 'sale') sigs.bos_sale = entry
        if (env.document_type === 'title_application' && txType === 'sale') sigs.title_app_sale = entry
      }
      setSellerSignatures(sigs)
      // Re-fetch property to get updated document_data with signature fields
      if (hasNewSignature) {
        try {
          const propRes = await fetch(`/api/properties/${property.id}`)
          if (propRes.ok) {
            const propData = await propRes.json()
            setProperty(propData)
          }
        } catch {}
      }
    } catch {}
  }, [property?.id])

  // Poll for signatures every 15s
  useEffect(() => {
    if (!property?.id) return
    fetchSellerSignatures()
    const interval = setInterval(fetchSellerSignatures, 15000)
    return () => clearInterval(interval)
  }, [property?.id, fetchSellerSignatures])

  // ── E-sign: send document for signature ──
  const sendForEsign = async (docType: 'bos' | 'title_app' | 'bos_sale' | 'title_app_sale') => {
    if (!esignEmail.trim() || !property) return
    setEsignSending(true)
    try {
      const isBos = docType === 'bos' || docType === 'bos_sale'
      const txType = docType.includes('sale') ? 'sale' : 'purchase'
      const docData = property.document_data || {}
      const bosData = docData[`bos_${txType}`] || {}
      const titleData = docData[`title_app_${txType}`] || {}

      const signerName = isBos
        ? (txType === 'purchase' ? (bosData.seller_name || 'Vendedor') : (bosData.buyer_name || 'Comprador'))
        : (txType === 'purchase' ? (titleData.seller_transferor_name || bosData.seller_name || 'Vendedor') : (titleData.buyer_name || 'Comprador'))

      const res = await fetch('/api/esign/envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: isBos
            ? `Bill of Sale (${txType === 'purchase' ? 'Compra' : 'Venta'}) — ${property.address || 'Casa'}`
            : `Cambio Título (${txType === 'purchase' ? 'Compra' : 'Venta'}) — ${property.address || 'Casa'}`,
          document_type: isBos ? 'bill_of_sale' : 'title_application',
          transaction_type: txType,
          property_id: property.id,
          signers: [
            { role: 'seller', name: signerName, email: esignEmail.trim() },
          ],
          send_immediately: true,
        }),
      })
      if (res.ok) {
        toast.success(`Firma enviada a ${esignEmail.trim()} — recibirá un email para firmar`)
        setSignRefreshKey(k => k + 1)
        setEsignEmailFor(null)
        setEsignEmail('')
        // Refresh signatures after a short delay
        setTimeout(fetchSellerSignatures, 2000)
      } else {
        toast.error('Error enviando firma')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setEsignSending(false)
    }
  }

  // Cost breakdown for the financial card
  const [costBreakdown, setCostBreakdown] = useState<{
    purchase_price: number
    commission: number
    renovation_cost: number
    move_cost: number
    margin: number
    recommended_sale_price: number
  } | null>(null)

  const fetchCostBreakdown = async () => {
    try {
      const res = await fetch(`/api/properties/${params.id}/post-renovation-price`)
      if (res.ok) {
        const data = await res.json()
        if (data.ok) setCostBreakdown(data)
      }
    } catch (err) {
      // Non-critical, don't block the page
    }
  }

  useEffect(() => {
    fetchProperty()
    fetchTransfers()
    fetchMoves()
    fetchMoverProviders()
    fetchCostBreakdown()

    // Re-fetch financiero when renovation/move is updated (cross-page signal)
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'renovation_updated' || e.key === 'move_updated') {
        fetchCostBreakdown()
        fetchMoves()
      }
    }
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // Check if renovation was updated while we were away
        const lastUpdate = localStorage.getItem('renovation_updated')
        if (lastUpdate) {
          fetchCostBreakdown()
          fetchMoves()
          localStorage.removeItem('renovation_updated')
        }
      }
    }
    window.addEventListener('storage', handleStorage)
    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleVisibility)

    return () => {
      window.removeEventListener('storage', handleStorage)
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleVisibility)
    }
  }, [params.id])

  const fetchMoverProviders = async () => {
    try {
      const res = await fetch('/api/moves/providers/list')
      if (res.ok) {
        const data = await res.json()
        if (data.ok) setMoverProviders(data.providers || [])
      }
    } catch (err) { /* silent */ }
  }

  const handleSelectProvider = (provider: any) => {
    setNewMove(prev => ({
      ...prev,
      moving_company: provider.company || provider.name,
      driver_name: provider.name,
      driver_phone: provider.phone,
    }))
  }

  // Pre-fill delivery request sheet fields from property data
  const openMoveModal = (moveType: string = 'purchase') => {
    const dd = property?.document_data || {}
    const titleApp = dd.title_app_purchase || dd.title_app || {}
    const bos = dd.bos_purchase || {}
    setNewMove(prev => ({
      ...prev,
      move_type: moveType,
      origin_address: moveType === 'sale' ? '15891 Old Houston Rd' : (property?.address || ''),
      origin_city: moveType === 'sale' ? 'Conroe' : (property?.city || ''),
      customer_name: bos.buyer_name || bos.seller_name || '',
      customer_phone: bos.buyer_phone || bos.seller_phone || '',
      hud_label: titleApp.section1_label || titleApp.label_seal_number || titleApp.page2_hud_label || '',
      serial_number: titleApp.section1_serial || titleApp.serial_number || bos.serial_number || '',
      manufacturer: titleApp.manufacturer || bos.manufacturer || '',
      home_size: titleApp.total_sqft || titleApp.sqft || (property?.square_feet ? `${property.square_feet}` : ''),
      home_year: titleApp.year || titleApp.date_of_manufacture || (property?.year ? `${property.year}` : ''),
      has_hitch: true,
      tires_axles: false,
      special_instructions: 'INCLUDE A/C UNIT FOR DELIVERY',
    }))
    setShowNewMoveModal(true)
  }

  const handleSmsProvider = async (providerId: string, move?: any) => {
    const m = move || newMove
    const originAddr = m.origin_address || ''
    const originCity = m.origin_city || ''
    const origin = originAddr ? `${originAddr}, ${originCity}` : originCity
    const destAddr = m.destination_address || ''
    const destCity = m.destination_city || ''
    const dest = destAddr ? `${destAddr}, ${destCity}` : destCity
    const today = new Date().toLocaleDateString('en-US')

    // Build Delivery Request Sheet SMS
    const lines = [
      `DELIVERY REQUEST`,
      ``,
      `HOME #: ${property?.property_code || '—'}`,
      `REQUESTED DATE: ${today}`,
      `DELIVERY DATE: ${m.delivery_date || m.scheduled_date || 'TBD'}`,
      ``,
      `CUSTOMER: ${m.customer_name || '—'}`,
      `PHONE: ${m.customer_phone || '—'}`,
      `PICK UP: ${origin || '—'}`,
      `DELIVERY: ${dest || '—'}`,
      ``,
      `HOME INFO:`,
      `HUD #: ${m.hud_label || '—'}`,
      `SERIAL: ${m.serial_number || '—'}`,
      `MANUF: ${m.manufacturer || '—'}`,
      `SIZE: ${m.home_size || '—'}`,
      `YEAR: ${m.home_year || '—'}`,
      ``,
      `HITCH: ${m.has_hitch ? 'YES' : 'NO'}`,
      `TIRES & AXLES: ${m.tires_axles ? 'YES' : 'NO'}`,
      ``,
      `SPECIAL: ${m.special_instructions || m.notes || '—'}`,
      `PRICE: $${m.quoted_cost || 'TBD'}`,
    ]
    const message = lines.join('\n')

    try {
      const params = new URLSearchParams({
        provider_id: providerId,
        property_address: property?.address || '',
        origin,
        destination: dest,
        message,
      })
      const res = await fetch(`/api/moves/providers/sms-url?${params}`)
      if (!res.ok) {
        toast.error('Error generando link SMS')
        return
      }
      const data = await res.json()
      if (!data.ok || !data.url) {
        toast.error('Link SMS inválido')
        return
      }
      // sms: URI scheme — window.open('_blank') is blocked on mobile Safari after
      // an async fetch. Using an anchor click preserves the user gesture chain
      // and lets the browser hand off to the native SMS app.
      const anchor = document.createElement('a')
      anchor.href = data.url
      anchor.target = '_self'
      anchor.rel = 'noopener'
      document.body.appendChild(anchor)
      anchor.click()
      document.body.removeChild(anchor)
    } catch (err) {
      toast.error('Error generando link SMS')
    }
  }

  const handleRequestPayment = async (moveId: string) => {
    if (!confirm('¿Crear orden de pago para Abigail por esta movida?')) return
    setRequestingPayment(moveId)
    try {
      const res = await fetch(`/api/moves/${moveId}/request-payment`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Orden de pago creada')
        fetchMoves()
      } else {
        toast.error(data.detail || 'Error al crear orden de pago')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setRequestingPayment(null)
    }
  }

  const handleRequestRenoPayment = async () => {
    if (!property || !confirm('¿Crear orden de pago por la renovación de esta propiedad?')) return
    setRequestingRenoPayment(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/renovation/request-payment`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        toast.success(data.message || 'Orden de pago creada')
      } else {
        toast.error(data.detail || 'Error al crear orden de pago')
      }
    } catch (err) {
      toast.error('Error de conexión')
    } finally {
      setRequestingRenoPayment(false)
    }
  }

  const fetchTransfers = async () => {
    try {
      const res = await fetch(`/api/transfers/property/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setTransfers(data)
      }
    } catch (error) {
      console.error('Error fetching transfers:', error)
    }
  }

  const fetchMoves = async () => {
    try {
      const res = await fetch(`/api/moves/property/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setMoves(data || [])
      }
    } catch (error) {
      console.error('Error fetching moves:', error)
    }
  }

  const handleCreateMove = async () => {
    if (!property) return
    setSavingMove(true)
    try {
      const payload: any = {
        property_id: property.id,
        move_type: newMove.move_type,
        origin_address: newMove.origin_address || property.address,
        origin_city: newMove.origin_city || property.city || '',
        destination_address: newMove.destination_address,
        destination_city: newMove.destination_city,
        destination_yard: newMove.destination_yard || undefined,
        moving_company: newMove.moving_company,
        driver_name: newMove.driver_name,
        driver_phone: newMove.driver_phone,
        estimated_distance_miles: newMove.estimated_distance_miles ? parseFloat(newMove.estimated_distance_miles) : undefined,
        requires_escort: newMove.requires_escort,
        requires_wide_load_permit: newMove.requires_wide_load_permit,
        scheduled_date: newMove.scheduled_date || undefined,
        quoted_cost: newMove.quoted_cost ? parseFloat(newMove.quoted_cost) : 0,
        notes: newMove.notes,
        special_instructions: newMove.special_instructions,
      }
      const res = await fetch('/api/moves', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success('🚛 Movida contratada exitosamente')
        setShowNewMoveModal(false)
        setNewMove({ move_type: 'purchase', origin_address: '', origin_city: '', destination_address: '', destination_city: '', destination_yard: '', moving_company: '', driver_name: '', driver_phone: '', estimated_distance_miles: '', requires_escort: false, requires_wide_load_permit: false, scheduled_date: '', quoted_cost: '', notes: '', special_instructions: 'INCLUDE A/C UNIT FOR DELIVERY', customer_name: '', customer_phone: '', delivery_date: '', hud_label: '', serial_number: '', manufacturer: '', home_size: '', home_year: '', has_hitch: true, tires_axles: false })
        fetchMoves()
        fetchCostBreakdown() // Update financiero with new move cost
      } else {
        const d = await res.json()
        toast.error(d.detail || 'Error al crear movida')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSavingMove(false)
    }
  }

  const handleUpdateMoveStatus = async (moveId: string, newStatus: string) => {
    try {
      const payload: any = { status: newStatus }
      if (newStatus === 'in_transit') payload.actual_pickup_date = new Date().toISOString()
      if (newStatus === 'completed') payload.actual_delivery_date = new Date().toISOString()
      
      const res = await fetch(`/api/moves/${moveId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (res.ok) {
        toast.success(`Estado actualizado: ${newStatus}`)
        fetchMoves()
      } else {
        const d = await res.json()
        toast.error(d.detail || 'Error al actualizar')
      }
    } catch { toast.error('Error de conexión') }
  }

  const handleDeleteMove = async (moveId: string) => {
    if (!confirm('¿Eliminar esta movida?')) return
    try {
      const res = await fetch(`/api/moves/${moveId}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Movida eliminada')
        fetchMoves()
        fetchCostBreakdown() // Update financiero
      }
    } catch { toast.error('Error de conexión') }
  }

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/properties/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setProperty(data)
      } else {
        toast.error('Error al cargar la propiedad')
      }
    } catch (error) {
      console.error('Error fetching property:', error)
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const fetchEvalReportForProperty = async (propertyId: string) => {
    try {
      // Look up evaluation report linked to this property via property_id
      const res = await fetch(`/api/evaluations?property_id=${propertyId}`)
      if (res.ok) {
        const data = await res.json()
        // API returns {evaluations: [...]} — take the most recent completed one
        const reports = data.evaluations || []
        const completed = reports.find((r: any) => r.status === 'completed') || reports[0]
        if (completed) {
          setEvalReport(completed)
        }
      }
    } catch (error) {
      console.error('Error fetching evaluation report:', error)
    }
  }

  // Fetch evaluation report when property loads
  useEffect(() => {
    if (property?.id) {
      fetchEvalReportForProperty(property.id)
    }
  }, [property?.id])

  const fetchRecommendedPrice = async () => {
    if (!property) return
    try {
      const res = await fetch(`/api/properties/${property.id}/recommended-price`)
      if (res.ok) {
        const data = await res.json()
        setRecommendedPrice(data)
      }
    } catch (error) {
      console.error('Error fetching recommended price:', error)
    }
  }

  const handleSavePropertyCode = async () => {
    if (!property) return
    const trimmed = codeInput.trim().toUpperCase()
    if (!trimmed) {
      toast.warning('El código no puede estar vacío')
      return
    }
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_code: trimmed }),
      })
      if (res.ok) {
        const updated = await res.json()
        setProperty(updated)
        setEditingCode(false)
        toast.success(`Código actualizado a ${trimmed}`)
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al actualizar código')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const handleSaveAddress = async () => {
    if (!property) return
    const trimmed = addressInput.trim()
    if (!trimmed) {
      toast.warning('La dirección no puede estar vacía')
      return
    }
    if (trimmed === property.address) {
      setEditingAddress(false)
      return
    }
    try {
      const res = await fetch(`/api/properties/${property.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed }),
      })
      if (res.ok) {
        const updated = await res.json()
        setProperty(updated)
        setEditingAddress(false)
        toast.success('Dirección actualizada')
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al actualizar dirección')
      }
    } catch {
      toast.error('Error de conexión')
    }
  }

  const openPublishModal = () => {
    fetchRecommendedPrice()
    setShowPublishModal(true)
  }

  const [sharingSending, setSharingSending] = useState(false)

  const fmtPrice = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
  const fmtNum = (n: number) => Number.isInteger(n) ? String(n) : String(Math.round(n))

  const openWhatsAppModal = () => {
    if (!property) return
    const code = property.property_code ? `Casa ${property.property_code}` : 'Casa'
    const year = property.year ? `\n📆 ${property.year}` : ''
    const dims = property.width_ft && property.length_ft ? `\n📏 ${property.width_ft} x ${property.length_ft}` : ''
    const beds = property.bedrooms ? `\n🛏️ ${fmtNum(property.bedrooms)} Cuartos` : ''
    const baths = property.bathrooms ? `\n🛀 ${fmtNum(property.bathrooms)} Baños` : ''
    const sqft = property.square_feet ? `\n📐 ${property.square_feet} sqft` : ''
    const price = property.sale_price ? `\n\n💰 Precio: ${fmtPrice(property.sale_price)}` : ''
    const addr = [property.address, property.city, property.state, property.zip_code].filter(Boolean).join(', ')

    const msg = `🏡 ${code}${year}${dims}

✨ Características principales:${beds}${baths}${sqft}

✅ Lista para mudarte de inmediato
${price}
🏦 Financiamiento disponible

🌟 Ideal para vivir o como inversión.
📲 ¡Contáctanos hoy mismo antes de que se venda!

📍${addr}`

    setWhatsAppMessage(msg.trim())
    setShowWhatsAppModal(true)
  }

  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new window.Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve(img)
      img.onerror = () => {
        // Retry via proxy if direct CORS fails
        const img2 = new window.Image()
        img2.crossOrigin = 'anonymous'
        img2.onload = () => resolve(img2)
        img2.onerror = () => reject(new Error('Failed'))
        img2.src = `/api/images/proxy?url=${encodeURIComponent(url)}`
      }
      img.src = url
    })

  const generateAndShareFlyer = async () => {
    if (!property) return
    setSharingSending(true)
    try {
      const W = 1080, H = 1350 // 4:5 — WhatsApp/Instagram optimal
      const canvas = document.createElement('canvas')
      canvas.width = W
      canvas.height = H
      const ctx = canvas.getContext('2d')!
      const P = 60 // padding

      // Helper: word wrap
      const drawWrapped = (text: string, x: number, startY: number, maxW: number, lineH: number) => {
        let cy = startY
        const words = text.split(' ')
        let line = ''
        for (const w of words) {
          if (ctx.measureText(line + w + ' ').width > maxW && line) {
            ctx.fillText(line.trim(), x, cy)
            cy += lineH
            line = w + ' '
          } else {
            line += w + ' '
          }
        }
        if (line) { ctx.fillText(line.trim(), x, cy); cy += lineH }
        return cy
      }

      // ── Background: full photo bleed ──
      const photos = property.photos || []
      let photoLoaded = false

      if (photos[0]) {
        try {
          const img = await loadImage(photos[0])
          // Draw photo covering entire canvas
          const scale = Math.max(W / img.width, H / img.height)
          const dw = img.width * scale, dh = img.height * scale
          ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)
          photoLoaded = true

          // Dark overlay — gradient from top (subtle) to bottom (heavy)
          const grad = ctx.createLinearGradient(0, 0, 0, H)
          grad.addColorStop(0, 'rgba(0,0,0,0.15)')
          grad.addColorStop(0.4, 'rgba(0,0,0,0.25)')
          grad.addColorStop(0.65, 'rgba(0,0,0,0.7)')
          grad.addColorStop(1, 'rgba(0,0,0,0.92)')
          ctx.fillStyle = grad
          ctx.fillRect(0, 0, W, H)
        } catch {
          // Photo failed to load
        }
      }

      if (!photoLoaded) {
        // Solid navy background when no photo
        ctx.fillStyle = '#283242'
        ctx.fillRect(0, 0, W, H)
      }

      // ── Top: "EN VENTA" pill ──
      const pillText = 'EN VENTA'
      ctx.font = 'bold 28px sans-serif'
      const pillW = ctx.measureText(pillText).width + 50
      ctx.fillStyle = '#b8a070'
      ctx.beginPath()
      ctx.roundRect(P, 50, pillW, 50, 25)
      ctx.fill()
      ctx.fillStyle = '#ffffff'
      ctx.fillText(pillText, P + 25, 83)

      // Property code top-right
      if (property.property_code) {
        ctx.fillStyle = 'rgba(255,255,255,0.85)'
        ctx.font = 'bold 32px sans-serif'
        ctx.textAlign = 'right'
        ctx.fillText(`Casa ${property.property_code}`, W - P, 83)
        ctx.textAlign = 'left'
      }

      // ── Bottom section: uniform white text ──
      // First, build all text lines to calculate total height
      const textColor = '#ffffff'
      const fontSize = 34
      const lineGap = 46
      const sectionGap = 16

      const lines: { text: string; bold: boolean; size: number; gap: number }[] = []

      // Casa code
      const code = property.property_code ? `Casa ${property.property_code}` : 'Casa en Venta'
      lines.push({ text: code, bold: true, size: 48, gap: 12 })

      // Year + dimensions
      const subParts: string[] = []
      if (property.year) subParts.push(String(property.year))
      if (property.width_ft && property.length_ft) subParts.push(`${property.width_ft} x ${property.length_ft}`)
      if (subParts.length) {
        lines.push({ text: subParts.join('  |  '), bold: false, size: fontSize, gap: sectionGap })
      }

      // Characteristics
      lines.push({ text: 'Caracteristicas principales:', bold: true, size: fontSize, gap: 6 })
      if (property.bedrooms) lines.push({ text: `  ${fmtNum(property.bedrooms)} Cuartos`, bold: false, size: fontSize, gap: 0 })
      if (property.bathrooms) lines.push({ text: `  ${fmtNum(property.bathrooms)} Banos`, bold: false, size: fontSize, gap: 0 })
      if (property.square_feet) lines.push({ text: `  ${property.square_feet} sqft`, bold: false, size: fontSize, gap: 0 })
      if (property.is_renovated) lines.push({ text: '  Renovada', bold: false, size: fontSize, gap: 0 })

      // Ready to move in
      lines.push({ text: 'Lista para mudarte de inmediato', bold: true, size: fontSize, gap: sectionGap })

      // Price
      if (property.sale_price) {
        lines.push({ text: `Precio: ${fmtPrice(property.sale_price)}`, bold: true, size: 56, gap: 10 })
      }

      // Financing
      lines.push({ text: 'Financiamiento disponible', bold: false, size: fontSize, gap: sectionGap })

      // CTA
      lines.push({ text: 'Ideal para vivir o como inversion.', bold: false, size: 30, gap: 0 })
      lines.push({ text: 'Contactanos hoy mismo!', bold: false, size: 30, gap: sectionGap })

      // Address
      const addr = [property.address, property.city, property.state, property.zip_code].filter(Boolean).join(', ')
      lines.push({ text: addr, bold: false, size: 28, gap: 0 })

      // Calculate total height needed
      let totalH = 0
      for (const l of lines) {
        totalH += l.size + 8 + l.gap // size + base spacing + gap
      }

      // Position text so it ends above the bottom bar (H - 110)
      const bottomLimit = H - 110
      let y = Math.min(H - 560, bottomLimit - totalH)
      if (y < H * 0.35) y = H * 0.35 // don't go above 35% of canvas

      // Draw all lines uniformly
      for (const l of lines) {
        ctx.fillStyle = textColor
        ctx.font = `${l.bold ? 'bold ' : ''}${l.size}px sans-serif`
        ctx.fillText(l.text, P, y)
        y += l.size + 8 + l.gap
      }

      // ── Bottom bar ──
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(0, H - 90, W, 90)
      ctx.fillStyle = '#b8a070'
      ctx.fillRect(0, H - 90, W, 2)

      ctx.textAlign = 'center'
      ctx.fillStyle = '#ffffff'
      ctx.font = 'bold 30px sans-serif'
      ctx.fillText('MANINOS HOMES', W / 2, H - 55)
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = '26px sans-serif'
      ctx.fillText('(832) 745-9600  |  (469) 600-5200', W / 2, H - 22)
      ctx.textAlign = 'left'

      // ── Export ──
      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob((b) => resolve(b!), 'image/jpeg', 0.93)
      )
      const file = new File([blob], `casa-${property.property_code || 'venta'}.jpg`, { type: 'image/jpeg' })

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file] })
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = file.name
        a.click()
        URL.revokeObjectURL(url)
        toast.success('Flyer descargado')
      }
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        console.error('Flyer error:', err)
        toast.error('Error al generar flyer')
      }
    } finally {
      setSharingSending(false)
    }
  }

  const sendWhatsAppTextOnly = () => {
    window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(whatsAppMessage)}`, '_blank')
  }

  const copyWhatsAppMessage = async () => {
    await navigator.clipboard.writeText(whatsAppMessage)
    toast.success('Mensaje copiado')
  }

  const handlePublish = async (priceStr: string) => {
    if (!property) return
    
    const price = parseFloat(priceStr)
    if (isNaN(price) || price <= 0) {
      toast.warning('Ingresa un precio válido')
      return
    }

    setShowPublishModal(false)
    setActionLoading(true)
    
    try {
      let res = await fetch(`/api/properties/${property.id}/publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sale_price: price }),
      })

      // If 80% rule blocked it, ask user to confirm and force
      if (res.status === 400) {
        const data = await res.json()
        const detail = data.detail || ''
        if (detail.includes('80%') || detail.includes('forzar') || detail.includes('force')) {
          const shouldForce = window.confirm(
            `${detail}\n\n¿Deseas publicar de todas formas?`
          )
          if (shouldForce) {
            res = await fetch(`/api/properties/${property.id}/publish`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ sale_price: price, force: true }),
            })
          } else {
            setActionLoading(false)
            setShowPublishModal(true) // reopen modal
            return
          }
        } else {
          toast.error(detail)
          setActionLoading(false)
          return
        }
      }

      if (res.ok) {
        toast.success('¡Propiedad publicada exitosamente!')
        await fetchProperty()
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al publicar')
      }
    } catch (error) {
      console.error('Error publishing:', error)
      toast.error('Error de conexión')
    } finally {
      setActionLoading(false)
    }
  }

  const handleStartRenovation = async () => {
    if (!property) return
    setActionLoading(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/start-renovation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: property.id }),
      })
      if (res.ok) {
        toast.success('Renovación iniciada')
        router.push(`/homes/properties/${property.id}/renovate`)
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al iniciar renovación')
      }
    } catch (error) {
      console.error('Error starting renovation:', error)
      toast.error('Error de conexión')
    } finally {
      setActionLoading(false)
    }
  }

  const handleCompleteRenovation = async (newPriceStr: string) => {
    if (!property) return
    
    setShowRenovationPriceModal(false)
    setActionLoading(true)
    
    try {
      const url = new URL(`/api/properties/${property.id}/complete-renovation`, window.location.origin)
      if (newPriceStr && newPriceStr.trim()) {
        const newPrice = parseFloat(newPriceStr)
        if (!isNaN(newPrice) && newPrice > 0) {
          url.searchParams.set('new_sale_price', newPrice.toString())
        }
      }
      
      const res = await fetch(url, { method: 'POST' })
      if (res.ok) {
        toast.success('¡Renovación completada!')
        await fetchProperty()
        await fetchCostBreakdown() // Update financiero with final renovation cost
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al completar renovación')
      }
    } catch (error) {
      console.error('Error completing renovation:', error)
      toast.error('Error de conexión')
    } finally {
      setActionLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!property) return
    
    setShowDeleteModal(false)
    
    try {
      const res = await fetch(`/api/properties/${property.id}`, { method: 'DELETE' })
      if (res.ok) {
        toast.success('Propiedad eliminada')
        router.push('/homes/properties')
      } else {
        toast.error('Error al eliminar')
      }
    } catch (error) {
      console.error('Error deleting:', error)
      toast.error('Error de conexión')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <Building2 className="w-12 h-12 text-navy-300 mx-auto mb-4" />
        <h3 className="font-serif text-xl text-navy-900 mb-2">Propiedad no encontrada</h3>
        <Link href="/homes/properties" className="btn-primary inline-flex mt-4">
          Volver a Propiedades
        </Link>
      </div>
    )
  }

  const status = statusConfig[property.status] || fallbackStatusConfig
  const StatusIcon = status.icon

  return (
    <>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <Link 
              href="/homes/properties" 
              className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Volver a Propiedades
            </Link>
            <h1 className="font-serif text-2xl text-navy-900 flex items-center gap-2 flex-wrap">
              {/* Editable property code badge */}
              {property.property_code && !editingCode && (
                <button
                  onClick={() => { setCodeInput(property.property_code || ''); setEditingCode(true) }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-sm font-bold rounded bg-gold-100 text-gold-700 border border-gold-200 hover:bg-gold-200 transition-colors cursor-pointer"
                  title="Clic para editar código"
                >
                  {property.property_code}
                  <Pencil className="w-3 h-3 opacity-50" />
                </button>
              )}
              {editingCode && (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={e => setCodeInput(e.target.value.toUpperCase())}
                    onKeyDown={e => { if (e.key === 'Enter') handleSavePropertyCode(); if (e.key === 'Escape') setEditingCode(false) }}
                    className="w-20 px-2 py-0.5 text-sm font-bold border-2 border-gold-400 rounded focus:outline-none focus:border-gold-500 bg-white"
                    autoFocus
                    placeholder="A1"
                    maxLength={5}
                  />
                  <button onClick={handleSavePropertyCode} className="p-0.5 rounded hover:bg-emerald-100 text-emerald-600" title="Guardar">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingCode(false)} className="p-0.5 rounded hover:bg-red-100 text-red-500" title="Cancelar">
                    <X className="w-4 h-4" />
                  </button>
                </span>
              )}
              {editingAddress ? (
                <span className="inline-flex items-center gap-1">
                  <input
                    type="text"
                    value={addressInput}
                    onChange={e => setAddressInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleSaveAddress(); if (e.key === 'Escape') setEditingAddress(false) }}
                    onBlur={handleSaveAddress}
                    className="px-2 py-0.5 text-xl font-serif border-2 border-blue-400 rounded focus:outline-none focus:border-blue-500 bg-white min-w-[200px]"
                    autoFocus
                  />
                  <button onClick={handleSaveAddress} className="p-0.5 rounded hover:bg-emerald-100 text-emerald-600" title="Guardar">
                    <Check className="w-4 h-4" />
                  </button>
                  <button onClick={() => setEditingAddress(false)} className="p-0.5 rounded hover:bg-red-100 text-red-500" title="Cancelar">
                    <X className="w-4 h-4" />
                  </button>
                </span>
              ) : (
                <span
                  className="group cursor-pointer hover:text-navy-600 transition-colors"
                  onClick={() => { setAddressInput(property.address); setEditingAddress(true) }}
                  title="Clic para editar nombre"
                >
                  {property.address}
                  <Pencil className="w-3.5 h-3.5 inline ml-1.5 opacity-0 group-hover:opacity-50 text-navy-400" />
                </span>
              )}
            </h1>
            {property.city && (
              <div className="flex items-center gap-1 text-navy-500 mt-1">
                <MapPin className="w-4 h-4" />
                {property.city}, {property.state}
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            <div className={`badge ${status.color}`}>
              <StatusIcon className="w-4 h-4" />
              {status.label}
            </div>
            {property.is_renovated && (
              <div className="badge bg-purple-50 border-purple-200 text-purple-700">
                <Paintbrush className="w-4 h-4" />
                Renovada
              </div>
            )}
          </div>
        </div>

        {/* Actions based on status */}
        <div className="card-luxury p-4">
          <h3 className="font-medium text-navy-900 mb-3">Acciones Disponibles</h3>
          <div className="flex flex-wrap gap-2">
            {/* Después de comprar: Publicar O Renovar antes de publicar */}
            {property.status === 'purchased' && (
              <>
              <button 
                onClick={openPublishModal}
                disabled={actionLoading}
                className="btn-gold"
              >
                <Image className="w-5 h-5" />
                Fotos / Publicar
              </button>
                <button 
                  onClick={handleStartRenovation}
                  disabled={actionLoading}
                  className="btn-primary"
                >
                  <Paintbrush className="w-5 h-5" />
                  Renovar antes de Publicar
                </button>
              </>
            )}
            
            {/* Publicada: WhatsApp, Renovar */}
            {property.status === 'published' && (
              <>
                <button
                  onClick={openWhatsAppModal}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors"
                >
                  <MessageCircle className="w-5 h-5" />
                  WhatsApp
                </button>
                <button
                  onClick={handleStartRenovation}
                  disabled={actionLoading}
                  className="btn-primary"
                >
                  <Paintbrush className="w-5 h-5" />
                  {property.is_renovated ? 'Renovar de Nuevo' : 'Renovar'}
                </button>
              </>
            )}

            {/* Renovando */}
            {property.status === 'renovating' && (
              <>
                <Link 
                  href={`/homes/properties/${property.id}/renovate`}
                  className="btn-primary"
                >
                  <Paintbrush className="w-5 h-5" />
                  Gestionar Renovación
                </Link>
                <button
                  onClick={async () => {
                    // Fetch post-renovation price breakdown
                    try {
                      const res = await fetch(`/api/properties/${property.id}/post-renovation-price`)
                      if (res.ok) {
                        const data = await res.json()
                        if (data.ok) setPostRenoPrice(data)
                      }
                    } catch (err) { /* silent */ }
                    setShowRenovationPriceModal(true)
                  }}
                  disabled={actionLoading}
                  className="btn-gold"
                >
                  <CheckCircle2 className="w-5 h-5" />
                  Publicar
                </button>
              </>
            )}

            {property.status !== 'sold' && (
              <>
                {/* Solo mostrar Checklist si NO está completado */}
                {!property.checklist_completed && (
                  <Link 
                    href={`/homes/properties/${property.id}/checklist`}
                    className="btn-primary"
                  >
                    <ClipboardCheck className="w-5 h-5" />
                    Checklist Compra
                  </Link>
                )}
                <button
                  onClick={() => openMoveModal('purchase')}
                  className="flex items-center gap-2 px-4 py-2 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg font-medium hover:bg-orange-100 transition-colors"
                >
                  <Truck className="w-5 h-5" />
                  Contratar Movida
                </button>
                <Link 
                  href={`/homes/properties/${property.id}/photos`}
                  className="btn-primary"
                >
                  <Image className="w-5 h-5" />
                  Gestionar Fotos
                </Link>
                <Link 
                  href={`/homes/properties/${property.id}/edit`}
                  className="btn-ghost"
                >
                  <Edit className="w-5 h-5" />
                  Editar
                </Link>
                <button 
                  onClick={() => setShowDeleteModal(true)}
                  className="btn-ghost text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="w-5 h-5" />
                  Eliminar
                </button>
              </>
            )}
          </div>
        </div>

        {/* RTO Context Banner — shown when property has a sale transfer to Capital */}
        {transfers.sale && transfers.sale.to_name === 'Maninos Homes LLC' && (
          <div className="p-4 bg-purple-50 border border-purple-200 rounded-xl flex items-start gap-3">
            <div className="p-2 bg-purple-100 rounded-lg flex-shrink-0">
              <Landmark className="w-5 h-5 text-purple-600" />
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-purple-900 text-sm">
                🏛 Propiedad gestionada por Maninos Homes (RTO)
              </h3>
              <p className="text-purple-700 text-xs mt-1">
                Esta propiedad fue adquirida por Capital para un contrato Rent-to-Own. 
                Los documentos de transferencia deben estar a nombre de <strong>Maninos Homes LLC</strong>.
              </p>
              <div className="flex items-center gap-4 mt-2 text-xs text-purple-600">
                <span className="flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5" />
                  Estado docs: <strong className="ml-1">
                    {transfers.sale.status === 'completed' ? '✅ Completado' 
                      : transfers.sale.status === 'in_progress' ? '⏳ En proceso'
                      : '📋 Pendiente'}
                  </strong>
                </span>
                {property.status === 'reserved' && (
                  <span className="text-orange-600 font-medium">
                    ⚠️ Pendiente: marcar como vendida al activar contrato
                  </span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photos */}
            <div className="card-luxury p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium text-navy-900 flex items-center gap-2">
                  <Image className="w-5 h-5 text-gold-500" />
                  Fotos
                  {property.photos.length > 0 && (
                    <span className="text-sm font-normal text-navy-500">
                      ({property.photos.length})
                    </span>
                  )}
                </h3>
                {property.status !== 'sold' && (
                  <Link
                    href={`/homes/properties/${property.id}/photos`}
                    className="text-sm text-gold-600 hover:text-gold-700 font-medium"
                  >
                    + Agregar fotos
                  </Link>
                )}
              </div>
              {property.photos.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {property.photos.map((url, i) => (
                    <div key={i} className="relative group">
                      <img 
                        src={url}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-32 object-cover rounded-lg cursor-pointer hover:opacity-90 transition-opacity"
                        onClick={() => window.open(url, '_blank')}
                      />
                      {i === 0 && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-gold-500 text-white text-xs font-medium rounded-full">
                          Principal
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <Link 
                  href={`/homes/properties/${property.id}/photos`}
                  className="block text-center py-8 bg-navy-50 rounded-lg hover:bg-navy-100 transition-colors cursor-pointer"
                >
                  <Image className="w-8 h-8 text-navy-300 mx-auto mb-2" />
                  <p className="text-navy-500 text-sm">Sin fotos</p>
                  <p className="text-gold-600 text-sm mt-1 font-medium">Haz clic para agregar</p>
                </Link>
              )}
            </div>

            {/* Property Details */}
            <div className="card-luxury p-4 sm:p-6">
              <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
                <Home className="w-5 h-5 text-gold-500" />
                Detalles
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {(() => {
                  const EditableDetailField = ({ label, value, field, suffix }: { label: string; value?: number | null; field: string; suffix?: string }) => {
                    const [editing, setEditing] = React.useState(false);
                    const [val, setVal] = React.useState(String(value ?? ''));

                    const save = async () => {
                      setEditing(false);
                      const num = val === '' ? null : Number(val);
                      if (num === value) return;
                      try {
                        await fetch(`/api/properties/${property.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ [field]: num }),
                        });
                        await fetchProperty();
                        toast.success(`${label} actualizado`);
                      } catch { toast.error('Error guardando'); }
                    };

                    return (
                      <div className="group">
                        <p className="text-sm text-navy-500">{label}</p>
                        {editing ? (
                          <input
                            type="number"
                            className="w-full px-2 py-0.5 border border-blue-300 rounded text-sm bg-blue-50 font-medium"
                            value={val}
                            onChange={e => setVal(e.target.value)}
                            onBlur={save}
                            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(String(value ?? '')); setEditing(false); } }}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="font-medium text-navy-900 cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-1 -mx-1 rounded transition-colors flex items-center gap-1"
                            onClick={() => { setVal(String(value ?? '')); setEditing(true); }}
                            title="Click para editar"
                          >
                            {value != null ? `${value}${suffix ?? ''}` : '—'}
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                          </p>
                        )}
                      </div>
                    );
                  };

                  const EditableSqftField = () => {
                    const currentVal = property.square_feet ?? (property.length_ft && property.width_ft ? property.length_ft * property.width_ft : null);
                    const [editing, setEditing] = React.useState(false);
                    const [val, setVal] = React.useState(String(currentVal ?? ''));

                    const save = async () => {
                      setEditing(false);
                      const num = val === '' ? null : Number(val);
                      if (num === currentVal) return;
                      try {
                        await fetch(`/api/properties/${property.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ square_feet: num }),
                        });
                        await fetchProperty();
                        toast.success('Medida actualizada');
                      } catch { toast.error('Error guardando'); }
                    };

                    return (
                      <div className="group">
                        <p className="text-sm text-navy-500">Medida</p>
                        {editing ? (
                          <input
                            type="number"
                            className="w-full px-2 py-0.5 border border-blue-300 rounded text-sm bg-blue-50 font-medium"
                            value={val}
                            placeholder="ft²"
                            onChange={e => setVal(e.target.value)}
                            onBlur={save}
                            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setVal(String(currentVal ?? '')); setEditing(false); } }}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="font-medium text-navy-900 cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-1 -mx-1 rounded transition-colors flex items-center gap-1"
                            onClick={() => { setVal(String(currentVal ?? '')); setEditing(true); }}
                            title="Click para editar"
                          >
                            {property.length_ft && property.width_ft ? (
                              <>{property.length_ft} × {property.width_ft} <span className="text-sm font-normal text-navy-400">({(property.length_ft * property.width_ft).toLocaleString()} ft²)</span></>
                            ) : currentVal ? (
                              <>{currentVal.toLocaleString()} ft²</>
                            ) : '—'}
                            <Pencil className="w-2.5 h-2.5 opacity-0 group-hover:opacity-50 flex-shrink-0" />
                          </p>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <EditableDetailField label="Año" value={property.year} field="year" />
                      <EditableDetailField label="Habitaciones" value={property.bedrooms} field="bedrooms" />
                      <EditableDetailField label="Baños" value={property.bathrooms} field="bathrooms" />
                      <EditableSqftField />
                      <DetailItem label="HUD" value={property.hud_number} />
                      <DetailItem label="Código Postal" value={property.zip_code} />
                      <DetailItem label="ID" value={property.property_code} />
                    </>
                  );
                })()}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Financials */}
            <div className="card-luxury p-4 sm:p-6">
              <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gold-500" />
                Financiero
              </h3>
              <div className="space-y-2 text-sm">
                {(() => {
                  const purchase = Math.round(Number(property.purchase_price || 0));
                  const reno = Math.round(Number(costBreakdown?.renovation_cost || 0));
                  const move = Math.round(Number(costBreakdown?.move_cost || 0));
                  const commission = Math.round(Number(costBreakdown?.commission || 1500));
                  const margin = Math.round(Number(costBreakdown?.margin || 9500));
                  const totalInversion = purchase + reno + move;
                  const precioMinimo = totalInversion + commission + margin;
                  const salePrice = Math.round(Number(property.sale_price || 0));
                  const ganancia = salePrice > 0 ? salePrice - precioMinimo + margin : 0;

                  // Editable field helper
                  const EditableField = ({ label, value, field, bold, color }: { label: string; value: number; field: string; bold?: boolean; color?: string }) => {
                    const [editing, setEditing] = React.useState(false);
                    const [val, setVal] = React.useState(String(value));

                    const save = async () => {
                      setEditing(false);
                      const num = Math.round(Number(val) || 0);
                      if (num === value) return;
                      try {
                        await fetch(`/api/properties/${property.id}`, {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ [field]: num }),
                        });
                        await fetchProperty();
                        await fetchCostBreakdown();
                        toast.success(`${label} actualizado`);
                      } catch { toast.error('Error guardando'); }
                    };

                    return (
                      <div className="flex justify-between items-center group">
                        <span className="text-navy-500">{label}</span>
                        {editing ? (
                          <input
                            type="number"
                            className="w-24 px-2 py-0.5 border border-blue-300 rounded text-right text-sm bg-blue-50"
                            value={val}
                            onChange={e => setVal(e.target.value)}
                            onBlur={save}
                            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
                            autoFocus
                          />
                        ) : (
                          <span
                            className={`cursor-pointer hover:bg-blue-50 hover:text-blue-700 px-1 rounded transition-colors ${bold ? 'font-bold' : 'font-semibold'} ${color || (value ? 'text-navy-900' : 'text-gray-400 italic')}`}
                            onClick={() => { setVal(String(value)); setEditing(true); }}
                            title="Click para editar"
                          >
                            ${value.toLocaleString()}
                            <Pencil className="w-2.5 h-2.5 inline ml-1 opacity-0 group-hover:opacity-50" />
                          </span>
                        )}
                      </div>
                    );
                  };

                  return (
                    <>
                      <EditableField label="Compra" value={purchase} field="purchase_price" bold />
                      <EditableField label="Renovación" value={reno} field="renovation_cost" />
                      <EditableField label="Movida" value={move} field="move_cost" />
                      <EditableField label="Comisión" value={commission} field="commission" />
                      <EditableField label="Margen" value={margin} field="margin" />
                      <div className="pt-2 border-t border-navy-100">
                        <div className="flex justify-between items-center text-xs text-navy-400">
                          <span>Total inversión</span>
                          <span>${totalInversion.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="pt-1">
                        <div className="flex justify-between items-center">
                          <span className="text-navy-500 font-medium">Precio mínimo venta</span>
                          <span className="font-bold text-amber-600">${precioMinimo.toLocaleString()}</span>
                        </div>
                      </div>
                      <div className="pt-2 border-t border-navy-100">
                        <EditableField label="Precio de venta" value={salePrice} field="sale_price" bold color="text-gold-600" />
                      </div>
                      {salePrice > 0 && (
                        <div className="pt-2 border-t border-navy-100">
                          <div className="flex justify-between items-center">
                            <span className="text-navy-500">Ganancia real</span>
                            <span className={`font-bold ${ganancia >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              ${ganancia.toLocaleString()}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Timeline */}
            <div className="card-luxury p-4 sm:p-6">
              <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
                <Calendar className="w-5 h-5 text-gold-500" />
                Historial
              </h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-navy-500">Creada</span>
                  <span className="text-navy-700">
                    {new Date(property.created_at).toLocaleDateString('es-MX')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-navy-500">Actualizada</span>
                  <span className="text-navy-700">
                    {new Date(property.updated_at).toLocaleDateString('es-MX')}
                  </span>
                </div>
              </div>
            </div>

            {/* Manual Title Notes — always shown for manual-upload properties */}
            {property.document_data?.title_app_purchase?._manual_upload && (
              (() => {
                const titleNotes: string = property.document_data.title_app_purchase._manual_notes || ''
                const propNotes: string = property.notes || ''
                return (
                  <div className="card-luxury p-4 sm:p-6 border-l-4 border-amber-400">
                    <h3 className="font-medium text-navy-900 mb-3 flex items-center gap-2">
                      <FileText className="w-4 h-4 text-amber-500" />
                      Notas — Título Manual
                    </h3>
                    <div className="space-y-2">
                      {titleNotes && (
                        <p className="text-sm text-navy-700 leading-relaxed whitespace-pre-wrap">
                          {titleNotes}
                        </p>
                      )}
                      {propNotes && titleNotes && (
                        <hr className="border-sand my-2" />
                      )}
                      {propNotes && (
                        <p className="text-xs text-slate leading-relaxed whitespace-pre-wrap">
                          {propNotes}
                        </p>
                      )}
                      {!titleNotes && !propNotes && (
                        <p className="text-xs text-slate italic">
                          Sin notas. Edita el título desde la sección Títulos para añadir.
                        </p>
                      )}
                    </div>
                  </div>
                )
              })()
            )}
          </div>
        </div>

        {/* Documents Section */}
        <div className="card-luxury p-4 sm:p-6">
          <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-gold-500" />
            Documentos de la Transacción
          </h3>

          {/* Bill of Sale Template (if open) */}
          {showBosTemplate && (
            <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
              <BillOfSaleTemplate
                transactionType={showBosTemplate}
                initialData={{
                  // Default values from property
                  ...(showBosTemplate === 'purchase' ? {
                    seller_name: '',
                    buyer_name: 'MANINOS HOMES',
                  } : {
                    seller_name: 'MANINOS HOMES',
                    buyer_name: '',
                  }),
                  manufacturer: '',
                  bedrooms: property.bedrooms?.toString() || '',
                  baths: property.bathrooms?.toString() || '',
                  dimensions: property.length_ft && property.width_ft
                    ? `${property.length_ft} x ${property.width_ft} (${(property.length_ft * property.width_ft).toLocaleString()} sqft)`
                    : property.square_feet ? `${property.square_feet} sqft` : '',
                  location_of_home: `${property.address}, ${property.city || ''}, ${property.state || 'TX'}`,
                  hud_label_number: property.hud_number || '',
                  total_payment: showBosTemplate === 'purchase' 
                    ? `$${property.purchase_price?.toLocaleString() || ''}` 
                    : `$${property.sale_price?.toLocaleString() || ''}`,
                  date_manufactured: property.year?.toString() || '',
                  buyer_date: new Date().toISOString().split('T')[0],
                  is_new: false,
                  is_used: true,
                  // Override with previously saved data (employee-filled fields)
                  // Filter out _uploaded_file metadata if BOS was uploaded as a file
                  ...(() => {
                    const saved = property.document_data?.[`bos_${showBosTemplate}`] || {}
                    const { _uploaded_file, file_url, file_name, ...templateData } = saved
                    return templateData
                  })(),
                  // Merge envelope signature (image/type only — don't override saved names)
                  ...(() => {
                    const sigKey = showBosTemplate === 'purchase' ? 'bos' : 'bos_sale'
                    const sig = sellerSignatures[sigKey]
                    if (!sig?.signed) return {}
                    const saved = property.document_data?.[`bos_${showBosTemplate}`] || {}
                    const extra: Record<string, any> = {}
                    extra.seller_signature_type = sig.signature_type
                    if (sig.signature_type === 'drawn') {
                      extra.seller_signature_image = sig.signature_value
                      // Only set seller_name from envelope if not already in saved data
                      if (!saved.seller_name && sig.signer_name) extra.seller_name = sig.signer_name
                    } else if (!saved.seller_name) {
                      extra.seller_name = sig.signature_value
                    }
                    return extra
                  })(),
                }}
                onSave={async (file, data) => {
                  // 1. Save the filled-in form data to property.document_data (replaces _uploaded_file)
                  const saved = await saveDocumentData(`bos_${showBosTemplate}`, data)

                  // 2. Upload the generated PDF to the transfer
                  const transferId = showBosTemplate === 'purchase' ? transfers.purchase?.id : transfers.sale?.id
                  if (transferId) {
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      await fetch(`/api/transfers/${transferId}/documents/bill_of_sale`, {
                        method: 'POST',
                        body: formData,
                      })
                      fetchTransfers()
                    } catch (err) { console.error('Upload error:', err) }
                  }
                  if (saved) {
                    toast.success('✓ Bill of Sale guardado con datos')
                  }
                  setShowBosTemplate(null)
                }}
                onClose={() => setShowBosTemplate(null)}
              />
            </div>
          )}

          {/* Title Application Template (if open) */}
          {showTitleAppTemplate && (
            <div className="mb-4 border border-gray-200 rounded-xl overflow-hidden">
              <TitleApplicationTemplate
                transactionType={showTitleAppTemplate}
                initialData={{
                  // Block 1 defaults
                  is_new: false,
                  is_used: true,
                  // Block 2A — from property data
                  year: property.year?.toString() || '',
                  total_sqft: property.square_feet?.toString() || '',
                  sqft: property.square_feet?.toString() || '',
                  bedrooms: property.bedrooms?.toString() || '',
                  bathrooms: property.bathrooms?.toString() || '',
                  // Block 2B — default Yes
                  has_hud_label: true,
                  no_hud_label: false,
                  // Block 3 — default from property address
                  location_address: property.address || '',
                  location_city: property.city || '',
                  location_state: property.state || 'TX',
                  location_zip: property.zip_code || '',
                  location_county: '',
                  home_moved: false,
                  home_moved_no: true,
                  home_installed: false,
                  home_installed_no: true,
                  hud_number: property.hud_number || '',
                  // Block 4 — ownership
                  ...(showTitleAppTemplate === 'purchase' ? {
                    applicant_name: 'MANINOS HOMES LLC',
                    buyer_name: 'MANINOS HOMES LLC',
                    seller_name: '',
                  } : {
                    seller_name: 'MANINOS HOMES LLC',
                    applicant_name: '',
                    buyer_name: '',
                  }),
                  sale_price: showTitleAppTemplate === 'purchase'
                    ? `$${property.purchase_price?.toLocaleString() || ''}`
                    : `$${property.sale_price?.toLocaleString() || ''}`,
                  sale_date: new Date().toISOString().split('T')[0],
                  sale_transfer_date: new Date().toISOString().split('T')[0],
                  // Block 6 — default Inventory
                  election_inventory: true,
                  // Override with previously saved data (employee-filled fields)
                  // Also check legacy "title_app" key (before key was fixed to title_app_{type})
                  ...(property.document_data?.title_app || {}),
                  ...(property.document_data?.[`title_app_${showTitleAppTemplate}`] || {}),
                  // Merge envelope signature (image/type only — don't override saved names)
                  ...(() => {
                    const sigKey = showTitleAppTemplate === 'purchase' ? 'title_app' : 'title_app_sale'
                    const sig = sellerSignatures[sigKey]
                    if (!sig?.signed) return {}
                    const saved = property.document_data?.[`title_app_${showTitleAppTemplate}`] || property.document_data?.title_app || {}
                    const extra: Record<string, any> = {}
                    extra.seller_signature_type = sig.signature_type
                    if (sig.signature_type === 'drawn') {
                      extra.seller_signature_image = sig.signature_value
                      if (!saved.seller_name && sig.signer_name) extra.seller_name = sig.signer_name
                    } else if (!saved.seller_name) {
                      extra.seller_signature_value = sig.signature_value
                    }
                    return extra
                  })(),
                }}
                onSave={async (file, data) => {
                  // 1. Save the filled-in form data to property.document_data
                  const saved = await saveDocumentData(`title_app_${showTitleAppTemplate}`, data)

                  // 2. Upload the generated PDF to the transfer
                  const transferId = showTitleAppTemplate === 'purchase' ? transfers.purchase?.id : transfers.sale?.id
                  if (transferId) {
                    const formData = new FormData()
                    formData.append('file', file)
                    try {
                      await fetch(`/api/transfers/${transferId}/documents/title_application`, {
                        method: 'POST',
                        body: formData,
                      })
                      fetchTransfers()
                    } catch (err) { console.error('Upload error:', err) }
                  }
                  if (saved) {
                    toast.success('Aplicacion de Titulo guardada con datos')
                    // Auto-populate serial/label on the title transfer for TDHCA monitoring
                    if (transferId) {
                      fetch(`/api/transfers/${transferId}/populate-tdhca`, { method: 'POST' }).catch(() => {})
                    }
                  }
                  setShowTitleAppTemplate(null)
                }}
                onClose={() => setShowTitleAppTemplate(null)}
              />
            </div>
          )}

          {/* Document generation buttons */}
          {!showBosTemplate && !showTitleAppTemplate && (
            <div className="flex flex-wrap gap-2 mb-4">
              {/* Bill of Sale (Compra) — uploaded file or template */}
              <div className="flex items-center gap-1">
                {property.document_data?.bos_purchase?._uploaded_file && (
                  <a
                    href={property.document_data.bos_purchase.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Bill of Sale (Compra) — Ver PDF ↗
                  </a>
                )}
                <button
                  onClick={() => setShowBosTemplate('purchase')}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                    property.document_data?.bos_purchase
                      ? property.document_data.bos_purchase._uploaded_file
                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100'
                  }`}
                >
                  {property.document_data?.bos_purchase?._uploaded_file ? (
                    <><Pencil className="w-3.5 h-3.5" /> Editar</>
                  ) : property.document_data?.bos_purchase ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Bill of Sale (Compra)</>
                  ) : (
                    <><FileText className="w-3.5 h-3.5" /> Bill of Sale (Compra)</>
                  )}
                </button>
              </div>
              {/* Aplicación Título (Compra) */}
              <button
                onClick={() => setShowTitleAppTemplate('purchase')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                  property.document_data?.title_app_purchase
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                }`}
              >
                {property.document_data?.title_app_purchase ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                Aplicación Título (Compra)
              </button>
              {/* Bill of Sale (Venta) */}
              <div className="flex items-center gap-1">
                {property.document_data?.bos_sale?._uploaded_file && (
                  <a
                    href={property.document_data.bos_sale.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Bill of Sale (Venta) — Ver PDF ↗
                  </a>
                )}
                <button
                  onClick={() => setShowBosTemplate('sale')}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                    property.document_data?.bos_sale
                      ? property.document_data.bos_sale._uploaded_file
                        ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                        : 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                      : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                  }`}
                >
                  {property.document_data?.bos_sale?._uploaded_file ? (
                    <><Pencil className="w-3.5 h-3.5" /> Editar</>
                  ) : property.document_data?.bos_sale ? (
                    <><CheckCircle2 className="w-3.5 h-3.5" /> Bill of Sale (Venta)</>
                  ) : (
                    <><FileText className="w-3.5 h-3.5" /> Bill of Sale (Venta)</>
                  )}
                </button>
              </div>
              {/* Aplicación Título (Venta) */}
              <button
                onClick={() => setShowTitleAppTemplate('sale')}
                className={`flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${
                  property.document_data?.title_app_sale
                    ? 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                }`}
              >
                {property.document_data?.title_app_sale ? <CheckCircle2 className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                Aplicación Título (Venta)
              </button>

              {/* TDHCA Title Link — always visible if serial/label exists */}
              {(() => {
                const titleData = property.document_data?.title_app_purchase || {};
                const serial = titleData.section1_serial || property.hud_number || '';
                const label = titleData.section1_label || '';
                if (!serial && !label) return null;
                const searchParam = serial ? `serialNum=${encodeURIComponent(serial)}` : `labelNum=${encodeURIComponent(label)}`;
                const tdhcaUrl = `https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp?${searchParam}`;
                return (
                  <a
                    href={tdhcaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-2 text-xs font-medium border rounded-lg bg-green-50 text-green-700 border-green-200 hover:bg-green-100 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Ver Título TDHCA {serial ? `(Serial: ${serial})` : `(Label: ${label})`}
                  </a>
                );
              })()}
            </div>
          )}

          {/* ═══ E-Sign: Send documents for signature ═══ */}
          {!showBosTemplate && !showTitleAppTemplate && (
            <div className="space-y-3 mb-4">
              {/* ── Purchase documents e-sign ── */}
              <div className="space-y-2">
                {/* BOS Compra — send for signature */}
                {property.document_data?.bos_purchase && !property.document_data.bos_purchase._uploaded_file && (
                    esignEmailFor === 'bos' ? (
                      <div className="rounded-xl border-2 border-blue-300 bg-blue-50 p-3">
                        <p className="text-xs font-semibold text-blue-800 mb-2">Email del vendedor para firmar Bill of Sale (Compra):</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="vendedor@email.com"
                            className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            onKeyDown={(e) => e.key === 'Enter' && sendForEsign('bos')}
                            autoFocus
                          />
                          <button
                            onClick={() => sendForEsign('bos')}
                            disabled={esignSending || !esignEmail.trim()}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                              esignSending || !esignEmail.trim()
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button onClick={() => { setEsignEmailFor(null); setEsignEmail(''); }} className="px-2 py-2 text-gray-500 hover:text-gray-700">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('bos'); setEsignEmail(''); }}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 transition-colors"
                      >
                        <Send className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">Enviar Bill of Sale (Compra) para Firma</span>
                      </button>
                    )
                  )}

                  {/* Title App Compra — send for signature (always available) */}
                  {esignEmailFor === 'title_app' ? (
                      <div className="rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3">
                        <p className="text-xs font-semibold text-indigo-800 mb-2">Email del vendedor para firmar Cambio de Título (Compra):</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="vendedor@email.com"
                            className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            onKeyDown={(e) => e.key === 'Enter' && sendForEsign('title_app')}
                            autoFocus
                          />
                          <button
                            onClick={() => sendForEsign('title_app')}
                            disabled={esignSending || !esignEmail.trim()}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                              esignSending || !esignEmail.trim()
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-indigo-600 text-white hover:bg-indigo-700'
                            }`}
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button onClick={() => { setEsignEmailFor(null); setEsignEmail(''); }} className="px-2 py-2 text-gray-500 hover:text-gray-700">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('title_app'); setEsignEmail(''); }}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                      >
                        <Send className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-700">Enviar Cambio de Título (Compra) para Firma</span>
                      </button>
                    )
                  }
              </div>

              {/* ── Sale documents e-sign ── */}
              {(property.document_data?.bos_sale || property.document_data?.title_app_sale) && (
                <div className="space-y-2">
                  {/* BOS Venta — send for signature */}
                  {property.document_data?.bos_sale && !property.document_data.bos_sale._uploaded_file && (
                    esignEmailFor === 'bos_sale' ? (
                      <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-3">
                        <p className="text-xs font-semibold text-purple-800 mb-2">Email del comprador para firmar Bill of Sale (Venta):</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="comprador@email.com"
                            className="flex-1 border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            onKeyDown={(e) => e.key === 'Enter' && sendForEsign('bos_sale')}
                            autoFocus
                          />
                          <button
                            onClick={() => sendForEsign('bos_sale')}
                            disabled={esignSending || !esignEmail.trim()}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                              esignSending || !esignEmail.trim()
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button onClick={() => { setEsignEmailFor(null); setEsignEmail(''); }} className="px-2 py-2 text-gray-500 hover:text-gray-700">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('bos_sale'); setEsignEmail(''); }}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 transition-colors"
                      >
                        <Send className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-semibold text-purple-700">Enviar Bill of Sale (Venta) para Firma</span>
                      </button>
                    )
                  )}

                  {/* Title App Venta — send for signature */}
                  {property.document_data?.title_app_sale && (
                    esignEmailFor === 'title_app_sale' ? (
                      <div className="rounded-xl border-2 border-purple-300 bg-purple-50 p-3">
                        <p className="text-xs font-semibold text-purple-800 mb-2">Email del comprador para firmar Cambio de Título (Venta):</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="comprador@email.com"
                            className="flex-1 border border-purple-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                            onKeyDown={(e) => e.key === 'Enter' && sendForEsign('title_app_sale')}
                            autoFocus
                          />
                          <button
                            onClick={() => sendForEsign('title_app_sale')}
                            disabled={esignSending || !esignEmail.trim()}
                            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                              esignSending || !esignEmail.trim()
                                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                                : 'bg-purple-600 text-white hover:bg-purple-700'
                            }`}
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button onClick={() => { setEsignEmailFor(null); setEsignEmail(''); }} className="px-2 py-2 text-gray-500 hover:text-gray-700">
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('title_app_sale'); setEsignEmail(''); }}
                        className="w-full flex items-center justify-center gap-2 p-2.5 rounded-xl border-2 border-purple-300 bg-purple-50 hover:bg-purple-100 transition-colors"
                      >
                        <Send className="w-4 h-4 text-purple-600" />
                        <span className="text-sm font-semibold text-purple-700">Enviar Cambio de Título (Venta) para Firma</span>
                      </button>
                    )
                  )}
                </div>
              )}

              {/* ═══ Signature Status Display ═══ */}
              <PropertySignedDocs propertyId={property.id} refreshKey={signRefreshKey} />
            </div>
          )}

          {/* Transfer status info (without TitleTransferCard) */}
          {transfers.sale && transfers.sale.to_name === 'Maninos Homes LLC' && (
            <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-sm text-purple-700 flex items-center gap-2">
              <Landmark className="w-4 h-4" /> Transferencia RTO a Capital en proceso
            </div>
          )}
          {property.status === 'sold' && !transfers.sale && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center text-amber-700 text-sm">
              Transferencia de venta pendiente de registro
            </div>
          )}
        </div>

        {/* ========== MOVIDA (MOVES) SECTION ========== */}
        {moves.length > 0 && (
          <div className="card-luxury p-4 sm:p-6">
            <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <Truck className="w-5 h-5 text-orange-500" />
              Movidas (Transporte)
              <span className="ml-auto text-sm font-normal text-navy-500">
                {moves.length} movida{moves.length !== 1 ? 's' : ''}
              </span>
            </h3>
            <div className="space-y-3">
              {moves.map((move: any) => {
                const isExpanded = expandedMove === move.id
                const statusLabel: Record<string, { text: string; color: string; bg: string }> = {
                  pending: { text: 'Pendiente', color: 'text-gray-700', bg: 'bg-gray-100' },
                  scheduled: { text: 'Programada', color: 'text-blue-700', bg: 'bg-blue-100' },
                  in_transit: { text: 'En Tránsito', color: 'text-orange-700', bg: 'bg-orange-100' },
                  completed: { text: 'Completada', color: 'text-green-700', bg: 'bg-green-100' },
                  cancelled: { text: 'Cancelada', color: 'text-red-700', bg: 'bg-red-100' },
                }
                const st = statusLabel[move.status] || statusLabel.pending
                const typeLabel: Record<string, string> = {
                  purchase: 'Compra → Yard',
                  sale: 'Yard → Cliente',
                  yard_transfer: 'Entre Yards',
                }

                return (
                  <div key={move.id} className="border border-gray-200 rounded-xl overflow-hidden">
                    {/* Header */}
                    <div
                      className="flex items-center gap-3 p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                      onClick={() => setExpandedMove(isExpanded ? null : move.id)}
                    >
                      <Truck className="w-5 h-5 text-orange-500 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-navy-900 text-sm">
                            {typeLabel[move.move_type] || move.move_type}
                          </span>
                          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${st.bg} ${st.color}`}>
                            {st.text}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                          {move.origin_city && <span>{move.origin_city}</span>}
                          {move.origin_city && move.destination_city && <span>→</span>}
                          {move.destination_city && <span>{move.destination_city}</span>}
                          {move.destination_yard && <span className="text-orange-600">({move.destination_yard})</span>}
                          {move.scheduled_date && (
                            <span className="ml-2">· 📅 {new Date(move.scheduled_date).toLocaleDateString('es-MX')}</span>
                          )}
                        </div>
                      </div>
                      {move.quoted_cost > 0 && (
                        <span className="text-sm font-bold text-navy-900">${Number(move.quoted_cost).toLocaleString()}</span>
                      )}
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="border-t border-gray-100 p-4 bg-gray-50 space-y-3">
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          {move.moving_company && (
                            <div><span className="text-gray-500">Compañía:</span> <span className="font-medium text-navy-900">{move.moving_company}</span></div>
                          )}
                          {move.driver_name && (
                            <div><span className="text-gray-500">Conductor:</span> <span className="font-medium text-navy-900">{move.driver_name}</span></div>
                          )}
                          {move.driver_phone && (
                            <div className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" /><span className="font-medium text-navy-900">{move.driver_phone}</span></div>
                          )}
                          {move.estimated_distance_miles && (
                            <div><span className="text-gray-500">Distancia:</span> <span className="font-medium text-navy-900">{move.estimated_distance_miles} millas</span></div>
                          )}
                          {move.origin_address && (
                            <div className="col-span-2"><span className="text-gray-500">Origen:</span> <span className="font-medium text-navy-900">{move.origin_address}</span></div>
                          )}
                          {move.destination_address && (
                            <div className="col-span-2"><span className="text-gray-500">Destino:</span> <span className="font-medium text-navy-900">{move.destination_address}</span></div>
                          )}
                          {(move.requires_escort || move.requires_wide_load_permit) && (
                            <div className="col-span-2 flex gap-2">
                              {move.requires_escort && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">🚔 Escolta requerida</span>}
                              {move.requires_wide_load_permit && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">📋 Permiso carga ancha</span>}
                            </div>
                          )}
                          {move.final_cost > 0 && (
                            <div><span className="text-gray-500">Costo final:</span> <span className="font-bold text-green-700">${Number(move.final_cost).toLocaleString()}</span></div>
                          )}
                          {move.notes && (
                            <div className="col-span-2"><span className="text-gray-500">Notas:</span> <span className="text-navy-700">{move.notes}</span></div>
                          )}
                          {move.special_instructions && (
                            <div className="col-span-2"><span className="text-gray-500">Instrucciones:</span> <span className="text-navy-700">{move.special_instructions}</span></div>
                          )}
                        </div>

                        {/* SMS + Payment actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                          {/* SMS to provider */}
                          {move.driver_phone && moverProviders.length > 0 && (() => {
                            const matchedProvider = moverProviders.find((p: any) => p.phone === move.driver_phone || p.name === move.driver_name)
                            if (matchedProvider) {
                              return (
                                <button
                                  onClick={() => handleSmsProvider(matchedProvider.id, move)}
                                  className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 flex items-center gap-1"
                                >
                                  📱 Mensaje a {matchedProvider.name.split(' ')[0]}
                                </button>
                              )
                            }
                            return null
                          })()}

                          {/* Request payment to Abigail */}
                          {(move.payment_status === 'not_requested' || !move.payment_status) && (
                            <button
                              onClick={() => handleRequestPayment(move.id)}
                              disabled={requestingPayment === move.id}
                              className="text-xs px-3 py-1.5 bg-gold-50 text-gold-700 border border-gold-200 rounded-lg hover:bg-gold-100 flex items-center gap-1"
                              style={{ backgroundColor: '#fef9e7', color: '#92400e', borderColor: '#fde68a' }}
                            >
                              💰 {requestingPayment === move.id ? 'Creando...' : 'Solicitar Pago a Abigail'}
                            </button>
                          )}
                          {move.payment_status === 'paid' && (
                            <span className="text-xs px-3 py-1.5 bg-green-50 text-green-700 rounded-lg font-medium">
                              ✅ Pagado
                            </span>
                          )}
                          {move.payment_status === 'pending' && (
                            <span className="text-xs px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-lg font-medium">
                              ⏳ Pago pendiente (Abigail)
                            </span>
                          )}
                        </div>

                        {/* Status actions */}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-200">
                          {move.status === 'pending' && (
                            <button onClick={() => handleUpdateMoveStatus(move.id, 'scheduled')} className="text-xs px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100">
                              📅 Programar
                            </button>
                          )}
                          {move.status === 'scheduled' && (
                            <button onClick={() => handleUpdateMoveStatus(move.id, 'in_transit')} className="text-xs px-3 py-1.5 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100">
                              🚛 Iniciar Transporte
                            </button>
                          )}
                          {move.status === 'in_transit' && (
                            <button onClick={() => handleUpdateMoveStatus(move.id, 'completed')} className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100">
                              ✅ Completar Entrega
                            </button>
                          )}
                          {['pending', 'scheduled'].includes(move.status) && (
                            <button onClick={() => handleUpdateMoveStatus(move.id, 'cancelled')} className="text-xs px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100">
                              Cancelar
                            </button>
                          )}
                          <button onClick={() => handleDeleteMove(move.id)} className="text-xs px-3 py-1.5 text-gray-500 hover:text-red-600 ml-auto">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <button
              onClick={() => openMoveModal('purchase')}
              className="mt-3 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-800 font-medium"
            >
              <Plus className="w-4 h-4" />
              Agregar otra movida
            </button>
          </div>
        )}

        {/* Evaluation Section — interactive evaluator or completed report */}
        {evalReport ? (
          <div className="card-luxury p-4 sm:p-6">
            <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-gold-500" />
              Reporte de Evaluación
              <span className="ml-auto text-sm font-normal text-navy-500">
                #{evalReport.report_number}
              </span>
            </h3>

            {/* Score & Recommendation */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className={`p-4 rounded-lg border text-center ${
                evalReport.recommendation === 'COMPRAR' 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : evalReport.recommendation === 'NO COMPRAR'
                    ? 'bg-red-50 border-red-200'
                    : 'bg-amber-50 border-amber-200'
              }`}>
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1">Recomendación AI</div>
                <div className={`text-lg font-bold ${
                  evalReport.recommendation === 'COMPRAR' 
                    ? 'text-emerald-700' 
                    : evalReport.recommendation === 'NO COMPRAR'
                      ? 'text-red-700'
                      : 'text-amber-700'
                }`}>
                  {evalReport.recommendation === 'COMPRAR' && <Sparkles className="w-5 h-5 inline mr-1" />}
                  {evalReport.recommendation === 'NO COMPRAR' && <XCircle className="w-5 h-5 inline mr-1" />}
                  {evalReport.recommendation === 'REVISAR' && <AlertTriangle className="w-5 h-5 inline mr-1" />}
                  {evalReport.recommendation || 'Sin recomendación'}
                </div>
              </div>
              <div className="p-4 rounded-lg border bg-blue-50 border-blue-200 text-center">
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1">Puntuación</div>
                <div className="text-2xl font-bold text-blue-700">{evalReport.score ?? '—'}<span className="text-sm font-normal">/100</span></div>
              </div>
              <div className="p-4 rounded-lg border bg-gray-50 border-gray-200 text-center">
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1">Resumen</div>
                {(() => {
                  const cl = evalReport.checklist || [];
                  const p = cl.filter((i: any) => i.status === 'pass').length;
                  const f = cl.filter((i: any) => i.status === 'fail').length;
                  const w = cl.filter((i: any) => i.status === 'warning').length;
                  return (
                    <div className="flex justify-center gap-3 text-sm">
                      <span className="text-emerald-600 font-medium">✓ {p}</span>
                      <span className="text-red-600 font-medium">✗ {f}</span>
                      <span className="text-amber-600 font-medium">⚠ {w}</span>
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Recommendation Reason */}
            {evalReport.recommendation_reason && (
              <div className="mb-6 p-4 bg-navy-50 rounded-lg border border-navy-200">
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Análisis AI
                </div>
                <p className="text-sm text-navy-700">{evalReport.recommendation_reason}</p>
              </div>
            )}

            {/* Checklist Items — grouped by macro-group */}
            {evalReport.checklist && evalReport.checklist.length > 0 && (() => {
              const MACRO_GROUPS_VIEW = [
                { id: 'inspeccion', label: 'Inspección en Campo', icon: '🔍', categories: ['Estructura', 'Instalaciones', 'Especificaciones'] },
                { id: 'oficina', label: 'Revisión Oficina', icon: '📋', categories: ['Documentación', 'Financiero'] },
                { id: 'cierre', label: 'Cierre de Compra', icon: '🤝', categories: ['Cierre'] },
              ]
              const statusColors: Record<string, string> = {
                pass: 'bg-emerald-50 border-emerald-200',
                fail: 'bg-red-50 border-red-200',
                warning: 'bg-amber-50 border-amber-200',
                needs_photo: 'bg-blue-50 border-blue-200',
                not_evaluable: 'bg-gray-50 border-gray-200',
              }
              const statusIcons: Record<string, React.ReactNode> = {
                pass: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
                fail: <XCircle className="w-4 h-4 text-red-500" />,
                warning: <AlertTriangle className="w-4 h-4 text-amber-500" />,
                needs_photo: <Camera className="w-4 h-4 text-blue-500" />,
                not_evaluable: <div className="w-4 h-4 rounded-full bg-gray-300" />,
              }
              return (
                <div className="mb-6 space-y-4">
                  <h4 className="text-sm font-medium text-navy-700">Checklist de Evaluación ({evalReport.checklist.length} puntos)</h4>
                  {MACRO_GROUPS_VIEW.map(macro => {
                    const macroItems = evalReport.checklist.filter((i: any) => macro.categories.includes(i.category || 'Otro'))
                    if (macroItems.length === 0) return null
                    const macroPassed = macroItems.filter((i: any) => i.status === 'pass').length
                    return (
                      <div key={macro.id} className="border border-gray-200 rounded-lg overflow-hidden">
                        <div className="bg-navy-50 px-4 py-2.5 flex items-center gap-2">
                          <span className="text-base">{macro.icon}</span>
                          <span className="text-xs font-bold text-navy-800">{macro.label}</span>
                          <span className="ml-auto text-[10px] font-medium text-navy-600">{macroPassed}/{macroItems.length} ✓</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 p-3">
                          {macroItems.map((item: any) => (
                            <div
                              key={item.id}
                              className={`p-3 rounded-lg border ${statusColors[item.status] || 'bg-gray-50 border-gray-200'}`}
                            >
                              <div className="flex items-center gap-2">
                                {statusIcons[item.status] || <div className="w-4 h-4 rounded-full bg-gray-300" />}
                                <span className="text-sm font-medium text-navy-800">{item.label}</span>
                              </div>
                              {item.note && (
                                <p className="text-xs text-navy-500 mt-1 ml-6">{item.note}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()}

            {/* Extra Notes */}
            {evalReport.extra_notes && evalReport.extra_notes.length > 0 && (
              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                  <StickyNote className="w-3 h-3" /> Notas del Empleado
                </div>
                <ul className="text-sm text-navy-700 list-disc list-inside space-y-1">
                  {evalReport.extra_notes.map((note: string, i: number) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* AI Summary */}
            {evalReport.ai_summary && (
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                  <FileText className="w-3 h-3" /> Resumen AI
                </div>
                <p className="text-sm text-navy-700 whitespace-pre-wrap">{evalReport.ai_summary}</p>
              </div>
            )}
          </div>
        ) : (
          /* Interactive evaluator — create new or link existing */
          <DesktopEvaluatorPanel
            propertyId={property.id}
            onReportGenerated={(report) => {
              setEvalReport(report)
            }}
          />
        )}
      </div>

      {/* ========== MODALS ========== */}
      
      {/* Modal: Publicar Propiedad */}
      <InputModal
        isOpen={showPublishModal}
        onClose={() => setShowPublishModal(false)}
        onConfirm={handlePublish}
        title="Publicar Propiedad"
        label="Precio de venta (USD)"
        placeholder="Ej: 45000"
        defaultValue={
          recommendedPrice?.recommended_price
            ? Math.round(recommendedPrice.recommended_price).toString()
            : costBreakdown?.recommended_sale_price
              ? Math.round(costBreakdown.recommended_sale_price).toString()
              : property?.purchase_price?.toString() || ''
        }
        type="number"
        min={0}
        helpText={
          costBreakdown
            ? `Inversión total: $${Math.round(Number(property?.purchase_price || 0) + Number(costBreakdown.renovation_cost || 0) + Number(costBreakdown.move_cost || 0)).toLocaleString()} (Compra $${Math.round(Number(property?.purchase_price || 0)).toLocaleString()} + Reno $${Math.round(Number(costBreakdown.renovation_cost || 0)).toLocaleString()} + Movida $${Math.round(Number(costBreakdown.move_cost || 0)).toLocaleString()}) → Precio mínimo: $${Math.round(costBreakdown.recommended_sale_price).toLocaleString()}`
            : recommendedPrice?.market_value
              ? `Regla 80%: Valor mercado $${recommendedPrice.market_value.toLocaleString()} → Máximo venta $${recommendedPrice.max_sell_price_80?.toLocaleString() || '—'}`
              : 'Este será el precio visible para compradores potenciales'
        }
        confirmText="Publicar"
      />

      {/* Modal: Completar Renovación con precio auto-calculado */}
      <InputModal
        isOpen={showRenovationPriceModal}
        onClose={() => setShowRenovationPriceModal(false)}
        onConfirm={handleCompleteRenovation}
        title="Publicar Post-Renovacion"
        label="Precio de venta (USD)"
        placeholder="Precio calculado automaticamente"
        defaultValue={postRenoPrice ? Math.round(postRenoPrice.recommended_sale_price).toString() : (property?.sale_price?.toString() || '')}
        type="number"
        min={0}
        required={false}
        helpText={
          postRenoPrice
            ? `$9,500 margen + $${postRenoPrice.purchase_price.toLocaleString()} compra + $${postRenoPrice.commission.toLocaleString()} comision + $${postRenoPrice.renovation_cost.toLocaleString()} reparacion + $${postRenoPrice.move_cost.toLocaleString()} movida = $${postRenoPrice.recommended_sale_price.toLocaleString()}`
            : 'Dejar vacio para auto-calcular: 9500 + compra + comision + reparacion + movida'
        }
        confirmText="Publicar"
      />

      {/* Modal: Confirmar Eliminar */}
      <ConfirmModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Eliminar Propiedad"
        message={
          <div>
            <p>¿Estás seguro de que deseas eliminar esta propiedad?</p>
            <p className="mt-2 font-medium text-navy-900">{property?.address}</p>
            <p className="mt-3 text-sm text-red-600">Esta acción no se puede deshacer.</p>
          </div>
        }
        confirmText="Eliminar"
        variant="danger"
      />

      {/* Modal: Nueva Movida */}
      {showNewMoveModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowNewMoveModal(false)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 p-4 flex items-center justify-between rounded-t-2xl">
              <h3 className="text-lg font-bold text-navy-900 flex items-center gap-2">
                <Truck className="w-5 h-5 text-orange-500" />
                Contratar Movida
              </h3>
              <button onClick={() => setShowNewMoveModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">Tipo de movida</label>
                <select
                  value={newMove.move_type}
                  onChange={e => {
                    const type = e.target.value
                    if (type === 'purchase') {
                      setNewMove(prev => ({ ...prev, move_type: type, origin_address: property?.address || '', origin_city: property?.city || '' }))
                    } else if (type === 'sale') {
                      setNewMove(prev => ({ ...prev, move_type: type, origin_address: '15891 Old Houston Rd', origin_city: 'Conroe' }))
                    } else {
                      setNewMove(prev => ({ ...prev, move_type: type }))
                    }
                  }}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                >
                  <option value="purchase">Compra → Yard (del vendedor al patio)</option>
                  <option value="sale">Yard → Cliente (del patio al comprador)</option>
                  <option value="yard_transfer">Entre Yards (transferencia)</option>
                </select>
              </div>

              {/* Mover Provider Quick Select */}
              {moverProviders.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-navy-700 mb-2">Seleccionar Proveedor</label>
                  <div className="space-y-2">
                    {moverProviders.map((prov: any) => (
                      <div key={prov.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-orange-300 transition-colors"
                        style={{ backgroundColor: newMove.driver_name === prov.name ? '#fff7ed' : 'white', borderColor: newMove.driver_name === prov.name ? '#fb923c' : undefined }}>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy-900">{prov.name}</p>
                          {prov.company && <p className="text-xs text-gray-500">{prov.company}</p>}
                          <p className="text-xs text-gray-500">{prov.phone}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleSelectProvider(prov)}
                          className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors"
                          style={{ backgroundColor: newMove.driver_name === prov.name ? '#f97316' : '#f3f4f6', color: newMove.driver_name === prov.name ? 'white' : '#374151' }}
                        >
                          {newMove.driver_name === prov.name ? 'Seleccionado' : 'Seleccionar'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSmsProvider(prov.id)}
                          className="text-xs px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 flex items-center gap-1"
                        >
                          📱 Mensaje
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Origin */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dirección origen</label>
                  <input
                    type="text"
                    value={newMove.origin_address}
                    onChange={e => setNewMove({...newMove, origin_address: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder={property?.address || 'Dirección de recogida'}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Ciudad origen</label>
                  <input
                    type="text"
                    value={newMove.origin_city}
                    onChange={e => setNewMove({...newMove, origin_city: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder={property?.city || 'Ciudad'}
                  />
                </div>
              </div>

              {/* Destination */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Dirección destino</label>
                  <input
                    type="text"
                    value={newMove.destination_address}
                    onChange={e => setNewMove({...newMove, destination_address: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Dirección de entrega"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Yard destino</label>
                  <select
                    value={newMove.destination_yard}
                    onChange={e => setNewMove({...newMove, destination_yard: e.target.value, destination_city: e.target.value ? e.target.value.charAt(0).toUpperCase() + e.target.value.slice(1) : newMove.destination_city})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">— Seleccionar —</option>
                    <option value="conroe">Conroe (Cromwell)</option>
                    <option value="houston">Houston</option>
                    <option value="dallas">Dallas</option>
                  </select>
                </div>
              </div>

              {/* Customer Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Customer Name</label>
                  <input type="text" value={newMove.customer_name} onChange={e => setNewMove({...newMove, customer_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Nombre del cliente" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input type="text" value={newMove.customer_phone} onChange={e => setNewMove({...newMove, customer_phone: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Teléfono cliente" />
                </div>
              </div>

              {/* Home Info */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-bold text-navy-700 mb-2 uppercase tracking-wider">Home Info</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">HUD / Label #</label>
                    <input type="text" value={newMove.hud_label} onChange={e => setNewMove({...newMove, hud_label: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="TEX0012345" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Serial #</label>
                    <input type="text" value={newMove.serial_number} onChange={e => setNewMove({...newMove, serial_number: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Serial number" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-2">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Manufacturer</label>
                    <input type="text" value={newMove.manufacturer} onChange={e => setNewMove({...newMove, manufacturer: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Fabricante" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Size (sqft)</label>
                    <input type="text" value={newMove.home_size} onChange={e => setNewMove({...newMove, home_size: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Sqft" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Year</label>
                    <input type="text" value={newMove.home_year} onChange={e => setNewMove({...newMove, home_year: e.target.value})}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="Año" />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                  <label className="flex items-center gap-2 text-sm p-2 rounded-lg border border-gray-200">
                    <input type="checkbox" checked={newMove.has_hitch} onChange={e => setNewMove({...newMove, has_hitch: e.target.checked})} className="rounded" />
                    <span className="text-gray-700">Does home have a hitch?</span>
                  </label>
                  <label className="flex items-center gap-2 text-sm p-2 rounded-lg border border-gray-200">
                    <input type="checkbox" checked={newMove.tires_axles} onChange={e => setNewMove({...newMove, tires_axles: e.target.checked})} className="rounded" />
                    <span className="text-gray-700">Tires & Axles?</span>
                  </label>
                </div>
              </div>

              {/* Delivery Date */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date</label>
                <input type="date" value={newMove.delivery_date} onChange={e => setNewMove({...newMove, delivery_date: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" />
              </div>

              {/* Special Instructions */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Special Instructions</label>
                <input type="text" value={newMove.special_instructions} onChange={e => setNewMove({...newMove, special_instructions: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm" placeholder="INCLUDE A/C UNIT FOR DELIVERY" />
              </div>

              {/* Logistics */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Compañía de transporte</label>
                  <input
                    type="text"
                    value={newMove.moving_company}
                    onChange={e => setNewMove({...newMove, moving_company: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Nombre de la compañía"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Conductor</label>
                  <input
                    type="text"
                    value={newMove.driver_name}
                    onChange={e => setNewMove({...newMove, driver_name: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="Nombre del conductor"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teléfono conductor</label>
                  <input
                    type="text"
                    value={newMove.driver_phone}
                    onChange={e => setNewMove({...newMove, driver_phone: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="832-XXX-XXXX"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fecha programada</label>
                  <input
                    type="date"
                    value={newMove.scheduled_date}
                    onChange={e => setNewMove({...newMove, scheduled_date: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Costo cotizado ($)</label>
                  <input
                    type="number"
                    value={newMove.quoted_cost}
                    onChange={e => setNewMove({...newMove, quoted_cost: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="0"
                  />
                </div>
              </div>

              {/* Distance + permits */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Distancia (millas)</label>
                  <input
                    type="number"
                    value={newMove.estimated_distance_miles}
                    onChange={e => setNewMove({...newMove, estimated_distance_miles: e.target.value})}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    placeholder="0"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm pt-5">
                  <input
                    type="checkbox"
                    checked={newMove.requires_escort}
                    onChange={e => setNewMove({...newMove, requires_escort: e.target.checked})}
                    className="rounded"
                  />
                  <span className="text-gray-700">Escolta</span>
                </label>
                <label className="flex items-center gap-2 text-sm pt-5">
                  <input
                    type="checkbox"
                    checked={newMove.requires_wide_load_permit}
                    onChange={e => setNewMove({...newMove, requires_wide_load_permit: e.target.checked})}
                    className="rounded"
                  />
                  <span className="text-gray-700">Permiso carga ancha</span>
                </label>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas adicionales</label>
                <textarea
                  value={newMove.notes}
                  onChange={e => setNewMove({...newMove, notes: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Observaciones internas..."
                />
              </div>
            </div>

            <div className="border-t border-gray-100 p-4 flex justify-end gap-2">
              <button onClick={() => setShowNewMoveModal(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
                Cancelar
              </button>
              <button
                onClick={handleCreateMove}
                disabled={savingMove}
                className="flex items-center gap-2 px-5 py-2 bg-orange-500 text-white rounded-lg font-medium hover:bg-orange-600 transition-colors disabled:opacity-50"
              >
                {savingMove ? <Loader2 className="w-4 h-4 animate-spin" /> : <Truck className="w-4 h-4" />}
                Contratar Movida
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: WhatsApp Share */}
      {showWhatsAppModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-navy-900 flex items-center gap-2">
                <MessageCircle className="w-5 h-5 text-green-500" />
                Compartir por WhatsApp
              </h3>
              <button onClick={() => setShowWhatsAppModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto">
              <p className="text-sm text-gray-500 mb-2">Edita el mensaje antes de enviar:</p>
              <textarea
                value={whatsAppMessage}
                onChange={(e) => setWhatsAppMessage(e.target.value)}
                rows={16}
                className="w-full p-3 border border-gray-200 rounded-xl text-sm resize-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              />
              {property?.photos && property.photos.length > 0 && (
                <div className="mt-3">
                  <div className="flex gap-2 overflow-x-auto">
                    {property.photos.slice(0, 5).map((url, i) => (
                      <img key={i} src={url} alt={`Foto ${i + 1}`} className="w-16 h-16 rounded-lg object-cover flex-shrink-0 border border-gray-200" />
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-2">
                    "Enviar Flyer" genera una imagen con la foto principal + info de la casa y la comparte directamente.
                  </p>
                </div>
              )}
            </div>

            <div className="border-t border-gray-100 p-4 flex justify-end gap-2">
              <button
                onClick={copyWhatsAppMessage}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Copy className="w-4 h-4" />
                Copiar
              </button>
              <button
                onClick={sendWhatsAppTextOnly}
                className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
              >
                <Send className="w-4 h-4" />
                Solo texto
              </button>
              <button
                onClick={generateAndShareFlyer}
                disabled={sharingSending}
                className="flex items-center gap-2 px-5 py-2 bg-green-500 text-white rounded-lg font-medium hover:bg-green-600 transition-colors disabled:opacity-50"
              >
                {sharingSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                Enviar Flyer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function DetailItem({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <p className="text-sm text-navy-500">{label}</p>
      <p className="font-medium text-navy-900">{value || '—'}</p>
    </div>
  )
}

// ── Signed Documents Viewer for purchased properties ──
function PropertySignedDocs({ propertyId, refreshKey }: { propertyId: string; refreshKey?: number }) {
  const [envelopes, setEnvelopes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEnvelopes = useCallback(() => {
    if (!propertyId) return
    setLoading(true)
    fetch(`/api/esign/property/${propertyId}/envelopes`)
      .then(r => r.json())
      .then(d => setEnvelopes(d.envelopes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [propertyId])

  useEffect(() => { fetchEnvelopes() }, [fetchEnvelopes, refreshKey])

  // Auto-refresh every 15s to pick up new signatures
  useEffect(() => {
    if (!propertyId) return
    const interval = setInterval(fetchEnvelopes, 15000)
    return () => clearInterval(interval)
  }, [propertyId, fetchEnvelopes])

  if (!propertyId || (envelopes.length === 0 && !loading)) return null

  const docTypeLabels: Record<string, string> = {
    bill_of_sale: 'Bill of Sale',
    title_application: 'Cambio de Título',
  }
  const txTypeLabels: Record<string, string> = {
    purchase: 'Compra',
    sale: 'Venta',
  }

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
      <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        Firmas de Documentos
      </h4>
      {loading ? (
        <div className="flex items-center gap-2 text-xs text-emerald-600">
          <Loader2 className="w-3 h-3 animate-spin" /> Cargando...
        </div>
      ) : (
        <div className="space-y-3">
          {envelopes.map((env: any) => (
            <div key={env.id} className="bg-white rounded-lg border border-emerald-100 p-3">
              <p className="text-sm font-semibold text-navy-900 mb-1.5">
                {docTypeLabels[env.document_type] || env.document_type}
                {env.transaction_type && (
                  <span className="ml-2 text-xs font-normal text-navy-500">
                    ({txTypeLabels[env.transaction_type] || env.transaction_type})
                  </span>
                )}
              </p>
              <div className="space-y-1">
                {(env.document_signatures || []).map((sig: any) => {
                  const signed = !!sig.signed_at
                  const sigData = sig.signature_data || {}
                  const isDrawn = sigData.type === 'drawn'
                  return (
                    <div key={sig.id} className="flex items-center gap-2 text-xs">
                      {signed ? (
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                      ) : (
                        <Clock className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                      )}
                      <span className="font-medium text-navy-700 capitalize">{sig.signer_role}:</span>
                      <span className="text-navy-600">{sig.signer_name}</span>
                      {signed ? (
                        <>
                          <span className="text-emerald-600">
                            — firmado {new Date(sig.signed_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}
                          </span>
                          {isDrawn && sigData.value && (
                            <img src={sigData.value} alt="Firma" className="h-6 ml-1 border border-emerald-200 rounded" />
                          )}
                        </>
                      ) : (
                        <span className="text-amber-600">— pendiente de firma</span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
