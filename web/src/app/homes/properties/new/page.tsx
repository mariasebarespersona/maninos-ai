'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  DollarSign, 
  MapPin,
  Home,
  Loader2,
  FileText,
  CheckCircle,
  X,
  Upload,
  ChevronRight,
  ChevronLeft,
  CreditCard,
  AlertCircle,
  ExternalLink,
  Search,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useFormValidation, commonSchemas } from '@/hooks/useFormValidation'
import FormInput from '@/components/ui/FormInput'
import BillOfSaleTemplate, { type BillOfSaleData } from '@/components/BillOfSaleTemplate'
import TitleApplicationTemplate, { type TitleApplicationData } from '@/components/TitleApplicationTemplate'
import DesktopEvaluatorPanel from '@/components/DesktopEvaluatorPanel'

/**
 * New Property — 4-step purchase flow (same as "Revisar Casa" in Market)
 * Step 1: Datos de la Propiedad + Documentos
 * Step 2: Evaluación en Campo
 * Step 3: Registrar Pago
 * Step 4: Confirmar Compra
 */

// Types
type PurchaseStep = 'documents' | 'checklist' | 'payment' | 'confirm'

interface PropertyForm {
  address: string
  city: string
  state: string
  zip_code: string
  hud_number: string
  year: string
  purchase_price: string
  bedrooms: string
  bathrooms: string
  length_ft: string
  width_ft: string
}

interface PurchaseDocuments {
  billOfSale: File | null
  title: File | null
  titleApplication: File | null
}

interface PaymentInfo {
  method: string
  reference: string
  date: string
  amount: number
}

const initialForm: PropertyForm = {
  address: '',
  city: '',
  state: 'Texas',
  zip_code: '',
  hud_number: '',
  year: '',
  purchase_price: '',
  bedrooms: '',
  bathrooms: '',
  length_ft: '',
  width_ft: '',
}

// Payment methods
const PAYMENT_METHODS = [
  { id: 'transferencia', label: '🏦 Transferencia Bancaria', recommended: true, description: 'Método principal (80% de compras)' },
  { id: 'zelle', label: '💸 Zelle', recommended: false, description: 'Zelle al 832-745-9600' },
  { id: 'cheque', label: '📝 Cheque', recommended: false, description: 'Cheque certificado' },
  { id: 'efectivo', label: '💵 Efectivo', recommended: false, description: 'Solo montos pequeños' },
]

const TDHCA_TITLE_APPLICATION_URL = 'https://www.tdhca.texas.gov/sites/default/files/mh/docs/1023-Statement-Ownership.pdf'

const STEP_ORDER: PurchaseStep[] = ['documents', 'checklist', 'payment', 'confirm']

