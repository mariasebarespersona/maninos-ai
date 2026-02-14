'use client'

import React, { useState, useEffect } from 'react'
import {
  Award,
  DollarSign,
  TrendingUp,
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  Trophy,
  Loader2,
  ArrowUp,
  ArrowDown,
} from 'lucide-react'

interface EmployeeCommission {
  employee_id: string
  name: string
  total_earned: number
  sales_found: number
  sales_closed: number
  details: {
    sale_id: string
    role: 'found_by' | 'sold_by'
    amount: number
    sale_type: string
  }[]
}

interface CommissionReport {
  month: number
  year: number
  total_sales: number
  total_commission: number
  employees: EmployeeCommission[]
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
]

export default function CommissionsPage() {
  const today = new Date()
  const [month, setMonth] = useState(today.getMonth() + 1)
  const [year, setYear] = useState(today.getFullYear())
  const [report, setReport] = useState<CommissionReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null)

  useEffect(() => {
    fetchReport()
  }, [month, year])

  const fetchReport = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/sales/commissions/report?month=${month}&year=${year}`)
      if (res.ok) {
        const data = await res.json()
        setReport(data)
      }
    } catch (error) {
      console.error('Error fetching commission report:', error)
    } finally {
      setLoading(false)
    }
  }

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12)
      setYear(y => y - 1)
    } else {
      setMonth(m => m - 1)
    }
  }

  const nextMonth = () => {
    if (month === 12) {
      setMonth(1)
      setYear(y => y + 1)
    } else {
      setMonth(m => m + 1)
    }
  }

  const isCurrentMonth = month === today.getMonth() + 1 && year === today.getFullYear()

  return (
    <div className="max-w-4xl mx-auto animate-fade-in">
      {/* Header */}
      <div className="mb-8">
        <h1 className="font-serif text-2xl text-navy-900 flex items-center gap-3">
          <Award className="w-7 h-7 text-gold-500" />
          Comisiones
        </h1>
        <p className="text-navy-500 mt-1">
          Reporte mensual de comisiones por empleado
        </p>
      </div>

      {/* Month Selector */}
      <div className="flex items-center justify-center gap-4 mb-8">
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
      ) : !report ? (
        <div className="text-center py-20 text-navy-400">
          Error al cargar reporte
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            <SummaryCard
              label="Total Comisiones"
              value={`$${report.total_commission.toLocaleString()}`}
              icon={DollarSign}
              color="emerald"
            />
            <SummaryCard
              label="Ventas del Mes"
              value={report.total_sales.toString()}
              icon={TrendingUp}
              color="blue"
            />
            <SummaryCard
              label="Empleados con Comisión"
              value={report.employees.length.toString()}
              icon={Users}
              color="purple"
            />
          </div>

          {/* Employee Rankings */}
          {report.employees.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <Award className="w-12 h-12 text-navy-200 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-navy-600 mb-2">
                Sin comisiones este mes
              </h3>
              <p className="text-navy-400 text-sm">
                No hay ventas con comisiones asignadas en {MONTH_NAMES[month - 1]} {year}.
                <br />
                Las comisiones se generan al crear ventas y asignar empleados.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="font-semibold text-navy-800 flex items-center gap-2">
                <Trophy className="w-5 h-5 text-gold-500" />
                Ranking del Mes
              </h3>

              {report.employees.map((emp, index) => (
                <div key={emp.employee_id} className="card-luxury overflow-hidden">
                  {/* Main row */}
                  <button
                    onClick={() => setExpandedEmployee(
                      expandedEmployee === emp.employee_id ? null : emp.employee_id
                    )}
                    className="w-full p-5 flex items-center gap-4 text-left hover:bg-navy-50/50 transition-colors"
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
                      <p className="font-semibold text-navy-900 truncate">
                        {emp.name}
                      </p>
                      <div className="flex gap-4 mt-1">
                        {emp.sales_found > 0 && (
                          <span className="text-xs text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                            🔍 {emp.sales_found} encontró
                          </span>
                        )}
                        {emp.sales_closed > 0 && (
                          <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                            🤝 {emp.sales_closed} cerró
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
                        {emp.details.length} venta{emp.details.length !== 1 ? 's' : ''}
                      </p>
                    </div>

                    {/* Expand icon */}
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
                        Desglose de ventas
                      </p>
                      <div className="space-y-2">
                        {emp.details.map((detail, i) => (
                          <div
                            key={`${detail.sale_id}-${i}`}
                            className="flex items-center justify-between py-2 px-3 bg-white rounded-lg border border-navy-100"
                          >
                            <div className="flex items-center gap-3">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                                detail.role === 'found_by'
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-emerald-50 text-emerald-700'
                              }`}>
                                {detail.role === 'found_by' ? '🔍 Encontró' : '🤝 Cerró'}
                              </span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                detail.sale_type === 'contado'
                                  ? 'bg-green-50 text-green-700'
                                  : 'bg-purple-50 text-purple-700'
                              }`}>
                                {detail.sale_type === 'contado' ? 'Cash' : 'RTO'}
                              </span>
                            </div>
                            <span className="font-semibold text-navy-900">
                              ${detail.amount.toLocaleString()}
                            </span>
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
                <span className="font-medium text-emerald-700">💵 Venta Cash</span>
                <p className="text-navy-600 mt-1">$1,500 total</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-purple-700">🏛️ Venta RTO</span>
                <p className="text-navy-600 mt-1">$1,000 total</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-blue-700">👤 Misma persona</span>
                <p className="text-navy-600 mt-1">100% de la comisión</p>
              </div>
              <div className="p-3 bg-white rounded-lg border border-navy-100">
                <span className="font-medium text-amber-700">👥 Dos personas</span>
                <p className="text-navy-600 mt-1">50% encontró / 50% cerró</p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: string
  icon: React.ElementType
  color: 'emerald' | 'blue' | 'purple'
}) {
  const colorMap = {
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
  }

  const iconColorMap = {
    emerald: 'text-emerald-500',
    blue: 'text-blue-500',
    purple: 'text-purple-500',
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

