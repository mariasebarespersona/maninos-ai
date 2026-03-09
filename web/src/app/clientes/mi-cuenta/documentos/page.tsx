'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  FileText,
  Download,
  Home,
  CheckCircle,
  Clock,
  Loader2,
  ShieldCheck,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  FileCheck
} from 'lucide-react'
import { useClientAuth } from '@/hooks/useClientAuth'
import BillOfSaleTemplate from '@/components/BillOfSaleTemplate'
import TitleApplicationTemplate from '@/components/TitleApplicationTemplate'

// ─── Types ──────────────────────────────────────────────────────────────────

interface SaleDocument {
  name: string
  doc_type: string
  file_url: string
  uploaded_at: string | null
  source: string
}

interface PropertyDetails {
  address: string
  city: string
  state: string
  bedrooms: number
  bathrooms: number
  square_feet: number
  year: number
  hud_number: string
  width_ft: number
  length_ft: number
}

interface ClientInfo {
  name: string
  phone: string
  email: string
}

interface Sale {
  id: string
  sale_type: string
  sale_price: number
  property_details: PropertyDetails
  client_info: ClientInfo
  title_status: string
  documents: SaleDocument[]
}

// ─── Collapsible Section ────────────────────────────────────────────────────

function CollapsibleSection({
  title,
  icon,
  defaultOpen = false,
  children,
}: {
  title: string
  icon: React.ReactNode
  defaultOpen?: boolean
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          {icon}
          <span className="font-semibold text-[#004274]">{title}</span>
        </div>
        {open ? (
          <ChevronUp className="w-5 h-5 text-gray-400" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-gray-100">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Title Status Card ──────────────────────────────────────────────────────

function TitleStatusCard({
  titleStatus,
  documents,
}: {
  titleStatus: string
  documents: SaleDocument[]
}) {
  const titleDoc = documents.find(
    (d) => d.doc_type === 'title' || d.doc_type === 'titulo'
  )

  if (titleStatus === 'completed') {
    return (
      <div className="p-6 bg-emerald-50 border border-emerald-200 rounded-xl">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
            <CheckCircle className="w-6 h-6 text-emerald-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-emerald-900 text-lg mb-1">
              Tu titulo esta listo
            </h3>
            <p className="text-emerald-700 text-sm mb-4">
              Felicidades, el cambio de titulo de tu casa esta completo. Ya puedes descargar tu titulo oficial.
            </p>
            {titleDoc && (
              <a
                href={titleDoc.file_url}
                download
                className="inline-flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-emerald-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Descargar Titulo
              </a>
            )}
          </div>
        </div>
      </div>
    )
  }

  // In progress / pending
  const progressLabel =
    titleStatus === 'in_progress' ? 'En proceso' : 'Pendiente'
  const progressWidth =
    titleStatus === 'in_progress' ? 'w-1/2' : 'w-1/6'

  return (
    <div className="p-6 bg-blue-50 border border-blue-200 rounded-xl">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
          <Clock className="w-6 h-6 text-[#004274]" />
        </div>
        <div className="flex-1">
          <h3 className="font-bold text-[#004274] text-lg mb-1">
            Tu titulo esta en proceso
          </h3>
          <p className="text-blue-700 text-sm mb-4">
            Estamos trabajando en la transferencia de titulo. Te notificaremos cuando este listo.
          </p>
          <div className="flex items-center gap-3">
            <div className="flex-1 bg-blue-200 rounded-full h-2.5 overflow-hidden">
              <div
                className={`${progressWidth} bg-[#004274] h-full rounded-full transition-all`}
              />
            </div>
            <span className="text-xs font-medium text-[#004274] whitespace-nowrap">
              {progressLabel}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Sale Section ───────────────────────────────────────────────────────────

function ContadoSaleSection({ sale }: { sale: Sale }) {
  const { property_details: pd, client_info: ci } = sale
  const today = new Date().toISOString().split('T')[0]

  const dimensionsStr =
    pd.width_ft && pd.length_ft
      ? `${pd.width_ft} x ${pd.length_ft}`
      : pd.square_feet
        ? `${pd.square_feet} sqft`
        : ''

  return (
    <div className="space-y-4">
      {/* Property header card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0">
            <Home className="w-6 h-6 text-[#004274]" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-[#004274] text-lg truncate">
              {pd.address}
            </h2>
            <p className="text-sm text-gray-500">
              {pd.city && `${pd.city}, `}
              {pd.state || 'TX'}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="font-bold text-[#004274] text-lg">
              ${sale.sale_price?.toLocaleString()}
            </p>
            {sale.title_status === 'completed' ? (
              <span className="inline-flex items-center gap-1 text-emerald-600 text-xs font-medium">
                <CheckCircle className="w-3.5 h-3.5" />
                Titulo listo
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-medium">
                <Clock className="w-3.5 h-3.5" />
                Titulo en proceso
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Section 1: Bill of Sale */}
      <CollapsibleSection
        title="Bill of Sale"
        icon={<FileText className="w-5 h-5 text-[#004274]" />}
        defaultOpen={false}
      >
        <div className="p-1">
          <BillOfSaleTemplate
            readOnly={true}
            transactionType="sale"
            initialData={{
              seller_name: 'MANINOS HOMES',
              buyer_name: ci.name || '',
              buyer_phone: ci.phone || '',
              buyer_email: ci.email || '',
              buyer_date: today,
              location_of_home: pd.address
                ? `${pd.address}, ${pd.city || ''}, ${pd.state || 'TX'}`
                : '',
              bedrooms: pd.bedrooms?.toString() || '',
              baths: pd.bathrooms?.toString() || '',
              dimensions: dimensionsStr,
              hud_label_number: pd.hud_number || '',
              is_used: true,
              is_new: false,
              total: `$${sale.sale_price?.toLocaleString() || ''}`,
              total_payment: `$${sale.sale_price?.toLocaleString() || ''}`,
              date_manufactured: pd.year?.toString() || '',
            }}
          />
        </div>
      </CollapsibleSection>

      {/* Section 2: Aplicacion Cambio de Titulo */}
      <CollapsibleSection
        title="Aplicacion Cambio de Titulo"
        icon={<FileCheck className="w-5 h-5 text-[#004274]" />}
        defaultOpen={false}
      >
        <div className="p-1">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm text-amber-800">
              Puedes llenar esta aplicacion digitalmente o imprimirla y llenarla a mano. Este documento es necesario para el cambio de titulo.
            </p>
          </div>
          <TitleApplicationTemplate
            readOnly={false}
            transactionType="sale"
            initialData={{
              seller_name: 'MANINOS HOMES LLC',
              buyer_name: ci.name || '',
              buyer_phone: ci.phone || '',
              location_address: pd.address || '',
              location_city: pd.city || '',
              location_state: pd.state || 'TX',
              tx_personal_used: true,
              is_used: true,
              is_sale: true,
            }}
          />
        </div>
      </CollapsibleSection>

      {/* Section 3: Titulo */}
      <CollapsibleSection
        title="Titulo"
        icon={<ShieldCheck className="w-5 h-5 text-[#004274]" />}
        defaultOpen={sale.title_status === 'completed'}
      >
        <div className="p-5">
          <TitleStatusCard
            titleStatus={sale.title_status}
            documents={sale.documents || []}
          />
        </div>
      </CollapsibleSection>
    </div>
  )
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ClientDocumentsPage() {
  const searchParams = useSearchParams()
  const selectedSaleId = searchParams.get('sale')

  const { client, loading: authLoading, error: authError } = useClientAuth()
  const [sales, setSales] = useState<Sale[]>([])
  const [docsLoading, setDocsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (client) {
      fetchDocuments(client.id)
    }
  }, [client])

  const fetchDocuments = async (clientId: string) => {
    try {
      const res = await fetch(`/api/public/clients/${clientId}/documents`)
      const data = await res.json()

      if (data.ok) {
        setSales(data.sales || [])
      } else {
        setError(data.detail || data.error || 'Error cargando documentos')
      }
    } catch (err) {
      console.error('Error:', err)
      setError('Error de conexion')
    } finally {
      setDocsLoading(false)
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (authLoading || (client && docsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-[#004274] mx-auto mb-3" />
          <p className="text-gray-500">Cargando documentos...</p>
        </div>
      </div>
    )
  }

  // ── Auth error ────────────────────────────────────────────────────────────
  if (!client) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="max-w-md text-center p-8">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-[#004274] mb-2">
              No encontramos tu cuenta
            </h1>
            <p className="text-gray-600 mb-6">{authError}</p>
            <Link
              href="/clientes/login"
              className="block w-full bg-[#004274] text-white font-bold py-3 rounded-lg hover:bg-[#003560] transition-colors"
            >
              Iniciar sesion
            </Link>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-[#004274]" />
      </div>
    )
  }

  // ── Derived state ─────────────────────────────────────────────────────────
  const contadoSales = sales.filter((s) => s.sale_type === 'contado')
  const hasCompletedTitle = sales.some((s) => s.title_status === 'completed')

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link
            href="/clientes/mi-cuenta"
            className="inline-flex items-center gap-2 text-gray-600 hover:text-[#004274] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Mi Cuenta
          </Link>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Page title */}
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-[#004274] flex items-center gap-2">
              <FileText className="w-6 h-6" />
              Mis Documentos
            </h1>
            <p className="text-gray-500 mt-1">
              Aqui puedes ver, descargar e imprimir los documentos de tu compra.
            </p>
          </div>

          {/* Green banner when any title is completed */}
          {hasCompletedTitle && (
            <div className="mb-6 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                <CheckCircle className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="font-semibold text-emerald-900">
                  Titulo completado
                </p>
                <p className="text-sm text-emerald-700">
                  Uno o mas de tus titulos estan listos para descargar. Revisa la seccion de Titulo abajo.
                </p>
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {sales.length === 0 && !error ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                No hay documentos disponibles
              </h2>
              <p className="text-gray-500 mb-6">
                Los documentos de tus compras apareceran aqui una vez que esten
                listos.
              </p>
              <Link
                href="/clientes/mi-cuenta"
                className="text-[#004274] hover:underline font-medium"
              >
                Volver a Mi Cuenta
              </Link>
            </div>
          ) : (
            <div className="space-y-10">
              {contadoSales.map((sale) => (
                <div
                  key={sale.id}
                  className={
                    selectedSaleId === sale.id
                      ? 'ring-2 ring-[#004274] ring-offset-4 rounded-xl'
                      : ''
                  }
                >
                  <ContadoSaleSection sale={sale} />
                </div>
              ))}

              {/* Non-contado sales - show a simple card with existing documents */}
              {sales
                .filter((s) => s.sale_type !== 'contado')
                .map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-white rounded-xl shadow-sm border border-gray-100 p-5"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center">
                        <Home className="w-6 h-6 text-[#004274]" />
                      </div>
                      <div className="flex-1">
                        <h2 className="font-bold text-[#004274]">
                          {sale.property_details?.address || 'Propiedad'}
                        </h2>
                        <p className="text-sm text-gray-500">
                          {sale.sale_type === 'rto'
                            ? 'Renta con opcion a compra'
                            : sale.sale_type}
                        </p>
                      </div>
                    </div>
                    {sale.documents?.length > 0 ? (
                      <div className="divide-y border rounded-lg overflow-hidden">
                        {sale.documents.map((doc, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <FileText className="w-4 h-4 text-gray-400" />
                              <span className="text-sm font-medium text-gray-700">
                                {doc.name}
                              </span>
                            </div>
                            {doc.file_url && (
                              <a
                                href={doc.file_url}
                                download
                                className="p-2 text-gray-400 hover:text-[#004274] transition-colors"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-400 text-center py-4">
                        Los documentos apareceran aqui cuando esten listos.
                      </p>
                    )}
                  </div>
                ))}
            </div>
          )}

          {/* Info box */}
          <div className="mt-10 bg-blue-50 border border-blue-100 rounded-xl p-6">
            <h3 className="font-semibold text-[#004274] mb-3">
              Sobre tus documentos
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  El <strong>Bill of Sale</strong> es tu comprobante de compra.
                  Puedes imprimirlo desde esta pagina.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <FileCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  La <strong>Aplicacion Cambio de Titulo</strong> es necesaria
                  para transferir el titulo a tu nombre. Puedes llenarla aqui o
                  imprimirla y llenarla a mano.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>
                  El <strong>Titulo</strong> estara disponible una vez
                  completada la transferencia.
                </span>
              </li>
            </ul>
          </div>

          {/* Contact CTA */}
          <div className="mt-6 text-center pb-8">
            <p className="text-gray-500 text-sm mb-2">
              Tienes preguntas sobre tus documentos?
            </p>
            <a
              href="tel:+18327459600"
              className="inline-flex items-center gap-2 text-[#004274] font-medium hover:underline transition-colors"
            >
              Llamanos al (832) 745-9600
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
