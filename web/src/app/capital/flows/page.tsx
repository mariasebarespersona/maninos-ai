'use client'

import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, DollarSign, TrendingUp, Wallet, Plus, ArrowRightLeft } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface FlowSummary {
  total_in: number
  total_out: number
  current_balance: number
  by_type: Record<string, number>
  monthly: { month: string; income: number; expenses: number }[]
  total_flows: number
}

interface Flow {
  id: string
  flow_type: string
  amount: number
  balance_after: number
  description: string
  reference: string
  flow_date: string
  investors?: { name: string } | null
  properties?: { address: string } | null
  created_at: string
}

const FLOW_TYPE_LABELS: Record<string, { label: string; color: string; icon: 'in' | 'out' }> = {
  investment_in: { label: 'Inversión', color: 'var(--success)', icon: 'in' },
  acquisition_out: { label: 'Adquisición', color: 'var(--error)', icon: 'out' },
  rent_income: { label: 'Renta', color: 'var(--success)', icon: 'in' },
  return_out: { label: 'Retorno', color: 'var(--gold-600)', icon: 'out' },
  late_fee_income: { label: 'Late Fee', color: 'var(--warning)', icon: 'in' },
  operating_expense: { label: 'Gasto Op.', color: 'var(--error)', icon: 'out' },
}

export default function FlowsPage() {
  const toast = useToast()
  const [summary, setSummary] = useState<FlowSummary | null>(null)
  const [flows, setFlows] = useState<Flow[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [recording, setRecording] = useState(false)

  // Form state
  const [formType, setFormType] = useState('investment_in')
  const [formAmount, setFormAmount] = useState('')
  const [formDescription, setFormDescription] = useState('')

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [summaryRes, flowsRes] = await Promise.all([
        fetch('/api/capital/flows/summary'),
        fetch('/api/capital/flows'),
      ])
      const summaryData = await summaryRes.json()
      const flowsData = await flowsRes.json()
      if (summaryData.ok) setSummary(summaryData.summary)
      if (flowsData.ok) setFlows(flowsData.flows || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleRecord = async () => {
    if (!formAmount || parseFloat(formAmount) <= 0) {
      toast.error('Ingresa un monto válido')
      return
    }
    setRecording(true)
    try {
      const res = await fetch('/api/capital/flows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _action: 'record',
          flow_type: formType,
          amount: parseFloat(formAmount),
          description: formDescription,
        })
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Flujo registrado')
        setShowModal(false)
        setFormAmount('')
        setFormDescription('')
        loadData()
      } else {
        toast.error(data.detail || 'Error')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setRecording(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Flujo de Capital</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Fondear → Adquirir → Cobrar → Retornar</p>
        </div>
        <button onClick={() => setShowModal(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--navy-800)' }}>
          <Plus className="w-4 h-4" /> Registrar Flujo
        </button>
      </div>

      {/* KPIs */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[
            { label: 'Total Entradas', value: fmt(summary.total_in), icon: ArrowDownLeft, color: 'var(--success)' },
            { label: 'Total Salidas', value: fmt(summary.total_out), icon: ArrowUpRight, color: 'var(--error)' },
            { label: 'Balance Actual', value: fmt(summary.current_balance), icon: Wallet, color: 'var(--navy-800)' },
            { label: 'Total Movimientos', value: summary.total_flows.toString(), icon: ArrowRightLeft, color: 'var(--gold-600)' },
          ].map(kpi => (
            <div key={kpi.label} className="card-luxury p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${kpi.color}15` }}>
                  <kpi.icon className="w-5 h-5" style={{ color: kpi.color }} />
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--ash)' }}>{kpi.label}</p>
                  <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{kpi.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Flow History */}
      <div className="card-luxury overflow-hidden">
        <div className="p-4 border-b" style={{ borderColor: 'var(--sand)' }}>
          <h2 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>Historial de Movimientos</h2>
        </div>
        {flows.length === 0 ? (
          <div className="p-12 text-center">
            <DollarSign className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
            <p style={{ color: 'var(--slate)' }}>No hay movimientos registrados</p>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--sand)' }}>
            {flows.map(flow => {
              const typeInfo = FLOW_TYPE_LABELS[flow.flow_type] || { label: flow.flow_type, color: 'var(--slate)', icon: 'in' as const }
              const isPositive = flow.amount > 0
              return (
                <div key={flow.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center"
                      style={{ backgroundColor: `${typeInfo.color}15` }}>
                      {isPositive
                        ? <ArrowDownLeft className="w-4 h-4" style={{ color: typeInfo.color }} />
                        : <ArrowUpRight className="w-4 h-4" style={{ color: typeInfo.color }} />
                      }
                    </div>
                    <div>
                      <p className="text-sm font-medium" style={{ color: 'var(--charcoal)' }}>
                        {typeInfo.label}
                        {flow.investors?.name && <span className="ml-1 font-normal" style={{ color: 'var(--slate)' }}>— {flow.investors.name}</span>}
                      </p>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>
                        {flow.description || flow.properties?.address || flow.flow_date}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-sm" style={{ color: isPositive ? 'var(--success)' : 'var(--error)' }}>
                      {isPositive ? '+' : ''}{fmt(flow.amount)}
                    </p>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      Bal: {fmt(flow.balance_after || 0)}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg max-w-md w-full p-6 shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Registrar Flujo de Capital</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Tipo</label>
                <select value={formType} onChange={e => setFormType(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  {Object.entries(FLOW_TYPE_LABELS).map(([key, { label }]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Monto ($)</label>
                <input type="number" value={formAmount} onChange={e => setFormAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}
                  placeholder="0.00" min="0" step="0.01" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Descripción</label>
                <input type="text" value={formDescription} onChange={e => setFormDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}
                  placeholder="Descripción del movimiento" />
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-md border text-sm font-medium" style={{ borderColor: 'var(--stone)' }}>
                  Cancelar
                </button>
                <button onClick={handleRecord} disabled={recording}
                  className="flex-1 px-4 py-2 rounded-md text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--navy-800)', opacity: recording ? 0.6 : 1 }}>
                  {recording ? 'Registrando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}


