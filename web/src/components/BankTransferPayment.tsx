'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  CreditCard,
  CheckCircle,
  Loader2,
  AlertCircle,
} from 'lucide-react'

// ─── Shared Types ───────────────────────────────────────────────

export interface Payee {
  id: string
  name: string
  bank_name: string
  routing_number: string
  account_number: string
  account_number_masked?: string
  account_type: string
  address?: string
  bank_address?: string
  memo?: string
}

export type PayeeMode = 'existing' | 'new'

export interface PaymentInfo {
  method: string
  reference: string
  date: string
  amount: number
  payee_id?: string
  payee_name?: string
}

// ─── Hook: encapsulates all payee state + fetch logic ───────────

export function usePayeeState() {
  const [payeeMode, setPayeeMode] = useState<PayeeMode>('new')
  const [savedPayees, setSavedPayees] = useState<Payee[]>([])
  const [selectedPayeeId, setSelectedPayeeId] = useState<string>('')
  const [newPayee, setNewPayee] = useState({
    name: '', bank_name: '', routing_number: '', account_number: '',
    account_type: 'checking' as 'checking' | 'savings', address: '', bank_address: '',
  })
  const [savePayee, setSavePayee] = useState(true)
  const [loadingPayees, setLoadingPayees] = useState(false)

  const fetchPayees = useCallback(async () => {
    setLoadingPayees(true)
    try {
      const res = await fetch('/api/purchase-payments/payees')
      const data = await res.json()
      if (data.ok) setSavedPayees(data.data || [])
    } catch (err) {
      console.error('Error fetching payees:', err)
    } finally {
      setLoadingPayees(false)
    }
  }, [])

  useEffect(() => { fetchPayees() }, [fetchPayees])

  const isPayeeValid = payeeMode === 'existing'
    ? !!selectedPayeeId
    : !!(newPayee.name && newPayee.bank_name && newPayee.routing_number.length === 9 && newPayee.account_number)

  const resetPayee = () => {
    setPayeeMode('new')
    setSelectedPayeeId('')
    setNewPayee({ name: '', bank_name: '', routing_number: '', account_number: '', account_type: 'checking', address: '', bank_address: '' })
    setSavePayee(true)
  }

  /** Save new payee to DB if checkbox was checked. Returns the saved payee_id or undefined. */
  const saveNewPayee = async (): Promise<{ id: string; name: string } | undefined> => {
    if (payeeMode !== 'new' || !savePayee || !newPayee.name || !newPayee.routing_number || !newPayee.account_number) return undefined
    try {
      const res = await fetch('/api/purchase-payments/payees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPayee),
      })
      const data = await res.json()
      if (data.ok) return { id: data.data.id, name: newPayee.name }
    } catch (err) {
      console.error('Error saving payee:', err)
    }
    return undefined
  }

  return {
    payeeMode, setPayeeMode,
    savedPayees,
    selectedPayeeId, setSelectedPayeeId,
    newPayee, setNewPayee,
    savePayee, setSavePayee,
    loadingPayees,
    isPayeeValid,
    resetPayee,
    saveNewPayee,
    fetchPayees,
  }
}

// ─── Component ──────────────────────────────────────────────────

/**
 * Full payment step UI — bank transfer only, with existing/new payee toggle.
 * Designed to be embedded in the Step 3 of the purchase flow.
 */
