'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { toast } from '@/components/ui/Toast'
import {
  ArrowLeft,
  Users,
  Phone,
  Mail,
  MapPin,
  Building2,
  DollarSign,
  Calendar,
  FileText,
  Loader2,
  CheckCircle2,
  Clock,
  UserPlus,
  FileSignature,
  Home,
  XCircle,
  Briefcase,
  Shield,
  Eye,
  ExternalLink,
  User,
  Heart,
  Banknote,
  ClipboardList,
  Send,
  PhoneCall,
  MessageSquare,
  StickyNote,
} from 'lucide-react'

interface ClientFull {
  id: string
  name: string
  email?: string
  phone?: string
  terreno?: string
  status: string
  created_by_user_id?: string
  created_at: string
  updated_at: string
  // Personal
  date_of_birth?: string
  ssn_itin?: string
  marital_status?: string
  address?: string
  city?: string
  state?: string
  zip_code?: string
  residence_type?: string
  // Employment
  employer_name?: string
  occupation?: string
  employer_address?: string
  employer_phone?: string
  monthly_income?: number
  employment_status?: string
  time_at_job_years?: number
  time_at_job_months?: number
  other_income_source?: boolean
  other_income_amount?: number
  // References
  personal_references?: { name: string; phone: string; relationship: string }[]
  // KYC
  kyc_verified?: boolean
  kyc_verified_at?: string
  kyc_documents?: Record<string, string>
  kyc_status?: string
}

interface Sale {
  id: string
  property_id: string
  sale_type: string
  sale_price: number
  status: string
  payment_method?: string
  payment_reference?: string
  created_at: string
  completed_at?: string
  found_by_employee_id?: string
  sold_by_employee_id?: string
  commission_amount?: number
  commission_found_by?: number
  commission_sold_by?: number
  property?: {
    id: string
    address: string
    city?: string
    state?: string
    sale_price?: number
    purchase_price?: number
    photos?: string[]
    bedrooms?: number
    bathrooms?: number
    square_feet?: number
    year?: number
    hud_number?: string
  }
  documents?: DocItem[]
}

interface DocItem {
  id: string
  doc_type: string
  doc_label: string
  file_url: string
  uploaded_at?: string
  transfer_type?: string
  transfer_status?: string
  source?: string
}

interface ClientNote {
  id: string
  client_id: string
  author_id: string
  author_name: string
  note_type: 'observation' | 'comment' | 'follow_up' | 'call_log'
  content: string
  created_at: string
}

interface TeamUser {
  id: string
  name: string
  email?: string
  role?: string
}

interface ClientHistory {
  client: ClientFull
  created_by_name?: string
  assigned_employee_id?: string
  assigned_employee_name?: string
  sales: Sale[]
  documents: DocItem[]
  kyc_documents: DocItem[]
}

const statusConfig: Record<string, { label: string; color: string; bgColor: string; icon: any }> = {
  lead: { label: 'Lead', color: 'text-blue-700', bgColor: 'bg-blue-100', icon: UserPlus },
  active: { label: 'Activo', color: 'text-amber-700', bgColor: 'bg-amber-100', icon: Clock },
  completed: { label: 'Completado', color: 'text-emerald-700', bgColor: 'bg-emerald-100', icon: CheckCircle2 },
  rto_applicant: { label: 'Solicitante RTO', color: 'text-purple-700', bgColor: 'bg-purple-100', icon: FileSignature },
  rto_active: { label: 'RTO Activo', color: 'text-indigo-700', bgColor: 'bg-indigo-100', icon: Home },
  inactive: { label: 'Inactivo', color: 'text-gray-700', bgColor: 'bg-gray-100', icon: XCircle },
}

const saleStatusConfig: Record<string, { label: string; color: string }> = {
  pending: { label: 'Pendiente de Pago', color: 'bg-amber-100 text-amber-700' },
  paid: { label: 'Pagada', color: 'bg-blue-100 text-blue-700' },
  completed: { label: 'Completada', color: 'bg-emerald-100 text-emerald-700' },
  cancelled: { label: 'Cancelada', color: 'bg-red-100 text-red-700' },
  rto_pending: { label: 'RTO - En revisión', color: 'bg-orange-100 text-orange-700' },
  rto_approved: { label: 'RTO - Aprobada', color: 'bg-indigo-100 text-indigo-700' },
  rto_active: { label: 'RTO - Activa', color: 'bg-purple-100 text-purple-700' },
}

