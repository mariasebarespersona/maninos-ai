'use client'

import { useEffect, useState } from 'react'
import { X, Upload, Loader2, CheckCircle2, FileText, Search, Pencil } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Property {
  id: string
  address: string
  city?: string
  state?: string
  property_code?: string
  status: string
}

/** Pre-populated data when opening the modal in edit mode */
export interface EditTransferData {
  id: string
  property_id: string
  property_address: string
  property_code?: string | null
  transfer_type: 'purchase' | 'sale'
  tdhca_serial?: string | null
  tdhca_label?: string | null
  tdhca_owner_name?: string | null
  from_name?: string | null
  to_name?: string | null
  manual_upload_notes?: string | null
  // From document_data.title_app_purchase
  manufacturer?: string
  model?: string
  year?: string
  county?: string
  bedrooms?: string
  baths?: string
  sqft?: string
  seller_name?: string
  buyer_name?: string
  date_of_title?: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: () => void
  /** When provided, the modal opens in edit mode for an existing manual transfer */
  editTransfer?: EditTransferData | null
}

type PropertyMode = 'existing' | 'new'

const EMPTY_NEW_PROP = {
  property_code: '',
  address: '',
  city: '',
  state: 'Texas',
  zip_code: '',
  year: '',
  bedrooms: '',
  bathrooms: '',
  purchase_price: '',
  sale_price: '',
  status: 'sold',
  notes: '',
}

