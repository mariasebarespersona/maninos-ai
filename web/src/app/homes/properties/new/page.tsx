'use client'

import React, { useState, useCallback, useEffect } from 'react'
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
  Pencil,
  Clock,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useFormValidation, commonSchemas } from '@/hooks/useFormValidation'
import FormInput from '@/components/ui/FormInput'
import BillOfSaleTemplate, { type BillOfSaleData, generateSignedBillOfSalePDF } from '@/components/BillOfSaleTemplate'
import TitleApplicationTemplate, { type TitleApplicationData, generateSignedTitleAppPDF } from '@/components/TitleApplicationTemplate'
import { BankTransferStep, usePayeeState, type PaymentInfo } from '@/components/BankTransferPayment'
import DesktopEvaluatorPanel from '@/components/DesktopEvaluatorPanel'

/**
 * New Property — 4-step purchase flow (same as "Revisar Casa" in Market)
 * Step 1: Datos de la Propiedad + Documentos
 * Step 2: Evaluación en Campo
 * Step 3: Orden de Pago
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

// PaymentInfo imported from BankTransferPayment

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
  const [tdhcaSearchType, setTdhcaSearchType] = useState<'label' | 'serial'>('label')
  const [tdhcaLoading, setTdhcaLoading] = useState(false)
  const [tdhcaResult, setTdhcaResult] = useState<any>(null)
  const [tdhcaError, setTdhcaError] = useState<string | null>(null)
  const [tdhcaPageText, setTdhcaPageText] = useState<string>('')
  const [tdhcaCleanPageText, setTdhcaCleanPageText] = useState<string>('')
  const [tdhcaRawHtml, setTdhcaRawHtml] = useState<string>('')
  const [tdhcaDebugLog, setTdhcaDebugLog] = useState<string[]>([])
  const [showTdhcaDebug, setShowTdhcaDebug] = useState(false)

  // Signed docs refresh key
  const [signRefreshKey, setSignRefreshKey] = useState(0)

  // Seller signature status for confirm step
  const [sellerSignatures, setSellerSignatures] = useState<{
    bos: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string; token?: string } | null;
    title_app: { signed: boolean; signature_type?: string; signature_value?: string; signer_name?: string; token?: string } | null;
  }>({ bos: null, title_app: null })

  // Inline email input for e-sign (replaces browser prompt)
  const [esignEmailFor, setEsignEmailFor] = useState<'bos' | 'title_app' | null>(null)
  const [esignEmail, setEsignEmail] = useState('')
  const [esignSending, setEsignSending] = useState(false)

  // Preview signed document using the real template component
  const [previewDoc, setPreviewDoc] = useState<'bos' | 'title_app' | null>(null)

  // Property ID after creation (for e-sign linking)
  const [createdPropertyId, setCreatedPropertyId] = useState<string | null>(null)

  // Payment state
  const [payment, setPayment] = useState<PaymentInfo>({
    method: 'transferencia',
    reference: '',
    date: new Date().toISOString().split('T')[0],
    amount: 0,
  })

  // Payee state (shared hook)
  const payee = usePayeeState()

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

  // Fetch seller signature status from e-sign envelopes
  const fetchSellerSignatures = useCallback(async () => {
    // For new properties we use the created property ID if available
    if (!createdPropertyId) return
    try {
      const res = await fetch(`/api/esign/property/${createdPropertyId}/envelopes`)
      if (!res.ok) return
      const { envelopes } = await res.json()
      const sigs: typeof sellerSignatures = { bos: null, title_app: null }
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
          token: sellerSig.token,
        }
        if (env.document_type === 'bill_of_sale') sigs.bos = entry
        if (env.document_type === 'title_application') sigs.title_app = entry
      }
      setSellerSignatures(sigs)
    } catch {}
  }, [createdPropertyId])

  // Poll for seller signatures every 10s when on confirm step
  useEffect(() => {
    if (purchaseStep !== 'confirm') return
    fetchSellerSignatures()
    const interval = setInterval(fetchSellerSignatures, 10000)
    return () => clearInterval(interval)
  }, [purchaseStep, fetchSellerSignatures])

  // Send document for e-signature
  const sendForEsign = async (docType: 'bos' | 'title_app') => {
    if (!esignEmail.trim()) return
    setEsignSending(true)
    try {
      const isBos = docType === 'bos'
      const signerName = isBos
        ? (billOfSaleData?.seller_name || 'Vendedor')
        : ((titleAppData as any)?.seller_transferor_name || billOfSaleData?.seller_name || 'Vendedor')
      const res = await fetch('/api/esign/envelopes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: isBos
            ? `Bill of Sale — ${form.address || 'Nueva Propiedad'}`
            : `Cambio Título — ${form.address || 'Nueva Propiedad'}`,
          document_type: isBos ? 'bill_of_sale' : 'title_application',
          transaction_type: 'purchase',
          property_id: null,
          signers: [
            { role: 'seller', name: signerName, email: esignEmail.trim() },
            { role: 'buyer', name: 'MANINOS HOMES', email: 'info@maninoshomes.com' },
          ],
          send_immediately: true,
        }),
      })
      if (res.ok) {
        toast.success(`Firma enviada a ${esignEmail.trim()} — recibirá un email para firmar`)
        setSignRefreshKey(k => k + 1)
        setEsignEmailFor(null)
        setEsignEmail('')
      } else {
        toast.error('Error enviando firma — verifica que la migración 074 está corrida')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setEsignSending(false)
    }
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
        console.log('[NewProperty] ✅ TDHCA result:', {
          manufacturer: data.data?.manufacturer,
          manufacturer_address: data.data?.manufacturer_address,
          manufacturer_city_state_zip: data.data?.manufacturer_city_state_zip,
          model: data.data?.model,
          serial_number: data.data?.serial_number,
          label_seal: data.data?.label_seal,
          buyer: data.data?.buyer,
          seller: data.data?.seller,
          square_feet: data.data?.square_feet,
          year: data.data?.year,
          date_of_manufacture: data.data?.date_of_manufacture,
          wind_zone: data.data?.wind_zone,
          county: data.data?.county,
          width: data.data?.width,
          length: data.data?.length,
          raw_fields_keys: data.data?.raw_fields ? Object.keys(data.data.raw_fields) : [],
          raw_fields: data.data?.raw_fields,
        })
        if (data.page_text) {
          console.log('[NewProperty] TDHCA page_text (first 2000):', data.page_text?.substring(0, 2000))
        }
        if (data.debug_log) {
          console.log('[NewProperty] 🔍 TDHCA debug log:');
          (data.debug_log as string[]).forEach((line: string) => console.log('  ', line))
        }
        if (data.raw_html) {
          console.log('[NewProperty] 📄 TDHCA raw HTML (first 3000):', data.raw_html?.substring(0, 3000))
        }
        setTdhcaResult(data.data)
        setTdhcaPageText(data.page_text || '')
        setTdhcaCleanPageText(data.clean_page_text || '')
        setTdhcaRawHtml(data.raw_html || '')
        setTdhcaDebugLog(data.debug_log || [])
      } else {
        setTdhcaError(data.message || 'No se encontraron resultados')
      }
    } catch (err: any) {
      setTdhcaError(`Error: ${err.message}`)
    } finally {
      setTdhcaLoading(false)
    }
  }

  // TDHCA field helpers.
  // IMPORTANT: The backend validates/cleans fields. If it returns "" (e.g. wind_zone),
  // we must respect it and NOT fall back to unvalidated raw_fields.
  const getTdhcaField = (...keys: string[]): string => {
    if (!tdhcaResult) return ''

    // Pass 1: structured (top-level) fields — respect backend validation (even "")
    for (const key of keys) {
      const val = tdhcaResult?.[key]
      if (typeof val === 'string') return val.trim()
    }

    // Pass 2: raw_fields fallback — only for keys NOT in structured output
    const raw = (tdhcaResult?.raw_fields || {}) as Record<string, any>
    const entries = Object.entries(raw)
    for (const key of keys) {
      if (key in tdhcaResult) continue // backend already handled this key
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

  // ── CLIENT-SIDE TEXT EXTRACTION (last-resort fallback) ────────────
  const extractFromText = (text: string, ...patterns: RegExp[]): string => {
    if (!text) return ''
    for (const p of patterns) {
      const m = text.match(p)
      if (m && m[1]?.trim()) return m[1].trim()
    }
    return ''
  }

  const isValidWindZone = (v: string): boolean => /^[IVX123]{1,3}$/i.test(v.trim())

  // 3-layer fallback: structured → raw_fields → pageText regex
  const getField = (structuredKey: string, rawKeys: string[], textPatterns: RegExp[]): string => {
    const structured = tdhcaResult?.[structuredKey]
    if (typeof structured === 'string' && structured.trim()) return structured.trim()
    const raw = (tdhcaResult?.raw_fields || {}) as Record<string, any>
    for (const rk of rawKeys) {
      const rv = raw[rk]
      if (rv !== undefined && rv !== null && String(rv).trim()) return String(rv).trim()
      const lower = rk.toLowerCase()
      const found = Object.entries(raw).find(([k]) => k.toLowerCase() === lower)
      if (found && found[1] !== undefined && found[1] !== null && String(found[1]).trim()) return String(found[1]).trim()
    }
    return extractFromText(tdhcaPageText, ...textPatterns)
  }

  const deriveDimensions = () => {
    const w = cleanSuspiciousValue(getTdhcaField('width', 'Width'))
    const l = cleanSuspiciousValue(getTdhcaField('length', 'Length'))
    if (w && l) return { width: w, length: l }
    const sizeRaw = getTdhcaField('Size', 'Size*', 'size')
    const m = sizeRaw.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/)
    return m ? { width: m[1], length: m[2] } : { width: '', length: '' }
  }

  /**
   * Client-side safety net: split manufacturer string into name, address, cityStateZip.
   * Ensures address never stays embedded in the manufacturer name field.
   */
  const splitManufacturerParts = () => {
    const rawMfr = getTdhcaField('manufacturer', 'Manufacturer')
    const backendAddr = getTdhcaField('manufacturer_address', 'Address', 'Manufacturer Address', 'Mfg Address')
    const backendCsz = getTdhcaField('manufacturer_city_state_zip', 'City, State, Zip', 'City State Zip', 'City, State')
    if (backendAddr) return { name: rawMfr, address: backendAddr, cityStateZip: backendCsz }

    let clean = rawMfr.replace(/^MHD\w*\d+\s*/i, '').trim()
    clean = clean.replace(/([A-Za-z])(\d{3,})/g, '$1 $2')
    clean = clean.replace(/(\d)([A-Z]{2,}\b)/g, '$1 $2')
    clean = clean.replace(/([A-Z]{2})(\d{5})/g, '$1 $2')

    const addrMatch = clean.match(/^(.+?)\s+(\d{1,6}\s+.+)$/)
    if (!addrMatch) return { name: clean || rawMfr, address: '', cityStateZip: '' }

    const name = addrMatch[1].trim()
    const fullAddr = addrMatch[2].trim()
    const suffixes = new Set(['st','ave','avenue','blvd','ct','dr','drive','ln','lane','pl','rd','road','way','loop','pkwy','hwy','trail','cir','circle','ter','sq'])

    const splitCityFromStreet = (text: string, state: string, zip: string) => {
      const words = text.split(/\s+/)
      let splitIdx = words.length
      for (let i = words.length - 1; i >= 0; i--) {
        if (suffixes.has(words[i].toLowerCase()) || /^\d+$/.test(words[i])) { splitIdx = i + 1; break }
      }
      const street = words.slice(0, splitIdx).join(' ')
      const city = words.slice(splitIdx).join(' ')
      return { address: street || text, cityStateZip: city ? `${city}, ${state} ${zip}` : `${state} ${zip}` }
    }

    const cszComma = fullAddr.match(/^(.+),\s*([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)
    if (cszComma) return { name, ...splitCityFromStreet(cszComma[1].trim(), cszComma[2], cszComma[3]) }

    const cszNoComma = fullAddr.match(/^(.+?)\s+([A-Z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/)
    if (cszNoComma) return { name, ...splitCityFromStreet(cszNoComma[1].trim(), cszNoComma[2], cszNoComma[3]) }

    return { name, address: fullAddr, cityStateZip: '' }
  }

  // Document completeness checks
  const isBosComplete = !!(billOfSaleData || documents.billOfSale)
  const isTitleComplete = !!(tdhcaResult || documents.title)
  const isTitleAppComplete = !!(titleAppData || documents.titleApplication)
  // Bill of Sale + Title are compulsory; Title Application is optional
  const allDocsReady = isBosComplete && isTitleComplete
  const isPropertyInfoValid = !!form.address.trim()

  // Payment validation
  const isPaymentComplete = payee.isPayeeValid

  // Navigation
  const goToNextStep = async () => {
    if (purchaseStep === 'documents' && allDocsReady && isPropertyInfoValid) {
      setPurchaseStep('checklist')
    } else if (purchaseStep === 'checklist') {
      setPurchaseStep('payment')
    } else if (purchaseStep === 'payment' && isPaymentComplete) {
      const saved = await payee.saveNewPayee()
      if (saved) {
        setPayment(prev => ({ ...prev, payee_id: saved.id, payee_name: saved.name }))
      }
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

      const purchasePrice = form.purchase_price ? parseFloat(form.purchase_price) : 0

      const payload = {
        address: form.address,
        city: form.city || undefined,
        state: form.state || undefined,
        zip_code: form.zip_code || undefined,
        hud_number: form.hud_number || undefined,
        year: form.year ? parseInt(form.year) : undefined,
        purchase_price: purchasePrice || undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : undefined,
        square_feet: sqFt,
        length_ft: form.length_ft ? parseInt(form.length_ft) : undefined,
        width_ft: form.width_ft ? parseInt(form.width_ft) : undefined,
        document_data: Object.keys(docData).length > 0 ? docData : undefined,
        status: 'pending_payment',
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

      // 2. Regenerate signed PDFs if seller has signed, then upload
      let billOfSaleFile = documents.billOfSale
      let titleAppFile = documents.titleApplication

      // If seller signed the BOS, regenerate PDF with signature embedded
      if (sellerSignatures.bos?.signed && billOfSaleData) {
        try {
          const mergedBosData: any = { ...billOfSaleData }
          mergedBosData.seller_signature_type = sellerSignatures.bos.signature_type
          if (sellerSignatures.bos.signature_type === 'drawn') {
            mergedBosData.seller_signature_image = sellerSignatures.bos.signature_value
          } else {
            mergedBosData.seller_name = sellerSignatures.bos.signature_value || mergedBosData.seller_name
          }
          mergedBosData.seller_date = new Date().toISOString().split('T')[0]
          billOfSaleFile = await generateSignedBillOfSalePDF(mergedBosData, 'purchase')
          // Also update docData with signature info
          docData.bos_purchase = mergedBosData
        } catch (e) {
          console.error('Error generating signed BOS PDF:', e)
        }
      }

      // If seller signed the Title App, regenerate PDF with signature embedded
      if (sellerSignatures.title_app?.signed && titleAppData) {
        try {
          const mergedTaData: any = { ...titleAppData }
          mergedTaData.seller_signature_type = sellerSignatures.title_app.signature_type
          if (sellerSignatures.title_app.signature_type === 'drawn') {
            mergedTaData.seller_signature_image = sellerSignatures.title_app.signature_value
          } else {
            mergedTaData.seller_signature_value = sellerSignatures.title_app.signature_value || mergedTaData.seller_name
          }
          mergedTaData.seller_signature_date = new Date().toISOString().split('T')[0]
          titleAppFile = await generateSignedTitleAppPDF(mergedTaData, 'purchase')
          docData.title_app_purchase = mergedTaData
        } catch (e) {
          console.error('Error generating signed Title App PDF:', e)
        }
      }

      let billOfSaleUrl = null
      let titleUrl = null
      let titleApplicationUrl = null

      if (billOfSaleFile) {
        billOfSaleUrl = await uploadDocument(newProperty.id, billOfSaleFile, 'bill_of_sale_purchase')
      }
      if (documents.title) {
        titleUrl = await uploadDocument(newProperty.id, documents.title, 'title_purchase')
      }
      if (titleAppFile) {
        titleApplicationUrl = await uploadDocument(newProperty.id, titleAppFile, 'title_application_purchase')
      }

      // Update property document_data with signature info (if signatures were merged)
      if (sellerSignatures.bos?.signed || sellerSignatures.title_app?.signed) {
        try {
          await fetch(`/api/properties/${newProperty.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ document_data: docData }),
          })
        } catch {}
      }

      // If TDHCA lookup found a title, prefer detail URL
      if (!titleUrl && (tdhcaResult?.detail_url || tdhcaResult?.print_url)) {
        titleUrl = tdhcaResult.detail_url || tdhcaResult.print_url
      }
      // If no title application was uploaded, store the official TDHCA template URL
      if (!titleApplicationUrl) {
        titleApplicationUrl = TDHCA_TITLE_APPLICATION_URL
      }

      // 3. Create title transfer record with document URLs
      await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: newProperty.id,
          transfer_type: 'purchase',
          from_name: 'Vendedor',
          to_name: 'Maninos Homes',
          payment_method: payment.method,
          payment_date: payment.date,
          payment_amount: payment.amount,
          bill_of_sale_url: billOfSaleUrl,
          title_url: titleUrl,
          title_application_url: titleApplicationUrl,
        }),
      })

      // 3.1. Link evaluation report if exists
      if (evalReport?.id) {
        try {
          await fetch(`/api/evaluations/${evalReport.id}/link`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ property_id: newProperty.id }),
          })
        } catch (e) {
          console.error('Error linking eval report:', e)
        }
      }

      // 3.2. Create pending payment order if payee info was provided
      const orderAmount = purchasePrice || payment.amount
      if (payee.isPayeeValid) {
        try {
          const orderRes = await fetch('/api/payment-orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              property_id: newProperty.id,
              property_address: form.address,
              payee_id: payment.payee_id || undefined,
              payee_name: payment.payee_name || payee.newPayee.name || 'Vendedor',
              bank_name: payee.newPayee.bank_name || undefined,
              routing_number: payee.newPayee.routing_number || undefined,
              account_number: payee.newPayee.account_number || undefined,
              account_type: payee.newPayee.account_type || 'checking',
              payee_address: payee.newPayee.address || undefined,
              bank_address: payee.newPayee.bank_address || undefined,
              amount: orderAmount,
              method: payment.method,
              notes: 'Compra directa desde Nueva Propiedad',
            }),
          })
          if (!orderRes.ok) {
            const errData = await orderRes.json().catch(() => ({}))
            console.error('Error creating payment order:', orderRes.status, errData)
            toast.warning('Propiedad creada, pero la orden de pago no se pudo generar. Revisa Notificaciones.')
          }
        } catch (e) {
          console.error('Error creating payment order:', e)
          toast.warning('Propiedad creada, pero la orden de pago no se pudo generar.')
        }
      }

      toast.success('¡Propiedad creada! Orden de pago enviada a Notificaciones.')
      router.push('/homes/properties')
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
                {purchaseStep === 'payment' && 'Paso 3: Orden de Pago'}
                {purchaseStep === 'confirm' && 'Paso 4: Confirmar Compra'}
              </h3>
              <p className="text-navy-200 mt-1 text-sm">
                {purchaseStep === 'documents' && 'Ingresa los datos de la casa y completa los documentos'}
                {purchaseStep === 'checklist' && 'Evalúa la casa con la app móvil antes de continuar'}
                {purchaseStep === 'payment' && 'Completa los datos de la orden de pago al vendedor'}
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

                  {/* Send for e-signature */}
                  {billOfSaleData && (
                    esignEmailFor === 'bos' ? (
                      <div className="w-full rounded-xl border-2 border-blue-300 bg-blue-50 p-3" data-testid="esign-email-form-bos">
                        <p className="text-xs font-semibold text-blue-800 mb-2">Email del vendedor para enviar firma:</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="vendedor@email.com"
                            className="flex-1 border border-blue-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            data-testid="esign-email-input"
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
                            data-testid="esign-send-btn"
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button
                            onClick={() => { setEsignEmailFor(null); setEsignEmail('') }}
                            className="px-2 py-2 text-gray-500 hover:text-gray-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('bos'); setEsignEmail('') }}
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-blue-300 bg-blue-50 hover:bg-blue-100 transition-colors"
                        data-testid="esign-bos-btn"
                      >
                        <Pencil className="w-4 h-4 text-blue-600" />
                        <span className="text-sm font-semibold text-blue-700">Enviar para Firma Electrónica</span>
                      </button>
                    )
                  )}

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
                <p className="text-xs text-indigo-700 mb-3">Ingresa el Label/Seal Number o Serial Number de la mobile home para obtener el título automáticamente.</p>

                <div className="flex gap-2 mb-3">
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
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={tdhcaSearchValue}
                    onChange={(e) => setTdhcaSearchValue(e.target.value.toUpperCase())}
                    placeholder={tdhcaSearchType === 'label' ? 'Ej: TEX0012345' : 'Ej: C3208'}
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
                    {/* Show ALL fields — even empty ones — so user can see what was extracted */}
                    <div><span className="font-semibold text-gray-600">Certificado:</span> <span className={tdhcaResult.certificate_number ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.certificate_number || '—'}</span></div>
                    <div className="col-span-2"><span className="font-semibold text-gray-600">Fabricante:</span> <span className={tdhcaResult.manufacturer ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.manufacturer || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Dirección Fab.:</span> <span className={tdhcaResult.manufacturer_address ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.manufacturer_address || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Ciudad/Estado/ZIP:</span> <span className={tdhcaResult.manufacturer_city_state_zip ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.manufacturer_city_state_zip || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Modelo:</span> <span className={tdhcaResult.model ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.model || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Año/Fecha:</span> <span className={tdhcaResult.year ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.year || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Serial #:</span> <span className={tdhcaResult.serial_number ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.serial_number || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Label/Seal #:</span> <span className={tdhcaResult.label_seal ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.label_seal || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Sq Ft:</span> <span className={tdhcaResult.square_feet ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.square_feet || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Wind Zone:</span> <span className={tdhcaResult.wind_zone ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.wind_zone || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Tamaño:</span> <span className={(tdhcaResult.width && tdhcaResult.length) ? 'text-gray-900' : 'text-red-400 italic'}>{(tdhcaResult.width && tdhcaResult.length) ? `${tdhcaResult.width} × ${tdhcaResult.length}` : '—'}</span></div>
                    <div className="col-span-2"><span className="font-semibold text-gray-600">Dueño actual (Buyer):</span> <span className={tdhcaResult.buyer ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.buyer || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Dueño anterior (Seller):</span> <span className={tdhcaResult.seller ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.seller || '—'}</span></div>
                    <div><span className="font-semibold text-gray-600">Condado:</span> <span className={tdhcaResult.county ? 'text-gray-900' : 'text-red-400 italic'}>{tdhcaResult.county || '—'}</span></div>
                    {tdhcaResult.transfer_date && (
                      <div><span className="font-semibold text-gray-600">Fecha Transferencia:</span> <span className="text-gray-900">{tdhcaResult.transfer_date}</span></div>
                    )}
                    {tdhcaResult.lien_info && (
                      <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="font-semibold text-red-600">Gravamen:</span>
                        <span className="text-red-700 font-semibold">{tdhcaResult.lien_info}</span>
                      </div>
                    )}
                    {tdhcaResult.tax_lien_status && (
                      <div className="col-span-2 bg-red-50 border border-red-200 rounded-lg p-2 flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <span className="font-semibold text-red-600">Tax Lien:</span>
                        <span className="text-red-700 font-semibold">{tdhcaResult.tax_lien_status}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">Los campos en rojo (—) no están disponibles en el registro TDHCA para este título.</p>

                  {/* Link to full TDHCA record */}
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

                  {/* Debug panel — collapsible */}
                  <button
                    onClick={() => setShowTdhcaDebug(!showTdhcaDebug)}
                    className="mt-2 text-[10px] text-gray-400 hover:text-gray-600 underline"
                  >
                    {showTdhcaDebug ? 'Ocultar debug' : 'Mostrar debug (raw_fields)'}
                  </button>
                  {showTdhcaDebug && (
                    <div className="mt-2 p-2 bg-gray-100 rounded text-[9px] font-mono max-h-60 overflow-auto">
                      <p className="font-bold mb-1">raw_fields ({Object.keys(tdhcaResult.raw_fields || {}).length} campos):</p>
                      {Object.entries(tdhcaResult.raw_fields || {}).sort().map(([k, v]) => (
                        <div key={k} className="truncate">
                          <span className="text-blue-600">{k}</span>: <span className="text-gray-700">{String(v).substring(0, 80)}</span>
                        </div>
                      ))}
                      {tdhcaDebugLog.length > 0 && (
                        <>
                          <p className="font-bold mt-2 mb-1">debug_log:</p>
                          {tdhcaDebugLog.map((line, i) => (
                            <div key={i} className="truncate text-gray-500">{line}</div>
                          ))}
                        </>
                      )}
                      {tdhcaCleanPageText && (
                        <>
                          <p className="font-bold mt-2 mb-1">clean_page_text (after strip, first 1000):</p>
                          <pre className="whitespace-pre-wrap text-green-700">{tdhcaCleanPageText.substring(0, 1000)}</pre>
                        </>
                      )}
                      {tdhcaPageText && (
                        <>
                          <p className="font-bold mt-2 mb-1">raw page_text (first 500):</p>
                          <pre className="whitespace-pre-wrap text-gray-500">{tdhcaPageText.substring(0, 500)}</pre>
                        </>
                      )}

                      {/* Raw HTML download/copy for debugging */}
                      {tdhcaRawHtml && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => {
                              const blob = new Blob([tdhcaRawHtml], { type: 'text/html' })
                              const url = URL.createObjectURL(blob)
                              const a = document.createElement('a')
                              a.href = url
                              a.download = `tdhca_real_page_${Date.now()}.html`
                              a.click()
                              URL.revokeObjectURL(url)
                            }}
                            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700"
                          >
                            Descargar HTML Real ({(tdhcaRawHtml.length / 1024).toFixed(1)} KB)
                          </button>
                          <button
                            onClick={() => {
                              navigator.clipboard.writeText(tdhcaRawHtml)
                              alert('HTML copiado al portapapeles')
                            }}
                            className="px-3 py-1.5 bg-gray-600 text-white text-xs font-medium rounded hover:bg-gray-700"
                          >
                            Copiar HTML
                          </button>
                          <span className="text-xs text-gray-400 self-center">
                            Pega este HTML en el chat para que lo use como test fixture real
                          </span>
                        </div>
                      )}
                    </div>
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

            {/* ═══ Signed Documents Status ═══ */}
            <SignedDocsViewer refreshKey={signRefreshKey} />

            {/* Title Application (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                <FileText className="w-4 h-4 inline mr-2" />
                Aplicación Cambio de Título (Statement of Ownership)
                <span className="ml-2 text-xs font-normal text-gray-400">(opcional)</span>
              </label>
              
              {showTitleApp ? (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <TitleApplicationTemplate
                    transactionType="purchase"
                    initialData={(() => {
                      const mfr = splitManufacturerParts()
                      // 3-LAYER FALLBACK: structured → raw_fields → page text regex
                      const serial = cleanSuspiciousValue(
                        getField('serial_number', ['Serial #', 'Serial', 'Serial Number', 'Complete Serial Number'],
                          [/Serial\s*#?\s*[:=]?\s*([A-Z0-9]{4,})/i, /Section\s*1[\s\S]{0,30}?([A-Z0-9]{5,}TX[A-Z0-9]*)/i]))
                      const label = cleanSuspiciousValue(
                        getField('label_seal', ['Label/Seal#', 'Label/Seal', 'Label/Seal Number', 'Label/Seal #', 'HUD Label'],
                          [/Label\/Seal\s*#?\s*[:=]?\s*([A-Z]{2,4}\d{5,})/i, /(?:TEX|NTA|RAD|TRA)\d{5,}/i]))
                      const model = getField('model', ['Model', 'Make'],
                        [/Model\s*[:=]?\s*([A-Z][A-Z0-9\s\-]+)/i])
                      const dateManf = getField('date_of_manufacture', ['Date Manf', 'Date of Manufacture', 'Date Manufactured'],
                        [/Date\s*(?:Manf|of\s*Manufacture|Manufactured|Mfg)\s*[:=]?\s*(\d{1,2}\/\d{4})/i])
                        || getField('year', ['Year'], [/\bYear\s*[:=]?\s*(\d{4})\b/i])
                      const sqft = getField('square_feet', ['Square Ftg', 'Square Feet', 'Sq Ftg', 'Total Square Feet'],
                        [/Square\s*(?:Ftg|Feet|Footage)\s*[:=]?\s*(\d{3,})/i])
                      const rawWind = getField('wind_zone', ['Wind Zone'],
                        [/Wind\s*Zone\s*[:=]?\s*([IVX123]{1,3})\b/i])
                      const windZone = isValidWindZone(rawWind) ? rawWind : ''
                      const dims = deriveDimensions()
                      const buyer = getField('buyer', ['Buyer/Transferee', 'Buyer'],
                        [/Buyer\/Transferee\s*[:=]?\s*([A-Z][A-Z\s\.,&]+)/i, /Buyer\s*[:=]?\s*([A-Z][A-Z\s\.,&]+)/i])
                      const seller = getField('seller', ['Seller/Transferor', 'Seller'],
                        [/Seller\/Transferor\s*[:=]?\s*([A-Z][A-Z\s\.,&]+)/i, /Seller\s*[:=]?\s*([A-Z][A-Z\s\.,&]+)/i])
                      const year = dateManf || getField('year', ['Year'], [/\bYear\s*[:=]?\s*(\d{4})\b/i]) || form.year || ''

                      console.log('[NewProperty] 🔍 DEFINITIVE field extraction:', {
                        mfr_name: mfr.name, mfr_addr: mfr.address, mfr_csz: mfr.cityStateZip,
                        model, dateManf, year, sqft, windZone, serial, label,
                        buyer, seller, dims_w: dims.width, dims_l: dims.length,
                        page_text_length: tdhcaPageText?.length || 0,
                      })

                      return {
                      applicant_name: 'MANINOS HOMES LLC',
                      is_new: false, is_used: true,
                      manufacturer: mfr.name,
                      manufacturer_address: mfr.address,
                      manufacturer_city_state_zip: mfr.cityStateZip,
                      make: model,
                      year,
                      date_of_manufacture: dateManf,
                      total_sqft: sqft || computedSqFt?.toString() || '',
                      section1_label: label,
                      section1_serial: serial,
                      section1_width: dims.width,
                      section1_length: dims.length,
                      wind_zone: windZone,
                      serial_number: serial,
                      label_seal_number: label,
                      sqft: sqft || computedSqFt?.toString() || '',
                      bedrooms: form.bedrooms || '',
                      bathrooms: form.bathrooms || '',
                      has_hud_label: true, no_hud_label: false,
                      location_address: '', location_city: '', location_state: '', location_zip: '', location_county: '',
                      home_moved: false, home_moved_no: true, home_installed: false, home_installed_no: true,
                      seller_name: buyer,
                      buyer_name: 'MANINOS HOMES LLC',
                      sale_price: form.purchase_price ? `$${parseFloat(form.purchase_price).toLocaleString()}` : '',
                      sale_date: new Date().toISOString().split('T')[0],
                      sale_transfer_date: new Date().toISOString().split('T')[0],
                      page2_hud_label: label,
                      page2_serial: serial,
                      election_inventory: true,
                      } })()}
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

                  {/* Send title application for e-signature */}
                  {titleAppData && (
                    esignEmailFor === 'title_app' ? (
                      <div className="w-full rounded-xl border-2 border-indigo-300 bg-indigo-50 p-3" data-testid="esign-email-form-ta">
                        <p className="text-xs font-semibold text-indigo-800 mb-2">Email del vendedor para firmar Cambio de Título:</p>
                        <div className="flex gap-2">
                          <input
                            type="email"
                            value={esignEmail}
                            onChange={(e) => setEsignEmail(e.target.value)}
                            placeholder="vendedor@email.com"
                            className="flex-1 border border-indigo-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                            data-testid="esign-email-input-ta"
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
                            data-testid="esign-send-btn-ta"
                          >
                            {esignSending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Enviar'}
                          </button>
                          <button
                            onClick={() => { setEsignEmailFor(null); setEsignEmail('') }}
                            className="px-2 py-2 text-gray-500 hover:text-gray-700"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => { setEsignEmailFor('title_app'); setEsignEmail('') }}
                        className="w-full flex items-center justify-center gap-2 p-3 rounded-xl border-2 border-indigo-300 bg-indigo-50 hover:bg-indigo-100 transition-colors"
                        data-testid="esign-ta-btn"
                      >
                        <Pencil className="w-4 h-4 text-indigo-600" />
                        <span className="text-sm font-semibold text-indigo-700">Enviar Cambio Título para Firma</span>
                      </button>
                    )
                  )}

                  {/* OR upload */}
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
                 'Completa los documentos obligatorios para continuar'}
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

        {/* ========== STEP 3: PAYMENT — Bank Transfer Only ========== */}
        {purchaseStep === 'payment' && (
          <div className="p-6">
            <BankTransferStep
              payment={payment}
              onPaymentChange={setPayment}
              payee={payee}
            />
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
                    Bill of Sale ✓ | Título ✓ | Cambio Título {isTitleAppComplete ? '✓' : '(opcional)'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-2">
                  <span className="text-green-700">Pago</span>
                  <span className="font-medium text-green-900">
                    Transferencia Bancaria{payment.payee_name ? ` a ${payment.payee_name}` : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* ═══ Seller Signature Status — blocks confirmation if pending ═══ */}
            {(sellerSignatures.bos || sellerSignatures.title_app) && (
              <div className={`rounded-lg p-5 mb-6 border-2 ${
                (sellerSignatures.bos?.signed !== false && sellerSignatures.title_app?.signed !== false)
                  ? 'border-emerald-300 bg-emerald-50'
                  : 'border-amber-300 bg-amber-50'
              }`}>
                <h4 className={`font-semibold mb-3 flex items-center gap-2 ${
                  (sellerSignatures.bos?.signed !== false && sellerSignatures.title_app?.signed !== false)
                    ? 'text-emerald-800' : 'text-amber-800'
                }`}>
                  <Pencil className="w-5 h-5" />
                  Firmas del Vendedor
                </h4>
                <div className="space-y-3">
                  {sellerSignatures.bos && (
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex-shrink-0">
                        {sellerSignatures.bos.signed ? (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-navy-900">Bill of Sale</p>
                        <p className="text-xs text-gray-500">
                          {sellerSignatures.bos.signed
                            ? `Firmado por ${sellerSignatures.bos.signer_name} (${sellerSignatures.bos.signature_type === 'drawn' ? 'firma dibujada' : 'firma digital'})`
                            : `Esperando firma de ${sellerSignatures.bos.signer_name}...`}
                        </p>
                      </div>
                      {sellerSignatures.bos.signed && sellerSignatures.bos.signature_type === 'drawn' && sellerSignatures.bos.signature_value && (
                        <img src={sellerSignatures.bos.signature_value} alt="Firma" className="h-8 border border-emerald-200 rounded" />
                      )}
                      {sellerSignatures.bos.signed && billOfSaleData && (
                        <button
                          onClick={() => setPreviewDoc('bos')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex-shrink-0"
                          data-testid="view-signed-doc-bos"
                        >
                          <FileText className="w-3 h-3" />
                          Ver Documento
                        </button>
                      )}
                    </div>
                  )}
                  {sellerSignatures.title_app && (
                    <div className="flex items-center gap-3 bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex-shrink-0">
                        {sellerSignatures.title_app.signed ? (
                          <CheckCircle className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                        )}
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium text-navy-900">Cambio de Título</p>
                        <p className="text-xs text-gray-500">
                          {sellerSignatures.title_app.signed
                            ? `Firmado por ${sellerSignatures.title_app.signer_name} (${sellerSignatures.title_app.signature_type === 'drawn' ? 'firma dibujada' : 'firma digital'})`
                            : `Esperando firma de ${sellerSignatures.title_app.signer_name}...`}
                        </p>
                      </div>
                      {sellerSignatures.title_app.signed && sellerSignatures.title_app.signature_type === 'drawn' && sellerSignatures.title_app.signature_value && (
                        <img src={sellerSignatures.title_app.signature_value} alt="Firma" className="h-8 border border-emerald-200 rounded" />
                      )}
                      {sellerSignatures.title_app.signed && titleAppData && (
                        <button
                          onClick={() => setPreviewDoc('title_app')}
                          className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors flex-shrink-0"
                          data-testid="view-signed-doc-ta"
                        >
                          <FileText className="w-3 h-3" />
                          Ver Documento
                        </button>
                      )}
                    </div>
                  )}
                </div>
                {(sellerSignatures.bos?.signed === false || sellerSignatures.title_app?.signed === false) && (
                  <p className="text-xs text-amber-700 mt-3 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" />
                    Verificando firmas cada 10 segundos... La compra se habilitará cuando el vendedor firme.
                  </p>
                )}
              </div>
            )}

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
              disabled={!isPaymentComplete}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                isPaymentComplete
                  ? 'btn-gold'
                  : 'bg-gray-200 text-gray-500 cursor-not-allowed'
              }`}
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          
          {purchaseStep === 'confirm' && (() => {
            const hasPendingSig = (sellerSignatures.bos?.signed === false) || (sellerSignatures.title_app?.signed === false)
            return (
              <button
                onClick={confirmPurchase}
                disabled={processing || hasPendingSig}
                className={`flex items-center gap-2 px-6 py-2 rounded-lg font-medium transition-colors ${
                  hasPendingSig ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'btn-gold'
                }`}
              >
                {processing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Procesando...
                  </>
                ) : hasPendingSig ? (
                  <>
                    <Clock className="w-4 h-4" />
                    Esperando Firmas...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Confirmar Compra
                  </>
                )}
              </button>
            )
          })()}
        </div>
      </div>
      {/* ═══ Document Preview Overlay — renders the REAL template in readOnly mode ═══ */}
      {previewDoc && (
        <div className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center overflow-y-auto p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl my-8 relative">
            <div className="sticky top-0 z-10 bg-white border-b px-4 py-3 flex items-center justify-between rounded-t-xl">
              <h3 className="text-sm font-bold text-navy-900">
                {previewDoc === 'bos' ? 'Bill of Sale — Documento Firmado' : 'Cambio de Título — Documento Firmado'}
              </h3>
              <button
                onClick={() => setPreviewDoc(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-2">
              {previewDoc === 'bos' && billOfSaleData && (() => {
                const merged: any = { ...billOfSaleData }
                if (sellerSignatures.bos?.signed) {
                  merged.seller_signature_type = sellerSignatures.bos.signature_type
                  if (sellerSignatures.bos.signature_type === 'drawn') {
                    merged.seller_signature_image = sellerSignatures.bos.signature_value
                  } else {
                    merged.seller_name = sellerSignatures.bos.signature_value || merged.seller_name
                  }
                  merged.seller_date = new Date().toISOString().split('T')[0]
                }
                const dataHash = JSON.stringify(merged).length
                return (
                  <BillOfSaleTemplate
                    key={`bos-preview-${dataHash}`}
                    transactionType="purchase"
                    initialData={merged}
                    readOnly
                    onClose={() => setPreviewDoc(null)}
                  />
                )
              })()}
              {previewDoc === 'title_app' && titleAppData && (() => {
                const merged: any = { ...titleAppData }
                if (sellerSignatures.title_app?.signed) {
                  merged.seller_signature_type = sellerSignatures.title_app.signature_type
                  if (sellerSignatures.title_app.signature_type === 'drawn') {
                    merged.seller_signature_image = sellerSignatures.title_app.signature_value
                  } else {
                    merged.seller_signature_value = sellerSignatures.title_app.signature_value || merged.seller_name
                  }
                  merged.seller_signature_date = new Date().toISOString().split('T')[0]
                }
                const dataHash = JSON.stringify(merged).length
                return (
                  <TitleApplicationTemplate
                    key={`ta-preview-${dataHash}`}
                    transactionType="purchase"
                    initialData={merged}
                    readOnly
                    onClose={() => setPreviewDoc(null)}
                  />
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════
// Signed Documents Viewer — shows e-sign envelope status in review
// ═══════════════════════════════════════════════════════════════

function SignedDocsViewer({ refreshKey }: { refreshKey?: number }) {
  const [envelopes, setEnvelopes] = useState<any[]>([])
  const [loading, setLoading] = useState(false)

  const fetchEnvelopes = useCallback(() => {
    setLoading(true)
    // For new property flow, fetch all recent envelopes
    fetch('/api/esign/envelopes')
      .then(r => r.json())
      .then(d => setEnvelopes(d.envelopes || []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchEnvelopes() }, [fetchEnvelopes, refreshKey])

  // Auto-refresh every 15 seconds to pick up new signatures
  useEffect(() => {
    const interval = setInterval(fetchEnvelopes, 15000)
    return () => clearInterval(interval)
  }, [fetchEnvelopes])

  if (envelopes.length === 0 && !loading) return null

  const docTypeLabels: Record<string, string> = {
    bill_of_sale: "Bill of Sale",
    title_application: "Cambio de Título",
    rto_lease: "Contrato RTO",
  }

  return (
    <div className="rounded-xl border-2 border-emerald-200 bg-emerald-50 p-4">
      <h4 className="text-sm font-bold text-emerald-800 mb-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4" />
        Documentos Firmados
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
              </p>
              <div className="space-y-1">
                {(env.document_signatures || []).map((sig: any) => {
                  const signed = !!sig.signed_at
                  const sigData = sig.signature_data || {}
                  const isDrawn = sigData.type === "drawn"
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
                          <span className="text-emerald-600">— firmado {new Date(sig.signed_at).toLocaleDateString("es-MX", { day: "numeric", month: "short" })}</span>
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
