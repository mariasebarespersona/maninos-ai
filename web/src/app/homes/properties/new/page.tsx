'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  DollarSign, 
  MapPin,
  Home,
  Save,
  Loader2
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useFormValidation, commonSchemas } from '@/hooks/useFormValidation'
import FormInput from '@/components/ui/FormInput'

/**
 * New Property Form - Paso 1: Compra Casa
 * Creates a new property in 'purchased' status
 */

interface PropertyForm {
  address: string
  city: string
  state: string
  zip_code: string
  hud_number: string
  year: string
  purchase_price: string
  bedrooms: string
  bathrooms: string
  square_feet: string
  length_ft: string
  width_ft: string
}

const initialForm: PropertyForm = {
  address: '',
  city: '',
  state: 'Texas',
  zip_code: '',
  hud_number: '',
  year: '',
  purchase_price: '',
  bedrooms: '',
  bathrooms: '',
  square_feet: '',
  length_ft: '',
  width_ft: '',
}

export default function NewPropertyPage() {
  const router = useRouter()
  const toast = useToast()
  const [form, setForm] = useState<PropertyForm>(initialForm)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { errors, validate, validateSingle, markTouched, getFieldError } = useFormValidation<PropertyForm>(
    commonSchemas.property
  )

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    setForm(prev => ({ ...prev, [name]: value }))
    validateSingle(name, value)
  }

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    markTouched(e.target.name)
    validateSingle(e.target.name, e.target.value)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate all fields
    if (!validate(form)) {
      toast.error('Por favor corrige los errores del formulario')
      console.log('Validation errors:', errors)
      return
    }

    setLoading(true)
    setError('')

    try {
      const payload = {
        address: form.address,
        city: form.city || undefined,
        state: form.state || undefined,
        zip_code: form.zip_code || undefined,
        hud_number: form.hud_number || undefined,
        year: form.year ? parseInt(form.year) : undefined,
        purchase_price: form.purchase_price ? parseFloat(form.purchase_price) : undefined,
        bedrooms: form.bedrooms ? parseInt(form.bedrooms) : undefined,
        bathrooms: form.bathrooms ? parseFloat(form.bathrooms) : undefined,
        square_feet: form.square_feet ? parseInt(form.square_feet) : undefined,
        length_ft: form.length_ft ? parseInt(form.length_ft) : undefined,
        width_ft: form.width_ft ? parseInt(form.width_ft) : undefined,
      }

      console.log('Sending payload:', payload)

      const res = await fetch('/api/properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      console.log('Response status:', res.status)

      const data = await res.json()
      console.log('Response data:', data)

      if (!res.ok) {
        throw new Error(data.detail || `Error ${res.status}: ${JSON.stringify(data)}`)
      }

      toast.success('¡Propiedad creada exitosamente!')
      router.push(`/homes/properties/${data.id}`)
    } catch (err: any) {
      console.error('Full error:', err)
      const errorMsg = err.message || 'Error desconocido'
      setError(errorMsg)
      toast.error(errorMsg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link 
          href="/homes/properties" 
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Propiedades
        </Link>
        <h1 className="font-serif text-2xl text-navy-900">Nueva Propiedad</h1>
        <p className="text-navy-500 mt-1">
          Paso 1: Registra una casa comprada en el sistema
        </p>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Address Section */}
        <div className="card-luxury p-6 space-y-4">
          <div className="flex items-center gap-2 text-navy-900 font-medium mb-2">
            <MapPin className="w-5 h-5 text-gold-500" />
            Ubicación
          </div>

          <FormInput
            label="Dirección"
            name="address"
            value={form.address}
            onChange={handleChange}
            onBlur={handleBlur}
            required
            placeholder="123 Main Street"
            error={getFieldError('address')}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Ciudad"
              name="city"
              value={form.city}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Houston"
              error={getFieldError('city')}
            />
            <FormInput
              label="Estado"
              name="state"
              value={form.state}
              onChange={handleChange}
              onBlur={handleBlur}
              error={getFieldError('state')}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              label="Código Postal"
              name="zip_code"
              value={form.zip_code}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="77001"
              error={getFieldError('zip_code')}
              helperText="Formato: 77001 o 77001-1234"
            />
            <FormInput
              label="HUD Number"
              name="hud_number"
              value={form.hud_number}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="TEX1234567"
            />
          </div>
        </div>

        {/* Details Section */}
        <div className="card-luxury p-6 space-y-4">
          <div className="flex items-center gap-2 text-navy-900 font-medium mb-2">
            <Home className="w-5 h-5 text-gold-500" />
            Detalles de la Propiedad
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              type="number"
              label="Año"
              name="year"
              value={form.year}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="2020"
              min={1900}
              max={2030}
              error={getFieldError('year')}
            />
            <FormInput
              type="number"
              label="Pies Cuadrados"
              name="square_feet"
              value={form.square_feet}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="1200"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              type="number"
              label="Largo (ft)"
              name="length_ft"
              value={form.length_ft}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="76"
              min={0}
              helperText="Largo en pies"
            />
            <FormInput
              type="number"
              label="Ancho (ft)"
              name="width_ft"
              value={form.width_ft}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="16"
              min={0}
              helperText="Ancho en pies"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormInput
              type="number"
              label="Habitaciones"
              name="bedrooms"
              value={form.bedrooms}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="3"
              min={0}
              max={20}
              error={getFieldError('bedrooms')}
            />
            <FormInput
              type="number"
              label="Baños"
              name="bathrooms"
              value={form.bathrooms}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="2"
              min={0}
              max={20}
              step={0.5}
              error={getFieldError('bathrooms')}
            />
          </div>
        </div>

        {/* Financial Section */}
        <div className="card-luxury p-6 space-y-4">
          <div className="flex items-center gap-2 text-navy-900 font-medium mb-2">
            <DollarSign className="w-5 h-5 text-gold-500" />
            Información Financiera
          </div>

          <FormInput
            type="number"
            label="Precio de Compra"
            name="purchase_price"
            value={form.purchase_price}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="50000"
            min={0}
            step={0.01}
            prefix="$"
            error={getFieldError('purchase_price')}
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3">
          <Link href="/homes/properties" className="btn-ghost">
            Cancelar
          </Link>
          <button 
            type="submit" 
            disabled={loading || !form.address}
            className="btn-gold disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-5 h-5" />
                Crear Propiedad
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

