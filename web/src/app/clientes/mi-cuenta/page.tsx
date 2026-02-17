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
  MessageCircle,
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
    const badges: Record<string, { bg: string; color: string; icon: typeof CheckCircle; label: string }> = {
      paid: { bg: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', icon: CheckCircle, label: 'Pagado' },
      completed: { bg: 'rgba(22, 163, 74, 0.1)', color: '#16a34a', icon: CheckCircle, label: 'Pagado' },
      rto_pending: { bg: 'var(--mn-blue-50)', color: 'var(--mn-blue)', icon: Clock, label: 'RTO - En revisión' },
      rto_approved: { bg: 'var(--mn-blue-50)', color: 'var(--mn-blue)', icon: CheckCircle, label: 'RTO - Aprobado' },
      rto_active: { bg: 'rgba(147, 51, 234, 0.1)', color: '#9333ea', icon: CheckCircle, label: 'RTO - Activo' },
      pending: { bg: 'rgba(234, 179, 8, 0.1)', color: '#b5850a', icon: Clock, label: 'Pendiente' },
      cancelled: { bg: 'rgba(185, 28, 28, 0.06)', color: '#b91c1c', icon: XCircle, label: 'Denegada' },
    }

    const badge = badges[status]
    if (!badge) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold" style={{ background: 'var(--mn-light)', color: 'var(--mn-gray)' }}>
          {status}
        </span>
      )
    }

    const Icon = badge.icon
    return (
      <span
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold"
        style={{ background: badge.bg, color: badge.color, fontFamily: "'Montserrat', sans-serif" }}
      >
        <Icon className="w-3 h-3" />
        {badge.label}
      </span>
    )
  }

  const getTitleStatus = (sale: Sale) => {
    const transfer = sale.title_transfers?.[0]
    
    if (!transfer) {
      return (
        <span className="inline-flex items-center gap-1 text-sm" style={{ color: 'var(--mn-gray)' }}>
          <Clock className="w-4 h-4" />
          Procesando
        </span>
      )
    }
    
    if (transfer.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1 text-sm font-semibold" style={{ color: '#16a34a' }}>
          <CheckCircle className="w-4 h-4" />
          Completado
        </span>
      )
    }
    
    return (
      <span className="inline-flex items-center gap-1 text-sm" style={{ color: '#b5850a' }}>
        <Clock className="w-4 h-4" />
        En proceso
      </span>
    )
  }

  if (authLoading || (client && salesLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--mn-blue)' }} />
        <p className="text-sm" style={{ color: 'var(--mn-gray)' }}>Cargando tu cuenta…</p>
      </div>
    )
  }

  if (!client) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--mn-light)' }}>
          <div className="max-w-md text-center p-8 mn-animate-fade-up">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5" style={{ background: 'rgba(234, 179, 8, 0.1)' }}>
              <AlertCircle className="w-8 h-8" style={{ color: '#b5850a' }} />
            </div>
            <h1
              className="text-xl font-black mb-2"
              style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
            >
              No encontramos tu cuenta
            </h1>
            <p className="mb-6" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
              {authError}
            </p>
            <div className="space-y-3">
              <Link
                href="/clientes/casas"
                className="block w-full btn-brand btn-brand-gold text-center !py-3"
              >
                Ver casas disponibles
              </Link>
              <button
                onClick={async () => { await signOut() }}
                className="block w-full btn-brand btn-brand-outline text-center !py-3"
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin" style={{ color: 'var(--mn-blue)' }} />
      </div>
    )
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--mn-light)' }}>

      {/* ═══════════ HEADER ═══════════ */}
      <section
        className="relative py-8 sm:py-12 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #00233d 0%, #004274 60%, #005a9e 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
          backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
          backgroundSize: '32px 32px'
        }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 sm:gap-5">
              <div
                className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(163,141,72,0.25)' }}
              >
                <User className="w-7 h-7 sm:w-8 sm:h-8" style={{ color: '#c4af6a' }} />
              </div>
              <div className="min-w-0">
                <h1
                  className="text-xl sm:text-2xl font-black text-white truncate"
                  style={{ fontFamily: "'Montserrat', sans-serif" }}
                >
                  Hola, {client.name.split(' ')[0]}
                </h1>
                <p className="text-white/50 text-sm truncate" style={{ fontFamily: "'Mulish', sans-serif" }}>
                  {client.email}
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors text-sm font-semibold"
              style={{ fontFamily: "'Montserrat', sans-serif" }}
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">

        {/* ═══════════ KYC BANNER ═══════════ */}
        {kycRequested && !kycVerified && (
          <div
            className="mb-8 rounded-2xl p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mn-animate-fade-up"
            style={{ background: 'linear-gradient(135deg, var(--mn-blue-50) 0%, rgba(163,141,72,0.08) 100%)', border: '1.5px solid var(--mn-blue-100)' }}
          >
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'var(--mn-blue)', color: 'white' }}
              >
                <ShieldCheck className="w-6 h-6 sm:w-7 sm:h-7" />
              </div>
              <div>
                <h3
                  className="font-bold text-base sm:text-lg"
                  style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  Verificación de Identidad Requerida
                </h3>
                <p className="text-sm" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                  Maninos Capital necesita que verifiques tu identidad para procesar tu solicitud.
                </p>
              </div>
            </div>
            <Link
              href="/clientes/mi-cuenta/verificacion"
              className="w-full sm:w-auto btn-brand btn-brand-primary flex items-center justify-center gap-2 !rounded-xl flex-shrink-0"
            >
              <ShieldCheck className="w-5 h-5" />
              Verificar Identidad
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-8">

          {/* ═══════════ MAIN CONTENT ═══════════ */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-2xl shadow-sm overflow-hidden" style={{ border: '1px solid var(--mn-light-200)' }}>
              <div className="p-5 sm:p-6 border-b" style={{ borderColor: 'var(--mn-light-200)' }}>
                <h2
                  className="text-lg font-bold flex items-center gap-2"
                  style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
                >
                  <Home className="w-5 h-5" style={{ color: 'var(--mn-blue)' }} />
                  Mis Compras
                </h2>
              </div>

              {sales.length === 0 ? (
                <div className="p-8 sm:p-12 text-center">
                  <div
                    className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-5"
                    style={{ background: 'var(--mn-blue-50)' }}
                  >
                    <Home className="w-8 h-8" style={{ color: 'var(--mn-blue)' }} />
                  </div>
                  <h3
                    className="font-bold mb-2"
                    style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    No tienes compras aún
                  </h3>
                  <p className="text-sm mb-6 max-w-sm mx-auto" style={{ color: 'var(--mn-gray)', fontFamily: "'Mulish', sans-serif" }}>
                    Explora nuestro catálogo y encuentra tu casa ideal
                  </p>
                  <Link
                    href="/clientes/casas"
                    className="inline-flex items-center gap-1 text-sm font-semibold hover:underline"
                    style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
                  >
                    Ver casas disponibles
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: 'var(--mn-light-200)' }}>
                  {sales.map(sale => (
                    <div key={sale.id} className="p-5 sm:p-6">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Property image */}
                        <div className="w-full sm:w-28 h-40 sm:h-28 rounded-xl overflow-hidden flex-shrink-0" style={{ background: 'var(--mn-light-200)' }}>
                          {sale.properties?.photos?.[0] ? (
                            <img
                              src={sale.properties.photos[0]}
                              alt={sale.properties.address}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <Home className="w-8 h-8" style={{ color: 'var(--mn-gray-light)' }} />
                            </div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <h3
                                className="font-bold truncate"
                                style={{ color: 'var(--mn-dark)', fontFamily: "'Montserrat', sans-serif" }}
                              >
                                {sale.properties?.address}
                              </h3>
                              <p className="text-sm flex items-center gap-1" style={{ color: 'var(--mn-gray)' }}>
                                <MapPin className="w-3 h-3 flex-shrink-0" />
                                {sale.properties?.city || 'Texas'}, {sale.properties?.state || 'TX'}
                              </p>
                            </div>
                            {getStatusBadge(sale)}
                          </div>

                          <div className="mt-3 flex items-center gap-5 text-sm flex-wrap">
                            <div>
                              <span style={{ color: 'var(--mn-gray)' }}>Precio:</span>
                              <span className="ml-1 font-bold" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
                                ${sale.sale_price?.toLocaleString()}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--mn-gray)' }}>Tipo:</span>
                              <span className={`ml-1 font-semibold`} style={{ color: sale.sale_type === 'rto' ? 'var(--mn-gold-dark)' : '#16a34a' }}>
                                {sale.sale_type === 'rto' ? 'Rent-to-Own' : 'Contado'}
                              </span>
                            </div>
                            <div>
                              <span style={{ color: 'var(--mn-gray)' }}>Fecha:</span>
                              <span className="ml-1" style={{ color: 'var(--mn-dark-600)' }}>
                                {new Date(sale.completed_at || sale.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>

                          {/* Denial message */}
                          {sale.status === 'cancelled' && (
                            <div
                              className="mt-4 p-4 rounded-xl"
                              style={{ background: 'rgba(185, 28, 28, 0.04)', border: '1px solid rgba(185, 28, 28, 0.12)' }}
                            >
                              <div className="flex items-start gap-3">
                                <XCircle className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#b91c1c' }} />
                                <div>
                                  <p className="font-bold text-sm" style={{ color: '#b91c1c', fontFamily: "'Montserrat', sans-serif" }}>
                                    Solicitud denegada
                                  </p>
                                  <p className="text-sm mt-1" style={{ color: '#dc2626' }}>
                                    {sale.rto_notes || 'Tu solicitud no fue aprobada en esta ocasión.'}
                                  </p>
                                  <p className="text-xs mt-2" style={{ color: 'var(--mn-gray)' }}>
                                    Puedes explorar otras casas disponibles o contactarnos para más información.
                                  </p>
                                  <Link
                                    href="/clientes/casas"
                                    className="inline-flex items-center gap-1 mt-3 text-sm font-semibold hover:underline"
                                    style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
                                  >
                                    Ver casas disponibles <ArrowRight className="w-3 h-3" />
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* RTO contract info */}
                          {sale.sale_type === 'rto' && sale.rto_monthly_payment && sale.status !== 'cancelled' && (
                            <div className="mt-3 p-3 rounded-xl" style={{ background: 'var(--mn-blue-50)' }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 text-sm">
                                  <DollarSign className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
                                  <span style={{ color: 'var(--mn-gray)' }}>Renta mensual:</span>
                                  <span className="font-bold" style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}>
                                    ${sale.rto_monthly_payment?.toLocaleString()}/mes
                                  </span>
                                </div>
                                {sale.rto_term_months && (
                                  <span className="text-xs" style={{ color: 'var(--mn-gray)' }}>{sale.rto_term_months} meses</span>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Title status + Documents / RTO link */}
                          {sale.status !== 'cancelled' && (
                            <div className="mt-3 pt-3 border-t flex items-center justify-between flex-wrap gap-2" style={{ borderColor: 'var(--mn-light-200)' }}>
                              <div className="flex items-center gap-2">
                                <FileText className="w-4 h-4" style={{ color: 'var(--mn-gray)' }} />
                                <span className="text-sm" style={{ color: 'var(--mn-gray)' }}>Título:</span>
                                {getTitleStatus(sale)}
                              </div>

                              <div className="flex items-center gap-3">
                                {sale.sale_type === 'rto' && (
                                  <Link
                                    href={`/clientes/mi-cuenta/rto/${sale.id}`}
                                    className="text-sm font-semibold flex items-center gap-1 hover:underline"
                                    style={{ color: 'var(--mn-blue)', fontFamily: "'Montserrat', sans-serif" }}
                                  >
                                    <TrendingUp className="w-4 h-4" />
                                    Ver contrato RTO
                                  </Link>
                                )}
                                {sale.status === 'paid' && (
                                  <Link
                                    href={`/clientes/mi-cuenta/documentos?sale=${sale.id}`}
                                    className="text-sm font-semibold flex items-center gap-1 hover:underline"
                                    style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
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

          {/* ═══════════ SIDEBAR ═══════════ */}
          <div className="lg:col-span-1 space-y-6">

            {/* Profile Card */}
            <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: '1px solid var(--mn-light-200)' }}>
              <h2
                className="font-bold text-sm uppercase tracking-wider mb-5"
                style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
              >
                Mi Información
              </h2>

              <div className="space-y-4">
                {[
                  { icon: User, label: 'Nombre', value: client.name },
                  { icon: Mail, label: 'Correo', value: client.email },
                  ...(client.phone ? [{ icon: Phone, label: 'Teléfono', value: client.phone }] : []),
                  ...(client.terreno ? [{ icon: MapPin, label: 'Terreno', value: client.terreno }] : []),
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--mn-blue-50)' }}>
                      <item.icon className="w-4 h-4" style={{ color: 'var(--mn-blue)' }} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: 'var(--mn-gray)', fontFamily: "'Montserrat', sans-serif" }}>
                        {item.label}
                      </p>
                      <p className="text-sm font-medium truncate" style={{ color: 'var(--mn-dark)' }}>
                        {item.value}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Help Card */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'linear-gradient(135deg, var(--mn-blue) 0%, var(--mn-blue-dark) 100%)' }}
            >
              <h2
                className="font-bold text-white mb-2"
                style={{ fontFamily: "'Montserrat', sans-serif" }}
              >
                ¿Necesitas ayuda?
              </h2>
              <p className="text-sm text-white/60 mb-5" style={{ fontFamily: "'Mulish', sans-serif" }}>
                Estamos aquí para ayudarte con cualquier pregunta.
              </p>

              <div className="space-y-2">
                <a
                  href="tel:+18327459600"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-colors"
                  style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontFamily: "'Montserrat', sans-serif" }}
                >
                  <Phone className="w-4 h-4" />
                  (832) 745-9600
                </a>
                <a
                  href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Tengo%20una%20pregunta"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm text-white transition-colors"
                  style={{ background: '#25d366', fontFamily: "'Montserrat', sans-serif" }}
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-2xl shadow-sm p-6" style={{ border: '1px solid var(--mn-light-200)' }}>
              <h2
                className="font-bold text-sm uppercase tracking-wider mb-4"
                style={{ color: 'var(--mn-gold)', fontFamily: "'Montserrat', sans-serif" }}
              >
                Enlaces rápidos
              </h2>

              <div className="space-y-1">
                {[
                  { href: '/clientes/casas', icon: Home, label: 'Ver más casas', color: 'var(--mn-blue)' },
                  { href: '/clientes/mi-cuenta/documentos', icon: FileText, label: 'Mis documentos', color: 'var(--mn-gold)' },
                ].map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 p-3 rounded-xl transition-all hover:shadow-sm group"
                    style={{ background: 'transparent' }}
                  >
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-110" style={{ background: 'var(--mn-blue-50)' }}>
                      <link.icon className="w-4 h-4" style={{ color: link.color }} />
                    </div>
                    <span className="text-sm font-medium" style={{ color: 'var(--mn-dark-600)', fontFamily: "'Mulish', sans-serif" }}>
                      {link.label}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--mn-gray)' }} />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
