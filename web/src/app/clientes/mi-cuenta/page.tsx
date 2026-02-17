'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  User, Home, FileText, Clock, CheckCircle, AlertCircle,
  XCircle, LogOut, Phone, Mail, MapPin, Loader2,
  DollarSign, TrendingUp, ShieldCheck, ArrowRight, MessageCircle,
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
    } catch (err) { console.error('Error fetching KYC status:', err) }
  }

  const fetchClientSales = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/purchases`)
      const data = await res.json()
      if (data.ok) setSales(data.purchases || [])
    } catch (error) { console.error('Error:', error) }
    finally { setSalesLoading(false) }
  }

  const handleLogout = async () => {
    await signOut()
    toast.info('Sesión cerrada')
  }

  const getStatusBadge = (sale: Sale) => {
    const badges: Record<string, { bg: string; text: string; icon: typeof CheckCircle; label: string }> = {
      paid: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle, label: 'Pagado' },
      completed: { bg: 'bg-green-50', text: 'text-green-700', icon: CheckCircle, label: 'Pagado' },
      rto_pending: { bg: 'bg-blue-50', text: 'text-blue-700', icon: Clock, label: 'En revisión' },
      rto_approved: { bg: 'bg-blue-50', text: 'text-blue-700', icon: CheckCircle, label: 'Aprobado' },
      rto_active: { bg: 'bg-purple-50', text: 'text-purple-700', icon: CheckCircle, label: 'RTO Activo' },
      pending: { bg: 'bg-yellow-50', text: 'text-yellow-700', icon: Clock, label: 'Pendiente' },
      cancelled: { bg: 'bg-red-50', text: 'text-red-700', icon: XCircle, label: 'Denegada' },
    }
    const badge = badges[sale.status]
    if (!badge) return <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded-full">{sale.status}</span>
    const Icon = badge.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        <Icon className="w-3 h-3" /> {badge.label}
      </span>
    )
  }

  if (authLoading || (client && salesLoading)) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        <p className="text-sm text-gray-400">Cargando tu cuenta…</p>
      </div>
    )
  }

  if (!client) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="max-w-md text-center p-8">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h1 className="text-[20px] font-bold text-[#222] mb-2" style={{ letterSpacing: '-0.02em' }}>No encontramos tu cuenta</h1>
            <p className="text-[15px] text-[#717171] mb-6">{authError}</p>
            <div className="flex flex-col gap-2">
              <Link href="/clientes/casas" className="px-6 py-3 rounded-xl bg-[#222] text-white font-semibold text-[14px] text-center">
                Ver casas disponibles
              </Link>
              <button onClick={async () => { await signOut() }} className="px-6 py-3 rounded-xl border border-gray-300 text-[14px] font-medium text-center hover:bg-gray-50">
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── HEADER ── Clean, light */}
      <section className="bg-white border-b border-gray-200 py-6 sm:py-8">
        <div className="max-w-6xl mx-auto px-6 sm:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-[#004274] flex items-center justify-center text-white font-bold text-[18px]" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                {client.name.charAt(0).toUpperCase()}
              </div>
              <div>
                <h1 className="text-[20px] font-bold text-[#222]" style={{ letterSpacing: '-0.02em' }}>
                  Hola, {client.name.split(' ')[0]}
                </h1>
                <p className="text-[13px] text-[#717171]">{client.email}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-[#717171] hover:text-[#222] hover:bg-gray-100 transition-colors text-[13px]"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Cerrar sesión</span>
            </button>
          </div>
        </div>
      </section>

      <div className="max-w-6xl mx-auto px-6 sm:px-8 py-6 sm:py-8">

        {/* ═══════════ KYC BANNER ═══════════ */}
        {kycRequested && !kycVerified && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-[#004274] flex-shrink-0" />
              <div>
                <h3 className="font-bold text-[#222] text-[14px]" style={{ letterSpacing: '-0.015em' }}>Verificación de Identidad Requerida</h3>
                <p className="text-[12px] text-[#484848]">Maninos Capital necesita que verifiques tu identidad.</p>
              </div>
            </div>
            <Link
              href="/clientes/mi-cuenta/verificacion"
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-[13px] font-semibold bg-[#004274] hover:bg-[#00233d] transition-colors"
            >
              <ShieldCheck className="w-4 h-4" />
              Verificar <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        )}

        <div className="grid lg:grid-cols-3 gap-6">

          {/* ═══════════ MAIN — Purchases ═══════════ */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-2">
                <Home className="w-5 h-5 text-[#717171]" />
                <h2 className="font-bold text-[16px] text-[#222]" style={{ letterSpacing: '-0.015em' }}>Mis Compras</h2>
              </div>

              {sales.length === 0 ? (
                <div className="p-10 text-center">
                  <Home className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="font-bold text-[16px] text-[#222] mb-1" style={{ letterSpacing: '-0.015em' }}>No tienes compras aún</h3>
                  <p className="text-[14px] text-[#717171] mb-4">Explora nuestro catálogo y encuentra tu casa ideal</p>
                  <Link href="/clientes/casas" className="text-[13px] font-semibold text-[#004274] hover:underline inline-flex items-center gap-1">
                    Ver casas disponibles <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-gray-100">
                  {sales.map(sale => (
                    <div key={sale.id} className="p-5">
                      <div className="flex flex-col sm:flex-row gap-4">
                        {/* Photo */}
                        <div className="w-full sm:w-24 h-36 sm:h-24 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                          {sale.properties?.photos?.[0] ? (
                            <img src={sale.properties.photos[0]} alt={sale.properties.address} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><Home className="w-8 h-8 text-gray-300" /></div>
                          )}
                        </div>

                        {/* Details */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="min-w-0">
                              <h3 className="font-semibold text-[14px] text-[#222] truncate" style={{ letterSpacing: '-0.01em' }}>{sale.properties?.address}</h3>
                              <p className="text-[12px] text-[#717171] flex items-center gap-1">
                                <MapPin className="w-3 h-3" />
                                {sale.properties?.city || 'Texas'}, {sale.properties?.state || 'TX'}
                              </p>
                            </div>
                            {getStatusBadge(sale)}
                          </div>

                          <div className="flex items-center gap-4 text-[13px] mt-2 flex-wrap">
                            <span className="text-[#717171]">Precio: <strong className="text-[#222] font-semibold" style={{ fontVariantNumeric: 'tabular-nums' }}>${sale.sale_price?.toLocaleString()}</strong></span>
                            <span className="text-[#717171]">Tipo: <strong className={`font-semibold ${sale.sale_type === 'rto' ? 'text-[#004274]' : 'text-green-600'}`}>{sale.sale_type === 'rto' ? 'RTO' : 'Contado'}</strong></span>
                            <span className="text-[#b0b0b0] text-[12px]">{new Date(sale.completed_at || sale.created_at).toLocaleDateString()}</span>
                          </div>

                          {/* Denial message */}
                          {sale.status === 'cancelled' && (
                            <div className="mt-3 p-3 rounded-lg bg-red-50 border border-red-100">
                              <div className="flex items-start gap-2">
                                <XCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                                <div>
                                  <p className="font-semibold text-[13px] text-red-700">Solicitud denegada</p>
                                  <p className="text-[12px] text-red-600 mt-0.5">{sale.rto_notes || 'Tu solicitud no fue aprobada.'}</p>
                                  <Link href="/clientes/casas" className="text-[12px] font-medium text-red-700 underline mt-1 inline-block">
                                    Ver casas disponibles
                                  </Link>
                                </div>
                              </div>
                            </div>
                          )}

                          {/* RTO info */}
                          {sale.sale_type === 'rto' && sale.rto_monthly_payment && sale.status !== 'cancelled' && (
                            <div className="mt-3 p-3 rounded-lg bg-blue-50 flex items-center justify-between">
                              <div className="flex items-center gap-2 text-[14px]">
                                <DollarSign className="w-4 h-4 text-[#004274]" />
                                <span className="text-[#484848]">Mensual:</span>
                                <span className="font-semibold text-[#004274]" style={{ fontVariantNumeric: 'tabular-nums' }}>${sale.rto_monthly_payment?.toLocaleString()}/mes</span>
                              </div>
                              {sale.rto_term_months && <span className="text-[12px] text-[#717171]">{sale.rto_term_months} meses</span>}
                            </div>
                          )}

                          {/* Links */}
                          {sale.status !== 'cancelled' && (
                            <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-4 flex-wrap">
                              {sale.sale_type === 'rto' && (
                                <Link href={`/clientes/mi-cuenta/rto/${sale.id}`} className="text-[12px] font-semibold text-[#004274] hover:underline flex items-center gap-1">
                                  <TrendingUp className="w-3.5 h-3.5" /> Ver contrato RTO
                                </Link>
                              )}
                              {sale.status === 'paid' && (
                                <Link href={`/clientes/mi-cuenta/documentos?sale=${sale.id}`} className="text-[12px] font-semibold text-[#717171] hover:underline flex items-center gap-1">
                                  <FileText className="w-3.5 h-3.5" /> Ver documentos
                                </Link>
                              )}
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
          <div className="space-y-4">

            {/* Profile */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-4" style={{ letterSpacing: '-0.015em' }}>Mi Información</h2>
              <div className="space-y-3">
                {[
                  { icon: User, label: client.name },
                  { icon: Mail, label: client.email },
                  ...(client.phone ? [{ icon: Phone, label: client.phone }] : []),
                  ...(client.terreno ? [{ icon: MapPin, label: client.terreno }] : []),
                ].map((item, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <item.icon className="w-4 h-4 text-[#b0b0b0]" />
                    <span className="text-[14px] text-[#484848] truncate">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Help */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>¿Necesitas ayuda?</h2>
              <p className="text-[12px] text-[#717171] mb-4">Estamos aquí para ayudarte.</p>
              <div className="space-y-2">
                <a
                  href="tel:+18327459600"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[13px] font-semibold text-[#222] border border-gray-200 hover:bg-gray-50 transition-colors"
                >
                  <Phone className="w-4 h-4" /> (832) 745-9600
                </a>
                <a
                  href="https://api.whatsapp.com/send?phone=+18327459600&text=Hola!%20Tengo%20una%20pregunta"
                  target="_blank" rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-lg text-[13px] font-semibold text-white transition-colors"
                  style={{ background: '#25d366' }}
                >
                  <MessageCircle className="w-4 h-4" /> WhatsApp
                </a>
              </div>
            </div>

            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-bold text-[14px] text-[#222] mb-3" style={{ letterSpacing: '-0.015em' }}>Enlaces rápidos</h2>
              <div className="space-y-1">
                {[
                  { href: '/clientes/casas', icon: Home, label: 'Ver más casas' },
                  { href: '/clientes/mi-cuenta/documentos', icon: FileText, label: 'Mis documentos' },
                ].map(link => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="flex items-center gap-3 p-2.5 rounded-lg text-[14px] text-[#484848] hover:bg-gray-50 hover:text-[#222] transition-colors group"
                  >
                    <link.icon className="w-4 h-4 text-gray-400 group-hover:text-[#004274]" />
                    {link.label}
                    <ArrowRight className="w-3.5 h-3.5 ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-gray-400" />
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