export default function NewPropertyPage() {
  const router = useRouter()
  const toast = useToast()
  
  // Form state
  const [form, setForm] = useState<PropertyForm>(initialForm)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')

  // Step state
  const [purchaseStep, setPurchaseStep] = useState<PurchaseStep>('documents')

  // Document state
  const [documents, setDocuments] = useState<PurchaseDocuments>({ billOfSale: null, title: null, titleApplication: null })
  const [showBillOfSale, setShowBillOfSale] = useState(false)
  const [billOfSaleData, setBillOfSaleData] = useState<BillOfSaleData | null>(null)
  const [showTitleApp, setShowTitleApp] = useState(false)
  const [titleAppData, setTitleAppData] = useState<TitleApplicationData | null>(null)

  // TDHCA Title lookup state
  const [tdhcaSearchValue, setTdhcaSearchValue] = useState('')
  const [tdhcaSearchType, setTdhcaSearchType] = useState<'label' | 'serial'>('serial')
  const [tdhcaLoading, setTdhcaLoading] = useState(false)
  const [tdhcaResult, setTdhcaResult] = useState<any>(null)
  const [tdhcaError, setTdhcaError] = useState<string | null>(null)

  // Payment state
  const [payment, setPayment] = useState<PaymentInfo>({
    method: '',
    reference: '',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
  })

  // Evaluation report state
  const [evalReport, setEvalReport] = useState<any>(null)

  // Validation
  const { validateSingle, markTouched, getFieldError } = useFormValidation<PropertyForm>(
    commonSchemas.property
  )

  // Computed square feet
  const computedSqFt = form.length_ft && form.width_ft 
    ? parseInt(form.length_ft) * parseInt(form.width_ft) 
    : null

  // Form handlers
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    validateSingle(name, value)
    // Auto-update payment amount when purchase_price changes
    if (name === 'purchase_price') {
      const price = parseFloat(value) || 0
      setPayment(prev => ({ ...prev, amount: price }))
    }
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    markTouched(e.target.name)
    validateSingle(e.target.name, e.target.value)
  }

  // Document handling
  const handleFileUpload = (type: 'billOfSale' | 'title' | 'titleApplication', file: File | null) => {
    setDocuments(prev => ({ ...prev, [type]: file }))
  }

  // TDHCA Title lookup
  const lookupTDHCA = async () => {
    if (!tdhcaSearchValue.trim()) return
    setTdhcaLoading(true)
    setTdhcaError(null)
    setTdhcaResult(null)
    try {
      const res = await fetch('/api/market-listings/tdhca-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_value: tdhcaSearchValue.trim(),
          search_type: tdhcaSearchType,
        }),
      })
      const data = await res.json()
      if (data.success) {
        setTdhcaResult(data.data)
      } else {
        setTdhcaError(data.message || 'No se encontraron resultados')
      }
    } catch (err: any) {
      setTdhcaError(`Error: ${err.message}`)
    } finally {
      setTdhcaLoading(false)
    }
  }

  // TDHCA field helpers: use normalized fields + raw_fields fallback (case-insensitive)
  const getTdhcaField = (...keys: string[]): string => {
    if (!tdhcaResult) return ''
    for (const key of keys) {
      const direct = tdhcaResult?.[key]
      if (direct !== undefined && direct !== null && String(direct).trim()) return String(direct).trim()
    }
    const raw = (tdhcaResult?.raw_fields || {}) as Record<string, any>
    const entries = Object.entries(raw)
    for (const key of keys) {
      const exact = raw[key]
      if (exact !== undefined && exact !== null && String(exact).trim()) return String(exact).trim()
      const lower = key.toLowerCase()
      const found = entries.find(([k]) => k.toLowerCase() === lower)
      if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim()) return String(found[1]).trim()
    }
    return ''
  }

  const cleanSuspiciousValue = (value: string): string => {
    const bad = new Set(['weight', 'size', 'serial', 'serial #', 'serial#', 'label/seal', 'label/seal#', 'w', 'l', 'width', 'length'])
    const v = (value || '').trim()
    return bad.has(v.toLowerCase()) ? '' : v
  }

  const deriveDimensions = () => {
    const w = cleanSuspiciousValue(getTdhcaField('width', 'Width'))
    const l = cleanSuspiciousValue(getTdhcaField('length', 'Length'))
    if (w && l) return { width: w, length: l }
    const sizeRaw = getTdhcaField('Size', 'Size*', 'size')
    const m = sizeRaw.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/)
    return m ? { width: m[1], length: m[2] } : { width: '', length: '' }
  }

  // Document completeness checks
  const isBosComplete = !!(billOfSaleData || documents.billOfSale)
  const isTitleComplete = !!(tdhcaResult || documents.title)
  const isTitleAppComplete = !!(titleAppData || documents.titleApplication)
  const allDocsReady = isBosComplete && isTitleComplete && isTitleAppComplete
  const isPropertyInfoValid = !!form.address.trim()

  // Navigation
  const goToNextStep = () => {
    if (purchaseStep === 'documents' && allDocsReady && isPropertyInfoValid) {
      setPurchaseStep('checklist')
    } else if (purchaseStep === 'checklist') {
      setPurchaseStep('payment')
    } else if (purchaseStep === 'payment' && payment.method && payment.reference) {
      setPurchaseStep('confirm')
    }
  }

  const goToPrevStep = () => {
    if (purchaseStep === 'checklist') setPurchaseStep('documents')
    else if (purchaseStep === 'payment') setPurchaseStep('checklist')
    else if (purchaseStep === 'confirm') setPurchaseStep('payment')
  }

  // Upload document to Supabase Storage
  const uploadDocument = async (propertyId: string, file: File, docType: string): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('property_id', propertyId)
      formData.append('doc_type', docType)
      const response = await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
      })
      if (!response.ok) throw new Error('Upload failed')
      const data = await response.json()
      return data.url
    } catch (error) {
      console.error(`Error uploading ${docType}:`, error)
      return null
    }
  }

  // Confirm purchase
  const confirmPurchase = async () => {
    if (!form.address.trim()) {
      toast.error('La dirección es obligatoria')
      return
    }

    setProcessing(true)
    setError('')

    try {
      const sqFt = computedSqFt || undefined

      // Build document_data from filled-in templates
      const docData: Record<string, any> = {}
      if (billOfSaleData) docData.bos_purchase = billOfSaleData
      if (titleAppData) docData.title_app_purchase = titleAppData

      const payload = {
        address: form.address,
        city: form.city || undefined,
        state: form.state || undefined,
        zip_code: form.zip_code || undefined,
        hud_number: form.hud_number || undefined,
        year: form.year ? parseInt(form.year) : undefined,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : undefined,
        square_feet: sqFt,
        length_ft: form.length_ft ? parseInt(form.length_ft) : undefined,
        width_ft: form.width_ft ? parseInt(form.width_ft) : undefined,
        document_data: Object.keys(docData).length > 0 ? docData : undefined,
      }

      // 1. Create property
      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
      const data = await res.json()
        throw new Error(data.detail || `Error ${res.status}`)
      }

      const newProperty = await res.json()

      // 2. Upload documents if present
      if (documents.billOfSale) {
        await uploadDocument(newProperty.id, documents.billOfSale, 'bill_of_sale')
      }
      if (documents.title) {
        await uploadDocument(newProperty.id, documents.title, 'title')
      }
      if (documents.titleApplication) {
        await uploadDocument(newProperty.id, documents.titleApplication, 'title_application')
      }

      // 3. Link evaluation report if exists
      if (evalReport?.id) {
        try {
          await fetch(`/api/evaluations/${evalReport.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: newProperty.id }),
          })
        } catch (e) {
          console.error('Error linking eval report:', e)
        }
      }

      toast.success('¡Propiedad creada exitosamente con todos los documentos!')
      router.push(`/homes/properties/${newProperty.id}`)
    } catch (err: any) {
      console.error('Error creating property:', err)
      const errorMsg = err.message || 'Error desconocido'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setProcessing(false)
    }
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href="/homes/properties" 
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Propiedades
        </Link>
      </div>

      {/* Main Card */}
      <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
        {/* Header with step info */}
        <div className="bg-gradient-to-r from-navy-900 to-navy-800 p-6 text-white">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-xl font-semibold">
                {purchaseStep === 'documents' && 'Paso 1: Datos y Documentos'}
                {purchaseStep === 'checklist' && 'Paso 2: Evaluación en Campo'}
                {purchaseStep === 'payment' && 'Paso 3: Registrar Pago'}
                {purchaseStep === 'confirm' && 'Paso 4: Confirmar Compra'}
              </h3>
              <p className="text-navy-200 mt-1 text-sm">
                {purchaseStep === 'documents' && 'Ingresa los datos de la casa y completa los documentos'}
                {purchaseStep === 'checklist' && 'Evalúa la casa con la app móvil antes de continuar'}
                {purchaseStep === 'payment' && 'Registra el pago realizado al vendedor'}
                {purchaseStep === 'confirm' && 'Revisa y confirma la compra'}
              </p>
            </div>
      </div>

          {/* Property summary (shown from step 2 onwards if data entered) */}
          {purchaseStep !== 'documents' && form.address && (
            <div className="mt-4 bg-white/10 rounded-lg p-3">
              <p className="font-medium">{form.address}</p>
              <div className="flex items-center gap-4 mt-2 text-sm">
                {form.purchase_price && (
                  <span className="text-2xl font-bold">${parseFloat(form.purchase_price).toLocaleString()}</span>
                )}
                {form.city && <span className="text-navy-200">{form.city}, {form.state}</span>}
                {form.length_ft && form.width_ft && (
                  <span className="text-gold-300">
                    {form.length_ft} × {form.width_ft} ({computedSqFt?.toLocaleString()} ft²)
                  </span>
                )}
              </div>
            </div>
          )}
          
          {/* Step indicators */}
          <div className="mt-4 flex items-center justify-between">
            {STEP_ORDER.map((step, index) => (
              <div key={step} className="flex items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                  purchaseStep === step 
                    ? 'bg-gold-500 text-white' 
                    : STEP_ORDER.indexOf(purchaseStep) > index
                      ? 'bg-green-500 text-white'
                      : 'bg-white/20 text-white/60'
                }`}>
                  {STEP_ORDER.indexOf(purchaseStep) > index ? '✓' : index + 1}
                </div>
                {index < 3 && (
                  <div className={`w-12 h-1 mx-1 ${
                    STEP_ORDER.indexOf(purchaseStep) > index
                      ? 'bg-green-500'
                      : 'bg-white/20'
                  }`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* ========== STEP 1: DATOS + DOCUMENTOS ========== */}
        {purchaseStep === 'documents' && (
          <div className="p-6 space-y-6">
            {/* Property Info Fields */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-navy-900 font-medium">
            <MapPin className="w-5 h-5 text-gold-500" />
                Datos de la Propiedad
          </div>

          <FormInput
            label="Dirección"
            name="address"
            value={form.address}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            placeholder="123 Main Street"
            error={getFieldError('address')}
          />

              <div className="grid grid-cols-3 gap-4">
            <FormInput
              label="Ciudad"
              name="city"
              value={form.city}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Houston"
              error={getFieldError('city')}
            />
            <FormInput
              label="Estado"
              name="state"
              value={form.state}
              onChange={handleChange}
              onBlur={handleBlur}
              error={getFieldError('state')}
            />
            <FormInput
              label="Código Postal"
              name="zip_code"
              value={form.zip_code}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="77001"
              error={getFieldError('zip_code')}
            />
              </div>

              <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="HUD Number"
              name="hud_number"
              value={form.hud_number}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="TEX1234567"
            />
            <FormInput
              type="number"
              label="Año"
              name="year"
              value={form.year}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="2020"
              min={1900}
              max={2030}
              error={getFieldError('year')}
            />
              </div>

              <div className="flex items-center gap-2 text-navy-900 font-medium mt-4">
                <Home className="w-5 h-5 text-gold-500" />
                Detalles de la Propiedad
          </div>

          <div className="grid grid-cols-2 gap-4">
                <div>
            <FormInput
              type="number"
              label="Largo (ft)"
              name="length_ft"
              value={form.length_ft}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="76"
              min={0}
              helperText="Largo en pies"
            />
                </div>
                <div>
            <FormInput
              type="number"
              label="Ancho (ft)"
              name="width_ft"
              value={form.width_ft}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="16"
              min={0}
              helperText="Ancho en pies"
            />
          </div>
          </div>

              {/* Auto-calculated square feet display */}
              {computedSqFt && computedSqFt > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2 text-sm text-blue-800">
                  <span className="font-medium">Medida:</span> {form.length_ft} × {form.width_ft} ({computedSqFt.toLocaleString()} ft²)
                </div>
              )}

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              type="number"
              label="Habitaciones"
              name="bedrooms"
              value={form.bedrooms}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="3"
              min={0}
              max={20}
              error={getFieldError('bedrooms')}
            />
            <FormInput
              type="number"
              label="Baños"
              name="bathrooms"
              value={form.bathrooms}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="2"
              min={0}
              max={20}
              step={0.5}
              error={getFieldError('bathrooms')}
            />
        </div>

              <div className="flex items-center gap-2 text-navy-900 font-medium mt-4">
            <DollarSign className="w-5 h-5 text-gold-500" />
            Información Financiera
          </div>

          <FormInput
            type="number"
            label="Precio de Compra"
            name="purchase_price"
            value={form.purchase_price}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="50000"
            min={0}
            step={0.01}
            prefix="$"
            error={getFieldError('purchase_price')}
          />
        </div>

            {/* Divider */}
            <div className="border-t border-gray-200 pt-6">
              <div className="flex items-center gap-2 text-navy-900 font-medium mb-4">
                <FileText className="w-5 h-5 text-gold-500" />
                Documentos
              </div>
            </div>

            {/* Bill of Sale */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Bill of Sale (Factura de Compra-Venta) *
              </label>
              
              {showBillOfSale ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <BillOfSaleTemplate
                    transactionType="purchase"
                    initialData={{
                      seller_name: '',
                      buyer_name: 'MANINOS HOMES',
                      buyer_address: form.address || '',
                      buyer_date: new Date().toISOString().split('T')[0],
                      manufacturer: tdhcaResult?.manufacturer || '',
                      make: tdhcaResult?.model || '',
                      date_manufactured: tdhcaResult?.year || form.year || '',
                      bedrooms: form.bedrooms || '',
                      baths: form.bathrooms || '',
                      dimensions: form.length_ft && form.width_ft
                        ? `${form.length_ft} x ${form.width_ft} (${computedSqFt?.toLocaleString()} sqft)`
                        : '',
                      serial_number: tdhcaResult?.serial_number || '',
                      hud_label_number: tdhcaResult?.label_seal || form.hud_number || '',
                      location_of_home: `${form.address || ''}, ${form.city || ''}, ${form.state || 'TX'}`,
                      total_payment: form.purchase_price ? `$${parseFloat(form.purchase_price).toLocaleString()}` : '',
                      is_new: false,
                      is_used: true,
                    }}
                    onSave={(file, data) => {
                      setBillOfSaleData(data)
                      handleFileUpload('billOfSale', file)
                      setShowBillOfSale(false)
                      toast.success('✓ Bill of Sale guardado como PDF')
                    }}
                    onClose={() => setShowBillOfSale(false)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowBillOfSale(true)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      billOfSaleData
                        ? 'border-green-300 bg-green-50 hover:bg-green-100'
                        : 'border-gold-300 bg-gold-50 hover:bg-gold-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      billOfSaleData ? 'bg-green-100' : 'bg-gold-100'
                    }`}>
                      {billOfSaleData ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <FileText className="w-5 h-5 text-gold-600" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-semibold ${billOfSaleData ? 'text-green-900' : 'text-gold-900'}`}>
                        {billOfSaleData ? '✓ Bill of Sale Completado' : 'Abrir Template Bill of Sale'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {billOfSaleData
                          ? `Vendedor: ${billOfSaleData.seller_name || '—'} | Comprador: ${billOfSaleData.buyer_name || '—'}`
                          : 'Completa el template oficial de Maninos Homes, edítalo e imprímelo'}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <div className="text-center text-xs text-gray-400 font-medium">— o sube un Bill of Sale firmado —</div>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                    documents.billOfSale ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  }`}>
                    {documents.billOfSale ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-green-700 font-medium text-sm">{documents.billOfSale.name}</span>
                        <button onClick={() => handleFileUpload('billOfSale', null)} className="text-red-500 hover:text-red-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-500">PDF, JPG, PNG (máx. 10MB)</p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handleFileUpload('billOfSale', e.target.files?.[0] || null)}
                        />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Title — TDHCA Lookup */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Título de la Casa (TDHCA) *
              </label>
              
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-3">
                <p className="text-sm font-semibold text-indigo-900 mb-3">Buscar Título en TDHCA Texas</p>
                <p className="text-xs text-indigo-700 mb-3">Ingresa el Serial Number o Label/Seal Number de la mobile home para obtener el título automáticamente.</p>
                
                <div className="flex gap-2 mb-3">
                  <button
                    onClick={() => setTdhcaSearchType('serial')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      tdhcaSearchType === 'serial'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    Serial Number
                  </button>
                  <button
                    onClick={() => setTdhcaSearchType('label')}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      tdhcaSearchType === 'label'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white text-indigo-700 border border-indigo-300 hover:bg-indigo-100'
                    }`}
                  >
                    Label/Seal Number
                  </button>
                </div>
                
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tdhcaSearchValue}
                    onChange={(e) => setTdhcaSearchValue(e.target.value.toUpperCase())}
                    placeholder={tdhcaSearchType === 'serial' ? 'Ej: C3208' : 'Ej: TEX0012345'}
                    className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                    onKeyDown={(e) => e.key === 'Enter' && lookupTDHCA()}
                  />
                  <button
                    onClick={lookupTDHCA}
                    disabled={tdhcaLoading || !tdhcaSearchValue.trim()}
                    className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                      tdhcaLoading || !tdhcaSearchValue.trim()
                        ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                        : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    {tdhcaLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </button>
                </div>
                
                {tdhcaError && (
                  <p className="text-sm text-red-600 mt-2 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    {tdhcaError}
                  </p>
                )}
              </div>
              
              {/* TDHCA Results */}
              {tdhcaResult && (
                <div className="border-2 border-green-300 bg-green-50 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="text-sm font-semibold text-green-800">Título Encontrado</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {tdhcaResult.certificate_number && (
                      <div><span className="font-semibold text-gray-600">Certificado:</span> <span className="text-gray-900">{tdhcaResult.certificate_number}</span></div>
                    )}
                    {tdhcaResult.manufacturer && (
                      <div className="col-span-2"><span className="font-semibold text-gray-600">Fabricante:</span> <span className="text-gray-900">{tdhcaResult.manufacturer}</span></div>
                    )}
                    {tdhcaResult.model && (
                      <div><span className="font-semibold text-gray-600">Modelo:</span> <span className="text-gray-900">{tdhcaResult.model}</span></div>
                    )}
                    {tdhcaResult.year && (
                      <div><span className="font-semibold text-gray-600">Año:</span> <span className="text-gray-900">{tdhcaResult.year}</span></div>
                    )}
                    {tdhcaResult.serial_number && (
                      <div><span className="font-semibold text-gray-600">Serial #:</span> <span className="text-gray-900">{tdhcaResult.serial_number}</span></div>
                    )}
                    {tdhcaResult.label_seal && (
                      <div><span className="font-semibold text-gray-600">Label/Seal #:</span> <span className="text-gray-900">{tdhcaResult.label_seal}</span></div>
                    )}
                    {tdhcaResult.square_feet && (
                      <div><span className="font-semibold text-gray-600">Sq Ft:</span> <span className="text-gray-900">{tdhcaResult.square_feet}</span></div>
                    )}
                    {tdhcaResult.wind_zone && (
                      <div><span className="font-semibold text-gray-600">Wind Zone:</span> <span className="text-gray-900">{tdhcaResult.wind_zone}</span></div>
                    )}
                    {(tdhcaResult.width && tdhcaResult.length) && (
                      <div><span className="font-semibold text-gray-600">Tamaño:</span> <span className="text-gray-900">{tdhcaResult.width} × {tdhcaResult.length}</span></div>
                    )}
                    {tdhcaResult.buyer && (
                      <div className="col-span-2"><span className="font-semibold text-gray-600">Dueño actual (vendedor):</span> <span className="text-gray-900">{tdhcaResult.buyer}</span></div>
                    )}
                    {tdhcaResult.seller && (
                      <div><span className="font-semibold text-gray-600">Dueño anterior:</span> <span className="text-gray-900">{tdhcaResult.seller}</span></div>
                    )}
                    {tdhcaResult.county && (
                      <div><span className="font-semibold text-gray-600">Condado:</span> <span className="text-gray-900">{tdhcaResult.county}</span></div>
                    )}
                    {tdhcaResult.transfer_date && (
                      <div><span className="font-semibold text-gray-600">Fecha Transferencia:</span> <span className="text-gray-900">{tdhcaResult.transfer_date}</span></div>
                    )}
                    {tdhcaResult.lien_info && (
                      <div className="col-span-2"><span className="font-semibold text-gray-600">Gravamen:</span> <span className="text-gray-900">{tdhcaResult.lien_info}</span></div>
                    )}
                  </div>
                  
                  {(tdhcaResult.detail_url || tdhcaResult.print_url) && (
                    <a
                      href={tdhcaResult.detail_url || tdhcaResult.print_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      Ver Registro Completo en TDHCA
                    </a>
                  )}
                </div>
              )}
              
              {/* Fallback: manual upload */}
              {!tdhcaResult && (
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-2">O sube el título manualmente:</p>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                    documents.title ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  }`}>
                    {documents.title ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-green-700 font-medium text-sm">{documents.title.name}</span>
                        <button onClick={() => handleFileUpload('title', null)} className="text-red-500 hover:text-red-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <label className="cursor-pointer">
                        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-500">PDF, JPG, PNG</p>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => handleFileUpload('title', e.target.files?.[0] || null)} />
                      </label>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Title Application */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Aplicación Cambio de Título (Statement of Ownership)
              </label>
              
              {showTitleApp ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <TitleApplicationTemplate
                    transactionType="purchase"
                    initialData={{
                      // Block 1 defaults
                      applicant_name: 'MANINOS HOMES LLC',
                      is_new: false,
                      is_used: true,
                      // Block 2A — auto-fill from TDHCA title
                      manufacturer: getTdhcaField('manufacturer', 'Manufacturer'),
                      manufacturer_address: getTdhcaField('manufacturer_address', 'Address', 'Manufacturer Address', 'Mfg Address'),
                      manufacturer_city_state_zip: getTdhcaField('manufacturer_city_state_zip', 'City, State, Zip', 'City State Zip', 'City, State'),
                      make: getTdhcaField('model', 'Model'),
                      year: getTdhcaField('year', 'Year', 'Date Manf', 'Date of Manufacture') || form.year || '',
                      date_of_manufacture: getTdhcaField('year', 'Date Manf', 'Date of Manufacture'),
                      total_sqft: getTdhcaField('square_feet', 'Square Ftg', 'Square Feet') || computedSqFt?.toString() || '',
                      section1_label: cleanSuspiciousValue(getTdhcaField('label_seal', 'Label/Seal#', 'Label/Seal', 'Label/Seal Number')),
                      section1_serial: cleanSuspiciousValue(getTdhcaField('serial_number', 'Serial #', 'Serial', 'Serial Number', 'Complete Serial Number')),
                      section1_width: deriveDimensions().width,
                      section1_length: deriveDimensions().length,
                      wind_zone: getTdhcaField('wind_zone', 'Wind Zone'),
                      // Legacy compat
                      serial_number: cleanSuspiciousValue(getTdhcaField('serial_number', 'Serial #', 'Serial', 'Serial Number', 'Complete Serial Number')),
                      label_seal_number: cleanSuspiciousValue(getTdhcaField('label_seal', 'Label/Seal#', 'Label/Seal', 'Label/Seal Number')),
                      sqft: getTdhcaField('square_feet', 'Square Ftg', 'Square Feet') || computedSqFt?.toString() || '',
                      bedrooms: form.bedrooms || '',
                      bathrooms: form.bathrooms || '',
                      // Block 2B — default Yes
                      has_hud_label: true,
                      no_hud_label: false,
                      // Block 3 — location
                      location_address: form.address || '',
                      location_city: form.city || '',
                      location_state: form.state || 'TX',
                      location_zip: form.zip_code || '',
                      location_county: getTdhcaField('county', 'County'),
                      // Block 4A — seller auto-fill from title (current owner = tdhcaResult.buyer)
                      seller_name: getTdhcaField('buyer', 'Buyer/Transferee', 'Buyer'),
                      // Block 4B — buyer is always Maninos
                      buyer_name: 'MANINOS HOMES LLC',
                      // Block 4C/D
                      sale_price: form.purchase_price ? `$${parseFloat(form.purchase_price).toLocaleString()}` : '',
                      sale_date: new Date().toISOString().split('T')[0],
                      sale_transfer_date: new Date().toISOString().split('T')[0],
                      // Page 2 — auto-sync from Block 2A
                      page2_hud_label: cleanSuspiciousValue(getTdhcaField('label_seal', 'Label/Seal#', 'Label/Seal', 'Label/Seal Number')),
                      page2_serial: cleanSuspiciousValue(getTdhcaField('serial_number', 'Serial #', 'Serial', 'Serial Number', 'Complete Serial Number')),
                      // Block 6 — default Inventory
                      election_inventory: true,
                    }}
                    onSave={(file, data) => {
                      setTitleAppData(data)
                      handleFileUpload('titleApplication', file)
                      setShowTitleApp(false)
                      toast.success('✓ Aplicación de Título guardada como PDF')
                    }}
                    onClose={() => setShowTitleApp(false)}
                  />
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowTitleApp(true)}
                    className={`w-full flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                      titleAppData || documents.titleApplication
                        ? 'border-green-300 bg-green-50 hover:bg-green-100'
                        : 'border-indigo-300 bg-indigo-50 hover:bg-indigo-100'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      titleAppData || documents.titleApplication ? 'bg-green-100' : 'bg-indigo-100'
                    }`}>
                      {titleAppData || documents.titleApplication ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <FileText className="w-5 h-5 text-indigo-600" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <p className={`text-sm font-semibold ${
                        titleAppData || documents.titleApplication ? 'text-green-900' : 'text-indigo-900'
                      }`}>
                        {titleAppData || documents.titleApplication
                          ? '✓ Aplicación de Título Completada'
                          : 'Abrir Template Aplicación de Título'}
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5">
                        {titleAppData
                          ? `Solicitante: ${titleAppData.applicant_name || '—'}`
                          : documents.titleApplication
                            ? documents.titleApplication.name
                            : 'Basado en TDHCA Form 1023 — Editable y descargable como PDF'}
                      </p>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  </button>

                  <div className="text-center text-xs text-gray-400 font-medium">— o sube una aplicación firmada —</div>
                  <div className={`border-2 border-dashed rounded-lg p-4 text-center ${
                    documents.titleApplication ? 'border-green-300 bg-green-50' : 'border-gray-200'
                  }`}>
                    {documents.titleApplication && !titleAppData ? (
                      <div className="flex items-center justify-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span className="text-green-700 font-medium text-sm">{documents.titleApplication.name}</span>
                        <button onClick={() => handleFileUpload('titleApplication', null)} className="text-red-500 hover:text-red-700">
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : !titleAppData ? (
                      <label className="cursor-pointer">
                        <Upload className="w-6 h-6 text-gray-400 mx-auto mb-1" />
                        <p className="text-xs text-gray-500">PDF, JPG, PNG (máx. 10MB)</p>
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="hidden"
                          onChange={(e) => handleFileUpload('titleApplication', e.target.files?.[0] || null)}
                        />
                      </label>
                    ) : null}
                  </div>

                  <a
                    href={TDHCA_TITLE_APPLICATION_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Ver formulario oficial TDHCA (referencia)
                  </a>
                </div>
              )}
            </div>

            {/* Validation messages */}
            {!isPropertyInfoValid && (
              <p className="text-sm text-amber-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                La dirección es obligatoria para continuar
              </p>
            )}
            {isPropertyInfoValid && !allDocsReady && (
              <p className="text-sm text-amber-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                {!isBosComplete ? 'Completa el Bill of Sale (template o sube archivo)' : 
                 !isTitleComplete ? 'Busca el título en TDHCA o sube manualmente' : 
                 'Completa todos los documentos para continuar'}
              </p>
            )}
          </div>
        )}

        {/* ========== STEP 2: EVALUATION ========== */}
        {purchaseStep === 'checklist' && (
          <div className="p-6">
            <DesktopEvaluatorPanel
              onReportGenerated={(report) => {
                setEvalReport(report)
              }}
            />
          </div>
        )}

        {/* ========== STEP 3: PAYMENT ========== */}
        {purchaseStep === 'payment' && (
          <div className="p-6">
            <div className="space-y-6">
              {/* Payment Amount */}
              <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-xl p-5 text-white">
                <p className="text-sm text-navy-200 mb-1">Monto a pagar al vendedor</p>
                <div className="text-3xl font-bold">${payment.amount.toLocaleString()}</div>
                <p className="text-xs text-navy-300 mt-1">Coordinado por Abigail (Tesorería)</p>
              </div>
              
              {/* Payment Method */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">
                  <CreditCard className="w-4 h-4 inline mr-2" />
                  Método de Pago *
                </label>
                <div className="space-y-2">
                  {PAYMENT_METHODS.map(method => (
                    <button
                      key={method.id}
                      onClick={() => setPayment(prev => ({ ...prev, method: method.id }))}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all flex items-center gap-3 ${
                        payment.method === method.id
                          ? 'border-gold-500 bg-gold-50 shadow-sm'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex-1">
                        <span className={`font-medium block ${payment.method === method.id ? 'text-gold-800' : 'text-gray-700'}`}>
                          {method.label}
                        </span>
                        <span className="text-xs text-gray-500">{method.description}</span>
                      </div>
                      {method.recommended && (
                        <span className="text-[10px] font-bold uppercase tracking-wider bg-green-100 text-green-700 px-2 py-1 rounded-full">
                          Recomendado
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              
              {/* Bank Transfer Details */}
              {payment.method === 'transferencia' && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
                  <p className="text-sm font-semibold text-blue-900">Datos para Transferencia Bancaria</p>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Banco del vendedor</label>
                      <input
                        type="text"
                        placeholder="Ej: Chase, Wells Fargo..."
                        className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                        onChange={(e) => setPayment(prev => ({ ...prev, reference: `BANK:${e.target.value}|${prev.reference?.split('|')[1] || ''}` }))}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Routing Number</label>
                      <input type="text" placeholder="9 dígitos" maxLength={9} className="w-full p-2.5 border border-blue-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                      <input type="text" placeholder="Número de cuenta" className="w-full p-2.5 border border-blue-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del beneficiario</label>
                      <input type="text" placeholder="Nombre del vendedor" className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
                    </div>
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Número de confirmación / Referencia *</label>
                    <input
                      type="text"
                      value={payment.reference}
                      onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                      placeholder="Ingresa el # de confirmación una vez realizada la transferencia"
                      className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                    <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700">
                      <strong>Recuerda:</strong> Coordinar con Abigail antes de enviar la transferencia. 
                      No se puede pagar al vendedor hasta que la aplicación de cambio de título haya sido recibida.
                    </p>
                  </div>
                </div>
              )}
              
              {/* Zelle Details */}
              {payment.method === 'zelle' && (
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-5 space-y-3">
                  <p className="text-sm font-semibold text-purple-900">Pago por Zelle</p>
                  <div className="bg-white rounded-lg p-3 border border-purple-200">
                    <p className="text-xs text-gray-500 mb-1">Enviar Zelle a:</p>
                    <p className="text-lg font-mono font-bold text-purple-800">832-745-9600</p>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Número de confirmación *</label>
                    <input
                      type="text"
                      value={payment.reference}
                      onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                      placeholder="# de confirmación de Zelle"
                      className="w-full p-2.5 border border-purple-300 rounded-lg text-sm focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              )}
              
              {/* Other Methods */}
              {payment.method && !['transferencia', 'zelle'].includes(payment.method) && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Referencia / Número de Transacción *
                  </label>
                  <input
                    type="text"
                    value={payment.reference}
                    onChange={(e) => setPayment(prev => ({ ...prev, reference: e.target.value }))}
                    placeholder="Ej: CHK-123456789"
                    className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                  />
                </div>
              )}
              
              {/* Payment Date */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Fecha del Pago
                </label>
                <input
                  type="date"
                  value={payment.date}
                  onChange={(e) => setPayment(prev => ({ ...prev, date: e.target.value }))}
                  className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
                />
              </div>
            </div>
            
            {(!payment.method || !payment.reference) && (
              <p className="text-sm text-amber-600 mt-4 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Completa el método y la referencia de pago
              </p>
            )}
          </div>
        )}

        {/* ========== STEP 4: CONFIRM ========== */}
        {purchaseStep === 'confirm' && (
          <div className="p-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
              <h4 className="font-semibold text-green-800 mb-4 flex items-center gap-2">
                <CheckCircle className="w-5 h-5" />
                Resumen de la Compra
              </h4>
              
              <div className="space-y-4">
                <div className="flex justify-between items-center py-2 border-b border-green-200">
                  <span className="text-green-700">Propiedad</span>
                  <span className="font-medium text-green-900">{form.address}</span>
                </div>
                {form.city && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-green-700">Ubicación</span>
                    <span className="font-medium text-green-900">{form.city}, {form.state}</span>
                  </div>
                )}
                {form.length_ft && form.width_ft && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-green-700">Medida</span>
                    <span className="font-medium text-green-900">
                      {form.length_ft} × {form.width_ft} ({computedSqFt?.toLocaleString()} ft²)
                    </span>
                  </div>
                )}
                {form.purchase_price && (
                  <div className="flex justify-between items-center py-2 border-b border-green-200">
                    <span className="text-green-700">Precio de Compra</span>
                    <span className="font-bold text-green-900 text-xl">
                      ${parseFloat(form.purchase_price).toLocaleString()}
                    </span>
                  </div>
                )}
                <div className="flex justify-between items-center py-2 border-b border-green-200">
                  <span className="text-green-700">Evaluación</span>
                  <span className="font-medium text-green-900">
                    {evalReport ? `${evalReport.report_number} — Score ${evalReport.score}/100 (${evalReport.recommendation})` : 'Completada ✓'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2 border-b border-green-200">
                  <span className="text-green-700">Documentos</span>
                  <span className="font-medium text-green-900">
                    Bill of Sale {isBosComplete ? '✓' : '—'} | Título {isTitleComplete ? '✓' : '—'} | Cambio Título {isTitleAppComplete ? '✓' : '—'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-green-700">Pago</span>
                  <span className="font-medium text-green-900">
                    {PAYMENT_METHODS.find(m => m.id === payment.method)?.label} - Ref: {payment.reference}
                  </span>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-gray-600 text-center">
              Al confirmar, la casa se añadirá al inventario de Maninos con todos los documentos asociados.
            </p>
          </div>
        )}

        {/* ========== ACTIONS ========== */}
        <div className="p-6 bg-gray-50 border-t flex gap-3">
          {purchaseStep !== 'documents' && (
            <button
              onClick={goToPrevStep}
              className="btn-secondary flex items-center gap-2"
              disabled={processing}
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
          )}
          
          <Link
            href="/homes/properties"
            className="btn-secondary"
          >
            Cancelar
          </Link>
          
          <div className="flex-1" />
          
          {purchaseStep === 'documents' && (
          <button 
              onClick={goToNextStep}
              disabled={!allDocsReady || !isPropertyInfoValid}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                allDocsReady && isPropertyInfoValid
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          
          {purchaseStep === 'checklist' && (
            <button
              onClick={() => setPurchaseStep('payment')}
              disabled={!evalReport}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                evalReport
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          
          {purchaseStep === 'payment' && (
            <button
              onClick={goToNextStep}
              disabled={!payment.method || !payment.reference}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                payment.method && payment.reference
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          
          {purchaseStep === 'confirm' && (
          <button 
              onClick={confirmPurchase}
              disabled={processing}
              className="btn-gold flex items-center gap-2 px-6 py-2"
            >
              {processing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Procesando...
              </>
            ) : (
              <>
                  <CheckCircle className="w-4 h-4" />
                  Confirmar Compra
              </>
            )}
          </button>
          )}
        </div>
      </div>
    </div>
  )
}
