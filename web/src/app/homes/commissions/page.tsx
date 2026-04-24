'use client'

import React, { useState, useEffect, useCallback } from 'react'
import {
  Award,
  DollarSign,
  Users,
  ChevronLeft,
  ChevronRight,
  Trophy,
  Loader2,
  ArrowUp,
  ArrowDown,
  CheckCircle2,
  Clock,
  Shield,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react'
import { useAuth } from '@/components/Auth/AuthProvider'

// ============================================================================
// TYPES
// ============================================================================

interface CommissionPayment {
  id: string
  sale_id: string
  employee_id: string
  role: 'found_by' | 'sold_by'
  amount: number
  status: 'pending' | 'paid'
  paid_at: string | null
  paid_by: string | null
  employee_name: string
  employee_email: string
  employee_role: string
  sale_type: string
  sale_price: number
  sale_created_at: string
  property_address: string
}

interface EmployeeCommission {
  employee_id: string
  name: string
  total_earned: number
  total_pending: number
  total_paid: number
  sales_found: number
  sales_closed: number
  payments: CommissionPayment[]
}

interface TeamUser {
  id: string
  name: string
  email: string
  phone?: string
  role: string
  is_active: boolean
  created_at: string
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  operations: 'Operaciones',
  treasury: 'Tesorería',
  yard_manager: 'Encargado Yard',
  comprador: 'Comprador',
  renovador: 'Renovador',
  vendedor: 'Vendedor',
}

const COMMISSION_ELIGIBLE_ROLES = ['operations', 'comprador', 'vendedor']

// Roles that can see ALL commissions (admin + treasury)
const FULL_VIEW_ROLES = ['admin', 'treasury']

// ============================================================================
// MAIN PAGE
// ============================================================================

export default function CommissionsPage() {
  const [activeTab, setActiveTab] = useState<'comisiones' | 'equipo'>('comisiones')
  const { teamUser } = useAuth()

  const userRole = teamUser?.role || 'operations'
  const canSeeAll = FULL_VIEW_ROLES.includes(userRole)

  return (
    <div className="max-w-5xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-navy-900 flex items-center gap-3">
          <Award className="w-7 h-7 text-gold-500" />
          Comisiones
        </h1>
        <p className="text-navy-500 mt-1">
          {canSeeAll
            ? 'Gestión de comisiones y equipo de ventas'
            : 'Tus comisiones de ventas'}
        </p>
      </div>

      {/* Tabs — Equipo tab only for admin/treasury */}
      {canSeeAll ? (
        <div className="flex gap-1 mb-6 bg-navy-100 rounded-xl p-1">
          <button
            onClick={() => setActiveTab('comisiones')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'comisiones'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <DollarSign className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Comisiones
          </button>
          <button
            onClick={() => setActiveTab('equipo')}
            className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'equipo'
                ? 'bg-white text-navy-900 shadow-sm'
                : 'text-navy-500 hover:text-navy-700'
            }`}
          >
            <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Equipo
          </button>
        </div>
      ) : null}

      {activeTab === 'comisiones' || !canSeeAll ? (
        <ComisionesTab canSeeAll={canSeeAll} currentUserId={teamUser?.id} canMarkPaid={canSeeAll} />
      ) : (
        <EquipoTab />
      )}
    </div>
  )
}

// ============================================================================
// COMISIONES TAB
// ============================================================================

function ComisionesTab({
  canSeeAll,
  currentUserId,
  canMarkPaid,
}: {
  canSeeAll: boolean
  currentUserId?: string
  canMarkPaid: boolean
}) {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())
  const [payments, setPayments] = useState<CommissionPayment[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)
  const [markingPaid, setMarkingPaid] = useState<string | null>(null)

  const fetchPayments = useCallback(async () => {
    setLoading(true)
    try {
      // Operations users only fetch their own commissions
      const params = new URLSearchParams({ month: String(month), year: String(year) })
      if (!canSeeAll && currentUserId) {
        params.set('employee_id', currentUserId)
      }
      const res = await fetch(`/api/sales/commission-payments?${params}`)
      if (res.ok) {
        const data = await res.json()
        setPayments(data.payments || [])
      }
    } catch (error) {
      console.error('Error fetching commission payments:', error)
    } finally {
      setLoading(false)
    }
  }, [month, year, canSeeAll, currentUserId])

  useEffect(() => {
    fetchPayments()
  }, [fetchPayments])

  // Group payments by employee
  const employeeMap = new Map<string, EmployeeCommission>()
  for (const p of payments) {
    if (!employeeMap.has(p.employee_id)) {
      employeeMap.set(p.employee_id, {
        employee_id: p.employee_id,
        name: p.employee_name,
        total_earned: 0,
        total_pending: 0,
        total_paid: 0,
        sales_found: 0,
        sales_closed: 0,
        payments: [],
      })
    }
    const emp = employeeMap.get(p.employee_id)!
    emp.total_earned += p.amount
    if (p.status === 'pending') emp.total_pending += p.amount
    if (p.status === 'paid') emp.total_paid += p.amount
    if (p.role === 'found_by') emp.sales_found += 1
    if (p.role === 'sold_by') emp.sales_closed += 1
    emp.payments.push(p)
  }
  const employees = Array.from(employeeMap.values()).sort((a, b) => b.total_earned - a.total_earned)

  const totalCommission = employees.reduce((sum, e) => sum + e.total_earned, 0)
  const totalPending = employees.reduce((sum, e) => sum + e.total_pending, 0)
  const totalPaid = employees.reduce((sum, e) => sum + e.total_paid, 0)

  const prevMonth = () => {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }

  const nextMonth = () => {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }

  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear()

  const handleMarkPaid = async (paymentId: string) => {
    setMarkingPaid(paymentId)
    try {
      const res = await fetch(`/api/sales/commission-payments/${paymentId}/pay?paid_by=${currentUserId || 'system'}`, {
        method: 'PATCH',
      })
      if (res.ok) {
        await fetchPayments()
      }
    } catch (error) {
      console.error('Error marking commission as paid:', error)
    } finally {
      setMarkingPaid(null)
    }
  }

  return (
    <>
      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4 mb-6">
        <button
          onClick={prevMonth}
          className="p-2 rounded-lg border border-navy-200 hover:bg-navy-50 transition-colors"
        >
          <ChevronLeft className="w-5 h-5 text-navy-600" />
        </button>
        <div className="text-center min-w-[200px]">
          <h2 className="text-xl font-bold text-navy-900">
            {MONTH_NAMES[month - 1]} {year}
          </h2>
          {isCurrentMonth && (
            <span className="text-xs text-gold-600 font-medium">Mes actual</span>
          )}
        </div>
        <button
          onClick={nextMonth}
          disabled={isCurrentMonth}
          className="p-2 rounded-lg border border-navy-200 hover:bg-navy-50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-5 h-5 text-navy-600" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            <SummaryCard
              label="Total Comisiones"
              value={`$${totalCommission.toLocaleString()}`}
              icon={DollarSign}
              color="emerald"
            />
            <SummaryCard
              label="Pendiente"
              value={`$${totalPending.toLocaleString()}`}
              icon={Clock}
              color="amber"
            />
            <SummaryCard
              label="Pagada"
              value={`$${totalPaid.toLocaleString()}`}
              icon={CheckCircle2}
              color="blue"
            />
          </div>

          {/* Employee Rankings */}
          {employees.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <Award className="w-12 h-12 text-navy-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-navy-600 mb-2">
                Sin comisiones este mes
              </h3>
              <p className="text-navy-400 text-sm">
                No hay ventas con comisiones asignadas en {MONTH_NAMES[month - 1]} {year}.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-navy-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-gold-500" />
                Ranking del Mes
              </h3>

              {employees.map((emp, index) => (
                <div key={emp.employee_id} className="card-luxury overflow-hidden">
                  {/* Main row */}
                  <button
                    onClick={() => setExpandedEmployee(
                      expandedEmployee === emp.employee_id ? null : emp.employee_id
                    )}
                    className="w-full p-3 sm:p-5 flex items-center gap-3 sm:gap-4 text-left hover:bg-navy-50/50 transition-colors"
                  >
                    {/* Rank */}
                    <div className={`
                      w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0
                      ${index === 0 ? 'bg-gold-100 text-gold-700' : ''}
                      ${index === 1 ? 'bg-slate-100 text-slate-600' : ''}
                      ${index === 2 ? 'bg-amber-100 text-amber-700' : ''}
                      ${index > 2 ? 'bg-navy-100 text-navy-600' : ''}
                    `}>
                      {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                    </div>

                    {/* Name & stats */}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-navy-900 truncate">{emp.name}</p>
                      <div className="flex gap-2 mt-1 flex-wrap">
                        {emp.sales_found > 0 && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            {emp.sales_found} encontró
                          </span>
                        )}
                        {emp.sales_closed > 0 && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            {emp.sales_closed} cerró
                          </span>
                        )}
                        {emp.total_pending > 0 && (
                          <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                            ${emp.total_pending.toLocaleString()} pendiente
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Total */}
                    <div className="text-right shrink-0">
                      <p className="text-lg font-bold text-emerald-600">
                        ${emp.total_earned.toLocaleString()}
                      </p>
                      <p className="text-xs text-navy-400">
                        {emp.payments.length} comisi{emp.payments.length !== 1 ? 'ones' : 'ón'}
                      </p>
                    </div>

                    <div className="shrink-0">
                      {expandedEmployee === emp.employee_id ? (
                        <ArrowUp className="w-4 h-4 text-navy-400" />
                      ) : (
                        <ArrowDown className="w-4 h-4 text-navy-400" />
                      )}
                    </div>
                  </button>

                  {/* Expanded details */}
                  {expandedEmployee === emp.employee_id && (
                    <div className="border-t border-navy-100 bg-navy-50/30 px-5 py-4">
                      <p className="text-xs font-semibold text-navy-500 uppercase tracking-wide mb-3">
                        Desglose de comisiones
                      </p>
                      <div className="space-y-2">
                        {emp.payments.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center justify-between gap-3 py-2.5 px-3 bg-white rounded-lg border border-navy-100 flex-wrap"
                          >
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                p.role === 'found_by'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {p.role === 'found_by' ? 'Encontró' : 'Cerró'}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                p.sale_type === 'contado'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-purple-50 text-purple-700'
                              }`}>
                                {p.sale_type === 'contado' ? 'Cash' : 'RTO'}
                              </span>
                              {p.property_address && (
                                <span className="text-xs text-navy-400 truncate max-w-[180px]">
                                  {p.property_address}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-3 shrink-0 ml-auto">
                              <span className="font-semibold text-navy-900">
                                ${p.amount.toLocaleString()}
                              </span>
                              {p.status === 'paid' ? (
                                <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium flex items-center gap-1">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Pagada
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-1 rounded-full bg-amber-50 text-amber-700 font-medium flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  Pendiente
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Commission Rules */}
          <div className="mt-8 p-5 bg-navy-50 rounded-xl border border-navy-100">
            <h4 className="font-semibold text-navy-800 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold-500" />
              Reglas de Comisión
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-emerald-700">Venta Cash</span>
                <p className="text-navy-600 mt-1">$1,500 total</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-purple-700">Venta RTO</span>
                <p className="text-navy-600 mt-1">$1,000 total</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-blue-700">Misma persona</span>
                <p className="text-navy-600 mt-1">100% de la comisión</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-amber-700">Dos personas</span>
                <p className="text-navy-600 mt-1">50% encontró / 50% cerró</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}

// ============================================================================
// EQUIPO TAB
// ============================================================================

function EquipoTab() {
  const [users, setUsers] = useState<TeamUser[]>([])
  const [loading, setLoading] = useState(true)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/team/users?include_inactive=true')
      if (res.ok) {
        const data = await res.json()
        setUsers(data.users || [])
      }
    } catch (error) {
      console.error('Error fetching team:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const handleToggleActive = async (userId: string, currentActive: boolean) => {
    setTogglingId(userId)
    try {
      const res = await fetch(`/api/team/users/${userId}/active?is_active=${!currentActive}`, {
        method: 'PATCH',
      })
      if (res.ok) {
        await fetchUsers()
      }
    } catch (error) {
      console.error('Error toggling user:', error)
    } finally {
      setTogglingId(null)
    }
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="font-semibold text-navy-800 flex items-center gap-2">
          <Users className="w-5 h-5 text-gold-500" />
          Empleados ({users.length})
        </h3>
        <p className="text-sm text-navy-400">
          Los empleados se registran desde la pantalla de login
        </p>
      </div>

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
        </div>
      ) : users.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <Users className="w-12 h-12 text-navy-200 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-navy-600 mb-2">Sin empleados</h3>
          <p className="text-navy-400 text-sm">
            Crea un empleado para empezar a asignar comisiones.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {users.map((user) => (
            <div
              key={user.id}
              className={`card-luxury p-4 flex items-center gap-4 ${!user.is_active ? 'opacity-60' : ''}`}
            >
              {/* Avatar */}
              <div className="w-10 h-10 rounded-full bg-navy-100 flex items-center justify-center shrink-0">
                <span className="text-sm font-bold text-navy-600">
                  {user.name?.charAt(0)?.toUpperCase() || '?'}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-navy-900 truncate">{user.name}</p>
                  {!user.is_active && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-red-50 text-red-600 font-medium">
                      Inactivo
                    </span>
                  )}
                </div>
                <p className="text-sm text-navy-400 truncate">{user.email}</p>
              </div>

              {/* Role Badge */}
              <div className="shrink-0 flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full bg-navy-100 text-navy-700 font-medium">
                  {ROLE_LABELS[user.role] || user.role}
                </span>
                {COMMISSION_ELIGIBLE_ROLES.includes(user.role) && (
                  <span className="text-xs px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 font-medium flex items-center gap-1">
                    <DollarSign className="w-3 h-3" />
                    Comisiones
                  </span>
                )}
              </div>

              {/* Toggle Active */}
              <button
                onClick={() => handleToggleActive(user.id, user.is_active)}
                disabled={togglingId === user.id}
                className="shrink-0 p-1.5 rounded-lg hover:bg-navy-50 transition-colors"
                title={user.is_active ? 'Desactivar' : 'Activar'}
              >
                {togglingId === user.id ? (
                  <Loader2 className="w-5 h-5 animate-spin text-navy-400" />
                ) : user.is_active ? (
                  <ToggleRight className="w-6 h-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="w-6 h-6 text-navy-300" />
                )}
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Role Legend */}
      <div className="mt-8 p-5 bg-navy-50 rounded-xl border border-navy-100">
        <h4 className="font-semibold text-navy-800 mb-3 flex items-center gap-2">
          <Shield className="w-4 h-4 text-gold-500" />
          Roles y Permisos
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="p-3 bg-white rounded-lg border border-navy-100">
            <span className="font-medium text-navy-800">Operaciones</span>
            <p className="text-navy-500 mt-1">Compra, renueva y vende. Gana comisiones.</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-navy-100">
            <span className="font-medium text-navy-800">Tesorería</span>
            <p className="text-navy-500 mt-1">Pagos, contabilidad. Ve todas las comisiones.</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-navy-100">
            <span className="font-medium text-navy-800">Encargado Yard</span>
            <p className="text-navy-500 mt-1">Gestiona yards y propiedades asignadas.</p>
          </div>
          <div className="p-3 bg-white rounded-lg border border-navy-100">
            <span className="font-medium text-navy-800">Administrador</span>
            <p className="text-navy-500 mt-1">Acceso total a todos los portales.</p>
          </div>
        </div>
      </div>
    </>
  )
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: 'emerald' | 'blue' | 'amber'
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
  }

  const iconColorMap = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    amber: 'text-amber-500',
  }

  return (
    <div className={`p-5 rounded-xl border ${colorMap[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-80">{label}</span>
        <Icon className={`w-5 h-5 ${iconColorMap[color]}`} />
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
