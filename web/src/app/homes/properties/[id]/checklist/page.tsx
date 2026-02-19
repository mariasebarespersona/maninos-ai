'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2, Home, FileDown } from 'lucide-react'
import PropertyChecklist from '@/components/PropertyChecklist'
import { useToast } from '@/components/ui/Toast'

interface Property {
  id: string
  address: string
  city: string
  status: string
  checklist_data?: Record<string, boolean>
  property_code?: string
}

export default function PropertyChecklistPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const propertyId = params.id as string

  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [exporting, setExporting] = useState(false)

  useEffect(() => {
    fetchProperty()
  }, [propertyId])

  const handleExportPDF = async () => {
    setExporting(true)
    try {
      const res = await fetch(`/api/documents/checklist/${propertyId}`)
      
      if (!res.ok) {
        throw new Error('Error al generar PDF')
      }

      // Download the PDF
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `checklist_${propertyId.slice(0, 8)}.pdf`
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
      
      toast.success('PDF descargado exitosamente')
    } catch (error) {
      console.error('Error exporting PDF:', error)
      toast.error('Error al exportar PDF')
    } finally {
      setExporting(false)
    }
  }

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/properties/${propertyId}`)
      if (res.ok) {
        const data = await res.json()
        setProperty(data)
      } else {
        toast.error('Error al cargar la propiedad')
      }
    } catch (error) {
      console.error('Error fetching property:', error)
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  const handleSaveChecklist = async (checklist: Record<string, boolean>) => {
    try {
      const res = await fetch(`/api/properties/${propertyId}/checklist`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchase_checklist: checklist }),
      })

      if (!res.ok) {
        throw new Error('Error al guardar')
      }

      // Actualizar el estado local
      setProperty(prev => prev ? { ...prev, purchase_checklist: checklist } : null)
    } catch (error) {
      throw error
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!property) {
    return (
      <div className="text-center py-12">
        <Home className="w-12 h-12 text-navy-300 mx-auto mb-4" />
        <h3 className="font-serif text-xl text-navy-900 mb-2">Propiedad no encontrada</h3>
        <Link href="/homes/properties" className="btn-primary inline-flex mt-4">
          Volver a Propiedades
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <Link 
          href={`/homes/properties/${propertyId}`} 
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a {property.address}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gold-100 rounded-lg">
              <Home className="w-5 h-5 text-gold-600" />
            </div>
            <div>
              <h1 className="font-serif text-2xl text-navy-900">
                {property.property_code && (
                  <span className="inline-flex items-center justify-center px-1.5 py-0.5 mr-1.5 text-xs font-bold rounded bg-gold-100 text-gold-700 border border-gold-200 align-middle">
                    {property.property_code}
                  </span>
                )}
                {property.address}
              </h1>
              <p className="text-navy-500">{property.city}</p>
            </div>
          </div>
          <button
            onClick={handleExportPDF}
            disabled={exporting}
            className="btn-ghost flex items-center gap-2"
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <FileDown className="w-4 h-4" />
            )}
            Exportar PDF
          </button>
        </div>
      </div>

      {/* Checklist */}
      <PropertyChecklist
        propertyId={propertyId}
        initialChecklist={property.checklist_data || {}}
        onSave={handleSaveChecklist}
      />
    </div>
  )
}

