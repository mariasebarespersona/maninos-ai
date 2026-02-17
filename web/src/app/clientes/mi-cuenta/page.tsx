'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  User, 
  Home, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  XCircle,
  LogOut,
  Phone,
  Mail,
  MapPin,
  Loader2,
  DollarSign,
  TrendingUp,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { useClientAuth } from '@/hooks/useClientAuth'

interface Sale {
  id: string
  property_id: string
  sale_type: 'contado' | 'rto'
  sale_price: number
  status: string
  payment_method: string
  rto_contract_id?: string
  rto_monthly_payment?: number
  rto_term_months?: number
  rto_notes?: string
  created_at: string
  completed_at: string
  properties: {
    address: string
    city: string
    state: string
    photos: string[]
  }
  title_transfers?: {
    id: string
    status: string
    transfer_date: string
  }[]
}

export default function ClientDashboard() {
  const { client, loading: authLoading, error: authError, signOut } = useClientAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [salesLoading, setSalesLoading] = useState(true)
  const [kycRequested, setKycRequested] = useState(false)
  const [kycVerified, setKycVerified] = useState(false)

  useEffect(() => {
    if (client) {
      fetchClientSales(client.id)
      fetchKycStatus(client.id)
    }
  }, [client])

  const fetchKycStatus = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/kyc-status`)
      const data = await res.json()
      if (data.ok) {
        setKycRequested(data.kyc_requested || false)
        setKycVerified(data.kyc_verified || false)
      }
    } catch (err) {
      console.error('Error fetching KYC status:', err)
    }
  }

  const fetchClientSales = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/purchases`)
      const data = await res.json()
      
      if (data.ok) {
        setSales(data.purchases || [])
      }
    } catch (error) {
      console.error('Error:', error)
    } finally {
      setSalesLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOut()
    toast.info('Sesión cerrada')
  }

  const getStatusBadge = (sale: Sale) => {
    const status = sale.status
    
    switch (status) {
      case 'paid':
      case 'completed':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            Pagado
          </span>
        )
      case 'rto_pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            RTO - En revisión
          </span>
        )
      case 'rto_approved':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            RTO - Aprobado
          </span>
        )
      case 'rto_active':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            RTO - Activo
          </span>
        )
      case 'pending':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            Pendiente
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" />
            Solicitud denegada
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
            {status}
          </span>
        )
    }
  }

  const getTitleStatus = (sale: Sale) => {
    const transfer = sale.title_transfers?.[0]
    
    if (!transfer) {
      return (
        <span className="inline-flex items-center gap-1 text-gray-500 text-sm">
          <Clock className="w-4 h-4" />
          Procesando
        </span>
      )
    }
    
    if (transfer.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 text-green-600 text-sm font-medium">
          <CheckCircle className="w-4 h-4" />
          Completado
        </span>
      )
    }
    
    return (
      <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
        <Clock className="w-4 h-4" />
        En proceso
      </span>
    )
  }

  if (authLoading || (client && salesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!client) {
    // If there's an auth error (e.g., user authenticated but no client record),
    // show a helpful message instead of a blank page
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="max-w-md text-center p-8">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-navy-900 mb-2">
              No encontramos tu cuenta
            </h1>
            <p className="text-gray-600 mb-6">
              {authError}
            </p>
            <div className="space-y-3">
              <Link
                href="/clientes/casas"
                className="block w-full bg-gold-500 text-navy-900 font-bold py-3 rounded-lg hover:bg-gold-400 transition-colors"
              >
                Ver casas disponibles
              </Link>
              <button
                onClick={async () => { await signOut(); }}
                className="block w-full border border-gray-300 text-gray-700 font-medium py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )
    }
    // useClientAuth will redirect to login if no user
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-navy-900 text-white">
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-gold-500 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-navy-900" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">Hola, {client.name.split(' ')[0]}</h1>
                <p className="text-gray-300">{client.email}</p>
              </div>
            </div>
            
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        {/* KYC Verification Banner */}
        {kycRequested && !kycVerified && (
          <div className="mb-6 bg-gradient-to-r from-gold-50 to-orange-50 border-2 border-gold-300 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-gold-100 rounded-full flex items-center justify-center flex-shrink-0">
                <ShieldCheck className="w-7 h-7 text-gold-700" />
              </div>
              <div>
                <h3 className="font-bold text-navy-900 text-lg">Verificación de Identidad Requerida</h3>
                <p className="text-gray-600">
                  Maninos Capital necesita que verifiques tu identidad para procesar tu solicitud RTO.
                </p>
              </div>
            </div>
            <Link
              href="/clientes/mi-cuenta/verificacion"
              className="inline-flex items-center gap-2 bg-gold-500 text-navy-900 px-6 py-3 rounded-lg font-bold hover:bg-gold-400 transition-all hover:scale-105 flex-shrink-0"
            >
              <ShieldCheck className="w-5 h-5" />
              Verificar Mi Identidad
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Purchases Section */}
            <div className="bg-white rounded-xl shadow-sm">
              <div className="p-6 border-b">
                <h2 className="text-xl font-bold text-navy-900 flex items-center gap-2">
                  <Home className="w-5 h-5 text-gold-600" />
                  Mis Compras
                </h2>
              </div>
              
              {sales.length === 0 ? (
                <div className="p-8 text-center">
                  <Home className="w-12 h-12 text-gray-300 mx-auto mb-4" />
                  <h3 className="font-semibold text-gray-700 mb-2">
                    No tienes compras aún
                  </h3>
                  <p className="text-gray-500 text-sm mb-4">
                    Explora nuestro catálogo y encuentra tu casa ideal
                  </p>
                  <Link
                    href="/clientes/casas"
                    className="inline-flex items-center gap-2 text-gold-600 hover:text-gold-700 font-medium"
                  >
                    Ver casas disponibles →
                  </Link>
                </div>
              ) : (
                <div className="divide-y">
                  {sales.map(sale => (
                    <div key={sale.id} className="p-6">
                      <div className="flex gap-4">
                        {/* Property image */}
                        <div className="w-24 h-24 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                          {sale.properties?.photos?.[0] ? (
                            <img
                              src={sale.properties.photos[0]}
                              alt={sale.properties.address}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Home className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                        </div>
                        
                        {/* Details */}
                        <div className="flex-1">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="font-semibold text-navy-900">
                                {sale.properties?.address}
                              </h3>
                              <p className="text-gray-500 text-sm">
                                {sale.properties?.city || 'Texas'}, {sale.properties?.state || 'TX'}
                              </p>
                            </div>
                            {getStatusBadge(sale)}
                          </div>
                          
                          <div className="mt-3 flex items-center gap-6 text-sm flex-wrap">
                            <div>
                              <span className="text-gray-500">Precio:</span>
                              <span className="ml-1 font-semibold text-gold-600">
                                ${sale.sale_price?.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Tipo:</span>
                              <span className={`ml-1 font-medium ${
                                sale.sale_type === 'rto' ? 'text-orange-600' : 'text-green-600'
                              }`}>
                                {sale.sale_type === 'rto' ? 'Rent-to-Own' : 'Contado'}
                              </span>
                            </div>
                            <div>
                              <span className="text-gray-500">Fecha:</span>
                              <span className="ml-1">
                                {new Date(sale.completed_at || sale.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                          
                          {/* Denial message */}
                          {sale.status === 'cancelled' && (
                            <div className="mt-3 p-4 bg-red-50 border border-red-200 rounded-lg">
                              <div className="flex items-start gap-3">
                                <XCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                                <div>
                                  <p className="font-semibold text-red-800 text-sm">Solicitud denegada</p>
                                  <p className="text-sm text-red-700 mt-1">
                                    {sale.rto_notes || 'Tu solicitud no fue aprobada en esta ocasión.'}
                                  </p>
                                  <p className="text-xs text-red-600 mt-2">
                                    Puedes explorar otras casas disponibles o contactarnos para más información.
                                  </p>
                                  <Link
                                    href="/clientes/casas"
                                    className="inline-flex items-center gap-1 mt-3 text-sm font-medium text-gold-600 hover:text-gold-700"
                                  >
                                    Ver casas disponibles <ArrowRight className="w-3 h-3" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* RTO contract info */}
                          {sale.sale_type === 'rto' && sale.rto_monthly_payment && sale.status !== 'cancelled' && (
                            <div className="mt-3 p-3 bg-orange-50 rounded-lg">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  <DollarSign className="w-4 h-4 text-orange-600" />
                                  <span className="text-gray-600">Renta mensual:</span>
                                  <span className="font-bold text-orange-600">${sale.rto_monthly_payment?.toLocaleString()}/mes</span>
                                </div>
                                {sale.rto_term_months && (
                                  <span className="text-xs text-gray-500">{sale.rto_term_months} meses</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Title status + Documents / RTO link (hidden if cancelled) */}
                          {sale.status !== 'cancelled' && (
                            <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4 text-gray-400" />
                                <span className="text-sm text-gray-600">Título:</span>
                                {getTitleStatus(sale)}
                              </div>
                              
                              <div className="flex items-center gap-3">
                                {sale.sale_type === 'rto' && (
                                  <Link
                                    href={`/clientes/mi-cuenta/rto/${sale.id}`}
                                    className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1"
                                  >
                                    <TrendingUp className="w-4 h-4" />
                                    Ver contrato RTO
                                  </Link>
                                )}
                                {sale.status === 'paid' && (
                                  <Link
                                    href={`/clientes/mi-cuenta/documentos?sale=${sale.id}`}
                                    className="text-sm text-gold-600 hover:text-gold-700 font-medium flex items-center gap-1"
                                  >
                                    <FileText className="w-4 h-4" />
                                    Ver documentos
                                  </Link>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Sidebar */}
          <div className="lg:col-span-1 space-y-6">
            {/* Profile Card */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-semibold text-navy-900 mb-4">Mi Información</h2>
              
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <User className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Nombre</p>
                    <p className="font-medium text-navy-900">{client.name}</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-gray-400" />
                  <div>
                    <p className="text-sm text-gray-500">Correo</p>
                    <p className="font-medium text-navy-900">{client.email}</p>
                  </div>
                </div>
                
                {client.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Teléfono</p>
                      <p className="font-medium text-navy-900">{client.phone}</p>
                    </div>
                  </div>
                )}
                
                {client.terreno && (
                  <div className="flex items-center gap-3">
                    <MapPin className="w-5 h-5 text-gray-400" />
                    <div>
                      <p className="text-sm text-gray-500">Terreno</p>
                      <p className="font-medium text-navy-900">{client.terreno}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Help Card */}
            <div className="bg-gold-50 rounded-xl p-6">
              <h2 className="font-semibold text-navy-900 mb-2">¿Necesitas ayuda?</h2>
              <p className="text-gray-600 text-sm mb-4">
                Estamos aquí para ayudarte con cualquier pregunta sobre tu compra.
              </p>
              
              <a
                href="tel:+18327459600"
                className="flex items-center justify-center gap-2 bg-navy-900 text-white py-3 rounded-lg font-medium hover:bg-navy-800 transition-colors"
              >
                <Phone className="w-5 h-5" />
                (832) 745-9600
              </a>
            </div>
            
            {/* Quick Links */}
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h2 className="font-semibold text-navy-900 mb-4">Enlaces rápidos</h2>
              
              <div className="space-y-2">
                <Link
                  href="/clientes/casas"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <Home className="w-5 h-5 text-gold-600" />
                  <span className="text-gray-700">Ver más casas</span>
                </Link>
                
                <Link
                  href="/clientes/mi-cuenta/documentos"
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <FileText className="w-5 h-5 text-gold-600" />
                  <span className="text-gray-700">Mis documentos</span>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
