'use client'

import React from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  ComposedChart,
  Line,
  Legend,
} from 'recharts'

interface SalesData {
  month: string
  ventas: number
  ingresos: number
  compras?: number
  gastoCompras?: number
}

interface SalesChartProps {
  data: SalesData[]
  type?: 'area' | 'bar' | 'composed'
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div
        className="rounded-xl border px-4 py-3"
        style={{
          background: 'rgba(255,255,255,0.97)',
          borderColor: '#e2e8f0',
          boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <p className="font-semibold text-sm mb-2" style={{ color: '#1e293b' }}>
          {label}
        </p>
        {payload.map((entry: any, index: number) => {
          const labels: Record<string, string> = {
            ingresos: '💰 Ventas',
            gastoCompras: '🏠 Compras',
            ventas: '📊 # Ventas',
            compras: '📊 # Compras',
          }
          const isCurrency = ['ingresos', 'gastoCompras'].includes(entry.dataKey)
          return (
            <div key={index} className="flex items-center gap-2 text-sm py-0.5">
              <div
                className="w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span style={{ color: '#64748b' }}>
                {labels[entry.dataKey] || entry.name}:
              </span>
              <span className="font-medium" style={{ color: '#1e293b' }}>
                {isCurrency ? `$${entry.value.toLocaleString()}` : entry.value}
              </span>
            </div>
          )
        })}
      </div>
    )
  }
  return null
}

const CustomLegend = ({ payload }: any) => {
  if (!payload) return null
  const labels: Record<string, string> = {
    ingresos: 'Ventas ($)',
    gastoCompras: 'Compras ($)',
    ventas: '# Ventas',
    compras: '# Compras',
  }
  return (
    <div className="flex items-center justify-center gap-5 mt-2 mb-1">
      {payload.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-1.5 text-xs">
          <div
            className="w-2.5 h-2.5 rounded-full"
            style={{ backgroundColor: entry.color }}
          />
          <span style={{ color: '#64748b' }}>
            {labels[entry.dataKey] || entry.value}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function SalesChart({ data, type = 'composed' }: SalesChartProps) {
  const hasAnyData = data.some(
    (d) => d.ventas > 0 || d.ingresos > 0 || (d.compras ?? 0) > 0 || (d.gastoCompras ?? 0) > 0
  )

  if (data.length === 0 || !hasAnyData) {
    return (
      <div className="h-64 flex flex-col items-center justify-center gap-2">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' }}>
          <span className="text-xl">📊</span>
        </div>
        <p className="text-sm font-medium" style={{ color: '#94a3b8' }}>
          Sin datos en este período
        </p>
        <p className="text-xs" style={{ color: '#cbd5e1' }}>
          Los datos aparecerán al registrar compras y ventas
        </p>
      </div>
    )
  }

  // Composed chart: bars for dollar amounts, line for counts
  if (type === 'composed') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="gradIngresos" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#10b981" stopOpacity={0.4} />
            </linearGradient>
            <linearGradient id="gradCompras" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.9} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.4} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
            dy={8}
          />
          <YAxis
            yAxisId="left"
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
            width={55}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend content={<CustomLegend />} />
          <Bar
            yAxisId="left"
            dataKey="gastoCompras"
            fill="url(#gradCompras)"
            radius={[6, 6, 0, 0]}
            name="Compras ($)"
            barSize={24}
          />
          <Bar
            yAxisId="left"
            dataKey="ingresos"
            fill="url(#gradIngresos)"
            radius={[6, 6, 0, 0]}
            name="Ventas ($)"
            barSize={24}
          />
        </ComposedChart>
      </ResponsiveContainer>
    )
  }

  if (type === 'bar') {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#94a3b8', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="ventas" fill="#3b82f6" radius={[6, 6, 0, 0]} name="ventas" barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    )
  }

  // Area chart (fallback)
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="colorIngresos" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
            <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 500 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: '#94a3b8', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Area
          type="monotone"
          dataKey="ingresos"
          stroke="#10b981"
          strokeWidth={2.5}
          fillOpacity={1}
          fill="url(#colorIngresos)"
          name="ingresos"
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
