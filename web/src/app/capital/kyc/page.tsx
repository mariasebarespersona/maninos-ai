'use client'

import { useEffect, useState } from 'react'
import Image from 'next/image'
import {
  ShieldCheck,
  ShieldAlert,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  User,
  Search,
  Eye,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Camera,
  X,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface KYCDocuments {
  id_front_url?: string
  id_back_url?: string
  selfie_url?: string
  id_type?: string
  submitted_at?: string
}

interface Client {
  id: string
  name: string
  email: string
  phone?: string
  kyc_verified: boolean
  kyc_status: string
  kyc_verified_at: string | null
  kyc_type: string | null
  kyc_failure_reason: string | null
  kyc_documents: KYCDocuments | null
  kyc_reviewed_by: string | null
  kyc_reviewed_at: string | null
  has_documents: boolean
}

export default function KYCPage() {
  const toast = useToast()
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  // Document preview modal
  const [previewClient, setPreviewClient] = useState<Client | null>(null)
  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectForm, setShowRejectForm] = useState(false)

  useEffect(() => {
    loadClients()
  }, [])

  const loadClients = async () => {
    try {
      const res = await fetch('/api/clients')
      const data = await res.json()
      const clientList = Array.isArray(data) ? data : data.clients || []
      
      const enriched: Client[] = await Promise.all(
        clientList.map(async (c: any) => {
          try {
            const kycRes = await fetch(`/api/capital/kyc/status/${c.id}`)
            const kycData = await kycRes.json()
            return {
              id: c.id,
              name: c.name || 'Sin nombre',
              email: c.email || '',
              phone: c.phone || '',
              kyc_verified: kycData.kyc_verified || false,
              kyc_status: kycData.kyc_status || 'unverified',
              kyc_verified_at: kycData.kyc_verified_at,
              kyc_type: kycData.kyc_type,
              kyc_failure_reason: kycData.kyc_failure_reason,
              kyc_documents: kycData.kyc_documents || null,
              kyc_reviewed_by: kycData.kyc_reviewed_by || null,
              kyc_reviewed_at: kycData.kyc_reviewed_at || null,
              has_documents: kycData.has_documents || false,
            }
          } catch {
            return {
              id: c.id,
              name: c.name || 'Sin nombre',
              email: c.email || '',
              phone: c.phone || '',
              kyc_verified: false,
              kyc_status: 'unverified',
              kyc_verified_at: null,
              kyc_type: null,
              kyc_failure_reason: null,
              kyc_documents: null,
              kyc_reviewed_by: null,
              kyc_reviewed_at: null,
              has_documents: false,
            }
          }
        })
      )
      
      setClients(enriched)
    } catch (err) {
      toast.error('Error al cargar clientes')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRequestVerification = async (client: Client) => {
    setActionLoading(client.id)
    try {
      const res = await fetch('/api/capital/kyc/request-verification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: client.id }),
      })
      const data = await res.json()
      
      if (data.ok) {
        if (data.already_verified) {
          setClients(prev => prev.map(c => 
            c.id === client.id ? { ...c, kyc_verified: true, kyc_status: 'verified' } : c
          ))
          toast.info('Este cliente ya está verificado')
        } else {
          setClients(prev => prev.map(c => 
            c.id === client.id ? { ...c, kyc_status: 'unverified' } : c
          ))
          toast.success(data.message || `Solicitud enviada a ${client.name}`)
        }
      } else {
        toast.error(data.detail || 'Error al solicitar verificación')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleReviewDocuments = async (client: Client, decision: 'approved' | 'rejected') => {
    setActionLoading(client.id)
    try {
      const res = await fetch('/api/capital/kyc/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          decision,
          reviewed_by: 'admin',
          notes: decision === 'rejected' ? (rejectNotes || 'Documentos no cumplen requisitos') : undefined,
        }),
      })
      const data = await res.json()
      
      if (data.ok) {
        if (decision === 'approved') {
          setClients(prev => prev.map(c => 
            c.id === client.id 
              ? { ...c, kyc_verified: true, kyc_status: 'verified', kyc_failure_reason: null } 
              : c
          ))
          toast.success(`✅ ${client.name} verificado exitosamente`)
        } else {
          setClients(prev => prev.map(c => 
            c.id === client.id 
              ? { ...c, kyc_verified: false, kyc_status: 'failed', kyc_failure_reason: rejectNotes || 'Documentos rechazados' } 
              : c
          ))
          toast.error(`❌ Documentos de ${client.name} rechazados`)
        }
        setPreviewClient(null)
        setShowRejectForm(false)
        setRejectNotes('')
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const handleManualVerify = async (client: Client) => {
    setActionLoading(client.id)
    try {
      const res = await fetch('/api/capital/kyc/manual-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: client.id,
          verified_by: 'admin',
          id_type: 'manual',
          notes: 'Verificado manualmente desde panel KYC',
        }),
      })
      const data = await res.json()
      
      if (data.ok) {
        setClients(prev => prev.map(c => 
          c.id === client.id 
            ? { ...c, kyc_verified: true, kyc_status: 'verified', kyc_type: 'manual', kyc_failure_reason: null } 
            : c
        ))
        toast.success(`✅ ${client.name} verificado manualmente`)
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setActionLoading(null)
    }
  }

  const filteredClients = clients.filter(c => {
    if (!search) return true
    const s = search.toLowerCase()
    return c.name.toLowerCase().includes(s) || c.email.toLowerCase().includes(s)
  })

  // Sort: pending_review first, then unverified, then verified
  const sortedClients = [...filteredClients].sort((a, b) => {
    const order: Record<string, number> = { pending_review: 0, pending: 1, failed: 2, requires_input: 2, unverified: 3, verified: 4 }
    return (order[a.kyc_status] ?? 5) - (order[b.kyc_status] ?? 5)
  })

  const stats = {
    total: clients.length,
    verified: clients.filter(c => c.kyc_verified).length,
    pending: clients.filter(c => ['pending_review', 'pending'].includes(c.kyc_status)).length,
    failed: clients.filter(c => ['failed', 'requires_input'].includes(c.kyc_status)).length,
    unverified: clients.filter(c => c.kyc_status === 'unverified').length,
  }

  const idTypeLabels: Record<string, string> = {
    drivers_license: 'Licencia de conducir',
    passport: 'Pasaporte',
    state_id: 'ID estatal',
    manual: 'Manual',
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-6xl">
      {/* Header */}
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
          Verificación de Identidad (KYC)
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          Revisa los documentos de identidad de los clientes para aprobar sus solicitudes RTO
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Total</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--ink)' }}>{stats.total}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Verificados</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--success)' }}>{stats.verified}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Por Revisar</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--warning)' }}>{stats.pending}</p>
        </div>
        <div className="card-luxury p-4 text-center">
          <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Rechazados</p>
          <p className="font-serif text-2xl font-bold mt-1" style={{ color: 'var(--error)' }}>{stats.failed}</p>
        </div>
      </div>

      {/* Flow explanation */}
      <div className="card-luxury p-5" style={{ borderLeft: '4px solid var(--gold-600)' }}>
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: 'var(--gold-600)' }} />
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Flujo de verificación KYC</p>
            <ol className="text-xs mt-1.5 ml-4 space-y-1 list-decimal" style={{ color: 'var(--slate)' }}>
              <li>Haz clic en &quot;Solicitar Verificación&quot; para pedirle al cliente</li>
              <li>El cliente sube fotos de su ID + selfie desde su portal</li>
              <li>Tú revisas los documentos aquí y apruebas o rechazas</li>
              <li>También puedes usar &quot;Verificar Manual&quot; para clientes de confianza</li>
            </ol>
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="card-luxury p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar cliente por nombre o email..."
            className="input pl-10"
          />
        </div>
      </div>

      {/* Client List */}
      <div className="space-y-3">
        {sortedClients.length === 0 ? (
          <div className="card-luxury p-12 text-center">
            <User className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
            <p style={{ color: 'var(--slate)' }}>No se encontraron clientes</p>
          </div>
        ) : (
          sortedClients.map((client) => (
            <div key={client.id} className="card-luxury p-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                {/* Client Info */}
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                       style={{ backgroundColor: client.kyc_verified ? 'var(--success-light)' : client.has_documents ? 'var(--warning-light)' : 'var(--cream)' }}>
                    {client.kyc_verified ? (
                      <ShieldCheck className="w-6 h-6" style={{ color: 'var(--success)' }} />
                    ) : client.has_documents ? (
                      <Clock className="w-6 h-6" style={{ color: 'var(--warning)' }} />
                    ) : ['failed', 'requires_input'].includes(client.kyc_status) ? (
                      <XCircle className="w-6 h-6" style={{ color: 'var(--error)' }} />
                    ) : (
                      <ShieldAlert className="w-6 h-6" style={{ color: 'var(--ash)' }} />
                    )}
                  </div>
                  <div>
                    <p className="font-semibold" style={{ color: 'var(--ink)' }}>{client.name}</p>
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>{client.email}</p>
                    {client.phone && (
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{client.phone}</p>
                    )}
                  </div>
                </div>

                {/* Status */}
                <div className="text-right flex-shrink-0">
                  <KYCStatusBadge status={client.kyc_status} verified={client.kyc_verified} hasDocuments={client.has_documents} />
                  {client.kyc_verified && client.kyc_verified_at && (
                    <p className="text-xs mt-1" style={{ color: 'var(--ash)' }}>
                      {new Date(client.kyc_verified_at).toLocaleDateString('es-MX')}
                      {client.kyc_type && ` · ${idTypeLabels[client.kyc_type] || client.kyc_type}`}
                    </p>
                  )}
                  {client.kyc_failure_reason && (
                    <p className="text-xs mt-1 max-w-[200px]" style={{ color: 'var(--error)' }}>
                      {client.kyc_failure_reason}
                    </p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 flex-wrap">
                  {/* View Documents - when client has uploaded docs */}
                  {client.has_documents && !client.kyc_verified && (
                    <button
                      onClick={() => setPreviewClient(client)}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--info)' }}
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Revisar Documentos
                    </button>
                  )}

                  {/* Request Verification from Client */}
                  {!client.kyc_verified && (
                    <button
                      onClick={() => handleRequestVerification(client)}
                      disabled={actionLoading === client.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--navy-800)' }}
                    >
                      {actionLoading === client.id 
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <ShieldCheck className="w-3.5 h-3.5" />
                      }
                      {client.has_documents ? 'Re-solicitar' : 'Solicitar Verificación'}
                    </button>
                  )}

                  {/* Manual Verify */}
                  {!client.kyc_verified && (
                    <button
                      onClick={() => handleManualVerify(client)}
                      disabled={actionLoading === client.id}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border text-xs font-medium transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
                    >
                      {actionLoading === client.id 
                        ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        : <CheckCircle2 className="w-3.5 h-3.5" />
                      }
                      Verificar Manual
                    </button>
                  )}

                  {/* Already verified */}
                  {client.kyc_verified && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-medium"
                          style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Verificado
                    </span>
                  )}
                </div>
              </div>

              {/* Inline doc thumbnails for pending review */}
              {client.has_documents && !client.kyc_verified && client.kyc_documents && (
                <div className="mt-4 pt-3 border-t flex items-center gap-3" style={{ borderColor: 'var(--sand)' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--ash)' }}>Docs:</span>
                  {client.kyc_documents.id_front_url && (
                    <button onClick={() => { setPreviewClient(client); setPreviewImage(client.kyc_documents!.id_front_url!) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:border-blue-400 transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                      <FileText className="w-3 h-3" /> ID Frente
                    </button>
                  )}
                  {client.kyc_documents.id_back_url && (
                    <button onClick={() => { setPreviewClient(client); setPreviewImage(client.kyc_documents!.id_back_url!) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:border-blue-400 transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                      <FileText className="w-3 h-3" /> ID Reverso
                    </button>
                  )}
                  {client.kyc_documents.selfie_url && (
                    <button onClick={() => { setPreviewClient(client); setPreviewImage(client.kyc_documents!.selfie_url!) }}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md border hover:border-blue-400 transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--slate)' }}>
                      <Camera className="w-3 h-3" /> Selfie
                    </button>
                  )}
                  {client.kyc_documents.id_type && (
                    <span className="text-xs ml-auto" style={{ color: 'var(--ash)' }}>
                      {idTypeLabels[client.kyc_documents.id_type] || client.kyc_documents.id_type}
                    </span>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* ═══════════ Document Review Modal ═══════════ */}
      {previewClient && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4" onClick={() => { setPreviewClient(null); setPreviewImage(null); setShowRejectForm(false); setRejectNotes('') }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="px-6 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
              <div>
                <h3 className="font-serif text-lg font-bold" style={{ color: 'var(--ink)' }}>
                  Revisar Documentos — {previewClient.name}
                </h3>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  {previewClient.email}
                  {previewClient.kyc_documents?.id_type && ` · ${idTypeLabels[previewClient.kyc_documents.id_type] || previewClient.kyc_documents.id_type}`}
                  {previewClient.kyc_documents?.submitted_at && ` · Enviado: ${new Date(previewClient.kyc_documents.submitted_at).toLocaleDateString('es-MX')}`}
                </p>
              </div>
              <button onClick={() => { setPreviewClient(null); setPreviewImage(null); setShowRejectForm(false); setRejectNotes('') }}
                className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors" style={{ color: 'var(--ash)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Document images */}
            <div className="p-6">
              {previewImage ? (
                /* Full-size preview of selected image */
                <div>
                  <button onClick={() => setPreviewImage(null)} className="text-sm font-medium mb-3 flex items-center gap-1" style={{ color: 'var(--info)' }}>
                    ← Volver a todos los documentos
                  </button>
                  <div className="relative w-full rounded-xl overflow-hidden border bg-gray-50" style={{ borderColor: 'var(--stone)', minHeight: 400 }}>
                    <img src={previewImage} alt="Documento" className="w-full h-auto" />
                  </div>
                </div>
              ) : (
                /* Grid of all documents */
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {previewClient.kyc_documents?.id_front_url && (
                    <DocThumbnail
                      label="ID — Frente"
                      url={previewClient.kyc_documents.id_front_url}
                      onClick={() => setPreviewImage(previewClient.kyc_documents!.id_front_url!)}
                    />
                  )}
                  {previewClient.kyc_documents?.id_back_url && (
                    <DocThumbnail
                      label="ID — Reverso"
                      url={previewClient.kyc_documents.id_back_url}
                      onClick={() => setPreviewImage(previewClient.kyc_documents!.id_back_url!)}
                    />
                  )}
                  {previewClient.kyc_documents?.selfie_url && (
                    <DocThumbnail
                      label="Selfie con ID"
                      url={previewClient.kyc_documents.selfie_url}
                      onClick={() => setPreviewImage(previewClient.kyc_documents!.selfie_url!)}
                    />
                  )}
                </div>
              )}
            </div>

            {/* Review actions */}
            <div className="px-6 py-4 border-t" style={{ borderColor: 'var(--sand)' }}>
              {showRejectForm ? (
                <div className="space-y-3">
                  <label className="block text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                    Razón del rechazo (visible para el cliente):
                  </label>
                  <textarea
                    value={rejectNotes}
                    onChange={(e) => setRejectNotes(e.target.value)}
                    placeholder="Ej: La foto del ID está borrosa, no se puede leer el nombre..."
                    rows={3}
                    className="input w-full"
                  />
                  <div className="flex gap-3">
                    <button
                      onClick={() => handleReviewDocuments(previewClient, 'rejected')}
                      disabled={actionLoading === previewClient.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: 'var(--error)' }}
                    >
                      {actionLoading === previewClient.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsDown className="w-4 h-4" />}
                      Confirmar Rechazo
                    </button>
                    <button
                      onClick={() => { setShowRejectForm(false); setRejectNotes('') }}
                      className="px-4 py-2 rounded-md text-sm font-medium border transition-colors"
                      style={{ borderColor: 'var(--stone)', color: 'var(--charcoal)' }}
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-3">
                  <button
                    onClick={() => handleReviewDocuments(previewClient, 'approved')}
                    disabled={actionLoading === previewClient.id}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: 'var(--success)' }}
                  >
                    {actionLoading === previewClient.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <ThumbsUp className="w-4 h-4" />}
                    Aprobar — Verificar Cliente
                  </button>
                  <button
                    onClick={() => setShowRejectForm(true)}
                    className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-md text-sm font-semibold border transition-colors"
                    style={{ borderColor: 'var(--error)', color: 'var(--error)' }}
                  >
                    <ThumbsDown className="w-4 h-4" />
                    Rechazar
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


function DocThumbnail({ label, url, onClick }: { label: string; url: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="group text-left">
      <div className="relative w-full h-44 rounded-lg overflow-hidden border bg-gray-50 group-hover:border-blue-400 transition-colors" style={{ borderColor: 'var(--stone)' }}>
        <img src={url} alt={label} className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <Eye className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow-lg" />
        </div>
      </div>
      <p className="text-xs font-medium mt-1.5" style={{ color: 'var(--charcoal)' }}>{label}</p>
    </button>
  )
}


function KYCStatusBadge({ status, verified, hasDocuments }: { status: string; verified: boolean; hasDocuments: boolean }) {
  if (verified) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
        <CheckCircle2 className="w-3 h-3" />
        Verificado
      </span>
    )
  }

  if (status === 'pending_review' || (status === 'pending' && hasDocuments)) {
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
            style={{ backgroundColor: 'var(--warning-light)', color: 'var(--warning)' }}>
        <Clock className="w-3 h-3" />
        Por Revisar
      </span>
    )
  }

  const configs: Record<string, { bg: string; color: string; icon: typeof Clock; label: string }> = {
    pending: { bg: 'var(--warning-light)', color: 'var(--warning)', icon: Clock, label: 'Esperando Docs' },
    failed: { bg: 'var(--error-light)', color: 'var(--error)', icon: XCircle, label: 'Rechazado' },
    requires_input: { bg: 'var(--error-light)', color: 'var(--error)', icon: XCircle, label: 'Rechazado' },
    unverified: { bg: 'var(--cream)', color: 'var(--ash)', icon: ShieldAlert, label: 'Sin Verificar' },
  }

  const config = configs[status] || configs.unverified
  const Icon = config.icon

  return (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ backgroundColor: config.bg, color: config.color }}>
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  )
}
