'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { 
  Building2, 
  Users, 
  DollarSign, 
  ArrowRight,
  Loader2,
  RefreshCw,
  Plus,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  Home,
  Paintbrush,
  ShoppingCart,
  BarChart3,
  Truck,
} from 'lucide-react'
import SalesChart from '@/components/charts/SalesChart'
import TexasMap from '@/components/charts/TexasMap'

interface Property {
  id: string
  address: string
  city?: string
  status: string
  purchase_price?: number
  sale_price?: number
  created_at: string
}

interface Sale {
  id: string
  status: string
  final_price?: number
  sale_price?: number
  created_at: string
  property_id?: string
}

interface DashboardStats {
  properties: {
    total: number
    purchased: number
    published: number
    reserved: number
    renovating: number
    sold: number
  }
  clients: {
    total: number
    leads: number
    active: number
    completed: number
  }
  sales: {
    total: number
    pending: number
    paid: number
    completed: number
    total_revenue: number
  }
  financials: {
    totalPurchaseCost: number
    totalSaleValue: number
    avgPurchasePrice: number
    avgSalePrice: number
  }
}

interface MoveStats {
  total_moves: number
  active: number
  upcoming: number
  completed: number
  cancelled: number
  total_cost_completed: number
  pending_cost: number
}

interface SalesData {
  month: string
  ventas: number
  ingresos: number
  compras: number
  gastoCompras: number
}

function getMonthLabels(): string[] {
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  const result: string[] = []
  const now = new Date()
  
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    result.push(`${months[d.getMonth()]} '${d.getFullYear().toString().slice(2)}`)
  }
  return result
}

function processActivityData(properties: Property[], sales: Sale[]): SalesData[] {
  const monthLabels = getMonthLabels()
  const now = new Date()
  const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
  
  const dataMap: Record<string, SalesData> = {}
  monthLabels.forEach(label => {
    dataMap[label] = { month: label, ventas: 0, ingresos: 0, compras: 0, gastoCompras: 0 }
  })
  
  // Property purchases by month
  properties.forEach(prop => {
    const date = new Date(prop.created_at)
    const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
    
    if (monthsDiff >= 0 && monthsDiff < 6) {
      const label = `${months[date.getMonth()]} '${date.getFullYear().toString().slice(2)}`
      if (dataMap[label]) {
        dataMap[label].compras += 1
        dataMap[label].gastoCompras += Number(prop.purchase_price) || 0
      }
    }
  })
  
  // Sales by month (both completed sales and sold properties)
  const completedSales = sales.filter(s => s.status === 'completed')
  completedSales.forEach(sale => {
    const date = new Date(sale.created_at)
    const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
    
    if (monthsDiff >= 0 && monthsDiff < 6) {
      const label = `${months[date.getMonth()]} '${date.getFullYear().toString().slice(2)}`
      if (dataMap[label]) {
        dataMap[label].ventas += 1
        dataMap[label].ingresos += Number(sale.final_price || sale.sale_price) || 0
      }
    }
  })

  // Also count sold properties with sale_price
  properties.filter(p => p.status === 'sold' && p.sale_price).forEach(prop => {
    const date = new Date(prop.created_at)
    const monthsDiff = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth())
    
    if (monthsDiff >= 0 && monthsDiff < 6) {
      const label = `${months[date.getMonth()]} '${date.getFullYear().toString().slice(2)}`
      if (dataMap[label] && dataMap[label].ingresos === 0) {
        dataMap[label].ingresos += Number(prop.sale_price) || 0
      }
    }
  })
  
  return monthLabels.map(month => dataMap[month])
}