const noteTypeConfig: Record<string, { label: string; color: string; icon: any }> = {
  observation: { label: 'Observacion', color: 'bg-blue-100 text-blue-700', icon: StickyNote },
  comment: { label: 'Comentario', color: 'bg-gray-100 text-gray-700', icon: MessageSquare },
  follow_up: { label: 'Seguimiento', color: 'bg-amber-100 text-amber-700', icon: ClipboardList },
  call_log: { label: 'Llamada', color: 'bg-green-100 text-green-700', icon: PhoneCall },
}

export default function ClientDetailPage() {
  const params = useParams()
  const [data, setData] = useState<ClientHistory | null>(null)
  const [loading, setLoading] = useState(true)
  // Tracking / Follow-up state
  const [notes, setNotes] = useState<ClientNote[]>([])
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [assignedEmployeeId, setAssignedEmployeeId] = useState<string>('')
  const [newNoteType, setNewNoteType] = useState<string>('observation')
  const [newNoteContent, setNewNoteContent] = useState('')
  const [submittingNote, setSubmittingNote] = useState(false)
  const [assigningEmployee, setAssigningEmployee] = useState(false)
  useEffect(() => {
    fetchClientHistory()
    fetchNotes()
    fetchTeamUsers()
  }, [params.id])

  const fetchClientHistory = async () => {
    try {
      const res = await fetch(`/api/clients/${params.id}/history`)
      if (res.ok) {
        const history = await res.json()
        setData(history)
        setAssignedEmployeeId(history.assigned_employee_id || '')
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/clients/${params.id}/notes`)
      if (res.ok) {
        const notesData = await res.json()
        setNotes(notesData)
      }
    } catch (error) {
      console.error('Error fetching notes:', error)
    }
  }, [params.id])

  const fetchTeamUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/team/users')
      if (res.ok) {
        const users = await res.json()
        setTeamUsers(users)
      }
    } catch (error) {
      console.error('Error fetching team users:', error)
    }
  }, [])

  const handleAssignEmployee = async (employeeId: string) => {
    setAssigningEmployee(true)
    try {
      const res = await fetch(`/api/clients/${params.id}/assign-employee`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employee_id: employeeId || null }),
      })
      if (res.ok) {
        setAssignedEmployeeId(employeeId)
        toast.success('Empleado asignado correctamente')
      } else {
        toast.error('Error al asignar empleado')
      }
    } catch (error) {
      console.error('Error assigning employee:', error)
      toast.error('Error al asignar empleado')
    } finally {
      setAssigningEmployee(false)
    }
  }

  const handleAddNote = async () => {
    if (!newNoteContent.trim()) return
    setSubmittingNote(true)
    try {
      // Use the first team user as author (in a real app this would be the logged-in user)
      const authorId = teamUsers.length > 0 ? teamUsers[0].id : null
      if (!authorId) {
        toast.error('No se encontro un usuario para registrar la nota')
        return
      }
      const res = await fetch(`/api/clients/${params.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          author_id: authorId,
          note_type: newNoteType,
          content: newNoteContent.trim(),
        }),
      })
      if (res.ok) {
        const note = await res.json()
        setNotes(prev => [note, ...prev])
        setNewNoteContent('')
        setNewNoteType('observation')
        toast.success('Nota agregada')
      } else {
        toast.error('Error al agregar nota')
      }
    } catch (error) {
      console.error('Error adding note:', error)
      toast.error('Error al agregar nota')
    } finally {
      setSubmittingNote(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <Users className="w-12 h-12 text-navy-300 mx-auto mb-4" />
        <h3 className="font-serif text-xl text-navy-900 mb-2">Cliente no encontrado</h3>
        <Link href="/homes/clients" className="btn-primary inline-flex mt-4">
          Volver a Clientes
        </Link>
      </div>
    )
  }

  const { client, created_by_name, sales = [], documents = [], kyc_documents = [] } = data
  const status = statusConfig[client.status] || statusConfig.lead
  const StatusIcon = status.icon

  const hasPersonalInfo = client.date_of_birth || client.ssn_itin || client.marital_status || client.address
  const hasEmploymentInfo = client.employer_name || client.occupation || client.monthly_income
  const hasReferences = client.personal_references && client.personal_references.length > 0

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div>
        <Link 
          href="/homes/clients" 
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Clientes
        </Link>
        
        <div className="card-luxury p-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-navy-600 to-navy-800 flex items-center justify-center shadow-card">
              <span className="text-white font-serif text-3xl">
                {client.name.charAt(0).toUpperCase()}
              </span>
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="font-serif text-2xl text-navy-900">{client.name}</h1>
                <div className={`badge ${status.bgColor} ${status.color}`}>
                  <StatusIcon className="w-4 h-4" />
                  {status.label}
                </div>
              </div>
              <div className="flex items-center gap-4 mt-2 text-sm text-navy-500 flex-wrap">
                {client.phone && (
                  <a href={`tel:${client.phone}`} className="flex items-center gap-1 hover:text-navy-700">
                    <Phone className="w-4 h-4" /> {client.phone}
                  </a>
                )}
                {client.email && (
                  <a href={`mailto:${client.email}`} className="flex items-center gap-1 hover:text-navy-700">
                    <Mail className="w-4 h-4" /> {client.email}
                  </a>
                )}
                {client.terreno && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" /> {client.terreno}
                  </span>
                )}
              </div>
              {created_by_name && (
                <p className="text-xs text-navy-400 mt-1">Creado por: {created_by_name}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Personal Info (from Solicitud de Crédito) */}
          {hasPersonalInfo && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                <User className="w-5 h-5 text-gold-500" />
                Información Personal
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem icon={Calendar} label="Fecha de Nacimiento" value={client.date_of_birth ? new Date(client.date_of_birth).toLocaleDateString('es-MX') : undefined} />
                <InfoItem icon={Shield} label="SSN/ITIN" value={client.ssn_itin ? `***-**-${client.ssn_itin.slice(-4)}` : undefined} />
                <InfoItem icon={Heart} label="Estado Civil" value={client.marital_status} />
                <InfoItem icon={Home} label="Tipo de Residencia" value={client.residence_type} />
                <InfoItem icon={MapPin} label="Dirección" value={
                  [client.address, client.city, client.state, client.zip_code].filter(Boolean).join(', ') || undefined
                } />
              </div>
            </div>
          )}

          {/* Employment Info */}
          {hasEmploymentInfo && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-gold-500" />
                Información Laboral
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InfoItem icon={Building2} label="Empleador" value={client.employer_name} />
                <InfoItem icon={Briefcase} label="Ocupación" value={client.occupation} />
                <InfoItem icon={DollarSign} label="Ingreso Mensual" value={client.monthly_income ? `$${client.monthly_income.toLocaleString()}` : undefined} />
                <InfoItem icon={Clock} label="Tiempo en Empleo" value={
                  (client.time_at_job_years || client.time_at_job_months) 
                    ? `${client.time_at_job_years || 0} años, ${client.time_at_job_months || 0} meses`
                    : undefined
                } />
                <InfoItem icon={Phone} label="Teléfono Empleador" value={client.employer_phone} />
                <InfoItem icon={MapPin} label="Dirección Empleador" value={client.employer_address} />
                {client.other_income_source && (
                  <InfoItem icon={Banknote} label="Otro Ingreso" value={
                    client.other_income_amount ? `$${client.other_income_amount.toLocaleString()}/mes` : 'Sí'
                  } />
                )}
              </div>
            </div>
          )}

          {/* Personal References */}
          {hasReferences && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                <Users className="w-5 h-5 text-gold-500" />
                Referencias Personales
              </h2>
              <div className="space-y-3">
                {client.personal_references!.map((ref, idx) => (
                  <div key={idx} className="p-3 bg-navy-50 rounded-lg flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-navy-200 flex items-center justify-center flex-shrink-0">
                      <User className="w-5 h-5 text-navy-600" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-navy-900">{ref.name}</p>
                      <div className="flex items-center gap-4 text-sm text-navy-500">
                        <span>{ref.relationship}</span>
                        {ref.phone && (
                          <a href={`tel:${ref.phone}`} className="flex items-center gap-1 hover:text-navy-700">
                            <Phone className="w-3.5 h-3.5" /> {ref.phone}
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compras — Resumen con link a Ventas */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gold-500" />
              Compras
            </h2>
            {sales.length === 0 ? (
              <div className="text-center py-8 bg-navy-50 rounded-lg">
                <DollarSign className="w-8 h-8 text-navy-300 mx-auto mb-2" />
                <p className="text-navy-500">Sin compras registradas</p>
              </div>
            ) : (
              <div className="space-y-3">
                {sales.map((sale) => {
                  const saleStatus = saleStatusConfig[sale.status] || saleStatusConfig.pending
                  return (
                    <Link
                      key={sale.id}
                      href={`/homes/sales`}
                      className="flex items-center gap-4 p-4 bg-navy-50 rounded-xl hover:bg-navy-100 transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-lg bg-navy-200 overflow-hidden flex-shrink-0">
                        {sale.property?.photos?.[0] ? (
                          <img src={sale.property.photos[0]} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Home className="w-5 h-5 text-navy-400" />
                          </div>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-navy-900 text-sm truncate">
                          {sale.property?.address || 'Propiedad'}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-sm font-medium text-navy-700">
                            ${sale.sale_price?.toLocaleString()}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            sale.sale_type === 'rto' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {sale.sale_type === 'rto' ? 'RTO' : 'Contado'}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${saleStatus.color}`}>
                            {saleStatus.label}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-gold-600 font-medium group-hover:underline flex items-center gap-1">
                        Ver en Ventas <ExternalLink className="w-3 h-3" />
                      </span>
                    </Link>
                  )
                })}
              </div>
            )}
          </div>

          {/* KYC Documents */}
          {kyc_documents.length > 0 && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                <Shield className="w-5 h-5 text-gold-500" />
                Documentos de Identificación (KYC)
              </h2>
              <div className="space-y-2">
                {kyc_documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-navy-50 rounded-lg hover:bg-navy-100 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-navy-500" />
                    <span className="flex-1 text-navy-700">{doc.doc_label}</span>
                    <Eye className="w-4 h-4 text-navy-400" />
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Quick Stats */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-4">Resumen</h2>
            <div className="space-y-3">
              <StatRow label="Total Compras" value={String(sales.length)} />
              <StatRow label="Documentos" value={String(documents.length + kyc_documents.length)} />
              {sales.length > 0 && (
                <>
                  <div className="border-t border-navy-100 pt-3">
                    <StatRow 
                      label="Valor Total" 
                      value={`$${sales.reduce((sum, s) => sum + (s.sale_price || 0), 0).toLocaleString()}`}
                      highlight
                    />
                  </div>
                  <StatRow 
                    label="Contado" 
                    value={String(sales.filter(s => s.sale_type === 'contado').length)} 
                  />
                  <StatRow 
                    label="RTO" 
                    value={String(sales.filter(s => s.sale_type === 'rto').length)} 
                  />
                </>
              )}
            </div>
          </div>

          {/* KYC Status */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <Shield className="w-5 h-5 text-gold-500" />
              Verificación KYC
            </h2>
            <div className={`p-3 rounded-lg ${
              client.kyc_verified 
                ? 'bg-emerald-50 border border-emerald-200'
                : client.kyc_status === 'pending'
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-navy-50 border border-navy-200'
            }`}>
              <div className="flex items-center gap-2">
                {client.kyc_verified ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                ) : (
                  <Clock className="w-5 h-5 text-navy-400" />
                )}
                <span className={`font-medium ${
                  client.kyc_verified ? 'text-emerald-700' : 'text-navy-600'
                }`}>
                  {client.kyc_verified ? 'Verificado' : 
                   client.kyc_status === 'pending' ? 'En revisión' : 'No verificado'}
                </span>
              </div>
              {client.kyc_verified_at && (
                <p className="text-xs text-navy-500 mt-1">
                  Verificado: {new Date(client.kyc_verified_at).toLocaleDateString('es-MX')}
                </p>
              )}
            </div>
          </div>

          {/* Contact Info (if minimal data) */}
          {!hasPersonalInfo && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4">Contacto</h2>
              <div className="space-y-3">
                <InfoItem icon={Phone} label="Teléfono" value={client.phone} />
                <InfoItem icon={Mail} label="Email" value={client.email} />
                <InfoItem icon={MapPin} label="Terreno" value={client.terreno} />
                <InfoItem icon={Calendar} label="Cliente desde" value={new Date(client.created_at).toLocaleDateString('es-MX')} />
              </div>
            </div>
          )}

          {/* Client Portal Info */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-3">Datos del Portal</h2>
            <p className="text-sm text-navy-500 mb-3">
              Información que el cliente ha rellenado desde su portal.
            </p>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-navy-500">Info Personal</span>
                <span className={hasPersonalInfo ? 'text-emerald-600 font-medium' : 'text-navy-400'}>
                  {hasPersonalInfo ? '✓ Completado' : 'Pendiente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Info Laboral</span>
                <span className={hasEmploymentInfo ? 'text-emerald-600 font-medium' : 'text-navy-400'}>
                  {hasEmploymentInfo ? '✓ Completado' : 'Pendiente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">Referencias</span>
                <span className={hasReferences ? 'text-emerald-600 font-medium' : 'text-navy-400'}>
                  {hasReferences ? `✓ ${client.personal_references!.length} ref.` : 'Pendiente'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-navy-500">KYC / ID</span>
                <span className={client.kyc_verified ? 'text-emerald-600 font-medium' : 'text-navy-400'}>
                  {client.kyc_verified ? '✓ Verificado' : 'Pendiente'}
                </span>
              </div>
            </div>
          </div>

          {/* Seguimiento (Tracking) */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-amber-500" />
              Seguimiento
            </h2>

            {/* Empleado Asignado */}
            <div className="mb-5">
              <label className="text-xs font-medium text-navy-500 mb-1.5 block">
                Empleado Asignado
              </label>
              <select
                value={assignedEmployeeId}
                onChange={(e) => handleAssignEmployee(e.target.value)}
                disabled={assigningEmployee}
                className="w-full px-3 py-2 text-sm border border-navy-200 rounded-lg bg-white text-navy-900 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 disabled:opacity-50"
              >
                <option value="">Sin asignar</option>
                {teamUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Divider */}
            <div className="border-t border-navy-100 my-4" />

            {/* Add Note Form */}
            <div className="mb-4">
              <label className="text-xs font-medium text-navy-500 mb-1.5 block">
                Nueva Nota
              </label>
              <div className="flex gap-2 mb-2">
                {Object.entries(noteTypeConfig).map(([key, cfg]) => {
                  const NoteIcon = cfg.icon
                  return (
                    <button
                      key={key}
                      onClick={() => setNewNoteType(key)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-all ${
                        newNoteType === key
                          ? cfg.color + ' ring-2 ring-offset-1 ring-amber-300'
                          : 'bg-navy-50 text-navy-400 hover:bg-navy-100'
                      }`}
                      title={cfg.label}
                    >
                      <NoteIcon className="w-3 h-3" />
                      <span className="hidden sm:inline">{cfg.label}</span>
                    </button>
                  )
                })}
              </div>
              <textarea
                value={newNoteContent}
                onChange={(e) => setNewNoteContent(e.target.value)}
                placeholder="Escribe una observación, comentario o seguimiento..."
                rows={3}
                className="w-full px-3 py-2 text-sm border border-navy-200 rounded-lg bg-white text-navy-900 placeholder-navy-300 focus:outline-none focus:ring-2 focus:ring-amber-300 focus:border-amber-400 resize-none"
              />
              <button
                onClick={handleAddNote}
                disabled={submittingNote || !newNoteContent.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submittingNote ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Agregar Nota
              </button>
            </div>

            {/* Notes List */}
            {notes.length > 0 && (
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {notes.map((note) => {
                  const noteConfig = noteTypeConfig[note.note_type] || noteTypeConfig.observation
                  return (
                    <div key={note.id} className="p-3 bg-navy-50 rounded-lg border border-navy-100">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${noteConfig.color}`}>
                          {noteConfig.label}
                        </span>
                        <span className="text-xs text-navy-400 ml-auto">
                          {new Date(note.created_at).toLocaleDateString('es-MX', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </div>
                      <p className="text-sm text-navy-800 whitespace-pre-wrap">{note.content}</p>
                      <p className="text-xs text-navy-400 mt-1.5 flex items-center gap-1">
                        <User className="w-3 h-3" />
                        {note.author_name}
                      </p>
                    </div>
                  )
                })}
              </div>
            )}

            {notes.length === 0 && (
              <div className="text-center py-4 bg-navy-50 rounded-lg">
                <StickyNote className="w-6 h-6 text-navy-300 mx-auto mb-1" />
                <p className="text-xs text-navy-400">Sin notas aun</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function InfoItem({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-2 bg-navy-50 rounded-lg flex-shrink-0">
        <Icon className="w-4 h-4 text-navy-500" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-navy-500">{label}</p>
        <p className="font-medium text-navy-900 text-sm break-words">{value || '—'}</p>
      </div>
    </div>
  )
}

function StatRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-navy-500 text-sm">{label}</span>
      <span className={`font-semibold ${highlight ? 'text-gold-600 text-lg' : 'text-navy-900'}`}>
        {value}
      </span>
    </div>
  )
}
