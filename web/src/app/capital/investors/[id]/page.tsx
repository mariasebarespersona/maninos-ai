'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Landmark, User, Mail, Phone, Briefcase,
  DollarSign, TrendingUp, Calendar, MapPin, FileText,
  PieChart, BarChart3, Edit2, Save, X
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Investor {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  total_invested: number
  available_capital: number
  status: string
  notes: string | null
  created_at: string
}

interface Investment {
  id: string
  amount: number
  expected_return_rate: number | null
  return_amount: number | null
  status: string
  notes: string | null
  invested_at: string
  returned_at: string | null
  properties?: { address: string; city: string } | null
  rto_contracts?: { client_id: string; clients?: { name: string } } | null
}

export default function InvestorDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const toast = useToast()
  const [investor, setInvestor] = useState<Investor | null>(null)
  const [investments, setInvestments] = useState<Investment[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editData, setEditData] = useState({ notes: '', available_capital: 0 })

  useEffect(() => { loadInvestor() }, [id])

  const loadInvestor = async () => {
    try {
      const res = await fetch(`/api/capital/investors/${id}`)
      const data = await res.json()
      if (data.ok) {
        setInvestor(data.investor)
        setInvestments(data.investments || [])
        setEditData({
          notes: data.investor.notes || '',
          available_capital: data.investor.available_capital || 0,
        })
      }
    } catch (err) {
      console.error('Error loading investor:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/capital/investors/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Inversionista actualizado')
        setEditing(false)
        loadInvestor()
      } else {
        toast.error(data.detail || 'Error al actualizar')
      }
    } catch {
      toast.error('Error al actualizar')
    }
  }

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  if (!investor) {
    return <div className="text-center py-12" style={{ color: 'var(--slate)' }}>Inversionista no encontrado</div>
  }

  // Calculate stats
  const totalInvested = investments.reduce((sum, i) => sum + Number(i.amount || 0), 0)
  const totalReturned = investments.reduce((sum, i) => sum + Number(i.return_amount || 0), 0)
  const activeInvestments = investments.filter(i => i.status === 'active')
  const completedInvestments = investments.filter(i => i.status === 'returned')
  const avgReturn = completedInvestments.length > 0
    ? completedInvestments.reduce((s, i) => s + Number(i.expected_return_rate || 0), 0) / completedInvestments.length
    : 0

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      {/* Back */}
      <button onClick={() => router.push('/capital/investors')} className="btn-ghost btn-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a Inversionistas
      </button>

      {/* Header Card */}
      <div className="card-luxury p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center"
                 style={{ backgroundColor: 'var(--gold-100)' }}>
              <Landmark className="w-8 h-8" style={{ color: 'var(--gold-700)' }} />
            </div>
            <div>
              <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>
                {investor.name}
              </h1>
              <div className="flex items-center gap-4 mt-1 text-sm" style={{ color: 'var(--slate)' }}>
                {investor.company && (
                  <span className="flex items-center gap-1">
                    <Briefcase className="w-3.5 h-3.5" /> {investor.company}
                  </span>
                )}
                {investor.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3.5 h-3.5" /> {investor.email}
                  </span>
                )}
                {investor.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3.5 h-3.5" /> {investor.phone}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="badge" style={{
              backgroundColor: investor.status === 'active' ? 'var(--success-light)' : 'var(--cream)',
              color: investor.status === 'active' ? 'var(--success)' : 'var(--slate)',
            }}>
              {investor.status === 'active' ? 'Activo' : investor.status}
            </span>
            {!editing ? (
              <button onClick={() => setEditing(true)} className="btn-ghost btn-sm">
                <Edit2 className="w-4 h-4" /> Editar
              </button>
            ) : (
              <div className="flex gap-2">
                <button onClick={handleSave} className="btn btn-sm text-white" style={{ backgroundColor: 'var(--success)' }}>
                  <Save className="w-4 h-4" /> Guardar
                </button>
                <button onClick={() => setEditing(false)} className="btn-ghost btn-sm">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Invertido', value: fmt(totalInvested), icon: DollarSign, color: 'var(--navy-800)' },
          { label: 'Capital Disponible', value: fmt(investor.available_capital), icon: Landmark, color: 'var(--gold-600)' },
          { label: 'Retornos', value: fmt(totalReturned), icon: TrendingUp, color: 'var(--success)' },
          { label: 'Inversiones Activas', value: String(activeInvestments.length), icon: PieChart, color: 'var(--info)' },
        ].map((kpi) => (
          <div key={kpi.label} className="card-luxury p-4">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              <span className="text-xs" style={{ color: 'var(--slate)' }}>{kpi.label}</span>
            </div>
            <p className="font-serif text-xl font-semibold" style={{ color: 'var(--ink)' }}>{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Notes (editable) */}
      {(editing || investor.notes) && (
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-3" style={{ color: 'var(--ink)' }}>
            <FileText className="w-4 h-4 inline mr-2" />
            Notas
          </h3>
          {editing ? (
            <div className="space-y-3">
              <textarea
                value={editData.notes}
                onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                className="input w-full"
                rows={3}
                placeholder="Notas sobre el inversionista..."
              />
              <div>
                <label className="text-sm" style={{ color: 'var(--slate)' }}>Capital Disponible</label>
                <input
                  type="number"
                  value={editData.available_capital}
                  onChange={(e) => setEditData({ ...editData, available_capital: Number(e.target.value) })}
                  className="input w-full mt-1"
                />
              </div>
            </div>
          ) : (
            <p style={{ color: 'var(--charcoal)' }}>{investor.notes || 'Sin notas'}</p>
          )}
        </div>
      )}

      {/* Investment History */}
      <div className="card-luxury">
        <div className="p-5 border-b flex items-center justify-between" style={{ borderColor: 'var(--sand)' }}>
          <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
            <BarChart3 className="w-4 h-4 inline mr-2" />
            Historial de Inversiones ({investments.length})
          </h3>
        </div>

        {investments.length === 0 ? (
          <div className="p-8 text-center" style={{ color: 'var(--ash)' }}>
            <Landmark className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p>No hay inversiones registradas</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Propiedad / Contrato</th>
                  <th>Monto</th>
                  <th>Tasa Esperada</th>
                  <th>Retorno</th>
                  <th>Estado</th>
                  <th>Notas</th>
                </tr>
              </thead>
              <tbody>
                {investments.map((inv) => {
                  const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
                    active: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Activa' },
                    returned: { bg: 'var(--gold-100)', color: 'var(--gold-700)', label: 'Retornada' },
                    defaulted: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Perdida' },
                  }
                  const s = statusStyles[inv.status] || statusStyles.active

                  return (
                    <tr key={inv.id}>
                      <td className="text-sm">
                        {new Date(inv.invested_at).toLocaleDateString('es-MX', {
                          day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td>
                        {inv.properties ? (
                          <div>
                            <span className="flex items-center gap-1 text-sm">
                              <MapPin className="w-3 h-3" style={{ color: 'var(--gold-600)' }} />
                              {inv.properties.address}
                            </span>
                            <span className="text-xs" style={{ color: 'var(--slate)' }}>{inv.properties.city}</span>
                          </div>
                        ) : inv.rto_contracts?.clients?.name ? (
                          <span className="flex items-center gap-1 text-sm">
                            <User className="w-3 h-3" />
                            {inv.rto_contracts.clients.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--ash)' }}>—</span>
                        )}
                      </td>
                      <td className="font-medium">{fmt(inv.amount)}</td>
                      <td>
                        {inv.expected_return_rate ? (
                          <span style={{ color: 'var(--gold-700)' }}>{inv.expected_return_rate}%</span>
                        ) : (
                          <span style={{ color: 'var(--ash)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {inv.return_amount ? (
                          <span style={{ color: 'var(--success)' }}>{fmt(inv.return_amount)}</span>
                        ) : (
                          <span style={{ color: 'var(--ash)' }}>Pendiente</span>
                        )}
                      </td>
                      <td>
                        <span className="badge text-xs" style={{ backgroundColor: s.bg, color: s.color }}>
                          {s.label}
                        </span>
                      </td>
                      <td className="text-xs max-w-[150px] truncate" style={{ color: 'var(--slate)' }}>
                        {inv.notes || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Summary Card */}
      {completedInvestments.length > 0 && (
        <div className="card-luxury p-6">
          <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Resumen de Rendimiento</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>Inversiones Completadas</span>
              <p className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{completedInvestments.length}</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>Retorno Promedio</span>
              <p className="font-serif text-lg" style={{ color: 'var(--gold-700)' }}>{avgReturn.toFixed(1)}%</p>
            </div>
            <div>
              <span className="text-xs" style={{ color: 'var(--slate)' }}>Ganancia Neta</span>
              <p className="font-serif text-lg" style={{ color: 'var(--success)' }}>
                {fmt(totalReturned - totalInvested > 0 ? totalReturned - totalInvested : 0)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Metadata */}
      <div className="text-xs text-center py-2" style={{ color: 'var(--ash)' }}>
        Inversionista registrado el {new Date(investor.created_at).toLocaleDateString('es-MX', {
          day: 'numeric', month: 'long', year: 'numeric'
        })}
      </div>
    </div>
  )
}

