'use client'

import { useState, useCallback, useRef } from 'react'
import { Upload, X, Loader2, AlertCircle } from 'lucide-react'
import { getSupabaseClient } from '@/lib/supabase/client'
import { useToast } from './Toast'

interface PhotoUploaderProps {
  propertyId: string
  existingPhotos: string[]
  onPhotosChange: (photos: string[]) => void
  maxPhotos?: number
}

export default function PhotoUploader({
  propertyId,
  existingPhotos = [],
  onPhotosChange,
  maxPhotos = 10
}: PhotoUploaderProps) {
  const [photos, setPhotos] = useState<string[]>(existingPhotos)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const toast = useToast()
  const supabase = getSupabaseClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const uploadFile = async (file: File): Promise<string | null> => {
    if (!file.type.startsWith('image/')) {
      toast.error(`${file.name} no es una imagen válida`)
      return null
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error(`${file.name} es demasiado grande (máx 5MB)`)
      return null
    }

    const fileExt = file.name.split('.').pop()
    const fileName = `${propertyId}/${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`

    try {
      const { data, error } = await supabase.storage
        .from('property-photos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        })

      if (error) {
        console.error('Upload error:', error)
        toast.error(`Error subiendo ${file.name}: ${error.message}`)
        return null
      }

      const { data: { publicUrl } } = supabase.storage
        .from('property-photos')
        .getPublicUrl(data.path)

      return publicUrl
    } catch (error) {
      console.error('Upload error:', error)
      toast.error(`Error subiendo ${file.name}`)
      return null
    }
  }

  const handleFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files)
    
    if (photos.length + fileArray.length > maxPhotos) {
      toast.warning(`Máximo ${maxPhotos} fotos permitidas`)
      return
    }

    setUploading(true)
    
    const uploadPromises = fileArray.map(file => uploadFile(file))
    const results = await Promise.all(uploadPromises)
    const successfulUploads = results.filter((url): url is string => url !== null)

    if (successfulUploads.length > 0) {
      const newPhotos = [...photos, ...successfulUploads]
      setPhotos(newPhotos)
      onPhotosChange(newPhotos)
      toast.success(`${successfulUploads.length} foto(s) subida(s) exitosamente`)
    }

    setUploading(false)
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    
    if (e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [photos])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
  }, [])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('File input changed:', e.target.files)
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
    // Reset para permitir seleccionar el mismo archivo
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const removePhoto = async (urlToRemove: string) => {
    try {
      const url = new URL(urlToRemove)
      const pathParts = url.pathname.split('/storage/v1/object/public/property-photos/')
      if (pathParts.length > 1) {
        const filePath = pathParts[1]
        await supabase.storage.from('property-photos').remove([filePath])
      }
    } catch (error) {
      console.error('Error deleting from storage:', error)
    }

    const newPhotos = photos.filter(url => url !== urlToRemove)
    setPhotos(newPhotos)
    onPhotosChange(newPhotos)
    toast.info('Foto eliminada')
  }

  return (
    <div className="space-y-4">
      {/* Drop Zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative border-2 border-dashed rounded-2xl p-10 text-center
          transition-all duration-300 ease-out
          ${dragOver 
            ? 'border-gold-500 bg-gradient-to-br from-gold-50 to-amber-50 scale-[1.02] shadow-lg shadow-gold-200/50' 
            : 'border-navy-200 hover:border-navy-300 bg-gradient-to-br from-white to-navy-50/30'
          }
          ${uploading ? 'opacity-70 pointer-events-none' : ''}
        `}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-gold-500 animate-spin" />
            <p className="text-navy-600 font-medium">Subiendo fotos...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4">
            <div className={`
              p-4 rounded-full transition-colors
              ${dragOver ? 'bg-gold-100' : 'bg-navy-50'}
            `}>
              <Upload className={`w-8 h-8 ${dragOver ? 'text-gold-600' : 'text-navy-400'}`} />
            </div>
            <div className="text-center">
              <p className="text-navy-800 font-semibold text-lg">
                Arrastra tus fotos aquí
              </p>
              <p className="text-sm text-navy-500 mt-1">
                o haz clic en el botón de abajo
              </p>
              <p className="text-xs text-navy-400 mt-2">
                PNG, JPG, WEBP · Máximo 5MB por foto · Hasta {maxPhotos} fotos
              </p>
            </div>
            
            {/* Styled file input button */}
            <label className="group relative inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-gold-500 to-gold-600 hover:from-gold-600 hover:to-gold-700 text-white font-medium rounded-xl shadow-lg shadow-gold-500/30 hover:shadow-gold-500/40 transition-all duration-300 cursor-pointer transform hover:scale-[1.02]">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleFileSelect}
                disabled={uploading}
                className="sr-only"
              />
              <Upload className="w-5 h-5 group-hover:animate-bounce" />
              <span>Seleccionar Fotos</span>
            </label>
          </div>
        )}
      </div>

      {/* Photo Grid */}
      {photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {photos.map((url, index) => (
            <div key={url} className="relative group aspect-square">
              <img
                src={url}
                alt={`Foto ${index + 1}`}
                className="w-full h-full object-cover rounded-lg"
              />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center">
                <button
                  type="button"
                  onClick={() => removePhoto(url)}
                  className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {index === 0 && (
                <div className="absolute top-2 left-2 px-2 py-1 bg-gold-500 text-white text-xs font-medium rounded-full">
                  Principal
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Counter */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-navy-500">
          {photos.length} de {maxPhotos} fotos
        </span>
        {photos.length >= maxPhotos && (
          <span className="text-amber-600 flex items-center gap-1">
            <AlertCircle className="w-4 h-4" />
            Límite alcanzado
          </span>
        )}
      </div>
    </div>
  )
}
