'use client'

import { useState, useRef } from 'react'
import { 
  FileText, 
  CheckCircle2, 
  Circle, 
  Clock, 
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Loader2,
  Building2,
  ShoppingCart,
  UserCheck,
  Upload,
  Download,
  Trash2,
  Eye
} from 'lucide-react'
import { useToast } from './ui/Toast'

// Document data can be boolean (old format) or object (new format)
type DocValue = boolean | { checked: boolean; file_url: string | null; uploaded_at: string | null }

interface DocumentsTransaction {
  id: string
  property_id: string
  sale_id?: string
  transfer_type: 'purchase' | 'sale'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  from_name: string
  to_name: string
  documents_checklist: Record<string, DocValue>
  tracking_number?: string
  submitted_at?: string
  completed_at?: string
  notes?: string
  property_address?: string
}

interface Props {
  transfer: DocumentsTransaction
  onUpdate?: () => void
  showProperty?: boolean
}

const STATUS_CONFIG = {
  pending: { 
    label: 'Pendiente', 
    color: 'bg-amber-100 text-amber-700 border-amber-200',
    icon: Clock
  },
  in_progress: { 
    label: 'En Proceso', 
    color: 'bg-blue-100 text-blue-700 border-blue-200',
    icon: Clock
  },
  completed: { 
    label: 'Completado', 
    color: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    icon: CheckCircle2
  },
  cancelled: { 
    label: 'Cancelado', 
    color: 'bg-red-100 text-red-700 border-red-200',
    icon: AlertCircle
  },
}

const DOCUMENT_LABELS: Record<string, string> = {
  bill_of_sale: 'Bill of Sale (Factura)',
  titulo: 'Título (TDHCA)',
  title_application: 'Aplicación Cambio de Título',
  tax_receipt: 'Recibo de Impuestos',
  id_copies: 'Copias de ID',
  lien_release: 'Liberación de Gravamen',
  notarized_forms: 'Formularios Notarizados',
}

// Helper to check if document is complete (checked or has file)
function isDocComplete(value: DocValue): boolean {
  if (typeof value === 'boolean') return value
  return value?.checked || !!value?.file_url
}

// Helper to get file URL from document value
function getFileUrl(value: DocValue): string | null {
  if (typeof value === 'boolean') return null
  return value?.file_url || null
}

