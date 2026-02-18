'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft, 
  User, 
  Mail, 
  Phone, 
  MapPin, 
  Shield,
  CheckCircle,
  Loader2,
  Home,
  Lock,
  Eye,
  EyeOff,
} from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { signUpWithPassword } from '@/lib/supabase/client-auth'

interface Property {
  id: string
  address: string
  city: string
  state: string
  sale_price: number
  photos: string[]
}

export default function PurchaseFormPage() {
  const params = useParams()
  const router = useRouter()
  const propertyId = params.propertyId as string
  
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    terreno: '',
    password: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showPassword, setShowPassword] = useState(false)

  useEffect(() => {
    fetchProperty()
  }, [propertyId])

  const fetchProperty = async () => {
    try {
      const res = await fetch(`/api/public/properties/${propertyId}`)
      const data = await res.json()
      
      if (data.ok) {
        // Check if property is still available for purchase
        if (data.is_available === false) {
          toast.error('Esta propiedad ya no está disponible para compra')
          router.push(`/clientes/casas/${propertyId}`)
          return
        }
        setProperty(data.property)
      } else {
        toast.error('Propiedad no disponible')
        router.push('/clientes/casas')
      }
    } catch (error) {
      console.error('Error:', error)
      router.push('/clientes/casas')
    } finally {
      setLoading(false)
    }
  }

  const validateForm = () => {
    const newErrors: Record<string, string> = {}
    
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido'
    }
    
    if (!formData.email.trim()) {
      newErrors.email = 'El correo es requerido'
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Correo inválido'
    }
    
    if (!formData.phone.trim()) {
      newErrors.phone = 'El teléfono es requerido'
    }
    
    if (!formData.terreno.trim()) {
      newErrors.terreno = 'La ubicación del terreno es requerida'
    }

    if (!formData.password.trim()) {
      newErrors.password = 'La contraseña es requerida'
    } else if (formData.password.length < 6) {
      newErrors.password = 'Mínimo 6 caracteres'
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Las contraseñas no coinciden'
    }
    
    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!validateForm()) {
      toast.error('Por favor completa todos los campos')
      return
    }
    
    setSubmitting(true)
    
    try {
      // 1. Create Supabase auth account (email + password)
      const { error: signUpError } = await signUpWithPassword(
        formData.email.toLowerCase().trim(),
        formData.password,
      )

      if (signUpError) {
        // "User already registered" is fine — they may have created an account before
        const alreadyExists =
          signUpError.message?.toLowerCase().includes('already registered') ||
          signUpError.message?.toLowerCase().includes('already been registered')

        if (!alreadyExists) {
          console.error('Signup error:', signUpError.message)
          toast.error(signUpError.message || 'Error al crear la cuenta')
          setSubmitting(false)
          return
        }
        // If already exists, just continue — they can log in later with their existing password
      }

      // 2. Store client data for the next step (method selection)
      sessionStorage.setItem('maninos_client_data', JSON.stringify({
        property_id: propertyId,
        client_name: formData.name,
        client_email: formData.email,
        client_phone: formData.phone,
        client_terreno: formData.terreno,
        property: property
      }))
      
      toast.success('¡Cuenta creada y datos guardados!')
      router.push(`/clientes/comprar/${propertyId}/metodo`)
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!property) {
    return null
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b">
        <div className="container mx-auto px-4 py-4">
          <Link 
            href={`/clientes/casas/${propertyId}`}
            className="flex items-center gap-2 text-gray-600 hover:text-navy-900"
          >
            <ArrowLeft className="w-4 h-4" />
            Volver a la propiedad
          </Link>
        </div>
      </div>
      
      <div className="container mx-auto px-4 py-8">
        {/* Progress Steps */}
        <div className="max-w-3xl mx-auto mb-8">
          <div className="flex items-center justify-center">
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gold-500 text-navy-900 rounded-full font-bold">
                1
              </div>
              <span className="ml-2 font-medium text-navy-900">Tus Datos</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-gray-500 rounded-full font-bold">
                2
              </div>
              <span className="ml-2 text-gray-500">Forma de Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-gray-500 rounded-full font-bold">
                3
              </div>
              <span className="ml-2 text-gray-500">Pago</span>
            </div>
            <div className="w-12 h-1 bg-gray-200 mx-3" />
            <div className="flex items-center">
              <div className="flex items-center justify-center w-10 h-10 bg-gray-200 text-gray-500 rounded-full font-bold">
                4
              </div>
              <span className="ml-2 text-gray-500">Confirmación</span>
            </div>
          </div>
        </div>
        
        <div className="grid lg:grid-cols-3 gap-8 max-w-5xl mx-auto">
          {/* Form */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <h1 className="text-2xl font-bold text-navy-900 mb-2">
                Tus Datos
              </h1>
              <p className="text-gray-600 mb-6">
                Completa tu información y crea tu cuenta para continuar.
              </p>
              
              <form onSubmit={handleSubmit} className="space-y-5">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre completo *
                  </label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={formData.name}
                      onChange={e => setFormData({ ...formData, name: e.target.value })}
                      placeholder="Tu nombre completo"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.name ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.name && <p className="text-red-500 text-sm mt-1">{errors.name}</p>}
                </div>
                
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Correo electrónico *
                  </label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="email"
                      value={formData.email}
                      onChange={e => setFormData({ ...formData, email: e.target.value })}
                      placeholder="tu@email.com"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.email ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.email && <p className="text-red-500 text-sm mt-1">{errors.email}</p>}
                </div>
                
                {/* Phone */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Teléfono *
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="tel"
                      value={formData.phone}
                      onChange={e => setFormData({ ...formData, phone: e.target.value })}
                      placeholder="(123) 456-7890"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.phone ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.phone && <p className="text-red-500 text-sm mt-1">{errors.phone}</p>}
                </div>
                
                {/* Terreno */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ubicación del terreno *
                  </label>
                  <div className="relative">
                    <MapPin className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                    <textarea
                      value={formData.terreno}
                      onChange={e => setFormData({ ...formData, terreno: e.target.value })}
                      placeholder="Dirección donde se colocará la casa móvil"
                      rows={3}
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.terreno ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.terreno && <p className="text-red-500 text-sm mt-1">{errors.terreno}</p>}
                  <p className="text-xs text-gray-500 mt-1">
                    Incluye ciudad, estado y código postal si es posible
                  </p>
                </div>

                {/* Divider — Account creation */}
                <div className="relative py-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                  <div className="relative flex justify-center">
                    <span className="bg-white px-3 text-xs font-semibold text-[#004274] uppercase tracking-wider">Crea tu cuenta</span>
                  </div>
                </div>
                <p className="text-sm text-gray-500 -mt-2">
                  Con tu correo y contraseña podrás acceder a tu cuenta para dar seguimiento a tu compra.
                </p>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Contraseña *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={e => setFormData({ ...formData, password: e.target.value })}
                      placeholder="Mínimo 6 caracteres"
                      className={`w-full pl-10 pr-12 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.password ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {errors.password && <p className="text-red-500 text-sm mt-1">{errors.password}</p>}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Confirmar contraseña *
                  </label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.confirmPassword}
                      onChange={e => setFormData({ ...formData, confirmPassword: e.target.value })}
                      placeholder="Repite tu contraseña"
                      className={`w-full pl-10 pr-4 py-3 border rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500 ${
                        errors.confirmPassword ? 'border-red-500' : 'border-gray-300'
                      }`}
                    />
                  </div>
                  {errors.confirmPassword && <p className="text-red-500 text-sm mt-1">{errors.confirmPassword}</p>}
                </div>
                
                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-gold-500 text-navy-900 font-bold py-4 rounded-lg hover:bg-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Procesando...
                    </>
                  ) : (
                    'Continuar →'
                  )}
                </button>
              </form>
              
              {/* Security note */}
              <div className="mt-6 flex items-start gap-3 p-4 bg-green-50 rounded-lg">
                <Shield className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-green-800">
                  Tu información está protegida y solo se usará para procesar tu compra.
                </p>
              </div>
            </div>
          </div>
          
          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-xl p-6 shadow-sm sticky top-24">
              <h2 className="font-semibold text-navy-900 mb-4">Resumen de compra</h2>
              
              {/* Property thumbnail */}
              <div className="flex gap-4 pb-4 border-b">
                <div className="w-20 h-20 bg-gray-200 rounded-lg overflow-hidden flex-shrink-0">
                  {property.photos?.[0] ? (
                    <img
                      src={property.photos[0]}
                      alt={property.address}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <Home className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-navy-900 text-sm line-clamp-2">
                    {property.address}
                  </p>
                  <p className="text-gray-500 text-sm">
                    {property.city || 'Texas'}, {property.state || 'TX'}
                  </p>
                </div>
              </div>
              
              {/* Price */}
              <div className="py-4 border-b">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-gray-600">Precio de la casa</span>
                  <span className="font-medium">${property.sale_price?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Procesamiento</span>
                  <span className="font-medium text-green-600">$0</span>
                </div>
              </div>
              
              <div className="py-4">
                <div className="flex justify-between">
                  <span className="font-bold text-navy-900">Total</span>
                  <span className="font-bold text-2xl text-gold-600">
                    ${property.sale_price?.toLocaleString()}
                  </span>
                </div>
              </div>
              
              {/* Trust badges */}
              <div className="pt-4 border-t space-y-2">
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Pago 100% seguro</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  <span>Título transferido a tu nombre</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

