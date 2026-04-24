'use client'

import { useEffect, useState } from 'react'
import { X, Upload, Loader2, CheckCircle2, FileText, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Property {
  id: string
  address: string
  city?: string
  state?: string
  property_code?: string
  status: string
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated?: () => void
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
  status: 'sold',
  notes: '',
}

export default function ManualTitleUploadModal({ open, onClose, onCreated }: Props) {
  const toast = useToast()
  const [propertyMode, setPropertyMode] = useState<PropertyMode>('existing')
  const [properties, setProperties] = useState<Property[]>([])
  const [propertySearch, setPropertySearch] = useState('')
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [newProp, setNewProp] = useState({ ...EMPTY_NEW_PROP })
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
    // Reset state when opened
    setPropertyMode('existing')
    setSelectedProperty(null)
    setPropertySearch('')
    setNewProp({ ...EMPTY_NEW_PROP })
    setPdfFile(null)
    setCreatedTransferId(null)
    setForm({
      tdhca_serial: '', tdhca_label: '', tdhca_owner_name: '',
      manufacturer: '', model: '', year: '', county: '',
      bedrooms: '', baths: '', sqft: '',
      seller_name: '', buyer_name: 'MANINOS HOMES',
      date_of_title: '', notes: '',
    })
    // Load properties (only needed for existing mode, but load anyway so
    // switching modes is instant)
    fetch('/api/properties?limit=100')
      .then(r => r.json())
      .then(data => {
        const list = Array.isArray(data) ? data : (data.properties || [])
        setProperties(list)
      })
      .catch(() => toast.error('Error cargando propiedades'))
  }, [open, toast])

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

  const isFormReady = (() => {
    if (!form.tdhca_serial && !form.tdhca_label) return false
    if (propertyMode === 'existing') return !!selectedProperty
    // new property requires address
    return !!newProp.address.trim()
  })()

  const handleSubmit = async () => {
    if (!form.tdhca_serial && !form.tdhca_label) {
      toast.error('Ingresa al menos el Serial o el Label/Seal del título')
      return
    }

    let payload: any = { ...form }
    if (propertyMode === 'existing') {
      if (!selectedProperty) {
        toast.error('Selecciona una propiedad')
        return
      }
      payload.property_id = selectedProperty.id
    } else {
      if (!newProp.address.trim()) {
        toast.error('La dirección de la propiedad es obligatoria')
        return
      }
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
      if (!res.ok) {
        toast.error(data?.detail || 'Error al crear título manual')
        setSubmitting(false)
        return
      }
      const transferId = data?.transfer?.id as string | undefined
      if (!transferId) {
        toast.error('No se recibió ID del título creado')
        setSubmitting(false)
        return
      }
      setCreatedTransferId(transferId)

      // Upload PDF if one was selected
      if (pdfFile) {
        setUploadingPdf(true)
        const fd = new FormData()
        fd.append('file', pdfFile)
        const upRes = await fetch(`/api/transfers/manual-upload/${transferId}/pdf`, {
          method: 'POST',
          body: fd,
        })
        setUploadingPdf(false)
        if (!upRes.ok) {
          toast.warning('Título creado pero falló el upload del PDF')
        } else {
          toast.success('Título y PDF guardados')
        }
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-2 sm:p-4 pt-4 sm:pt-16"
         onClick={onClose}>
      <div className="bg-white sm:rounded-2xl shadow-xl w-full max-w-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-sand">
          <div>
            <h2 className="font-serif font-semibold text-lg text-navy-900">
              Subir Título Manualmente
            </h2>
            <p className="text-xs text-slate mt-0.5">
              Para casas antiguas sin captura TDHCA automática
            </p>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-sand/50">
            <X className="w-5 h-5 text-slate" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          {/* STEP 1: pick OR create property */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
              1. Propiedad
            </label>

            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2 mb-3">
              <button
                type="button"
                onClick={() => setPropertyMode('existing')}
                className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  propertyMode === 'existing'
                    ? 'border-gold-500 bg-gold-50 text-gold-800'
                    : 'border-stone bg-white text-slate hover:border-navy-300'
                }`}
              >
                Propiedad existente
              </button>
              <button
                type="button"
                onClick={() => setPropertyMode('new')}
                className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                  propertyMode === 'new'
                    ? 'border-gold-500 bg-gold-50 text-gold-800'
                    : 'border-stone bg-white text-slate hover:border-navy-300'
                }`}
              >
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
                      <input
                        type="text"
                        placeholder="Buscar por dirección, ciudad o código..."
                        value={propertySearch}
                        onChange={e => setPropertySearch(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-stone focus:outline-none focus:border-gold-500"
                      />
                    </div>
                    {filtered.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto border border-sand rounded-lg divide-y divide-sand">
                        {filtered.map(p => (
                          <button
                            key={p.id}
                            onClick={() => setSelectedProperty(p)}
                            className="w-full text-left px-3 py-2 hover:bg-navy-50 transition-colors"
                          >
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
              /* NEW PROPERTY form */
              <div className="bg-gold-50/40 border border-gold-200 rounded-lg p-3 space-y-3">
                <p className="text-xs text-slate">
                  La propiedad se creará en el inventario con estos datos básicos. Podés editar campos avanzados después desde su página de detalle.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="ID antiguo (property_code)"
                         value={newProp.property_code}
                         onChange={v => setNewProp({ ...newProp, property_code: v })}
                         placeholder="Ej: B70, H12, etc." />
                  <Field label="Dirección *"
                         value={newProp.address}
                         onChange={v => setNewProp({ ...newProp, address: v })}
                         placeholder="15891 Old Houston Road" />
                  <Field label="Ciudad"
                         value={newProp.city}
                         onChange={v => setNewProp({ ...newProp, city: v })}
                         placeholder="Houston" />
                  <Field label="Estado"
                         value={newProp.state}
                         onChange={v => setNewProp({ ...newProp, state: v })}
                         placeholder="Texas" />
                  <Field label="ZIP"
                         value={newProp.zip_code}
                         onChange={v => setNewProp({ ...newProp, zip_code: v })}
                         placeholder="77000" />
                  <Field label="Año"
                         value={newProp.year}
                         onChange={v => setNewProp({ ...newProp, year: v })}
                         placeholder="2008" />
                  <Field label="Recámaras"
                         value={newProp.bedrooms}
                         onChange={v => setNewProp({ ...newProp, bedrooms: v })}
                         placeholder="3" />
                  <Field label="Baños"
                         value={newProp.bathrooms}
                         onChange={v => setNewProp({ ...newProp, bathrooms: v })}
                         placeholder="2" />
                  <Field label="Precio de compra ($)"
                         value={newProp.purchase_price}
                         onChange={v => setNewProp({ ...newProp, purchase_price: v })}
                         placeholder="25000" />
                  <div>
                    <label className="block text-xs font-medium text-slate mb-1">Estado</label>
                    <select
                      value={newProp.status}
                      onChange={e => setNewProp({ ...newProp, status: e.target.value })}
                      className="w-full px-3 py-2 rounded-lg border border-stone text-sm focus:outline-none focus:border-gold-500"
                    >
                      <option value="sold">Vendida</option>
                      <option value="inventory">Inventario</option>
                      <option value="published">Publicada</option>
                      <option value="reserved">Reservada</option>
                      <option value="renovating">Renovando</option>
                      <option value="pending_payment">Pendiente de pago</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate mb-1">Notas (origen)</label>
                  <textarea
                    value={newProp.notes}
                    onChange={e => setNewProp({ ...newProp, notes: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-stone text-sm"
                    rows={2}
                    placeholder="Casa antigua comprada antes de usar el sistema, ID histórico B70..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* STEP 2: Title info */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
              2. Datos del Título
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Serial Number *" value={form.tdhca_serial}
                     onChange={v => setForm({ ...form, tdhca_serial: v })}
                     placeholder="Ej: CHA-123456" />
              <Field label="Label/Seal Number *" value={form.tdhca_label}
                     onChange={v => setForm({ ...form, tdhca_label: v })}
                     placeholder="Ej: TEX0012345" />
              <Field label="Fabricante" value={form.manufacturer}
                     onChange={v => setForm({ ...form, manufacturer: v })}
                     placeholder="Champion, Clayton, etc." />
              <Field label="Modelo" value={form.model}
                     onChange={v => setForm({ ...form, model: v })}
                     placeholder="Nombre del modelo" />
              <Field label="Año" value={form.year}
                     onChange={v => setForm({ ...form, year: v })}
                     placeholder="2010" />
              <Field label="Condado (County)" value={form.county}
                     onChange={v => setForm({ ...form, county: v })}
                     placeholder="Harris" />
              <Field label="Recámaras" value={form.bedrooms}
                     onChange={v => setForm({ ...form, bedrooms: v })} placeholder="3" />
              <Field label="Baños" value={form.baths}
                     onChange={v => setForm({ ...form, baths: v })} placeholder="2" />
              <Field label="Tamaño (sqft)" value={form.sqft}
                     onChange={v => setForm({ ...form, sqft: v })} placeholder="1200" />
              <Field label="Fecha del título"
                     type="date"
                     value={form.date_of_title}
                     onChange={v => setForm({ ...form, date_of_title: v })} />
              <Field label="Vendedor (previo dueño)"
                     value={form.seller_name}
                     onChange={v => setForm({ ...form, seller_name: v })}
                     placeholder="Nombre del dueño anterior" />
              <Field label="Comprador"
                     value={form.buyer_name}
                     onChange={v => setForm({ ...form, buyer_name: v })} />
              <div className="sm:col-span-2">
                <Field label="Dueño actual en TDHCA (opcional)"
                       value={form.tdhca_owner_name}
                       onChange={v => setForm({ ...form, tdhca_owner_name: v })}
                       placeholder="Si ya verificaste el nombre en TDHCA" />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate mb-1">Notas</label>
                <textarea
                  value={form.notes}
                  onChange={e => setForm({ ...form, notes: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-stone text-sm"
                  rows={2}
                  placeholder="Notas sobre el origen de este título..."
                />
              </div>
            </div>
          </div>

          {/* STEP 3: PDF upload */}
          <div>
            <label className="block text-xs font-semibold text-slate mb-2 uppercase tracking-wide">
              3. PDF del título (opcional)
            </label>
            <div className="border-2 border-dashed border-sand rounded-lg p-4 text-center">
              {pdfFile ? (
                <div className="flex items-center justify-center gap-2">
                  <FileText className="w-5 h-5 text-gold-600" />
                  <span className="text-sm font-medium text-charcoal">{pdfFile.name}</span>
                  <button onClick={() => setPdfFile(null)}
                          className="text-xs text-red-500 hover:text-red-700 ml-2">
                    Quitar
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center gap-1">
                  <Upload className="w-6 h-6 text-ash" />
                  <span className="text-sm font-medium text-charcoal">
                    Sube foto o escaneo del título
                  </span>
                  <span className="text-xs text-ash">PDF, JPG o PNG (máx 10MB)</span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png,.webp"
                    className="hidden"
                    onChange={e => setPdfFile(e.target.files?.[0] || null)}
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-4 sm:px-6 py-4 border-t border-sand bg-ivory">
          <button onClick={onClose}
                  disabled={submitting}
                  className="btn-secondary">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || !isFormReady}
            className="btn-gold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting || uploadingPdf ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                {uploadingPdf ? 'Subiendo PDF...' : 'Guardando...'}
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
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-stone text-sm focus:outline-none focus:border-gold-500"
      />
    </div>
  )
}
