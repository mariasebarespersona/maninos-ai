'use client'

import React, { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { 
  ArrowLeft,
  ArrowRight,
  Building2,
  Users,
  DollarSign,
  CheckCircle2,
  Loader2,
  Search,
  Plus,
  FileText,
  Banknote,
  Landmark,
  Clock,
  UserCheck,
  Award
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { useFormValidation, commonSchemas } from '@/hooks/useFormValidation'
import FormInput from '@/components/ui/FormInput'
import { useAuth } from '@/components/Auth/AuthProvider'

/**
 * New Sale Wizard - Cierre de Venta
 * 
 * Steps:
 * 1. Select Property (or preselected via query param)
 * 2. Choose Payment Type (Contado vs RTO)
 * 3. Enter/Select Client Data
 * 4. Comisiones (manual assignment)
 * 5. Confirm Price & Create Sale
 */

interface Property {
  id: string
  address: string
  sale_price: number
  status: string
}

interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  created_by_user_id?: string
}

interface TeamUser {
  id: string
  name: string
  email?: string
  role?: string
}

type PaymentType = 'contado' | 'rto'
type Step = 'property' | 'payment-type' | 'client' | 'employees' | 'confirm'

// Commission amounts (must match backend: api/utils/commissions.py)
const COMMISSION_CASH = 1500
const COMMISSION_RTO = 1000

function calculateCommissionPreview(
  saleType: PaymentType | null,
  foundById: string | null,
  soldById: string | null
) {
  const total = saleType === 'rto' ? COMMISSION_RTO : COMMISSION_CASH

  if (!foundById && !soldById) {
    return { total, foundBy: 0, soldBy: 0, note: 'Sin asignar — comisión pendiente' }
  }

  if (foundById && soldById && foundById === soldById) {
    return { total, foundBy: total, soldBy: 0, note: 'Misma persona → 100%' }
  }

  if (foundById && soldById) {
    return { total, foundBy: total / 2, soldBy: total / 2, note: '50% / 50%' }
  }

  if (foundById && !soldById) {
    return { total, foundBy: total, soldBy: 0, note: 'Solo encontró → 100%' }
  }

  return { total, foundBy: 0, soldBy: total, note: 'Solo cerró → 100%' }
}

function NewSaleContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const toast = useToast()
  const { user: authUser } = useAuth()
  const preselectedProperty = searchParams.get('property')
  const preselectedClient = searchParams.get('client')

  const [step, setStep] = useState<Step>(preselectedProperty ? 'payment-type' : 'property')
  const [paymentType, setPaymentType] = useState<PaymentType | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const { validate, validateSingle, markTouched, getFieldError } = useFormValidation(
    commonSchemas.client
  )

  // Data
  const [properties, setProperties] = useState<Property[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [teamUsers, setTeamUsers] = useState<TeamUser[]>([])
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null)
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  
  // Current logged-in user's team ID (matched by email)
  const [currentTeamUserId, setCurrentTeamUserId] = useState<string | null>(null)
  
  // Employee assignment
  const [foundByEmployeeId, setFoundByEmployeeId] = useState<string | null>(null)
  const [soldByEmployeeId, setSoldByEmployeeId] = useState<string | null>(null)
  
  // New client form
  const [isNewClient, setIsNewClient] = useState(false)
  const [newClient, setNewClient] = useState({
    name: '',
    email: '',
    phone: '',
    terreno: '',
  })

  // Filters
  const [propertySearch, setPropertySearch] = useState('')
  const [clientSearch, setClientSearch] = useState('')
  const [employeeSearch, setEmployeeSearch] = useState('')

  // On mount: sync current auth user to the users table, then fetch data
  useEffect(() => {
    const init = async () => {
      // First ensure the logged-in user exists in the custom users table
      if (authUser?.email) {
        try {
          await fetch('/api/team/users/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              auth_id: authUser.id,
              email: authUser.email,
              name: authUser.user_metadata?.full_name
                || authUser.user_metadata?.name
                || authUser.email.split('@')[0],
            }),
          })
        } catch (err) {
          console.error('Error syncing user:', err)
        }
      }
      // Then fetch all data
    fetchProperties()
    fetchClients()
      fetchTeamUsers()
    }
    init()
  }, [authUser])

  // Detect current user's team ID once teamUsers load (for display only, no auto-assign)
  useEffect(() => {
    if (authUser?.email && teamUsers.length > 0) {
      const me = teamUsers.find(
        u => u.email?.toLowerCase() === authUser.email?.toLowerCase()
      )
      if (me) {
        setCurrentTeamUserId(me.id)
      }
    }
  }, [authUser, teamUsers])

  useEffect(() => {
    if (preselectedProperty && properties.length > 0) {
      const prop = properties.find(p => p.id === preselectedProperty)
      if (prop) setSelectedProperty(prop)
    }
  }, [preselectedProperty, properties])

  useEffect(() => {
    if (preselectedClient && clients.length > 0) {
      const client = clients.find(c => c.id === preselectedClient)
      if (client) setSelectedClient(client)
    }
  }, [preselectedClient, clients])

  const fetchProperties = async () => {
    try {
      const res = await fetch('/api/properties?status=published')
      if (res.ok) {
        const data = await res.json()
        setProperties(data)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchClients = async () => {
    try {
      const res = await fetch('/api/clients')
      if (res.ok) {
        const data = await res.json()
        setClients(data)
      }
    } catch (error) {
      console.error('Error:', error)
    }
  }

  const fetchTeamUsers = async () => {
    try {
      const res = await fetch('/api/team/users')
      if (res.ok) {
        const data = await res.json()
        // Backend returns { ok: true, users: [...] }
        setTeamUsers(Array.isArray(data) ? data : data.users || [])
      }
    } catch (error) {
      console.error('Error fetching team:', error)
    }
  }

  const handleClientChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setNewClient(prev => ({ ...prev, [name]: value }))
    // Map form field names to validation schema
    const schemaField = name === 'name' ? 'full_name' : name
    validateSingle(schemaField, value)
  }

  const handleClientBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    const schemaField = e.target.name === 'name' ? 'full_name' : e.target.name
    markTouched(schemaField)
    validateSingle(schemaField, e.target.value)
  }

  const handleNextToEmployees = () => {
    if (isNewClient) {
      if (!newClient.name || newClient.name.length < 3) {
        toast.error('El nombre del cliente es obligatorio (mínimo 3 caracteres)')
        return
      }
    }
    setStep('employees')
  }

  const handleCreateSale = async () => {
    if (!selectedProperty) return
    
    setLoading(true)
    setError('')

    try {
      let clientId = selectedClient?.id

      // Create new client if needed
      if (isNewClient) {
        if (!newClient.name || newClient.name.length < 3) {
          throw new Error('El nombre del cliente es obligatorio')
        }

        const clientRes = await fetch('/api/clients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newClient.name,
            email: newClient.email || undefined,
            phone: newClient.phone || undefined,
            created_by_user_id: currentTeamUserId || undefined,
          }),
        })
        
        if (!clientRes.ok) {
          const data = await clientRes.json()
          throw new Error(data.detail || 'Error al crear cliente')
        }
        
        const createdClient = await clientRes.json()
        clientId = createdClient.id
        toast.success('Cliente creado exitosamente')
      }

      if (!clientId) {
        throw new Error('Debe seleccionar o crear un cliente')
      }

      // Create sale
      const saleRes = await fetch('/api/sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: selectedProperty.id,
          client_id: clientId,
          sale_price: selectedProperty.sale_price,
          sale_type: paymentType || 'contado',
          found_by_employee_id: foundByEmployeeId || undefined,
          sold_by_employee_id: soldByEmployeeId || undefined,
        }),
      })

      if (!saleRes.ok) {
        const data = await saleRes.json()
        throw new Error(data.detail || 'Error al crear venta')
      }

      toast.success('¡Venta creada exitosamente!')
      router.push('/homes/sales')
    } catch (err: any) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  const filteredProperties = properties.filter(p =>
    p.address.toLowerCase().includes(propertySearch.toLowerCase())
  )

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(clientSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(clientSearch.toLowerCase())
  )

  const filteredEmployees = teamUsers.filter(u =>
    u.name?.toLowerCase().includes(employeeSearch.toLowerCase()) ||
    u.email?.toLowerCase().includes(employeeSearch.toLowerCase())
  )

  const commissionPreview = calculateCommissionPreview(paymentType, foundByEmployeeId, soldByEmployeeId)
  const foundByUser = teamUsers.find(u => u.id === foundByEmployeeId)
  const soldByUser = teamUsers.find(u => u.id === soldByEmployeeId)

  return (
    <div className="max-w-2xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <Link 
          href="/homes/sales" 
          className="inline-flex items-center gap-2 text-navy-500 hover:text-navy-700 mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Volver a Ventas
        </Link>
        <h1 className="font-serif text-2xl text-navy-900">
          {paymentType === 'contado' ? 'Venta Contado (Cash)' : 
           paymentType === 'rto' ? 'Venta RTO (Maninos Capital)' : 
           'Nueva Venta'}
        </h1>
        <p className="text-navy-500 mt-1">
          ¿Cómo paga el cliente?
        </p>
      </div>

      {/* Progress — 5 steps */}
      <div className="flex items-center justify-center gap-1 sm:gap-2 mb-8">
        <StepIndicator 
          number={1} 
          label="Propiedad" 
          active={step === 'property'}
          completed={!!selectedProperty && step !== 'property'}
        />
        <div className="w-4 sm:w-8 h-0.5 bg-navy-200" />
        <StepIndicator 
          number={2} 
          label="Tipo Pago" 
          active={step === 'payment-type'}
          completed={!!paymentType && step !== 'payment-type' && step !== 'property'}
        />
        <div className="w-4 sm:w-8 h-0.5 bg-navy-200" />
        <StepIndicator 
          number={3} 
          label="Cliente" 
          active={step === 'client'}
          completed={(!!selectedClient || isNewClient) && (step === 'employees' || step === 'confirm')}
        />
        <div className="w-4 sm:w-8 h-0.5 bg-navy-200" />
        <StepIndicator 
          number={4} 
          label="Empleados" 
          active={step === 'employees'}
          completed={(!!foundByEmployeeId || !!soldByEmployeeId) && step === 'confirm'}
        />
        <div className="w-4 sm:w-8 h-0.5 bg-navy-200" />
        <StepIndicator 
          number={5} 
          label="Confirmar" 
          active={step === 'confirm'}
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Step 1: Property */}
      {step === 'property' && (
        <div className="space-y-4">
          <div className="card-luxury p-6">
            <h2 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-gold-500" />
              Seleccionar Propiedad
            </h2>

            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" />
              <input
                type="text"
                placeholder="Buscar por dirección..."
                value={propertySearch}
                onChange={(e) => setPropertySearch(e.target.value)}
                className="input-luxury pl-10"
              />
            </div>

            {filteredProperties.length === 0 ? (
              <div className="text-center py-8 bg-navy-50 rounded-lg">
                <Building2 className="w-8 h-8 text-navy-300 mx-auto mb-2" />
                <p className="text-navy-500">No hay propiedades publicadas</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {filteredProperties.map((property) => (
                  <button
                    key={property.id}
                    onClick={() => setSelectedProperty(property)}
                    className={`w-full p-4 rounded-lg border text-left transition-all ${
                      selectedProperty?.id === property.id
                        ? 'border-gold-400 bg-gold-50'
                        : 'border-navy-100 hover:border-navy-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-navy-900">{property.address}</span>
                      <span className="text-gold-600 font-semibold">
                        ${property.sale_price?.toLocaleString()}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep('payment-type')}
              disabled={!selectedProperty}
              className="btn-gold disabled:opacity-50"
            >
              Siguiente
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Payment Type Selection */}
      {step === 'payment-type' && (
        <div className="space-y-4">
          <div className="card-luxury p-6">
            <h2 className="font-medium text-navy-900 mb-6 flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-gold-500" />
              ¿Cómo paga el cliente?
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option 1: Contado */}
              <button
                onClick={() => setPaymentType('contado')}
                className={`p-6 rounded-xl border-2 text-left transition-all ${
                  paymentType === 'contado'
                    ? 'border-emerald-400 bg-emerald-50'
                    : 'border-navy-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-3 rounded-full ${
                    paymentType === 'contado' ? 'bg-emerald-100' : 'bg-navy-100'
                  }`}>
                    <Banknote className={`w-6 h-6 ${
                      paymentType === 'contado' ? 'text-emerald-600' : 'text-navy-500'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy-900">Contado (Cash)</h3>
                    <p className="text-sm text-emerald-600">Comisión: $1,500</p>
                  </div>
                </div>
                <p className="text-sm text-navy-600">
                  El cliente tiene el dinero completo. Pago directo vía Stripe, transferencia o efectivo.
                </p>
              </button>

              {/* Option 2: RTO */}
              <button
                onClick={() => setPaymentType('rto')}
                className={`p-6 rounded-xl border-2 text-left transition-all ${
                  paymentType === 'rto'
                    ? 'border-purple-400 bg-purple-50'
                    : 'border-navy-200 hover:border-purple-300 hover:bg-purple-50/50'
                }`}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={`p-3 rounded-full ${
                    paymentType === 'rto' ? 'bg-purple-100' : 'bg-navy-100'
                  }`}>
                    <Landmark className={`w-6 h-6 ${
                      paymentType === 'rto' ? 'text-purple-600' : 'text-navy-500'
                    }`} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-navy-900">Maninos Capital (RTO)</h3>
                    <p className="text-sm text-purple-600">Comisión: $1,000</p>
                  </div>
                </div>
                <p className="text-sm text-navy-600">
                  Rent-to-Own. Maninos Capital adquiere la propiedad y financia al cliente.
                </p>
              </button>
            </div>

            {/* RTO Coming Soon Notice */}
            {paymentType === 'rto' && (
              <div className="mt-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-purple-500 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-purple-900">Portal Maninos Capital - Próximamente</h4>
                    <p className="text-sm text-purple-700 mt-1">
                      El flujo RTO completo (Adquirir, Incorporar, Gestionar Cartera, Entregar, Fondear) 
                      estará disponible en el Portal Maninos Capital.
                    </p>
                    <p className="text-sm text-purple-600 mt-2">
                      Por ahora, puedes registrar la venta como &quot;RTO pendiente&quot; para seguimiento.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between">
            <button
              onClick={() => setStep('property')}
              className="btn-ghost"
            >
              <ArrowLeft className="w-5 h-5" />
              Atrás
            </button>
            <button
              onClick={() => setStep('client')}
              disabled={!paymentType}
              className="btn-gold disabled:opacity-50"
            >
              Siguiente
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Client */}
      {step === 'client' && (
        <div className="space-y-4">
          <div className="card-luxury p-6">
            <h2 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <Users className="w-5 h-5 text-gold-500" />
              {isNewClient ? 'Nuevo Cliente' : 'Seleccionar Cliente'}
            </h2>

            {/* Toggle */}
            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setIsNewClient(false)}
                className={`btn-ghost flex-1 ${!isNewClient ? 'bg-navy-100' : ''}`}
              >
                Cliente Existente
              </button>
              <button
                onClick={() => setIsNewClient(true)}
                className={`btn-ghost flex-1 ${isNewClient ? 'bg-navy-100' : ''}`}
              >
                <Plus className="w-4 h-4" />
                Nuevo Cliente
              </button>
            </div>

            {isNewClient ? (
              <div className="space-y-4">
                <FormInput
                  label="Nombre"
                  name="name"
                  value={newClient.name}
                  onChange={handleClientChange}
                  onBlur={handleClientBlur}
                  required
                  placeholder="Juan Pérez"
                  error={getFieldError('full_name')}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormInput
                    type="email"
                    label="Email"
                    name="email"
                    value={newClient.email}
                    onChange={handleClientChange}
                    onBlur={handleClientBlur}
                    placeholder="juan@email.com"
                    error={getFieldError('email')}
                  />
                  <FormInput
                    type="tel"
                    label="Teléfono"
                    name="phone"
                    value={newClient.phone}
                    onChange={handleClientChange}
                    onBlur={handleClientBlur}
                    placeholder="555-123-4567"
                    error={getFieldError('phone')}
                  />
                </div>
                <FormInput
                  label="Terreno"
                  name="terreno"
                  value={newClient.terreno}
                  onChange={handleClientChange}
                  placeholder="Ubicación del terreno (opcional)"
                />
              </div>
            ) : (
              <>
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-navy-400" />
                  <input
                    type="text"
                    placeholder="Buscar cliente..."
                    value={clientSearch}
                    onChange={(e) => setClientSearch(e.target.value)}
                    className="input-luxury pl-10"
                  />
                </div>

                {filteredClients.length === 0 ? (
                  <div className="text-center py-8 bg-navy-50 rounded-lg">
                    <Users className="w-8 h-8 text-navy-300 mx-auto mb-2" />
                    <p className="text-navy-500 mb-2">No hay clientes</p>
                    <button
                      onClick={() => setIsNewClient(true)}
                      className="btn-ghost text-sm"
                    >
                      <Plus className="w-4 h-4" />
                      Crear nuevo cliente
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {filteredClients.map((client) => (
                      <button
                        key={client.id}
                        onClick={() => setSelectedClient(client)}
                        className={`w-full p-4 rounded-lg border text-left transition-all ${
                          selectedClient?.id === client.id
                            ? 'border-gold-400 bg-gold-50'
                            : 'border-navy-100 hover:border-navy-300'
                        }`}
                      >
                        <p className="font-medium text-navy-900">{client.name}</p>
                        <p className="text-sm text-navy-500">
                          {client.email} {client.phone && `• ${client.phone}`}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('payment-type')} className="btn-ghost">
              <ArrowLeft className="w-5 h-5" />
              Anterior
            </button>
            <button
              onClick={handleNextToEmployees}
              disabled={!isNewClient && !selectedClient}
              className="btn-gold disabled:opacity-50"
            >
              Siguiente
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 4: Commission — Manual assignment */}
      {step === 'employees' && (
        <div className="space-y-4">
          <div className="card-luxury p-6">
            <h2 className="font-medium text-navy-900 mb-2 flex items-center gap-2">
              <Award className="w-5 h-5 text-gold-500" />
              Comisiones
            </h2>
            <p className="text-sm text-navy-500 mb-6">
              Selecciona quién encontró al cliente y quién cierra la venta para asignar la comisión.
            </p>

            {/* Manual assignment */}
            <div className="space-y-4 mb-6">
              {/* Found By */}
              <div className="p-4 bg-blue-50 rounded-xl border border-blue-200">
                <span className="text-sm font-semibold text-blue-800">🔍 Encontró al cliente</span>
                <select
                  value={foundByEmployeeId || ''}
                  onChange={(e) => setFoundByEmployeeId(e.target.value || null)}
                  className="w-full mt-2 p-2.5 rounded-lg border border-blue-200 bg-white text-navy-900 text-sm focus:ring-2 focus:ring-blue-400 focus:border-blue-400"
                >
                  <option value="">— Sin asignar —</option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.email ? ` (${u.email})` : ''}{u.id === currentTeamUserId ? ' ← tú' : ''}
                    </option>
                  ))}
                </select>
              </div>

              {/* Sold By */}
              <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200">
                <span className="text-sm font-semibold text-emerald-800">🤝 Cerró la venta</span>
                <select
                  value={soldByEmployeeId || ''}
                  onChange={(e) => setSoldByEmployeeId(e.target.value || null)}
                  className="w-full mt-2 p-2.5 rounded-lg border border-emerald-200 bg-white text-navy-900 text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-400"
                >
                  <option value="">— Sin asignar —</option>
                  {teamUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}{u.email ? ` (${u.email})` : ''}{u.id === currentTeamUserId ? ' ← tú' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Commission Preview */}
            <div className="border-t border-navy-100 pt-4">
              <h3 className="text-sm font-semibold text-navy-800 mb-3 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-gold-500" />
                Desglose de Comisión
              </h3>
              <div className={`p-4 rounded-xl ${
                paymentType === 'contado' ? 'bg-emerald-50 border border-emerald-200' : 'bg-purple-50 border border-purple-200'
              }`}>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-navy-700">
                    Comisión Total ({paymentType === 'contado' ? 'Cash' : 'RTO'})
                  </span>
                  <span className="text-lg font-bold text-navy-900">
                    ${commissionPreview.total.toLocaleString()}
                  </span>
                </div>

                {(foundByEmployeeId || soldByEmployeeId) ? (
                  <div className="space-y-2">
                    {foundByEmployeeId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-navy-600">
                          🔍 {foundByUser?.name || 'Empleado'} <span className="text-navy-400">(encontró)</span>
                        </span>
                        <span className="font-semibold text-navy-900">
                          ${commissionPreview.foundBy.toLocaleString()}
                        </span>
                      </div>
                    )}
                    {soldByEmployeeId && soldByEmployeeId !== foundByEmployeeId && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-navy-600">
                          🤝 {soldByUser?.name || 'Empleado'} <span className="text-navy-400">(cerró)</span>
                        </span>
                        <span className="font-semibold text-navy-900">
                          ${commissionPreview.soldBy.toLocaleString()}
                        </span>
                      </div>
                    )}
                    <div className="text-xs text-navy-500 pt-1 border-t border-navy-100">
                      {commissionPreview.note}
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-navy-500">{commissionPreview.note}</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('client')} className="btn-ghost">
              <ArrowLeft className="w-5 h-5" />
              Anterior
            </button>
            <button
              onClick={() => setStep('confirm')}
              className="btn-gold"
            >
              Siguiente
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Step 5: Confirm */}
      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="card-luxury p-6">
            <h2 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
              <CheckCircle2 className="w-5 h-5 text-gold-500" />
              Confirmar Venta
            </h2>

            <div className="space-y-4">
              {/* Property */}
              <div className="p-4 bg-navy-50 rounded-lg">
                <p className="text-sm text-navy-500">Propiedad</p>
                <p className="font-medium text-navy-900">{selectedProperty?.address}</p>
              </div>

              {/* Client */}
              <div className="p-4 bg-navy-50 rounded-lg">
                <p className="text-sm text-navy-500">Cliente</p>
                <p className="font-medium text-navy-900">
                  {isNewClient ? newClient.name : selectedClient?.name}
                </p>
                {(isNewClient ? newClient.email : selectedClient?.email) && (
                  <p className="text-sm text-navy-500">
                    {isNewClient ? newClient.email : selectedClient?.email}
                  </p>
                )}
              </div>

              {/* Payment Type */}
              <div className={`p-4 rounded-lg border ${
                paymentType === 'contado' 
                  ? 'bg-emerald-50 border-emerald-200' 
                  : 'bg-purple-50 border-purple-200'
              }`}>
                <p className={`text-sm ${paymentType === 'contado' ? 'text-emerald-600' : 'text-purple-600'}`}>
                  Tipo de Pago
                </p>
                <p className={`font-semibold ${paymentType === 'contado' ? 'text-emerald-700' : 'text-purple-700'}`}>
                  {paymentType === 'contado' ? '💵 Contado (Cash)' : '🏛️ Maninos Capital (RTO)'}
                </p>
              </div>

              {/* Price */}
              <div className="p-4 bg-gold-50 rounded-lg border border-gold-200">
                <p className="text-sm text-gold-600">Precio de Venta</p>
                <p className="text-2xl font-bold text-gold-700">
                  ${selectedProperty?.sale_price?.toLocaleString()}
                </p>
              </div>

              {/* Employees & Commission */}
              <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-sm text-blue-600 mb-2">Empleados & Comisión</p>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-navy-700">
                      🔍 Encontró al cliente:
                    </span>
                    <span className="font-medium text-navy-900">
                      {foundByUser?.name || '— Sin asignar —'}
                      {foundByEmployeeId && (
                        <span className="text-emerald-600 ml-2">${commissionPreview.foundBy.toLocaleString()}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-navy-700">
                      🤝 Cerró la venta:
                    </span>
                    <span className="font-medium text-navy-900">
                      {soldByUser?.name || '— Sin asignar —'}
                      {soldByEmployeeId && soldByEmployeeId !== foundByEmployeeId && (
                        <span className="text-emerald-600 ml-2">${commissionPreview.soldBy.toLocaleString()}</span>
                      )}
                    </span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t border-blue-200">
                    <span className="text-sm font-semibold text-navy-800">Comisión Total</span>
                    <span className="font-bold text-navy-900">${commissionPreview.total.toLocaleString()}</span>
                  </div>
                  <p className="text-xs text-blue-600">{commissionPreview.note}</p>
                </div>
              </div>

              {/* RTO Notice */}
              {paymentType === 'rto' && (
                <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
                  <p className="text-sm text-purple-700">
                    <strong>Nota:</strong> Esta venta se registrará como &quot;RTO Pendiente&quot;. 
                    El flujo completo de Maninos Capital estará disponible próximamente.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep('employees')} className="btn-ghost">
              <ArrowLeft className="w-5 h-5" />
              Anterior
            </button>
            <button
              onClick={handleCreateSale}
              disabled={loading}
              className="btn-gold"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Crear Venta
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function StepIndicator({ 
  number, 
  label, 
  active, 
  completed 
}: { 
  number: number
  label: string
  active?: boolean
  completed?: boolean
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={`
        w-10 h-10 rounded-full flex items-center justify-center font-semibold
        ${active ? 'bg-gold-500 text-white' : ''}
        ${completed ? 'bg-emerald-500 text-white' : ''}
        ${!active && !completed ? 'bg-navy-100 text-navy-500' : ''}
      `}>
        {completed ? <CheckCircle2 className="w-5 h-5" /> : number}
      </div>
      <span className={`text-xs mt-1 ${active ? 'text-gold-600 font-medium' : 'text-navy-500'}`}>
        {label}
      </span>
    </div>
  )
}

export default function NewSalePage() {
  return (
    <Suspense fallback={<div className="flex justify-center py-12"><Loader2 className="w-8 h-8 animate-spin text-gold-500" /></div>}>
      <NewSaleContent />
    </Suspense>
  )
}
