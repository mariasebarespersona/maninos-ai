'use client'

import React, { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
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
  CreditCard,
  Shield,
  Eye,
  Download,
  ExternalLink,
  User,
  Heart,
  ChevronDown,
  ChevronUp,
  Award,
  Banknote,
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

interface ClientHistory {
  client: ClientFull
  created_by_name?: string
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

export default function ClientDetailPage() {
  const params = useParams()
  const [data, setData] = useState<ClientHistory | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedSales, setExpandedSales] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetchClientHistory()
  }, [params.id])

  const fetchClientHistory = async () => {
    try {
      const res = await fetch(`/api/clients/${params.id}/history`)
      if (res.ok) {
        const history = await res.json()
        setData(history)
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setLoading(false)
    }
  }

  const toggleSale = (saleId: string) => {
    setExpandedSales(prev => {
      const next = new Set(prev)
      if (next.has(saleId)) next.delete(saleId)
      else next.add(saleId)
      return next
    })
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
            <div className="flex gap-2">
              <Link 
                href={`/homes/sales/new?client=${client.id}`}
                className="btn-gold"
              >
                <DollarSign className="w-5 h-5" />
                Nueva Venta
              </Link>
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

          {/* Sales History — Detailed */}
          <div className="card-luxury p-6">
            <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gold-500" />
              Historial de Compras / Ventas
            </h2>
            {sales.length === 0 ? (
              <div className="text-center py-8 bg-navy-50 rounded-lg">
                <DollarSign className="w-8 h-8 text-navy-300 mx-auto mb-2" />
                <p className="text-navy-500">Sin compras registradas</p>
              </div>
            ) : (
              <div className="space-y-4">
                {sales.map((sale) => {
                  const saleStatus = saleStatusConfig[sale.status] || saleStatusConfig.pending
                  const isExpanded = expandedSales.has(sale.id)
                  
                  return (
                    <div key={sale.id} className="border border-navy-100 rounded-xl overflow-hidden">
                      {/* Sale Header */}
                      <button
                        onClick={() => toggleSale(sale.id)}
                        className="w-full p-4 flex items-center gap-4 hover:bg-navy-50 transition-colors text-left"
                      >
                        {/* Property Photo */}
                        <div className="w-16 h-16 rounded-lg bg-navy-100 overflow-hidden flex-shrink-0">
                          {sale.property?.photos?.[0] ? (
                            <img src={sale.property.photos[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Home className="w-6 h-6 text-navy-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-semibold text-navy-900">
                              ${sale.sale_price?.toLocaleString()}
                            </p>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${saleStatus.color}`}>
                              {saleStatus.label}
                            </span>
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              sale.sale_type === 'rto' ? 'bg-purple-100 text-purple-700' : 'bg-emerald-100 text-emerald-700'
                            }`}>
                              {sale.sale_type === 'rto' ? '🔑 RTO' : '💵 Contado'}
                            </span>
                          </div>
                          <p className="text-sm text-navy-500 truncate mt-0.5">
                            {sale.property?.address || 'Propiedad'} • {new Date(sale.created_at).toLocaleDateString('es-MX')}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp className="w-5 h-5 text-navy-400" /> : <ChevronDown className="w-5 h-5 text-navy-400" />}
                      </button>

                      {/* Expanded Details */}
                      {isExpanded && (
                        <div className="border-t border-navy-100 p-4 space-y-4">
                          {/* Property Details */}
                          {sale.property && (
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                              {sale.property.bedrooms && (
                                <div className="p-2 bg-navy-50 rounded-lg text-center">
                                  <p className="text-navy-500 text-xs">Cuartos</p>
                                  <p className="font-semibold text-navy-900">{sale.property.bedrooms}</p>
                                </div>
                              )}
                              {sale.property.bathrooms && (
                                <div className="p-2 bg-navy-50 rounded-lg text-center">
                                  <p className="text-navy-500 text-xs">Baños</p>
                                  <p className="font-semibold text-navy-900">{sale.property.bathrooms}</p>
                                </div>
                              )}
                              {sale.property.square_feet && (
                                <div className="p-2 bg-navy-50 rounded-lg text-center">
                                  <p className="text-navy-500 text-xs">Sq Ft</p>
                                  <p className="font-semibold text-navy-900">{sale.property.square_feet.toLocaleString()}</p>
                                </div>
                              )}
                              {sale.property.year && (
                                <div className="p-2 bg-navy-50 rounded-lg text-center">
                                  <p className="text-navy-500 text-xs">Año</p>
                                  <p className="font-semibold text-navy-900">{sale.property.year}</p>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Payment Info */}
                          {sale.payment_method && (
                            <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                              <p className="text-xs text-emerald-600 font-medium mb-1">💳 Método de Pago</p>
                              <p className="text-sm font-semibold text-navy-900 capitalize">{sale.payment_method}</p>
                              {sale.payment_reference && (
                                <p className="text-xs text-navy-500 mt-0.5">Ref: {sale.payment_reference}</p>
                              )}
                            </div>
                          )}

                          {/* Commission */}
                          {sale.commission_amount != null && sale.commission_amount > 0 && (
                            <div className="p-3 bg-gold-50 rounded-lg border border-gold-200">
                              <p className="text-xs text-gold-600 font-medium mb-1 flex items-center gap-1">
                                <Award className="w-3.5 h-3.5" /> Comisión: ${sale.commission_amount.toLocaleString()}
                              </p>
                            </div>
                          )}

                          {/* Documents for this sale */}
                          {sale.documents && sale.documents.length > 0 && (
                            <div>
                              <p className="text-xs font-semibold text-navy-600 mb-2 flex items-center gap-1">
                                <FileText className="w-3.5 h-3.5" /> Documentos de Transacción
                              </p>
                              <div className="space-y-1.5">
                                {sale.documents.map((doc) => (
                                  <a
                                    key={doc.id}
                                    href={doc.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center gap-3 p-2.5 bg-navy-50 rounded-lg hover:bg-navy-100 transition-colors text-sm"
                                  >
                                    <FileText className="w-4 h-4 text-navy-400" />
                                    <span className="flex-1 text-navy-700">{doc.doc_label}</span>
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                                      doc.transfer_type === 'purchase' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                                    }`}>
                                      {doc.transfer_type === 'purchase' ? 'Compra' : 'Venta'}
                                    </span>
                                    <ExternalLink className="w-3.5 h-3.5 text-navy-400" />
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Link to property */}
                          {sale.property_id && (
                            <Link 
                              href={`/homes/properties/${sale.property_id}`}
                              className="text-sm text-gold-600 hover:text-gold-700 flex items-center gap-1"
                            >
                              Ver propiedad completa →
                            </Link>
                          )}
                        </div>
                      )}
                    </div>
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

          {/* All Transaction Documents */}
          {documents.length > 0 && (
            <div className="card-luxury p-6">
              <h2 className="font-semibold text-navy-900 mb-4 flex items-center gap-2">
                <FileText className="w-5 h-5 text-gold-500" />
                Todos los Documentos
              </h2>
              <div className="space-y-2">
                {documents.map((doc) => (
                  <a
                    key={doc.id}
                    href={doc.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 p-3 bg-navy-50 rounded-lg hover:bg-navy-100 transition-colors"
                  >
                    <FileText className="w-5 h-5 text-navy-500" />
                    <div className="flex-1">
                      <span className="text-navy-700">{doc.doc_label}</span>
                      {doc.uploaded_at && (
                        <p className="text-xs text-navy-400">
                          Subido: {new Date(doc.uploaded_at).toLocaleDateString('es-MX')}
                        </p>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      doc.transfer_type === 'purchase' ? 'bg-blue-100 text-blue-600' : 'bg-emerald-100 text-emerald-600'
                    }`}>
                      {doc.transfer_type === 'purchase' ? 'Compra' : 'Venta'}
                    </span>
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
