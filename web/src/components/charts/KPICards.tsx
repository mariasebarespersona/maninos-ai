'use client'

import React from 'react'
import { TrendingUp, TrendingDown, DollarSign, Clock, Percent, Home } from 'lucide-react'

/**
 * KPI Cards Component
 * "Institutional Warmth" Design
 * Large, clear, easy to read for 40+ users
 */

interface KPI {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon: React.ElementType
  color: 'gold' | 'emerald' | 'blue' | 'purple'
}

interface KPICardsProps {
  kpis: KPI[]
}

const colorClasses = {
  gold: {
    bg: 'bg-gradient-to-br from-gold-50 via-white to-gold-50/50',
    icon: 'bg-gradient-to-br from-gold-400 to-gold-600 text-white shadow-gold',
    border: 'border-gold-200/60',
    value: 'text-gold-700',
    label: 'text-gold-600',
  },
  emerald: {
    bg: 'bg-gradient-to-br from-emerald-50 via-white to-emerald-50/50',
    icon: 'bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-emerald-500/25',
    border: 'border-emerald-200/60',
    value: 'text-emerald-700',
    label: 'text-emerald-600',
  },
  blue: {
    bg: 'bg-gradient-to-br from-blue-50 via-white to-blue-50/50',
    icon: 'bg-gradient-to-br from-blue-500 to-blue-700 text-white shadow-blue-500/25',
    border: 'border-blue-200/60',
    value: 'text-blue-700',
    label: 'text-blue-600',
  },
  purple: {
    bg: 'bg-gradient-to-br from-purple-50 via-white to-purple-50/50',
    icon: 'bg-gradient-to-br from-purple-500 to-purple-700 text-white shadow-purple-500/25',
    border: 'border-purple-200/60',
    value: 'text-purple-700',
    label: 'text-purple-600',
  },
}

export default function KPICards({ kpis }: KPICardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-5">
      {kpis.map((kpi, index) => {
        const colors = colorClasses[kpi.color]
        const Icon = kpi.icon
        const isPositive = kpi.change && kpi.change > 0
        const isNegative = kpi.change && kpi.change < 0

        return (
          <div 
            key={index}
            className={`
              relative overflow-hidden p-6 rounded-2xl border-2 
              ${colors.bg} ${colors.border}
              transition-all duration-300 hover:shadow-card hover:-translate-y-1
            `}
          >
            {/* Background decoration */}
            <div className="absolute -top-8 -right-8 w-24 h-24 bg-current opacity-[0.03] rounded-full" />
            
            <div className="relative">
              {/* Icon */}
              <div className={`w-14 h-14 rounded-2xl ${colors.icon} flex items-center justify-center mb-4`}>
                <Icon className="w-7 h-7" strokeWidth={2} />
              </div>
              
              {/* Value */}
              <p className={`text-3xl font-bold ${colors.value} tracking-tight`}>
                {kpi.value}
              </p>
              
              {/* Label */}
              <p className="text-base font-semibold text-navy-600 mt-2">
                {kpi.label}
              </p>
              
              {/* Change indicator or sublabel */}
              {kpi.change !== undefined ? (
                <div className={`
                  mt-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-semibold
                  ${isPositive 
                    ? 'bg-emerald-100 text-emerald-700' 
                    : isNegative 
                      ? 'bg-red-100 text-red-700' 
                      : 'bg-navy-100 text-navy-600'
                  }
                `}>
                  {isPositive && <TrendingUp className="w-4 h-4" />}
                  {isNegative && <TrendingDown className="w-4 h-4" />}
                  {kpi.change > 0 ? '+' : ''}{kpi.change}%
                </div>
              ) : kpi.changeLabel ? (
                <p className="text-sm text-navy-400 mt-2">{kpi.changeLabel}</p>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// Helper function to calculate KPIs from data
export function calculateKPIs(data: {
  properties: any[]
  sales: any[]
  totalRevenue: number
}): KPI[] {
  const { properties, sales, totalRevenue } = data
  
  // Average sale price
  const completedSales = sales.filter((s: any) => s.status === 'completed')
  const avgSalePrice = completedSales.length > 0
    ? totalRevenue / completedSales.length
    : 0
  
  // Properties in pipeline
  const inPipeline = properties.filter((p: any) => 
    p.status !== 'sold'
  ).length

  // Average margin (if we have purchase and sale prices)
  const salesWithMargin = completedSales.filter((s: any) => 
    s.final_price && s.properties?.purchase_price
  )
  const avgMargin = salesWithMargin.length > 0
    ? salesWithMargin.reduce((acc: number, s: any) => {
        const margin = ((s.final_price - s.properties.purchase_price) / s.properties.purchase_price) * 100
        return acc + margin
      }, 0) / salesWithMargin.length
    : 0
  
  // Conversion rate (sold / total)
  const conversionRate = properties.length > 0
    ? (properties.filter((p: any) => p.status === 'sold').length / properties.length) * 100
    : 0

  return [
    {
      label: 'Ingreso Total',
      value: `$${totalRevenue.toLocaleString()}`,
      icon: DollarSign,
      color: 'emerald',
    },
    {
      label: 'Precio Promedio',
      value: `$${Math.round(avgSalePrice).toLocaleString()}`,
      icon: Home,
      color: 'gold',
    },
    {
      label: 'En Pipeline',
      value: inPipeline,
      changeLabel: 'propiedades activas',
      icon: Clock,
      color: 'blue',
    },
    {
      label: 'Tasa de Conversión',
      value: `${conversionRate.toFixed(0)}%`,
      icon: Percent,
      color: 'purple',
    },
  ]
}
