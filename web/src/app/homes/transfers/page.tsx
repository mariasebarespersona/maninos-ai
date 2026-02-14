'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { 
  FileText, 
  Filter,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react'
import TitleTransferCard from '@/components/TitleTransferCard'
import { useToast } from '@/components/ui/Toast'

interface Transfer {
  id: string
  property_id: string
  transfer_type: 'purchase' | 'sale'
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled'
  from_name: string
  to_name: string
  documents_checklist: Record<string, boolean>
  property_address: string
  created_at: string
}

interface Stats {
  total: number
  pending_purchases: number
  pending_sales: number
  by_status: Record<string, number>
}

export default function TransfersPage() {
  const toast = useToast()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')

  const fetchData = async () => {
    setLoading(true)
    try {
      const [transfersRes, statsRes] = await Promise.all([
        fetch('/api/transfers'),
        fetch('/api/transfers?stats=true'), // We'll use the main endpoint
      ])

      if (transfersRes.ok) {
        const data = await transfersRes.json()
        setTransfers(data)
        
        // Calculate stats from data
        const calcStats: Stats = {
          total: data.length,
          pending_purchases: data.filter((t: Transfer) => 
            t.transfer_type === 'purchase' && ['pending', 'in_progress'].includes(t.status)
          ).length,
          pending_sales: data.filter((t: Transfer) => 
            t.transfer_type === 'sale' && ['pending', 'in_progress'].includes(t.status)
          ).length,
          by_status: {
            pending: data.filter((t: Transfer) => t.status === 'pending').length,
            in_progress: data.filter((t: Transfer) => t.status === 'in_progress').length,
            completed: data.filter((t: Transfer) => t.status === 'completed').length,
          }
        }
        setStats(calcStats)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error al cargar transferencias')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [])

  const filteredTransfers = transfers.filter(t => {
    if (filter === 'pending') return ['pending', 'in_progress'].includes(t.status)
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  // Group by type
  const purchaseTransfers = filteredTransfers.filter(t => t.transfer_type === 'purchase')
  const saleTransfers = filteredTransfers.filter(t => t.transfer_type === 'sale')

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Documentos</h1>
          <p className="text-navy-500 text-sm mt-1">
            Gestión de documentos de compras y ventas
          </p>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="card-luxury p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <FileText className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-navy-500">Docs Compra Pendientes</p>
                <p className="text-2xl font-bold text-navy-900">{stats.pending_purchases}</p>
              </div>
            </div>
          </div>
          
          <div className="card-luxury p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <FileText className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm text-navy-500">Docs Venta Pendientes</p>
                <p className="text-2xl font-bold text-navy-900">{stats.pending_sales}</p>
              </div>
            </div>
          </div>
          
          <div className="card-luxury p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gold-100 rounded-lg">
                <CheckCircle2 className="w-5 h-5 text-gold-600" />
              </div>
              <div>
                <p className="text-sm text-navy-500">Completados</p>
                <p className="text-2xl font-bold text-navy-900">{stats.by_status.completed || 0}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 border-b border-navy-100 pb-2">
        {[
          { key: 'pending', label: 'Pendientes', icon: Clock },
          { key: 'completed', label: 'Completadas', icon: CheckCircle2 },
          { key: 'all', label: 'Todas', icon: Filter },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setFilter(key as typeof filter)}
            className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all ${
              filter === key
                ? 'bg-gold-100 text-gold-700'
                : 'text-navy-500 hover:bg-navy-50'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <FileText className="w-12 h-12 text-navy-300 mx-auto mb-4" />
          <h3 className="font-serif text-xl text-navy-900 mb-2">Sin transferencias</h3>
          <p className="text-navy-500">
            {filter === 'pending' 
              ? 'No hay transferencias pendientes' 
              : 'No hay transferencias registradas'}
          </p>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Purchase Documents */}
          {purchaseTransfers.length > 0 && (
            <div>
              <h2 className="font-medium text-navy-900 mb-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500" />
                Documentos de Compra (casas adquiridas)
              </h2>
              <div className="space-y-3">
                {purchaseTransfers.map(transfer => (
                  <TitleTransferCard 
                    key={transfer.id} 
                    transfer={transfer}
                    onUpdate={fetchData}
                    showProperty
                  />
                ))}
              </div>
            </div>
          )}

          {/* Sale Documents */}
          {saleTransfers.length > 0 && (
            <div>
              <h2 className="font-medium text-navy-900 mb-3 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-emerald-500" />
                Documentos de Venta (casas vendidas al contado)
              </h2>
              <div className="space-y-3">
                {saleTransfers.map(transfer => (
                  <TitleTransferCard 
                    key={transfer.id} 
                    transfer={transfer}
                    onUpdate={fetchData}
                    showProperty
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Help Text */}
      <div className="p-4 bg-navy-50 rounded-lg border border-navy-100">
        <h4 className="font-medium text-navy-900 mb-2 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          ¿Qué son estos documentos?
        </h4>
        <ul className="text-sm text-navy-600 space-y-1">
          <li>• <strong>Documentos de Compra:</strong> Se crean cuando Maninos compra una casa a un vendedor</li>
          <li>• <strong>Documentos de Venta:</strong> Se crean cuando un cliente compra una casa al contado</li>
          <li>• Marca cada documento como completado cuando lo tengas listo</li>
          <li>• Cuando todos estén listos, podrás marcar la transacción como completada</li>
        </ul>
      </div>
    </div>
  )
}