export function BankTransferStep({
  payment,
  onPaymentChange,
  payee,
}: {
  payment: PaymentInfo
  onPaymentChange: (updater: (prev: PaymentInfo) => PaymentInfo) => void
  payee: ReturnType<typeof usePayeeState>
}) {
  const {
    payeeMode, setPayeeMode,
    savedPayees,
    selectedPayeeId, setSelectedPayeeId,
    newPayee, setNewPayee,
    savePayee, setSavePayee,
    loadingPayees,
    isPayeeValid,
  } = payee

  const isComplete = isPayeeValid && !!payment.reference

  return (
    <div className="space-y-6">
      {/* Payment Amount */}
      <div className="bg-gradient-to-r from-navy-900 to-navy-800 rounded-xl p-5 text-white">
        <p className="text-sm text-navy-200 mb-1">Monto a pagar al vendedor</p>
        <div className="text-3xl font-bold">${payment.amount.toLocaleString()}</div>
        <p className="text-xs text-navy-300 mt-1">Transferencia bancaria &middot; Coordinado por Abigail (Tesorería)</p>
      </div>

      {/* Payee Mode Toggle */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-3">
          <CreditCard className="w-4 h-4 inline mr-2" />
          Beneficiario de la transferencia *
        </label>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => { setPayeeMode('existing'); setSelectedPayeeId('') }}
            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
              payeeMode === 'existing'
                ? 'border-gold-500 bg-gold-50 text-gold-800'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Beneficiario existente
          </button>
          <button
            onClick={() => setPayeeMode('new')}
            className={`p-3 rounded-lg border-2 text-sm font-medium transition-all ${
              payeeMode === 'new'
                ? 'border-gold-500 bg-gold-50 text-gold-800'
                : 'border-gray-200 text-gray-600 hover:border-gray-300'
            }`}
          >
            Nuevo beneficiario
          </button>
        </div>
      </div>

      {/* Existing Payee Selection */}
      {payeeMode === 'existing' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-3">
          <p className="text-sm font-semibold text-blue-900">Seleccionar beneficiario guardado</p>
          {loadingPayees ? (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" /> Cargando beneficiarios...
            </div>
          ) : savedPayees.length === 0 ? (
            <div className="text-sm text-gray-500 py-4 text-center">
              No hay beneficiarios guardados.{' '}
              <button onClick={() => setPayeeMode('new')} className="text-gold-600 font-medium hover:underline">
                Crear uno nuevo
              </button>
            </div>
          ) : (
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {savedPayees.map(p => (
                <button
                  key={p.id}
                  onClick={() => {
                    setSelectedPayeeId(p.id)
                    onPaymentChange(prev => ({ ...prev, payee_id: p.id, payee_name: p.name }))
                  }}
                  className={`w-full p-3 rounded-lg border-2 text-left transition-all ${
                    selectedPayeeId === p.id
                      ? 'border-gold-500 bg-gold-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium text-gray-800 block">{p.name}</span>
                      <span className="text-xs text-gray-500">
                        {p.bank_name} &middot; {p.account_type === 'checking' ? 'Checking' : 'Savings'} &middot; {p.account_number_masked}
                      </span>
                    </div>
                    {selectedPayeeId === p.id && (
                      <CheckCircle className="w-5 h-5 text-gold-600 flex-shrink-0" />
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New Payee Form */}
      {payeeMode === 'new' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 space-y-4">
          <p className="text-sm font-semibold text-blue-900">Datos bancarios del vendedor</p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Nombre del beneficiario *</label>
            <input
              type="text"
              value={newPayee.name}
              onChange={(e) => setNewPayee(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Nombre legal completo del vendedor"
              className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Banco *</label>
              <input
                type="text"
                value={newPayee.bank_name}
                onChange={(e) => setNewPayee(prev => ({ ...prev, bank_name: e.target.value }))}
                placeholder="Ej: Chase, Wells Fargo..."
                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Tipo de cuenta *</label>
              <select
                value={newPayee.account_type}
                onChange={(e) => setNewPayee(prev => ({ ...prev, account_type: e.target.value as 'checking' | 'savings' }))}
                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Routing Number (ABA) *</label>
              <input
                type="text"
                value={newPayee.routing_number}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '').slice(0, 9)
                  setNewPayee(prev => ({ ...prev, routing_number: v }))
                }}
                placeholder="9 digitos"
                maxLength={9}
                className={`w-full p-2.5 border rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 ${
                  newPayee.routing_number && newPayee.routing_number.length !== 9
                    ? 'border-red-300 bg-red-50'
                    : 'border-blue-300'
                }`}
              />
              {newPayee.routing_number && newPayee.routing_number.length !== 9 && (
                <p className="text-[10px] text-red-500 mt-0.5">Debe tener 9 digitos</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Account Number *</label>
              <input
                type="text"
                value={newPayee.account_number}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, '')
                  setNewPayee(prev => ({ ...prev, account_number: v }))
                }}
                placeholder="Numero de cuenta"
                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Direccion del beneficiario</label>
              <input
                type="text"
                value={newPayee.address}
                onChange={(e) => setNewPayee(prev => ({ ...prev, address: e.target.value }))}
                placeholder="Opcional"
                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Direccion del banco</label>
              <input
                type="text"
                value={newPayee.bank_address}
                onChange={(e) => setNewPayee(prev => ({ ...prev, bank_address: e.target.value }))}
                placeholder="Opcional"
                className="w-full p-2.5 border border-blue-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Save payee checkbox */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={savePayee}
              onChange={(e) => setSavePayee(e.target.checked)}
              className="rounded border-blue-300 text-gold-600 focus:ring-gold-500"
            />
            <span className="text-xs text-gray-600">Guardar beneficiario para futuras transferencias</span>
          </label>
        </div>
      )}

      {/* Confirmation Number */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Numero de confirmacion / Referencia *
        </label>
        <input
          type="text"
          value={payment.reference}
          onChange={(e) => onPaymentChange(prev => ({ ...prev, reference: e.target.value }))}
          placeholder="Ingresa el # de confirmacion una vez realizada la transferencia"
          className="w-full p-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
        />
      </div>

      {/* Payment Date */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Fecha del Pago
        </label>
        <input
          type="date"
          value={payment.date}
          onChange={(e) => onPaymentChange(prev => ({ ...prev, date: e.target.value }))}
          className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-gold-500 focus:border-gold-500"
        />
      </div>

      {/* Warning */}
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700">
          <strong>Recuerda:</strong> Coordinar con Abigail antes de enviar la transferencia.
          No se puede pagar al vendedor hasta que la aplicacion de cambio de titulo haya sido recibida.
        </p>
      </div>

      {/* Validation message */}
      {!isComplete && (
        <p className="text-sm text-amber-600 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          {!isPayeeValid
            ? payeeMode === 'existing'
              ? 'Selecciona un beneficiario'
              : 'Completa los datos bancarios del vendedor'
            : 'Ingresa el numero de confirmacion de la transferencia'
          }
        </p>
      )}
    </div>
  )
}