export default function ManualTitleUploadModal({ open, onClose, onCreated, editTransfer }: Props) {
  const toast = useToast()
  const isEditMode = Boolean(editTransfer)

  const [propertyMode, setPropertyMode] = useState<PropertyMode>('existing')
  const [properties, setProperties] = useState<Property[]>([])
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [newProp, setNewProp] = useState({ ...EMPTY_NEW_PROP })
  const [soldToName, setSoldToName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [uploadingPdf, setUploadingPdf] = useState(false)
  const [form, setForm] = useState({
    tdhca_serial: '',
    tdhca_label: '',
    tdhca_owner_name: '',
    manufacturer: '',
    model: '',
    year: '',
    county: '',
    bedrooms: '',
    baths: '',
    sqft: '',
    seller_name: '',
    buyer_name: 'MANINOS HOMES',
    date_of_title: '',
    notes: '',
  })
  const [pdfFile, setPdfFile] = useState<File | null>(null)
  const [createdTransferId, setCreatedTransferId] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return

    if (isEditMode && editTransfer) {
      // Pre-populate from existing transfer data
      const tap = editTransfer // title_app_purchase fields merged in
      setForm({
        tdhca_serial:     tap.tdhca_serial     || '',
        tdhca_label:      tap.tdhca_label      || '',
        tdhca_owner_name: tap.tdhca_owner_name || '',
        manufacturer:     tap.manufacturer     || '',
        model:            tap.model            || '',
        year:             tap.year             || '',
        county:           tap.county           || '',
        bedrooms:         tap.bedrooms         || '',
        baths:            tap.baths            || '',
        sqft:             tap.sqft             || '',
        seller_name:      tap.seller_name      || tap.from_name || '',
        buyer_name:       tap.buyer_name       || tap.to_name   || 'MANINOS HOMES',
        date_of_title:    tap.date_of_title    || '',
        notes:            tap.manual_upload_notes || '',
      })
      if (editTransfer.transfer_type === 'sale') {
        setSoldToName(editTransfer.to_name || '')
      }
      setCreatedTransferId(null)
      setPdfFile(null)
      return
    }

    // Create mode: reset everything
    setPropertyMode('existing')
    setSelectedProperty(null)
    setPropertySearch('')
    setNewProp({ ...EMPTY_NEW_PROP })
    setSoldToName('')
    setPdfFile(null)
    setCreatedTransferId(null)
    setForm({
      tdhca_serial: '', tdhca_label: '', tdhca_owner_name: '',
      manufacturer: '', model: '', year: '', county: '',
      bedrooms: '', baths: '', sqft: '',
      seller_name: '', buyer_name: 'MANINOS HOMES',
      date_of_title: '', notes: '',
    })
    fetch('/api/properties?limit=100')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.properties || [])
        setProperties(list)
      })
      .catch(() => toast.error('Error cargando propiedades'))
  }, [open, isEditMode, editTransfer, toast])

  if (!open) return null

  const filtered = properties
    .filter(p => {
      if (!propertySearch.trim()) return true
      const q = propertySearch.toLowerCase()
      return (
        p.address?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.property_code?.toLowerCase().includes(q)
      )
    })
    .slice(0, 20)

  const isSoldContext = (() => {
    if (isEditMode) return editTransfer?.transfer_type === 'sale'
    if (propertyMode === 'existing') return selectedProperty?.status === 'sold'
    return newProp.status === 'sold'
  })()

  const isFormReady = (() => {
    if (!form.tdhca_serial && !form.tdhca_label) return false
    if (!isEditMode) {
      if (propertyMode === 'existing' && !selectedProperty) return false
      if (propertyMode === 'new' && !newProp.address.trim()) return false
      if (isSoldContext && !soldToName.trim()) return false
    } else {
      if (isSoldContext && !soldToName.trim()) return false
    }
    return true
  })()

  // ── Submit (create) ────────────────────────────────────────────────────
  const handleCreate = async () => {
    if (!form.tdhca_serial && !form.tdhca_label) {
      toast.error('Ingresa al menos el Serial o el Label/Seal del título')
      return
    }
    if (isSoldContext && !soldToName.trim()) {
      toast.error('Ingresa el nombre del comprador (Vendida a)')
      return
    }

    let payload: any = { ...form }
    if (isSoldContext) payload.sold_to_name = soldToName.trim()
    if (propertyMode === 'existing') {
      if (!selectedProperty) { toast.error('Selecciona una propiedad'); return }
      payload.property_id = selectedProperty.id
    } else {
      if (!newProp.address.trim()) { toast.error('La dirección de la propiedad es obligatoria'); return }
      payload.new_property = {
        property_code: newProp.property_code.trim() || undefined,
        address: newProp.address.trim(),
        city: newProp.city.trim() || undefined,
        state: newProp.state || 'Texas',
        zip_code: newProp.zip_code.trim() || undefined,
        year: newProp.year ? parseInt(newProp.year) : undefined,
        bedrooms: newProp.bedrooms ? parseInt(newProp.bedrooms) : undefined,
        bathrooms: newProp.bathrooms ? parseFloat(newProp.bathrooms) : undefined,
        purchase_price: newProp.purchase_price ? parseFloat(newProp.purchase_price) : undefined,
        sale_price: (newProp.status === 'sold' && newProp.sale_price)
          ? parseFloat(newProp.sale_price) : undefined,
        status: newProp.status || 'sold',
        notes: newProp.notes.trim() || undefined,
      }
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/transfers/manual-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.detail || 'Error al crear título manual'); setSubmitting(false); return }
      const transferId = data?.transfer?.id as string | undefined
      if (!transferId) { toast.error('No se recibió ID del título creado'); setSubmitting(false); return }
      setCreatedTransferId(transferId)

      if (pdfFile) {
        setUploadingPdf(true)
        const fd = new FormData()
        fd.append('file', pdfFile)
        const upRes = await fetch(`/api/transfers/manual-upload/${transferId}/pdf`, { method: 'POST', body: fd })
        setUploadingPdf(false)
        if (!upRes.ok) toast.warning('Título creado pero falló el upload del PDF')
        else toast.success('Título y PDF guardados')
      } else {
        toast.success('Título creado')
      }
      onCreated?.()
      onClose()
    } catch (e: any) {
      toast.error(`Error: ${e?.message || e}`)
    } finally {
      setSubmitting(false)
      setUploadingPdf(false)
    }
  }

  // ── Submit (edit) ──────────────────────────────────────────────────────
  const handleEdit = async () => {
    if (!form.tdhca_serial && !form.tdhca_label) {
      toast.error('Ingresa al menos el Serial o el Label/Seal del título')
      return
    }
    if (isSoldContext && !soldToName.trim()) {
      toast.error('Ingresa el nombre del comprador')
      return
    }
    setSubmitting(true)
    try {
      const payload: any = { ...form }
      if (isSoldContext) payload.sold_to_name = soldToName.trim()
      const res = await fetch(`/api/transfers/manual-upload/${editTransfer!.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data?.detail || 'Error al actualizar título'); setSubmitting(false); return }
      toast.success('Título actualizado')
      onCreated?.()
      onClose()
    } catch (e: any) {
      toast.error(`Error: ${e?.message || e}`)
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmit = isEditMode ? handleEdit : handleCreate

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4 pt-4 sm:pt-16"
         onClick={onClose}>
      <div className="bg-white sm:rounded-2xl shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-sand">
          <div>
            <h2 className="font-serif font-semibold text-lg text-navy-900 flex items-center gap-2">
              {isEditMode && <Pencil className="w-4 h-4 text-gold-600" />}
              {isEditMode ? 'Editar Título Manual' : 'Subir Título Manualmente'}
            </h2>
            <p className="text-xs text-slate mt-0.5">
              {isEditMode
                ? 'Corrige los datos del título registrado manualmente'
                : 'Para casas antiguas sin captura TDHCA automática'}
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50">
            <X className="w-5 h-5 text-slate" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* STEP 1: property (read-only in edit mode, picker in create mode) */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
              1. Propiedad
            </label>

            {isEditMode ? (
              /* Edit mode: show property as read-only badge */
              <div className="flex items-center gap-2 bg-navy-50 border border-navy-200 rounded-lg px-3 py-2">
                {editTransfer!.property_code && (
                  <span className="text-xs px-1.5 py-0.5 rounded bg-gold-100 text-gold-700 font-bold">
                    {editTransfer!.property_code}
                  </span>
                )}
                <span className="text-sm font-medium text-navy-900">{editTransfer!.property_address}</span>
                <span className="ml-auto text-[11px] text-slate italic">No editable</span>
              </div>
            ) : (
              <>
                {/* Mode toggle */}
                <div className="grid grid-cols-2 gap-2 mb-3">
                  <button type="button" onClick={() => setPropertyMode('existing')}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      propertyMode === 'existing'
                        ? 'border-gold-500 bg-gold-50 text-gold-800'
                        : 'border-stone bg-white text-slate hover:border-navy-300'
                    }`}>
                    Propiedad existente
                  </button>
                  <button type="button" onClick={() => setPropertyMode('new')}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      propertyMode === 'new'
                        ? 'border-gold-500 bg-gold-50 text-gold-800'
                        : 'border-stone bg-white text-slate hover:border-navy-300'
                    }`}>
                    Casa antigua (nueva)
                  </button>
                </div>

                {propertyMode === 'existing' ? (
                  <>
                    {selectedProperty ? (
                      <div className="flex items-center justify-between bg-navy-50 border border-navy-200 rounded-lg px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-navy-900 truncate">
                            {selectedProperty.property_code && (
                              <span className="mr-2 text-xs px-1.5 py-0.5 rounded bg-gold-100 text-gold-700 font-bold">
                                {selectedProperty.property_code}
                              </span>
                            )}
                            {selectedProperty.address}
                          </p>
                          <p className="text-xs text-slate">{selectedProperty.city}, {selectedProperty.state}</p>
                        </div>
                        <button onClick={() => setSelectedProperty(null)}
                                className="text-xs text-red-500 hover:text-red-700 ml-3 flex-shrink-0">
                          Cambiar
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ash" />
                          <input type="text" placeholder="Buscar por dirección, ciudad o código..."
                            value={propertySearch} onChange={e => setPropertySearch(e.target.value)}
                            className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone focus:outline-none focus:border-gold-500" />
                        </div>
                        {filtered.length > 0 && (
                          <div className="mt-2 max-h-48 overflow-y-auto border border-sand rounded-lg divide-y divide-sand">
                            {filtered.map(p => (
                              <button key={p.id} onClick={() => setSelectedProperty(p)}
                                className="w-full text-left px-3 py-2 hover:bg-navy-50 transition-colors">
                                <p className="text-sm font-medium text-navy-900 truncate">
                                  {p.property_code && (
                                    <span className="mr-2 text-xs px-1 py-0.5 rounded bg-gold-100 text-gold-700 font-bold">
                                      {p.property_code}
                                    </span>
                                  )}
                                  {p.address}
                                </p>
                                <p className="text-xs text-slate">{p.city} · {p.status}</p>
                              </button>
                            ))}
                          </div>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <div className="bg-gold-50/40 border border-gold-200 rounded-lg p-3 space-y-3">
                    <p className="text-xs text-slate">
                      La propiedad se creará en el inventario con estos datos básicos.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Field label="ID antiguo (property_code)" value={newProp.property_code}
                             onChange={v => setNewProp({ ...newProp, property_code: v })} placeholder="Ej: B70, H12, etc." />
                      <Field label="Dirección *" value={newProp.address}
                             onChange={v => setNewProp({ ...newProp, address: v })} placeholder="15891 Old Houston Road" />
                      <Field label="Ciudad" value={newProp.city}
                             onChange={v => setNewProp({ ...newProp, city: v })} placeholder="Houston" />
                      <Field label="Estado" value={newProp.state}
                             onChange={v => setNewProp({ ...newProp, state: v })} placeholder="Texas" />
                      <Field label="ZIP" value={newProp.zip_code}
                             onChange={v => setNewProp({ ...newProp, zip_code: v })} placeholder="77000" />
                      <Field label="Año" value={newProp.year}
                             onChange={v => setNewProp({ ...newProp, year: v })} placeholder="2008" />
                      <Field label="Recámaras" value={newProp.bedrooms}
                             onChange={v => setNewProp({ ...newProp, bedrooms: v })} placeholder="3" />
                      <Field label="Baños" value={newProp.bathrooms}
                             onChange={v => setNewProp({ ...newProp, bathrooms: v })} placeholder="2" />
                      <Field label="Precio de compra ($)" value={newProp.purchase_price}
                             onChange={v => setNewProp({ ...newProp, purchase_price: v })} placeholder="25000" />
                      <div>
                        <label className="block text-xs font-medium text-slate mb-1">Estado</label>
                        <select value={newProp.status} onChange={e => setNewProp({ ...newProp, status: e.target.value })}
                          className="w-full px-3 py-2 rounded-lg border border-stone text-sm focus:outline-none focus:border-gold-500">
                          <option value="sold">Vendida</option>
                          <option value="inventory">Inventario</option>
                          <option value="published">Publicada</option>
                          <option value="reserved">Reservada</option>
                          <option value="renovating">Renovando</option>
                          <option value="pending_payment">Pendiente de pago</option>
                        </select>
                      </div>
                      {newProp.status === 'sold' && (
                        <div className="sm:col-span-2">
                          <Field label="Precio de venta ($)" value={newProp.sale_price}
                                 onChange={v => setNewProp({ ...newProp, sale_price: v })} placeholder="55000" />
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate mb-1">Notas (origen)</label>
                      <textarea value={newProp.notes} onChange={e => setNewProp({ ...newProp, notes: e.target.value })}
                        className="w-full px-3 py-2 rounded-lg border border-stone text-sm" rows={2}
                        placeholder="Casa antigua comprada antes de usar el sistema, ID histórico B70..." />
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* STEP 2: Title info */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
              2. Datos del Título
            </label>
            {!isEditMode && (
              <p className="text-xs text-slate mb-3 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                El estado del título se guardará como <strong>Completado</strong>.
                El scheduler diario no procesará este título (es un registro histórico).
              </p>
            )}
            {isSoldContext && (
              <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                <label className="block text-xs font-semibold text-purple-800 mb-1">
                  Vendida a (nombre del comprador) *
                </label>
                <input type="text" value={soldToName} onChange={e => setSoldToName(e.target.value)}
                  placeholder="Ej: Juan Pérez"
                  className="w-full px-3 py-2 rounded-lg border border-purple-300 text-sm focus:outline-none focus:border-purple-500" />
                <p className="text-[11px] text-purple-600 mt-1">
                  Como la casa está vendida, este título es una transferencia de tipo <strong>Venta</strong> (Maninos → comprador).
                </p>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Serial Number *" value={form.tdhca_serial}
                     onChange={v => setForm({ ...form, tdhca_serial: v })} placeholder="Ej: CHA-123456" />
              <Field label="Label/Seal Number *" value={form.tdhca_label}
                     onChange={v => setForm({ ...form, tdhca_label: v })} placeholder="Ej: TEX0012345" />
              <Field label="Fabricante" value={form.manufacturer}
                     onChange={v => setForm({ ...form, manufacturer: v })} placeholder="Champion, Clayton, etc." />
              <Field label="Modelo" value={form.model}
                     onChange={v => setForm({ ...form, model: v })} placeholder="Nombre del modelo" />
              <Field label="Año" value={form.year}
                     onChange={v => setForm({ ...form, year: v })} placeholder="2010" />
              <Field label="Condado (County)" value={form.county}
                     onChange={v => setForm({ ...form, county: v })} placeholder="Harris" />
              <Field label="Recámaras" value={form.bedrooms}
                     onChange={v => setForm({ ...form, bedrooms: v })} placeholder="3" />
              <Field label="Baños" value={form.baths}
                     onChange={v => setForm({ ...form, baths: v })} placeholder="2" />
              <Field label="Tamaño (sqft)" value={form.sqft}
                     onChange={v => setForm({ ...form, sqft: v })} placeholder="1200" />
              <Field label="Fecha del título" type="date" value={form.date_of_title}
                     onChange={v => setForm({ ...form, date_of_title: v })} />
              <Field label="Vendedor (previo dueño)" value={form.seller_name}
                     onChange={v => setForm({ ...form, seller_name: v })} placeholder="Nombre del dueño anterior" />
              <Field label="Comprador" value={form.buyer_name}
                     onChange={v => setForm({ ...form, buyer_name: v })} />
              <div className="sm:col-span-2">
                <Field label="Dueño actual en TDHCA (opcional)" value={form.tdhca_owner_name}
                       onChange={v => setForm({ ...form, tdhca_owner_name: v })}
                       placeholder="Si ya verificaste el nombre en TDHCA" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate mb-1">Notas</label>
                <textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone text-sm" rows={2}
                  placeholder="Notas sobre el origen de este título..." />
              </div>
            </div>
          </div>

          {/* STEP 3: PDF upload (create mode only) */}
          {!isEditMode && (
            <div>
              <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
                3. PDF del título (opcional)
              </label>
              <div className="border-2 border-dashed border-sand rounded-lg p-4 text-center">
                {pdfFile ? (
                  <div className="flex items-center justify-center gap-2">
                    <FileText className="w-5 h-5 text-gold-600" />
                    <span className="text-sm font-medium text-charcoal">{pdfFile.name}</span>
                    <button onClick={() => setPdfFile(null)} className="text-xs text-red-500 hover:text-red-700 ml-2">
                      Quitar
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer flex flex-col items-center gap-1">
                    <Upload className="w-6 h-6 text-ash" />
                    <span className="text-sm font-medium text-charcoal">Sube foto o escaneo del título</span>
                    <span className="text-xs text-ash">PDF, JPG o PNG (máx 10MB)</span>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
                      onChange={e => setPdfFile(e.target.files?.[0] || null)} />
                  </label>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-sand bg-ivory">
          <button onClick={onClose} disabled={submitting} className="btn-secondary">
            Cancelar
          </button>
          <button onClick={handleSubmit} disabled={submitting || !isFormReady}
            className="btn-gold disabled:opacity-50 disabled:cursor-not-allowed">
            {submitting || uploadingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadingPdf ? 'Subiendo PDF...' : 'Guardando...'}
              </>
            ) : isEditMode ? (
              <>
                <Pencil className="w-4 h-4" />
                Guardar Cambios
              </>
            ) : createdTransferId ? (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Guardado
              </>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Guardar Título
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({
  label, value, onChange, placeholder, type = 'text',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-stone text-sm focus:outline-none focus:border-gold-500" />
    </div>
  )
}
