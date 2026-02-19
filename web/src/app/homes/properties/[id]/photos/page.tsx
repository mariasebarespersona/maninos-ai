'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Loader2, Image as ImageIcon, Building2 } from 'lucide-react'
import PhotoUploader from '@/components/ui/PhotoUploader'
import { useToast } from '@/components/ui/Toast'

interface Property {
  id: string
  address: string
  status: string
  photos: string[]
  property_code?: string
}

export default function PropertyPhotosPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [hasChanges, setHasChanges] = useState(false)

  useEffect(() => {
    fetchProperty()
  }, [params.id])

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/properties/${params.id}`)
      if (res.ok) {
        const data = await res.json()
        setProperty(data)
        setPhotos(data.photos || [])
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

  const handlePhotosChange = (newPhotos: string[]) => {
    setPhotos(newPhotos)
    setHasChanges(true)
  }

  const handleSave = async () => {
    if (!property) return
    
    setSaving(true)
    try {
      const res = await fetch(`/api/properties/${property.id}/photos`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(photos),
      })

      if (res.ok) {
        toast.success('Fotos guardadas exitosamente')
        setHasChanges(false)
        router.push(`/homes/properties/${property.id}`)
      } else {
        const data = await res.json()
        toast.error(data.detail || 'Error al guardar las fotos')
      }
    } catch (error) {
      console.error('Error saving photos:', error)
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
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
        <Building2 className="w-12 h-12 text-navy-300 mx-auto mb-4" />
        <h3 className="font-serif text-xl text-navy-900 mb-2">Propiedad no encontrada</h3>
        <Link href="/homes/properties" className="btn-primary inline-flex mt-4">
          Volver a Propiedades
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link 
          href={`/homes/properties/${property.id}`}
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a {property.address}
        </Link>
        <h1 className="font-serif text-2xl text-navy-900 flex items-center gap-3">
          <ImageIcon className="w-7 h-7 text-gold-500" />
          Fotos de la Propiedad
        </h1>
        <p className="text-navy-500 mt-1">
          Sube fotos para publicar esta propiedad
        </p>
      </div>

      {/* Photo Uploader */}
      <div className="card-luxury p-6">
        <PhotoUploader
          propertyId={property.id}
          existingPhotos={photos}
          onPhotosChange={handlePhotosChange}
          maxPhotos={10}
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between mt-6">
        <Link 
          href={`/homes/properties/${property.id}`}
          className="btn-ghost"
        >
          Cancelar
        </Link>
        <button 
          onClick={handleSave}
          disabled={saving || !hasChanges}
          className="btn-gold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Guardando...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Guardar Fotos
            </>
          )}
        </button>
      </div>

      {/* Info box */}
      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl">
        <p className="text-sm text-amber-800">
          <strong>Tip:</strong> La primera foto será la imagen principal que aparecerá en los listados.
          Puedes arrastrar y soltar múltiples imágenes a la vez.
        </p>
      </div>
    </div>
  )
}


