'use client'

export const dynamic = 'force-dynamic'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft,
  FileText, 
  Download, 
  Eye,
  Home,
  CheckCircle,
  Clock,
  Loader2,
  File,
  ShieldCheck,
  AlertCircle
} from 'lucide-react'
import { useClientAuth } from '@/hooks/useClientAuth'

interface Document {
  id: string
  doc_type: string
  doc_label: string
  file_name: string | null
  file_url: string
  uploaded_at: string | null
  source: 'sale' | 'purchase'
}

interface Sale {
  id: string
  property_address: string
  property_city: string
  property_state: string
  sale_price: number
  completed_at: string
  title_status: string
  documents: Document[]
}

export default function ClientDocumentsPage() {
  const searchParams = useSearchParams()
  const selectedSaleId = searchParams.get('sale')
  
  const { client, loading: authLoading, error: authError, signOut } = useClientAuth()
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
      setError('Error de conexión')
    } finally {
      setDocsLoading(false)
    }
  }

  const getDocTypeIcon = (docType: string, source: string) => {
    if (docType.includes('title')) {
      return <ShieldCheck className="w-5 h-5 text-emerald-600" />
    }
    if (docType === 'bill_of_sale') {
      return <FileText className="w-5 h-5 text-blue-600" />
    }
    return <File className="w-5 h-5 text-gray-500" />
  }

  const getSourceBadge = (source: string) => {
    if (source === 'purchase') {
      return (
        <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
          Documento original
        </span>
      )
    }
    return (
      <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">
        Tu compra
      </span>
    )
  }

  if (authLoading || (client && docsLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500 mx-auto mb-3" />
          <p className="text-gray-500">Cargando documentos...</p>
        </div>
      </div>
    )
  }

  if (!client) {
    if (authError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50">
          <div className="max-w-md text-center p-8">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <h1 className="text-xl font-bold text-navy-900 mb-2">
              No encontramos tu cuenta
            </h1>
            <p className="text-gray-600 mb-6">{authError}</p>
            <Link
              href="/clientes/login"
              className="block w-full bg-gold-500 text-navy-900 font-bold py-3 rounded-lg hover:bg-gold-400 transition-colors"
            >
              Iniciar sesión
            </Link>
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link 
            href="/clientes/mi-cuenta"
            className="flex items-center gap-2 text-gray-600 hover:text-navy-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a Mi Cuenta
          </Link>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-bold text-navy-900 mb-2 flex items-center gap-2">
            <FileText className="w-6 h-6 text-gold-600" />
            Mis Documentos
          </h1>
          <p className="text-gray-600 mb-8">
            Aquí puedes ver y descargar todos los documentos relacionados con tus compras.
          </p>

          {/* Error state */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
              <div className="flex items-center gap-3 text-red-700">
                <AlertCircle className="w-5 h-5" />
                <p>{error}</p>
              </div>
            </div>
          )}
          
          {sales.length === 0 && !error ? (
            <div className="bg-white rounded-xl shadow-sm p-12 text-center">
              <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                No hay documentos disponibles
              </h2>
              <p className="text-gray-500 mb-6">
                Los documentos de tus compras aparecerán aquí una vez que estén listos.
              </p>
              <Link
                href="/clientes/mi-cuenta"
                className="text-gold-600 hover:text-gold-700 font-medium"
              >
                ← Volver a Mi Cuenta
              </Link>
            </div>
          ) : (
            <div className="space-y-6">
              {sales.map(sale => (
                <div 
                  key={sale.id} 
                  className={`bg-white rounded-xl shadow-sm overflow-hidden transition-all ${
                    selectedSaleId === sale.id ? 'ring-2 ring-gold-500 shadow-md' : ''
                  }`}
                >
                  {/* Property header */}
                  <div className="p-6 bg-gradient-to-r from-gray-50 to-white border-b">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-gold-100 rounded-lg flex items-center justify-center">
                        <Home className="w-6 h-6 text-gold-600" />
                      </div>
                      <div className="flex-1">
                        <h2 className="font-semibold text-navy-900">
                          {sale.property_address}
                        </h2>
                        <p className="text-sm text-gray-500">
                          {sale.property_city && `${sale.property_city}, `}{sale.property_state || 'TX'}
                          {sale.completed_at && ` • Comprado el ${new Date(sale.completed_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gold-600">
                          ${sale.sale_price?.toLocaleString()}
                        </p>
                        {sale.title_status === 'completed' ? (
                          <span className="inline-flex items-center gap-1 text-green-600 text-sm">
                            <CheckCircle className="w-4 h-4" />
                            Título listo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-yellow-600 text-sm">
                            <Clock className="w-4 h-4" />
                            Título en proceso
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Documents list */}
                  <div className="divide-y">
                    {sale.documents?.length > 0 ? (
                      sale.documents.map(doc => (
                        <div key={doc.id} className="p-4 flex items-center gap-4 hover:bg-gray-50 transition-colors">
                          <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center flex-shrink-0">
                            {getDocTypeIcon(doc.doc_type, doc.source)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-navy-900">
                                {doc.doc_label}
                              </p>
                              {getSourceBadge(doc.source)}
                            </div>
                            <p className="text-sm text-gray-500 truncate">
                              {doc.file_name || 'Documento'}
                              {doc.uploaded_at && ` • ${new Date(doc.uploaded_at).toLocaleDateString()}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <a
                              href={doc.file_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 text-gray-500 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition-colors"
                              title="Ver documento"
                            >
                              <Eye className="w-5 h-5" />
                            </a>
                            <a
                              href={doc.file_url}
                              download
                              className="p-2 text-gray-500 hover:text-gold-600 hover:bg-gold-50 rounded-lg transition-colors"
                              title="Descargar"
                            >
                              <Download className="w-5 h-5" />
                            </a>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-8 text-center text-gray-500">
                        <Clock className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                        <p className="font-medium text-gray-600 mb-1">
                          Documentos en preparación
                        </p>
                        <p className="text-sm">
                          Te notificaremos cuando estén disponibles para descargar.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
          
          {/* Info box */}
          <div className="mt-8 bg-blue-50 rounded-xl p-6">
            <h3 className="font-semibold text-blue-900 mb-3">
              ℹ️ Sobre tus documentos
            </h3>
            <ul className="space-y-2 text-sm text-blue-800">
              <li className="flex items-start gap-2">
                <FileText className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>El <strong>Bill of Sale</strong> es tu comprobante de compra.</span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>El <strong>Título de Propiedad</strong> estará disponible una vez completada la transferencia.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>Te notificaremos por correo cuando haya nuevos documentos disponibles.</span>
              </li>
            </ul>
          </div>
          
          {/* Contact CTA */}
          <div className="mt-6 text-center">
            <p className="text-gray-500 text-sm mb-2">
              ¿Tienes preguntas sobre tus documentos?
            </p>
            <a
              href="tel:+18327459600"
              className="inline-flex items-center gap-2 text-navy-900 font-medium hover:text-gold-600 transition-colors"
            >
              📞 Llámanos al (832) 745-9600
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