export default function HomesDashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [properties, setProperties] = useState<Property[]>([])
  const [sales, setSales] = useState<Sale[]>([])
  const [moveStats, setMoveStats] = useState<MoveStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchStats = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)

    try {
      const [propsRes, clientsRes, salesRes, movesRes] = await Promise.all([
        fetch('/api/properties'),
        fetch('/api/clients/summary'),
        fetch('/api/sales'),
        fetch('/api/moves/summary/stats').catch(() => null),
      ])

      const propsData: Property[] = await propsRes.json()
      const clientsData = await clientsRes.json()
      const salesData: Sale[] = await salesRes.json()

      if (movesRes && movesRes.ok) {
        try { setMoveStats(await movesRes.json()) } catch { /* ignore */ }
      }

      setProperties(propsData)
      setSales(salesData)

      const propStats = {
        total: propsData.length,
        purchased: propsData.filter(p => p.status === 'purchased').length,
        published: propsData.filter(p => p.status === 'published').length,
        reserved: propsData.filter(p => p.status === 'reserved').length,
        renovating: propsData.filter(p => p.status === 'renovating').length,
        sold: propsData.filter(p => p.status === 'sold').length,
      }

      const completedSales = salesData.filter(s => s.status === 'completed')
      const totalRevenue = completedSales.reduce((sum, s) => sum + (Number(s.final_price) || 0), 0)
        || propsData.filter(p => p.status === 'sold').reduce((sum, p) => sum + (Number(p.sale_price) || 0), 0)
      
      const totalPurchaseCost = propsData.reduce((sum, p) => sum + (Number(p.purchase_price) || 0), 0)
      const totalSaleValue = propsData.reduce((sum, p) => sum + (Number(p.sale_price) || 0), 0)
      const propsWithPrice = propsData.filter(p => p.purchase_price && p.purchase_price > 1)

      setStats({
        properties: propStats,
        clients: clientsData,
        sales: {
          total: salesData.length,
          pending: salesData.filter(s => s.status === 'pending').length,
          paid: salesData.filter(s => s.status === 'paid').length,
          completed: completedSales.length,
          total_revenue: totalRevenue,
        },
        financials: {
          totalPurchaseCost,
          totalSaleValue,
          avgPurchasePrice: propsWithPrice.length > 0 ? totalPurchaseCost / propsWithPrice.length : 0,
          avgSalePrice: propStats.sold > 0 
            ? propsData.filter(p => p.status === 'sold').reduce((s, p) => s + (Number(p.sale_price) || 0), 0) / propStats.sold 
            : 0,
        },
      })
    } catch (error) {
      console.error('Error fetching stats:', error)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    fetchStats()
  }, [])

  const chartData = processActivityData(properties, sales)

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-3">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#94a3b8' }} />
        <p className="text-sm" style={{ color: '#94a3b8' }}>Cargando panel...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            Panel Principal
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)' }}>
            Resumen de actividad · {new Date().toLocaleDateString('es-MX', { month: 'long', year: 'numeric' })}
          </p>
        </div>
        <button
          onClick={() => fetchStats(true)}
          disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
          style={{
            background: refreshing ? '#f1f5f9' : 'white',
            color: '#475569',
            border: '1px solid #e2e8f0',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Propiedades"
          value={stats?.properties.total ?? 0}
          icon={Building2}
          color="#3b82f6"
          bgColor="#eff6ff"
          subtitle={`${stats?.properties.published ?? 0} publicadas`}
        />
        <StatCard
          label="Clientes"
          value={stats?.clients.total ?? 0}
          icon={Users}
          color="#8b5cf6"
          bgColor="#f5f3ff"
          subtitle={`${stats?.clients.active ?? 0} activos`}
        />
        <StatCard
          label="Ventas"
          value={stats?.sales.completed ?? 0}
          icon={CheckCircle}
          color="#10b981"
          bgColor="#ecfdf5"
          subtitle={`de ${stats?.sales.total ?? 0} total`}
        />
        <StatCard
          label="Inversión Total"
          value={`$${((stats?.financials.totalPurchaseCost ?? 0) / 1000).toFixed(0)}k`}
          icon={DollarSign}
          color="#d4a853"
          bgColor="#fefce8"
          subtitle={`Ø $${((stats?.financials.avgPurchasePrice ?? 0) / 1000).toFixed(1)}k por casa`}
          highlight
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Activity Chart */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'white',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-serif text-lg font-semibold" style={{ color: '#1e293b' }}>
                Actividad Financiera
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                Compras vs Ventas · Últimos 6 meses
              </p>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: '#f0fdf4' }}>
              <TrendingUp className="w-3.5 h-3.5" style={{ color: '#10b981' }} />
              <span className="text-xs font-medium" style={{ color: '#10b981' }}>
                {properties.length} props
              </span>
            </div>
          </div>
          <SalesChart data={chartData} type="composed" />
        </div>

        {/* Texas Map */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'white',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="font-serif text-lg font-semibold" style={{ color: '#1e293b' }}>
                Propiedades en Texas
              </h2>
              <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
                Distribución geográfica
              </p>
            </div>
            <div className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: '#eff6ff' }}>
              <Home className="w-3.5 h-3.5" style={{ color: '#3b82f6' }} />
              <span className="text-xs font-medium" style={{ color: '#3b82f6' }}>
                {properties.length} total
              </span>
            </div>
          </div>
          <TexasMap properties={properties} />
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <QuickAction
          href="/homes/properties/new"
          icon={Plus}
          title="Nueva Propiedad"
          description="Registrar casa comprada"
          color="#3b82f6"
          bgColor="#eff6ff"
        />
        <QuickAction
          href="/homes/sales/new"
          icon={DollarSign}
          title="Nueva Venta"
          description="Iniciar cierre de venta"
          color="#10b981"
          bgColor="#ecfdf5"
        />
        <QuickAction
          href="/homes/properties"
          icon={Building2}
          title="Ver Propiedades"
          description="Gestionar inventario"
          color="#8b5cf6"
          bgColor="#f5f3ff"
        />
      </div>

      {/* Pipeline + Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Property Pipeline */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'white',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-2 mb-5">
            <BarChart3 className="w-5 h-5" style={{ color: '#475569' }} />
            <h2 className="font-serif text-lg font-semibold" style={{ color: '#1e293b' }}>
              Pipeline de Propiedades
            </h2>
          </div>
          <div className="space-y-4">
            <PipelineRow 
              label="Compradas" 
              count={stats?.properties.purchased ?? 0} 
              total={stats?.properties.total ?? 1}
              color="#3b82f6"
              icon={ShoppingCart}
            />
            <PipelineRow 
              label="Publicadas" 
              count={stats?.properties.published ?? 0} 
              total={stats?.properties.total ?? 1}
              color="#10b981"
              icon={Home}
            />
            <PipelineRow 
              label="Reservadas" 
              count={stats?.properties.reserved ?? 0} 
              total={stats?.properties.total ?? 1}
              color="#8b5cf6"
              icon={Clock}
            />
            <PipelineRow 
              label="En Renovación" 
              count={stats?.properties.renovating ?? 0} 
              total={stats?.properties.total ?? 1}
              color="#f59e0b"
              icon={Paintbrush}
            />
            <PipelineRow 
              label="Vendidas" 
              count={stats?.properties.sold ?? 0} 
              total={stats?.properties.total ?? 1}
              color="#d4a853"
              icon={CheckCircle}
            />
          </div>
        </div>

        {/* Sales Summary */}
        <div
          className="rounded-xl p-6"
          style={{
            background: 'white',
            border: '1px solid #f1f5f9',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-2 mb-5">
            <DollarSign className="w-5 h-5" style={{ color: '#475569' }} />
            <h2 className="font-serif text-lg font-semibold" style={{ color: '#1e293b' }}>
              Resumen Financiero
            </h2>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <MiniStat 
              label="Ventas Pendientes" 
              value={stats?.sales.pending ?? 0} 
              color="#f59e0b"
              bgColor="#fffbeb"
            />
            <MiniStat 
              label="Pagadas" 
              value={stats?.sales.paid ?? 0} 
              color="#3b82f6"
              bgColor="#eff6ff"
            />
            <MiniStat 
              label="Completadas" 
              value={stats?.sales.completed ?? 0} 
              color="#10b981"
              bgColor="#ecfdf5"
            />
            <MiniStat 
              label="Total Ventas" 
              value={stats?.sales.total ?? 0} 
              color="#1e293b"
              bgColor="#f8fafc"
            />
          </div>
          
          {/* Financial highlights */}
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid #f1f5f9' }}>
            <div className="space-y-2.5">
              <FinancialRow 
                label="Costo Total Compras" 
                value={stats?.financials.totalPurchaseCost ?? 0}
                icon={TrendingDown}
                color="#ef4444"
              />
              <FinancialRow 
                label="Valor Total Ventas" 
                value={stats?.financials.totalSaleValue ?? 0}
                icon={TrendingUp}
                color="#10b981"
              />
              <FinancialRow 
                label="Margen Potencial" 
                value={(stats?.financials.totalSaleValue ?? 0) - (stats?.financials.totalPurchaseCost ?? 0)}
                icon={DollarSign}
                color="#d4a853"
                bold
              />
              {(moveStats && moveStats.total_cost_completed > 0) && (
                <FinancialRow 
                  label="Costo Movidas (completadas)" 
                  value={moveStats.total_cost_completed}
                  icon={Truck}
                  color="#f97316"
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Active Moves Widget (only when there are active moves) */}
      {moveStats && moveStats.active > 0 && (
        <div
          className="rounded-xl p-5 flex items-center gap-4"
          style={{
            background: 'linear-gradient(135deg, #fff7ed, #fff)',
            border: '1px solid #fed7aa',
            boxShadow: '0 1px 3px rgba(249,115,22,0.08)',
          }}
        >
          <div className="p-3 rounded-xl" style={{ backgroundColor: '#fff7ed' }}>
            <Truck className="w-6 h-6" style={{ color: '#f97316' }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold" style={{ color: '#1e293b' }}>
              {moveStats.active} movida{moveStats.active !== 1 ? 's' : ''} activa{moveStats.active !== 1 ? 's' : ''}
            </p>
            <p className="text-xs" style={{ color: '#94a3b8' }}>
              {moveStats.upcoming > 0 ? `${moveStats.upcoming} próxima${moveStats.upcoming !== 1 ? 's' : ''} · ` : ''}
              {moveStats.total_moves} total · ${moveStats.pending_cost.toLocaleString()} costo pendiente
            </p>
          </div>
          <Link
            href="/homes/properties"
            className="text-xs font-medium px-3 py-1.5 rounded-lg transition-all hover:shadow-sm"
            style={{ color: '#f97316', background: '#fff7ed', border: '1px solid #fed7aa' }}
          >
            Ver Detalle →
          </Link>
        </div>
      )}
    </div>
  )
}

// --- Components ---

function StatCard({ 
  label, 
  value, 
  icon: Icon,
  color,
  bgColor,
  subtitle,
  highlight,
}: { 
  label: string
  value: string | number
  icon: React.ElementType
  color: string
  bgColor: string
  subtitle?: string
  highlight?: boolean
}) {
  return (
    <div
      className="rounded-xl p-5 transition-all hover:shadow-md"
      style={{
        background: 'white',
        border: '1px solid #f1f5f9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-2xl font-bold font-serif tracking-tight" style={{ color: '#1e293b' }}>
            {value}
          </p>
          <p className="text-sm font-medium mt-1" style={{ color: '#64748b' }}>{label}</p>
          {subtitle && (
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>{subtitle}</p>
          )}
        </div>
        <div
          className="p-2.5 rounded-xl flex-shrink-0"
          style={{ backgroundColor: bgColor }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
      </div>
    </div>
  )
}

function QuickAction({ 
  href, 
  icon: Icon, 
  title, 
  description,
  color,
  bgColor,
}: { 
  href: string
  icon: React.ElementType
  title: string
  description: string
  color: string
  bgColor: string
}) {
  return (
    <Link
      href={href}
      className="rounded-xl p-5 flex items-center gap-4 group transition-all hover:shadow-md"
      style={{
        background: 'white',
        border: '1px solid #f1f5f9',
        boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
      }}
    >
      <div className="p-3 rounded-xl" style={{ backgroundColor: bgColor }}>
        <Icon className="w-5 h-5" style={{ color }} />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-sm" style={{ color: '#1e293b' }}>{title}</p>
        <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>{description}</p>
      </div>
      <ArrowRight 
        className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-all group-hover:translate-x-0.5" 
        style={{ color: '#94a3b8' }} 
      />
    </Link>
  )
}

function PipelineRow({ 
  label, 
  count, 
  total,
  color,
  icon: Icon,
}: { 
  label: string
  count: number
  total: number
  color: string
  icon: React.ElementType
}) {
  const percentage = total > 0 ? (count / total) * 100 : 0
  
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" style={{ color }} />
          <span className="text-sm font-medium" style={{ color: '#475569' }}>{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-bold" style={{ color: '#1e293b' }}>{count}</span>
          <span className="text-xs" style={{ color: '#94a3b8' }}>
            ({percentage.toFixed(0)}%)
          </span>
        </div>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: '#f1f5f9' }}>
        <div 
          className="h-full rounded-full transition-all duration-500 ease-out"
          style={{ 
            width: `${Math.max(percentage, count > 0 ? 3 : 0)}%`,
            background: `linear-gradient(90deg, ${color}, ${color}dd)`,
          }}
        />
      </div>
    </div>
  )
}

function MiniStat({ 
  label, 
  value,
  color,
  bgColor,
}: { 
  label: string
  value: number
  color: string
  bgColor: string
}) {
  return (
    <div className="p-3.5 rounded-xl" style={{ backgroundColor: bgColor }}>
      <p className="text-2xl font-bold font-serif" style={{ color }}>{value}</p>
      <p className="text-xs font-medium mt-0.5" style={{ color: '#64748b' }}>{label}</p>
    </div>
  )
}

function FinancialRow({
  label,
  value,
  icon: Icon,
  color,
  bold,
}: {
  label: string
  value: number
  icon: React.ElementType
  color: string
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Icon className="w-3.5 h-3.5" style={{ color }} />
        <span className={`text-sm ${bold ? 'font-semibold' : ''}`} style={{ color: '#475569' }}>
          {label}
        </span>
      </div>
      <span
        className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`}
        style={{ color: bold ? color : '#1e293b' }}
      >
        ${value.toLocaleString()}
      </span>
    </div>
  )
}
