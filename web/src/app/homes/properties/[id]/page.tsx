'use client'

import React, { useEffect, useState } from 'react'
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
} from 'lucide-react'
import { InputModal, ConfirmModal } from '@/components/ui/Modal'
import { useToast } from '@/components/ui/Toast'
import TitleTransferCard from '@/components/TitleTransferCard'
import BillOfSaleTemplate from '@/components/BillOfSaleTemplate'
import TitleApplicationTemplate from '@/components/TitleApplicationTemplate'

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
  photos: string[]
  checklist_completed: boolean
  checklist_data: Record<string, boolean>
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
  
  // Evaluation report
  const [evalReport, setEvalReport] = useState<EvaluationReport | null>(null)

  // Moves (movida)
  const [moves, setMoves] = useState<any[]>([])
  const [showNewMoveModal, setShowNewMoveModal] = useState(false)
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
    special_instructions: '',
  })
  const [savingMove, setSavingMove] = useState(false)
  const [expandedMove, setExpandedMove] = useState<string | null>(null)

  // 80% rule recommended price
  const [recommendedPrice, setRecommendedPrice] = useState<{
    market_value?: number | null
    max_sell_price_80?: number | null
    recommended_price?: number | null
    warning?: string | null
  } | null>(null)

  useEffect(() => {
    fetchProperty()
    fetchTransfers()
    fetchMoves()
  }, [params.id])

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
        setNewMove({ move_type: 'purchase', origin_address: '', origin_city: '', destination_address: '', destination_city: '', destination_yard: '', moving_company: '', driver_name: '', driver_phone: '', estimated_distance_miles: '', requires_escort: false, requires_wide_load_permit: false, scheduled_date: '', quoted_cost: '', notes: '', special_instructions: '' })
        fetchMoves()
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

  const openPublishModal = () => {
    fetchRecommendedPrice()
    setShowPublishModal(true)
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
            <h1 className="font-serif text-2xl text-navy-900">{property.address}</h1>
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
            
            {/* Publicada: Vender, Renovar */}
            {property.status === 'published' && (
              <>
                <Link 
                  href={`/homes/sales/new?property=${property.id}`}
                  className="btn-gold"
                >
                  <Tag className="w-5 h-5" />
                  Vender (Contado)
                </Link>
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
                  onClick={openPublishModal}
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
                  onClick={() => setShowNewMoveModal(true)}
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

        {/* Details Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Photos */}
            <div className="card-luxury p-6">
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
            <div className="card-luxury p-6">
              <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
                <Home className="w-5 h-5 text-gold-500" />
                Detalles
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <DetailItem label="Año" value={property.year?.toString()} />
                <DetailItem label="Habitaciones" value={property.bedrooms?.toString()} />
                <DetailItem label="Baños" value={property.bathrooms?.toString()} />
                <DetailItem label="Pies²" value={property.square_feet?.toLocaleString()} />
                <DetailItem label="HUD" value={property.hud_number} />
                <DetailItem label="Código Postal" value={property.zip_code} />
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Financials */}
            <div className="card-luxury p-6">
              <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-gold-500" />
                Financiero
              </h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-navy-500">Precio de compra</span>
                  <span className="font-semibold text-navy-900">
                    ${property.purchase_price?.toLocaleString() || '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-navy-500">Precio de venta</span>
                  <span className="font-semibold text-gold-600">
                    ${property.sale_price?.toLocaleString() || '—'}
                  </span>
                </div>
                {property.purchase_price && property.sale_price && (
                  <div className="pt-3 border-t border-navy-100">
                    <div className="flex justify-between items-center">
                      <span className="text-navy-500">Ganancia potencial</span>
                      <span className="font-semibold text-emerald-600">
                        ${(property.sale_price - property.purchase_price).toLocaleString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Timeline */}
            <div className="card-luxury p-6">
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
          </div>
        </div>

        {/* Documents Section */}
        <div className="card-luxury p-6">
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
                  dimensions: property.square_feet ? `${property.square_feet} sqft` : '',
                  location_of_home: `${property.address}, ${property.city || ''}, ${property.state || 'TX'}`,
                  hud_label_number: property.hud_number || '',
                  total_payment: showBosTemplate === 'purchase' 
                    ? `$${property.purchase_price?.toLocaleString() || ''}` 
                    : `$${property.sale_price?.toLocaleString() || ''}`,
                  date_manufactured: property.year?.toString() || '',
                  buyer_date: new Date().toISOString().split('T')[0],
                  is_new: false,
                  is_used: true,
                }}
                onSave={async (file) => {
                  // Upload the generated PDF to the transfer
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
                  toast.success('✓ Bill of Sale guardado como PDF')
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
                  ...(showTitleAppTemplate === 'purchase' ? {
                    applicant_name: 'MANINOS HOMES LLC',
                    seller_name: '',
                  } : {
                    seller_name: 'MANINOS HOMES LLC',
                    applicant_name: '',
                  }),
                  year: property.year?.toString() || '',
                  bedrooms: property.bedrooms?.toString() || '',
                  bathrooms: property.bathrooms?.toString() || '',
                  sqft: property.square_feet?.toString() || '',
                  location_address: property.address || '',
                  location_city: property.city || '',
                  location_state: property.state || 'TX',
                  hud_number: property.hud_number || '',
                  sale_price: showTitleAppTemplate === 'purchase'
                    ? `$${property.purchase_price?.toLocaleString() || ''}`
                    : `$${property.sale_price?.toLocaleString() || ''}`,
                  sale_date: new Date().toISOString().split('T')[0],
                  is_new: false,
                  is_used: true,
                }}
                onSave={async (file) => {
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
                  toast.success('✓ Aplicación de Título guardada como PDF')
                  setShowTitleAppTemplate(null)
                }}
                onClose={() => setShowTitleAppTemplate(null)}
              />
            </div>
          )}

          {/* Generate Document buttons */}
          {!showBosTemplate && !showTitleAppTemplate && (
            <div className="flex flex-wrap gap-2 mb-4">
              <button
                onClick={() => setShowBosTemplate('purchase')}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Bill of Sale (Compra)
              </button>
              <button
                onClick={() => setShowBosTemplate('sale')}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Bill of Sale (Venta)
              </button>
              <button
                onClick={() => setShowTitleAppTemplate('purchase')}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Aplicación Título (Compra)
              </button>
              <button
                onClick={() => setShowTitleAppTemplate('sale')}
                className="flex items-center gap-2 px-3 py-2 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
              >
                <FileText className="w-3.5 h-3.5" />
                Aplicación Título (Venta)
              </button>
            </div>
          )}

          <div className="space-y-4">
            {/* Purchase Transfer: Seller → Maninos */}
            {transfers.purchase ? (
              <TitleTransferCard 
                transfer={transfers.purchase} 
                onUpdate={fetchTransfers}
              />
            ) : (
              <div className="p-4 bg-navy-50 rounded-lg text-center text-navy-500 text-sm">
                No hay transferencia de compra registrada
              </div>
            )}

            {/* Sale Transfer: Maninos → Client (only for sold properties) */}
            {transfers.sale ? (
              <TitleTransferCard 
                transfer={transfers.sale} 
                onUpdate={fetchTransfers}
              />
            ) : property.status === 'sold' ? (
              <div className="p-4 bg-amber-50 rounded-lg text-center text-amber-700 text-sm">
                Transferencia de venta pendiente de registro
              </div>
            ) : null}
          </div>
        </div>

        {/* ========== MOVIDA (MOVES) SECTION ========== */}
        {moves.length > 0 && (
          <div className="card-luxury p-6">
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
              onClick={() => setShowNewMoveModal(true)}
              className="mt-3 flex items-center gap-2 text-sm text-orange-600 hover:text-orange-800 font-medium"
            >
              <Plus className="w-4 h-4" />
              Agregar otra movida
            </button>
          </div>
        )}

        {/* Evaluation Report Section (replaces old checklist) */}
        {evalReport ? (
          <div className="card-luxury p-6">
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

            {/* Checklist Items */}
            {evalReport.checklist && evalReport.checklist.length > 0 && (
              <div className="mb-6">
                <h4 className="text-sm font-medium text-navy-700 mb-3">Checklist de Evaluación ({evalReport.checklist.length} puntos)</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {evalReport.checklist.map((item) => {
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
                    )
                  })}
                </div>
              </div>
            )}

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
        ) : property.checklist_completed && Object.keys(property.checklist_data || {}).length > 0 ? (
          /* Fallback: old checklist for properties without evaluation report */
          <div className="card-luxury p-6">
            <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-gold-500" />
              Checklist de Inspección (Compra)
              <span className="ml-auto text-sm font-normal text-emerald-600 flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                {Object.values(property.checklist_data).filter(Boolean).length}/{Object.keys(property.checklist_data).length} completado
              </span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Object.entries(property.checklist_data).map(([key, checked]) => (
                <div 
                  key={key}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    checked 
                      ? 'bg-emerald-50 border-emerald-200' 
                      : 'bg-red-50 border-red-200'
                  }`}
                >
                  {checked ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                  ) : (
                    <div className="w-5 h-5 rounded-full border-2 border-red-300 flex-shrink-0" />
                  )}
                  <span className={`text-sm font-medium capitalize ${
                    checked ? 'text-emerald-700' : 'text-red-700'
                  }`}>
                    {key.replace(/_/g, ' ').replace(/-/g, ' ')}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
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
            : property?.purchase_price?.toString() || ''
        }
        type="number"
        min={0}
        helpText={
          recommendedPrice?.market_value
            ? `Regla 80%: Valor mercado $${recommendedPrice.market_value.toLocaleString()} → Máximo venta $${recommendedPrice.max_sell_price_80?.toLocaleString() || '—'}. Recomendado: $${recommendedPrice.recommended_price?.toLocaleString() || '—'}`
            : 'Este será el precio visible para compradores potenciales (Regla: máx. 80% valor de mercado)'
        }
        confirmText="Publicar"
      />

      {/* Modal: Completar Renovación */}
      <InputModal
        isOpen={showRenovationPriceModal}
        onClose={() => setShowRenovationPriceModal(false)}
        onConfirm={handleCompleteRenovation}
        title="Completar Renovación"
        label="Nuevo precio de venta (opcional)"
        placeholder="Dejar vacío para mantener precio actual"
        defaultValue={property?.sale_price?.toString() || ''}
        type="number"
        min={0}
        required={false}
        helpText="Puedes ajustar el precio de venta después de la renovación"
        confirmText="Completar"
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
                  onChange={e => setNewMove({...newMove, move_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-orange-400"
                >
                  <option value="purchase">Compra → Yard (del vendedor al patio)</option>
                  <option value="sale">Yard → Cliente (del patio al comprador)</option>
                  <option value="yard_transfer">Entre Yards (transferencia)</option>
                </select>
              </div>

              {/* Origin */}
              <div className="grid grid-cols-2 gap-3">
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
              <div className="grid grid-cols-2 gap-3">
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

              {/* Logistics */}
              <div className="grid grid-cols-2 gap-3">
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

              <div className="grid grid-cols-3 gap-3">
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
              <div className="grid grid-cols-3 gap-3">
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
                <label className="block text-xs font-medium text-gray-600 mb-1">Notas / Instrucciones especiales</label>
                <textarea
                  value={newMove.notes}
                  onChange={e => setNewMove({...newMove, notes: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  rows={2}
                  placeholder="Observaciones, acceso difícil, dimensiones especiales..."
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
