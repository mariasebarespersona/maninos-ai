'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  FileText,
  Filter,
  Loader2,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Eye,
  ExternalLink
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
  tdhca_serial?: string | null
  tdhca_label?: string | null
  tdhca_owner_name?: string | null
  title_name_updated?: boolean
  last_tdhca_check?: string | null
  tdhca_check_count?: number
}

interface Stats {
  total: number
  pending_purchases: number
  pending_sales: number
  by_status: Record<string, number>
}

interface MonitorTransfer {
  id: string
  property_id: string
  transfer_type: string
  to_name: string
  status: string
  tdhca_serial: string
  tdhca_label: string
  tdhca_owner_name: string | null
  title_name_updated: boolean
  last_tdhca_check: string | null
  next_tdhca_check: string | null
  tdhca_check_count: number
  created_at: string
}

interface TitleMonitor {
  total_monitored: number
  title_updated: number
  title_pending: number
  never_checked: number
  no_serial: number
  transfers: MonitorTransfer[]
}

export default function TransfersPage() {
  const toast = useToast()
  const [transfers, setTransfers] = useState<Transfer[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'completed'>('pending')
  const [tab, setTab] = useState<'documents' | 'titulos'>('titulos')
  const [monitor, setMonitor] = useState<TitleMonitor | null>(null)
  const [monitorLoading, setMonitorLoading] = useState(false)
  const [recheckingId, setRecheckingId] = useState<string | null>(null)

  const fetchData = async () => {
    setLoading(true)
    try {
      const transfersRes = await fetch('/api/transfers')
      if (transfersRes.ok) {
        const data = await transfersRes.json()
        setTransfers(data)

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

  const fetchMonitor = async () => {
    setMonitorLoading(true)
    try {
      const res = await fetch('/api/transfers/title-monitor')
      if (res.ok) {
        const data = await res.json()
        setMonitor(data)
      }
    } catch (error) {
      console.error('Error loading title monitor:', error)
    } finally {
      setMonitorLoading(false)
    }
  }

  const handleRecheck = async (transferId: string) => {
    setRecheckingId(transferId)
    try {
      const res = await fetch(`/api/transfers/${transferId}/recheck-title`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        if (data.matched) {
          toast.success('Titulo actualizado - el nombre ya coincide con TDHCA')
        } else if (data.found) {
          toast.success(`TDHCA muestra: "${data.tdhca_owner}" - aun no coincide con "${data.expected_owner}"`)
        } else {
          toast.success('No se encontraron registros en TDHCA')
        }
        fetchMonitor()
      } else {
        toast.error(data.detail || 'Error al verificar titulo')
      }
    } catch {
      toast.error('Error de conexion')
    } finally {
      setRecheckingId(null)
    }
  }

  const handlePopulate = async () => {
    try {
      const res = await fetch('/api/transfers/title-monitor', { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        toast.success(`Datos poblados: ${data.populated} titulos con serial/label`)
        fetchMonitor()
      } else {
        toast.error('Error al poblar datos')
      }
    } catch {
      toast.error('Error de conexion')
    }
  }

  const populateSerials = async () => {
    try {
      await fetch('/api/transfers/title-monitor', { method: 'POST' })
    } catch {}
  }

  useEffect(() => {
    // Auto-populate serials from document_data, then fetch
    populateSerials().then(() => {
      fetchData()
      fetchMonitor()
    })
  }, [])

  const filteredTransfers = transfers.filter(t => {
    if (filter === 'pending') return ['pending', 'in_progress'].includes(t.status)
    if (filter === 'completed') return t.status === 'completed'
    return true
  })

  const purchaseTransfers = filteredTransfers.filter(t => t.transfer_type === 'purchase')
  const saleTransfers = filteredTransfers.filter(t => t.transfer_type === 'sale')

  const formatDate = (d: string | null) => {
    if (!d) return '-'
    return new Date(d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl text-navy-900">Titulos</h1>
          <p className="text-navy-500 text-sm mt-1">
            Monitoreo de titulos TDHCA
          </p>
        </div>
      </div>

      {/* Title Monitoring */}
      {(
        <div className="space-y-6">
          {/* Title Monitor Stats */}
          {monitor && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="card-luxury p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    <Shield className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-xs text-navy-500">Monitoreados</p>
                    <p className="text-2xl font-bold text-navy-900">{monitor.total_monitored}</p>
                  </div>
                </div>
              </div>

              <div className="card-luxury p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-100 rounded-lg">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                  </div>
                  <div>
                    <p className="text-xs text-navy-500">Nombre Actualizado</p>
                    <p className="text-2xl font-bold text-emerald-700">{monitor.title_updated}</p>
                  </div>
                </div>
              </div>

              <div className="card-luxury p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-amber-100 rounded-lg">
                    <ShieldAlert className="w-5 h-5 text-amber-600" />
                  </div>
                  <div>
                    <p className="text-xs text-navy-500">Pendientes</p>
                    <p className="text-2xl font-bold text-amber-700">{monitor.title_pending}</p>
                  </div>
                </div>
              </div>

              <div className="card-luxury p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-gray-100 rounded-lg">
                    <Eye className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-xs text-navy-500">Sin Serial</p>
                    <p className="text-2xl font-bold text-navy-900">{monitor.no_serial}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ALL Transfers Table (with and without serial) */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
            </div>
          ) : transfers.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <Shield className="w-12 h-12 text-navy-300 mx-auto mb-4" />
              <h3 className="font-serif text-xl text-navy-900 mb-2">Sin titulos</h3>
              <p className="text-navy-500 text-sm">
                Los titulos aparecen cuando se compra o vende una propiedad.
              </p>
            </div>
          ) : (
            <div className="card-luxury overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy-50 text-navy-600 text-left">
                      <th className="px-4 py-3 font-medium">Tipo</th>
                      <th className="px-4 py-3 font-medium">Propiedad</th>
                      <th className="px-4 py-3 font-medium">De → A</th>
                      <th className="px-4 py-3 font-medium">Serial/Label</th>
                      <th className="px-4 py-3 font-medium">Nombre TDHCA</th>
                      <th className="px-4 py-3 font-medium">Estado Titulo</th>
                      <th className="px-4 py-3 font-medium">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-100">
                    {transfers.map((t) => (
                      <tr key={t.id} className="hover:bg-navy-50/50 transition-colors">
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                            t.transfer_type === 'purchase' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {t.transfer_type === 'purchase' ? 'Compra' : 'Venta'}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <Link href={`/homes/properties/${t.property_id}`} className="text-blue-600 hover:underline text-xs">
                            {(t as any).properties?.address || t.property_id?.slice(0, 8)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-xs">
                          <span style={{ color: 'var(--ash)' }}>{t.from_name}</span>
                          <span className="mx-1">→</span>
                          <span className="font-medium" style={{ color: 'var(--ink)' }}>{t.to_name}</span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs">
                          {(t.tdhca_serial || t.tdhca_label) ? (
                            <a
                              href={`https://mhweb.tdhca.state.tx.us/mhweb/title_view.jsp?${t.tdhca_serial ? `serialNum=${encodeURIComponent(t.tdhca_serial)}` : `labelNum=${encodeURIComponent(t.tdhca_label)}`}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 underline flex items-center gap-1"
                            >
                              {t.tdhca_serial || t.tdhca_label}
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          ) : (
                            <span className="text-amber-600 italic">Sin serial</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-xs">
                          {t.tdhca_owner_name ? (
                            <span className="font-medium">{t.tdhca_owner_name}</span>
                          ) : (
                            <span className="text-navy-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.title_name_updated ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-medium">
                              <CheckCircle2 className="w-3 h-3" />
                              Nombre actualizado
                            </span>
                          ) : (t.tdhca_serial || t.tdhca_label) ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-amber-100 text-amber-700 rounded-full text-xs font-medium">
                              <Clock className="w-3 h-3" />
                              Pendiente
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-medium">
                              Sin monitorear
                            </span>
                          )}
                          {t.last_tdhca_check && (
                            <p className="text-[10px] mt-0.5" style={{ color: 'var(--ash)' }}>
                              Último check: {formatDate(t.last_tdhca_check)} {(t.tdhca_check_count || 0) > 0 && `(${t.tdhca_check_count}x)`}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {(t.tdhca_serial || t.tdhca_label) && !t.title_name_updated && (
                            <button
                              onClick={() => handleRecheck(t.id)}
                              disabled={recheckingId === t.id}
                              className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-50"
                            >
                              {recheckingId === t.id ? (
                                <Loader2 className="w-3 h-3 animate-spin inline mr-1" />
                              ) : (
                                <RefreshCw className="w-3 h-3 inline mr-1" />
                              )}
                              Verificar
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Info Box */}
          <div className="p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="font-medium text-navy-900 mb-2 flex items-center gap-2">
              <Shield className="w-4 h-4 text-blue-500" />
              Monitoreo automatico
            </h4>
            <ul className="text-sm text-navy-600 space-y-1">
              <li>- El sistema revisa TDHCA diariamente para ver si el nombre del titulo ha cambiado</li>
              <li>- El serial/label se obtiene de la aplicacion de cambio de titulo</li>
              <li>- Cuando el nombre en TDHCA coincide con el nuevo propietario, se marca como actualizado</li>
              <li>- Puedes verificar manualmente haciendo clic en "Verificar"</li>
            </ul>
          </div>
        </div>
      )}

    </div>
  )
}