export default function TitleTransferCard({ transfer, onUpdate, showProperty = false }: Props) {
  const toast = useToast()
  const [expanded, setExpanded] = useState(false)
  const [loading, setLoading] = useState(false)
  const [uploadingDoc, setUploadingDoc] = useState<string | null>(null)
  const [checklist, setChecklist] = useState(transfer.documents_checklist || {})
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  const status = STATUS_CONFIG[transfer.status]
  const StatusIcon = status.icon
  const isPurchase = transfer.transfer_type === 'purchase'
  
  const completedDocs = Object.values(checklist).filter(isDocComplete).length
  const totalDocs = Object.keys(checklist).length
  const allDocsComplete = completedDocs === totalDocs

  const handleToggleDoc = async (docKey: string) => {
    const currentValue = checklist[docKey]
    const isCurrentlyChecked = isDocComplete(currentValue)
    const newChecked = !isCurrentlyChecked
    
    // Build new value maintaining file_url if exists
    const fileUrl = getFileUrl(currentValue)
    const newValue: DocValue = {
      checked: newChecked,
      file_url: fileUrl,
      uploaded_at: typeof currentValue === 'object' ? currentValue.uploaded_at : null
    }
    
    // Optimistic update
    setChecklist(prev => ({ ...prev, [docKey]: newValue }))
    
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documents_checklist: { ...checklist, [docKey]: newValue }
        }),
      })
      
      if (!res.ok) throw new Error('Error al actualizar')
      onUpdate?.()
    } catch (error) {
      // Revert on error
      setChecklist(prev => ({ ...prev, [docKey]: currentValue }))
      toast.error('Error al actualizar documento')
    }
  }

  const handleFileUpload = async (docKey: string, file: File) => {
    setUploadingDoc(docKey)
    
    try {
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await fetch(`/api/transfers/${transfer.id}/document/${docKey}/upload`, {
        method: 'POST',
        body: formData,
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Error al subir archivo')
      }
      
      const data = await res.json()
      
      // Update local state
      setChecklist(prev => ({
        ...prev,
        [docKey]: {
          checked: true,
          file_url: data.file_url,
          uploaded_at: new Date().toISOString()
        }
      }))
      
      toast.success(`${DOCUMENT_LABELS[docKey]} subido correctamente`)
      onUpdate?.()
    } catch (error: any) {
      toast.error(error.message || 'Error al subir archivo')
    } finally {
      setUploadingDoc(null)
    }
  }

  const handleDeleteFile = async (docKey: string) => {
    if (!confirm(`¿Eliminar el archivo de "${DOCUMENT_LABELS[docKey]}"?`)) return
    
    setUploadingDoc(docKey) // Reuse for loading state
    
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/document/${docKey}/file`, {
        method: 'DELETE',
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.detail || 'Error al eliminar archivo')
      }
      
      // Update local state
      setChecklist(prev => ({
        ...prev,
        [docKey]: {
          checked: false,
          file_url: null,
          uploaded_at: null
        }
      }))
      
      toast.success('Archivo eliminado')
      onUpdate?.()
    } catch (error: any) {
      toast.error(error.message || 'Error al eliminar archivo')
    } finally {
      setUploadingDoc(null)
    }
  }

  const handleMarkInProgress = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'in_progress' }),
      })
      
      if (res.ok) {
        toast.success('Documentos marcados como en proceso')
        onUpdate?.()
      } else {
        throw new Error('Error en respuesta')
      }
    } catch (error) {
      toast.error('Error al actualizar')
    } finally {
      setLoading(false)
    }
  }

  const handleComplete = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/transfers/${transfer.id}/complete`, {
        method: 'POST',
      })
      
      if (res.ok) {
        toast.success('¡Documentos completados!')
        onUpdate?.()
      } else {
        throw new Error('Error en respuesta')
      }
    } catch (error) {
      toast.error('Error al completar')
    } finally {
      setLoading(false)
    }
  }

  // Better labels for the transaction type
  const TransactionIcon = isPurchase ? ShoppingCart : UserCheck
  const transactionTitle = isPurchase ? 'Documentos de Compra' : 'Documentos de Venta'
  const transactionSubtitle = isPurchase 
    ? `Compra a: ${transfer.from_name}` 
    : `Venta a: ${transfer.to_name}`

  return (
    <div className={`card-luxury overflow-hidden ${
      transfer.status === 'completed' ? 'opacity-75' : ''
    }`}>
      {/* Header */}
      <div 
        className="p-4 cursor-pointer hover:bg-navy-50/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${isPurchase ? 'bg-blue-100' : 'bg-emerald-100'}`}>
              <TransactionIcon className={`w-5 h-5 ${isPurchase ? 'text-blue-600' : 'text-emerald-600'}`} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-medium text-navy-900">
                  {transactionTitle}
                </h4>
                <span className={`badge text-xs ${status.color}`}>
                  <StatusIcon className="w-3 h-3" />
                  {status.label}
                </span>
              </div>
              {showProperty && transfer.property_address && (
                <p className="text-sm text-navy-500 flex items-center gap-1 mt-0.5">
                  <Building2 className="w-3 h-3" />
                  {transfer.property_address}
                </p>
              )}
              <p className="text-sm text-navy-500 mt-0.5">
                {transactionSubtitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-medium text-navy-700">{completedDocs}/{totalDocs} docs</p>
              <div className="w-20 h-1.5 bg-navy-100 rounded-full mt-1">
                <div 
                  className={`h-full rounded-full transition-all ${
                    allDocsComplete ? 'bg-emerald-500' : 'bg-gold-500'
                  }`}
                  style={{ width: `${(completedDocs / totalDocs) * 100}%` }}
                />
              </div>
            </div>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-navy-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-navy-400" />
            )}
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-navy-100">
          {/* Documents Checklist */}
          <div className="mt-4">
            <h5 className="text-sm font-medium text-navy-700 mb-3">Documentos Requeridos</h5>
            <div className="space-y-2">
              {Object.entries(checklist).map(([key, value]) => {
                const isComplete = isDocComplete(value)
                const fileUrl = getFileUrl(value)
                const isUploading = uploadingDoc === key
                
                return (
                  <div
                    key={key}
                    className={`p-3 rounded-lg border transition-all ${
                      isComplete 
                        ? 'bg-emerald-50 border-emerald-200' 
                        : 'bg-navy-50 border-navy-100'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      {/* Left: Checkbox + Label */}
                      <button
                        onClick={() => handleToggleDoc(key)}
                        disabled={transfer.status === 'completed'}
                        className="flex items-center gap-3 text-left flex-1"
                      >
                        {isComplete ? (
                          <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                        ) : (
                          <Circle className="w-5 h-5 text-navy-300 flex-shrink-0" />
                        )}
                        <div>
                          <span className={`text-sm font-medium ${isComplete ? 'text-emerald-700' : 'text-navy-700'}`}>
                            {DOCUMENT_LABELS[key] || key}
                          </span>
                          {fileUrl && (
                            <p className="text-xs text-emerald-600 mt-0.5">
                              {fileUrl.includes('tdhca.') ? '✓ Enlace TDHCA' : '✓ Archivo subido'}
                            </p>
                          )}
                        </div>
                      </button>

                      {/* Right: File Actions */}
                      <div className="flex items-center gap-1">
                        {fileUrl ? (
                          <>
                            <a
                              href={fileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Ver documento"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <Eye className="w-4 h-4" />
                            </a>
                            {/* Only show download for actual uploaded files (not external URLs) */}
                            {!fileUrl.includes('tdhca.') && !fileUrl.includes('tdhca.texas.gov') && (
                              <a
                                href={fileUrl}
                                download
                                className="p-2 text-navy-600 hover:bg-navy-100 rounded-lg"
                                title="Descargar"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                            {transfer.status !== 'completed' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteFile(key)
                                }}
                                disabled={isUploading}
                                className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                                title="Eliminar archivo"
                              >
                                {isUploading ? (
                                  <Loader2 className="w-4 h-4 animate-spin" />
                                ) : (
                                  <Trash2 className="w-4 h-4" />
                                )}
                              </button>
                            )}
                          </>
                        ) : transfer.status !== 'completed' && (
                          <>
                            <input
                              type="file"
                              ref={(el) => { fileInputRefs.current[key] = el }}
                              accept=".pdf,.jpg,.jpeg,.png,.webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0]
                                if (file) handleFileUpload(key, file)
                              }}
                            />
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                fileInputRefs.current[key]?.click()
                              }}
                              disabled={isUploading}
                              className="p-2 text-gold-600 hover:bg-gold-50 rounded-lg flex items-center gap-1"
                              title="Subir archivo"
                            >
                              {isUploading ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4" />
                              )}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Tracking Number */}
          {transfer.tracking_number && (
            <div className="mt-4 p-3 bg-navy-50 rounded-lg">
              <p className="text-xs text-navy-500">Número de Seguimiento</p>
              <p className="font-mono text-navy-900">{transfer.tracking_number}</p>
            </div>
          )}

          {/* Actions */}
          {transfer.status !== 'completed' && transfer.status !== 'cancelled' && (
            <div className="mt-4 flex gap-2">
              {transfer.status === 'pending' && (
                <button
                  onClick={handleMarkInProgress}
                  disabled={loading}
                  className="btn-primary text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  Marcar En Proceso
                </button>
              )}
              
              {(transfer.status === 'pending' || transfer.status === 'in_progress') && allDocsComplete && (
                <button
                  onClick={handleComplete}
                  disabled={loading}
                  className="btn-gold text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Completar Documentos
                </button>
              )}
            </div>
          )}

          {/* Completed Info */}
          {transfer.status === 'completed' && transfer.completed_at && (
            <div className="mt-4 p-3 bg-emerald-50 rounded-lg border border-emerald-200">
              <p className="text-sm text-emerald-700">
                ✓ Completado el {new Date(transfer.completed_at).toLocaleDateString('es-MX', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric'
                })}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
